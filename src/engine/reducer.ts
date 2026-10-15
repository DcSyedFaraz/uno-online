import { ZodError } from "zod";
import { drawValue, isWild } from "./cards";
import { BOT_AVATARS, BOT_NAMES, botColor, completePlay, decideBot } from "./bots";
import { discardMatching, EFFECTS, takePenalty } from "./effects";
import { assertRule, RuleError } from "./errors";
import { jumpInBlocker, matchesForPlayer, needsColor, needsSwapTarget, playBlocker } from "./legal";
import { checkMercy, eliminate, endRound, endRoundOnTime, settle, startRound, timeUp } from "./round";
import { mergeSettings } from "./rules";
import { pick } from "./rng";
import {
  MAX_PLAYERS,
  advanceTurn,
  currentPlayer,
  drawCards,
  findPlayer,
  newPlayer,
  nextActiveIndex,
  playerIndex,
  scheduleDeadline,
  setTurn,
  takeFromPile,
} from "./state";
import { callUno, catchUno, expireUnoWindow } from "./uno";
import { COLORS, type Action, type Card, type Color, type Ctx, type GameEvent, type GameState, type PlayerState } from "./types";

/** Moves inside a round; once the round clock has run out these are dropped instead of applied. */
const IN_ROUND_ACTIONS: ReadonlySet<Action["type"]> = new Set([
  "play",
  "jump_in",
  "draw",
  "pass",
  "take_penalty",
  "challenge",
  "choose_color",
  "call_uno",
  "catch_uno",
  "timeout",
]);

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

/**
 * The single entry point for changing a room. Pure: the input state is never mutated.
 * Throws RuleError for illegal moves.
 */
export function applyAction(prev: GameState, action: Action, actorId: string, now: number, rng: () => number): ApplyResult {
  const state = structuredClone(prev);
  const ctx: Ctx = { state, now, rng, events: [] };
  dispatch(ctx, action, actorId);
  return { state, events: ctx.events };
}

function dispatch(ctx: Ctx, action: Action, actorId: string) {
  const { state } = ctx;
  expireUnoWindow(state, ctx.now);
  if (timeUp(state, ctx.now)) {
    endRoundOnTime(ctx);
    if (IN_ROUND_ACTIONS.has(action.type)) return;
  }
  switch (action.type) {
    case "join":
      return join(ctx, actorId, action.name, action.avatar);
    case "timeout":
      return onTimeout(ctx);
  }

  const actor = findPlayer(state, actorId);
  assertRule(actor, "You're not in this room");

  switch (action.type) {
    case "update_settings":
      requireHost(state, actor);
      assertRule(state.phase === "lobby" || state.phase === "game_over", "Rules can only be changed before the game starts");
      try {
        state.settings = mergeSettings(state.settings, action.settings);
      } catch (e) {
        if (e instanceof ZodError) throw new RuleError("Invalid settings");
        throw e;
      }
      ctx.events.push({ t: "settings" });
      return;
    case "add_bot":
      return addBot(ctx, actor);
    case "remove_bot": {
      requireHost(state, actor);
      requireNotPlaying(state);
      const bot = findPlayer(state, action.playerId);
      assertRule(bot?.isBot, "That's not a bot");
      state.players = state.players.filter((p) => p.id !== bot.id);
      ctx.events.push({ t: "player_left", pid: bot.id });
      return;
    }
    case "kick": {
      requireHost(state, actor);
      assertRule(action.playerId !== actor.id, "You can't kick yourself");
      const target = findPlayer(state, action.playerId);
      assertRule(target, "Player not found");
      return removePlayer(ctx, target);
    }
    case "leave":
      return removePlayer(ctx, actor);
    case "close_room":
      requireHost(state, actor);
      ctx.events.push({ t: "room_closed" });
      return;
    case "transfer_host": {
      requireHost(state, actor);
      const target = findPlayer(state, action.playerId);
      assertRule(target && !target.isBot && target.status !== "left", "Pick a human player");
      state.hostId = target.id;
      ctx.events.push({ t: "host_changed", pid: target.id });
      return;
    }
    case "start":
      requireHost(state, actor);
      assertRule(state.phase === "lobby" || state.phase === "game_over", "The game has already started");
      state.players = state.players.filter((p) => !p.takenOver);
      for (const p of state.players) p.score = 0;
      state.round = 0;
      state.dealerIndex = -1;
      state.gameWinnerId = null;
      return startRound(ctx);
    case "next_round":
      assertRule(state.phase === "round_over", "The round isn't over");
      assertRule(actor.id === state.hostId || ctx.now - state.turnStartedAt > 15000, "Waiting for the host to start the next round");
      return startRound(ctx);
    case "back_to_lobby":
      requireHost(state, actor);
      assertRule(state.phase === "round_over" || state.phase === "game_over", "Finish the round first");
      return backToLobby(ctx);
  }

  // ── in-game actions ──
  if (!actor.isBot) markHumanActivity(ctx, actor);
  gameAction(ctx, actor, action);
}

