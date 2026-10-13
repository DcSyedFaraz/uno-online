"use client";

import { create } from "zustand";
import type { Card, Color } from "@/engine";
import { loadPref, savePref } from "@/client/profile";

export type SortMode = "color" | "number" | "none";
export type Quality = "auto" | "high" | "medium" | "low";

interface UiStore {
  sortMode: SortMode;
  quality: Quality;
  /** resolved tier when quality is auto */
  autoTier: "high" | "medium" | "low";
  reduceMotion: boolean;
  settingsOpen: boolean;
  rulesOpen: boolean;
  setSort(m: SortMode): void;
  setQuality(q: Quality): void;
  setAutoTier(t: "high" | "medium" | "low"): void;
  setReduceMotion(r: boolean): void;
  setSettingsOpen(o: boolean): void;
  setRulesOpen(o: boolean): void;
}

const prefersReduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export const useUi = create<UiStore>((set) => ({
  sortMode: loadPref<SortMode>("sort", "color"),
  quality: loadPref<Quality>("quality", "auto"),
  autoTier: "high",
  reduceMotion: loadPref<boolean>("reduceMotion", !!prefersReduced()),
  settingsOpen: false,
  rulesOpen: false,
  setSort(sortMode) {
    savePref("sort", sortMode);
    set({ sortMode });
  },
  setQuality(quality) {
    savePref("quality", quality);
    set({ quality });
  },
  setAutoTier(autoTier) {
    set({ autoTier });
  },
  setReduceMotion(reduceMotion) {
    savePref("reduceMotion", reduceMotion);
    set({ reduceMotion });
  },
  setSettingsOpen(settingsOpen) {
    set({ settingsOpen });
  },
  setRulesOpen(rulesOpen) {
    set({ rulesOpen });
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
