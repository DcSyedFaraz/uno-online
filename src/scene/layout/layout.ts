"use client";

import * as THREE from "three";
import type { PublicPlayer } from "@/engine";
import { CARD_H, CARD_W } from "../cards/cardGeometry";

export interface TableDims {
  rx: number;
  rz: number;
  portrait: boolean;
  /** short landscape screens (phones): bigger hand, tighter framing */
  compact: boolean;
  deck: THREE.Vector3;
  discard: THREE.Vector3;
}

export const TABLE_RX = 4.5;
export const TABLE_RZ = 3.3;

/**
 * The table keeps the same shape on every screen; only the camera adapts.
 * `portrait` (narrow desktop windows) and `compact` (landscape phones) tune the camera and hand.
 */
export function tableDims(aspect: number, compact = false): TableDims {
  return {
    rx: TABLE_RX,
    rz: TABLE_RZ,
    portrait: aspect < 0.9,
    compact: compact && aspect >= 0.9,
    deck: new THREE.Vector3(-1.05, 0, -0.15),
    discard: new THREE.Vector3(1.0, 0, -0.15),
  };
}

export interface Seat {
  pid: string;
  /** seat order relative to you (0 = you) */
  rel: number;
  angle: number;
  /** where the avatar chip sits (table edge) */
  chip: THREE.Vector3;
  /** where this player's cards lie on the table */
  fan: THREE.Vector3;
  /** yaw so the fan faces the table center */
  yaw: number;
}

export function ellipsePoint(d: TableDims, angle: number, k: number, y = 0): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(angle) * d.rx * k, y, Math.sin(angle) * d.rz * k);
}

/**
 * You sit at the bottom. Opponents go clockwise from your left, over the top, to your right,
 * so the next player in normal direction is on your left.
 */
export function computeSeats(players: PublicPlayer[], you: string | null, d: TableDims): Map<string, Seat> {
  const seats = new Map<string, Seat>();
  const n = players.length;
  if (n === 0) return seats;
  const idx = players.findIndex((p) => p.id === you);
  // a spectator sits nowhere: everyone goes around the table and the bottom (the camera) stays empty
  if (idx < 0 && you) {
    const angles = opponentAngles(n, d);
    players.forEach((p, i) => {
      const angle = angles[i];
      const chip = ellipsePoint(d, angle, d.portrait ? 1.0 : 1.06, 0.05);
      const fan = ellipsePoint(d, angle, 0.7, 0.03);
      seats.set(p.id, { pid: p.id, rel: i + 1, angle, chip, fan, yaw: Math.atan2(fan.x, fan.z) });
    });
    return seats;
  }
  const me = Math.max(0, idx);
  const angles = opponentAngles(n - 1, d);
  for (let rel = 0; rel < n; rel++) {
    const p = players[(me + rel) % n];
    const angle = rel === 0 ? Math.PI / 2 : angles[rel - 1];
    const chip = ellipsePoint(d, angle, rel === 0 ? 0.96 : d.portrait ? 1.0 : 1.06, 0.05);
    // opponents hold their cards a little inside the rim, clear of their avatar chip
    const fan = ellipsePoint(d, angle, rel === 0 ? 0.62 : 0.7, 0.03);
    const yaw = Math.atan2(fan.x, fan.z);
    seats.set(p.id, { pid: p.id, rel, angle, chip, fan, yaw });
  }
  return seats;
}

/**
 * Spreads opponents from your left, over the far side, to your right, evenly by
 * on-screen distance (the far side of the oval looks squashed in perspective).
 */
