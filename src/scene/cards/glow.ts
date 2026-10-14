"use client";

import * as THREE from "three";

let tex: THREE.CanvasTexture | null = null;

/** Soft rounded-rectangle glow used as a halo behind playable cards. */
export function glowTexture(): THREE.CanvasTexture {
  if (tex) return tex;
  const w = 256;
  const h = 340;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  // a shadow cast from a shape drawn off-canvas: blurs everywhere (canvas `filter` doesn't on older Safari)
  const pad = 46;
  const r = 30;
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetX = w * 2;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.roundRect(pad - w * 2, pad, w - pad * 2, h - pad * 2, r);
  ctx.fill();
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let ring: THREE.CanvasTexture | null = null;

/** Radial glow dot for particles. */
export function dotTexture(): THREE.CanvasTexture {
  if (ring) return ring;
  const s = 64;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  ring = new THREE.CanvasTexture(c);
  return ring;
}
