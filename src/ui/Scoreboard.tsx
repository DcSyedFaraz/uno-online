"use client";

import { AnimatePresence, animate, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { handPoints } from "@/engine";
import { cardLabel } from "@/engine/cards";
import { sendAction } from "@/client/actions";
import { useGame } from "@/client/store/game-store";
import { COLOR_HEX } from "@/scene/sceneStore";

const WILD_SWATCH = `conic-gradient(${COLOR_HEX.red},${COLOR_HEX.yellow},${COLOR_HEX.green},${COLOR_HEX.blue},${COLOR_HEX.red})`;

function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const ctl = animate(0, to, {
      duration: 1.2,
      ease: "easeOut",
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = String(Math.round(v));
      },
    });
    return () => ctl.stop();
  }, [to]);
  return <span ref={ref}>0</span>;
}

/** Long enough to see the last card land and the "OUT!" moment before the results cover the table. */
const SCOREBOARD_DELAY = 3200;

export function Scoreboard() {
  const pub = useGame((s) => s.pub);
  const you = useGame((s) => s.you);
  const over = pub?.phase === "round_over" || pub?.phase === "game_over";
  const key = over ? `${pub?.phase}:${pub?.round}` : null;
  const [readyFor, setReadyFor] = useState<string | null>(null);
  // let the last card land before covering the table
  useEffect(() => {
    if (!key) return;
    const t = setTimeout(() => setReadyFor(key), SCOREBOARD_DELAY);
    return () => clearTimeout(t);
  }, [key]);
  const show = key !== null && readyFor === key;
  if (!pub || !pub.lastRound) return null;
  const lr = pub.lastRound;
  const winner = pub.players.find((p) => p.id === lr.winnerId);
  const isHost = pub.hostId === you;
  const gameOver = pub.phase === "game_over";
  const points = pub.settings.winMode === "points";
  const left = (id: string) => lr.hands[id] ?? [];
  // single round: winner first, then fewest cards left (fewest points when the clock decided it)
  const ranked = [...pub.players]
    .filter((p) => p.status !== "left")
    .sort((a, b) => {
      if (points) return b.score - a.score;
      if (a.id === lr.winnerId || b.id === lr.winnerId) return a.id === lr.winnerId ? -1 : 1;
      const byCount = left(a.id).length - left(b.id).length;
      return lr.timeUp ? handPoints(left(a.id)) - handPoints(left(b.id)) || byCount : byCount;
    });

  return (
    <AnimatePresence>
      {show && over && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-[#3a0308]/45 p-4 short:p-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="glass w-full max-w-lg p-6 text-center short:max-h-[96dvh] short:overflow-y-auto short:p-4"
            initial={{ y: 30, scale: 0.92, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
            <div className="text-5xl short:text-3xl">{winner?.avatar ?? "🤝"}</div>
            <div className="font-display toon-text mt-2 text-2xl font-black text-[#ffd84a] short:mt-1 short:text-xl">
              {winner ? (winner.id === you ? (gameOver ? "You win the game!" : "You win the round!") : `${winner.name} wins${gameOver ? " the game" : ""}!`) : "Round over"}
            </div>
            {lr.timeUp && <div className="mt-1 text-sm font-semibold text-gold">⏱ Time&apos;s up: the fewest card points wins</div>}
            {points && winner && (
              <div className="mt-1 text-sm font-semibold text-white/85">
                +<CountUp to={lr.points} /> points
              </div>
            )}
            <div className="mt-5 max-h-[38dvh] space-y-1.5 overflow-y-auto text-left scrollbar-thin short:mt-3 short:max-h-[42dvh]">
              {ranked.map((p, i) => {
                const hand = lr.hands[p.id] ?? [];
                return (
                  <div key={p.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${p.id === lr.winnerId ? "bg-white/25 ring-[3px] ring-gold" : "bg-white/12"}`}>
                    <span className="w-4 text-xs font-bold text-white/75">{i + 1}</span>
                    <span className="text-lg">{p.avatar}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {p.name}
                        {p.id === you && <span className="text-white/75"> (you)</span>}
                      </div>
                      <div className="flex flex-wrap gap-0.5">
                        {hand.slice(0, 18).map((c) => (
                          <span
                            key={c.id}
                            title={cardLabel(c)}
                            className="inline-block h-3 w-2 rounded-[2px] ring-1 ring-white/70"
                            style={{ background: c.color ? COLOR_HEX[c.color] : WILD_SWATCH }}
                          />
                        ))}
                        {hand.length > 18 && <span className="text-[10px] text-white/75">+{hand.length - 18}</span>}
                      </div>
                    </div>
                    <div className="text-right text-xs text-white/85">
                      {points ? <div className="font-display text-sm font-bold text-white">{p.score}</div> : null}
                      {hand.length} left · {handPoints(hand)} pts
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-2 short:mt-3">
              {isHost ? (
                gameOver ? (
                  <>
                    <button className="btn btn-primary font-display" onClick={() => void sendAction({ type: "start" })}>
                      Play again
                    </button>
                    <button className="btn btn-ghost" onClick={() => void sendAction({ type: "back_to_lobby" })}>
                      Back to lobby
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-primary font-display" onClick={() => void sendAction({ type: "next_round" })}>
                      Next round
                    </button>
                    <button className="btn btn-ghost" onClick={() => void sendAction({ type: "back_to_lobby" })}>
                      End game
                    </button>
                  </>
                )
              ) : (
                <div className="text-sm font-semibold text-white/85">Waiting for the host…</div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
