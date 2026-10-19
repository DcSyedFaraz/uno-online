import { describe, expect, it } from "vitest";
import { buildDeck, deckSpecs, resolveDeckCount } from "../deck";
import { RuleError } from "../errors";
import { applyAction } from "../reducer";
import { activeExtras, CLASSIC_SETTINGS, DEFAULT_SETTINGS, mergeSettings } from "../rules";
import { mulberry32 } from "../rng";
import { countCards, createGame, newPlayer } from "../state";
import { UNO_CATCH_GRACE_MS, UNO_WINDOW_MS } from "../uno";
import { eventsFor, privateView, publicView } from "../view";
import { arrange, card, Game, num, startedGame } from "./helpers";

describe("deck", () => {
  it("classic deck has the official 108 cards", () => {
    const specs = deckSpecs(CLASSIC_SETTINGS);
    expect(specs).toHaveLength(108);
    const count = (pred: (c: (typeof specs)[number]) => boolean) => specs.filter(pred).length;
    expect(count((c) => c.kind === "number" && c.value === 0)).toBe(4);
    expect(count((c) => c.kind === "number" && c.value === 5)).toBe(8);
    expect(count((c) => c.kind === "skip")).toBe(8);
    expect(count((c) => c.kind === "reverse")).toBe(8);
    expect(count((c) => c.kind === "draw2")).toBe(8);
    expect(count((c) => c.kind === "wild")).toBe(4);
    expect(count((c) => c.kind === "wild4")).toBe(4);
    expect(count((c) => c.color === "red")).toBe(25);
  });

  it("each extra card switch adds only its own cards", () => {
    const cases = [
      ["discardAll", "discard_all", 8],
      ["skipAll", "skip_all", 8],
      ["draw4Color", "draw4", 8],
      ["wildReverse4", "wild_reverse4", 8],
      ["wild6", "wild6", 4],
      ["wild10", "wild10", 4],
      ["roulette", "wild_roulette", 8],
    ] as const;
    for (const [key, kind, n] of cases) {
      const s = mergeSettings(CLASSIC_SETTINGS, { cards: { [key]: true } });
      const specs = deckSpecs(s);
      expect(specs).toHaveLength(108 + n);
      expect(specs.filter((c) => c.kind === kind)).toHaveLength(n);
    }
  });

  it("auto deck count scales with players", () => {
    expect(resolveDeckCount(CLASSIC_SETTINGS, 4)).toBe(1);
    expect(resolveDeckCount(CLASSIC_SETTINGS, 6)).toBe(1);
    expect(resolveDeckCount(CLASSIC_SETTINGS, 7)).toBe(2);
    expect(resolveDeckCount(CLASSIC_SETTINGS, 10)).toBe(2);
    expect(resolveDeckCount({ ...CLASSIC_SETTINGS, handSize: 10 }, 10)).toBe(3);
    expect(resolveDeckCount(mergeSettings(CLASSIC_SETTINGS, { cards: { wild6: true } }), 5)).toBe(2);
    expect(resolveDeckCount({ ...CLASSIC_SETTINGS, deckCount: 1 }, 10)).toBe(1);
    const ids = buildDeck(CLASSIC_SETTINGS, 8).map((c) => c.id);
    expect(new Set(ids).size).toBe(216);
  });
});

describe("starting a round", () => {
  it("deals the hand size to everyone and always starts on a number card", () => {
    for (let seed = 1; seed < 400; seed++) {
      const s = startedGame({ players: 4, seed });
      const start = s.discardPile[0];
      expect(start.kind).toBe("number");
      expect(s.currentColor).toBe(start.color);
      expect(countCards(s)).toBe(108);
      expect(s.turnIndex).toBe((s.dealerIndex + 1) % 4);
      expect(s.direction).toBe(1);
      expect(s.turn).toEqual({ kind: "play" });
      expect(s.players.every((p) => p.hand.length === 7)).toBe(true);
    }
  });

  it("never starts on an action or wild card, whatever extras are in the deck", () => {
    const every = { wildReverse4: true, discardAll: true, skipAll: true, draw4Color: true, wild6: true, wild10: true, roulette: true };
    for (let seed = 1; seed < 200; seed++) {
      expect(startedGame({ players: 5, seed, settings: { cards: every } }).discardPile[0].kind).toBe("number");
    }
  });

  it("with Discard All on, everyone is dealt at least one", () => {
    for (let n = 2; n <= 10; n++) {
      for (let seed = 1; seed < 30; seed++) {
        const s = startedGame({ players: n, seed, settings: { cards: { discardAll: true } } });
        for (const p of s.players) {
          expect(p.hand.some((c) => c.kind === "discard_all")).toBe(true);
          expect(p.hand).toHaveLength(7);
        }
        expect(countCards(s)).toBe(s.totalCards);
      }
    }
  });

  it("hands out as many Discard Alls as the deck has when it's short", () => {
    const s = startedGame({ players: 10, seed: 3, settings: { deckCount: 1, handSize: 5, cards: { discardAll: true } } });
    const holders = s.players.filter((p) => p.hand.some((c) => c.kind === "discard_all")).length;
    expect(holders).toBe(8); // one deck has 8
    expect(countCards(s)).toBe(s.totalCards);
  });
});

