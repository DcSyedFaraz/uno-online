import "server-only";
import * as Ably from "ably";
import { chatChannel, gameChannel, type Transport } from "@/shared/protocol";

export interface OutboundMessage {
  channel: string;
  name: string;
  data: unknown;
}

let rest: Ably.Rest | null = null;
function ably(): Ably.Rest | null {
  const key = process.env.ABLY_API_KEY;
  if (!key) return null;
  return (rest ??= new Ably.Rest({ key }));
}

export function transport(): Transport {
  if (process.env.ABLY_API_KEY) return "ably";
  if (process.env.NODE_ENV === "production") throw new Error("ABLY_API_KEY is not set");
  return "sse";
}

// ── dev fallback: in-process pub/sub, streamed to browsers over SSE ──
type Listener = (name: string, data: unknown) => void;
interface DevBus {
  listeners: Map<string, Set<Listener>>;
  presence: Map<string, Map<string, string>>;
}
export function devBus(): DevBus {
  const g = globalThis as unknown as { __neonoBus?: DevBus };
  return (g.__neonoBus ??= { listeners: new Map(), presence: new Map() });
}

export function devSubscribe(channel: string, fn: Listener): () => void {
  const bus = devBus();
  const set = bus.listeners.get(channel) ?? new Set();
  set.add(fn);
  bus.listeners.set(channel, set);
  return () => {
    set.delete(fn);
    if (set.size === 0) bus.listeners.delete(channel);
  };
}

export function devPublish(channel: string, name: string, data: unknown) {
  for (const fn of devBus().listeners.get(channel) ?? []) fn(name, data);
}

/** Tracks a connection in the room's presence set and broadcasts the member list. */
export function devPresence(code: string, connId: string, pid: string | null) {
  const bus = devBus();
  const ch = chatChannel(code);
  const room = bus.presence.get(ch) ?? new Map<string, string>();
  if (pid) room.set(connId, pid);
  else room.delete(connId);
  bus.presence.set(ch, room);
  devPublish(ch, "presence", { kind: "presence", members: [...new Set(room.values())] });
}

/** Sends every message; on Ably this is a single batch HTTP call. */
export async function publishAll(messages: OutboundMessage[]) {
  if (messages.length === 0) return;
  const client = ably();
  if (!client) {
    for (const m of messages) devPublish(m.channel, m.name, m.data);
    return;
  }
  const specs: Ably.BatchPublishSpec[] = messages.map((m) => ({ channels: [m.channel], messages: [{ name: m.name, data: m.data }] }));
  for (let i = 0; i < specs.length; i += 100) await client.batchPublish(specs.slice(i, i + 100));
}

/** Ably token limited to the player's own game channel plus the room chat/presence. */
export async function createAblyToken(code: string, pid: string) {
  const client = ably();
  if (!client) throw new Error("Ably is not configured");
  return client.auth.createTokenRequest({
    clientId: pid,
    ttl: 60 * 60 * 1000,
    capability: JSON.stringify({
      [gameChannel(code, pid)]: ["subscribe"],
      [chatChannel(code)]: ["subscribe", "publish", "presence"],
    }),
  });
}
