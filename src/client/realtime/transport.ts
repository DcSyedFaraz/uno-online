"use client";

import type * as AblyTypes from "ably";
import { CHAT_MAX, chatChannel, gameChannel, type ChatKind, type ChatMessage, type GameMessage, type Transport } from "@/shared/protocol";
import { api, devHeaders, devUser } from "../api";

export interface RoomHandlers {
  onGame(msg: GameMessage): void;
  onChat(msg: ChatMessage): void;
  onPresence(members: string[]): void;
  /** (re)connected — the caller should resync with a fresh snapshot */
  onConnected(): void;
  onDisconnected(): void;
}

export interface RoomConnection {
  sendChat(kind: ChatKind, text: string): Promise<void>;
  close(): void;
}

export function connectRoom(code: string, pid: string, transport: Transport, h: RoomHandlers): RoomConnection {
  return transport === "ably" ? connectAbly(code, pid, h) : connectSse(code, h);
}

/** Local development: Server-Sent Events from the dev server (no Ably account needed). */
function connectSse(code: string, h: RoomHandlers): RoomConnection {
  const dev = devUser();
  const es = new EventSource(`/api/dev/stream?code=${code}${dev ? `&devUser=${encodeURIComponent(dev)}` : ""}`);
  es.addEventListener("ready", () => h.onConnected());
  es.addEventListener("game", (e) => h.onGame(JSON.parse((e as MessageEvent).data)));
  const onChat = (e: Event) => h.onChat(JSON.parse((e as MessageEvent).data));
  es.addEventListener("chat", onChat);
  es.addEventListener("react", onChat);
  es.addEventListener("presence", (e) => h.onPresence(JSON.parse((e as MessageEvent).data).members));
  es.onerror = () => h.onDisconnected();
  return {
    async sendChat(kind, text) {
      await api.devChat(code, kind, text.slice(0, CHAT_MAX));
    },
    close() {
      es.close();
    },
  };
}

function connectAbly(code: string, pid: string, h: RoomHandlers): RoomConnection {
  let closed = false;
  let client: AblyTypes.Realtime | null = null;
  let chat: AblyTypes.RealtimeChannel | null = null;

  const refreshPresence = async () => {
    if (!chat) return;
    const members = await chat.presence.get();
    h.onPresence([...new Set(members.map((m) => m.clientId))]);
  };

  (async () => {
    const Ably = await import("ably");
    if (closed) return;
    client = new Ably.Realtime({
      authUrl: "/api/ably/token",
      authParams: { code },
      authHeaders: devHeaders(),
      clientId: pid,
      echoMessages: true,
    });
    client.connection.on("connected", () => h.onConnected());
    client.connection.on("disconnected", () => h.onDisconnected());
    client.connection.on("suspended", () => h.onDisconnected());

    const game = client.channels.get(gameChannel(code, pid));
    await game.subscribe("game", (m) => h.onGame(m.data as GameMessage));

    chat = client.channels.get(chatChannel(code));
    await chat.subscribe((m) => {
      if (m.name !== "chat" && m.name !== "react") return;
      const data = m.data as ChatMessage;
      // trust Ably's verified clientId over the payload
      h.onChat({ ...data, pid: m.clientId ?? data.pid });
    });
    await chat.presence.subscribe(() => void refreshPresence());
    await chat.presence.enter();
    await refreshPresence();
  })().catch((e) => {
    console.error("realtime connection failed", e);
    h.onDisconnected();
  });

  return {
    async sendChat(kind, text) {
      if (!chat) return;
      const msg: ChatMessage = { id: crypto.randomUUID(), kind, pid, text: text.slice(0, CHAT_MAX), at: Date.now() };
      await chat.publish(kind, msg);
    },
    close() {
      closed = true;
      client?.close();
    },
  };
}
