import { buildDeck } from "./deck";
import { RuleError } from "./errors";
import { shuffle } from "./rng";
import { handPoints } from "./scoring";
import { activePlayers, nextActiveIndex, playerIndex, setTurn } from "./state";
import { teamKey, teamOf } from "./teams";
import { COLORS, type Card, type Ctx, type GameState, type PlayerState } from "./types";

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
  // before any setTurn, so the first deadline already knows about the clock
  state.roundEndsAt = state.settings.roundTimerMin > 0 ? ctx.now + state.settings.roundTimerMin * 60_000 : null;
  state.dealerIndex = state.dealerIndex < 0 ? Math.floor(ctx.rng() * n) : (state.dealerIndex + 1) % n;

  // Deal
  const counts: Record<string, number> = {};
  for (let i = 0; i < state.settings.handSize; i++) {
    for (const p of state.players) p.hand.push(state.drawPile.pop()!);
  }
  dealDiscardAll(ctx);
  for (const p of state.players) counts[p.id] = p.hand.length;
  ctx.events.push({ t: "deal", counts });

  // Flip the starting card: always a number card. An action or wild card goes back in at
  // random and the next number card from the top is used instead.
  let start: Card = state.drawPile.pop()!;
  if (start.kind !== "number") {
    state.drawPile.splice(Math.floor(ctx.rng() * (state.drawPile.length + 1)), 0, start);
    let i = state.drawPile.length - 1;
    while (state.drawPile[i].kind !== "number") i--;
    start = state.drawPile.splice(i, 1)[0];
  }
  state.discardPile.push(start);
  state.currentColor = start.color;
  ctx.events.push({ t: "start_card", card: start });
  setTurn(ctx, nextActiveIndex(state, state.dealerIndex, 1));
}

/**
 * With Discard All on, everyone starts with at least one: a player dealt none swaps a random
 * card of theirs for one from the draw pile. If the deck has run out of them (decks forced
 * down at a big table) a new one is added to the round, so nobody goes without.
 */
function dealDiscardAll(ctx: Ctx) {
  const { state } = ctx;
  if (!state.settings.cards.discardAll) return;
  const n = state.players.length;
  for (let k = 1; k <= n; k++) {
    const p = state.players[(state.dealerIndex + k) % n];
    if (p.hand.some((c) => c.kind === "discard_all")) continue;
    const spare = state.drawPile.flatMap((c, i) => (c.kind === "discard_all" ? [i] : []));
    let card: Card;
    if (spare.length > 0) [card] = state.drawPile.splice(spare[Math.floor(ctx.rng() * spare.length)], 1);
    else {
      card = { id: `c${state.nextCardId++}`, kind: "discard_all", color: COLORS[Math.floor(ctx.rng() * COLORS.length)] };
      state.totalCards += 1;
    }
    const slot = Math.floor(ctx.rng() * p.hand.length);
    const out = p.hand[slot];
    p.hand[slot] = card;
    state.drawPile.splice(Math.floor(ctx.rng() * (state.drawPile.length + 1)), 0, out);
  }
}

/** Ends the round with `winner` (or nobody) and scores it. In team play the winner's partner wins too. */
export function endRound(ctx: Ctx, winner: PlayerState | null, timeUp = false) {
  const { state } = ctx;
  const winners = winner ? teamOf(state, winner) : [];
  const hands: Record<string, Card[]> = {};
  let points = 0;
  for (const p of state.players) {
    hands[p.id] = [...p.hand];
    if (!winners.includes(p)) points += handPoints(p.hand);
  }
  state.lastRound = { round: state.round, winnerId: winner?.id ?? null, points, hands, ...(timeUp ? { timeUp } : {}) };
  state.unoWindow = null;
  state.deadline = null;
  state.roundEndsAt = null;
  state.drawStack = 0;
  state.turnStartedAt = ctx.now;
  ctx.events.push({ t: "round_over", winnerId: winner?.id ?? null, points, ...(timeUp ? { timeUp } : {}) });

  if (state.settings.winMode === "points" && winner) {
    // partners share one score
    for (const p of winners) p.score += points;
    if (winner.score < state.settings.targetPoints) {
      state.phase = "round_over";
      return;
    }
  }
  state.phase = "game_over";
  state.gameWinnerId = winner?.id ?? null;
  ctx.events.push({ t: "game_over", winnerId: state.gameWinnerId });
}

/** Whether the round clock has run out (same 50 ms slack as turn deadlines). */
export function timeUp(state: GameState, now: number): boolean {
  return state.phase === "playing" && state.roundEndsAt != null && now >= state.roundEndsAt - 50;
}

/**
 * The round clock ran out: the team (or, without teams, the player) holding the fewest card
 * points wins. Ties go to fewer cards, then to whoever plays soonest (from the current player).
 */
export function endRoundOnTime(ctx: Ctx) {
  const { state } = ctx;
  const n = state.players.length;
  const teams = new Map<string, { points: number; cards: number; order: number; best: PlayerState }>();
  for (let i = 0; i < n; i++) {
    const p = state.players[(((state.turnIndex + i * state.direction) % n) + n) % n];
    if (p.status !== "active") continue;
    const key = teamKey(state, p);
    const t = teams.get(key) ?? { points: 0, cards: 0, order: i, best: p };
    t.points += handPoints(p.hand);
    t.cards += p.hand.length;
    if (handPoints(p.hand) < handPoints(t.best.hand)) t.best = p;
    teams.set(key, t);
  }
  let win: { points: number; cards: number; order: number; best: PlayerState } | null = null;
  for (const t of teams.values()) {
    if (!win || t.points < win.points || (t.points === win.points && (t.cards < win.cards || (t.cards === win.cards && t.order < win.order)))) win = t;
  }
  ctx.events.push({ t: "time_up" });
  endRound(ctx, win?.best ?? null, true);
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
  // over when one player (or, in team play, one team) is left standing
  if (active.length <= 1 || new Set(active.map((p) => teamKey(state, p))).size <= 1) {
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
