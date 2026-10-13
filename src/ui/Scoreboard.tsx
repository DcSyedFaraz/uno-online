"use client";

import { AnimatePresence, animate, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { handPoints } from "@/engine";
import { cardLabel } from "@/engine/cards";
import { sendAction } from "@/client/actions";
import { useGame } from "@/client/store/game-store";
import { COLOR_HEX } from "@/scene/sceneStore";

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

export function Scoreboard() {
  const pub = useGame((s) => s.pub);
  const you = useGame((s) => s.you);
  const over = pub?.phase === "round_over" || pub?.phase === "game_over";
  const key = over ? `${pub?.phase}:${pub?.round}` : null;
  const [readyFor, setReadyFor] = useState<string | null>(null);
  // let the last card land before covering the table
  useEffect(() => {
    if (!key) return;
    const t = setTimeout(() => setReadyFor(key), 1300);
    return () => clearTimeout(t);
  }, [key]);
  const show = key !== null && readyFor === key;
  if (!pub || !pub.lastRound) return null;
  const lr = pub.lastRound;
  const winner = pub.players.find((p) => p.id === lr.winnerId);
  const isHost = pub.hostId === you;
  const gameOver = pub.phase === "game_over";
  const points = pub.settings.winMode === "points";
  const ranked = [...pub.players].filter((p) => p.status !== "left").sort((a, b) => (points ? b.score - a.score : (lr.hands[a.id]?.length ?? 0) - (lr.hands[b.id]?.length ?? 0)));

  return (
    <AnimatePresence>
      {show && over && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="glass w-full max-w-lg p-6 text-center"
            initial={{ y: 30, scale: 0.92, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
            <div className="text-5xl">{winner?.avatar ?? "🤝"}</div>
            <div className="font-display mt-2 text-2xl font-black">
              {winner ? (winner.id === you ? (gameOver ? "You win the game!" : "You win the round!") : `${winner.name} wins${gameOver ? " the game" : ""}!`) : "Round over"}
            </div>
            {points && winner && (
              <div className="mt-1 text-sm text-white/60">
                +<CountUp to={lr.points} /> points
              </div>
            )}
            <div className="mt-5 max-h-[38dvh] space-y-1.5 overflow-y-auto text-left scrollbar-thin">
              {ranked.map((p, i) => {
                const hand = lr.hands[p.id] ?? [];
                return (
                  <div key={p.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${p.id === lr.winnerId ? "bg-neon-yellow/10 ring-1 ring-neon-yellow/40" : "bg-white/[0.04]"}`}>
                    <span className="w-4 text-xs text-white/40">{i + 1}</span>
                    <span className="text-lg">{p.avatar}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {p.name}
                        {p.id === you && <span className="text-white/45"> (you)</span>}
                      </div>
                      <div className="flex flex-wrap gap-0.5">
                        {hand.slice(0, 18).map((c) => (
                          <span
                            key={c.id}
                            title={cardLabel(c)}
                            className="inline-block h-3 w-2 rounded-[2px]"
                            style={{ background: c.color ? COLOR_HEX[c.color] : "conic-gradient(#ff3b5c,#ffd23f,#2bff88,#3b9eff,#ff3b5c)" }}
                          />
                        ))}
                        {hand.length > 18 && <span className="text-[10px] text-white/40">+{hand.length - 18}</span>}
                      </div>
                    </div>
                    <div className="text-right text-xs text-white/60">
                      {points ? <div className="font-display text-sm font-bold text-white">{p.score}</div> : null}
                      {hand.length} left · {handPoints(hand)} pts
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
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
                <div className="text-sm text-white/55">Waiting for the host…</div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
