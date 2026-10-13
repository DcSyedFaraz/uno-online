"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { activeExtras, COLORS, type Color } from "@/engine";
import { BRAND } from "@/brand";
import { playCard, sendAction } from "@/client/actions";
import { playerName, useGame } from "@/client/store/game-store";
import { audioPrefs, playSfx, unlockAudio } from "@/audio/sound";
import { COLOR_HEX } from "@/scene/sceneStore";
import { SeatFxStack, TimerRing } from "@/scene/zones/SeatChips";
import { sortHand, useUi, type Quality } from "./uiStore";
import { CARD_HELP, RULE_HELP } from "./ruleInfo";

// ── top bar ──

function IconButton({ onClick, label, children, active }: { onClick: () => void; label: string; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-10 w-10 place-items-center rounded-xl text-lg transition ${active ? "bg-white/15" : "bg-white/[0.06] hover:bg-white/12"} ring-1 ring-white/10`}
    >
      {children}
    </button>
  );
}

export function TopBar() {
  const code = useGame((s) => s.code);
  const pub = useGame((s) => s.pub);
  const connected = useGame((s) => s.connected);
  const [muted, setMuted] = useState(audioPrefs.get().muted);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const setRulesOpen = useUi((s) => s.setRulesOpen);
  const extras = pub ? activeExtras(pub.settings) : [];
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-3 sm:p-4">
      <div className="pointer-events-auto flex items-center gap-2">
        <a href="/" className="font-display hidden text-lg font-black tracking-wider sm:block">
          <span className="bg-gradient-to-r from-neon-blue via-neon-wild to-neon-red bg-clip-text text-transparent">{BRAND.name}</span>
        </a>
        <button
          className="glass flex items-center gap-2 !rounded-xl px-3 py-2 text-sm"
          onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/r/${code}`).then(() => useGame.getState().toast("Invite link copied", "good"))}
          title="Copy invite link"
        >
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-neon-green" : "bg-neon-yellow animate-pulse"}`} />
          <span className="font-display font-bold tracking-[0.15em]">{code}</span>
        </button>
        <button className="glass hidden max-w-[34vw] items-center gap-1.5 truncate !rounded-xl px-3 py-2 text-xs text-white/80 md:flex" onClick={() => setRulesOpen(true)}>
          {extras.length === 0 ? "Classic rules" : extras.slice(0, 3).join(" · ") + (extras.length > 3 ? ` +${extras.length - 3}` : "")}
        </button>
      </div>
      <div className="pointer-events-auto flex items-center gap-2">
        <IconButton label="Rules" onClick={() => setRulesOpen(true)}>
          📜
        </IconButton>
        <IconButton
          label={muted ? "Unmute" : "Mute"}
          onClick={() => {
            unlockAudio();
            audioPrefs.setMuted(!muted);
            setMuted(!muted);
          }}
        >
          {muted ? "🔇" : "🔊"}
        </IconButton>
        <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
          ⚙️
        </IconButton>
      </div>
    </div>
  );
}

// ── settings & rules sheets ──

