"use client";

import { AnimatePresence, motion } from "motion/react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { MAX_PLAYERS } from "@/engine";
import { BRAND } from "@/brand";
import { sendAction } from "@/client/actions";
import { useGame } from "@/client/store/game-store";
import { playSfx } from "@/audio/sound";
import { RulesPanel } from "./RulesPanel";

function ShareCard({ code }: { code: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/r/${code}` : `/r/${code}`;
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: "#0b0a18", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };
  const share = async () => {
    try {
      await navigator.share({ title: BRAND.name, text: `Join my ${BRAND.name} table! Room ${code}`, url });
    } catch {}
  };
  return (
    <div className="glass flex gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Room code</div>
        <div className="font-display mt-1 text-3xl font-black tracking-[0.18em] sm:text-4xl">{code}</div>
        <div className="mt-1 truncate text-xs text-white/45">{url}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-primary py-2 text-sm" onClick={copy}>
            {copied ? "Copied!" : "Copy invite link"}
          </button>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button className="btn btn-ghost py-2 text-sm" onClick={share}>
              Share…
            </button>
          )}
        </div>
      </div>
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="QR code for the invite link" className="hidden h-28 w-28 shrink-0 rounded-xl sm:block" />
      )}
    </div>
  );
}

export function Lobby() {
  const pub = useGame((s) => s.pub)!;
  const you = useGame((s) => s.you);
  const code = useGame((s) => s.code)!;
  const presence = useGame((s) => s.presence);
  const isHost = pub.hostId === you;
  const seats = pub.players.filter((p) => p.status !== "left");
  const full = seats.length >= MAX_PLAYERS;
  const [starting, setStarting] = useState(false);

  return (
    <div className="relative z-10 mx-auto grid min-h-dvh w-full max-w-6xl gap-5 px-4 pb-10 pt-20 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
      <div className="space-y-4">
        <ShareCard code={code} />
        <div className="glass p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-display text-sm font-bold tracking-wide">
              Players <span className="text-white/45">{seats.length}/{MAX_PLAYERS}</span>
            </div>
            {isHost && (
              <button className="btn btn-ghost py-1.5 text-xs" disabled={full} onClick={() => void sendAction({ type: "add_bot" })}>
                + Add bot
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <AnimatePresence>
              {seats.map((p) => {
                const online = p.isBot || presence.length === 0 || presence.includes(p.id);
                return (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    className={`group relative flex items-center gap-2.5 rounded-2xl bg-white/[0.05] p-2.5 ring-1 ${p.id === you ? "ring-accent/70" : "ring-white/5"}`}
                  >
                    <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-white/15 to-white/0 text-xl">
                      {p.avatar}
                      <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[#12111f] ${online ? "bg-neon-green" : "bg-white/25"}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {p.name}
                        {p.id === you && <span className="text-white/45"> (you)</span>}
                      </div>
                      <div className="text-[11px] text-white/45">{p.id === pub.hostId ? "👑 Host" : p.isBot ? "🤖 Bot" : "Guest"}</div>
                    </div>
                    {isHost && p.id !== you && (
                      <button
                        className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/40 text-xs text-white/60 opacity-0 transition group-hover:opacity-100 hover:text-white"
                        title={p.isBot ? "Remove bot" : "Kick"}
                        onClick={() => void sendAction(p.isBot ? { type: "remove_bot", playerId: p.id } : { type: "kick", playerId: p.id })}
                      >
                        ✕
                      </button>
                    )}
                  </motion.div>
                );
              })}
              {Array.from({ length: Math.max(0, Math.min(3, MAX_PLAYERS - seats.length)) }, (_, i) => (
                <div key={`empty${i}`} className="grid h-[60px] place-items-center rounded-2xl border border-dashed border-white/10 text-xs text-white/30">
                  Open seat
                </div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="glass flex flex-col items-center gap-3 p-5 text-center">
          {isHost ? (
            <>
              <button
                className="btn btn-primary font-display w-full max-w-sm py-4 text-lg tracking-wide"
                disabled={seats.length < 2 || starting}
                onClick={async () => {
                  setStarting(true);
                  playSfx("shuffle");
                  await sendAction({ type: "start" });
                  setStarting(false);
                }}
              >
                {starting ? "Shuffling…" : "Start game"}
              </button>
              <div className="text-xs text-white/45">{seats.length < 2 ? "Invite a friend or add a bot to start." : "Everyone's in? Deal 'em."}</div>
            </>
          ) : (
            <div className="flex items-center gap-3 text-sm text-white/70">
              <span className="h-2 w-2 animate-ping rounded-full bg-neon-green" />
              Waiting for the host to start…
            </div>
          )}
        </div>
      </div>

      <div className="glass max-h-none p-4 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto scrollbar-thin">
        <div className="mb-3 flex items-baseline justify-between">
          <div className="font-display text-sm font-bold tracking-wide">Table rules</div>
          {!isHost && <div className="text-[11px] text-white/45">Only the host can change these</div>}
        </div>
        <RulesPanel settings={pub.settings} editable={isHost} />
      </div>
    </div>
  );
}