/** Moves inside a round. Shared by humans, bots and autopilot. */
function gameAction(ctx: Ctx, actor: PlayerState, action: Action) {
  const { state } = ctx;
  assertRule(state.phase === "playing", "The round isn't in progress");
  assertRule(actor.status === "active", "You're out of this round");

  switch (action.type) {
    case "call_uno":
      return callUno(ctx, actor);
    case "catch_uno":
      catchUno(ctx, actor, action.targetId);
      settle(ctx);
      return;
    case "play":
      return play(ctx, actor, action, false);
    case "jump_in":
      return play(ctx, actor, action, true);
  }

  requireTurn(state, actor);
  const turn = state.turn;
  switch (action.type) {
    case "draw":
      assertRule(turn.kind === "play", turn.kind === "stack" ? `Stack a draw card or take +${state.drawStack}` : "You can't draw right now");
      return draw(ctx, actor);
    case "pass":
      assertRule(turn.kind === "drawn", "You can only pass after drawing a playable card");
      assertRule(!state.settings.forcePlayDrawn, "You must play the card you drew");
      return advanceTurn(ctx, 1);
    case "take_penalty":
      assertRule(turn.kind === "stack", "There's no penalty to take");
      return takePenalty(ctx, actor);
    case "challenge": {
      assertRule(turn.kind === "stack" && turn.challenge, "There's nothing to challenge");
      const offender = findPlayer(state, turn.challenge.offenderId);
      const guilty = turn.challenge.offenderHadMatch;
      const amount = state.drawStack;
      state.drawStack = 0;
      state.stackTopValue = 0;
      ctx.events.push({ t: "challenge", offender: turn.challenge.offenderId, victim: actor.id, guilty });
      if (guilty || offender?.status !== "active") {
        // guilty: the offender draws instead and the challenger plays normally
        if (guilty && offender?.status === "active") {
          drawCards(ctx, offender, amount, "challenge");
          checkMercy(ctx, offender);
        }
        setTurn(ctx, state.turnIndex);
      } else {
        drawCards(ctx, actor, amount + 2, "challenge");
        checkMercy(ctx, actor);
        advanceTurn(ctx, 1);
      }
      settle(ctx);
      return;
    }
    case "choose_color":
      assertRule(turn.kind === "choose_color", "You don't need to pick a color now");
      assertRule(COLORS.includes(action.color), "Pick a valid color");
      if (turn.purpose === "start") {
        state.currentColor = action.color;
        ctx.events.push({ t: "color", pid: actor.id, color: action.color });
        setTurn(ctx, state.turnIndex);
      } else {
        roulette(ctx, actor, action.color);
      }
      return;
  }
  throw new RuleError("Unknown action");
}

