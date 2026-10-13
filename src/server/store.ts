import "server-only";
import { neon } from "@neondatabase/serverless";
import { and, eq, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import type { GameState } from "@/engine";
import { rooms } from "./db/schema";

export interface RoomRecord {
  code: string;
  state: GameState;
  version: number;
  lastActivityAt: number;
}

export interface RoomStore {
  readonly kind: "neon" | "memory";
  get(code: string): Promise<RoomRecord | null>;
  /** false if the code is taken */
  create(code: string, state: GameState, now: number): Promise<boolean>;
  /** optimistic locking: false if someone else changed the room first */
  update(code: string, state: GameState, expectedVersion: number, now: number): Promise<boolean>;
  deleteInactive(before: number): Promise<number>;
}

function neonStore(url: string): RoomStore {
  const db = drizzle(neon(url));
  return {
    kind: "neon",
    async get(code) {
      const rows = await db
        .select({ code: rooms.code, state: rooms.state, version: rooms.version, lastActivityAt: rooms.lastActivityAt })
        .from(rooms)
        .where(eq(rooms.code, code))
        .limit(1);
      return rows[0] ?? null;
    },
    async create(code, state, now) {
      const rows = await db
        .insert(rooms)
        .values({ code, state, status: state.phase, hostId: state.hostId, version: 1, lastActivityAt: now })
        .onConflictDoNothing({ target: rooms.code })
        .returning({ id: rooms.id });
      return rows.length === 1;
    },
    async update(code, state, expectedVersion, now) {
      const rows = await db
        .update(rooms)
        .set({ state, status: state.phase, hostId: state.hostId, version: expectedVersion + 1, updatedAt: new Date(now), lastActivityAt: now })
        .where(and(eq(rooms.code, code), eq(rooms.version, expectedVersion)))
        .returning({ id: rooms.id });
      return rows.length === 1;
    },
    async deleteInactive(before) {
      const rows = await db.delete(rooms).where(lt(rooms.lastActivityAt, before)).returning({ id: rooms.id });
      return rows.length;
    },
  };
}

/** Local-development fallback when DATABASE_URL isn't set. Lives in the dev server's memory. */
function memoryStore(): RoomStore {
  const g = globalThis as unknown as { __neonoRooms?: Map<string, RoomRecord> };
  const map = (g.__neonoRooms ??= new Map());
  return {
    kind: "memory",
    async get(code) {
      const r = map.get(code);
      return r ? structuredClone(r) : null;
    },
    async create(code, state, now) {
      if (map.has(code)) return false;
      map.set(code, { code, state: structuredClone(state), version: 1, lastActivityAt: now });
      return true;
    },
    async update(code, state, expectedVersion, now) {
      const r = map.get(code);
      if (!r || r.version !== expectedVersion) return false;
      map.set(code, { code, state: structuredClone(state), version: expectedVersion + 1, lastActivityAt: now });
      return true;
    },
    async deleteInactive(before) {
      let n = 0;
      for (const [code, r] of map) {
        if (r.lastActivityAt < before) {
          map.delete(code);
          n++;
        }
      }
      return n;
    },
  };
}

let store: RoomStore | null = null;

export function getStore(): RoomStore {
  if (store) return store;
  const url = process.env.DATABASE_URL;
  if (url) store = neonStore(url);
  else if (process.env.NODE_ENV !== "production") store = memoryStore();
  else throw new Error("DATABASE_URL is not set");
  return store;
}
