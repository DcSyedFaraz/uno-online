import { RuleError } from "./errors";
import { checkMercy } from "./round";
import { currentPlayer, drawCards, findPlayer } from "./state";
import { sameTeam } from "./teams";
import type { Ctx, GameState, PlayerState } from "./types";

/**
 * Online-friendly shout window. Once someone goes down to one card without shouting:
 * - for the first UNO_CATCH_GRACE_MS nobody can catch them (time to hit the button),
 * - then anyone can catch them until UNO_WINDOW_MS has passed.
 * The window doesn't close just because the next player moved (bots move in ~1s, which
 * would make catching impossible); it closes when they shout, draw, or time runs out.
 */
export const UNO_CATCH_GRACE_MS = 1200;
export const UNO_WINDOW_MS = 6500;

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

/** Drops a shout window that has run out of time. */
export function expireUnoWindow(state: GameState, now: number) {
  if (state.unoWindow && now - state.unoWindow.openedAt >= UNO_WINDOW_MS) state.unoWindow = null;
}

export function catchableTarget(ctx: Pick<Ctx, "state" | "now">, by: PlayerState): PlayerState | null {
  const w = ctx.state.unoWindow;
  if (!w || w.playerId === by.id) return null;
  const age = ctx.now - w.openedAt;
  if (age < UNO_CATCH_GRACE_MS || age >= UNO_WINDOW_MS) return null;
  const target = findPlayer(ctx.state, w.playerId);
  if (!target || target.status !== "active" || target.hand.length !== 1 || target.saidUno) return null;
  // no catching your own partner
  if (sameTeam(ctx.state, target, by)) return null;
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
