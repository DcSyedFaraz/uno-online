"use client";

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { teamColor, type PublicPlayer, type PublicView } from "@/engine";
import { BOT_DELAY_MIN, BOT_DELAY_SPREAD } from "@/engine/state";
import { BRAND, NEON } from "@/brand";
import { playCard } from "@/client/actions";
import { serverNow } from "@/client/clock";
import { useGame } from "@/client/store/game-store";
import { useUi } from "@/ui/uiStore";
import { avatarBitmap, isCharacter, type Mood } from "@/client/avatars";
import { COLOR_HEX, sceneRef, useScene } from "../sceneStore";
import { useSmallScreen } from "./SeatChips";

/**
 * Opponents' avatars live in the 3D scene (not the DOM) so the cards they hold up can stand
 * in front of them, like a player peeking over their hand. Each one is a sprite that keeps a
 * fixed size on screen, painted from a small canvas: name pill on top, avatar circle below.
 */

/** How high above the table edge the avatar circle floats. */
export const AVATAR_LIFT = 0.5;
/** Canvas pixels per layout pixel (keeps the sprite sharp on high-DPI screens). */
const RES = 2;
const W = 140;

export interface ChipLayout {
  size: number;
  pillH: number;
  /** total height and the avatar circle's centre, in layout px from the top */
  h: number;
  cy: number;
}

/** Avatar circle size in CSS px: a little smaller on phones and at crowded tables. */
export function chipSize(small: boolean, players: number): number {
  const crowded = players >= 8;
  return small ? (crowded ? 36 : 42) : crowded ? 52 : 60;
}

export function chipLayout(size: number, small: boolean): ChipLayout {
  const pillH = small ? 16 : 20;
  const cy = 2 + pillH + 5 + 12 + size / 2;
  return { size, pillH, h: cy + size / 2 + 14, cy };
}

