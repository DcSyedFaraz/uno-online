"use client";

import * as THREE from "three";
import type { Card, CardKind, Color } from "@/engine";
import { faceKey } from "@/engine/cards";
import { BRAND, NEON } from "@/brand";

/**
 * Card faces are drawn in code (original NEONO art) and cached as textures.
 * Each face has a color map plus a small "glow" map used as emissive, so only the
 * glyph blooms under post-processing.
 */

const W = 512;
const H = 768;
const R = 46;

const SHADES: Record<Color, [string, string, string]> = {
  red: ["#ff5f7a", "#ff2d55", "#a5102f"],
  yellow: ["#ffe27a", "#ffc41f", "#b07800"],
  green: ["#6dffb0", "#14e07a", "#06804a"],
  blue: ["#7cc0ff", "#2f8cff", "#0b3fa8"],
};

/** Color-blind helper shapes shown in the corners. */
const SHAPES: Record<Color, "diamond" | "circle" | "triangle" | "square"> = {
  red: "diamond",
  yellow: "circle",
  green: "triangle",
  blue: "square",
};

type Ctx2D = CanvasRenderingContext2D;

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

let family: string | null = null;
/** next/font gives the display font a generated family name; read it from the CSS variable. */
function displayFamily(): string {
  if (family) return family;
  const v = typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue("--font-unbounded").trim() : "";
  family = v ? `${v}, "Arial Black", system-ui, sans-serif` : `"Arial Black", system-ui, sans-serif`;
  return family;
}

function font(size: number, weight = 900) {
  return `${weight} ${size}px ${displayFamily()}`;
}

function shape(ctx: Ctx2D, kind: (typeof SHAPES)[Color], x: number, y: number, s: number) {
  ctx.beginPath();
  if (kind === "circle") ctx.arc(x, y, s * 0.5, 0, Math.PI * 2);
  else if (kind === "square") ctx.rect(x - s * 0.42, y - s * 0.42, s * 0.84, s * 0.84);
  else if (kind === "diamond") {
    ctx.moveTo(x, y - s * 0.58);
    ctx.lineTo(x + s * 0.45, y);
    ctx.lineTo(x, y + s * 0.58);
    ctx.lineTo(x - s * 0.45, y);
    ctx.closePath();
  } else {
    ctx.moveTo(x, y - s * 0.5);
    ctx.lineTo(x + s * 0.52, y + s * 0.42);
    ctx.lineTo(x - s * 0.52, y + s * 0.42);
    ctx.closePath();
  }
  ctx.fill();
}

// ── glyphs (drawn centered at 0,0 with nominal size s) ──

function glyphSkip(ctx: Ctx2D, s: number) {
  ctx.lineWidth = s * 0.16;
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-s * 0.3, s * 0.3);
  ctx.lineTo(s * 0.3, -s * 0.3);
  ctx.stroke();
}

function glyphSkipAll(ctx: Ctx2D, s: number) {
  ctx.save();
  ctx.translate(-s * 0.18, -s * 0.12);
  glyphSkip(ctx, s * 0.7);
  ctx.restore();
  ctx.save();
  ctx.translate(s * 0.2, s * 0.16);
  glyphSkip(ctx, s * 0.7);
  ctx.restore();
}

function arrow(ctx: Ctx2D, s: number) {
  // a curved arrow from bottom-left sweeping up to the right
  ctx.beginPath();
  ctx.moveTo(-s * 0.36, s * 0.12);
  ctx.quadraticCurveTo(-s * 0.36, -s * 0.3, s * 0.08, -s * 0.3);
  ctx.lineTo(s * 0.08, -s * 0.46);
  ctx.lineTo(s * 0.4, -s * 0.22);
  ctx.lineTo(s * 0.08, s * 0.02);
  ctx.lineTo(s * 0.08, -s * 0.14);
  ctx.quadraticCurveTo(-s * 0.2, -s * 0.14, -s * 0.2, s * 0.12);
  ctx.closePath();
  ctx.fill();
}

function glyphReverse(ctx: Ctx2D, s: number) {
  ctx.save();
  ctx.translate(0, -s * 0.06);
  arrow(ctx, s);
  ctx.restore();
  ctx.save();
  ctx.rotate(Math.PI);
  ctx.translate(0, -s * 0.06);
  arrow(ctx, s);
  ctx.restore();
}

function glyphText(ctx: Ctx2D, text: string, s: number) {
  ctx.font = font(text.length > 2 ? s * 0.62 : s * 0.82);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, s * 0.04);
}

