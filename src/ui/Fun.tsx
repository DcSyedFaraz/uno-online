"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { EMOTES, THROWABLES, type ChatMessage, type EmoteId, type ThrowableId } from "@/shared/protocol";
import { playSfx, unlockAudio } from "@/audio/sound";
import { sendChat } from "@/client/realtime/useRoom";
import { useGame } from "@/client/store/game-store";
import { sceneRef } from "@/scene/sceneStore";
import { useUi } from "./uiStore";
import { screenOf } from "./TableFx";

/**
 * Emotes (animated Noto emoji over your seat) and things thrown at other players
 * (tap their avatar). Both travel over the room's chat channel, so the server isn't involved;
 * receivers only accept known ids, from people in the room, at a sane rate.
 */

/** Self-hosted copies of Noto Emoji Animation (CC BY 4.0), shrunk to 160px. */
export const emoteSrc = (id: EmoteId) => `/emotes/${EMOTES[id].code}.webp`;

interface Emote {
  id: number;
  pid: string;
  emote: EmoteId;
}
interface Throw {
  id: number;
  from: string;
  to: string;
  item: ThrowableId;
}

let ids = 1;
const useFx = create<{ emotes: Emote[]; throws: Throw[] }>(() => ({ emotes: [], throws: [] }));

// at most 5 emotes/throws per sender every 5 seconds
const recent = new Map<string, number[]>();
function allowed(pid: string) {
  const now = Date.now();
  const list = (recent.get(pid) ?? []).filter((t) => now - t < 5000);
  if (list.length >= 5) return false;
  list.push(now);
  recent.set(pid, list);
  return true;
}

/** Called for every incoming emote/throw message (see useSocialFx). */
export function onFunMessage(m: ChatMessage) {
  const pub = useGame.getState().pub;
  const inRoom = (pid: string) => !!pub?.players.some((p) => p.id === pid);
  if (!inRoom(m.pid) || !allowed(m.pid)) return;
  if (m.kind === "emote" && m.text in EMOTES) {
    const e: Emote = { id: ids++, pid: m.pid, emote: m.text as EmoteId };
    useFx.setState((s) => ({ emotes: [...s.emotes.filter((x) => x.pid !== m.pid), e] }));
    playSfx("emote");
    setTimeout(() => useFx.setState((s) => ({ emotes: s.emotes.filter((x) => x.id !== e.id) })), 2600);
  }
  if (m.kind === "throw" && m.text in THROWABLES && m.to && m.to !== m.pid && inRoom(m.to)) {
    const t: Throw = { id: ids++, from: m.pid, to: m.to, item: m.text as ThrowableId };
    useFx.setState((s) => ({ throws: [...s.throws.slice(-5), t] }));
    playSfx("whoosh");
    setTimeout(() => useFx.setState((s) => ({ throws: s.throws.filter((x) => x.id !== t.id) })), 2600);
  }
}

// ── emote picker ──

