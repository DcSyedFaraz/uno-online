"use client";

import { NEON } from "@/brand";
import type { RoomTheme } from "@/ui/uiStore";
import type { ChairSpec } from "./Chairs";
import { paint } from "./kit";

export type PropKind = "lamp" | "plant" | "sideTable" | "neon" | "stool" | "slot" | "rope" | "sofa" | "shelf" | "coffee";

export interface PropSpec {
  kind: PropKind;
  x: number;
  z: number;
  /** rotation around the vertical axis (front is +z) */
  rot?: number;
  scale?: number;
  /** variant for props that come in a few looks */
  v?: number;
}

export interface ThemeSpec {
  label: string;
  /** background and fog: the floor's average color, so the room fades out seamlessly */
  backdrop: string;
  floor: () => ReturnType<typeof paint>;
  rug: () => ReturnType<typeof paint>;
  chair: ChairSpec;
  props: PropSpec[];
}

type Ctx = CanvasRenderingContext2D;

/** An oval rug: `bands` are drawn from the outside in as rings of [color, width as a fraction of the radius]. */
function rug(key: string, bands: [string, number][], motif?: (ctx: Ctx, w: number, h: number) => void) {
  return paint(
    `rug:${key}`,
    1024,
    768,
    (ctx, w, h) => {
      let k = 1;
      for (const [color, width] of bands) {
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, (w / 2) * k, (h / 2) * k, 0, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        k -= width;
      }
      if (motif) {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, (w / 2) * 0.86, (h / 2) * 0.86, 0, 0, Math.PI * 2);
        ctx.clip();
        motif(ctx, w, h);
        ctx.restore();
      }
    },
    { aniso: 8 },
  );
}

/** Small motifs scattered around the ring of rug that shows between the table and the chairs. */
function ringMotif(draw: (ctx: Ctx, x: number, y: number, a: number) => void, count = 28, k = 0.74) {
  return (ctx: Ctx, w: number, h: number) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      draw(ctx, w / 2 + Math.cos(a) * (w / 2) * k, h / 2 + Math.sin(a) * (h / 2) * k, a);
    }
  };
}

function star(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 ? r * 0.38 : r;
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function diamond(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.7, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.7, y);
  ctx.closePath();
  ctx.fill();
}

// ── floors (repeating tiles) ──

