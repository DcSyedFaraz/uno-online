import { applyAction } from "../reducer";
import { CLASSIC_SETTINGS, mergeSettings, type RuleSettings } from "../rules";
import { mulberry32 } from "../rng";
import { createGame, newPlayer } from "../state";
import type { Action, Card, CardKind, Color, GameEvent, GameState } from "../types";

let uid = 10_000;

export function card(kind: CardKind, color: Color | null = null, value?: number): Card {
  return { id: `t${uid++}`, kind, color, ...(kind === "number" ? { value } : {}) };
}
export const num = (color: Color, value: number) => card("number", color, value);

export interface Setup {
  players?: number;
  settings?: Partial<Omit<RuleSettings, "cards">> & { cards?: Partial<RuleSettings["cards"]> };
  seed?: number;
}

/** A started game with `players` humans p0..pN-1 (seeded, deterministic). */
export function startedGame({ players = 3, settings = {}, seed = 1 }: Setup = {}): GameState {
  let state = createGame({ id: "p0", name: "P0", avatar: "🙂" }, mergeSettings(CLASSIC_SETTINGS, settings));
  for (let i = 1; i < players; i++) state.players.push(newPlayer({ id: `p${i}`, name: `P${i}`, avatar: "🙂" }));
  state = applyAction(state, { type: "start" }, "p0", 0, mulberry32(seed)).state;
  return state;
}

/**
 * Puts the game in a known position: it's `turn`'s move, the top card is `top`,
 * and the given hands replace the dealt ones. Cards removed this way are put
 * back into the draw pile so the card count stays constant.
 */
export function arrange(
  state: GameState,
  opts: { turn: string; top: Card; color?: Color | null; hands: Record<string, Card[]>; direction?: 1 | -1 },
): GameState {
  const s = structuredClone(state);
  for (const p of s.players) {
    if (opts.hands[p.id]) {
      s.drawPile.unshift(...p.hand);
      p.hand = opts.hands[p.id];
    }
    p.saidUno = false;
  }
  s.drawPile.unshift(...s.discardPile);
  s.discardPile = [opts.top];
  s.currentColor = opts.color !== undefined ? opts.color : opts.top.color;
  s.turnIndex = s.players.findIndex((p) => p.id === opts.turn);
  s.turn = { kind: "play" };
  s.drawStack = 0;
  s.stackTopValue = 0;
  s.unoWindow = null;
  s.direction = opts.direction ?? 1;
  s.totalCards = s.drawPile.length + s.discardPile.length + s.players.reduce((n, p) => n + p.hand.length, 0);
  return s;
}

export class Game {
  events: GameEvent[] = [];
  now = 1_000_000;
  rng = mulberry32(42);
  constructor(public state: GameState) {}

  act(actor: string, action: Action, advanceMs = 0) {
    this.now += advanceMs;
    const res = applyAction(this.state, action, actor, this.now, this.rng);
    this.state = res.state;
    this.events = res.events;
    return this;
  }
  hand(id: string) {
    return this.state.players.find((p) => p.id === id)!.hand;
  }
  player(id: string) {
    return this.state.players.find((p) => p.id === id)!;
  }
  get turnId() {
    return this.state.players[this.state.turnIndex].id;
  }
  get top() {
    return this.state.discardPile[this.state.discardPile.length - 1];
  }
}