function glyphDiscardAll(ctx: Ctx2D, s: number) {
  ctx.lineWidth = s * 0.06;
  for (let i = -1; i <= 1; i++) {
    ctx.save();
    ctx.rotate(i * 0.32);
    ctx.translate(i * s * 0.08, -s * 0.06);
    roundRect(ctx, -s * 0.18, -s * 0.28, s * 0.36, s * 0.52, s * 0.07);
    ctx.globalAlpha = 0.5 + (i + 1) * 0.25;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  ctx.font = font(s * 0.2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("ALL", 0, s * 0.4);
}

function wheel(ctx: Ctx2D, r: number) {
  const colors: Color[] = ["red", "yellow", "green", "blue"];
  colors.forEach((c, i) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, (i * Math.PI) / 2 - Math.PI / 4, ((i + 1) * Math.PI) / 2 - Math.PI / 4);
    ctx.closePath();
    ctx.fillStyle = NEON[c];
    ctx.fill();
  });
}

function glyphRoulette(ctx: Ctx2D, s: number) {
  ctx.save();
  wheel(ctx, s * 0.42);
  ctx.fillStyle = "#0b0b16";
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = font(s * 0.24);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", 0, s * 0.02);
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.36);
  ctx.lineTo(-s * 0.08, -s * 0.54);
  ctx.lineTo(s * 0.08, -s * 0.54);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGlyph(ctx: Ctx2D, card: Pick<Card, "kind" | "value">, s: number) {
  switch (card.kind) {
    case "number": {
      ctx.font = font(s * 0.92);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(card.value), 0, s * 0.05);
      if (card.value === 6 || card.value === 9) ctx.fillRect(-s * 0.2, s * 0.44, s * 0.4, s * 0.07);
      return;
    }
    case "skip":
      return glyphSkip(ctx, s);
    case "skip_all":
      return glyphSkipAll(ctx, s);
    case "reverse":
      return glyphReverse(ctx, s);
    case "draw2":
      return glyphText(ctx, "+2", s);
    case "draw4":
    case "wild4":
      return glyphText(ctx, "+4", s);
    case "wild6":
      return glyphText(ctx, "+6", s);
    case "wild10":
      return glyphText(ctx, "+10", s);
    case "discard_all":
      return glyphDiscardAll(ctx, s);
    case "wild_reverse4":
      ctx.save();
      ctx.translate(0, -s * 0.14);
      glyphReverse(ctx, s * 0.62);
      ctx.restore();
      ctx.save();
      ctx.translate(0, s * 0.3);
      glyphText(ctx, "+4", s * 0.5);
      ctx.restore();
      return;
    case "wild_roulette":
      return glyphRoulette(ctx, s);
    case "wild":
      ctx.font = font(s * 0.3);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("WILD", 0, s * 0.03);
      return;
  }
}

const CORNER_TEXT: Partial<Record<CardKind, string>> = {
  draw2: "+2",
  draw4: "+4",
  wild4: "+4",
  wild6: "+6",
  wild10: "+10",
  wild: "W",
};

function drawCorner(ctx: Ctx2D, card: Pick<Card, "kind" | "value" | "color">, x: number, y: number, flip: boolean) {
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.rotate(Math.PI);
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  const s = 92;
  if (card.kind === "number" || CORNER_TEXT[card.kind]) {
    const t = card.kind === "number" ? String(card.value) : CORNER_TEXT[card.kind]!;
    ctx.font = font(t.length > 2 ? 46 : t.length > 1 ? 56 : 74);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t, 0, 0);
    if (card.kind === "number" && (card.value === 6 || card.value === 9)) ctx.fillRect(-14, 36, 28, 6);
  } else if (card.kind === "wild_roulette") {
    ctx.shadowBlur = 0;
    wheel(ctx, 28);
  } else {
    drawGlyph(ctx, card, s * 0.62);
  }
  if (card.color) {
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.85;
    shape(ctx, SHAPES[card.color], 0, 62, 22);
  }
  ctx.restore();
}

function paintFace(card: Pick<Card, "kind" | "value" | "color">): HTMLCanvasElement {
  const [c, ctx] = canvas(W, H);
  const color = card.color;

  // body
  roundRect(ctx, 0, 0, W, H, R);
  ctx.save();
  ctx.clip();
  if (color) {
    const [light, mid, dark] = SHADES[color];
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, light);
    g.addColorStop(0.45, mid);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#1b1530");
    g.addColorStop(1, "#07060f");
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, W, H);

  // subtle diagonal sheen lines
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  for (let i = -H; i < W; i += 26) {
    ctx.beginPath();
    ctx.moveTo(i, H);
    ctx.lineTo(i + H, 0);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // central tilted lens
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.42);
  ctx.beginPath();
  ctx.ellipse(0, 0, W * 0.4, H * 0.36, 0, 0, Math.PI * 2);
  if (color) {
    const lg = ctx.createRadialGradient(0, -40, 20, 0, 0, W * 0.45);
    lg.addColorStop(0, "#1c1c30");
    lg.addColorStop(1, "#08080f");
    ctx.fillStyle = lg;
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.stroke();
  } else {
    ctx.save();
    ctx.clip();
    ctx.rotate(0.42);
    wheel(ctx, W * 0.6);
    ctx.restore();
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.stroke();
  }
  ctx.restore();

  // big glyph
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.fillStyle = color ? NEON[color] : "#ffffff";
  ctx.strokeStyle = ctx.fillStyle;
  ctx.shadowColor = color ? NEON[color] : "rgba(0,0,0,0.6)";
  ctx.shadowBlur = color ? 26 : 18;
  if (!color) {
    ctx.shadowOffsetY = 4;
  }
  drawGlyph(ctx, card, 300);
  ctx.restore();

  // glossy highlight
  const hl = ctx.createLinearGradient(0, 0, W * 0.6, H * 0.6);
  hl.addColorStop(0, "rgba(255,255,255,0.28)");
  hl.addColorStop(0.35, "rgba(255,255,255,0.04)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hl;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // inner border
  roundRect(ctx, 14, 14, W - 28, H - 28, R - 12);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.stroke();

  drawCorner(ctx, card, 70, 82, false);
  drawCorner(ctx, card, W - 70, H - 82, true);
  return c;
}