function opponentAngles(k: number, d: TableDims): number[] {
  if (k <= 0) return [];
  if (k === 1) return [Math.PI * 1.5];
  const deg = THREE.MathUtils.degToRad;
  const extra = k >= 6 ? 18 : 6;
  const inset = k <= 3 ? 30 : 4;
  const start = deg(180 - extra + inset);
  const end = deg(360 + extra - inset);
  const squash = d.portrait ? 0.8 : d.compact ? 0.5 : 0.62;
  const N = 240;
  const cum: number[] = [0];
  let px = Math.cos(start) * d.rx;
  let pz = Math.sin(start) * d.rz * squash;
  for (let i = 1; i <= N; i++) {
    const a = start + ((end - start) * i) / N;
    const x = Math.cos(a) * d.rx;
    const z = Math.sin(a) * d.rz * squash;
    cum.push(cum[i - 1] + Math.hypot(x - px, z - pz));
    px = x;
    pz = z;
  }
  const total = cum[N];
  const out: number[] = [];
  let j = 0;
  for (let i = 0; i < k; i++) {
    const target = (total * i) / (k - 1);
    while (j < N && cum[j + 1] < target) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const f = Math.min(1, (target - cum[j]) / seg);
    out.push(start + ((end - start) * (j + f)) / N);
  }
  return out;
}

// ── orientation helpers ──
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

/** Lying flat on the table, face up, rotated by `yaw` around the vertical axis. */
export function flatFaceUp(yaw: number, out = new THREE.Quaternion()) {
  qa.setFromAxisAngle(Y, yaw);
  qb.setFromAxisAngle(X, -Math.PI / 2);
  return out.copy(qa).multiply(qb);
}

/** Lying flat, face down. */
export function flatFaceDown(yaw: number, out = new THREE.Quaternion()) {
  qa.setFromAxisAngle(Y, yaw);
  qb.setFromAxisAngle(X, Math.PI / 2);
  out.copy(qa).multiply(qb);
  qa.setFromAxisAngle(Z, Math.PI);
  return out.multiply(qa);
}

// ── opponents' hands: standing up, backs to the table, like a real hand seen from across ──

/** Size of an opponent's cards relative to a hand card. */
export const SEAT_CARD_SCALE = 0.92;
/** How far the held cards lean back toward their owner. */
const HAND_LEAN = 0.32;
const tmpN = new THREE.Vector3();

/**
 * A card held upright by the player at `yaw`: its face toward them (outward), its back toward
 * the table, leaning back a little and fanned by `roll` in its own plane.
 */
export function standingBack(yaw: number, roll = 0, out = new THREE.Quaternion()) {
  qa.setFromAxisAngle(Y, yaw);
  qb.setFromAxisAngle(X, HAND_LEAN);
  out.copy(qa).multiply(qb);
  qa.setFromAxisAngle(Z, roll);
  return out.multiply(qa);
}

/** Center of a seat's held hand (where cards fly to and from). */
export function seatHandCenter(seat: Seat, out = new THREE.Vector3()) {
  return out.copy(seat.fan).setY(0.04 + ((CARD_H * SEAT_CARD_SCALE) / 2) * Math.cos(HAND_LEAN));
}

/** Card `i` of `n` in a seat's held fan: spread along the table edge, outer cards tilted and lower. */
export function seatCardSlot(seat: Seat, i: number, n: number, outPos: THREE.Vector3, outQuat: THREE.Quaternion) {
  const spread = Math.min(0.2, 1.7 / Math.max(1, n));
  const off = (i - (n - 1) / 2) * spread;
  seatHandCenter(seat, outPos);
  // along the edge tangent (the card's own x axis), then a hair outward per card so neighbours never z-fight
  outPos.x += Math.cos(seat.yaw) * off;
  outPos.z -= Math.sin(seat.yaw) * off;
  tmpN.set(Math.sin(seat.yaw), 0, Math.cos(seat.yaw));
  outPos.addScaledVector(tmpN, i * 0.012);
  outPos.y -= off * off * 0.35;
  standingBack(seat.yaw, -off * 0.55, outQuat);
}

