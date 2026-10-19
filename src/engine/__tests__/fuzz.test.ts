import { describe, expect, it } from "vitest";
import { canStack } from "../legal";
import { applyAction, engineDebug } from "../reducer";
import { CLASSIC_SETTINGS, mergeSettings, type RuleSettings } from "../rules";
import { mulberry32, pick } from "../rng";
import { countCards, createGame, dueAt, newPlayer } from "../state";
import { teamKey } from "../teams";
import { privateView } from "../view";
import type { GameState } from "../types";

const SWITCHES: ((s: RuleSettings, r: () => number) => void)[] = [
  (s, r) => (s.stacking = pick(["same", "mixed", "higher"] as const, r)),
  (s) => (s.sevenSwap = true),
  (s) => (s.zeroRotate = true),
  (s) => (s.jumpIn = true),
  (s) => (s.drawUntilPlayable = true),
  (s) => (s.forcePlayDrawn = true),
  (s, r) => (s.wild4Mode = pick(["free", "restricted"] as const, r)),
  (s) => (s.cards.wildReverse4 = true),
  (s) => (s.cards.discardAll = true),
  (s) => (s.cards.skipAll = true),
  (s) => (s.cards.draw4Color = true),
  (s) => (s.cards.wild6 = true),
  (s) => (s.cards.wild10 = true),
  (s) => (s.cards.roulette = true),
  (s) => (s.mercyRule = true),
  (s, r) => (s.unoPenalty = 1 + Math.floor(r() * 4)),
];

function randomSettings(r: () => number, mode: number): RuleSettings {
  const s = structuredClone(CLASSIC_SETTINGS);
  s.handSize = 5 + Math.floor(r() * 6);
  if (r() < 0.3) {
    s.winMode = "points";
    s.targetPoints = 150;
  }
  if (r() < 0.3) s.roundTimerMin = pick([3, 5, 7] as const, r);
  if (r() < 0.25) s.teamPlay = true;
  if (mode === 1) pick(SWITCHES, r)(s, r);
  if (mode === 2) for (const sw of SWITCHES) if (r() < 0.5) sw(s, r);
  return mergeSettings(CLASSIC_SETTINGS, s);
}

function checkInvariants(s: GameState) {
  expect(countCards(s)).toBe(s.totalCards);
  const ids = [...s.drawPile, ...s.discardPile, ...s.players.flatMap((p) => p.hand)].map((c) => c.id);
  expect(new Set(ids).size).toBe(ids.length);
  if (s.phase === "playing") {
    expect(s.players[s.turnIndex].status).toBe("active");
    expect(s.players.filter((p) => p.status === "active").length).toBeGreaterThanOrEqual(2);
    expect(s.drawStack).toBeGreaterThanOrEqual(0);
    expect(s.discardPile.length).toBeGreaterThan(0);
    expect(s.deadline).not.toBeNull();
    expect(dueAt(s)).not.toBeNull();
    // the round is only on while at least two teams (or players) are still in it
    expect(new Set(s.players.filter((p) => p.status === "active").map((p) => teamKey(s, p))).size).toBeGreaterThanOrEqual(2);
    // nobody is ever left facing a stack they can't answer: that one is drawn automatically
    if (s.turn.kind === "stack") {
      const p = s.players[s.turnIndex];
      expect(!!s.turn.challenge || p.hand.some((c) => canStack(s.settings, c, s.stackTopValue))).toBe(true);
    }
  }
  for (const p of s.players) if (p.status !== "active") expect(p.hand).toHaveLength(0);
}

function simulate(seed: number) {
  const r = mulberry32(seed);
  const mode = seed % 3;
  let n = 2 + Math.floor(r() * 9);
  const settings = randomSettings(r, mode);
  // team play needs pairs: 4, 6, 8 or 10 players (bots are paired at start)
  if (settings.teamPlay) n = Math.max(4, n - (n % 2));
  let state = createGame({ id: "p0", name: "P0", avatar: "🤖" }, settings);
  for (let i = 1; i < n; i++) state.players.push(newPlayer({ id: `p${i}`, name: `P${i}`, avatar: "🤖" }, true));
  state.players[0].isBot = true;
  let now = 1_000;
  state = applyAction(state, { type: "start" }, "p0", now, r).state;
  checkInvariants(state);

  let steps = 0;
  while (state.phase !== "game_over") {
    // huge-hand games (no mercy rule, everything stacking) can legitimately run very long
    if (steps++ > MAX_STEPS) return { n, steps, finished: false };
    if (state.phase === "round_over") {
      state = applyAction(state, { type: "next_round" }, state.hostId, now, r).state;
      checkInvariants(state);
      continue;
    }
    // occasionally someone throws in a jump-in or tries to catch a missed shout
    const other = pick(state.players, r);
    const view = privateView(state, other.id);
    if (view.jumpIn.length > 0 && r() < 0.5) {
      const c = other.hand.find((h) => h.id === view.jumpIn[0])!;
      const target = state.players.find((p) => p.id !== other.id && p.status === "active");
      state = applyAction(
        state,
        { type: "jump_in", cardId: c.id, swapTargetId: view.needsSwapTarget.includes(c.id) ? target?.id : undefined },
        other.id,
        now,
        r,
      ).state;
      checkInvariants(state);
      continue;
    }
    now = Math.max(now + 1, dueAt(state) ?? now);
    state = applyAction(state, { type: "timeout" }, "system", now, r).state;
    checkInvariants(state);
  }
  return { n, steps, finished: true };
}

const MAX_STEPS = 15_000;
const GAMES = Number(process.env.FUZZ_GAMES ?? 500);

describe("fuzz: bot-only games under random rule mixes", () => {
  it("every game keeps the cards consistent and finishes", () => {
    engineDebug.strictBots = true;
    const unfinished: number[] = [];
    for (let seed = 1; seed <= GAMES; seed++) if (!simulate(seed).finished) unfinished.push(seed);
    engineDebug.strictBots = false;
    expect(unfinished.length, `unfinished seeds: ${unfinished.join(", ")}`).toBeLessThanOrEqual(GAMES * 0.01);
  }, 240_000);
});
