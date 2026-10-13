"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { PublicPlayer } from "@/engine";
import { UNO_CATCH_GRACE_MS } from "@/engine/uno";
import { BOT_DELAY_MIN, BOT_DELAY_SPREAD } from "@/engine/state";
import { BRAND } from "@/brand";
import { playCard, sendAction } from "@/client/actions";
import { serverNow } from "@/client/clock";
import { useGame } from "@/client/store/game-store";
import { COLOR_HEX, sceneRef, useScene, type FxTone } from "../sceneStore";

export const TONE: Record<FxTone, string> = {
  red: "#ff3b5c",
  gold: "#ffd23f",
  blue: "#3b9eff",
  white: "#ffffff",
  green: "#2bff88",
  wild: "#c58bff",
};

/** Countdown ring that drains as the turn deadline approaches. */
export function TimerRing({ size, color }: { size: number; color: string }) {
  const circle = useRef<SVGCircleElement>(null);
  const deadline = useGame((s) => s.pub?.deadline ?? null);
  const startedAt = useGame((s) => s.pub?.turnStartedAt ?? 0);
  const timer = useGame((s) => (s.pub?.settings.turnTimerSec ?? 0) * 1000);
  useEffect(() => {
    let raf = 0;
    const r = size / 2 - 3;
    const len = 2 * Math.PI * r;
    const loop = () => {
      const c = circle.current;
      if (c) {
        let frac = 1;
        if (deadline) {
          const total = Math.max(1, Math.min(deadline - startedAt, timer || BOT_DELAY_MIN + BOT_DELAY_SPREAD));
          frac = Math.max(0, Math.min(1, (deadline - serverNow()) / total));
        }
        c.style.strokeDasharray = `${len}`;
        c.style.strokeDashoffset = `${len * (1 - frac)}`;
        c.style.stroke = frac < 0.25 && deadline ? "#ff3b5c" : color;
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [deadline, startedAt, timer, size, color]);
  return (
    <svg width={size} height={size} className="absolute inset-0 -rotate-90 pointer-events-none">
      <circle cx={size / 2} cy={size / 2} r={size / 2 - 3} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={3} />
      <circle ref={circle} cx={size / 2} cy={size / 2} r={size / 2 - 3} fill="none" strokeWidth={3.5} strokeLinecap="round" />
    </svg>
  );
}

export function SeatFxStack({ pid }: { pid: string }) {
  const all = useScene((s) => s.seatFx);
  const fx = useMemo(() => all.filter((f) => f.pid === pid), [all, pid]);
  return (
    <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2">
      <AnimatePresence>
        {fx.map((f) => (
          <motion.div
            key={f.id}
            initial={{ opacity: 0, y: 6, scale: 0.6 }}
            animate={{ opacity: 1, y: -34, scale: f.big ? 1.15 : 1 }}
            exit={{ opacity: 0, y: -60, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 380, damping: 18 }}
            className="font-display absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-lg font-black tracking-wide neon-text"
            style={{ color: TONE[f.tone] }}
          >
            {f.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function CatchButton({ pid }: { pid: string }) {
  const w = useGame((s) => s.pub?.unoWindow);
  const you = useGame((s) => s.you);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!w || w.playerId !== pid) return;
    const wait = Math.max(0, w.openedAt + UNO_CATCH_GRACE_MS - serverNow());
    const t = setTimeout(() => ref.current?.classList.remove("hidden"), wait);
    return () => clearTimeout(t);
  }, [w, pid]);
  if (!w || w.playerId !== pid || pid === you) return null;
  return (
    <button
      ref={ref}
      onClick={(e) => {
        e.stopPropagation();
        void sendAction({ type: "catch_uno", targetId: pid });
      }}
      className="hidden absolute -bottom-9 left-1/2 -translate-x-1/2 rounded-full bg-neon-red px-3 py-1 text-xs font-black text-white shadow-[0_0_20px_rgba(255,59,92,0.8)] animate-bounce"
    >
      CATCH!
    </button>
  );
}

function Chip({ p }: { p: PublicPlayer }) {
  const pub = useGame((s) => s.pub!);
  const presence = useGame((s) => s.presence);
  const picker = useGame((s) => s.picker);
  const isTurn = pub.turnPlayerId === p.id && pub.phase === "playing";
  const online = p.isBot || presence.length === 0 || presence.includes(p.id);
  const color = pub.currentColor ? COLOR_HEX[pub.currentColor] : COLOR_HEX.wild;
  const swapPick = picker?.kind === "swap" && p.status === "active";
  const out = p.status !== "active" && pub.phase === "playing";
  const size = 54;

  return (
    <div
      ref={(el) => {
        if (el) chipEls.set(p.id, el);
        else chipEls.delete(p.id);
      }}
      className="absolute left-0 top-0 will-change-transform"
      style={{ transform: "translate3d(-9999px,-9999px,0)" }}
    >
      <div
        className={`relative flex -translate-x-1/2 -translate-y-1/2 flex-col items-center select-none transition-opacity ${out ? "opacity-40" : ""}`}
        style={{ pointerEvents: swapPick ? "auto" : "none" }}
        onClick={() => swapPick && void playCard(picker.cardId, { swapTargetId: p.id, color: picker.color as never })}
      >
        <SeatFxStack pid={p.id} />
        <div
          className={`relative grid place-items-center rounded-full transition-all duration-300 ${swapPick ? "cursor-pointer ring-4 ring-neon-wild animate-pulse" : ""}`}
          style={{
            width: size,
            height: size,
            background: "radial-gradient(circle at 30% 25%, #2a2647, #0d0c1a)",
            boxShadow: isTurn ? `0 0 0 2px ${color}, 0 0 28px ${color}` : "0 6px 20px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.12)",
          }}
        >
          {isTurn && <TimerRing size={size} color={color} />}
          <span className="text-[26px] leading-none" style={{ filter: online ? "none" : "grayscale(1)" }}>
            {p.avatar}
          </span>
          {pub.phase === "playing" && p.status === "active" && (
            <span
              className="absolute -right-2 -top-1 min-w-[22px] rounded-full px-1.5 text-center text-[11px] font-bold leading-[20px] text-black"
              style={{ background: p.cardCount === 1 ? "#ffd23f" : "#f2f3ff", boxShadow: p.cardCount === 1 ? "0 0 14px #ffd23f" : undefined }}
            >
              {p.cardCount}
            </span>
          )}
          {p.id === pub.hostId && <span className="absolute -left-1.5 -top-2 text-sm">👑</span>}
        </div>
        <div className="mt-1 max-w-[110px] truncate rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white/90 backdrop-blur">
          {p.isBot ? "🤖 " : ""}
          {p.name}
          {p.autopilot ? " · away" : ""}
          {!online ? " · offline" : ""}
        </div>
        {pub.settings.winMode === "points" && <div className="text-[10px] text-white/50">{p.score} pts</div>}
        {p.saidUno && p.cardCount === 1 && (
          <div className="font-display mt-0.5 text-[10px] font-black text-neon-yellow neon-text">{BRAND.shout}</div>
        )}
        {out && <div className="font-display text-[10px] font-black text-neon-red">{p.status === "left" ? "LEFT" : "OUT"}</div>}
        <div style={{ pointerEvents: "auto" }}>
          <CatchButton pid={p.id} />
        </div>
      </div>
    </div>
  );
}

/** Chip elements by player id; positioned every frame by <SeatProjector/>. */
const chipEls = new Map<string, HTMLElement>();
const v = new THREE.Vector3();

/** Inside the canvas: projects each seat to the screen and moves its DOM chip there. */
export function SeatProjector() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useFrame(() => {
    for (const [pid, el] of chipEls) {
      const seat = sceneRef.seats.get(pid);
      if (!seat) continue;
      v.copy(seat.chip).project(camera);
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    }
  });
  return null;
}

/** Outside the canvas: opponents' avatar chips (DOM, so they stay crisp and interactive). */
export function SeatChips() {
  const pub = useGame((s) => s.pub);
  const you = useGame((s) => s.you);
  if (!pub || pub.phase === "lobby") return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[15] overflow-hidden">
      {pub.players.map((p) => (p.id === you ? null : <Chip key={p.id} p={p} />))}
    </div>
  );
}
