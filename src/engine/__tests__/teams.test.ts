import { describe, expect, it } from "vitest";
import { applyAction } from "../reducer";
import { CLASSIC_SETTINGS, mergeSettings } from "../rules";
import { mulberry32 } from "../rng";
import { countCards, createGame, newPlayer } from "../state";
import { privateView } from "../view";
import type { Action, GameState } from "../types";
import { arrange, card, Game, num } from "./helpers";

/** A team-play lobby with humans h, a, b, c (h hosts). */
function lobby(extra: string[] = []) {
  const s = createGame({ id: "h", name: "H", avatar: "🙂" }, mergeSettings(CLASSIC_SETTINGS, { teamPlay: true }));
  for (const id of ["a", "b", "c", ...extra]) s.players.push(newPlayer({ id, name: id.toUpperCase(), avatar: "🙂" }));
  return s;
}
const act = (s: GameState, a: Action, who: string, seed = 3) => applyAction(s, a, who, 1000, mulberry32(seed)).state;
const partner = (s: GameState, id: string) => s.players.find((p) => p.id === id)!.partnerId;

describe("team invites", () => {
  it("invite, then accept: the pair is made and every other invite involving them is dropped", () => {
    let s = lobby();
    s = act(s, { type: "team_invite", playerId: "a" }, "h");
    s = act(s, { type: "team_invite", playerId: "a" }, "b");
    s = act(s, { type: "team_invite", playerId: "c" }, "h");
    expect(s.invites).toHaveLength(3);
    s = act(s, { type: "team_accept", playerId: "h" }, "a");
    expect(partner(s, "h")).toBe("a");
    expect(partner(s, "a")).toBe("h");
    expect(s.invites).toEqual([]);
    expect(() => act(s, { type: "team_accept", playerId: "b" }, "a")).toThrow(/gone/);
  });

  it("decline removes one invite; leaving a team frees both", () => {
    let s = lobby();
    s = act(s, { type: "team_invite", playerId: "a" }, "h");
    s = act(s, { type: "team_decline", playerId: "h" }, "a");
    expect(s.invites).toEqual([]);
    s = act(s, { type: "team_invite", playerId: "a" }, "h");
    s = act(s, { type: "team_accept", playerId: "h" }, "a");
    s = act(s, { type: "team_leave" }, "a");
    expect(partner(s, "h")).toBeNull();
    expect(partner(s, "a")).toBeNull();
  });

  it("inviting someone who already invited you pairs you; bots always accept", () => {
    let s = lobby();
    s = act(s, { type: "team_invite", playerId: "a" }, "b");
    s = act(s, { type: "team_invite", playerId: "b" }, "a");
    expect(partner(s, "a")).toBe("b");
    s = act(s, { type: "add_bot" }, "h");
    const bot = s.players.find((p) => p.isBot)!;
    s = act(s, { type: "team_invite", playerId: bot.id }, "h");
    expect(partner(s, "h")).toBe(bot.id);
  });

  it("is off unless the host turns team play on, and turning it off clears teams", () => {
    let s = lobby();
    s = act(s, { type: "team_invite", playerId: "b" }, "a");
    s = act(s, { type: "team_accept", playerId: "a" }, "b");
    s = act(s, { type: "update_settings", settings: { teamPlay: false } }, "h");
    expect(partner(s, "a")).toBeNull();
    expect(() => act(s, { type: "team_invite", playerId: "b" }, "a")).toThrow(/off/);
  });

  it("a player leaving the lobby frees their partner", () => {
    let s = lobby();
    s = act(s, { type: "team_invite", playerId: "b" }, "a");
    s = act(s, { type: "team_accept", playerId: "a" }, "b");
    s = act(s, { type: "leave" }, "b");
    expect(partner(s, "a")).toBeNull();
  });
});

describe("starting a team game", () => {
  it("auto-pairs the rest and seats partners opposite each other", () => {
    let s = lobby(["d", "e"]);
    s = act(s, { type: "team_invite", playerId: "c" }, "a");
    s = act(s, { type: "team_accept", playerId: "a" }, "c");
    s = act(s, { type: "start" }, "h");
    expect(s.phase).toBe("playing");
    const n = s.players.length;
    expect(n).toBe(6);
    for (let i = 0; i < n; i++) {
      const p = s.players[i];
      expect(p.partnerId).toBe(s.players[(i + n / 2) % n].id);
    }
    expect(partner(s, "a")).toBe("c");
  });

  it("needs an even number of players, at least four", () => {
    const odd = lobby(["d"]);
    expect(() => act(odd, { type: "start" }, "h")).toThrow(/even number/);
    let two = createGame({ id: "h", name: "H", avatar: "🙂" }, mergeSettings(CLASSIC_SETTINGS, { teamPlay: true }));
    two = act(two, { type: "add_bot" }, "h");
    expect(() => act(two, { type: "start" }, "h")).toThrow(/even number/);
  });
});

