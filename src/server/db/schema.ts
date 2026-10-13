import { bigint, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { GameState } from "@/engine";

/**
 * One row per room. The whole game lives in `state` and every change is an
 * optimistic-locking update on `version`, so each action is atomic.
 */
export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  status: text("status").notNull(),
  hostId: text("host_id").notNull(),
  state: jsonb("state").$type<GameState>().notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  /** epoch ms; used by the cleanup cron */
  lastActivityAt: bigint("last_activity_at", { mode: "number" }).notNull(),
});
