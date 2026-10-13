import type { Card, Color, Ctx, PlayerState } from "../types";

export interface PlayOptions {
  color?: Color;
  swapTargetId?: string;
  /** Wild +4 challenge bookkeeping: did the player hold a card of the previous color? */
  hadMatch: boolean;
}

/**
 * A card effect runs after the card is on the discard pile (and the player hasn't won).
 * It is responsible for moving the turn on.
 */
export type Effect = (ctx: Ctx, player: PlayerState, card: Card, opts: PlayOptions) => void;
