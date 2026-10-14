"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { PublicPlayer } from "@/engine";
import { UNO_CATCH_GRACE_MS, UNO_WINDOW_MS } from "@/engine/uno";
import { BOT_DELAY_MIN, BOT_DELAY_SPREAD } from "@/engine/state";
import { BRAND, NEON } from "@/brand";
import { playCard, sendAction } from "@/client/actions";
import { serverNow } from "@/client/clock";
import { useGame } from "@/client/store/game-store";
import { COLOR_HEX, sceneRef, useScene, type FxTone } from "../sceneStore";

const isSmall = () => window.innerWidth < 640 || window.innerHeight < 520;

/** True on phone-sized screens, including phones in landscape (keeps chips compact). */
export function useSmallScreen() {
  const [small, setSmall] = useState(() => typeof window !== "undefined" && isSmall());
  useEffect(() => {
    const on = () => setSmall(isSmall());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return small;
}

/** Seat-badge text colors; always drawn with the ink outline (`toon-text`), so they read on the red stage. */
export const TONE: Record<FxTone, string> = {
  red: "#ff5a52",
  gold: "#ffd84a",
  blue: "#5aa8ff",
  white: "#ffffff",
  green: "#6fe07d",
  wild: "#c49bff",
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
        c.style.stroke = frac < 0.25 && deadline ? NEON.red : color;
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [deadline, startedAt, timer, size, color]);
  return (
    <svg width={size} height={size} className="absolute inset-0 -rotate-90 pointer-events-none">
      <circle cx={size / 2} cy={size / 2} r={size / 2 - 3} fill="none" stroke="rgba(20,33,61,0.18)" strokeWidth={3} />
      <circle ref={circle} cx={size / 2} cy={size / 2} r={size / 2 - 3} fill="none" strokeWidth={3.5} strokeLinecap="round" />
    </svg>
  );
}

/** Gold double ring plus glow on the avatar of whoever's turn it is. */
export const TURN_SHADOW = "0 0 0 3px #ffcf1a, 0 0 0 6px #ffffff, 0 0 26px 10px rgba(255,207,26,0.8), 0 6px 16px rgba(60,0,10,0.45)";

/** Expanding gold ripple behind the active avatar. */
export function TurnPing() {
  return <span className="pointer-events-none absolute inset-0 -z-10 animate-ping rounded-full bg-[#ffcf1a] opacity-70" />;
}

/** Bouncing pointer above the active player. */
function TurnArrow() {
  return (
    <div className="font-display toon-text pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 animate-bounce text-lg leading-none text-[#ffd84a]">
      ▼
    </div>
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
            className="font-display absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-lg font-black tracking-wide toon-text"
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
    const now = serverNow();
    const show = setTimeout(() => ref.current?.classList.remove("hidden"), Math.max(0, w.openedAt + UNO_CATCH_GRACE_MS - now));
    const hide = setTimeout(() => ref.current?.classList.add("hidden"), Math.max(0, w.openedAt + UNO_WINDOW_MS - now));
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [w, pid]);
  if (!w || w.playerId !== pid || pid === you) return null;
  return (
    <button
      ref={ref}
      onClick={(e) => {
        e.stopPropagation();
        void sendAction({ type: "catch_uno", targetId: pid });
      }}
      className="hidden absolute -bottom-9 left-1/2 -translate-x-1/2 rounded-full bg-neon-red px-3 py-1 text-xs font-black text-white ring-2 ring-white shadow-[0_3px_0_#7d0710] animate-bounce"
    >
      🔨 CATCH!
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
  const small = useSmallScreen();
  const crowded = small && pub.players.length >= 8;
  const size = small ? (crowded ? 34 : 40) : 54;

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
        className={`relative flex -translate-x-1/2 -translate-y-1/2 flex-col items-center select-none transition-[opacity,scale] duration-300 ${out ? "opacity-40" : ""} ${isTurn ? "scale-[1.18]" : ""}`}
        style={{ pointerEvents: swapPick ? "auto" : "none" }}
        onClick={() => swapPick && void playCard(picker.cardId, { swapTargetId: p.id, color: picker.color as never })}
      >
        <SeatFxStack pid={p.id} />
        {isTurn && <TurnArrow />}
        <div
          className={`relative grid place-items-center rounded-full transition-all duration-300 ${swapPick ? "cursor-pointer animate-pulse" : ""}`}
          style={{
            width: size,
            height: size,
            background: "radial-gradient(circle at 35% 30%, #ffffff, #d4e4ff)",
            boxShadow: swapPick
              ? `0 0 0 3px #ffffff, 0 0 0 7px ${NEON.wild}, 0 6px 16px rgba(60,0,10,0.45)`
              : isTurn
                ? TURN_SHADOW
                : "0 0 0 3px #ffffff, 0 4px 0 rgba(10,40,110,0.35), 0 6px 14px rgba(60,0,10,0.4)",
          }}
        >
          {isTurn && <TurnPing />}
          {isTurn && <TimerRing size={size} color={color} />}
          <span className={`leading-none ${small ? (crowded ? "text-[17px]" : "text-[20px]") : "text-[26px]"}`} style={{ filter: online ? "none" : "grayscale(1)" }}>
            {p.avatar}
          </span>
          {pub.phase === "playing" && p.status === "active" && (
            <span
              className="absolute -right-2 -top-1 min-w-[22px] rounded-full px-1.5 text-center text-[11px] font-black leading-[20px] text-[#14213d] ring-2 ring-[#14213d]/15"
              style={{ background: p.cardCount === 1 ? "#ffcf1a" : "#ffffff", boxShadow: "0 2px 0 rgba(20,33,61,0.35)" }}
            >
              {p.cardCount}
            </span>
          )}
          {p.id === pub.hostId && <span className="absolute -left-1.5 -top-2 text-sm">👑</span>}
        </div>
        <div
          className={`mt-1.5 truncate rounded-full px-2 py-0.5 font-bold ring-2 ring-white/80 ${isTurn ? "bg-gold text-ink shadow-[0_2px_0_#a87400]" : "bg-[#1d5fd6] text-white shadow-[0_2px_0_#133f99]"} ${small ? (crowded ? "max-w-[58px] text-[9px]" : "max-w-[84px] text-[10px]") : "max-w-[110px] text-[11px]"}`}
        >
          {p.isBot && !crowded ? "🤖 " : ""}
          {p.name}
          {p.autopilot ? " · away" : ""}
          {!online ? " · offline" : ""}
        </div>
        {pub.settings.winMode === "points" && <div className="toon-text text-[10px] font-bold text-white">{p.score} pts</div>}
        {p.saidUno && p.cardCount === 1 && (
          <div className="font-display mt-0.5 text-[11px] font-black text-[#ffd84a] toon-text">{BRAND.shout}</div>
        )}
        {out && <div className="font-display mt-0.5 rounded-full bg-[#14213d] px-1.5 text-[10px] font-black text-white">{p.status === "left" ? "LEFT" : "OUT"}</div>}
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
