import { describe, expect, it } from "vitest";
import { countCards } from "../state";
import { privateView } from "../view";
import { activeExtras, CLASSIC_SETTINGS, mergeSettings, resetToClassic } from "../rules";
import { arrange, card, Game, num, startedGame, type Setup } from "./helpers";

const game = (settings: Setup["settings"], players = 3) => startedGame({ players, settings });

describe("stacking", () => {
  it("off: +2 on +2 is not allowed (classic)", () => {
    const a = card("draw2", "red");
    const b = card("draw2", "blue");
    const g = new Game(arrange(game({}), { turn: "p0", top: num("red", 5), hands: { p0: [a, num("red", 1)], p1: [b, num("green", 1)] } }));
    g.act("p0", { type: "play", cardId: a.id });
    expect(g.turnId).toBe("p2");
    expect(g.hand("p1")).toHaveLength(4);
  });

  it("same: +2 on +2 adds up, the next player takes the total", () => {
    const a = card("draw2", "red");
    const b = card("draw2", "blue");
    const g = new Game(
      arrange(game({ stacking: "same" }), {
        turn: "p0",
        top: num("red", 5),
        hands: { p0: [a, num("red", 1)], p1: [b, num("green", 1)], p2: [num("yellow", 3)] },
      }),
    );
    g.act("p0", { type: "play", cardId: a.id });
    expect(g.turnId).toBe("p1");
    expect(g.state.turn.kind).toBe("stack");
    expect(privateView(g.state, "p1").playable).toEqual([b.id]);
    expect(() => g.act("p1", { type: "draw" })).toThrow(/take \+2/);
    g.act("p1", { type: "play", cardId: b.id });
    expect(g.state.drawStack).toBe(4);
    expect(g.turnId).toBe("p2");
    g.act("p2", { type: "take_penalty" });
    expect(g.hand("p2")).toHaveLength(5);
    expect(g.turnId).toBe("p0");
    expect(g.state.drawStack).toBe(0);
  });

  it("same: +4 can't go on +2", () => {
    const a = card("draw2", "red");
    const w4 = card("wild4");
    const g = new Game(arrange(game({ stacking: "same" }), { turn: "p0", top: num("red", 5), hands: { p0: [a, num("red", 1)], p1: [w4, num("green", 1)] } }));
    g.act("p0", { type: "play", cardId: a.id });
    expect(privateView(g.state, "p1").playable).toEqual([]);
  });

  it("mixed: +2 and +4 on each other", () => {
    const a = card("wild4");
    const b = card("draw2", "blue");
    const g = new Game(
      arrange(game({ stacking: "mixed" }), {
        turn: "p0",
        top: num("red", 5),
        hands: { p0: [a, num("red", 1)], p1: [b, num("green", 1)], p2: [num("yellow", 3)] },
      }),
    );
    g.act("p0", { type: "play", cardId: a.id, color: "green" });
    g.act("p1", { type: "play", cardId: b.id });
    expect(g.state.drawStack).toBe(6);
    expect(g.state.currentColor).toBe("blue");
  });

  it("higher: only equal or higher values stack", () => {
    const six = card("wild6");
    const two = card("draw2", "blue");
    const ten = card("wild10");
    const g = new Game(
      arrange(game({ stacking: "higher", cards: { wild6: true, wild10: true } }), {
        turn: "p0",
        top: num("red", 5),
        hands: { p0: [six, num("red", 1)], p1: [two, ten, num("green", 1)], p2: [num("yellow", 3)] },
      }),
    );
    g.act("p0", { type: "play", cardId: six.id, color: "red" });
    expect(privateView(g.state, "p1").playable).toEqual([ten.id]);
    g.act("p1", { type: "play", cardId: ten.id, color: "blue" });
    expect(g.state.drawStack).toBe(16);
  });

  it("Wild Reverse +4 sends a stack back the other way", () => {
    const d2 = card("draw2", "red");
    const rev = card("wild_reverse4");
    const g = new Game(
      arrange(game({ stacking: "higher", cards: { wildReverse4: true } }), {
        turn: "p0",
        top: num("red", 5),
        hands: { p0: [d2, num("red", 1), num("red", 2)], p1: [rev, num("green", 1)], p2: [num("yellow", 3)] },
      }),
    );
    g.act("p0", { type: "play", cardId: d2.id });
    g.act("p1", { type: "play", cardId: rev.id, color: "yellow" });
    expect(g.state.direction).toBe(-1);
    expect(g.turnId).toBe("p0");
    expect(g.state.drawStack).toBe(6);
    g.act("p0", { type: "take_penalty" });
    expect(g.hand("p0")).toHaveLength(8);
    expect(g.turnId).toBe("p2");
  });

  it("Wild Reverse +4 without stacking: reverses and the new next player draws 4", () => {
    const rev = card("wild_reverse4");
    const g = new Game(
      arrange(game({ cards: { wildReverse4: true } }, 4), {
        turn: "p1",
        top: num("red", 5),
        hands: { p1: [rev, num("green", 1)], p0: [num("blue", 1)] },
      }),
    );
    g.act("p1", { type: "play", cardId: rev.id, color: "green" });
    expect(g.state.direction).toBe(-1);
    expect(g.hand("p0")).toHaveLength(5);
    expect(g.turnId).toBe("p3");
  });

  it("challenge is still possible on a fresh Wild +4 with stacking on, but not after stacking", () => {
    const w4 = card("wild4");
    const w4b = card("wild4");
    const g = new Game(
      arrange(game({ stacking: "mixed" }), {
        turn: "p0",
        top: num("red", 5),
        hands: { p0: [w4, num("red", 1)], p1: [w4b, num("green", 1)], p2: [num("yellow", 3)] },
      }),
    );
    g.act("p0", { type: "play", cardId: w4.id, color: "blue" });
    expect(privateView(g.state, "p1").canChallenge).toBe(true);
    g.act("p1", { type: "play", cardId: w4b.id, color: "blue" });
    expect(privateView(g.state, "p2").canChallenge).toBe(false);
  });
});

