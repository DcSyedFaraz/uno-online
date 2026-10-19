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

/** chat text, a quick reaction, an animated emote, or something thrown at a player (`to`) */
export type ChatKind = "chat" | "react" | "emote" | "throw";
export const CHAT_KINDS: readonly ChatKind[] = ["chat", "react", "emote", "throw"];

export interface ChatMessage {
  id: string;
  kind: ChatKind;
  pid: string;
  text: string;
  at: number;
  /** target player of a throw */
  to?: string;
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
  /** watching, not playing */
  spectator: boolean;
  transport: Transport;
  msg: GameMessage;
}

export const gameChannel = (code: string, pid: string) => `room:${code}:p:${pid}`;
export const chatChannel = (code: string) => `room:${code}:chat`;

export const CHAT_MAX = 200;
export const REACTIONS = ["👍", "😂", "😱", "🔥", "😡", "🎉", "👀", "💀"] as const;

/** Animated emotes (Noto Emoji Animation, CC BY 4.0): id → unicode codepoint used for the file name. */
export const EMOTES = {
  laugh: { emoji: "😂", code: "1f602" },
  angry: { emoji: "😡", code: "1f621" },
  shock: { emoji: "😱", code: "1f631" },
  cry: { emoji: "😭", code: "1f62d" },
  party: { emoji: "🥳", code: "1f973" },
  cool: { emoji: "😎", code: "1f60e" },
  mindblown: { emoji: "🤯", code: "1f92f" },
  sleepy: { emoji: "😴", code: "1f634" },
  clap: { emoji: "👏", code: "1f44f" },
  fire: { emoji: "🔥", code: "1f525" },
  skull: { emoji: "💀", code: "1f480" },
  kiss: { emoji: "😘", code: "1f618" },
} as const;
export type EmoteId = keyof typeof EMOTES;

/** Things you can throw at another player's avatar. */
export const THROWABLES = {
  egg: "🥚",
  tomato: "🍅",
  rose: "🌹",
  kiss: "💋",
  cheers: "🍺",
  bomb: "💣",
} as const;
export type ThrowableId = keyof typeof THROWABLES;
