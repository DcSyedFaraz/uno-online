import { advanceTurn } from "../state";
import type { Card, Ctx, PlayerState } from "../types";
import type { Effect } from "./types";

/**
 * Discard All: also throw away every other card of the same color.
 * Runs before the win check (the hand may empty), so it is split from the turn move.
 */
export function discardMatching(ctx: Ctx, player: PlayerState, card: Card) {
  const { state } = ctx;
  const extra = player.hand.filter((c) => c.color === card.color);
  if (extra.length === 0) return;
  player.hand = player.hand.filter((c) => c.color !== card.color);
  // keep the Discard All card on top so its color stays in play
  const top = state.discardPile.pop()!;
  state.discardPile.push(...extra, top);
  ctx.events.push({ t: "discard_all", pid: player.id, cards: extra });
}

export const discardAllEffect: Effect = (ctx) => {
  advanceTurn(ctx, 1);
};