function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="glass max-h-[85dvh] w-full max-w-md overflow-y-auto p-5 scrollbar-thin"
            initial={{ y: 40, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 40, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="font-display text-lg font-bold">{title}</div>
              <button className="grid h-8 w-8 place-items-center rounded-full bg-white/10" onClick={onClose} aria-label="Close">
                ✕
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SettingsSheet() {
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const quality = useUi((s) => s.quality);
  const setQuality = useUi((s) => s.setQuality);
  const reduceMotion = useUi((s) => s.reduceMotion);
  const setReduceMotion = useUi((s) => s.setReduceMotion);
  const [prefs, setPrefs] = useState(audioPrefs.get());
  const leave = async () => {
    if (await sendAction({ type: "leave" })) window.location.href = "/";
  };
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="Settings">
      <div className="space-y-5 text-sm">
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-white/45">Graphics</div>
          <div className="flex gap-1 rounded-xl bg-black/30 p-1">
            {(["auto", "high", "medium", "low"] as Quality[]).map((q) => (
              <button key={q} onClick={() => setQuality(q)} className={`flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize ${quality === q ? "bg-white text-black" : "text-white/70"}`}>
                {q}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between">
          Reduce motion
          <input type="checkbox" className="h-5 w-5 accent-[#7c5cff]" checked={reduceMotion} onChange={(e) => setReduceMotion(e.target.checked)} />
        </label>
        <div>
          <div className="mb-2 flex justify-between text-xs font-bold uppercase tracking-[0.14em] text-white/45">
            Sound effects <span>{Math.round(prefs.sfx * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={prefs.sfx}
            className="w-full accent-[#7c5cff]"
            onChange={(e) => {
              unlockAudio();
              audioPrefs.setSfxVolume(Number(e.target.value));
              setPrefs(audioPrefs.get());
            }}
            onPointerUp={() => playSfx("play")}
          />
        </div>
        <label className="flex items-center justify-between">
          Background music
          <input
            type="checkbox"
            className="h-5 w-5 accent-[#7c5cff]"
            checked={prefs.music}
            onChange={(e) => {
              audioPrefs.setMusic(e.target.checked);
              setPrefs(audioPrefs.get());
            }}
          />
        </label>
        <button className="btn btn-ghost w-full text-neon-red" onClick={leave}>
          Leave room
        </button>
      </div>
    </Sheet>
  );
}

export function RulesSheet() {
  const open = useUi((s) => s.rulesOpen);
  const setOpen = useUi((s) => s.setRulesOpen);
  const s = useGame((st) => st.pub?.settings);
  if (!s) return null;
  const items: { title: string; text: string }[] = [];
  if (s.stacking !== "off") items.push({ title: `Stacking (${s.stacking === "same" ? "same card" : s.stacking === "mixed" ? "+2/+4 on each other" : "equal or higher"})`, text: RULE_HELP.stacking });
  if (s.sevenSwap) items.push({ title: "7 swaps hands", text: RULE_HELP.sevenSwap });
  if (s.zeroRotate) items.push({ title: "0 passes hands", text: RULE_HELP.zeroRotate });
  if (s.jumpIn) items.push({ title: "Jump-in", text: RULE_HELP.jumpIn });
  if (s.drawUntilPlayable) items.push({ title: "Draw until playable", text: RULE_HELP.drawUntilPlayable });
  if (s.forcePlayDrawn) items.push({ title: "Must play the drawn card", text: RULE_HELP.forcePlayDrawn });
  for (const [k, on] of Object.entries(s.cards)) if (on) items.push(CARD_HELP[k as keyof typeof CARD_HELP]);
  if (s.mercyRule) items.push({ title: `Mercy rule (${s.mercyLimit} cards)`, text: RULE_HELP.mercyRule });
  if (s.afkAutopilot) items.push({ title: "AFK autopilot", text: RULE_HELP.afkAutopilot });
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="Rules at this table">
      <div className="space-y-3 text-sm">
        <div className="rounded-xl bg-white/5 p-3 text-white/75">
          Classic rules: match the top card by color or symbol, or play a wild. Shout <b>{BRAND.shout}</b> when you&apos;re down to one card — or get
          caught for +{s.unoPenalty}. {s.winMode === "points" ? `First to ${s.targetPoints} points wins.` : "First to empty their hand wins."}
          {s.wild4Mode === "challenge" ? " Wild +4 can be challenged." : s.wild4Mode === "free" ? " Wild +4 can be played anytime." : " Wild +4 only without a card of the current color."}
        </div>
        {items.length === 0 ? (
          <div className="text-white/50">No extra rules — pure classic.</div>
        ) : (
          items.map((it) => (
            <div key={it.title} className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/5">
              <div className="font-semibold">{it.title}</div>
              <div className="mt-0.5 text-white/60">{it.text}</div>
            </div>
          ))
        )}
      </div>
    </Sheet>
  );
}

// ── color picker ──

const LABEL: Record<Color, string> = { red: "Red", yellow: "Yellow", green: "Green", blue: "Blue" };

export function ColorPicker() {
  const picker = useGame((s) => s.picker);
  const mustChoose = useGame((s) => s.priv?.mustChooseColor ?? false);
  const purpose = useGame((s) => (s.pub?.turn.kind === "choose_color" ? s.pub.turn.purpose : null));
  const open = (picker?.kind === "color") || mustChoose;
  const choose = (color: Color) => {
    playSfx("click");
    const p = useGame.getState().picker;
    if (p?.kind === "color") void playCard(p.cardId, { color });
    else void sendAction({ type: "choose_color", color });
  };
  const title = mustChoose ? (purpose === "roulette" ? "Color Roulette — name a color" : "Pick the starting color") : "Pick a color";
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-40 grid place-items-center bg-black/45 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="flex flex-col items-center gap-5">
            <div className="font-display text-center text-lg font-bold tracking-wide">{title}</div>
            <motion.div className="relative h-64 w-64" initial={{ scale: 0.4, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0.4, rotate: 90 }} transition={{ type: "spring", stiffness: 260, damping: 20 }}>
              {COLORS.map((c, i) => {
                const pos = [
                  "left-0 top-0 rounded-tl-full",
                  "right-0 top-0 rounded-tr-full",
                  "left-0 bottom-0 rounded-bl-full",
                  "right-0 bottom-0 rounded-br-full",
                ][i];
                return (
                  <motion.button
                    key={c}
                    whileHover={{ scale: 1.07 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => choose(c)}
                    className={`absolute h-[124px] w-[124px] ${pos} font-display text-sm font-black text-black/70`}
                    style={{ background: COLOR_HEX[c], boxShadow: `0 0 34px ${COLOR_HEX[c]}` }}
                  >
                    {LABEL[c]}
                  </motion.button>
                );
              })}
              <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0b0a18] ring-4 ring-white/10" />
            </motion.div>
            {picker && (
              <button className="btn btn-ghost py-2 text-sm" onClick={() => useGame.getState().setPicker(null)}>
                Cancel
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SwapHint() {
  const picker = useGame((s) => s.picker);
  return (
    <AnimatePresence>
      {picker?.kind === "swap" && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          className="glass fixed left-1/2 top-20 z-40 flex -translate-x-1/2 items-center gap-3 !rounded-full px-4 py-2 text-sm"
        >
          <span className="text-neon-wild">⇄</span> Tap a player to swap hands with
          <button className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs" onClick={() => useGame.getState().setPicker(null)}>
            Cancel
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── action bar ──

export function ActionBar() {
  const priv = useGame((s) => s.priv);
  const pub = useGame((s) => s.pub);
  const you = useGame((s) => s.you);
  const selected = useGame((s) => s.selectedCardId);
  const sortMode = useUi((s) => s.sortMode);
  const setSort = useUi((s) => s.setSort);
  if (!priv || !pub || pub.phase !== "playing") return null;
  const myTurn = pub.turnPlayerId === you;
  const me = pub.players.find((p) => p.id === you);
  const selectedPlayable = selected && (priv.playable.includes(selected) || priv.jumpIn.includes(selected));

  const btn = "btn font-display text-sm tracking-wide py-2.5 px-4";
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[27dvh] z-30 flex justify-center px-3 sm:bottom-[28dvh]">
      <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
        {selectedPlayable && (
          <motion.button initial={{ scale: 0.8 }} animate={{ scale: 1 }} className={`${btn} btn-primary`} onClick={() => void playCard(selected!)}>
            Play card
          </motion.button>
        )}
        {priv.canDraw && (
          <button className={`${btn} btn-ghost`} onClick={() => void sendAction({ type: "draw" })}>
            Draw
          </button>
        )}
        {priv.canPass && (
          <button className={`${btn} btn-ghost`} onClick={() => void sendAction({ type: "pass" })}>
            Keep it & pass
          </button>
        )}
        {priv.canTakePenalty && (
          <button className={`${btn} bg-neon-red/90 text-white shadow-[0_0_24px_rgba(255,59,92,0.6)]`} onClick={() => void sendAction({ type: "take_penalty" })}>
            Take +{pub.drawStack}
          </button>
        )}
        {priv.canChallenge && (
          <button className={`${btn} btn-ghost ring-1 ring-neon-yellow/60`} onClick={() => void sendAction({ type: "challenge" })}>
            Challenge!
          </button>
        )}
        {priv.canCallUno && (
          <motion.button
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ repeat: Infinity, duration: 0.9 }}
            className={`${btn} bg-neon-yellow text-black shadow-[0_0_30px_rgba(255,210,63,0.75)]`}
            onClick={() => void sendAction({ type: "call_uno" })}
          >
            {BRAND.shout}
          </motion.button>
        )}
        {(me?.cardCount ?? 0) > 2 && !myTurn && (
          <button
            className="rounded-full bg-black/40 px-3 py-1.5 text-[11px] text-white/60 ring-1 ring-white/10"
            onClick={() => setSort(sortMode === "color" ? "number" : sortMode === "number" ? "none" : "color")}
          >
            Sort: {sortMode}
          </button>
        )}
      </div>
    </div>
  );
}

// ── turn status / stack / my badge ──

export function TurnStatus() {
  const pub = useGame((s) => s.pub);
  const you = useGame((s) => s.you);
  if (!pub || pub.phase !== "playing") return null;
  const myTurn = pub.turnPlayerId === you;
  const color = pub.currentColor ? COLOR_HEX[pub.currentColor] : COLOR_HEX.wild;
  const turnName = playerName(pub, pub.turnPlayerId, you);
  let text = myTurn ? "Your turn" : `${turnName}'s turn`;
  if (pub.turn.kind === "stack" && pub.drawStack > 0) text = myTurn ? `Stack it or take +${pub.drawStack}` : `${turnName} faces +${pub.drawStack}`;
  if (pub.turn.kind === "choose_color") text = myTurn ? "Choose a color" : `${turnName} is choosing a color`;
  return (
    <>
      {/* screen-edge glow on your turn */}
      <div
        className="pointer-events-none fixed inset-0 z-20 transition-opacity duration-500"
        style={{ opacity: myTurn ? 1 : 0, boxShadow: `inset 0 0 90px -20px ${color}, inset 0 0 0 2px ${color}55` }}
      />
      <div className="pointer-events-none fixed inset-x-0 top-16 z-20 flex justify-center">
        <motion.div
          key={text}
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="font-display rounded-full bg-black/45 px-4 py-1.5 text-xs font-bold tracking-[0.14em] uppercase backdrop-blur ring-1 ring-white/10"
          style={{ color: myTurn ? color : "rgba(255,255,255,0.8)" }}
        >
          {text}
        </motion.div>
      </div>
      <AnimatePresence>
        {pub.drawStack > 0 && (
          <motion.div
            key="stack"
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: [1.25, 1], opacity: 1 }}
            exit={{ scale: 0.3, opacity: 0 }}
            className="font-display pointer-events-none fixed left-1/2 top-[34%] z-20 -translate-x-1/2 text-6xl font-black text-neon-red neon-text"
          >
            +{pub.drawStack}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function MyBadge() {
  const pub = useGame((s) => s.pub);
  const you = useGame((s) => s.you);
  if (!pub || pub.phase === "lobby" || !you) return null;
  const me = pub.players.find((p) => p.id === you);
  if (!me) return null;
  const myTurn = pub.turnPlayerId === you && pub.phase === "playing";
  const color = pub.currentColor ? COLOR_HEX[pub.currentColor] : COLOR_HEX.wild;
  return (
    <div className="pointer-events-none fixed bottom-[27dvh] left-3 z-30 flex items-center gap-2 sm:left-5">
      <div className="relative grid h-12 w-12 place-items-center rounded-full bg-[#15132a] text-2xl ring-1 ring-white/15" style={{ boxShadow: myTurn ? `0 0 24px ${color}` : undefined }}>
        {myTurn && <TimerRing size={48} color={color} />}
        {me.avatar}
        <SeatFxStack pid={me.id} />
      </div>
      <div className="hidden text-xs sm:block">
        <div className="font-semibold">{me.name}</div>
        <div className="text-white/50">
          {me.cardCount} card{me.cardCount === 1 ? "" : "s"}
          {pub.settings.winMode === "points" ? ` · ${me.score} pts` : ""}
        </div>
      </div>
    </div>
  );
}

// ── toasts ──

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const color = { info: "rgba(255,255,255,0.85)", warn: "#ffd23f", error: "#ff6b84", good: "#2bff88" };
  return (
    <div className="pointer-events-none fixed inset-x-0 top-28 z-50 flex flex-col items-center gap-2 px-3">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass !rounded-full px-4 py-2 text-sm font-medium"
            style={{ color: color[t.tone] }}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ── keyboard ──

export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea")) return;
      const g = useGame.getState();
      const priv = g.priv;
      if (!priv) return;
      const hand = sortHand(priv.hand, useUi.getState().sortMode);
      const idx = hand.findIndex((c) => c.id === g.selectedCardId);
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const n = hand.length;
        if (!n) return;
        const next = idx < 0 ? 0 : (idx + (e.key === "ArrowRight" ? 1 : -1) + n) % n;
        g.select(hand[next].id);
      } else if (e.key === "Enter" && g.selectedCardId) {
        void playCard(g.selectedCardId);
      } else if (e.key.toLowerCase() === "d" && priv.canDraw) {
        void sendAction({ type: "draw" });
      } else if (e.key.toLowerCase() === "u" && priv.canCallUno) {
        void sendAction({ type: "call_uno" });
      } else if (e.key === "Escape") {
        g.setPicker(null);
        g.select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