describe("7 swap and 0 rotate", () => {
  it("7 swaps hands with the chosen player", () => {
    const seven = num("red", 7);
    const p0rest = [num("blue", 1), num("blue", 2), num("blue", 3)];
    const p2hand = [num("green", 1)];
    const g = new Game(arrange(game({ sevenSwap: true }), { turn: "p0", top: num("red", 5), hands: { p0: [seven, ...p0rest], p2: p2hand } }));
    expect(privateView(g.state, "p0").needsSwapTarget).toEqual([seven.id]);
    expect(() => g.act("p0", { type: "play", cardId: seven.id })).toThrow(/swap/);
    g.act("p0", { type: "play", cardId: seven.id, swapTargetId: "p2" });
    expect(g.hand("p0").map((c) => c.id)).toEqual(p2hand.map((c) => c.id));
    expect(g.hand("p2").map((c) => c.id)).toEqual(p0rest.map((c) => c.id));
    expect(g.player("p0").saidUno).toBe(true); // received a 1-card hand: not catchable
    expect(g.turnId).toBe("p1");
  });

  it("7 is a plain number when the switch is off", () => {
    const seven = num("red", 7);
    const g = new Game(arrange(game({}), { turn: "p0", top: num("red", 5), hands: { p0: [seven, num("blue", 1)] } }));
    expect(privateView(g.state, "p0").needsSwapTarget).toEqual([]);
    g.act("p0", { type: "play", cardId: seven.id });
    expect(g.hand("p0")).toHaveLength(1);
  });

  it("0 passes every hand one seat along the direction of play", () => {
    const zero = num("red", 0);
    const h0 = [num("blue", 1), num("blue", 2)];
    const h1 = [num("green", 1)];
    const h2 = [num("yellow", 1), num("yellow", 2), num("yellow", 3)];
    const g = new Game(arrange(game({ zeroRotate: true }), { turn: "p0", top: num("red", 5), hands: { p0: [zero, ...h0], p1: h1, p2: h2 } }));
    g.act("p0", { type: "play", cardId: zero.id });
    const ids = (cs: { id: string }[]) => cs.map((c) => c.id);
    expect(ids(g.hand("p1"))).toEqual(ids(h0));
    expect(ids(g.hand("p2"))).toEqual(ids(h1));
    expect(ids(g.hand("p0"))).toEqual(ids(h2));
  });

  it("0 rotates the other way after a reverse", () => {
    const zero = num("red", 0);
    const h0 = [num("blue", 1), num("blue", 2)];
    const h2 = [num("yellow", 1)];
    const g = new Game(arrange(game({ zeroRotate: true }), { turn: "p0", top: num("red", 5), hands: { p0: [zero, ...h0], p2: h2 }, direction: -1 }));
    g.act("p0", { type: "play", cardId: zero.id });
    expect(g.hand("p2").map((c) => c.id)).toEqual(h0.map((c) => c.id));
  });
});

