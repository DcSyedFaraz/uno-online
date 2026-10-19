"use client";

import { AnimatePresence, motion } from "motion/react";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MAX_PLAYERS, teamColor } from "@/engine";
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
    QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: "#14213d", light: "#ffffff" } })
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
    <div className="glass flex gap-4 p-4 short:p-3">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">Room code</div>
        <div className="font-display toon-text mt-1 text-3xl font-black tracking-[0.18em] text-[#ffd84a] sm:text-4xl short:text-2xl">{code}</div>
        <div className="mt-1 truncate text-xs text-white/70">{url}</div>
        <div className="mt-3 flex flex-wrap gap-2 short:mt-2">
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
        <img src={qr} alt="QR code for the invite link" className="hidden h-28 w-28 shrink-0 rounded-xl ring-4 ring-white sm:block short:hidden" />
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
  const router = useRouter();
  const leaveRoom = async () => {
    if (await sendAction({ type: "leave" })) router.push("/");
  };
  const closeRoom = async () => {
    if (window.confirm("Close this room for everyone? It will be deleted.") && (await sendAction({ type: "close_room" }))) router.push("/");
  };
  const seats = pub.players.filter((p) => p.status !== "left");
  const full = seats.length >= MAX_PLAYERS;
  const teams = pub.settings.teamPlay;
  const me = seats.find((p) => p.id === you);
  const incoming = teams ? pub.invites.filter((i) => i.to === you && !me?.partnerId) : [];
  const teamsReady = !teams || (seats.length >= 4 && seats.length % 2 === 0);
  const nameOf = (id: string) => seats.find((p) => p.id === id);
  const [starting, setStarting] = useState(false);

  return (
    // landscape phones: two columns that each scroll inside the screen
    <div className="relative z-10 mx-auto grid min-h-dvh w-full max-w-6xl gap-5 px-4 pb-10 pt-20 lg:grid-cols-[1.1fr_1fr] lg:pt-24 short:h-dvh short:min-h-0 short:grid-cols-2 short:gap-3 short:pb-3 short:pl-[max(1rem,env(safe-area-inset-left))] short:pr-[max(1rem,env(safe-area-inset-right))] short:pt-12">
      <div className="flex flex-col gap-4 short:min-h-0 short:gap-3 short:overflow-y-auto short:pb-2 scrollbar-thin">
        <ShareCard code={code} />
        <div className="glass p-4 short:p-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-display text-sm font-bold tracking-wide">
              Players <span className="text-white/70">{seats.length}/{MAX_PLAYERS}</span>
            </div>
            {isHost && (
              <button className="btn btn-ghost py-1.5 text-xs" disabled={full} onClick={() => void sendAction({ type: "add_bot" })}>
                + Add bot
              </button>
            )}
          </div>
          {/* invitations to team up: accept one, the rest go away */}
          {incoming.length > 0 && (
            <div className="mb-2 space-y-1.5">
              {incoming.map((i) => {
                const from = nameOf(i.from);
                return (
                  <div key={i.from} className="flex items-center gap-2 rounded-xl bg-white/20 px-2.5 py-1.5 text-xs font-semibold ring-2 ring-gold">
                    <span className="text-base">{from?.avatar}</span>
                    <span className="min-w-0 flex-1 truncate">{from?.name} wants to team up</span>
                    <button className="btn btn-primary px-2.5 py-1 text-[11px]" onClick={() => void sendAction({ type: "team_accept", playerId: i.from })}>
                      Accept
                    </button>
                    <button className="grid h-6 w-6 place-items-center rounded-full bg-[#14213d]/50 text-[11px]" aria-label="Decline" onClick={() => void sendAction({ type: "team_decline", playerId: i.from })}>
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <AnimatePresence>
              {seats.map((p) => {
                const online = p.isBot || presence.length === 0 || presence.includes(p.id);
                const tc = teamColor(pub, p.id);
                const partner = p.partnerId ? nameOf(p.partnerId) : undefined;
                const invited = pub.invites.some((i) => i.from === you && i.to === p.id);
                const canInvite = teams && p.id !== you && !p.partnerId && !me?.partnerId;
                return (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    className={`group relative flex items-center gap-2.5 rounded-2xl bg-white/15 p-2.5 short:p-2 ${p.id === you ? "ring-[3px] ring-gold" : "ring-2 ring-white/20"}`}
                    style={tc ? { boxShadow: `inset 5px 0 0 ${tc}` } : undefined}
                  >
                    <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-xl shadow-[0_2px_0_rgba(10,30,90,0.35)] short:h-9 short:w-9">
                      {p.avatar}
                      <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white ${online ? "bg-neon-green" : "bg-[#9aa6c4]"}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {p.name}
                        {p.id === you && <span className="text-white/70"> (you)</span>}
                      </div>
                      <div className="truncate text-[11px] text-white/75">
                        {partner ? (
                          <span style={{ color: tc ?? undefined }} className="font-bold">
                            with {partner.name}
                          </span>
                        ) : p.id === pub.hostId ? (
                          "👑 Host"
                        ) : p.isBot ? (
                          "🤖 Bot"
                        ) : (
                          "Guest"
                        )}
                      </div>
                      {teams && p.id === you && p.partnerId && (
                        <button className="text-[10px] font-bold text-white/80 underline" onClick={() => void sendAction({ type: "team_leave" })}>
                          Leave team
                        </button>
                      )}
                      {canInvite && (
                        <button
                          className="mt-0.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-black text-ink disabled:opacity-60"
                          disabled={invited}
                          onClick={() => void sendAction({ type: "team_invite", playerId: p.id })}
                        >
                          {invited ? "Invited ✓" : "+ Invite"}
                        </button>
                      )}
                    </div>
                    {isHost && p.id !== you && (
                      <button
                        className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-[#14213d]/60 text-xs text-white transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
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
                <div key={`empty${i}`} className="grid h-[60px] place-items-center rounded-2xl border-2 border-dashed border-white/35 text-xs font-semibold text-white/70 short:h-[52px]">
                  Open seat
                </div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="glass flex flex-col items-center gap-3 p-5 text-center short:order-first short:gap-2 short:p-3">
          {isHost ? (
            <>
              <button
                className="btn btn-primary font-display w-full max-w-sm py-4 text-lg tracking-wide short:py-2.5 short:text-base"
                disabled={seats.length < 2 || !teamsReady || starting}
                onClick={async () => {
                  setStarting(true);
                  playSfx("shuffle");
                  await sendAction({ type: "start" });
                  setStarting(false);
                }}
              >
                {starting ? "Shuffling…" : "Start game"}
              </button>
              <div className="text-xs text-white/75">
                {seats.length < 2
                  ? "Invite a friend or add a bot to start."
                  : !teamsReady
                    ? "Team play needs an even number of players (4–10)."
                    : teams
                      ? "Anyone without a partner gets one at random."
                      : "Everyone's in? Deal 'em."}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3 text-sm font-semibold text-white/90">
              <span className="h-2 w-2 animate-ping rounded-full bg-neon-green" />
              Waiting for the host to start…
            </div>
          )}
          <div className="flex w-full max-w-sm gap-2">
            <button className="btn btn-ghost flex-1 py-2 text-xs" onClick={leaveRoom}>
              Leave room
            </button>
            {isHost && (
              <button className="btn btn-ghost flex-1 py-2 text-xs !text-neon-red" onClick={closeRoom}>
                Close room
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="glass max-h-none p-4 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto scrollbar-thin short:max-h-none short:min-h-0 short:overflow-y-auto short:p-3">
        <div className="mb-3 flex items-baseline justify-between">
          <div className="font-display text-sm font-bold tracking-wide">Table rules</div>
          {!isHost && <div className="text-[11px] text-white/75">Only the host can change these</div>}
        </div>
        <RulesPanel settings={pub.settings} editable={isHost} />
      </div>
    </div>
  );
}
