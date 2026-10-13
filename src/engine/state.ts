import { CLASSIC_SETTINGS, type RuleSettings } from "./rules";
import { shuffle } from "./rng";
import type { Card, Ctx, DrawReason, GameState, PlayerState, TurnState } from "./types";

export const MAX_PLAYERS = 10;
export const MIN_PLAYERS = 2;

export interface PlayerInfo {
  id: string;
  name: string;
  avatar: string;
}

export function newPlayer(info: PlayerInfo, isBot = false): PlayerState {
  return {
    id: info.id,
    name: info.name,
    avatar: info.avatar,
    isBot,
    hand: [],
    score: 0,
    saidUno: false,
    status: "active",
    afkStrikes: 0,
    autopilot: false,
  };
}

export function createGame(host: PlayerInfo, settings: RuleSettings = CLASSIC_SETTINGS): GameState {
  return {
    phase: "lobby",
    round: 0,
    hostId: host.id,
    settings: structuredClone(settings),
    players: [newPlayer(host)],
    drawPile: [],
    discardPile: [],
    currentColor: null,
    direction: 1,
    turnIndex: 0,
    dealerIndex: -1,
    turn: { kind: "play" },
    drawStack: 0,
    stackTopValue: 0,
    unoWindow: null,
    deadline: null,
    turnStartedAt: 0,
    totalCards: 0,
    nextCardId: 0,
    lastRound: null,
    gameWinnerId: null,
  };
}

export function findPlayer(state: GameState, id: string): PlayerState | undefined {
  return state.players.find((p) => p.id === id);
}

export function playerIndex(state: GameState, id: string): number {
  return state.players.findIndex((p) => p.id === id);
}

export function isActive(p: PlayerState): boolean {
  return p.status === "active";
}

export function activePlayers(state: GameState): PlayerState[] {
  return state.players.filter(isActive);
}

export function currentPlayer(state: GameState): PlayerState {
  return state.players[state.turnIndex];
}

export function topCard(state: GameState): Card {
  return state.discardPile[state.discardPile.length - 1];
}

/** Index of the active player `steps` seats away from `from` in the current direction. */
export function nextActiveIndex(state: GameState, from: number, steps = 1): number {
  const n = state.players.length;
  if (activePlayers(state).length === 0) return from;
  let idx = from;
  let moved = 0;
  while (moved < steps) {
    idx = (((idx + state.direction) % n) + n) % n;
    if (isActive(state.players[idx])) moved++;
  }
  return idx;
}

export function nextActivePlayer(state: GameState, from = state.turnIndex): PlayerState {
  return state.players[nextActiveIndex(state, from, 1)];
}

/** Moves the discard pile (except the top card) back into the draw pile. */
export function reshuffle(ctx: Ctx): boolean {
  const { state } = ctx;
  if (state.discardPile.length <= 1) return false;
  const top = state.discardPile.pop()!;
  const rest = state.discardPile;
  state.discardPile = [top];
  state.drawPile = shuffle([...rest, ...state.drawPile], ctx.rng);
  ctx.events.push({ t: "reshuffle", count: state.drawPile.length });
  return true;
}

/** Takes one card off the draw pile, reshuffling if needed. Returns null when no cards are left anywhere. */
export function takeFromPile(ctx: Ctx): Card | null {
  const { state } = ctx;
  if (state.drawPile.length === 0 && !reshuffle(ctx)) return null;
  return state.drawPile.pop() ?? null;
}

/** Draws up to `n` cards into the player's hand (fewer if the piles run out). */
export function drawCards(ctx: Ctx, player: PlayerState, n: number, reason: DrawReason): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < n; i++) {
    const c = takeFromPile(ctx);
    if (!c) break;
    drawn.push(c);
  }
  player.hand.push(...drawn);
  if (drawn.length > 0) {
    player.saidUno = false;
    if (ctx.state.unoWindow?.playerId === player.id) ctx.state.unoWindow = null;
    ctx.events.push({ t: "draw", pid: player.id, count: drawn.length, reason, cards: drawn });
  }
  return drawn;
}

/** Sets the turn to the given seat and schedules its deadline. */
export function setTurn(ctx: Ctx, index: number, turn: TurnState = { kind: "play" }) {
  const { state } = ctx;
  state.turnIndex = index;
  state.turn = turn;
  state.turnStartedAt = ctx.now;
  scheduleDeadline(ctx);
}

export function advanceTurn(ctx: Ctx, steps = 1, turn: TurnState = { kind: "play" }) {
  setTurn(ctx, nextActiveIndex(ctx.state, ctx.state.turnIndex, steps), turn);
}

export const BOT_DELAY_MIN = 900;
export const BOT_DELAY_SPREAD = 900;

/** Bots/autopilot move after a short human-like delay; humans get the turn timer (if any). */
export function scheduleDeadline(ctx: Ctx) {
  const { state } = ctx;
  if (state.phase !== "playing") {
    state.deadline = null;
    return;
  }
  const p = currentPlayer(state);
  if (p.isBot || p.autopilot) {
    state.deadline = ctx.now + BOT_DELAY_MIN + Math.floor(ctx.rng() * BOT_DELAY_SPREAD);
  } else if (state.settings.turnTimerSec > 0) {
    state.deadline = ctx.now + state.settings.turnTimerSec * 1000;
  } else {
    state.deadline = null;
  }
}

export function countCards(state: GameState): number {
  return state.drawPile.length + state.discardPile.length + state.players.reduce((s, p) => s + p.hand.length, 0);
}
