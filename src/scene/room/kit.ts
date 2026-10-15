"use client";

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Shared building blocks for the room props: cached geometries, materials and painted
 * textures, so ten chairs and a dozen props cost a handful of GPU resources.
 */

/** Height of the floor the furniture stands on (the table body ends just above it). */
export const FLOOR_Y = -0.72;

const geoms = new Map<string, THREE.BufferGeometry>();
function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoms.get(key) as T | undefined;
  if (!g) geoms.set(key, (g = make()));
  return g;
}

export const box = (w: number, h: number, d: number, r = 0.04) =>
  cached(`rb:${w}:${h}:${d}:${r}`, () => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)));
export const cyl = (rTop: number, rBottom: number, h: number, seg = 24) =>
  cached(`cy:${rTop}:${rBottom}:${h}:${seg}`, () => new THREE.CylinderGeometry(rTop, rBottom, h, seg));
export const sphere = (r: number, seg = 16) => cached(`sp:${r}:${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.75)));
export const ico = (r: number) => cached(`ic:${r}`, () => new THREE.IcosahedronGeometry(r, 0));
export const torus = (r: number, tube: number) => cached(`to:${r}:${tube}`, () => new THREE.TorusGeometry(r, tube, 10, 32));
export const plane = (w: number, h: number) => cached(`pl:${w}:${h}`, () => new THREE.PlaneGeometry(w, h));

const stdMats = new Map<string, THREE.MeshStandardMaterial>();
/** Lit, matte-ish material (the bright cartoon look: no environment, low metalness). */
export function mat(color: string, roughness = 0.6, metalness = 0, flat = false): THREE.MeshStandardMaterial {
  const key = `${color}:${roughness}:${metalness}:${flat}`;
  let m = stdMats.get(key);
  if (!m) stdMats.set(key, (m = new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: flat })));
  return m;
}

/** Gold trim: a little metal so it catches the key light without needing an environment map. */
export const GOLD = () => mat("#ffc22e", 0.35, 0.35);

const glowMats = new Map<string, THREE.MeshBasicMaterial>();
/** Unlit "lit-from-inside" surfaces: lamp shades, neon, screens. */
export function glow(color: string): THREE.MeshBasicMaterial {
  let m = glowMats.get(color);
  if (!m) glowMats.set(color, (m = new THREE.MeshBasicMaterial({ color })));
  return m;
}

const textures = new Map<string, THREE.Texture>();
export function paint(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, opts: { repeat?: number; aniso?: number } = {}) {
  const t = textures.get(key);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = opts.aniso ?? 8;
  if (opts.repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeat, opts.repeat);
  }
  textures.set(key, tex);
  return tex;
}

/** Soft dark blob that grounds furniture on the unlit floor (it can't receive real shadows). */
export function blobTexture() {
  return paint("blob", 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(30,0,6,0.6)");
    g.addColorStop(0.55, "rgba(30,0,6,0.32)");
    g.addColorStop(1, "rgba(30,0,6,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Warm light pool a lamp throws on the floor. */
export function lampPoolTexture() {
  return paint("lamp-pool", 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,236,170,0.75)");
    g.addColorStop(0.45, "rgba(255,214,130,0.32)");
    g.addColorStop(1, "rgba(255,200,110,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Contact shadow plus a warm glow ring around the table. */
export function tablePoolTexture() {
  return paint("table-pool", 512, 512, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(40,0,6,0.55)");
    g.addColorStop(0.42, "rgba(40,0,6,0.35)");
    g.addColorStop(0.5, "rgba(255,170,80,0.22)");
    g.addColorStop(0.75, "rgba(255,150,70,0.08)");
    g.addColorStop(1, "rgba(255,150,70,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

const decals = new Map<string, THREE.MeshBasicMaterial>();
/** Material for flat decals lying on the floor (shadows, light pools, rugs). */
export function decal(map: THREE.Texture, opacity = 1): THREE.MeshBasicMaterial {
  const key = `${map.uuid}:${opacity}`;
  let m = decals.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    decals.set(key, m);
  }
  return m;
}

/** Tiny deterministic random for prop details (book sizes, leaf tilts). */
export function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
