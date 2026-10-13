import type { GameEvent, PrivateView, PublicView } from "@/engine";

/** One message on a player's private game channel. Always carries the full views. */
export interface GameMessage {
  v: number;
  pub: PublicView;
  priv: PrivateView | null;
  ev: GameEvent[];
  /** server clock, for countdown sync */
  now: number;
  /** set when this player was removed from the room */
  removed?: boolean;
}

export type ChatKind = "chat" | "react";

export interface ChatMessage {
  id: string;
  kind: ChatKind;
  pid: string;
  text: string;
  at: number;
}

export interface PresenceMessage {
  kind: "presence";
  members: string[];
}

export type Transport = "ably" | "sse";

export interface RoomSnapshot {
  code: string;
  you: string;
  member: boolean;
  transport: Transport;
  msg: GameMessage;
}

export const gameChannel = (code: string, pid: string) => `room:${code}:p:${pid}`;
export const chatChannel = (code: string) => `room:${code}:chat`;

export const CHAT_MAX = 200;
export const REACTIONS = ["👍", "😂", "😱", "🔥", "😡", "🎉", "👀", "💀"] as const;