const loungeFloor = () =>
  paint(
    "floor:lounge",
    64,
    64,
    (ctx, s) => {
      ctx.fillStyle = "#c4182a";
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = "#d42838";
      for (const [x, y] of [
        [s / 4, s / 4],
        [(s * 3) / 4, (s * 3) / 4],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, s * 0.11, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    { repeat: 60, aniso: 4 },
  );

const casinoFloor = () =>
  paint(
    "floor:casino",
    128,
    128,
    (ctx, s) => {
      ctx.fillStyle = "#7b2a92";
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = "rgba(255,200,70,0.45)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(s / 2, 0);
      ctx.lineTo(s, s / 2);
      ctx.lineTo(s / 2, s);
      ctx.lineTo(0, s / 2);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,200,70,0.55)";
      diamond(ctx, s / 2, s / 2, 9);
      ctx.fillStyle = "#8f3aa8";
      for (const [x, y] of [
        [0, 0],
        [s, 0],
        [0, s],
        [s, s],
      ])
        diamond(ctx, x, y, 14);
    },
    { repeat: 40, aniso: 4 },
  );

const livingFloor = () =>
  paint(
    "floor:living",
    256,
    256,
    (ctx, s) => {
      const tones = ["#cf9259", "#c58650", "#d69b62", "#c98b54"];
      const plank = s / 4;
      for (let row = 0; row < 4; row++) {
        const y = row * plank;
        const offset = (row % 2) * (s / 2);
        for (let k = -1; k < 2; k++) {
          const x = offset + k * s;
          ctx.fillStyle = tones[(row + k + 4) % 4];
          ctx.fillRect(x, y, s, plank);
          // grain
          ctx.strokeStyle = "rgba(120,70,30,0.16)";
          ctx.lineWidth = 2;
          for (let g = 0; g < 3; g++) {
            ctx.beginPath();
            ctx.moveTo(x, y + plank * (0.25 + g * 0.25));
            ctx.bezierCurveTo(x + s * 0.3, y + plank * (0.15 + g * 0.25), x + s * 0.6, y + plank * (0.35 + g * 0.25), x + s, y + plank * (0.25 + g * 0.25));
            ctx.stroke();
          }
          ctx.fillStyle = "#9a6232";
          ctx.fillRect(x, y, 3, plank);
        }
        ctx.fillStyle = "#9a6232";
        ctx.fillRect(0, y, s, 3);
      }
    },
    { repeat: 30, aniso: 8 },
  );

// ── rugs ──

const loungeRug = () =>
  rug(
    "lounge",
    [
      ["#ffc93a", 0.03],
      ["#1d47a8", 0.05],
      ["#ffc93a", 0.012],
      ["#2457c4", 1],
    ],
    ringMotif((ctx, x, y) => {
      ctx.fillStyle = "rgba(255,214,90,0.55)";
      star(ctx, x, y, 14);
    }),
  );

const SUITS = ["♠", "♥", "♦", "♣"];
const casinoRug = () =>
  rug(
    "casino",
    [
      ["#ffc93a", 0.028],
      ["#127a3e", 0.04],
      ["#ffc93a", 0.01],
      ["#1b9a50", 1],
    ],
    ringMotif((ctx, x, y, a) => {
      ctx.fillStyle = "rgba(255,214,90,0.6)";
      ctx.font = `900 30px "Arial Black", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(SUITS[Math.round((a / (Math.PI * 2)) * 32) % 4], x, y);
    }, 32),
  );

const livingRug = () =>
  rug(
    "living",
    [
      ["#d9693f", 0.035],
      ["#f6e8cc", 0.03],
      ["#e8b23a", 0.02],
      ["#f6e8cc", 1],
    ],
    ringMotif((ctx, x, y) => {
      ctx.fillStyle = "rgba(217,105,63,0.6)";
      diamond(ctx, x, y, 16);
      ctx.fillStyle = "rgba(42,166,160,0.6)";
      diamond(ctx, x, y, 7);
    }, 36),
  );

export const THEMES: Record<RoomTheme, ThemeSpec> = {
  lounge: {
    label: "Lounge",
    backdrop: "#c71c2d",
    floor: loungeFloor,
    rug: loungeRug,
    chair: { style: "lounge", fabric: "#2f6fe8", frame: "gold", active: "#ffc93a" },
    // tall props stay out of the top-right corner, which sits under the reaction bar
    props: [
      { kind: "lamp", x: -7.9, z: -3.1 },
      { kind: "plant", x: -8.3, z: 0.9, v: 1 },
      { kind: "sideTable", x: -7.2, z: 2.6 },
      { kind: "plant", x: 8.1, z: -2.9, v: 2 },
      { kind: "lamp", x: 8.7, z: 0.5 },
      { kind: "sideTable", x: 7.2, z: 2.8, rot: 0.6 },
    ],
  },
  casino: {
    label: "Casino",
    backdrop: "#7d2c94",
    floor: casinoFloor,
    rug: casinoRug,
    chair: { style: "casino", fabric: "#d92042", frame: "gold", active: "#ffc93a" },
    props: [
      { kind: "neon", x: -8.0, z: -3.4, rot: 0.55, v: 0 },
      { kind: "rope", x: -6.6, z: -5.0, rot: 0.45 },
      { kind: "slot", x: -8.4, z: 0.4, rot: 1.25 },
      { kind: "stool", x: -7.1, z: 2.5 },
      { kind: "stool", x: 7.7, z: -3.3 },
      { kind: "stool", x: 8.6, z: -2.3 },
      { kind: "neon", x: 9.0, z: 0.4, rot: -1.15, v: 1 },
      { kind: "slot", x: 7.4, z: 2.7, rot: -0.7 },
    ],
  },
  living: {
    label: "Living room",
    backdrop: "#c98b54",
    floor: livingFloor,
    rug: livingRug,
    chair: { style: "wood", fabric: "#f2b632", frame: "#b97a45", active: "#ff7a59" },
    props: [
      { kind: "sofa", x: -8.6, z: -0.6, rot: Math.PI / 2 },
      { kind: "shelf", x: 8.7, z: -1.6, rot: -Math.PI / 2 },
      { kind: "lamp", x: -8.0, z: -3.6, v: 1 },
      { kind: "plant", x: 8.2, z: 1.6, v: 3 },
      { kind: "coffee", x: -7.1, z: 2.4, rot: 0.3 },
    ],
  },
};

export const ROOM_THEMES = Object.keys(THEMES) as RoomTheme[];

/** Neon sign wording per variant. */
export const NEON_LINES = [
  [
    { text: "NEONO", color: "#ff4fd8", size: 92 },
    { text: "♠ ♥ ♦ ♣", color: "#39e6ff", size: 58 },
  ],
  [
    { text: "JACKPOT", color: NEON.yellow, size: 76 },
    { text: "★ 777 ★", color: "#39e6ff", size: 58 },
  ],
];