describe("classic play", () => {
  const base = () => startedGame({ players: 3 });

  it("plays matching color or symbol, rejects others", () => {
    const g = new Game(arrange(base(), { turn: "p0", top: num("red", 5), hands: { p0: [num("blue", 5), num("green", 3), num("red", 9)] } }));
    expect(() => g.act("p0", { type: "play", cardId: g.hand("p0")[1].id })).toThrow(/doesn't match/);
    expect(() => g.act("p1", { type: "play", cardId: g.hand("p0")[0].id })).toThrow(RuleError);
    g.act("p0", { type: "play", cardId: g.hand("p0")[0].id });
    expect(g.top.color).toBe("blue");
    expect(g.state.currentColor).toBe("blue");
    expect(g.turnId).toBe("p1");
  });

  it("wild needs a color and sets it", () => {
    const w = card("wild");
    const g = new Game(arrange(base(), { turn: "p0", top: num("red", 5), hands: { p0: [w, num("blue", 1)] } }));
    expect(() => g.act("p0", { type: "play", cardId: w.id })).toThrow(/color/);
    g.act("p0", { type: "play", cardId: w.id, color: "yellow" });
    expect(g.state.currentColor).toBe("yellow");
    expect(g.turnId).toBe("p1");
  });

  it("skip skips the next player", () => {
    const sk = card("skip", "red");
    const g = new Game(arrange(base(), { turn: "p0", top: num("red", 5), hands: { p0: [sk, num("blue", 1)] } }));
    g.act("p0", { type: "play", cardId: sk.id });
    expect(g.turnId).toBe("p2");
  });

  it("reverse flips direction with 3+ players", () => {
    const rv = card("reverse", "red");
    const g = new Game(arrange(base(), { turn: "p1", top: num("red", 5), hands: { p1: [rv, num("blue", 1)] } }));
    g.act("p1", { type: "play", cardId: rv.id });
    expect(g.state.direction).toBe(-1);
    expect(g.turnId).toBe("p0");
  });

  it("reverse acts as skip with 2 players", () => {
    const rv = card("reverse", "red");
    const g = new Game(arrange(startedGame({ players: 2 }), { turn: "p0", top: num("red", 5), hands: { p0: [rv, num("blue", 1)] } }));
    g.act("p0", { type: "play", cardId: rv.id });
    expect(g.turnId).toBe("p0");
  });

  it("+2 makes the next player draw 2 and lose their turn", () => {
    const d2 = card("draw2", "red");
    const g = new Game(arrange(base(), { turn: "p0", top: num("red", 5), hands: { p0: [d2, num("blue", 1)], p1: [num("green", 1)] } }));
    g.act("p0", { type: "play", cardId: d2.id });
    expect(g.hand("p1")).toHaveLength(3);
    expect(g.turnId).toBe("p2");
  });

  it("drawing: playable drawn card may be played or passed", () => {
    const s = arrange(base(), { turn: "p0", top: num("red", 5), hands: { p0: [num("blue", 1)] } });
    const drawnCard = num("red", 2);
    s.drawPile.push(drawnCard);
    const g = new Game(s);
    g.act("p0", { type: "draw" });
    expect(g.state.turn).toEqual({ kind: "drawn", cardId: drawnCard.id });
    expect(privateView(g.state, "p0").playable).toEqual([drawnCard.id]);
    expect(() => g.act("p0", { type: "play", cardId: g.hand("p0")[0].id })).toThrow(/just drew/);
    g.act("p0", { type: "pass" });
    expect(g.turnId).toBe("p1");
  });

  it("drawing an unplayable card ends the turn", () => {
    const s = arrange(base(), { turn: "p0", top: num("red", 5), hands: { p0: [num("blue", 1)] } });
    s.drawPile.push(num("green", 2));
    const g = new Game(s);
    g.act("p0", { type: "draw" });
    expect(g.hand("p0")).toHaveLength(2);
    expect(g.turnId).toBe("p1");
  });

  it("an unplayable draw never leaves the player in a 'drawn' state", () => {
    const s = arrange(base(), { turn: "p0", top: num("red", 5), hands: { p0: [num("blue", 1)] } });
    s.drawPile.push(num("green", 2));
    const g = new Game(s);
    g.act("p0", { type: "draw" });
    expect(g.state.turn).toEqual({ kind: "play" });
    expect(g.turnId).toBe("p1");
    expect(() => g.act("p0", { type: "pass" })).toThrow(RuleError);
  });

  it("draw-until-playable keeps drawing past unplayable cards, then offers the playable one", () => {
    const s = arrange(startedGame({ players: 3, settings: { drawUntilPlayable: true } }), { turn: "p0", top: num("red", 5), hands: { p0: [num("blue", 1)] } });
    const playable = num("red", 9);
    s.drawPile.push(playable, num("green", 2), num("yellow", 3));
    const g = new Game(s);
    g.act("p0", { type: "draw" });
    expect(g.hand("p0")).toHaveLength(4);
    expect(g.state.turn).toEqual({ kind: "drawn", cardId: playable.id });
  });

  it("reshuffles the discard pile when the draw pile is empty", () => {
    const s = arrange(base(), { turn: "p0", top: num("red", 5), hands: { p0: [num("blue", 1)] } });
    const total = countCards(s);
    s.discardPile = [...s.drawPile, num("red", 5)];
    s.drawPile = [];
    s.totalCards = countCards(s);
    const g = new Game(s);
    g.act("p0", { type: "draw" });
    expect(g.events.some((e) => e.t === "reshuffle")).toBe(true);
    expect(g.state.discardPile).toHaveLength(1);
    expect(countCards(g.state)).toBe(s.totalCards);
    expect(total).toBeGreaterThan(0);
  });
});

describe("Wild +4 challenge", () => {
  const setup = (p0Hand = [num("red", 1), num("blue", 2)]) => {
    const w4 = card("wild4");
    const s = arrange(startedGame({ players: 3 }), { turn: "p0", top: num("red", 5), hands: { p0: [w4, ...p0Hand], p1: [num("green", 1)] } });
    return { g: new Game(s), w4 };
  };

  it("accepting: victim draws 4 and is skipped", () => {
    const { g, w4 } = setup();
    g.act("p0", { type: "play", cardId: w4.id, color: "blue" });
    expect(g.turnId).toBe("p1");
    expect(privateView(g.state, "p1").canChallenge).toBe(true);
    g.act("p1", { type: "take_penalty" });
    expect(g.hand("p1")).toHaveLength(5);
    expect(g.turnId).toBe("p2");
  });

  it("guilty: offender draws 4 and the challenger plays", () => {
    const { g, w4 } = setup([num("red", 1), num("blue", 2)]);
    g.act("p0", { type: "play", cardId: w4.id, color: "blue" });
    g.act("p1", { type: "challenge" });
    expect(g.hand("p0")).toHaveLength(6);
    expect(g.hand("p1")).toHaveLength(1);
    expect(g.turnId).toBe("p1");
    expect(g.state.turn.kind).toBe("play");
    expect(g.state.currentColor).toBe("blue");
  });

  it("innocent: challenger draws 6 and is skipped", () => {
    const { g, w4 } = setup([num("green", 1), num("blue", 2)]);
    g.act("p0", { type: "play", cardId: w4.id, color: "blue" });
    g.act("p1", { type: "challenge" });
    expect(g.hand("p1")).toHaveLength(7);
    expect(g.turnId).toBe("p2");
  });

  it("free mode: no challenge, immediate draw", () => {
    const w4 = card("wild4");
    const s = arrange(startedGame({ players: 3, settings: { wild4Mode: "free" } }), {
      turn: "p0",
      top: num("red", 5),
      hands: { p0: [w4, num("red", 1)], p1: [num("green", 1)] },
    });
    const g = new Game(s);
    g.act("p0", { type: "play", cardId: w4.id, color: "red" });
    expect(g.hand("p1")).toHaveLength(5);
    expect(g.turnId).toBe("p2");
  });

  it("restricted mode: blocked while holding the current color", () => {
    const w4 = card("wild4");
    const s = arrange(startedGame({ players: 3, settings: { wild4Mode: "restricted" } }), {
      turn: "p0",
      top: num("red", 5),
      hands: { p0: [w4, num("red", 1)] },
    });
    const g = new Game(s);
    expect(() => g.act("p0", { type: "play", cardId: w4.id, color: "red" })).toThrow(/no card of the current color/);
  });
});

describe("last-card shout", () => {
  const setup = () => {
    const a = num("red", 1);
    const b = num("red", 2);
    const s = arrange(startedGame({ players: 3 }), { turn: "p0", top: num("red", 5), hands: { p0: [a, b] } });
    return { g: new Game(s), a, b };
  };

  it("missing the shout can be caught after the grace period", () => {
    const { g, a } = setup();
    g.act("p0", { type: "play", cardId: a.id });
    expect(g.state.unoWindow?.playerId).toBe("p0");
    expect(() => g.act("p2", { type: "catch_uno", targetId: "p0" })).toThrow(/second/);
    g.act("p2", { type: "catch_uno", targetId: "p0" }, UNO_CATCH_GRACE_MS);
    expect(g.hand("p0")).toHaveLength(3);
    expect(g.state.unoWindow).toBeNull();
  });

  it("shouting after playing protects you", () => {
    const { g, a } = setup();
    g.act("p0", { type: "play", cardId: a.id });
    g.act("p0", { type: "call_uno" });
    expect(() => g.act("p2", { type: "catch_uno", targetId: "p0" }, 5000)).toThrow(/Too late/);
    expect(g.hand("p0")).toHaveLength(1);
  });

  it("shouting early with 2 cards opens no window", () => {
    const { g, a } = setup();
    g.act("p0", { type: "call_uno" });
    g.act("p0", { type: "play", cardId: a.id });
    expect(g.state.unoWindow).toBeNull();
  });

  it("the next player moving doesn't close the window, but time does", () => {
    const { g, a } = setup();
    g.act("p0", { type: "play", cardId: a.id });
    g.state.drawPile.push(num("green", 9));
    g.act("p1", { type: "draw" }, 500);
    expect(g.state.unoWindow?.playerId).toBe("p0");
    g.act("p2", { type: "catch_uno", targetId: "p0" }, UNO_CATCH_GRACE_MS);
    expect(g.hand("p0")).toHaveLength(3);
  });

  it("can't catch once the window has expired", () => {
    const { g, a } = setup();
    g.act("p0", { type: "play", cardId: a.id });
    expect(() => g.act("p2", { type: "catch_uno", targetId: "p0" }, UNO_WINDOW_MS + 10)).toThrow(/Too late/);
    expect(g.hand("p0")).toHaveLength(1);
  });

  it("shouting with more cards is rejected", () => {
    const { g } = setup();
    expect(() => g.act("p1", { type: "call_uno" })).toThrow(RuleError);
  });
});

describe("timeouts and autopilot", () => {
  it("a timed-out human draws and passes", () => {
    const s = arrange(startedGame({ players: 3 }), { turn: "p0", top: num("red", 5), hands: { p0: [num("blue", 1)] } });
    s.drawPile.push(num("red", 7));
    s.deadline = 100;
    const g = new Game(s);
    g.act("system", { type: "timeout" });
    expect(g.hand("p0")).toHaveLength(2);
    expect(g.turnId).toBe("p1");
    expect(g.player("p0").afkStrikes).toBe(1);
  });

  it("refuses early timeouts", () => {
    const s = arrange(startedGame({ players: 3 }), { turn: "p0", top: num("red", 5), hands: { p0: [num("blue", 1)] } });
    s.deadline = Number.MAX_SAFE_INTEGER;
    const g = new Game(s);
    expect(() => g.act("system", { type: "timeout" })).toThrow(/Not yet/);
  });

  it("autopilot takes over after repeated timeouts and hands back on activity", () => {
    const s = arrange(startedGame({ players: 2, settings: { afkAutopilot: true, afkThreshold: 1 } }), {
      turn: "p0",
      top: num("red", 5),
      hands: { p0: [card("skip", "red"), num("blue", 3), num("green", 4)] },
    });
    s.deadline = 100;
    const g = new Game(s);
    g.act("system", { type: "timeout" });
    expect(g.player("p0").autopilot).toBe(true);
    expect(g.hand("p0")).toHaveLength(2); // the bot logic played the skip
    expect(g.turnId).toBe("p0");
    g.act("p0", { type: "draw" });
    expect(g.player("p0").autopilot).toBe(false);
  });
});

describe("scoring and round end", () => {
  it("points mode: winner scores opponents' cards; game ends at target", () => {
    const last = num("red", 1);
    const s = arrange(startedGame({ players: 3, settings: { winMode: "points", targetPoints: 100 } }), {
      turn: "p0",
      top: num("red", 5),
      hands: { p0: [last], p1: [num("blue", 9), card("wild")], p2: [card("skip", "green")] },
    });
    s.players[0].saidUno = true;
    const g = new Game(s);
    g.act("p0", { type: "play", cardId: last.id });
    expect(g.state.phase).toBe("round_over");
    expect(g.player("p0").score).toBe(79);
    expect(g.state.lastRound?.winnerId).toBe("p0");
    g.act("p0", { type: "next_round" });
    expect(g.state.phase).toBe("playing");
    expect(g.state.round).toBe(2);
  });

  it("going out on a +2 still makes the next player draw", () => {
    const last = card("draw2", "red");
    const s = arrange(startedGame({ players: 3 }), { turn: "p0", top: num("red", 5), hands: { p0: [last], p1: [num("blue", 1)] } });
    const g = new Game(s);
    g.act("p0", { type: "play", cardId: last.id });
    expect(g.hand("p1")).toHaveLength(3);
    expect(g.state.phase).toBe("game_over");
    expect(g.state.gameWinnerId).toBe("p0");
  });
});

describe("lobby", () => {
  const lobby = () => createGame({ id: "h", name: "Host", avatar: "🙂" });
  const act = (s: ReturnType<typeof lobby>, a: Parameters<typeof applyAction>[1], who: string) =>
    applyAction(s, a, who, 0, mulberry32(3)).state;

  it("joins up to 10 players, then refuses", () => {
    let s = lobby();
    for (let i = 1; i < 10; i++) s = act(s, { type: "join", name: `G${i}`, avatar: "😎" }, `g${i}`);
    expect(s.players).toHaveLength(10);
    // a full table: you watch instead
    const watching = act(s, { type: "join", name: "X", avatar: "😎" }, "x");
    expect(watching.players).toHaveLength(10);
    expect(watching.spectators?.map((w) => w.id)).toEqual(["x"]);
    expect(() => act(s, { type: "add_bot" }, "h")).toThrow(/full/);
  });

  it("only the host changes rules or starts", () => {
    let s = act(lobby(), { type: "join", name: "G", avatar: "😎" }, "g");
    expect(() => act(s, { type: "update_settings", settings: { jumpIn: true } }, "g")).toThrow(/host/);
    s = act(s, { type: "update_settings", settings: { jumpIn: true, cards: { discardAll: true } } }, "h");
    expect(s.settings.jumpIn).toBe(true);
    expect(s.settings.cards.discardAll).toBe(true);
    expect(s.settings.cards.wild6).toBe(false);
    expect(() => act(s, { type: "update_settings", settings: { handSize: 99 } }, "h")).toThrow(/Invalid/);
    expect(() => act(s, { type: "start" }, "g")).toThrow(/host/);
    s = act(s, { type: "start" }, "h");
    expect(s.phase).toBe("playing");
    // too late for a seat: you watch instead
    const late = act(s, { type: "join", name: "Late", avatar: "😎" }, "late");
    expect(late.players.some((p) => p.id === "late")).toBe(false);
    expect(late.spectators?.map((w) => w.id)).toEqual(["late"]);
  });

  it("bots can be added and removed; host passes on when leaving", () => {
    let s = act(lobby(), { type: "add_bot" }, "h");
    s = act(s, { type: "join", name: "G", avatar: "😎" }, "g");
    const bot = s.players.find((p) => p.isBot)!;
    expect(bot).toBeTruthy();
    s = act(s, { type: "remove_bot", playerId: bot.id }, "h");
    expect(s.players.some((p) => p.isBot)).toBe(false);
    s = act(s, { type: "leave" }, "h");
    expect(s.hostId).toBe("g");
  });

  it("a player leaving mid-round is replaced by a bot that keeps the cards and plays on", () => {
    const s0 = startedGame({ players: 3 });
    const g = new Game(arrange(s0, { turn: "p1", top: num("red", 5), hands: { p1: [num("red", 1), num("blue", 2)] } }));
    const total = countCards(g.state);
    g.act("p1", { type: "leave" });
    expect(g.player("p1").status).toBe("active");
    expect(g.player("p1").isBot).toBe(true);
    expect(countCards(g.state)).toBe(total);
    g.act("system", { type: "timeout" }, 5000);
    expect(g.turnId).not.toBe("p1");
    expect(countCards(g.state)).toBe(total);
  });
});

describe("views", () => {
  it("hide other hands and drawn cards", () => {
    const s = arrange(startedGame({ players: 3 }), { turn: "p0", top: num("red", 5), hands: { p0: [num("blue", 1)] } });
    const drawn = num("green", 2);
    s.drawPile.push(drawn);
    const res = applyAction(s, { type: "draw" }, "p0", 0, mulberry32(1));
    const pub = JSON.stringify(publicView(res.state));
    expect(pub).not.toContain(drawn.id);
    expect(JSON.stringify(eventsFor(res.events, "p1"))).not.toContain(drawn.id);
    expect(JSON.stringify(eventsFor(res.events, "p0"))).toContain(drawn.id);
    expect(privateView(res.state, "p0").hand.map((c) => c.id)).toContain(drawn.id);
    expect(JSON.stringify(privateView(res.state, "p1"))).not.toContain(drawn.id);
  });

  it("new rooms start with the default rules: classic plus higher stacking, Discard All and 3-minute rounds", () => {
    const s = createGame({ id: "h", name: "H", avatar: "🙂" });
    s.players.push(newPlayer({ id: "g", name: "G", avatar: "🙂" }));
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
    expect(s.settings.stacking).toBe("higher");
    expect(s.settings.cards.discardAll).toBe(true);
    expect(s.settings.roundTimerMin).toBe(3);
    expect(activeExtras(CLASSIC_SETTINGS)).toEqual([]);
    expect(CLASSIC_SETTINGS.roundTimerMin).toBe(0);
  });

  it("settings saved before a rule existed fall back to classic for it", () => {
    const legacy = structuredClone(CLASSIC_SETTINGS) as Partial<typeof CLASSIC_SETTINGS>;
    delete legacy.roundTimerMin;
    const merged = mergeSettings(legacy as typeof CLASSIC_SETTINGS, { jumpIn: true });
    expect(merged.roundTimerMin).toBe(0);
    expect(merged.jumpIn).toBe(true);
  });
});

describe("leaving and closing the room", () => {
  it("leaving the lobby removes the player; the next human becomes host", () => {
    const s = startedGame({ players: 3 });
    const lobby = structuredClone(s);
    lobby.phase = "lobby";
    const g = new Game(lobby);
    g.act("p0", { type: "leave" });
    expect(g.state.players.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(g.state.hostId).toBe("p1");
    expect(g.events.some((e) => e.t === "host_changed")).toBe(true);
  });

  it("leaving mid-game hands the seat to a bot (hand kept) and passes the host role on", () => {
    const g = new Game(startedGame({ players: 3 }));
    const cards = g.hand("p0").length;
    g.act("p0", { type: "leave" });
    const p0 = g.player("p0");
    expect(p0.isBot).toBe(true);
    expect(p0.takenOver).toBe(true);
    expect(p0.status).toBe("active");
    expect(p0.hand).toHaveLength(cards);
    expect(g.state.hostId).toBe("p1");
    // it's their turn: the bot gets a deadline and plays it
    expect(g.turnId).toBe("p0");
    expect(g.state.deadline).not.toBeNull();
    g.act("system", { type: "timeout" }, 5000);
    expect(g.turnId).not.toBe("p0");
  });

  it("a player who left can rejoin and take the seat back; back-to-lobby drops the bots that replaced leavers", () => {
    const g = new Game(startedGame({ players: 3 }));
    g.act("p2", { type: "leave" });
    g.act("p2", { type: "join", name: "P2", avatar: "🙂" });
    expect(g.player("p2").isBot).toBe(false);
    g.act("p2", { type: "leave" });
    const s = structuredClone(g.state);
    s.phase = "game_over";
    const g2 = new Game(s);
    g2.act(g2.state.hostId, { type: "back_to_lobby" });
    expect(g2.state.players.some((p) => p.id === "p2")).toBe(false);
  });

  it("only the host can close the room", () => {
    const g = new Game(startedGame({ players: 3 }));
    expect(() => g.act("p1", { type: "close_room" })).toThrow(RuleError);
    g.act("p0", { type: "close_room" });
    expect(g.events.some((e) => e.t === "room_closed")).toBe(true);
  });
});
