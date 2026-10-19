"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CHAT_MAX } from "@/shared/protocol";
import { playerName, useGame } from "@/client/store/game-store";
import { sendChat } from "@/client/realtime/useRoom";
import { playSfx } from "@/audio/sound";
import { useScene } from "@/scene/sceneStore";
import { EmoteButton, onFunMessage } from "./Fun";

/** Reactions float over the sender's seat; chat messages ding when the drawer is closed. */
export function useSocialFx() {
  const chat = useGame((s) => s.chat);
  const seen = useRef(0);
  useEffect(() => {
    const fresh = chat.slice(seen.current);
    seen.current = chat.length;
    for (const m of fresh) {
      if (m.kind === "react") useScene.getState().addSeatFx(m.pid, m.text, "white", true);
      else if (m.kind === "emote" || m.kind === "throw") onFunMessage(m);
      else if (m.pid !== useGame.getState().you) playSfx("chat");
    }
  }, [chat]);
}

export function ChatDock() {
  const open = useGame((s) => s.chatOpen);
  const setOpen = useGame((s) => s.setChatOpen);
  const unread = useGame((s) => s.unreadChat);
  const all = useGame((s) => s.chat);
  const chat = useMemo(() => all.filter((m) => m.kind === "chat"), [all]);
  const pub = useGame((s) => s.pub);
  const you = useGame((s) => s.you);
  const spectator = useGame((s) => s.spectator);
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    void sendChat("chat", t);
    setText("");
  };

  return (
    // in the lobby there's no top bar, so the chat button takes the top-right corner
    <div
      className={`fixed right-[max(0.75rem,env(safe-area-inset-right))] z-40 flex flex-col items-end gap-2 ${pub?.phase === "lobby" ? "top-4 short:top-2" : "top-16 sm:top-20 short:top-[52px]"}`}
    >
      <div className="flex items-center gap-2">
        {pub?.phase !== "lobby" && !spectator && <EmoteButton />}
        <button
          className="glass relative grid h-11 w-11 place-items-center !rounded-xl text-lg short:h-9 short:w-9 short:text-base"
          onClick={() => setOpen(!open)}
          aria-label="Chat"
        >
          💬
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-neon-red px-1 text-[10px] font-bold ring-2 ring-white">{unread}</span>
          )}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            className="glass flex h-[min(420px,55dvh)] w-[min(340px,calc(100vw-24px))] flex-col overflow-hidden short:h-[min(420px,70dvh)]"
          >
            <div className="flex items-center justify-between border-b border-white/20 px-4 py-2.5">
              <span className="font-display text-sm font-bold">Table chat</span>
              <button className="text-white/80" onClick={() => setOpen(false)} aria-label="Close chat">
                ✕
              </button>
            </div>
            <div ref={list} className="flex-1 space-y-2 overflow-y-auto px-3 py-3 scrollbar-thin">
              {chat.length === 0 && <div className="pt-10 text-center text-xs text-white/75">Say hi 👋</div>}
              {chat.map((m) => {
                const mine = m.pid === you;
                const author = pub?.players.find((p) => p.id === m.pid);
                return (
                  <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-sm">{author?.avatar ?? "🙂"}</div>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-1.5 text-sm shadow-[0_2px_0_rgba(10,30,90,0.3)] ${mine ? "bg-accent text-white" : "bg-white text-ink"}`}>
                      {!mine && <div className="text-[10px] font-bold text-[#1d5fd6]">{playerName(pub, m.pid, you)}</div>}
                      <div className="break-words">{m.text}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <form onSubmit={submit} className="flex gap-2 border-t border-white/20 p-2">
              <input className="input py-2 text-sm" value={text} maxLength={CHAT_MAX} onChange={(e) => setText(e.target.value)} placeholder="Message…" />
              <button className="btn btn-primary px-3 py-2 text-sm" type="submit">
                Send
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