function play(ctx: Ctx, player: PlayerState, a: { cardId: string; color?: Color; swapTargetId?: string }, jumpIn: boolean) {
  const { state } = ctx;
  const card = player.hand.find((c) => c.id === a.cardId);
  assertRule(card, "You don't have that card");
  const blocker = jumpIn ? jumpInBlocker(state, player, card) : playBlocker(state, player, card);
  if (blocker) throw new RuleError(blocker);
  if (needsColor(card)) assertRule(a.color && COLORS.includes(a.color), "Pick a color for your wild card");
  if (needsSwapTarget(state, player, card)) {
    const t = a.swapTargetId ? findPlayer(state, a.swapTargetId) : undefined;
    assertRule(t && t.id !== player.id && t.status === "active", "Pick another player to swap hands with");
  }

  if (jumpIn) {
    state.turnIndex = playerIndex(state, player.id);
    state.turn = { kind: "play" };
  }

  const prevColor = state.currentColor;
  const hadMatch = player.hand.some((c) => c.id !== card.id && c.color !== null && c.color === prevColor);
  player.hand = player.hand.filter((c) => c.id !== card.id);
  state.discardPile.push(card);
  ctx.events.push({ t: "play", pid: player.id, card, jumpIn: jumpIn || undefined });

  if (needsColor(card)) {
    state.currentColor = a.color!;
    ctx.events.push({ t: "color", pid: player.id, color: a.color! });
  } else if (!isWild(card)) {
    state.currentColor = card.color;
  }
  if (card.kind === "discard_all") discardMatching(ctx, player, card);

  if (player.hand.length === 0) {
    finishWithLastCard(ctx, player, card);
    return;
  }
  if (player.hand.length === 1) {
    if (!player.saidUno) state.unoWindow = { playerId: player.id, openedAt: ctx.now };
  } else {
    player.saidUno = false;
  }

  EFFECTS[card.kind](ctx, player, card, { color: a.color, swapTargetId: a.swapTargetId, hadMatch });
  settle(ctx);
}

/** Going out on a draw card still makes the next player draw (it counts for scoring). */
function finishWithLastCard(ctx: Ctx, player: PlayerState, card: Card) {
  const { state } = ctx;
  const value = drawValue(card);
  if (value > 0) {
    if (card.kind === "wild_reverse4") state.direction = state.direction === 1 ? -1 : 1;
    const victim = state.players[nextActiveIndex(state, playerIndex(state, player.id), 1)];
    if (victim && victim !== player) drawCards(ctx, victim, state.drawStack + value, "penalty");
  }
  endRound(ctx, player);
}

function draw(ctx: Ctx, player: PlayerState) {
  const { state } = ctx;
  const drawn: Card[] = [];
  let playable: Card | null = null;
  const max = state.settings.drawUntilPlayable ? Infinity : 1;
  while (drawn.length < max) {
    const c = takeFromPile(ctx);
    if (!c) break;
    player.hand.push(c);
    drawn.push(c);
    if (matchesForPlayer(state, player, c)) {
      playable = c;
      break;
    }
  }
  if (drawn.length > 0) {
    player.saidUno = false;
    if (state.unoWindow?.playerId === player.id) state.unoWindow = null;
    ctx.events.push({ t: "draw", pid: player.id, count: drawn.length, reason: "draw", cards: drawn });
  }
  if (checkMercy(ctx, player)) {
    settle(ctx);
    return;
  }
  if (playable) setTurn(ctx, state.turnIndex, { kind: "drawn", cardId: playable.id });
  else advanceTurn(ctx, 1);
}

/** Wild Color Roulette: flip cards until the named color shows up; the victim keeps them all and is skipped. */
function roulette(ctx: Ctx, victim: PlayerState, color: Color) {
  const { state } = ctx;
  const flipped: Card[] = [];
  for (;;) {
    const c = takeFromPile(ctx);
    if (!c) break;
    flipped.push(c);
    if (c.color === color) break;
  }
  victim.hand.push(...flipped);
  victim.saidUno = false;
  state.currentColor = color;
  ctx.events.push({ t: "roulette", pid: victim.id, color, cards: flipped });
  ctx.events.push({ t: "color", pid: victim.id, color });
  checkMercy(ctx, victim);
  advanceTurn(ctx, 1);
  settle(ctx);
}

