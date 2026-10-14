"use client";

import * as THREE from "three";
import type { Card, CardKind, Color } from "@/engine";
import { faceKey } from "@/engine/cards";
import { BRAND, NEON } from "@/brand";

/**
 * Card faces are drawn in code (original NEONO art) and cached as textures:
 * a white border, a bright body, a light tilted lens and a chunky outlined glyph.
 */

const W = 512;
const H = 768;
const R = 46;
/** white card-stock border */
const BORDER = 24;
/** dark outline around glyphs and corner indices */
const INK = "#14213d";

const SHADES: Record<Color | "wild", [string, string, string]> = {
  red: ["#ff6a63", "#f0303a", "#cc1626"],
  yellow: ["#ffe46b", "#ffcf1a", "#f0a500"],
  green: ["#6fdc7d", "#2fb84c", "#1c8f37"],
  blue: ["#5aa2ff", "#1f74e8", "#1556bf"],
  wild: ["#b48aff", "#8a3ffc", "#6424d6"],
};

/** Pale tint of each color for the lens. */
const TINT: Record<Color, string> = {
  red: "#ffe3e1",
  yellow: "#fff6d2",
  green: "#e2f7e5",
  blue: "#e0edff",
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
  ctx.fillStyle = INK;
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

let scratch: [HTMLCanvasElement, Ctx2D] | null = null;

/**
 * Draws `draw` (centered at x,y) with a thick ink outline and an optional drop shadow.
 * The outline is a solid silhouette of the glyph stamped in a small circle around it,
 * which works for text, strokes and filled shapes alike.
 */
function outlined(ctx: Ctx2D, x: number, y: number, flip: boolean, draw: (c: Ctx2D) => void, fill: string, thickness: number, shadow = 0) {
  scratch ??= canvas(W, H);
  const [sil, sx] = scratch;
  sx.setTransform(1, 0, 0, 1, 0, 0);
  sx.globalCompositeOperation = "source-over";
  sx.globalAlpha = 1;
  sx.clearRect(0, 0, W, H);
  sx.translate(W / 2, H / 2);
  if (flip) sx.rotate(Math.PI);
  sx.fillStyle = sx.strokeStyle = INK;
  draw(sx);
  sx.setTransform(1, 0, 0, 1, 0, 0);
  sx.globalCompositeOperation = "source-in";
  sx.globalAlpha = 1;
  sx.fillStyle = INK;
  sx.fillRect(0, 0, W, H);

  const ox = x - W / 2;
  const oy = y - H / 2;
  if (shadow) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.drawImage(sil, ox + shadow * 0.4, oy + shadow);
    ctx.restore();
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    ctx.drawImage(sil, ox + Math.cos(a) * thickness, oy + Math.sin(a) * thickness);
  }
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.rotate(Math.PI);
  ctx.fillStyle = ctx.strokeStyle = fill;
  draw(ctx);
  ctx.restore();
}

function cornerMark(card: Pick<Card, "kind" | "value" | "color">) {
  return (ctx: Ctx2D) => {
    if (card.kind === "number" || CORNER_TEXT[card.kind]) {
      const t = card.kind === "number" ? String(card.value) : CORNER_TEXT[card.kind]!;
      ctx.font = font(t.length > 2 ? 44 : t.length > 1 ? 54 : 70);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t, 0, 0);
      if (card.kind === "number" && (card.value === 6 || card.value === 9)) ctx.fillRect(-14, 34, 28, 6);
    } else if (card.kind === "wild_roulette") {
      wheel(ctx, 26);
    } else {
      drawGlyph(ctx, card, 56);
    }
    // color-blind helper shape under the index
    if (card.color) shape(ctx, SHAPES[card.color], 0, 60, 20);
  };
}

/** White card stock with the bright body inset by the border. */
function cardBody(ctx: Ctx2D, top: string, mid: string, bottom: string) {
  roundRect(ctx, 0, 0, W, H, R);
  ctx.fillStyle = "#fffdf8";
  ctx.fill();
  roundRect(ctx, BORDER, BORDER, W - BORDER * 2, H - BORDER * 2, R - 14);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, top);
  g.addColorStop(0.5, mid);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fill();
}

