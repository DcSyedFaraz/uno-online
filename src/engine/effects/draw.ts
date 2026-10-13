import { drawValue } from "../cards";
import { checkMercy } from "../round";
import { advanceTurn, drawCards, nextActiveIndex } from "../state";
import type { Effect } from "./types";

/**
 * Every draw card: +2, colored +4, Wild +4, Wild Reverse +4, Wild +6, Wild +10.
 * With stacking on (or a challengeable Wild +4) the penalty becomes a pending stack the
 * next player must answer; otherwise the next player draws right away and is skipped.
 */
export const drawEffect: Effect = (ctx, player, card, opts) => {
  const { state } = ctx;
  if (card.kind === "wild_reverse4") {
    state.direction = state.direction === 1 ? -1 : 1;
    ctx.events.push({ t: "reverse", direction: state.direction });
  }
  const value = drawValue(card);
  const challengeable = card.kind === "wild4" && state.settings.wild4Mode === "challenge";

  if (state.settings.stacking !== "off" || challengeable || state.drawStack > 0) {
    const fresh = state.drawStack === 0;
    state.drawStack += value;
    state.stackTopValue = value;
    ctx.events.push({ t: "stack", total: state.drawStack });
    advanceTurn(ctx, 1, {
      kind: "stack",
      challenge: challengeable && fresh ? { offenderId: player.id, offenderHadMatch: opts.hadMatch } : null,
    });
    return;
  }

  const victimIdx = nextActiveIndex(state, state.turnIndex, 1);
  const victim = state.players[victimIdx];
  drawCards(ctx, victim, value, "penalty");
  ctx.events.push({ t: "skip", pids: [victim.id] });
  checkMercy(ctx, victim);
  state.turnIndex = victimIdx;
  advanceTurn(ctx, 1);
};
