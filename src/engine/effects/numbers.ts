import { RuleError } from "../errors";
import { checkMercy } from "../round";
import { activePlayers, advanceTurn, findPlayer } from "../state";
import type { PlayerState } from "../types";
import type { Effect } from "./types";

/** Number cards. Optional rules: 7 swaps hands with a chosen player, 0 passes every hand along. */
export const numberEffect: Effect = (ctx, player, card, opts) => {
  const { state } = ctx;
  if (card.value === 7 && state.settings.sevenSwap) {
    const target = opts.swapTargetId ? findPlayer(state, opts.swapTargetId) : undefined;
    if (!target || target.id === player.id || target.status !== "active") {
      throw new RuleError("Pick another player to swap hands with");
    }
    [player.hand, target.hand] = [target.hand, player.hand];
    resetShout(ctx, [player, target]);
    ctx.events.push({ t: "swap", a: player.id, b: target.id });
    checkMercy(ctx, player);
    checkMercy(ctx, target);
  } else if (card.value === 0 && state.settings.zeroRotate) {
    const active = activePlayers(state);
    const hands = active.map((p) => p.hand);
    const k = active.length;
    active.forEach((p, i) => {
      // each hand moves one seat along the direction of play
      const from = (((i - state.direction) % k) + k) % k;
      p.hand = hands[from];
    });
    resetShout(ctx, active);
    ctx.events.push({ t: "rotate", direction: state.direction });
    for (const p of active) checkMercy(ctx, p);
  }
  advanceTurn(ctx, 1);
};

/** Players who receive a 1-card hand from a swap/rotation are treated as having shouted. */
function resetShout(ctx: Parameters<Effect>[0], players: PlayerState[]) {
  for (const p of players) p.saidUno = p.hand.length === 1;
  if (ctx.state.unoWindow && players.some((p) => p.id === ctx.state.unoWindow!.playerId)) ctx.state.unoWindow = null;
}
