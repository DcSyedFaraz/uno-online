import { describe, expect, it } from "vitest";
import { applyAction } from "../reducer";
import { mulberry32 } from "../rng";
import { CLASSIC_SETTINGS } from "../rules";
import { countCards, createGame, dueAt, FINAL_STRETCH_MS, newPlayer } from "../state";
import { publicView } from "../view";
import { arrange, card, Game, num, startedGame, type Setup } from "./helpers";
import type { Card } from "../types";

const FAR = Number.MAX_SAFE_INTEGER;

/** A game whose round clock runs out `endsIn` ms after the Game helper's clock. */
function timed(hands: Record<string, Card[]>, opts: { endsIn?: number; turn?: string; direction?: 1 | -1; settings?: Setup["settings"] } = {}) {
  const s = arrange(startedGame({ players: 3, settings: { roundTimerMin: 3, ...opts.settings } }), {
    turn: opts.turn ?? "p0",
    top: num("red", 5),
    hands,
    direction: opts.direction,
  });
  const g = new Game(s);
  g.state.roundEndsAt = g.now + (opts.endsIn ?? 1000);
  g.state.deadline = FAR;
  return g;
}

describe("round clock", () => {
  it("starts with the round when a time limit is set", () => {
    const lobby = (roundTimerMin: 0 | 5) => {
      const s = createGame({ id: "p0", name: "P0", avatar: "🙂" }, { ...CLASSIC_SETTINGS, roundTimerMin });
      s.players.push(newPlayer({ id: "p1", name: "P1", avatar: "🙂" }));
      return s;
    };
    expect(lobby(5).roundEndsAt).toBeNull();
    const on = applyAction(lobby(5), { type: "start" }, "p0", 50_000, mulberry32(1)).state;
    expect(on.roundEndsAt).toBe(50_000 + 5 * 60_000);
    expect(publicView(on).roundEndsAt).toBe(on.roundEndsAt);
    const off = applyAction(lobby(0), { type: "start" }, "p0", 50_000, mulberry32(1)).state;
    expect(off.roundEndsAt).toBeNull();
  });

  it("isn't up before time", () => {
    const g = timed({ p0: [num("blue", 1)] }, { endsIn: 10_000 });
    expect(() => g.act("system", { type: "timeout" }, 5_000)).toThrow(/Not yet/);
  });

  it("at time-up the fewest card points wins, not the fewest cards", () => {
    const g = timed({
      p0: [card("wild")], // 50
      p1: [num("blue", 9), num("red", 1)], // 10
      p2: [card("skip", "green")], // 20
    });
    g.act("system", { type: "timeout" }, 1000);
    expect(g.state.phase).toBe("game_over");
    expect(g.state.gameWinnerId).toBe("p1");
    expect(g.state.lastRound).toMatchObject({ winnerId: "p1", timeUp: true, points: 70 });
    expect(g.state.roundEndsAt).toBeNull();
    expect(g.state.deadline).toBeNull();
    expect(g.events[0]).toEqual({ t: "time_up" });
    expect(g.events).toContainEqual(expect.objectContaining({ t: "round_over", winnerId: "p1", timeUp: true }));
  });

  it("ties go to fewer cards, then to whoever plays soonest", () => {
    const fewer = timed({ p0: [card("wild")], p1: [num("blue", 5), num("red", 5)], p2: [num("green", 1), num("green", 4), num("green", 5)] });
    fewer.act("system", { type: "timeout" }, 1000);
    expect(fewer.state.lastRound?.winnerId).toBe("p1");

    const hands = () => ({ p0: [card("wild")], p1: [num("blue", 5)], p2: [num("green", 5)] });
    const clockwise = timed(hands());
    clockwise.act("system", { type: "timeout" }, 1000);
    expect(clockwise.state.lastRound?.winnerId).toBe("p1");

    const reversed = timed(hands(), { direction: -1 });
    reversed.act("system", { type: "timeout" }, 1000);
    expect(reversed.state.lastRound?.winnerId).toBe("p2");
  });

  it("players knocked out of the round can't win on time", () => {
    const g = timed({ p0: [num("red", 9)], p1: [num("blue", 8)], p2: [] });
    g.state.players[2].status = "out";
    g.act("system", { type: "timeout" }, 1000);
    expect(g.state.lastRound?.winnerId).toBe("p1");
  });

  it("points mode: the time-up winner scores everyone else's cards and the next round gets a fresh clock", () => {
    const g = timed({ p0: [card("wild")], p1: [num("blue", 2)], p2: [card("skip", "green")] }, { settings: { winMode: "points", targetPoints: 500 } });
    g.act("system", { type: "timeout" }, 1000);
    expect(g.state.phase).toBe("round_over");
    expect(g.player("p1").score).toBe(70);
    g.act("p0", { type: "next_round" });
    expect(g.state.phase).toBe("playing");
    expect(g.state.roundEndsAt).toBe(g.now + 3 * 60_000);
  });

  it("a move made after time-up ends the round instead", () => {
    const one = num("red", 1);
    const g = timed({ p0: [one, num("red", 2)], p1: [num("blue", 9)], p2: [num("green", 9)] });
    const total = countCards(g.state);
    g.act("p0", { type: "play", cardId: one.id }, 1500);
    expect(g.state.phase).toBe("game_over");
    expect(g.hand("p0")).toHaveLength(2);
    expect(g.state.lastRound?.winnerId).toBe("p0");
    expect(g.events.some((e) => e.t === "play")).toBe(false);
    expect(countCards(g.state)).toBe(total);
  });

  it("the final stretch halves the turn timer", () => {
    const a = num("red", 1);
    const normal = timed({ p0: [a, num("red", 2)] }, { endsIn: FINAL_STRETCH_MS + 30_000 });
    normal.act("p0", { type: "play", cardId: a.id });
    expect(normal.state.deadline! - normal.now).toBe(30_000);

    const b = num("red", 1);
    const fast = timed({ p0: [b, num("red", 2)] }, { endsIn: FINAL_STRETCH_MS - 1 });
    fast.act("p0", { type: "play", cardId: b.id });
    expect(fast.state.deadline! - fast.now).toBe(15_000);
  });

  it("the final stretch makes bots move twice as fast", () => {
    for (let i = 0; i < 20; i++) {
      const a = num("red", 1);
      const g = timed({ p0: [a, num("red", 2)] }, { endsIn: FINAL_STRETCH_MS - 1 });
      g.rng = mulberry32(i);
      g.state.players[1].isBot = true;
      g.act("p0", { type: "play", cardId: a.id });
      const wait = g.state.deadline! - g.now;
      expect(wait).toBeGreaterThanOrEqual(450);
      expect(wait).toBeLessThan(900);
    }
  });

  it("the next tick is due at whichever comes first", () => {
    expect(dueAt({ deadline: 5, roundEndsAt: 3 })).toBe(3);
    expect(dueAt({ deadline: 2, roundEndsAt: 3 })).toBe(2);
    expect(dueAt({ deadline: null, roundEndsAt: 3 })).toBe(3);
    expect(dueAt({ deadline: 4, roundEndsAt: null })).toBe(4);
    expect(dueAt({ deadline: null, roundEndsAt: undefined })).toBeNull();
  });
});
