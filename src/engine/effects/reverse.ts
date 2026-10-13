import { activePlayers, advanceTurn, nextActivePlayer } from "../state";
import type { Effect } from "./types";

/** Reverse flips the direction; with only 2 players it acts like a Skip. */
export const reverseEffect: Effect = (ctx) => {
  const { state } = ctx;
  state.direction = state.direction === 1 ? -1 : 1;
  ctx.events.push({ t: "reverse", direction: state.direction });
  if (activePlayers(state).length === 2) {
    ctx.events.push({ t: "skip", pids: [nextActivePlayer(state).id] });
    advanceTurn(ctx, 2);
  } else {
    advanceTurn(ctx, 1);
  }
};
