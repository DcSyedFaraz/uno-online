"use client";

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Card, Color } from "@/engine";
import { backTexture, faceTextures } from "./cardTextures";

export const CARD_W = 0.62;
export const CARD_H = 0.93;
export const CARD_T = 0.014;
const RADIUS = 0.056;

function roundedShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** UVs spanning the card rectangle (0..1), optionally mirrored for the back face. */
function remapUv(g: THREE.BufferGeometry, mirror: boolean) {
  const pos = g.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) + CARD_W / 2) / CARD_W;
    uv[i * 2] = mirror ? 1 - u : u;
    uv[i * 2 + 1] = (pos.getY(i) + CARD_H / 2) / CARD_H;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

let geometry: THREE.BufferGeometry | null = null;

/**
 * A thin rounded card in the XY plane, front facing +Z.
 * Groups: 0 = front face, 1 = back face, 2 = edge.
 */
export function cardGeometry(): THREE.BufferGeometry {
  if (geometry) return geometry;
  const shape = roundedShape(CARD_W, CARD_H, RADIUS);

  const front = new THREE.ShapeGeometry(shape, 6);
  remapUv(front, false);
  front.translate(0, 0, CARD_T / 2);

  const back = new THREE.ShapeGeometry(shape, 6);
  remapUv(back, false);
  back.rotateY(Math.PI);
  back.translate(0, 0, -CARD_T / 2);
  // rotateY mirrored X, so the UVs computed before rotation now read correctly from behind

  // side walls only: ExtrudeGeometry is non-indexed, group with materialIndex 1 holds the sides
  const extruded = new THREE.ExtrudeGeometry(shape, { depth: CARD_T, bevelEnabled: false, curveSegments: 6 });
  extruded.translate(0, 0, -CARD_T / 2);
  const sides = extruded.groups.find((gr) => gr.materialIndex === 1)!;
  const edge = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"] as const) {
    const a = extruded.getAttribute(name);
    edge.setAttribute(
      name,
      new THREE.BufferAttribute(a.array.slice(sides.start * a.itemSize, (sides.start + sides.count) * a.itemSize), a.itemSize),
    );
  }
  extruded.dispose();

  const parts = [front.toNonIndexed(), back.toNonIndexed(), edge];
  geometry = mergeGeometries(parts, true)!;
  geometry.computeBoundingSphere();
  return geometry;
}

// ── materials ──

const faceMats = new Map<string, THREE.MeshStandardMaterial>();
let backMat: THREE.MeshStandardMaterial | null = null;
let edgeMat: THREE.MeshStandardMaterial | null = null;

/**
 * Matte, satin-like card stock: no clearcoat, so there's no white glare on the faces.
 * `tint` recolors a played wild with the color that was picked.
 */
export function faceMaterial(card: Pick<Card, "kind" | "value" | "color">, tint: Color | null = null): THREE.MeshStandardMaterial {
  const wildTint = card.color ? null : tint;
  const key = `${card.color}:${card.kind}:${card.value ?? ""}:${wildTint ?? ""}`;
  let m = faceMats.get(key);
  if (!m) {
    const t = faceTextures(card, wildTint);
    m = new THREE.MeshStandardMaterial({ map: t.map, roughness: 0.72, metalness: 0 });
    faceMats.set(key, m);
  }
  return m;
}

export function backMaterial(): THREE.MeshStandardMaterial {
  return (backMat ??= new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.68, metalness: 0 }));
}

export function edgeMaterial(): THREE.MeshStandardMaterial {
  return (edgeMat ??= new THREE.MeshStandardMaterial({ color: "#fffdf8", roughness: 0.7 }));
}

export function cardMaterials(card: Pick<Card, "kind" | "value" | "color"> | null, tint: Color | null = null): THREE.Material[] {
  return [card ? faceMaterial(card, tint) : backMaterial(), backMaterial(), edgeMaterial()];
}