/** Deadline passed: bots/autopilot make their move, AFK humans get the minimal default. */
function onTimeout(ctx: Ctx) {
  const { state } = ctx;
  assertRule(state.phase === "playing" && state.deadline !== null, "Nothing to time out");
  assertRule(ctx.now >= state.deadline - 50, "Not yet");
  const p = currentPlayer(state);

  if (!p.isBot && !p.autopilot) {
    p.afkStrikes += 1;
    ctx.events.push({ t: "timeout", pid: p.id });
    if (state.settings.afkAutopilot && p.afkStrikes >= state.settings.afkThreshold) p.autopilot = true;
  }
  if (p.isBot || p.autopilot) {
    runBot(ctx, p);
    return;
  }

  const turn = state.turn;
  if (turn.kind === "play") {
    draw(ctx, p);
    if (state.phase === "playing" && currentPlayer(state) === p && state.turn.kind === "drawn") resolveDrawnOnTimeout(ctx, p);
  } else if (turn.kind === "drawn") {
    resolveDrawnOnTimeout(ctx, p);
  } else if (turn.kind === "stack") {
    gameAction(ctx, p, { type: "take_penalty" });
  } else {
    gameAction(ctx, p, { type: "choose_color", color: botColor(p.hand, ctx.rng) });
  }
}

function resolveDrawnOnTimeout(ctx: Ctx, p: PlayerState) {
  const turn = ctx.state.turn;
  if (turn.kind !== "drawn") return;
  if (ctx.state.settings.forcePlayDrawn) {
    const card = p.hand.find((c) => c.id === turn.cardId)!;
    gameAction(ctx, p, completePlay(ctx.state, p, card, ctx.rng));
  } else {
    advanceTurn(ctx, 1);
  }
}

/** Test hook: rethrow bot mistakes instead of falling back to a safe move. */
export const engineDebug = { strictBots: false };

function runBot(ctx: Ctx, p: PlayerState) {
  const { state } = ctx;
  for (let step = 0; step < 3; step++) {
    const acts = decideBot(state, p.id, ctx.now, ctx.rng);
    if (acts.length === 0) break;
    for (const a of acts) {
      if (state.phase !== "playing") return;
      try {
        gameAction(ctx, p, a);
      } catch (e) {
        if (engineDebug.strictBots || !(e instanceof RuleError)) throw e;
        safeMove(ctx, p);
        return;
      }
    }
    // a bot that just drew a playable card decides on it straight away
    if (!(state.phase === "playing" && currentPlayer(state) === p && state.turn.kind === "drawn")) break;
  }
}

/** Last-resort move so a bot can never stall the game. */
function safeMove(ctx: Ctx, p: PlayerState) {
  const { state } = ctx;
  if (state.phase !== "playing" || currentPlayer(state) !== p) return;
  const turn = state.turn;
  if (turn.kind === "play") draw(ctx, p);
  else if (turn.kind === "stack") gameAction(ctx, p, { type: "take_penalty" });
  else if (turn.kind === "choose_color") gameAction(ctx, p, { type: "choose_color", color: botColor(p.hand, ctx.rng) });
  if (state.phase === "playing" && currentPlayer(state) === p && state.turn.kind === "drawn") advanceTurn(ctx, 1);
}