/** A started 4-player team game: p0+p2 vs p1+p3. */
function teamGame(settings: Record<string, unknown> = {}) {
  let s = createGame({ id: "p0", name: "P0", avatar: "🙂" }, mergeSettings(CLASSIC_SETTINGS, { teamPlay: true, ...settings }));
  for (const id of ["p1", "p2", "p3"]) s.players.push(newPlayer({ id, name: id, avatar: "🙂" }));
  s = act(s, { type: "team_invite", playerId: "p2" }, "p0");
  s = act(s, { type: "team_accept", playerId: "p0" }, "p2");
  s = act(s, { type: "team_invite", playerId: "p3" }, "p1");
  s = act(s, { type: "team_accept", playerId: "p1" }, "p3");
  s = act(s, { type: "start" }, "p0");
  expect(s.players.map((p) => p.id)).toEqual(["p0", "p1", "p2", "p3"]);
  return s;
}

describe("playing as a team", () => {
  it("partners see each other's hand, nobody else does", () => {
    const s = teamGame();
    expect(Object.keys(privateView(s, "p0").peek ?? {})).toEqual(["p2"]);
    expect(privateView(s, "p0").peek?.p2).toEqual(s.players[2].hand);
    const seen = JSON.stringify(privateView(s, "p0"));
    for (const c of [...s.players[1].hand, ...s.players[3].hand]) expect(seen).not.toContain(`"id":"${c.id}"`);
  });

  it("when one partner goes out, the team wins and both share the points", () => {
    const last = num("red", 1);
    const s = arrange(teamGame({ winMode: "points", targetPoints: 500 }), {
      turn: "p2",
      top: num("red", 5),
      hands: { p0: [num("blue", 9)], p1: [card("wild")], p2: [last], p3: [num("green", 4)] },
    });
    s.players[2].saidUno = true;
    const g = new Game(s);
    g.act("p2", { type: "play", cardId: last.id });
    expect(g.state.phase).toBe("round_over");
    expect(g.state.lastRound?.winnerId).toBe("p2");
    expect(g.state.lastRound?.points).toBe(54); // only the other team's cards count
    expect(g.player("p2").score).toBe(54);
    expect(g.player("p0").score).toBe(54);
    expect(g.player("p1").score).toBe(0);
  });

  it("the round ends when only one team is left standing", () => {
    const s = teamGame();
    const g = new Game(s);
    g.act("p1", { type: "leave" }); // a bot takes over: still in
    expect(g.state.phase).toBe("playing");
    g.state.players[1].status = "out";
    g.state.players[1].hand = [];
    g.state.players[3].status = "out";
    g.state.drawPile.unshift(...g.state.players[3].hand);
    g.state.players[3].hand = [];
    g.act("p0", { type: "leave" }); // forces a settle
    expect(["round_over", "game_over"]).toContain(g.state.phase);
    expect(["p0", "p2"]).toContain(g.state.lastRound?.winnerId);
  });

  it("time-up counts each team's total points", () => {
    const s = arrange(teamGame(), {
      turn: "p0",
      top: num("red", 5),
      // team p0+p2: 9 + 9 = 18, team p1+p3: 1 + 20 = 21; the single lowest hand (p1) loses with their team
      hands: { p0: [num("blue", 9)], p1: [num("blue", 1)], p2: [num("green", 9)], p3: [card("skip", "red")] },
    });
    const g = new Game(s);
    g.state.roundEndsAt = g.now + 10;
    g.state.deadline = Number.MAX_SAFE_INTEGER;
    g.act("system", { type: "timeout" }, 100);
    expect(["p0", "p2"]).toContain(g.state.lastRound?.winnerId);
  });

  it("you can't catch your own partner", () => {
    const a = num("red", 1);
    const s = arrange(teamGame(), { turn: "p0", top: num("red", 5), hands: { p0: [a, num("red", 2)] } });
    const g = new Game(s);
    g.act("p0", { type: "play", cardId: a.id });
    expect(() => g.act("p2", { type: "catch_uno", targetId: "p0" }, 2000)).toThrow(/Too late/);
    g.act("p1", { type: "catch_uno", targetId: "p0" });
    expect(g.hand("p0")).toHaveLength(3);
    expect(countCards(g.state)).toBe(g.state.totalCards);
  });
});