interface ChipState {
  p: PublicPlayer;
  turn: boolean;
  online: boolean;
  host: boolean;
  out: boolean;
  swap: boolean;
  points: boolean;
  team: string | null;
  /** 0..1 of the turn timer left (only while it's their turn) */
  timer: number;
  timerColor: string;
  /** 0..1 phase of the turn ripple */
  ripple: number;
  /** the character in its current mood, rasterised (null: legacy emoji, or still loading) */
  face: HTMLCanvasElement | null;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

const EMOJI_FONT = `"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;

function paintChip(ctx: CanvasRenderingContext2D, L: ChipLayout, s: ChipState) {
  const { p } = s;
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  ctx.clearRect(0, 0, W, L.h);
  const cx = W / 2;
  const r = L.size / 2;
  ctx.globalAlpha = s.out ? 0.45 : 1;

  // name pill on top (so the player's own cards never hide it)
  const font = `800 ${L.pillH <= 16 ? 9.5 : 11}px ui-sans-serif, system-ui, sans-serif`;
  ctx.font = font;
  let label = `${p.isBot && !p.takenOver ? "🤖 " : ""}${p.name}`;
  if (s.points) label += ` · ${p.score}`;
  if (p.takenOver) label += " · 🤖";
  else if (p.autopilot) label += " · away";
  else if (!s.online) label += " · offline";
  if (s.out) label += p.status === "left" ? " · LEFT" : " · OUT";
  const maxW = W - 12;
  while (ctx.measureText(label).width > maxW - 16 && label.length > 4) label = label.slice(0, -2) + "…";
  const pw = Math.min(maxW, ctx.measureText(label).width + 16);
  const py = 2;
  roundRect(ctx, cx - pw / 2, py, pw, L.pillH, L.pillH / 2);
  ctx.fillStyle = s.turn ? "#ffcf1a" : "#1d5fd6";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = s.team ?? "rgba(255,255,255,0.85)";
  ctx.stroke();
  ctx.fillStyle = s.turn ? "#14213d" : "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, py + L.pillH / 2 + 0.5);

  const cy = L.cy;
  // turn: soft gold glow and an expanding ripple
  if (s.turn) {
    ctx.save();
    ctx.globalAlpha *= 0.5 * (1 - s.ripple);
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3 + s.ripple * 11, 0, Math.PI * 2);
    ctx.fillStyle = "#ffcf1a";
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.shadowColor = "rgba(255,207,26,0.9)";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.fillStyle = "#ffcf1a";
    ctx.fill();
    ctx.restore();
  }
  // outer rings: team colour (team play), then white
  const ring = s.swap ? NEON.wild : s.turn ? "#ffffff" : s.team;
  if (ring) {
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4.5, 0, Math.PI * 2);
    ctx.fillStyle = ring;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  // the face
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "#d4e4ff");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  // timer arc (drawn under the face, which is inset on their turn so the arc shows around it)
  if (s.turn) {
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(20,33,61,0.18)";
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = s.timer < 0.25 ? NEON.red : s.timerColor;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.timer);
    ctx.stroke();
  }
  ctx.save();
  // greyed out while offline (Safari's canvas has no filter, so it just fades there)
  if (!s.online) {
    ctx.filter = "grayscale(1)";
    if (ctx.filter !== "grayscale(1)") ctx.globalAlpha *= 0.55;
  }
  if (s.face) {
    ctx.beginPath();
    ctx.arc(cx, cy, s.turn ? r - 5 : r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(s.face, cx - r, cy - r, r * 2, r * 2);
  } else if (!isCharacter(p.avatar)) {
    ctx.font = `${Math.round(L.size * 0.5)}px ${EMOJI_FONT}`;
    ctx.fillText(p.avatar, cx, cy + L.size * 0.04);
  }
  ctx.restore();

  // card count bubble (gold "UNO!" once they've shouted with one card left)
  if (p.status === "active" && p.cardCount > 0) {
    const shout = p.saidUno && p.cardCount === 1;
    const text = shout ? BRAND.shout : String(p.cardCount);
    ctx.font = `900 11px ui-sans-serif, system-ui, sans-serif`;
    const bw = Math.max(22, ctx.measureText(text).width + 12);
    const bx = cx + r * 0.62;
    const by = cy - r * 0.95;
    roundRect(ctx, bx - bw / 2, by - 10, bw, 20, 10);
    ctx.fillStyle = p.cardCount === 1 ? "#ffcf1a" : "#ffffff";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(20,33,61,0.25)";
    ctx.stroke();
    ctx.fillStyle = "#14213d";
    ctx.fillText(text, bx, by + 0.5);
  }
  if (s.host) {
    ctx.font = `13px ${EMOJI_FONT}`;
    ctx.fillText("👑", cx - r * 0.8, cy - r * 0.95);
  }
  ctx.globalAlpha = 1;
}

function Avatar({ p, pub, small }: { p: PublicPlayer; pub: PublicView; small: boolean }) {
  const sprite = useRef<THREE.Sprite>(null);
  const presence = useGame((s) => s.presence);
  const picker = useGame((s) => s.picker);
  const spectator = useGame((s) => s.spectator);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const viewH = useThree((s) => s.size.height);
  const size = chipSize(small, pub.players.length);
  const L = useMemo(() => chipLayout(size, small), [size, small]);

  const turn = pub.phase === "playing" && pub.turnPlayerId === p.id;
  const mood = useScene((st) => st.moods[p.id]);
  const state: Omit<ChipState, "timer" | "ripple" | "face"> = {
    p,
    turn,
    online: p.isBot || presence.length === 0 || presence.includes(p.id),
    host: p.id === pub.hostId,
    out: p.status !== "active" && pub.phase === "playing",
    swap: picker?.kind === "swap" && p.status === "active",
    points: pub.settings.winMode === "points",
    team: teamColor(pub, p.id),
    timerColor: pub.currentColor ? COLOR_HEX[pub.currentColor] : COLOR_HEX.wild,
  };

  const { canvas, ctx, tex, mat } = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    // depth-tested, so held cards and the table rim can cover it; untouched by fog and tone mapping
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, sizeAttenuation: false, fog: false, toneMapped: false });
    return { canvas, ctx, tex, mat };
  }, []);
  useEffect(
    () => () => {
      tex.dispose();
      mat.dispose();
    },
    [tex, mat],
  );

  // repaint when anything shown changes; the active seat also repaints its timer below,
  // and every seat repaints to blink now and then
  const key = JSON.stringify(state) + L.size + (mood ?? "");
  const live = useRef(state);
  const blinking = useRef(false);
  const tick = useRef({ timer: 1, ripple: 0 });
  useLayoutEffect(() => {
    live.current = state;
  });
  const paint = useRef(() => {});
  useLayoutEffect(() => {
    paint.current = () => {
      const m: Mood = useScene.getState().moods[p.id] ?? (blinking.current ? "blink" : "idle");
      const px = Math.round(L.size * RES);
      // until the mood's face is ready, show the resting one (and repaint once it loads)
      const face = avatarBitmap(p.avatar, m, px, () => paint.current()) ?? avatarBitmap(p.avatar, "idle", px, () => paint.current());
      paintChip(ctx, L, { ...live.current, ...tick.current, face });
      tex.needsUpdate = true;
    };
  });
  useEffect(() => {
    const w = W * RES;
    const h = Math.ceil(L.h * RES);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      // three allocates a texture's GPU storage once; a resized canvas would only overwrite part of it
      tex.dispose();
    }
    tick.current = { timer: 1, ripple: 0 };
    paint.current();
  }, [key, canvas, tex, L]);
  // a new expression pops the avatar a little
  const popAt = useRef(-1);
  useEffect(() => {
    if (mood) popAt.current = performance.now();
  }, [mood]);

  const lastPaint = useRef(0);
  const nextBlink = useRef(performance.now() + 1500 + Math.random() * 4000);
  const scale = useRef(1);
  useFrame((st, dt) => {
    const s = sprite.current;
    const seat = sceneRef.seats.get(p.id);
    if (!s || !seat) return;
    s.position.copy(seat.chip).setY(seat.chip.y + AVATAR_LIFT);
    // fixed on-screen size: one layout px = this many units at distance 1
    const k = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, viewH);
    scale.current = THREE.MathUtils.damp(scale.current, live.current.turn ? 1.18 : 1, 10, dt);
    const now = performance.now();
    const since = (now - popAt.current) / 450;
    const pop = popAt.current >= 0 && since < 1 ? 1 + 0.16 * Math.sin(since * Math.PI) * (1 - since) : 1;
    s.scale.set(W * k * scale.current * pop, L.h * k * scale.current * pop, 1);
    s.center.set(0.5, (L.h - L.cy) / L.h);
    let repaint = false;
    if (live.current.turn && st.clock.elapsedTime - lastPaint.current > 1 / 15) {
      lastPaint.current = st.clock.elapsedTime;
      const g = useGame.getState().pub;
      let timer = 1;
      if (g?.deadline) {
        const turnMs = (g.settings.turnTimerSec ?? 0) * 1000;
        const total = Math.max(1, Math.min(g.deadline - g.turnStartedAt, turnMs || BOT_DELAY_MIN + BOT_DELAY_SPREAD));
        timer = Math.max(0, Math.min(1, (g.deadline - serverNow()) / total));
      }
      tick.current = { timer, ripple: (st.clock.elapsedTime * 0.9) % 1 };
      repaint = true;
    }
    if (now > nextBlink.current) {
      blinking.current = !blinking.current;
      nextBlink.current = now + (blinking.current ? 140 : 2200 + Math.random() * 3800);
      repaint ||= isCharacter(p.avatar) && !useScene.getState().moods[p.id];
    }
    if (repaint) paint.current();
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const g = useGame.getState();
    const pk = g.picker;
    if (pk?.kind === "swap" && p.status === "active") {
      void playCard(pk.cardId, { swapTargetId: p.id, color: pk.color as never });
      return;
    }
    if (!spectator && p.id !== g.you) useUi.getState().setThrowTarget(p.id);
  };

  return (
    <sprite
      ref={sprite}
      material={mat}
      renderOrder={2}
      onClick={onClick}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    />
  );
}

/** Every seat's avatar except yours (a spectator sees them all). */
export function SeatAvatars() {
  const pub = useGame((s) => s.pub);
  const you = useGame((s) => s.you);
  const small = useSmallScreen();
  if (!pub || pub.phase === "lobby") return null;
  return (
    <>
      {pub.players.map((p) => (p.id === you ? null : <Avatar key={p.id} p={p} pub={pub} small={small} />))}
    </>
  );
}
