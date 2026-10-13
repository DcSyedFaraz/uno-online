import { RuleError } from "./errors";
import { checkMercy } from "./round";
import { currentPlayer, drawCards, findPlayer } from "./state";
import type { Ctx, PlayerState } from "./types";

/** Catches are refused for this long after the card lands, so slower connections get a fair chance to shout. */
export const UNO_CATCH_GRACE_MS = 1500;

export function canCallUno(ctx: Pick<Ctx, "state">, player: PlayerState): boolean {
  const { state } = ctx;
  if (state.phase !== "playing" || player.status !== "active" || player.saidUno) return false;
  if (player.hand.length === 1) return true;
  // early call while holding 2 cards on your own turn
  return player.hand.length === 2 && currentPlayer(state)?.id === player.id;
}

export function callUno(ctx: Ctx, player: PlayerState) {
  if (!canCallUno(ctx, player)) throw new RuleError("You can only shout when you're down to your last card");
  player.saidUno = true;
  if (ctx.state.unoWindow?.playerId === player.id) ctx.state.unoWindow = null;
  ctx.events.push({ t: "uno_call", pid: player.id });
}

export function catchableTarget(ctx: Pick<Ctx, "state" | "now">, by: PlayerState): PlayerState | null {
  const w = ctx.state.unoWindow;
  if (!w || w.playerId === by.id) return null;
  if (ctx.now - w.openedAt < UNO_CATCH_GRACE_MS) return null;
  const target = findPlayer(ctx.state, w.playerId);
  if (!target || target.status !== "active" || target.hand.length !== 1 || target.saidUno) return null;
  return target;
}

export function catchUno(ctx: Ctx, by: PlayerState, targetId: string) {
  const w = ctx.state.unoWindow;
  if (!w || w.playerId !== targetId) throw new RuleError("Too late — there's no one to catch");
  if (ctx.now - w.openedAt < UNO_CATCH_GRACE_MS) throw new RuleError("Give them a second to shout!");
  const target = catchableTarget(ctx, by);
  if (!target || target.id !== targetId) throw new RuleError("Too late — there's no one to catch");
  ctx.state.unoWindow = null;
  drawCards(ctx, target, ctx.state.settings.unoPenalty, "uno");
  ctx.events.push({ t: "uno_caught", pid: target.id, by: by.id });
  checkMercy(ctx, target);
}