describe("jump-in", () => {
  it("an identical card can be played out of turn and play continues from the jumper", () => {
    const top = num("red", 5);
    const same = num("red", 5);
    const g = new Game(arrange(game({ jumpIn: true }), { turn: "p0", top, hands: { p2: [same, num("blue", 1)] } }));
    expect(privateView(g.state, "p2").jumpIn).toEqual([same.id]);
    g.act("p2", { type: "jump_in", cardId: same.id });
    expect(g.turnId).toBe("p0");
    expect(g.top.id).toBe(same.id);
  });

  it("needs the exact color and symbol, and the switch", () => {
    const top = num("red", 5);
    const other = num("blue", 5);
    const off = new Game(arrange(game({}), { turn: "p0", top, hands: { p2: [num("red", 5), num("blue", 1)] } }));
    expect(() => off.act("p2", { type: "jump_in", cardId: off.hand("p2")[0].id })).toThrow(/off/);
    const g = new Game(arrange(game({ jumpIn: true }), { turn: "p0", top, hands: { p2: [other, num("blue", 1)] } }));
    expect(() => g.act("p2", { type: "jump_in", cardId: other.id })).toThrow(/exact same/);
  });
});

describe("drawing rules", () => {
  it("draw until playable keeps drawing", () => {
    const s = arrange(game({ drawUntilPlayable: true }), { turn: "p0", top: num("red", 5), hands: { p0: [num("blue", 1)] } });
    const target = num("red", 8);
    s.drawPile.push(target, num("green", 1), num("yellow", 2), num("blue", 3));
    const g = new Game(s);
    g.act("p0", { type: "draw" });
    expect(g.hand("p0")).toHaveLength(5);
    expect(g.state.turn).toEqual({ kind: "drawn", cardId: target.id });
  });

  it("must play the drawn card when the switch is on", () => {
    const s = arrange(game({ forcePlayDrawn: true }), { turn: "p0", top: num("red", 5), hands: { p0: [num("blue", 1)] } });
    const target = num("red", 8);
    s.drawPile.push(target);
    const g = new Game(s);
    g.act("p0", { type: "draw" });
    expect(() => g.act("p0", { type: "pass" })).toThrow(/must play/);
    g.act("p0", { type: "play", cardId: target.id });
    expect(g.turnId).toBe("p1");
  });
});

