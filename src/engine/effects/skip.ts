import { activePlayers, advanceTurn, nextActivePlayer, playerIndex, setTurn } from "../state";
import type { Effect } from "./types";

export const skipEffect: Effect = (ctx) => {
  ctx.events.push({ t: "skip", pids: [nextActivePlayer(ctx.state).id] });
  advanceTurn(ctx, 2);
};

/** Skip Everyone: every other player is skipped and the same player goes again. */
export const skipAllEffect: Effect = (ctx, player) => {
  const others = activePlayers(ctx.state).filter((p) => p.id !== player.id);
  ctx.events.push({ t: "skip", pids: others.map((p) => p.id) });
  setTurn(ctx, playerIndex(ctx.state, player.id));
};