function join(ctx: Ctx, id: string, name: string, avatar: string) {
  const { state } = ctx;
  const existing = findPlayer(state, id);
  if (existing) {
    if (existing.takenOver) {
      // back from a leave: take the seat (and hand) back from the bot
      existing.takenOver = false;
      existing.isBot = false;
      existing.autopilot = false;
      existing.afkStrikes = 0;
      if (state.phase === "playing" && currentPlayer(state) === existing) scheduleDeadline(ctx);
    }
    if (existing.status === "left") {
      assertRule(state.phase !== "playing", "You left this round — you can rejoin when it ends");
      existing.status = "active";
      existing.hand = [];
    }
    if (state.phase !== "playing") {
      existing.name = name;
      existing.avatar = avatar;
    }
    return;
  }
  assertRule(state.phase !== "playing", "A round is in progress — you can join when it ends");
  assertRule(state.players.filter((p) => p.status !== "left").length < MAX_PLAYERS, "This room is full");
  state.players.push(newPlayer({ id, name, avatar }));
  ctx.events.push({ t: "player_joined", pid: id });
}

function addBot(ctx: Ctx, actor: PlayerState) {
  const { state } = ctx;
  requireHost(state, actor);
  requireNotPlaying(state);
  assertRule(state.players.filter((p) => p.status !== "left").length < MAX_PLAYERS, "This room is full");
  const used = new Set(state.players.map((p) => p.name));
  const free = BOT_NAMES.filter((n) => !used.has(n));
  const name = free.length ? pick(free, ctx.rng) : `Bot ${state.players.length + 1}`;
  const id = `bot_${Math.floor(ctx.rng() * 2 ** 32).toString(36)}`;
  state.players.push(newPlayer({ id, name, avatar: pick(BOT_AVATARS, ctx.rng) }, true));
  ctx.events.push({ t: "player_joined", pid: id });
}

function removePlayer(ctx: Ctx, target: PlayerState) {
  const { state } = ctx;
  if (state.phase === "playing") {
    if (target.status === "active" && !target.isBot) {
      // leaving mid-game: a bot takes over the seat and the hand
      target.isBot = true;
      target.takenOver = true;
      target.autopilot = false;
      ctx.events.push({ t: "player_left", pid: target.id });
      if (currentPlayer(state) === target) scheduleDeadline(ctx);
    } else if (target.status === "active") {
      eliminate(ctx, target, "left");
    } else {
      target.status = "left";
      ctx.events.push({ t: "player_left", pid: target.id });
    }
    settle(ctx);
  } else {
    state.players = state.players.filter((p) => p.id !== target.id);
    ctx.events.push({ t: "player_left", pid: target.id });
  }
  if (state.hostId === target.id) {
    const next = state.players.find((p) => !p.isBot && p.status !== "left" && p.id !== target.id);
    if (next) {
      state.hostId = next.id;
      ctx.events.push({ t: "host_changed", pid: next.id });
    }
  }
}

function backToLobby(ctx: Ctx) {
  const { state } = ctx;
  state.players = state.players.filter((p) => p.status !== "left" && !p.takenOver);
  for (const p of state.players) {
    p.hand = [];
    p.score = 0;
    p.status = "active";
    p.saidUno = false;
    p.autopilot = false;
    p.afkStrikes = 0;
  }
  state.phase = "lobby";
  state.drawPile = [];
  state.discardPile = [];
  state.currentColor = null;
  state.drawStack = 0;
  state.unoWindow = null;
  state.deadline = null;
  state.roundEndsAt = null;
  state.round = 0;
  state.lastRound = null;
  state.gameWinnerId = null;
  ctx.events.push({ t: "settings" });
}

/** A human acting clears AFK strikes and takes back control from autopilot. */
function markHumanActivity(ctx: Ctx, p: PlayerState) {
  p.afkStrikes = 0;
  if (p.autopilot) {
    p.autopilot = false;
    if (ctx.state.phase === "playing" && currentPlayer(ctx.state) === p) scheduleDeadline(ctx);
  }
}

function requireHost(state: GameState, p: PlayerState) {
  assertRule(state.hostId === p.id, "Only the host can do that");
}

function requireNotPlaying(state: GameState) {
  assertRule(state.phase !== "playing", "You can't do that during a round");
}

function requireTurn(state: GameState, p: PlayerState) {
  assertRule(currentPlayer(state)?.id === p.id, "It's not your turn");
}
