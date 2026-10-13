import { buildDeck } from "./deck";
import { RuleError } from "./errors";
import { shuffle } from "./rng";
import { handPoints } from "./scoring";
import { activePlayers, drawCards, nextActiveIndex, playerIndex, setTurn } from "./state";
import type { Card, CardKind, Ctx, PlayerState } from "./types";

/** Cards that can't be the starting card: they go back into the deck and a new one is flipped. */
const BAD_START: ReadonlySet<CardKind> = new Set([
  "wild4",
  "wild_reverse4",
  "wild6",
  "wild10",
  "wild_roulette",
  "draw4",
  "skip_all",
  "discard_all",
]);

export function startRound(ctx: Ctx) {
  const { state } = ctx;
  state.players = state.players.filter((p) => p.status !== "left");
  for (const p of state.players) {
    p.hand = [];
    p.status = "active";
    p.saidUno = false;
    p.afkStrikes = 0;
    p.autopilot = false;
  }
  const n = state.players.length;
  if (n < 2) throw new RuleError("You need at least 2 players to start");

  const deck = buildDeck(state.settings, n, state.nextCardId);
  state.nextCardId += deck.length;
  state.totalCards = deck.length;
  state.drawPile = shuffle(deck, ctx.rng);
  state.discardPile = [];
  state.direction = 1;
  state.drawStack = 0;
  state.stackTopValue = 0;
  state.currentColor = null;
  state.unoWindow = null;
  state.lastRound = null;
  state.round += 1;
  state.phase = "playing";
  state.dealerIndex = state.dealerIndex < 0 ? Math.floor(ctx.rng() * n) : (state.dealerIndex + 1) % n;

  // Deal
  const counts: Record<string, number> = {};
  for (let i = 0; i < state.settings.handSize; i++) {
    for (const p of state.players) p.hand.push(state.drawPile.pop()!);
  }
  for (const p of state.players) counts[p.id] = p.hand.length;
  ctx.events.push({ t: "deal", counts });

  // Flip the starting card
  let start: Card = state.drawPile.pop()!;
  for (let guard = 0; BAD_START.has(start.kind) && guard < 500; guard++) {
    state.drawPile.unshift(start);
    shuffle(state.drawPile, ctx.rng);
    start = state.drawPile.pop()!;
  }
  state.discardPile.push(start);
  state.currentColor = start.color;
  ctx.events.push({ t: "start_card", card: start });

  const dealer = state.dealerIndex;
  const first = nextActiveIndex(state, dealer, 1);
  switch (start.kind) {
    case "wild":
      setTurn(ctx, first, { kind: "choose_color", purpose: "start" });
      break;
    case "draw2": {
      const victim = state.players[first];
      drawCards(ctx, victim, 2, "penalty");
      ctx.events.push({ t: "skip", pids: [victim.id] });
      setTurn(ctx, nextActiveIndex(state, first, 1));
      break;
    }
    case "skip":
      ctx.events.push({ t: "skip", pids: [state.players[first].id] });
      setTurn(ctx, nextActiveIndex(state, first, 1));
      break;
    case "reverse":
      state.direction = -1;
      ctx.events.push({ t: "reverse", direction: -1 });
      setTurn(ctx, dealer);
      break;
    default:
      setTurn(ctx, first);
  }
}

/** Ends the round with `winner` (or nobody) and scores it. */
export function endRound(ctx: Ctx, winner: PlayerState | null) {
  const { state } = ctx;
  const hands: Record<string, Card[]> = {};
  let points = 0;
  for (const p of state.players) {
    hands[p.id] = [...p.hand];
    if (p !== winner) points += handPoints(p.hand);
  }
  state.lastRound = { round: state.round, winnerId: winner?.id ?? null, points, hands };
  state.unoWindow = null;
  state.deadline = null;
  state.drawStack = 0;
  state.turnStartedAt = ctx.now;
  ctx.events.push({ t: "round_over", winnerId: winner?.id ?? null, points });

  if (state.settings.winMode === "points" && winner) {
    winner.score += points;
    if (winner.score < state.settings.targetPoints) {
      state.phase = "round_over";
      return;
    }
  }
  state.phase = "game_over";
  state.gameWinnerId = winner?.id ?? null;
  ctx.events.push({ t: "game_over", winnerId: state.gameWinnerId });
}

/** Removes a player from the round; their cards go to the bottom of the draw pile. */
export function eliminate(ctx: Ctx, player: PlayerState, status: "out" | "left") {
  const { state } = ctx;
  if (player.status !== "active") {
    player.status = status === "left" ? "left" : player.status;
    return;
  }
  state.drawPile.unshift(...player.hand);
  player.hand = [];
  player.status = status;
  player.saidUno = false;
  if (state.unoWindow?.playerId === player.id) state.unoWindow = null;
  ctx.events.push(status === "out" ? { t: "eliminated", pid: player.id } : { t: "player_left", pid: player.id });
}

/** Mercy rule: a player reaching the card limit is knocked out of the round. */
export function checkMercy(ctx: Ctx, player: PlayerState): boolean {
  const s = ctx.state.settings;
  if (!s.mercyRule || player.status !== "active" || player.hand.length < s.mercyLimit) return false;
  eliminate(ctx, player, "out");
  return true;
}

/**
 * After anything that can remove players: end the round if only one is left,
 * and move the turn on if the current player is no longer in the round.
 * Returns true if the round ended.
 */
export function settle(ctx: Ctx): boolean {
  const { state } = ctx;
  if (state.phase !== "playing") return true;
  const active = activePlayers(state);
  if (active.length <= 1) {
    endRound(ctx, active[0] ?? null);
    return true;
  }
  const cur = state.players[state.turnIndex];
  if (!cur || cur.status !== "active") {
    state.drawStack = 0;
    state.stackTopValue = 0;
    setTurn(ctx, nextActiveIndex(state, state.turnIndex, 1));
  }
  return false;
}

export function seatOf(ctx: Ctx, player: PlayerState): number {
  return playerIndex(ctx.state, player.id);
}