describe("extra cards", () => {
  it("Discard All throws away every card of that color", () => {
    const da = card("discard_all", "red");
    const g = new Game(
      arrange(game({ cards: { discardAll: true } }), {
        turn: "p0",
        top: num("red", 5),
        hands: { p0: [da, num("red", 1), num("red", 9), num("blue", 2)] },
      }),
    );
    g.act("p0", { type: "play", cardId: da.id });
    expect(g.hand("p0").map((c) => c.color)).toEqual(["blue"]);
    expect(g.top.id).toBe(da.id);
    expect(g.state.currentColor).toBe("red");
    expect(g.state.unoWindow?.playerId).toBe("p0");
  });

  it("Discard All can win the round", () => {
    const da = card("discard_all", "red");
    const g = new Game(arrange(game({ cards: { discardAll: true } }), { turn: "p0", top: num("red", 5), hands: { p0: [da, num("red", 1)] } }));
    g.act("p0", { type: "play", cardId: da.id });
    expect(g.state.phase).toBe("game_over");
  });

  it("Skip Everyone: the same player goes again", () => {
    const sa = card("skip_all", "red");
    const g = new Game(arrange(game({ cards: { skipAll: true } }, 5), { turn: "p2", top: num("red", 5), hands: { p2: [sa, num("red", 1)] } }));
    g.act("p2", { type: "play", cardId: sa.id });
    expect(g.turnId).toBe("p2");
    expect(g.events.find((e) => e.t === "skip")).toMatchObject({ pids: ["p0", "p1", "p3", "p4"] });
  });

  it("colored +4 matches by color and is not challengeable", () => {
    const d4 = card("draw4", "red");
    const g = new Game(arrange(game({ cards: { draw4Color: true } }), { turn: "p0", top: num("red", 5), hands: { p0: [d4, num("red", 1)], p1: [num("blue", 1)] } }));
    g.act("p0", { type: "play", cardId: d4.id });
    expect(g.hand("p1")).toHaveLength(5);
    expect(g.turnId).toBe("p2");
  });

  it("Color Roulette: the victim names a color and flips until it shows up", () => {
    const ro = card("wild_roulette");
    const s = arrange(game({ cards: { roulette: true } }), { turn: "p0", top: num("red", 5), hands: { p0: [ro, num("red", 1)], p1: [num("blue", 1)] } });
    s.drawPile.push(num("green", 4), card("wild"), num("red", 2), num("blue", 9));
    const g = new Game(s);
    expect(privateView(g.state, "p0").needsColor).toEqual([]);
    g.act("p0", { type: "play", cardId: ro.id });
    expect(g.turnId).toBe("p1");
    expect(privateView(g.state, "p1").mustChooseColor).toBe(true);
    g.act("p1", { type: "choose_color", color: "green" });
    expect(g.hand("p1")).toHaveLength(5);
    expect(g.state.currentColor).toBe("green");
    expect(g.turnId).toBe("p2");
  });

  it("extra cards never appear when their switch is off", () => {
    for (let seed = 1; seed < 20; seed++) {
      const s = startedGame({ players: 4, seed, settings: { cards: { wild6: true } } });
      const all = [...s.drawPile, ...s.discardPile, ...s.players.flatMap((p) => p.hand)];
      expect(all.some((c) => c.kind === "wild10" || c.kind === "discard_all")).toBe(false);
      expect(all.some((c) => c.kind === "wild6")).toBe(true);
    }
  });
});

describe("mercy rule", () => {
  it("a player reaching the limit is knocked out; their cards go back", () => {
    const d2 = card("draw2", "red");
    const big = Array.from({ length: 23 }, (_, i) => num("blue", i % 10));
    const s = arrange(game({ mercyRule: true, mercyLimit: 25 }), { turn: "p0", top: num("red", 5), hands: { p0: [d2, num("red", 1)], p1: big } });
    const g = new Game(s);
    const total = countCards(g.state);
    g.act("p0", { type: "play", cardId: d2.id });
    expect(g.player("p1").status).toBe("out");
    expect(g.hand("p1")).toHaveLength(0);
    expect(g.turnId).toBe("p2");
    expect(countCards(g.state)).toBe(total);
  });

  it("last player standing wins", () => {
    const d2 = card("draw2", "red");
    const big = Array.from({ length: 24 }, (_, i) => num("blue", i % 10));
    const s = arrange(game({ mercyRule: true }, 2), { turn: "p0", top: num("red", 5), hands: { p0: [d2, num("red", 1)], p1: big } });
    const g = new Game(s);
    g.act("p0", { type: "play", cardId: d2.id });
    expect(g.state.phase).toBe("game_over");
    expect(g.state.gameWinnerId).toBe("p0");
  });

  it("is off by default: big hands are fine", () => {
    const d2 = card("draw2", "red");
    const big = Array.from({ length: 30 }, (_, i) => num("blue", i % 10));
    const g = new Game(arrange(game({}), { turn: "p0", top: num("red", 5), hands: { p0: [d2, num("red", 1)], p1: big } }));
    g.act("p0", { type: "play", cardId: d2.id });
    expect(g.player("p1").status).toBe("active");
  });
});

describe("rule switches", () => {
  it("each switch shows up on its own in the rules chip and reset returns to classic", () => {
    expect(activeExtras(CLASSIC_SETTINGS)).toEqual([]);
    const s = mergeSettings(CLASSIC_SETTINGS, { stacking: "mixed", sevenSwap: true, cards: { wildReverse4: true }, handSize: 9 });
    expect(activeExtras(s)).toEqual(["Stacking +2/+4", "7 swaps hands", "Reverse +4"]);
    const r = resetToClassic(s);
    expect(activeExtras(r)).toEqual([]);
    expect(r.handSize).toBe(9);
  });
});
