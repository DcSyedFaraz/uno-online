import type { RuleSettings } from "./rules";

export type Color = "red" | "yellow" | "green" | "blue";
export const COLORS: readonly Color[] = ["red", "yellow", "green", "blue"];

/** Every card type the engine knows. Extras are only added to the deck when their switch is on. */
export type CardKind =
  | "number"
  | "skip"
  | "reverse"
  | "draw2"
  | "wild"
  | "wild4"
  // optional extra cards
  | "skip_all"
  | "discard_all"
  | "draw4"
  | "wild_reverse4"
  | "wild6"
  | "wild10"
  | "wild_roulette";

export interface Card {
  id: string;
  kind: CardKind;
  /** null for wild-type cards */
  color: Color | null;
  /** only for number cards */
  value?: number;
}

export type Phase = "lobby" | "playing" | "round_over" | "game_over";
export type PlayerStatus = "active" | "out" | "left";

export interface PlayerState {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  hand: Card[];
  /** cumulative points across rounds (points mode) */
  score: number;
  /** true once the player has called their last-card shout for the current 1-card situation */
  saidUno: boolean;
  status: PlayerStatus;
  afkStrikes: number;
  autopilot: boolean;
}

/** What the current turn is waiting for. */
export type TurnState =
  | { kind: "play" }
  /** the player drew a playable card and may play it (or pass) */
  | { kind: "drawn"; cardId: string }
  /** a draw penalty is pending: stack it, take it, or (Wild +4 only) challenge it */
  | { kind: "stack"; challenge: ChallengeInfo | null }
  /** the player must pick a color (starting wild, or Wild Color Roulette) */
  | { kind: "choose_color"; purpose: "start" | "roulette" };

export interface ChallengeInfo {
  offenderId: string;
  /** whether the offender held a card of the previous color when playing the Wild +4 */
  offenderHadMatch: boolean;
}

export interface UnoWindow {
  playerId: string;
  openedAt: number;
}

export interface RoundResult {
  round: number;
  winnerId: string | null;
  points: number;
  /** every player's leftover hand, revealed at round end */
  hands: Record<string, Card[]>;
  /** the round clock ran out (the fewest card points won) */
  timeUp?: boolean;
}

export interface GameState {
  phase: Phase;
  round: number;
  hostId: string;
  settings: RuleSettings;
  players: PlayerState[];
  /** top of the pile = last element */
  drawPile: Card[];
  /** top of the pile = last element */
  discardPile: Card[];
  currentColor: Color | null;
  direction: 1 | -1;
  turnIndex: number;
  dealerIndex: number;
  turn: TurnState;
  /** accumulated draw penalty while stacking */
  drawStack: number;
  /** draw value of the last stacked card (2, 4, 6, 10) */
  stackTopValue: number;
  unoWindow: UnoWindow | null;
  /** epoch ms when the current turn auto-resolves (AFK timeout or bot pacing); null = never */
  deadline: number | null;
  turnStartedAt: number;
  /** epoch ms when the round clock runs out; null = no time limit (or not playing) */
  roundEndsAt: number | null;
  totalCards: number;
  nextCardId: number;
  lastRound: RoundResult | null;
  gameWinnerId: string | null;
}

export type Action =
  | { type: "play"; cardId: string; color?: Color; swapTargetId?: string }
  | { type: "jump_in"; cardId: string; color?: Color; swapTargetId?: string }
  | { type: "draw" }
  | { type: "pass" }
  | { type: "take_penalty" }
  | { type: "challenge" }
  | { type: "choose_color"; color: Color }
  | { type: "call_uno" }
  | { type: "catch_uno"; targetId: string }
  | { type: "timeout" }
  // lobby / host
  | { type: "join"; name: string; avatar: string }
  | { type: "update_settings"; settings: unknown }
  | { type: "add_bot" }
  | { type: "remove_bot"; playerId: string }
  | { type: "kick"; playerId: string }
  | { type: "leave" }
  | { type: "transfer_host"; playerId: string }
  | { type: "start" }
  | { type: "next_round" }
  | { type: "back_to_lobby" };

export type DrawReason = "draw" | "penalty" | "uno" | "challenge" | "roulette" | "deal";

export type GameEvent =
  | { t: "deal"; counts: Record<string, number> }
  | { t: "start_card"; card: Card }
  | { t: "play"; pid: string; card: Card; jumpIn?: boolean }
  /** `cards` is only revealed to `pid` (redacted for everyone else by the view layer) */
  | { t: "draw"; pid: string; count: number; reason: DrawReason; cards?: Card[] }
  | { t: "color"; pid: string | null; color: Color }
  | { t: "skip"; pids: string[] }
  | { t: "reverse"; direction: 1 | -1 }
  | { t: "stack"; total: number }
  | { t: "swap"; a: string; b: string }
  | { t: "rotate"; direction: 1 | -1 }
  | { t: "discard_all"; pid: string; cards: Card[] }
  | { t: "roulette"; pid: string; color: Color; cards: Card[] }
  | { t: "challenge"; offender: string; victim: string; guilty: boolean }
  | { t: "uno_call"; pid: string }
  | { t: "uno_caught"; pid: string; by: string }
  | { t: "eliminated"; pid: string }
  | { t: "reshuffle"; count: number }
  | { t: "timeout"; pid: string }
  | { t: "time_up" }
  | { t: "round_over"; winnerId: string | null; points: number; timeUp?: boolean }
  | { t: "game_over"; winnerId: string | null }
  | { t: "player_joined"; pid: string }
  | { t: "player_left"; pid: string }
  | { t: "host_changed"; pid: string }
  | { t: "settings" };

export interface Ctx {
  state: GameState;
  now: number;
  rng: () => number;
  events: GameEvent[];
}