/** Stable pseudo-random number in [0,1) from a card id (for pile scatter). */
export function hash01(id: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/** Center piles are drawn bigger than hand-held cards so the top card is easy to read. */
export const PILE_SCALE = 1.7;
const TILT = new THREE.Quaternion();

/**
 * Discard pile slot. Older cards lie flat in a loose scatter; the top card is propped up
 * and tilted toward the camera so you can always see what you have to match.
 */
export function discardSlot(d: TableDims, cardId: string, index: number, outPos: THREE.Vector3, outQuat: THREE.Quaternion, top = false) {
  if (top) {
    const tilt = d.portrait ? 0.4 : d.compact ? 0.38 : 0.55;
    // raise it by half its tilted height so the near edge never sinks into the table
    const lift = ((CARD_H * PILE_SCALE) / 2) * Math.sin(tilt) + 0.07 + index * 0.006;
    outPos.set(d.discard.x, lift, d.discard.z + 0.1);
    flatFaceUp((hash01(cardId) - 0.5) * 0.18, outQuat);
    TILT.setFromAxisAngle(X, tilt);
    outQuat.premultiply(TILT);
    return;
  }
  // a tidy stack: small turns and offsets, so it reads as one pile
  const a = (hash01(cardId) - 0.5) * 0.45;
  outPos.set(d.discard.x + (hash01(cardId, 1) - 0.5) * 0.12, 0.045 + index * 0.006, d.discard.z + (hash01(cardId, 2) - 0.5) * 0.12);
  flatFaceUp(a, outQuat);
}

// ── your hand (camera space) ──

/** Vertical field of view the camera uses for this layout. */
export function cameraFov(portrait: boolean) {
  return portrait ? 46 : 38;
}

export interface HandParams {
  aspect: number;
  fovDeg: number;
  portrait: boolean;
  compact: boolean;
}

export const HAND_DIST = 4.2;

export interface HandSlot {
  pos: THREE.Vector3;
  rotZ: number;
  scale: number;
}

/** Gap in depth between neighbouring hand cards (keeps halos/overlays from bleeding into neighbours). */
export const HAND_Z_STEP = 0.02;

function handMetrics(hp: HandParams) {
  const vh = 2 * HAND_DIST * Math.tan(THREE.MathUtils.degToRad(hp.fovDeg) / 2);
  const vw = vh * hp.aspect;
  // card height as a share of the screen; phones in landscape get big cards like a real hand
  const hShare = hp.portrait ? 0.2 : hp.compact ? 0.3 : 0.235;
  const wShare = hp.portrait ? 0.2 : hp.compact ? 0.16 : 0.13;
  const s = Math.min((vh * hShare) / CARD_H, (vw * wShare) / CARD_W);
  // leave the corners free for your badge and the UNO! button
  const maxWidth = vw * (hp.portrait ? 0.7 : hp.compact ? 0.62 : 0.7);
  const margin = vh * (hp.compact ? 0.02 : 0.03);
  return { vh, vw, s, maxWidth, margin };
}

/** Fanned arc at the bottom of the screen, in camera-local coordinates. */
export function handSlot(n: number, i: number, hp: HandParams, lift: number, out: HandSlot) {
  const { vh, vw, s, maxWidth, margin } = handMetrics(hp);
  const natural = CARD_W * s * 0.7;
  const spacing = n > 1 ? Math.min(natural, (maxWidth - CARD_W * s) / (n - 1)) : 0;
  const x = (i - (n - 1) / 2) * spacing;
  const half = ((n - 1) / 2) * spacing;
  const norm = half > 0 ? x / Math.max(half, vw * 0.22) : 0;
  const bottom = -vh / 2 + margin;
  const y = bottom + (CARD_H * s) / 2 + (1 - norm * norm) * 0.09 * s;
  out.pos.set(x, y + lift * s, -HAND_DIST + i * HAND_Z_STEP + lift * 0.05);
  out.rotZ = -norm * 0.13;
  out.scale = s;
}

/** Screen pixels from the bottom edge to the top of the hand (with a playable card's lift). */
export function handTopPx(hp: HandParams, heightPx: number) {
  const { vh, s, margin } = handMetrics(hp);
  return ((margin + CARD_H * s + 0.15 * s) / vh) * heightPx;
}
