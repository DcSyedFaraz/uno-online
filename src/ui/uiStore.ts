"use client";

import { create } from "zustand";
import type { Card, Color } from "@/engine";
import { IS_TOUCH } from "@/client/device";
import { loadPref, savePref } from "@/client/profile";

export type SortMode = "color" | "number" | "none";
export type Quality = "auto" | "high" | "medium" | "low";
/** the room around the table (a per-viewer look; the game itself is the same) */
export type RoomTheme = "lounge" | "casino" | "living";

interface UiStore {
  sortMode: SortMode;
  quality: Quality;
  /** resolved tier when quality is auto: starts per device and only ever steps down */
  autoTier: "high" | "medium" | "low";
  reduceMotion: boolean;
  roomTheme: RoomTheme;
  settingsOpen: boolean;
  rulesOpen: boolean;
  /** the opponent whose avatar was tapped (opens the throw menu) */
  throwTarget: string | null;
  setSort(m: SortMode): void;
  setQuality(q: Quality): void;
  stepDownAutoTier(): void;
  setReduceMotion(r: boolean): void;
  setRoomTheme(t: RoomTheme): void;
  setSettingsOpen(o: boolean): void;
  setRulesOpen(o: boolean): void;
  setThrowTarget(pid: string | null): void;
}

const ROOMS: RoomTheme[] = ["lounge", "casino", "living"];
const storedRoom = (): RoomTheme => {
  const r = loadPref<RoomTheme>("room", "lounge");
  return ROOMS.includes(r) ? r : "lounge";
};

const prefersReduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export const useUi = create<UiStore>((set) => ({
  sortMode: loadPref<SortMode>("sort", "color"),
  quality: loadPref<Quality>("quality", "auto"),
  autoTier: IS_TOUCH ? "medium" : "high",
  reduceMotion: loadPref<boolean>("reduceMotion", !!prefersReduced()),
  roomTheme: storedRoom(),
  settingsOpen: false,
  rulesOpen: false,
  throwTarget: null,
  setSort(sortMode) {
    savePref("sort", sortMode);
    set({ sortMode });
  },
  setQuality(quality) {
    savePref("quality", quality);
    set({ quality });
  },
  stepDownAutoTier() {
    // never steps back up: each change resizes the canvas, and flip-flopping read as flashing
    set((s) => ({ autoTier: s.autoTier === "high" ? "medium" : "low" }));
  },
  setReduceMotion(reduceMotion) {
    savePref("reduceMotion", reduceMotion);
    set({ reduceMotion });
  },
  setRoomTheme(roomTheme) {
    savePref("room", roomTheme);
    set({ roomTheme });
  },
  setSettingsOpen(settingsOpen) {
    set({ settingsOpen });
  },
  setRulesOpen(rulesOpen) {
    set({ rulesOpen });
  },
  setThrowTarget(throwTarget) {
    set({ throwTarget });
  },
}));

export function effectiveTier(s: Pick<UiStore, "quality" | "autoTier">) {
  return s.quality === "auto" ? s.autoTier : s.quality;
}

const COLOR_ORDER: Record<Color, number> = { red: 0, yellow: 1, green: 2, blue: 3 };
const KIND_ORDER: Record<Card["kind"], number> = {
  number: 0,
  skip: 1,
  skip_all: 2,
  reverse: 3,
  draw2: 4,
  draw4: 5,
  discard_all: 6,
  wild: 7,
  wild_roulette: 8,
  wild4: 9,
  wild_reverse4: 10,
  wild6: 11,
  wild10: 12,
};

function rank(c: Card) {
  return KIND_ORDER[c.kind] * 10 + (c.value ?? 0);
}

export function sortHand(hand: Card[], mode: SortMode): Card[] {
  if (mode === "none") return hand;
  const col = (c: Card) => (c.color ? COLOR_ORDER[c.color] : 4);
  return [...hand].sort((a, b) =>
    mode === "color" ? col(a) - col(b) || rank(a) - rank(b) || a.id.localeCompare(b.id) : rank(a) - rank(b) || col(a) - col(b) || a.id.localeCompare(b.id),
  );
}
