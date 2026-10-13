"use client";

import { create } from "zustand";
import type { GameEvent, PrivateView, PublicView } from "@/engine";
import type { ChatMessage, GameMessage, Transport } from "@/shared/protocol";
import { syncClock } from "../clock";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "warn" | "error" | "good";
}

export interface Picker {
  kind: "color" | "swap";
  cardId: string;
  action: "play" | "jump_in";
  color?: string;
}

export interface Batch {
  v: number;
  ev: GameEvent[];
  prev: PublicView | null;
  next: PublicView;
  prevPriv: PrivateView | null;
  nextPriv: PrivateView | null;
  you: string;
}

type BatchListener = (b: Batch) => void;
// keyed so a hot-reloaded module replaces its old listener instead of adding a second one
const listeners = new Map<string, BatchListener>();

/** Animation/sound/toast systems listen here; called before the new view is applied. */
export function onBatch(key: string, fn: BatchListener): () => void {
  listeners.set(key, fn);
  return () => {
    if (listeners.get(key) === fn) listeners.delete(key);
  };
}

let toastId = 1;

export interface GameStore {
  code: string | null;
  you: string | null;
  transport: Transport;
  member: boolean;
  removed: boolean;
  connected: boolean;
  version: number;
  pub: PublicView | null;
  priv: PrivateView | null;
  presence: string[];
  chat: ChatMessage[];
  unreadChat: number;
  chatOpen: boolean;
  selectedCardId: string | null;
  pendingPlayId: string | null;
  rejectedCardId: string | null;
  picker: Picker | null;
  toasts: Toast[];

  init(code: string, you: string, transport: Transport, member: boolean): void;
  receive(msg: GameMessage): void;
  setPresence(members: string[]): void;
  setConnected(c: boolean): void;
  addChat(m: ChatMessage): void;
  setChatOpen(open: boolean): void;
  select(cardId: string | null): void;
  setPending(cardId: string | null): void;
  reject(cardId: string): void;
  setPicker(p: Picker | null): void;
  toast(text: string, tone?: Toast["tone"]): void;
  dismissToast(id: number): void;
  reset(): void;
}

const initial = {
  code: null,
  you: null,
  transport: "sse" as Transport,
  member: false,
  removed: false,
  connected: false,
  version: 0,
  pub: null,
  priv: null,
  presence: [],
  chat: [],
  unreadChat: 0,
  chatOpen: false,
  selectedCardId: null,
  pendingPlayId: null,
  rejectedCardId: null,
  picker: null,
  toasts: [],
};

export const useGame = create<GameStore>((set, get) => ({
  ...initial,

  init(code, you, transport, member) {
    set({ code, you, transport, member });
  },

  receive(msg) {
    const s = get();
    syncClock(msg.now);
    // messages can arrive twice (HTTP response + realtime) or out of order: keep the newest
    if (msg.v <= s.version) return;
    const batch: Batch = {
      v: msg.v,
      ev: s.version === 0 ? [] : msg.ev,
      prev: s.pub,
      next: msg.pub,
      prevPriv: s.priv,
      nextPriv: msg.priv,
      you: s.you ?? "",
    };
    for (const fn of listeners.values()) {
      try {
        fn(batch);
      } catch (e) {
        console.error(e);
      }
    }
    const hand = new Set(msg.priv?.hand.map((c) => c.id) ?? []);
    set({
      version: msg.v,
      pub: msg.pub,
      priv: msg.priv,
      member: !!msg.priv,
      removed: !!msg.removed && s.member,
      pendingPlayId: s.pendingPlayId && hand.has(s.pendingPlayId) ? s.pendingPlayId : null,
      selectedCardId: s.selectedCardId && hand.has(s.selectedCardId) ? s.selectedCardId : null,
      picker: s.picker && hand.has(s.picker.cardId) ? s.picker : null,
    });
  },

  setPresence(members) {
    set({ presence: members });
  },
  setConnected(connected) {
    set({ connected });
  },
  addChat(m) {
    const s = get();
    if (s.chat.some((c) => c.id === m.id)) return;
    set({ chat: [...s.chat.slice(-99), m], unreadChat: s.chatOpen || m.kind !== "chat" ? s.unreadChat : s.unreadChat + 1 });
  },
  setChatOpen(chatOpen) {
    set({ chatOpen, unreadChat: chatOpen ? 0 : get().unreadChat });
  },
  select(selectedCardId) {
    set({ selectedCardId });
  },
  setPending(pendingPlayId) {
    set({ pendingPlayId });
  },
  reject(cardId) {
    set({ pendingPlayId: null, rejectedCardId: cardId });
    setTimeout(() => {
      if (get().rejectedCardId === cardId) set({ rejectedCardId: null });
    }, 600);
  },
  setPicker(picker) {
    set({ picker });
  },
  toast(text, tone = "info") {
    const id = toastId++;
    set({ toasts: [...get().toasts.slice(-3), { id, text, tone }] });
    setTimeout(() => get().dismissToast(id), tone === "error" ? 3800 : 2600);
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
  reset() {
    set({ ...initial });
  },
}));

export function playerName(pub: PublicView | null, pid: string | null | undefined, you?: string | null): string {
  if (!pub || !pid) return "Someone";
  if (pid === you) return "You";
  return pub.players.find((p) => p.id === pid)?.name ?? "Someone";
}
