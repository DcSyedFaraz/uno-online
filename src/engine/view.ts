import { jumpInCardIds, needsColor, needsSwapTarget, playableCardIds } from "./legal";
import type { RuleSettings } from "./rules";
import { currentPlayer, findPlayer } from "./state";
import { canCallUno } from "./uno";
import { partnerOf, teamPlay } from "./teams";
import type { Card, Color, GameEvent, GameState, Phase, PlayerStatus, RoundResult, Spectator, TeamInvite, UnoWindow } from "./types";

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  cardCount: number;
  score: number;
  saidUno: boolean;
  status: PlayerStatus;
  autopilot: boolean;
  /** a bot is playing this seat for the human */
  takenOver: boolean;
  /** …because their connection dropped */
  offline: boolean;
  /** team play partner */
  partnerId: string | null;
}

export type PublicTurn =
  | { kind: "play" }
  | { kind: "drawn" }
  | { kind: "stack"; challengeable: boolean }
  | { kind: "choose_color"; purpose: "roulette" };

/** What everyone in the room may see. Hands and the draw order stay on the server. */
export interface PublicView {
  phase: Phase;
  round: number;
  hostId: string;
  settings: RuleSettings;
  players: PublicPlayer[];
  /** last few cards of the discard pile, bottom → top */
  discardTop: Card[];
  discardCount: number;
  drawCount: number;
  totalCards: number;
  currentColor: Color | null;
  direction: 1 | -1;
  turnPlayerId: string | null;
  dealerId: string | null;
  turn: PublicTurn;
  drawStack: number;
  stackTopValue: number;
  unoWindow: UnoWindow | null;
  deadline: number | null;
  turnStartedAt: number;
  /** epoch ms when the round clock runs out; null = no time limit */
  roundEndsAt: number | null;
  lastRound: RoundResult | null;
  gameWinnerId: string | null;
  spectators: Spectator[];
  invites: TeamInvite[];
}

/** What only one player may see. */
export interface PrivateView {
  playerId: string;
  hand: Card[];
  /** cards that can be played right now (normal play or stacking) */
  playable: string[];
  /** cards that can be thrown in out of turn (jump-in rule) */
  jumpIn: string[];
  /** playable cards that need a color pick / swap target before sending */
  needsColor: string[];
  needsSwapTarget: string[];
  drawnCardId: string | null;
  canDraw: boolean;
  canPass: boolean;
  canTakePenalty: boolean;
  canChallenge: boolean;
  canCallUno: boolean;
  mustChooseColor: boolean;
  /** watching, not playing */
  spectator?: boolean;
  /** other hands this viewer may see: every hand for spectators, the partner's in team play */
  peek?: Record<string, Card[]>;
}

const DISCARD_VISIBLE = 10;

export function publicView(state: GameState): PublicView {
  const cur = state.phase === "playing" ? currentPlayer(state) : undefined;
  const t = state.turn;
  const turn: PublicTurn =
    t.kind === "stack"
      ? { kind: "stack", challengeable: !!t.challenge }
      : t.kind === "choose_color"
        ? { kind: "choose_color", purpose: t.purpose }
        : { kind: t.kind };
  return {
    phase: state.phase,
    round: state.round,
    hostId: state.hostId,
    settings: state.settings,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isBot: p.isBot,
      cardCount: p.hand.length,
      score: p.score,
      saidUno: p.saidUno,
      status: p.status,
      autopilot: p.autopilot,
      takenOver: !!p.takenOver,
      offline: !!p.offline,
      partnerId: teamPlay(state) ? (p.partnerId ?? null) : null,
    })),
    discardTop: state.discardPile.slice(-DISCARD_VISIBLE),
    discardCount: state.discardPile.length,
    drawCount: state.drawPile.length,
    totalCards: state.totalCards,
    currentColor: state.currentColor,
    direction: state.direction,
    turnPlayerId: cur?.id ?? null,
    dealerId: state.players[state.dealerIndex]?.id ?? null,
    turn,
    drawStack: state.drawStack,
    stackTopValue: state.stackTopValue,
    unoWindow: state.unoWindow,
    deadline: state.deadline,
    turnStartedAt: state.turnStartedAt,
    roundEndsAt: state.roundEndsAt ?? null,
    lastRound: state.phase === "playing" ? null : state.lastRound,
    gameWinnerId: state.gameWinnerId,
    spectators: state.spectators ?? [],
    invites: state.invites ?? [],
  };
}

export function privateView(state: GameState, playerId: string): PrivateView {
  const p = findPlayer(state, playerId);
  const empty: PrivateView = {
    playerId,
    hand: [],
    playable: [],
    jumpIn: [],
    needsColor: [],
    needsSwapTarget: [],
    drawnCardId: null,
    canDraw: false,
    canPass: false,
    canTakePenalty: false,
    canChallenge: false,
    canCallUno: false,
    mustChooseColor: false,
  };
  if (!p) {
    // spectators see every hand
    if (!state.spectators?.some((s) => s.id === playerId)) return empty;
    const peek: Record<string, Card[]> = {};
    for (const q of state.players) if (q.status === "active") peek[q.id] = q.hand;
    return { ...empty, spectator: true, peek };
  }
  const partner = partnerOf(state, p);
  const myTurn = state.phase === "playing" && p.status === "active" && currentPlayer(state)?.id === p.id;
  const t = state.turn;
  const playable = playableCardIds(state, p);
  const jumpIn = myTurn ? [] : jumpInCardIds(state, p);
  const byId = new Map(p.hand.map((c) => [c.id, c]));
  const candidates = [...playable, ...jumpIn].map((id) => byId.get(id)!);
  return {
    ...empty,
    hand: p.hand,
    playable,
    jumpIn,
    needsColor: candidates.filter((c) => needsColor(c)).map((c) => c.id),
    needsSwapTarget: candidates.filter((c) => needsSwapTarget(state, p, c)).map((c) => c.id),
    drawnCardId: myTurn && t.kind === "drawn" ? t.cardId : null,
    canDraw: myTurn && t.kind === "play",
    canPass: myTurn && t.kind === "drawn" && !state.settings.forcePlayDrawn,
    canTakePenalty: myTurn && t.kind === "stack",
    canChallenge: myTurn && t.kind === "stack" && !!t.challenge,
    canCallUno: canCallUno({ state }, p),
    mustChooseColor: myTurn && t.kind === "choose_color",
    ...(partner && state.phase === "playing" && partner.status === "active" ? { peek: { [partner.id]: partner.hand } } : {}),
  };
}

/** Hides drawn cards from everyone except the player who drew them (spectators see everything). */
export function eventsFor(events: GameEvent[], playerId: string, revealAll = false): GameEvent[] {
  if (revealAll) return events;
  return events.map((e) => (e.t === "draw" && e.pid !== playerId && e.cards ? { ...e, cards: undefined } : e));
}
