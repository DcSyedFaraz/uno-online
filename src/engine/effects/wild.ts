import { advanceTurn } from "../state";
import type { Effect } from "./types";

export const wildEffect: Effect = (ctx) => {
  advanceTurn(ctx, 1);
};

/** Wild Color Roulette: the next player names a color, then flips cards until it shows up. */
export const rouletteEffect: Effect = (ctx) => {
  advanceTurn(ctx, 1, { kind: "choose_color", purpose: "roulette" });
};
