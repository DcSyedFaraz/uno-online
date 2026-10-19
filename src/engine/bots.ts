import { drawValue, isWild } from "./cards";
import { needsColor, needsSwapTarget, playBlocker } from "./legal";
import { pick } from "./rng";
import { activePlayers, currentPlayer, findPlayer, nextActivePlayer } from "./state";
import { sameTeam } from "./teams";
import { catchableTarget, canCallUno } from "./uno";
import { COLORS, type Action, type Card, type Color, type GameState, type PlayerState } from "./types";

export const BOT_NAMES = [
  "Nova", "Pixel", "Echo", "Blitz", "Orbit", "Volt", "Comet", "Zara", "Juno", "Rook",
  "Vega", "Neon", "Quark", "Ember", "Sable", "Flux", "Iris", "Kilo",
];
/** A robot avatar id (`b:<seed>`, drawn as a DiceBear "Bottts" robot by the client). */
export function botAvatar(rng: () => number): string {
  return `b:${Math.floor(rng() * 36 ** 6).toString(36)}`;
}

/** Most-held color among non-wild cards (random when there are none). */
export function botColor(hand: Card[], rng: () => number): Color {
  const counts = new Map<Color, number>();
  for (const c of hand) if (c.color) counts.set(c.color, (counts.get(c.color) ?? 0) + 1);
  let best: Color[] = [];
  let max = 0;
  for (const color of COLORS) {
    const n = counts.get(color) ?? 0;
    if (n > max) {
      max = n;
      best = [color];
    } else if (n === max && n > 0) best.push(color);
  }
  return best.length ? pick(best, rng) : pick(COLORS, rng);
}

/** Swap with whoever has the fewest cards (an opponent, in team play). */
export function botSwapTarget(state: GameState, player: PlayerState): string {
  const others = activePlayers(state).filter((p) => p.id !== player.id);
  const rivals = others.filter((p) => !sameTeam(state, p, player));
  const pool = rivals.length ? rivals : others;
  pool.sort((a, b) => a.hand.length - b.hand.length);
  return pool[0].id;
}

/** Fills in the color / swap target a play needs. */
export function completePlay(
  state: GameState,
  player: PlayerState,
  card: Card,
  rng: () => number,
  type: "play" | "jump_in" = "play",
): Action {
  const remaining = player.hand.filter((c) => c.id !== card.id);
  return {
    type,
    cardId: card.id,
    color: needsColor(card) ? botColor(remaining, rng) : undefined,
    swapTargetId: needsSwapTarget(state, player, card) ? botSwapTarget(state, player) : undefined,
  };
}

function scoreCard(state: GameState, player: PlayerState, card: Card, favorite: Color): number {
  const next = nextActivePlayer(state);
  const friend = sameTeam(state, next, player);
  const threat = !friend && next.hand.length <= 2;
  let score: number;
  switch (card.kind) {
    case "number":
      score = 10 + (card.value ?? 0) * 0.5;
      break;
    case "wild":
      score = 2;
      break;
    case "wild4":
      score = 1;
      break;
    case "wild6":
    case "wild10":
    case "wild_reverse4":
      score = 3;
      break;
    case "wild_roulette":
      score = 6;
      break;
    case "skip_all":
      score = 8;
      break;
    case "discard_all":
      score = 6 + 4 * player.hand.filter((c) => c.id !== card.id && c.color === card.color).length;
      break;
    default:
      score = 14;
  }
  const hits = drawValue(card) > 0 || card.kind === "skip" || card.kind === "reverse" || card.kind === "skip_all";
  if (threat && hits) score += 20;
  // go easy on your partner
  if (friend && hits && card.kind !== "reverse") score -= 15;
  if (card.color === favorite) score += 3;
  if (card.kind === "number" && card.value === 7 && state.settings.sevenSwap) {
    const fewest = Math.min(...activePlayers(state).filter((p) => p.id !== player.id).map((p) => p.hand.length));
    score += fewest < player.hand.length - 1 ? 12 : -8;
  }
  return score;
}

function shoutFirst(state: GameState, player: PlayerState, rng: () => number, acts: Action[]) {
  if (player.hand.length === 2 && canCallUno({ state }, player) && rng() < 0.85) acts.push({ type: "call_uno" });
}

/**
 * Decides what a bot (or an AFK player on autopilot) does now.
 * Returns the actions to apply in order; may be empty if it isn't their move.
 */
export function decideBot(state: GameState, playerId: string, now: number, rng: () => number): Action[] {
  const p = findPlayer(state, playerId);
  const acts: Action[] = [];
  if (!p || p.status !== "active" || state.phase !== "playing") return acts;

  const target = catchableTarget({ state, now }, p);
  if (target && rng() < 0.6) acts.push({ type: "catch_uno", targetId: target.id });

  if (currentPlayer(state)?.id !== p.id) return acts;
  const turn = state.turn;
  const playable = p.hand.filter((c) => playBlocker(state, p, c) === null);

  switch (turn.kind) {
    case "choose_color":
      acts.push({ type: "choose_color", color: botColor(p.hand, rng) });
      break;
    case "stack": {
      if (playable.length > 0) {
        // pass the smallest valid card along, keep the big ones
        playable.sort((a, b) => drawValue(a) - drawValue(b));
        shoutFirst(state, p, rng, acts);
        acts.push(completePlay(state, p, playable[0], rng));
      } else if (turn.challenge && rng() < 0.3) {
        acts.push({ type: "challenge" });
      } else {
        acts.push({ type: "take_penalty" });
      }
      break;
    }
    case "drawn": {
      const card = p.hand.find((c) => c.id === turn.cardId);
      if (card && playable.includes(card) && (state.settings.forcePlayDrawn || rng() < 0.9)) {
        shoutFirst(state, p, rng, acts);
        acts.push(completePlay(state, p, card, rng));
      } else {
        acts.push({ type: "pass" });
      }
      break;
    }
    case "play": {
      if (playable.length === 0) {
        acts.push({ type: "draw" });
        break;
      }
      const favorite = botColor(p.hand.filter((c) => !isWild(c)), rng);
      let best = playable[0];
      let bestScore = -Infinity;
      // now and then play on a hunch, like people do (also breaks repetitive loops)
      if (rng() < 0.15) best = pick(playable, rng);
      else for (const c of playable) {
        const s = scoreCard(state, p, c, favorite) + rng() * 2;
        if (s > bestScore) {
          bestScore = s;
          best = c;
        }
      }
      shoutFirst(state, p, rng, acts);
      acts.push(completePlay(state, p, best, rng));
      break;
    }
  }
  return acts;
}
