import { describe, expect, it } from "vitest";
import { applyAction } from "../reducer";
import { mulberry32 } from "../rng";
import { createGame, newPlayer } from "../state";
import { eventsFor, privateView, publicView } from "../view";
import type { GameState } from "../types";
import { arrange, Game, num, startedGame } from "./helpers";

describe("spectators", () => {
  it("someone joining a running game watches and sees every hand", () => {
    const g = new Game(startedGame({ players: 3 }));
    g.act("w", { type: "join", name: "Watcher", avatar: "👀" });
    expect(g.state.spectators).toEqual([{ id: "w", name: "Watcher", avatar: "👀" }]);
    expect(g.events).toContainEqual({ t: "spectator_joined", pid: "w" });
    const view = privateView(g.state, "w");
    expect(view.spectator).toBe(true);
    expect(view.hand).toEqual([]);
    expect(Object.keys(view.peek ?? {}).sort()).toEqual(["p0", "p1", "p2"]);
    expect(view.peek?.p1).toEqual(g.hand("p1"));
    expect(publicView(g.state).spectators).toHaveLength(1);
  });

  it("spectators can't play, but can leave", () => {
    const g = new Game(startedGame({ players: 3 }));
    g.act("w", { type: "join", name: "W", avatar: "👀" });
    expect(() => g.act("w", { type: "draw" })).toThrow(/watch/);
    g.act("w", { type: "leave" });
    expect(g.state.spectators).toEqual([]);
  });

  it("they take a seat when the round is over", () => {
    const last = num("red", 1);
    const s = arrange(startedGame({ players: 3, settings: { winMode: "points", targetPoints: 500 } }), {
      turn: "p0",
      top: num("red", 5),
      hands: { p0: [last] },
    });
    s.players[0].saidUno = true;
    const g = new Game(s);
    g.act("w", { type: "join", name: "W", avatar: "👀" });
    g.act("p0", { type: "play", cardId: last.id });
    expect(g.state.phase).toBe("round_over");
    g.act("w", { type: "join", name: "W", avatar: "👀" });
    expect(g.state.spectators).toEqual([]);
    expect(g.state.players.some((p) => p.id === "w")).toBe(true);
  });

  it("see drawn cards in events", () => {
    const s = arrange(startedGame({ players: 3 }), { turn: "p0", top: num("red", 5), hands: { p0: [num("blue", 1)] } });
    const drawn = num("green", 2);
    s.drawPile.push(drawn);
    const res = applyAction(s, { type: "draw" }, "p0", 0, mulberry32(1));
    expect(JSON.stringify(eventsFor(res.events, "w", true))).toContain(drawn.id);
    expect(JSON.stringify(eventsFor(res.events, "p1"))).not.toContain(drawn.id);
  });
});

describe("offline players", () => {
  const off = (g: Game, pid: string) => g.act("system", { type: "offline", playerId: pid });

  it("a bot takes over mid-game, and playing again gives the seat back", () => {
    const s = arrange(startedGame({ players: 3 }), { turn: "p1", top: num("red", 5), hands: { p1: [num("red", 3), num("blue", 4)] } });
    const g = new Game(s);
    off(g, "p1");
    expect(g.player("p1")).toMatchObject({ isBot: true, takenOver: true, offline: true });
    expect(g.events).toContainEqual({ t: "player_offline", pid: "p1" });
    // the bot moves quickly instead of waiting out the turn timer
    expect(g.state.deadline! - g.now).toBeLessThan(2000);
    g.act("p1", { type: "play", cardId: g.hand("p1")[0].id });
    expect(g.player("p1")).toMatchObject({ isBot: false, takenOver: false, offline: false });
  });

  it("the host role moves to a human who's still here", () => {
    const g = new Game(startedGame({ players: 3 }));
    off(g, "p0");
    expect(g.state.hostId).toBe("p1");
  });

  it("is ignored for bots and people already gone", () => {
    const g = new Game(startedGame({ players: 3 }));
    off(g, "p2");
    expect(() => off(g, "p2")).toThrow(/Nothing to do/);
    expect(() => off(g, "nobody")).toThrow(/Nothing to do/);
  });

  it("in the lobby they simply leave the table", () => {
    const s = createGame({ id: "h", name: "H", avatar: "🙂" });
    s.players.push(newPlayer({ id: "g", name: "G", avatar: "🙂" }));
    const res = applyAction(s, { type: "offline", playerId: "g" }, "system", 0, mulberry32(1)).state;
    expect(res.players.map((p) => p.id)).toEqual(["h"]);
  });

  it("starting a new game drops them", () => {
    const last = num("red", 1);
    const s: GameState = arrange(startedGame({ players: 3 }), { turn: "p0", top: num("red", 5), hands: { p0: [last] } });
    s.players[0].saidUno = true;
    const g = new Game(s);
    off(g, "p2");
    g.act("p0", { type: "play", cardId: last.id });
    expect(g.state.phase).toBe("game_over");
    g.act("p0", { type: "start" });
    expect(g.state.players.map((p) => p.id)).toEqual(["p0", "p1"]);
  });

  it("a kicked player can't reclaim the seat by playing", () => {
    const g = new Game(startedGame({ players: 3 }));
    g.act("p0", { type: "kick", playerId: "p1" });
    expect(g.player("p1").takenOver).toBe(true);
    expect(() => g.act("p1", { type: "call_uno" })).toThrow(/removed you/);
  });
});