function paintGlow(card: Pick<Card, "kind" | "value" | "color">): HTMLCanvasElement {
  const gw = 128;
  const gh = 192;
  const [c, ctx] = canvas(gw, gh);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, gw, gh);
  ctx.save();
  ctx.translate(gw / 2, gh / 2);
  const col = card.color ? NEON[card.color] : "#ffffff";
  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  ctx.globalAlpha = card.color ? 1 : 0.55;
  drawGlyph(ctx, card, 75);
  ctx.restore();
  return c;
}

function paintBack(): HTMLCanvasElement {
  const [c, ctx] = canvas(W, H);
  roundRect(ctx, 0, 0, W, H, R);
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#1a1240");
  g.addColorStop(0.5, "#0b0a1d");
  g.addColorStop(1, "#200a2e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // hex grid
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#8f7bff";
  ctx.lineWidth = 2;
  const hs = 34;
  for (let row = -1; row < H / (hs * 0.86) + 1; row++) {
    for (let col = -1; col < W / (hs * 1.5) + 1; col++) {
      const x = col * hs * 1.5;
      const y = row * hs * 1.72 + (col % 2 ? hs * 0.86 : 0);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k;
        ctx[k ? "lineTo" : "moveTo"](x + Math.cos(a) * hs * 0.55, y + Math.sin(a) * hs * 0.55);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.42);
  ctx.beginPath();
  ctx.ellipse(0, 0, W * 0.38, H * 0.3, 0, 0, Math.PI * 2);
  const lg = ctx.createLinearGradient(-W * 0.4, 0, W * 0.4, 0);
  lg.addColorStop(0, NEON.blue);
  lg.addColorStop(0.35, NEON.wild);
  lg.addColorStop(0.7, NEON.red);
  lg.addColorStop(1, NEON.yellow);
  ctx.lineWidth = 12;
  ctx.strokeStyle = lg;
  ctx.shadowColor = NEON.wild;
  ctx.shadowBlur = 30;
  ctx.stroke();
  ctx.fillStyle = "rgba(5,5,12,0.75)";
  ctx.fill();
  ctx.shadowBlur = 24;
  ctx.font = font(78);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = lg;
  ctx.fillText(BRAND.name, 0, 4);
  ctx.restore();

  roundRect(ctx, 14, 14, W - 28, H - 28, R - 12);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(160,140,255,0.45)";
  ctx.stroke();
  return c;
}

function toTexture(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

type FaceSpec = Pick<Card, "kind" | "value" | "color">;
const faceCache = new Map<string, { map: THREE.CanvasTexture; glow: THREE.CanvasTexture; spec: FaceSpec }>();
let backTex: THREE.CanvasTexture | null = null;

export function faceTextures(card: FaceSpec) {
  const key = faceKey(card);
  let t = faceCache.get(key);
  if (!t) {
    const spec = { kind: card.kind, value: card.value, color: card.color };
    t = { map: toTexture(paintFace(spec)), glow: toTexture(paintGlow(spec)), spec };
    faceCache.set(key, t);
  }
  return t;
}

export function backTexture(): THREE.CanvasTexture {
  return (backTex ??= toTexture(paintBack()));
}

/** Redraw textures once the display font has loaded (first paint may use a fallback). */
export function refreshTexturesWhenFontsReady() {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const fam = displayFamily();
  Promise.all([document.fonts.load(`900 40px ${fam}`), document.fonts.ready]).then(() => {
    for (const t of faceCache.values()) {
      t.map.image = paintFace(t.spec);
      t.map.needsUpdate = true;
      t.glow.image = paintGlow(t.spec);
      t.glow.needsUpdate = true;
    }
    if (backTex) {
      backTex.image = paintBack();
      backTex.needsUpdate = true;
    }
  });
}
