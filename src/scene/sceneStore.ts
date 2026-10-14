"use client";

import * as THREE from "three";
import { create } from "zustand";
import { NEON } from "@/brand";
import type { Card, Color } from "@/engine";
import type { CalloutSpec } from "./anim/callout";
import type { Seat, TableDims } from "./layout/layout";
import { tableDims } from "./layout/layout";

export type FaceSpec = Pick<Card, "kind" | "value" | "color">;

/** How a card that just appeared should enter the scene. */
export interface SpawnHint {
  from: "deck" | "discard" | { seat: string };
  delay: number;
  faceUp?: boolean;
}

/** A transient flying card that isn't tracked by game state (opponent draws, swaps…). */
export interface Ghost {
  id: number;
  face: FaceSpec | null;
  from: THREE.Vector3;
  fromQuat: THREE.Quaternion;
  to: THREE.Vector3;
  toQuat: THREE.Quaternion;
  fromScale: number;
  toScale: number;
  delay: number;
  duration: number;
  born: number;
}

export type FxTone = "red" | "gold" | "blue" | "white" | "green" | "wild";

export interface SeatFx {
  id: number;
  pid: string;
  text: string;
  tone: FxTone;
  big?: boolean;
}

export interface Pulse {
  id: number;
  kind: "shockwave" | "burst" | "colorburst";
  pos: THREE.Vector3;
  color: string;
  born: number;
  delay: number;
}

/** Shared mutable layout data read inside useFrame (no React re-renders). */
export const sceneRef: {
  dims: TableDims;
  seats: Map<string, Seat>;
  camera: THREE.Camera | null;
  shake: number;
  reverseAt: number;
  you: string | null;
} = {
  dims: tableDims(16 / 9),
  seats: new Map(),
  camera: null,
  shake: 0,
  reverseAt: 0,
  you: null,
};

export const spawnHints = new Map<string, SpawnHint>();
/** The color picked for each wild played this round (card id → color), so the pile shows it. */
export const wildColors = new Map<string, Color>();
/** Last world transform of every card actor (used to launch ghosts from where a card was). */
export const actorTransforms = new Map<string, { pos: THREE.Vector3; quat: THREE.Quaternion; scale: number }>();

let ids = 1;

export interface Shout {
  id: number;
  pid: string;
  kind: "shout" | "caught";
  by?: string;
}

export type Callout = CalloutSpec & { id: number };

interface SceneStore {
  /** the big "what just happened" headline for action and wild cards */
  callout: Callout | null;
  showCallout(c: CalloutSpec, delay?: number): void;
  shouts: Shout[];
  addShout(s: Omit<Shout, "id">): void;
  ghosts: Ghost[];
  seatFx: SeatFx[];
  pulses: Pulse[];
  confetti: { id: number; big: boolean } | null;
  addGhosts(g: Omit<Ghost, "id" | "born">[]): void;
  removeGhost(id: number): void;
  addSeatFx(pid: string, text: string, tone: FxTone, big?: boolean, delay?: number): void;
  addPulse(kind: Pulse["kind"], pos: THREE.Vector3, color: string, delay?: number): void;
  removePulse(id: number): void;
  celebrate(big: boolean): void;
}

export const useScene = create<SceneStore>((set, get) => ({
  callout: null,
  showCallout(c, delay = 0) {
    setTimeout(() => {
      const id = ids++;
      set({ callout: { ...c, id } });
      setTimeout(() => get().callout?.id === id && set({ callout: null }), 2000);
    }, delay);
  },
  shouts: [],
  addShout(sh) {
    const id = ids++;
    set({ shouts: [...get().shouts.slice(-2), { ...sh, id }] });
    setTimeout(() => set({ shouts: get().shouts.filter((x) => x.id !== id) }), 1900);
  },
  ghosts: [],
  seatFx: [],
  pulses: [],
  confetti: null,
  addGhosts(gs) {
    const born = performance.now();
    set({ ghosts: [...get().ghosts, ...gs.map((g) => ({ ...g, id: ids++, born }))].slice(-80) });
  },
  removeGhost(id) {
    set({ ghosts: get().ghosts.filter((g) => g.id !== id) });
  },
  addSeatFx(pid, text, tone, big, delay = 0) {
    const add = () => {
      const id = ids++;
      set({ seatFx: [...get().seatFx, { id, pid, text, tone, big }] });
      setTimeout(() => set({ seatFx: get().seatFx.filter((f) => f.id !== id) }), big ? 1900 : 1500);
    };
    if (delay > 0) setTimeout(add, delay);
    else add();
  },
  addPulse(kind, pos, color, delay = 0) {
    set({ pulses: [...get().pulses, { id: ids++, kind, pos: pos.clone(), color, born: performance.now(), delay }].slice(-24) });
  },
  removePulse(id) {
    set({ pulses: get().pulses.filter((p) => p.id !== id) });
  },
  celebrate(big) {
    set({ confetti: { id: ids++, big } });
  },
}));

export const COLOR_HEX: Record<Color | "wild", string> = NEON;
