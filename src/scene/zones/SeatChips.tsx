"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { PublicPlayer } from "@/engine";
import { UNO_CATCH_GRACE_MS, UNO_WINDOW_MS } from "@/engine/uno";
import { BOT_DELAY_MIN, BOT_DELAY_SPREAD } from "@/engine/state";
import { NEON } from "@/brand";
import { sendAction } from "@/client/actions";
import { serverNow } from "@/client/clock";
import { useGame } from "@/client/store/game-store";
import { pileScreen, sceneRef, seatScreen, useScene, type FxTone } from "../sceneStore";
import { AVATAR_LIFT, chipLayout } from "./SeatAvatars";

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
  return <div className="font-display toon-text pointer-events-none animate-bounce text-lg leading-none text-[#ffd84a]">▼</div>;
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
      className="hidden whitespace-nowrap rounded-full bg-neon-red px-3 py-1 text-xs font-black text-white ring-2 ring-white shadow-[0_3px_0_#7d0710] animate-bounce"
    >
      🔨 CATCH!
    </button>
  );
}

/**
 * The DOM layer over an opponent's 3D avatar (see SeatAvatars): things that must stay on top
 * and clickable. Positioned on the avatar circle's centre every frame by <SeatProjector/>.
 */
function Chip({ p }: { p: PublicPlayer }) {
  const pub = useGame((s) => s.pub!);
  const isTurn = pub.turnPlayerId === p.id && pub.phase === "playing";
  const small = useSmallScreen();
  const crowded = small && pub.players.length >= 8;
  const L = chipLayout(small ? (crowded ? 34 : 40) : 54, small);
  const top = L.cy * (isTurn ? 1.18 : 1);

  return (
    <div
      ref={(el) => {
        if (el) chipEls.set(p.id, el);
        else chipEls.delete(p.id);
      }}
      className="absolute left-0 top-0 will-change-transform"
      style={{ transform: "translate3d(-9999px,-9999px,0)" }}
    >
      <div className="pointer-events-none relative select-none">
        {/* above the avatar's name pill */}
        <div className="absolute left-0 flex -translate-x-1/2 flex-col items-center" style={{ bottom: top - 2 }}>
          {isTurn && <TurnArrow />}
        </div>
        <div className="absolute left-0" style={{ top: -top }}>
          <SeatFxStack pid={p.id} />
        </div>
        <div className="absolute" style={{ left: L.size / 2 + 8, top: -12, pointerEvents: "auto" }}>
          <CatchButton pid={p.id} />
        </div>
      </div>
    </div>
  );
}

/** Chip elements by player id; positioned every frame by <SeatProjector/>. */
const chipEls = new Map<string, HTMLElement>();
const v = new THREE.Vector3();

/**
 * Inside the canvas: projects each seat's avatar (see SeatAvatars) to the screen, moves its DOM
 * chip there, and records it in `seatScreen` for things that fly between seats.
 */
export function SeatProjector() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useFrame(() => {
    for (const [pid, seat] of sceneRef.seats) {
      v.copy(seat.chip).setY(seat.chip.y + AVATAR_LIFT).project(camera);
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      const at = seatScreen.get(pid);
      if (at) {
        at.x = x;
        at.y = y;
      } else seatScreen.set(pid, { x, y });
      const el = chipEls.get(pid);
      if (el) el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    }
    // just above the propped-up top card of the discard pile
    v.copy(sceneRef.dims.discard).setY(0.55).project(camera);
    pileScreen.x = (v.x * 0.5 + 0.5) * size.width;
    pileScreen.y = (-v.y * 0.5 + 0.5) * size.height;
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
