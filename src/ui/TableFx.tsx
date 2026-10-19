"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { COLOR_HEX, pileScreen, seatScreen, useScene, type PileFx } from "@/scene/sceneStore";

/** Your own badge (bottom-left); things thrown at you, or flying to you, land there. */
export const anchors = { you: null as HTMLElement | null, youId: null as string | null };

/** Where a player is on screen right now: your badge for you, otherwise their avatar. */
export function screenOf(pid: string): { x: number; y: number } | null {
  if (pid === anchors.youId && anchors.you) {
    const r = anchors.you.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return seatScreen.get(pid) ?? null;
}

const WHEEL = `conic-gradient(${COLOR_HEX.red} 0 25%, ${COLOR_HEX.yellow} 0 50%, ${COLOR_HEX.green} 0 75%, ${COLOR_HEX.blue} 0)`;
const INK = "#14213d";

function SkipGlyph({ size }: { size: number }) {
  const s = size * 0.56;
  return (
    <svg width={s} height={s} viewBox="-50 -50 100 100">
      {[
        { stroke: INK, w: 26 },
        { stroke: "#fff", w: 15 },
      ].map(({ stroke, w }) => (
        <g key={stroke} fill="none" stroke={stroke} strokeWidth={w} strokeLinecap="round">
          <circle r={34} />
          <line x1={-24} y1={24} x2={24} y2={-24} />
        </g>
      ))}
    </svg>
  );
}

function ReverseGlyph({ size }: { size: number }) {
  const s = size * 0.62;
  const arrow = "M -30 8 A 30 30 0 0 1 22 -22 L 16 -36 L 40 -20 L 14 -2 L 18 -14 A 20 20 0 0 0 -20 8 Z";
  return (
    <svg width={s} height={s} viewBox="-50 -50 100 100">
      {[0, 180].map((r) => (
        <path key={r} d={arrow} transform={`rotate(${r})`} fill="#fff" stroke={INK} strokeWidth={6} strokeLinejoin="round" />
      ))}
    </svg>
  );
}

/** One big badge over the pile: pops in, does its thing, then flies to whoever it hits (or fades). */
function PileBadge({ fx }: { fx: PileFx }) {
  const remove = useScene((s) => s.removePileFx);
  const [from] = useState(() => ({ x: pileScreen.x, y: pileScreen.y }));
  const [to] = useState(() => {
    const t = fx.targets[0] ? screenOf(fx.targets[0]) : null;
    return t ? { x: t.x - pileScreen.x, y: t.y - pileScreen.y } : null;
  });
  const small = typeof window !== "undefined" && (window.innerWidth < 640 || window.innerHeight < 520);
  const size = small ? 78 : 116;
  const spin = fx.kind === "reverse" ? 360 * fx.direction : fx.kind === "wild" || fx.kind === "roulette" ? 540 : 0;

  const fly = to
    ? { x: [0, 0, 0, to.x], y: [0, 0, 0, to.y], scale: [0.2, 1.25, 1, 0.38], opacity: [0, 1, 1, 0.9] }
    : { x: 0, y: [0, 0, 0, -20], scale: [0.2, 1.25, 1, 1.35], opacity: [0, 1, 1, 0] };

  return (
    <motion.div
      className="pointer-events-none absolute"
      style={{ left: from.x, top: from.y, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }}
      initial={{ opacity: 0, scale: 0.2 }}
      animate={fly}
      transition={{ duration: 1.15, times: [0, 0.22, 0.6, 1], ease: "easeOut" }}
      onAnimationComplete={() => remove(fx.id)}
    >
      <motion.div
        className="grid h-full w-full place-items-center rounded-full"
        style={{
          background: fx.kind === "wild" || fx.kind === "roulette" ? WHEEL : fx.color,
          boxShadow: `0 0 0 ${size * 0.05}px #fff, 0 0 0 ${size * 0.075}px ${INK}, 0 ${size * 0.08}px 0 rgba(20,33,61,0.35), 0 0 ${size * 0.4}px ${fx.color}`,
        }}
        initial={{ rotate: fx.kind === "skip" ? -40 : 0 }}
        animate={{ rotate: fx.kind === "skip" ? [-40, 12, -6, 0] : spin }}
        transition={{ duration: fx.kind === "skip" ? 0.6 : 0.9, ease: "easeOut" }}
      >
        {/* a wild settles on the picked colour */}
        {fx.picked && fx.kind === "wild" && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ background: fx.picked }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0, 1] }}
            transition={{ duration: 0.75, times: [0, 0.6, 1] }}
          />
        )}
        <div className="relative grid place-items-center">
          {fx.kind === "skip" && <SkipGlyph size={size} />}
          {fx.kind === "skip_all" && (
            <div className="flex flex-col items-center">
              <SkipGlyph size={size * 0.8} />
              <span className="font-display toon-text -mt-1 text-sm font-black text-white">{fx.label}</span>
            </div>
          )}
          {fx.kind === "reverse" && <ReverseGlyph size={size} />}
          {(fx.kind === "draw" || fx.kind === "discard_all" || fx.kind === "roulette") && (
            <span className="font-display toon-text font-black leading-none text-white" style={{ fontSize: size * (fx.label.length > 2 ? 0.34 : 0.42) }}>
              {fx.label}
            </span>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Big action/wild card animations over the discard pile (see the director's pileFxFor). */
export function PileFxLayer() {
  const fx = useScene((s) => s.pileFx);
  return (
    <div className="pointer-events-none fixed inset-0 z-[16] overflow-hidden">
      {fx.map((f) => (
        <PileBadge key={f.id} fx={f} />
      ))}
    </div>
  );
}

/** "YOUR TURN!" sweeps across the middle of the screen when your turn starts. */
export function YourTurnBanner() {
  const n = useScene((s) => s.yourTurn);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[34%] z-[34] grid justify-items-center short:top-[30%]">
      <AnimatePresence>
        {n > 0 && (
          <motion.div
            key={n}
            className="col-start-1 row-start-1 overflow-hidden rounded-2xl px-8 py-2 short:px-6 short:py-1"
            style={{ background: "linear-gradient(90deg, rgba(255,207,26,0) 0%, rgba(255,207,26,0.92) 18%, rgba(255,207,26,0.92) 82%, rgba(255,207,26,0) 100%)" }}
            initial={{ opacity: 0, x: -140, skewX: -12 }}
            animate={{ opacity: [0, 1, 1, 0], x: [-140, 0, 0, 140], skewX: [-12, 0, 0, 12] }}
            transition={{ duration: 1.35, times: [0, 0.2, 0.75, 1], ease: "easeOut" }}
          >
            <span className="font-display toon-text text-4xl font-black tracking-wide text-white short:text-2xl">YOUR TURN!</span>
            {/* shine sweep */}
            <motion.span
              className="absolute inset-y-0 w-16 -skew-x-12 bg-white/60"
              initial={{ left: "-20%" }}
              animate={{ left: "120%" }}
              transition={{ duration: 0.7, delay: 0.3, ease: "easeInOut" }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
