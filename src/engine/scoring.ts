import { cardPoints } from "./cards";
import type { Card } from "./types";

export function handPoints(hand: Card[]): number {
  return hand.reduce((sum, c) => sum + cardPoints(c), 0);
}