/** One button next to chat; opens a small grid of animated emotes. */
export function EmoteButton() {
  const [open, setOpen] = useState(false);
  const [cool, setCool] = useState(false);
  const send = (id: EmoteId) => {
    unlockAudio();
    setOpen(false);
    if (cool) return;
    setCool(true);
    setTimeout(() => setCool(false), 1200);
    void sendChat("emote", id);
  };
  return (
    <div className="relative">
      <button
        className="glass grid h-11 w-11 place-items-center !rounded-xl text-lg short:h-9 short:w-9 short:text-base"
        onClick={() => setOpen((o) => !o)}
        aria-label="Emotes"
        aria-expanded={open}
      >
        😊
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            className="glass absolute right-0 top-[calc(100%+8px)] grid w-max grid-cols-4 gap-1 p-2 short:grid-cols-6"
          >
            {(Object.keys(EMOTES) as EmoteId[]).map((id) => (
              <button
                key={id}
                onClick={() => send(id)}
                className="grid h-12 w-12 place-items-center rounded-xl bg-white/15 transition hover:bg-white/30 active:scale-95 short:h-10 short:w-10"
                aria-label={id}
                title={id}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={emoteSrc(id)} alt={EMOTES[id].emoji} width={40} height={40} className="h-9 w-9 short:h-8 short:w-8" />
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Animated emotes popping up over whoever sent them. */
export function EmoteLayer() {
  const emotes = useFx((s) => s.emotes);
  return (
    <div className="pointer-events-none fixed inset-0 z-[33] overflow-hidden">
      <AnimatePresence>
        {emotes.map((e) => (
          <EmoteBubble key={e.id} e={e} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function EmoteBubble({ e }: { e: Emote }) {
  const [at] = useState(() => screenOf(e.pid));
  if (!at) return null;
  const size = typeof window !== "undefined" && (window.innerWidth < 640 || window.innerHeight < 520) ? 64 : 92;
  return (
    <motion.div
      className="absolute"
      style={{ left: at.x - size / 2, top: at.y - size - 34 }}
      initial={{ opacity: 0, scale: 0.3, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.6, y: -20 }}
      transition={{ type: "spring", stiffness: 380, damping: 18 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={emoteSrc(e.emote)} alt={EMOTES[e.emote].emoji} width={size} height={size} style={{ filter: "drop-shadow(0 6px 10px rgba(40,0,10,0.45))" }} />
    </motion.div>
  );
}

// ── throwing things ──

const IMPACT: Record<ThrowableId, { sfx: Parameters<typeof playSfx>[0]; mark: string; splat?: string; burst?: string }> = {
  egg: { sfx: "splat", mark: "🍳", splat: "#ffd84a" },
  tomato: { sfx: "splat", mark: "🍅", splat: "#e8262f" },
  rose: { sfx: "pop", mark: "🌹", burst: "🌸" },
  kiss: { sfx: "smooch", mark: "💋", burst: "💕" },
  cheers: { sfx: "clink", mark: "🍻", burst: "🫧" },
  bomb: { sfx: "boom", mark: "💥", burst: "💨" },
};

/** The little menu that opens when you tap someone's avatar. */
export function ThrowMenu() {
  const target = useUi((s) => s.throwTarget);
  const close = () => useUi.getState().setThrowTarget(null);
  const [cool, setCool] = useState(false);
  const pos = target ? screenOf(target) : null;
  // it closes by itself if you change your mind
  useEffect(() => {
    if (!target) return;
    const t = setTimeout(() => useUi.getState().setThrowTarget(null), 5000);
    return () => clearTimeout(t);
  }, [target]);
  const pick = (item: ThrowableId) => {
    if (!target || cool) return;
    unlockAudio();
    setCool(true);
    setTimeout(() => setCool(false), 1500);
    void sendChat("throw", item, target);
    close();
  };
  const items = Object.keys(THROWABLES) as ThrowableId[];
  return (
    <AnimatePresence>
      {target && pos && (
        <>
          <div className="fixed inset-0 z-[44]" onPointerDown={close} />
          <motion.div
            key={target}
            className="fixed z-[45]"
            style={{ left: pos.x, top: pos.y }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
          >
            {items.map((item, i) => {
              // a ring of buttons around the avatar
              const a = -Math.PI / 2 + (i / items.length) * Math.PI * 2;
              const r = 58;
              return (
                <button
                  key={item}
                  onClick={() => pick(item)}
                  disabled={cool}
                  className="absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-2xl shadow-[0_3px_0_rgba(20,33,61,0.35)] ring-2 ring-[#1d5fd6] transition hover:scale-110 active:scale-95 disabled:opacity-50"
                  style={{ left: Math.cos(a) * r, top: Math.sin(a) * r }}
                  aria-label={`Throw ${item}`}
                  title={item}
                >
                  {THROWABLES[item]}
                </button>
              );
            })}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** Projectiles flying across the table, and what they do when they land. */
export function ThrowLayer() {
  const throws = useFx((s) => s.throws);
  return (
    <div className="pointer-events-none fixed inset-0 z-[33] overflow-hidden">
      {throws.map((t) => (
        <Projectile key={t.id} t={t} />
      ))}
    </div>
  );
}

const FLIGHT = 0.65;

function Projectile({ t }: { t: Throw }) {
  const [path] = useState(() => {
    const to = screenOf(t.to);
    // spectators and unseen senders throw from the bottom of the screen
    const from = screenOf(t.from) ?? (typeof window !== "undefined" ? { x: window.innerWidth / 2, y: window.innerHeight + 20 } : null);
    return to && from ? { from, to } : null;
  });
  const [landed, setLanded] = useState(false);
  if (!path) return null;
  const { from, to } = path;
  const peak = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 120 };
  const impact = IMPACT[t.item];
  return (
    <>
      {!landed && (
        <motion.div
          className="absolute text-4xl"
          style={{ left: 0, top: 0, marginLeft: -20, marginTop: -20 }}
          initial={{ x: from.x, y: from.y, rotate: 0, scale: 0.8 }}
          animate={{ x: [from.x, peak.x, to.x], y: [from.y, peak.y, to.y], rotate: 540, scale: [0.8, 1.3, 1] }}
          transition={{ duration: FLIGHT, ease: "easeIn", x: { duration: FLIGHT, ease: "linear" } }}
          onAnimationComplete={() => {
            setLanded(true);
            playSfx(impact.sfx);
            if (t.item === "bomb") sceneRef.shake = Math.max(sceneRef.shake, 0.5);
          }}
        >
          {THROWABLES[t.item]}
        </motion.div>
      )}
      {landed && (
        <div className="absolute" style={{ left: to.x, top: to.y }}>
          {impact.splat && (
            <motion.svg
              width={90}
              height={90}
              viewBox="-50 -50 100 100"
              className="absolute -translate-x-1/2 -translate-y-1/2"
              initial={{ scale: 0.2, opacity: 1 }}
              animate={{ scale: [0.2, 1.1, 1], opacity: [1, 1, 0], y: [0, 0, 18] }}
              transition={{ duration: 1.8, times: [0, 0.15, 1] }}
            >
              <path
                d="M0-34 C14-34 12-20 24-22 C38-24 36-6 30 2 C24 10 38 20 26 28 C14 36 6 24 0 32 C-8 40 -18 30 -26 26 C-38 20 -28 8 -32 -2 C-36 -14 -24 -22 -16 -26 C-10 -30 -8 -34 0 -34 Z"
                fill={impact.splat}
                stroke="#14213d"
                strokeWidth={3}
                opacity={0.92}
              />
              {t.item === "egg" && <circle r={12} fill="#ff9d1a" />}
            </motion.svg>
          )}
          <motion.div
            className="absolute -translate-x-1/2 -translate-y-1/2 text-5xl"
            initial={{ scale: 0.3, rotate: -20, opacity: 1 }}
            animate={{ scale: [0.3, 1.5, 1.1], rotate: [-20, 10, 0], opacity: [1, 1, 0] }}
            transition={{ duration: 1.6, times: [0, 0.2, 1] }}
          >
            {impact.mark}
          </motion.div>
          {impact.burst &&
            [0, 1, 2, 3, 4].map((i) => {
              const a = (i / 5) * Math.PI * 2;
              return (
                <motion.div
                  key={i}
                  className="absolute -translate-x-1/2 -translate-y-1/2 text-xl"
                  initial={{ x: 0, y: 0, opacity: 1, scale: 0.6 }}
                  animate={{ x: Math.cos(a) * 54, y: Math.sin(a) * 54 - 10, opacity: 0, scale: 1.1 }}
                  transition={{ duration: 1.1, ease: "easeOut" }}
                >
                  {impact.burst}
                </motion.div>
              );
            })}
        </div>
      )}
    </>
  );
}