function clipBody(ctx: Ctx2D) {
  roundRect(ctx, BORDER, BORDER, W - BORDER * 2, H - BORDER * 2, R - 14);
  ctx.clip();
}

/** `tint`: the color picked for a played wild, which replaces its purple body. */
function paintFace(card: Pick<Card, "kind" | "value" | "color">, tint: Color | null = null): HTMLCanvasElement {
  const [c, ctx] = canvas(W, H);
  const color = card.color;
  const [light, mid, dark] = SHADES[color ?? tint ?? "wild"];
  cardBody(ctx, light, mid, dark);

  ctx.save();
  clipBody(ctx);

  // subtle diagonal sheen lines
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  for (let i = -H; i < W; i += 26) {
    ctx.beginPath();
    ctx.moveTo(i, H);
    ctx.lineTo(i + H, 0);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // central tilted lens: light on colored cards, the color wheel on wilds
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.42);
  ctx.beginPath();
  ctx.ellipse(0, 0, W * 0.37, H * 0.33, 0, 0, Math.PI * 2);
  if (color) {
    const lg = ctx.createRadialGradient(-30, -60, 20, 0, 0, W * 0.42);
    lg.addColorStop(0, "#ffffff");
    lg.addColorStop(1, TINT[color]);
    ctx.fillStyle = lg;
    ctx.fill();
  } else {
    ctx.save();
    ctx.clip();
    ctx.rotate(0.42);
    wheel(ctx, W * 0.6);
    ctx.restore();
  }
  ctx.lineWidth = 9;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.restore();

  // glossy highlight
  const hl = ctx.createLinearGradient(0, 0, W * 0.6, H * 0.6);
  hl.addColorStop(0, "rgba(255,255,255,0.26)");
  hl.addColorStop(0.35, "rgba(255,255,255,0.04)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hl;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // big glyph in the card color (white on wilds), outlined in ink
  outlined(ctx, W / 2, H / 2, false, (g) => drawGlyph(g, card, 300), color ? mid : "#ffffff", 9, 12);

  outlined(ctx, 78, 92, false, cornerMark(card), "#ffffff", 5);
  outlined(ctx, W - 78, H - 92, true, cornerMark(card), "#ffffff", 5);
  return c;
}

function paintBack(): HTMLCanvasElement {
  const [c, ctx] = canvas(W, H);
  cardBody(ctx, "#4b95ff", "#1f64dc", "#1546a8");

  ctx.save();
  clipBody(ctx);
  // light hex grid
  ctx.globalAlpha = 0.1;
  ctx.strokeStyle = "#ffffff";
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

  // red lens with a gold rim
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.42);
  ctx.beginPath();
  ctx.ellipse(0, 0, W * 0.37, H * 0.3, 0, 0, Math.PI * 2);
  const lg = ctx.createRadialGradient(-30, -50, 10, 0, 0, W * 0.42);
  lg.addColorStop(0, "#ff6b55");
  lg.addColorStop(1, "#d8141f");
  ctx.fillStyle = lg;
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = "#ffcf1a";
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // wordmark: yellow with an ink outline
  ctx.font = font(84);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 16;
  ctx.strokeStyle = INK;
  ctx.strokeText(BRAND.name, 0, 4);
  ctx.fillStyle = "#ffd84a";
  ctx.fillText(BRAND.name, 0, 4);
  ctx.restore();
  return c;
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

type FaceSpec = Pick<Card, "kind" | "value" | "color">;
const faceCache = new Map<string, { map: THREE.CanvasTexture; spec: FaceSpec; tint: Color | null }>();
let backTex: THREE.CanvasTexture | null = null;

export function faceTextures(card: FaceSpec, tint: Color | null = null) {
  const wildTint = card.color ? null : tint;
  const key = `${faceKey(card)}@${wildTint ?? ""}`;
  let t = faceCache.get(key);
  if (!t) {
    const spec = { kind: card.kind, value: card.value, color: card.color };
    t = { map: toTexture(paintFace(spec, wildTint)), spec, tint: wildTint };
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
      t.map.image = paintFace(t.spec, t.tint);
      t.map.needsUpdate = true;
    }
    if (backTex) {
      backTex.image = paintBack();
      backTex.needsUpdate = true;
    }
  });
}
