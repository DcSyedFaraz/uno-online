import { drawValue, identical, isWild, matches } from "./cards";
import type { RuleSettings } from "./rules";
import { activePlayers, currentPlayer, topCard } from "./state";
import type { Card, GameState, PlayerState } from "./types";

/** Can `card` be stacked on a pending draw penalty under the current stacking rule? */
export function canStack(settings: RuleSettings, card: Card, stackTopValue: number): boolean {
  const dv = drawValue(card);
  if (dv === 0) return false;
  switch (settings.stacking) {
    case "off":
      return false;
    case "same":
      return dv === stackTopValue;
    case "mixed":
      return true;
    case "higher":
      return dv >= stackTopValue;
  }
}

/** Basic matching plus the optional "Wild +4 only without a card of the current color" rule. */
export function matchesForPlayer(state: GameState, player: PlayerState, card: Card): boolean {
  const top = topCard(state);
  if (!top) return true;
  if (!matches(card, top, state.currentColor)) return false;
  if (card.kind === "wild4" && state.settings.wild4Mode === "restricted") {
    return !player.hand.some((c) => c.id !== card.id && c.color !== null && c.color === state.currentColor);
  }
  return true;
}

/** Why the current player can't play `card` right now, or null if they can. */
export function playBlocker(state: GameState, player: PlayerState, card: Card): string | null {
  if (state.phase !== "playing") return "The round isn't in progress";
  if (currentPlayer(state)?.id !== player.id) return "It's not your turn";
  const turn = state.turn;
  switch (turn.kind) {
    case "choose_color":
      return "Choose a color first";
    case "stack":
      return canStack(state.settings, card, state.stackTopValue)
        ? null
        : state.settings.stacking === "off"
          ? "Take the penalty or challenge it"
          : `Stack a draw card (${stackHint(state.settings, state.stackTopValue)}) or take +${state.drawStack}`;
    case "drawn":
      if (card.id !== turn.cardId) return "You can only play the card you just drew";
      return matchesForPlayer(state, player, card) ? null : "That card doesn't match";
    case "play":
      if (matchesForPlayer(state, player, card)) return null;
      if (card.kind === "wild4" && state.settings.wild4Mode === "restricted") {
        return "Wild +4 is only allowed when you have no card of the current color";
      }
      return "That card doesn't match the color or symbol";
  }
}

function stackHint(settings: RuleSettings, top: number): string {
  if (settings.stacking === "same") return `+${top}`;
  if (settings.stacking === "higher") return `+${top} or higher`;
  return "any draw card";
}

/** Why `player` can't jump in with `card`, or null if they can. */
export function jumpInBlocker(state: GameState, player: PlayerState, card: Card): string | null {
  if (!state.settings.jumpIn) return "Jump-in is off in this room";
  if (state.phase !== "playing") return "The round isn't in progress";
  if (player.status !== "active") return "You're out of this round";
  if (currentPlayer(state)?.id === player.id) return "It's your turn — just play the card";
  if (state.turn.kind !== "play" && state.turn.kind !== "drawn") return "You can't jump in right now";
  if (state.drawStack > 0) return "You can't jump in on a pending penalty";
  const top = topCard(state);
  if (!top || !identical(card, top)) return "Jump-in needs the exact same card (color and symbol)";
  return null;
}

/** Whether a play of `card` needs a color choice from the player. */
export function needsColor(card: Card): boolean {
  return isWild(card) && card.kind !== "wild_roulette";
}

/** Whether a play of `card` needs a swap target (7 with the swap rule, not the last card). */
export function needsSwapTarget(state: GameState, player: PlayerState, card: Card): boolean {
  return state.settings.sevenSwap && card.kind === "number" && card.value === 7 && player.hand.length > 1 && activePlayers(state).length > 1;
}

export function playableCardIds(state: GameState, player: PlayerState): string[] {
  if (state.phase !== "playing" || currentPlayer(state)?.id !== player.id) return [];
  return player.hand.filter((c) => playBlocker(state, player, c) === null).map((c) => c.id);
}

export function jumpInCardIds(state: GameState, player: PlayerState): string[] {
  if (!state.settings.jumpIn) return [];
  return player.hand.filter((c) => jumpInBlocker(state, player, c) === null).map((c) => c.id);
}
