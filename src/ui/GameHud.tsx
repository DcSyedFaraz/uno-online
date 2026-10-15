"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { UNO_CATCH_GRACE_MS, UNO_WINDOW_MS } from "@/engine/uno";
import { serverNow } from "@/client/clock";
import { activeExtras, COLORS, FINAL_STRETCH_MS, type Color } from "@/engine";
import { BRAND } from "@/brand";
import { playCard, sendAction } from "@/client/actions";
import { playerName, useGame } from "@/client/store/game-store";
import { audioPrefs, playSfx, unlockAudio } from "@/audio/sound";
import { enterLandscapeFullscreen, exitFullscreen, useCanLockLandscape, useIsFullscreen } from "@/client/device";
import { COLOR_HEX } from "@/scene/sceneStore";
import { SeatFxStack, TimerRing, TURN_SHADOW, TurnPing, useSmallScreen } from "@/scene/zones/SeatChips";
import { useScene } from "@/scene/sceneStore";
import { shoutNow } from "@/scene/anim/director";
import { sortHand, useUi, type Quality } from "./uiStore";
import { CARD_HELP, RULE_HELP } from "./ruleInfo";

// ── top bar ──

function IconButton({ onClick, label, children, active }: { onClick: () => void; label: string; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-10 w-10 place-items-center rounded-xl text-lg transition shadow-[inset_0_0_0_2px_rgba(255,255,255,0.45),0_3px_0_#133f99] hover:brightness-110 active:translate-y-0.5 short:h-9 short:w-9 short:text-base ${active ? "bg-gold" : "bg-[#1d5fd6]"}`}
    >
      {children}
    </button>
  );
}

/** Fullscreen with landscape lock, on phones and tablets that allow it (not iPhone). */
export function FullscreenButton() {
  const supported = useCanLockLandscape();
  const full = useIsFullscreen();
  if (!supported) return null;
  return (
    <IconButton label={full ? "Exit fullscreen" : "Fullscreen"} active={full} onClick={() => void (full ? exitFullscreen() : enterLandscapeFullscreen())}>
      ⛶
    </IconButton>
  );
}

/** Round time left. Gold with "2×" in the final minute (turns run twice as fast), pulsing red in the last 10s. */
function RoundClock() {
  const endsAt = useGame((s) => (s.pub?.phase === "playing" ? s.pub.roundEndsAt : null));
  const limitMs = useGame((s) => (s.pub?.settings.roundTimerMin ?? 0) * 60_000);
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (endsAt == null) return;
    // a reload inside the final minute shouldn't announce it again
    let prevLeft = endsAt - serverNow();
    const id = setInterval(() => {
      const t = serverNow();
      const left = endsAt - t;
      if (prevLeft > FINAL_STRETCH_MS && left <= FINAL_STRETCH_MS && left > 0) {
        useScene.getState().showCallout({ icon: "⏱", title: "FINAL MINUTE!", sub: "Turns are 2× faster now", color: "#ffcf1a" });
        playSfx("turn");
      }
      prevLeft = left;
      setNow(t);
    }, 250);
    return () => clearInterval(id);
  }, [endsAt]);
  if (endsAt == null) return null;
  const left = Math.max(0, Math.min(endsAt - now, limitMs || Infinity));
  const secs = Math.ceil(left / 1000);
  const final = left <= FINAL_STRETCH_MS;
  const urgent = left <= 10_000;
  return (
    <div
      className={`glass flex items-center gap-1.5 !rounded-xl px-3 py-2 text-sm short:py-1.5 short:text-xs ${urgent ? "animate-pulse bg-neon-red bg-none" : final ? "bg-gold bg-none text-ink" : ""}`}
      title="Round time left. When it runs out, the fewest card points wins. The last minute plays at 2× speed."
      aria-label={`Round time left: ${Math.floor(secs / 60)} minutes ${secs % 60} seconds`}
    >
      <span aria-hidden>⏱</span>
      <span className="font-display font-bold tabular-nums">
        {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
      </span>
      {final && <span className="rounded-md bg-ink px-1 text-[10px] font-black leading-4 text-gold">2×</span>}
    </div>
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
    <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-2 py-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:py-4 short:py-2">
      <div className="pointer-events-auto flex items-center gap-2">
        <Link href="/" className="font-display toon-text hidden text-lg font-black tracking-wider text-[#ffd84a] sm:block short:hidden">
          {BRAND.name}
        </Link>
        <button
          className="glass flex items-center gap-2 !rounded-xl px-3 py-2 text-sm short:py-1.5 short:text-xs"
          onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/r/${code}`).then(() => useGame.getState().toast("Invite link copied", "good"))}
          title="Copy invite link"
        >
          <span className={`h-2.5 w-2.5 rounded-full ring-2 ring-white ${connected ? "bg-neon-green" : "bg-neon-yellow animate-pulse"}`} />
          <span className="font-display font-bold tracking-[0.15em]">{code}</span>
        </button>
        <RoundClock />
        <button className="glass hidden max-w-[34vw] items-center gap-1.5 truncate !rounded-xl px-3 py-2 text-xs font-semibold md:flex short:hidden" onClick={() => setRulesOpen(true)}>
          {extras.length === 0 ? "Classic rules" : extras.slice(0, 3).join(" · ") + (extras.length > 3 ? ` +${extras.length - 3}` : "")}
        </button>
      </div>
      <div className="pointer-events-auto flex items-center gap-2 short:gap-1.5">
        <FullscreenButton />
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
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-[#3a0308]/45 p-3 sm:items-center short:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="glass max-h-[85dvh] w-full max-w-md overflow-y-auto p-5 scrollbar-thin short:max-h-[92dvh] short:p-4"
            initial={{ y: 40, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 40, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="font-display text-lg font-bold">{title}</div>
              <button className="grid h-8 w-8 place-items-center rounded-full bg-white/20 ring-2 ring-white/50" onClick={onClose} aria-label="Close">
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
  const router = useRouter();
  const isHost = useGame((s) => !!s.you && s.pub?.hostId === s.you);
  const leave = async () => {
    if (await sendAction({ type: "leave" })) router.push("/");
  };
  const closeRoom = async () => {
    if (window.confirm("Close this room for everyone? It will be deleted.") && (await sendAction({ type: "close_room" }))) router.push("/");
  };
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="Settings">
      <div className="space-y-5 text-sm">
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-white/70">Graphics</div>
          <div className="flex gap-1 rounded-xl bg-[#133f99]/60 p-1">
            {(["auto", "high", "medium", "low"] as Quality[]).map((q) => (
              <button key={q} onClick={() => setQuality(q)} className={`flex-1 rounded-lg py-1.5 text-xs font-bold capitalize ${quality === q ? "bg-white text-ink" : "text-white/80"}`}>
                {q}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between">
          Reduce motion
          <input type="checkbox" className="h-5 w-5 accent-[#2fb84c]" checked={reduceMotion} onChange={(e) => setReduceMotion(e.target.checked)} />
        </label>
        <div>
          <div className="mb-2 flex justify-between text-xs font-bold uppercase tracking-[0.14em] text-white/70">
            Sound effects <span>{Math.round(prefs.sfx * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={prefs.sfx}
            className="w-full accent-[#2fb84c]"
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
            className="h-5 w-5 accent-[#2fb84c]"
            checked={prefs.music}
            onChange={(e) => {
              audioPrefs.setMusic(e.target.checked);
              setPrefs(audioPrefs.get());
            }}
          />
        </label>
        <button className="btn w-full bg-white text-neon-red shadow-[0_3px_0_rgba(10,30,90,0.35)]" onClick={leave}>
          Leave room
        </button>
        {isHost && (
          <button className="btn w-full bg-neon-red text-white shadow-[0_3px_0_rgba(10,30,90,0.35)]" onClick={closeRoom}>
            Close room for everyone
          </button>
        )}
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
        <div className="rounded-xl bg-white/15 p-3 text-white/90">
          Classic rules: match the top card by color or symbol, or play a wild. Shout <b>{BRAND.shout}</b> when you&apos;re down to one card — or get
          caught for +{s.unoPenalty}. {s.winMode === "points" ? `First to ${s.targetPoints} points wins.` : "First to empty their hand wins."}
          {s.roundTimerMin > 0 && ` Rounds last up to ${s.roundTimerMin} minutes: when time runs out, the fewest card points wins, and the last minute plays at 2× speed.`}
          {s.wild4Mode === "challenge" ? " Wild +4 can be challenged." : s.wild4Mode === "free" ? " Wild +4 can be played anytime." : " Wild +4 only without a card of the current color."}
        </div>
        {items.length === 0 ? (
          <div className="text-white/80">No extra rules — pure classic.</div>
        ) : (
          items.map((it) => (
            <div key={it.title} className="rounded-xl bg-white/10 p-3 ring-1 ring-white/20">
              <div className="font-semibold">{it.title}</div>
              <div className="mt-0.5 text-white/80">{it.text}</div>
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
        <motion.div className="fixed inset-0 z-40 grid place-items-center bg-[#3a0308]/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="flex flex-col items-center gap-5 short:gap-3">
            <div className="font-display toon-text text-center text-xl font-black tracking-wide short:text-lg">{title}</div>
            <motion.div className="relative h-64 w-64 short:h-52 short:w-52" initial={{ scale: 0.4, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0.4, rotate: 90 }} transition={{ type: "spring", stiffness: 260, damping: 20 }}>
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
                    className={`absolute h-[124px] w-[124px] ${pos} font-display toon-text text-sm font-black text-white short:h-[100px] short:w-[100px] short:text-xs`}
                    style={{ background: COLOR_HEX[c], boxShadow: "inset 0 0 0 3px rgba(255,255,255,0.75), 0 5px 0 rgba(20,33,61,0.45)" }}
                  >
                    {LABEL[c]}
                  </motion.button>
                );
              })}
              <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-4 ring-[#14213d]/20 short:h-12 short:w-12" />
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
          className="glass fixed left-1/2 top-20 z-40 flex -translate-x-1/2 items-center gap-3 !rounded-full px-4 py-2 text-sm font-semibold short:top-14"
        >
          <span>⇄</span> Tap a player to swap hands with
          <button className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs ring-1 ring-white/50" onClick={() => useGame.getState().setPicker(null)}>
            Cancel
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── bottom HUD: your badge, actions, shout & catch ──

/** Re-renders when the catch window opens/closes, so the hammer shows up at the right moment. */
function useCatchTarget(): { id: string; name: string } | null {
  const w = useGame((s) => s.pub?.unoWindow ?? null);
  const pub = useGame((s) => s.pub);
  const you = useGame((s) => s.you);
  const [, force] = useState(0);
  useEffect(() => {
    if (!w) return;
    const now = serverNow();
    const t1 = setTimeout(() => force((n) => n + 1), Math.max(0, w.openedAt + UNO_CATCH_GRACE_MS - now) + 20);
    const t2 = setTimeout(() => force((n) => n + 1), Math.max(0, w.openedAt + UNO_WINDOW_MS - now) + 20);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [w]);
  if (!w || !pub || w.playerId === you) return null;
  const age = serverNow() - w.openedAt;
  if (age < UNO_CATCH_GRACE_MS || age >= UNO_WINDOW_MS) return null;
  const target = pub.players.find((p) => p.id === w.playerId);
  if (!target || target.cardCount !== 1 || target.saidUno) return null;
  return { id: target.id, name: target.name };
}

/** Turn prompt and the pending "+N", shown in the row just above your hand. */
function TurnPill() {
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
      <motion.div
        key={text}
        initial={{ y: 6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={`font-display flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] shadow-[0_3px_0_rgba(20,33,61,0.35)] ring-2 ring-white sm:text-xs short:text-[10px] ${
          myTurn ? "bg-gold text-ink" : "bg-[#1d5fd6] text-white"
        }`}
      >
        <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white" style={{ background: color }} />
        {text}
      </motion.div>
      <AnimatePresence>
        {pub.drawStack > 0 && (
          <motion.div
            key={`stack${pub.drawStack}`}
            initial={{ scale: 1.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 16 }}
            className="font-display toon-text rounded-full bg-neon-red px-3 py-1 text-base font-black text-white ring-2 ring-white shadow-[0_3px_0_#7d0710]"
          >
            +{pub.drawStack}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function BottomHud() {
  const priv = useGame((s) => s.priv);
  const pub = useGame((s) => s.pub);
  const you = useGame((s) => s.you);
  const selected = useGame((s) => s.selectedCardId);
  const sortMode = useUi((s) => s.sortMode);
  const setSort = useUi((s) => s.setSort);
  const catchTarget = useCatchTarget();
  const small = useSmallScreen();
  if (!priv || !pub || pub.phase !== "playing") return null;
  const me = pub.players.find((p) => p.id === you);
  const badge = small ? 48 : 56;
  const myTurn = pub.turnPlayerId === you;
  const color = pub.currentColor ? COLOR_HEX[pub.currentColor] : COLOR_HEX.wild;
  const selectedPlayable = selected && (priv.playable.includes(selected) || priv.jumpIn.includes(selected));
  const mustShout = priv.canCallUno && (me?.cardCount ?? 0) === 1;
  const shouted = !!me?.saidUno && me.cardCount === 1;

  const btn = "btn font-display text-[13px] tracking-wide py-2.5 px-3.5 sm:px-4 sm:text-sm short:py-2 short:text-xs";
  const corner = "fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 short:bottom-2";
  return (
    <>
      {/* your badge: bottom-left corner, beside the hand */}
      {me && (
        <div className={`${corner} pointer-events-none left-[max(0.75rem,env(safe-area-inset-left))] flex flex-col items-center gap-1`}>
          <div
            className={`relative grid place-items-center rounded-full ${small ? "text-2xl" : "text-[28px]"}`}
            style={{
              width: badge,
              height: badge,
              background: "radial-gradient(circle at 35% 30%, #ffffff, #d4e4ff)",
              boxShadow: myTurn ? TURN_SHADOW : "0 0 0 3px #ffffff, 0 4px 0 rgba(10,40,110,0.35)",
            }}
          >
            {myTurn && <TurnPing />}
            {myTurn && <TimerRing size={badge} color={color} />}
            {me.avatar}
            <SeatFxStack pid={me.id} />
          </div>
          <div
            className={`max-w-[96px] truncate rounded-full px-2 py-0.5 text-[10px] font-bold ring-2 ring-white/80 ${myTurn ? "bg-gold text-ink shadow-[0_2px_0_#a87400]" : "bg-[#1d5fd6] text-white shadow-[0_2px_0_#133f99]"}`}
          >
            {me.cardCount} card{me.cardCount === 1 ? "" : "s"}
            {pub.settings.winMode === "points" ? ` · ${me.score}` : ""}
          </div>
        </div>
      )}

      {/* turn prompt and actions: one row just above the hand (its top is published as --hand-top) */}
      <div
        className="pointer-events-none fixed inset-x-0 z-30 mx-auto flex max-w-[70vw] flex-wrap items-center justify-center gap-2 short:gap-1.5"
        style={{ bottom: "calc(var(--hand-top, 26dvh) + 6px)" }}
      >
        <TurnPill />
        <div className="pointer-events-auto contents">
          <AnimatePresence>
            {catchTarget && (
              <motion.button
                key="catch"
                initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                whileTap={{ scale: 0.9, rotate: -25 }}
                className={`${btn} pointer-events-auto bg-neon-red text-white ring-2 ring-white shadow-[0_4px_0_#7d0710]`}
                onClick={() => {
                  playSfx("click");
                  void sendAction({ type: "catch_uno", targetId: catchTarget.id });
                }}
              >
                <motion.span animate={{ rotate: [0, -35, 0] }} transition={{ repeat: Infinity, duration: 0.7 }} className="inline-block origin-bottom-right">
                  🔨
                </motion.span>
                Catch {catchTarget.name}! +{pub.settings.unoPenalty}
              </motion.button>
            )}
          </AnimatePresence>
          {selectedPlayable && (
            <motion.button initial={{ scale: 0.8 }} animate={{ scale: 1 }} className={`${btn} btn-primary pointer-events-auto`} onClick={() => void playCard(selected!)}>
              Play card
            </motion.button>
          )}
          {priv.canDraw && !selectedPlayable && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#1c8f37] shadow-[0_3px_0_rgba(20,33,61,0.3)] short:text-[11px]"
            >
              {priv.playable.length ? "Play a card or tap the deck to draw" : "No match — tap the deck to draw"}
            </motion.div>
          )}
          {priv.canPass && (
            <button className={`${btn} btn-ghost pointer-events-auto bg-[#1d5fd6]`} onClick={() => void sendAction({ type: "pass" })}>
              Keep &amp; pass
            </button>
          )}
          {priv.canTakePenalty && (
            <button className={`${btn} pointer-events-auto bg-neon-red text-white ring-2 ring-white shadow-[0_4px_0_#7d0710]`} onClick={() => void sendAction({ type: "take_penalty" })}>
              Take +{pub.drawStack}
            </button>
          )}
          {priv.canChallenge && (
            <button className={`${btn} pointer-events-auto bg-gold text-ink ring-2 ring-white shadow-[0_4px_0_#a87400]`} onClick={() => void sendAction({ type: "challenge" })}>
              Challenge!
            </button>
          )}
        </div>
      </div>

      {/* the big round shout button: bottom-right corner, always there, lit when you can (or must) use it */}
      <div className={`${corner} pointer-events-auto right-[max(0.75rem,env(safe-area-inset-right))] flex flex-col items-center gap-1.5`}>
        {(me?.cardCount ?? 0) > 2 && (
          <button
            className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-ink shadow-[0_2px_0_rgba(20,33,61,0.3)]"
            onClick={() => setSort(sortMode === "color" ? "number" : sortMode === "number" ? "none" : "color")}
          >
            Sort: {sortMode}
          </button>
        )}
        <motion.button
          aria-label={`Shout ${BRAND.shout}`}
          disabled={!priv.canCallUno}
          animate={priv.canCallUno ? { scale: mustShout ? [1, 1.14, 1] : [1, 1.05, 1] } : { scale: 1 }}
          transition={priv.canCallUno ? { repeat: Infinity, duration: mustShout ? 0.55 : 1 } : undefined}
          onClick={() => {
            if (you) shoutNow(you);
            void sendAction({ type: "call_uno" });
          }}
          className={`font-display toon-text grid h-20 w-20 place-items-center rounded-full text-lg font-black tracking-tight text-[#ffd84a] transition-[filter] short:h-16 short:w-16 short:text-base ${
            priv.canCallUno ? "" : shouted ? "" : "saturate-[0.55] brightness-90"
          }`}
          style={{
            background: "radial-gradient(circle at 50% 32%, #ff7b6b, #e8202a 55%, #b10f1a)",
            boxShadow: `inset 0 -5px 0 rgba(90,0,10,0.45), inset 0 3px 0 rgba(255,255,255,0.35), 0 0 0 3px ${shouted ? "#ffcf1a" : "#ffffff"}, 0 6px 0 #7d0710, 0 10px 18px rgba(60,0,10,0.45)`,
          }}
          title={priv.canCallUno ? "Shout before someone catches you!" : "Shout when you are down to your last card"}
        >
          {BRAND.shout}
        </motion.button>
      </div>
    </>
  );
}

// ── turn status: a gold screen frame on your turn (the turn pill lives in the bottom HUD) ──

export function TurnStatus() {
  const pub = useGame((s) => s.pub);
  const you = useGame((s) => s.you);
  if (!pub || pub.phase !== "playing") return null;
  const myTurn = pub.turnPlayerId === you;
  // gold, not the card color: a red frame vanished against the red stage
  return (
    <div
      className="pointer-events-none fixed inset-0 z-20 transition-opacity duration-500"
      style={{ opacity: myTurn ? 1 : 0, boxShadow: "inset 0 0 60px -12px rgba(255,207,26,0.95), inset 0 0 0 4px #ffcf1a" }}
    />
  );
}

// ── shout banner (everyone sees who shouted / got caught) ──

export function ShoutBanner() {
  const shouts = useScene((s) => s.shouts);
  const pub = useGame((s) => s.pub);
  const you = useGame((s) => s.you);
  const last = shouts[shouts.length - 1];
  const who = last ? pub?.players.find((p) => p.id === last.pid) : undefined;
  const by = last?.by ? pub?.players.find((p) => p.id === last.by) : undefined;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[30%] z-40 grid justify-items-center short:top-[18%]">
      <AnimatePresence>
        {last && (
          <motion.div
            key={last.id}
            initial={{ scale: 0.2, opacity: 0, rotate: -8 }}
            animate={{ scale: [1.35, 1], opacity: 1, rotate: 0 }}
            exit={{ scale: 1.6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 14 }}
            className="col-start-1 row-start-1 flex flex-col items-center"
          >
            <div
              className={`font-display toon-text text-7xl font-black italic tracking-tight sm:text-8xl short:text-6xl ${last.kind === "shout" ? "text-[#ffd84a]" : "text-[#ff5a52]"}`}
            >
              {last.kind === "shout" ? BRAND.shout : "🔨 CAUGHT!"}
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-full bg-[#1d5fd6] px-4 py-1.5 text-sm font-bold ring-2 ring-white shadow-[0_3px_0_#133f99]">
              <span className="text-lg">{who?.avatar}</span>
              {last.kind === "shout"
                ? `${who?.id === you ? "You" : (who?.name ?? "Someone")} shouted ${BRAND.shout}`
                : `${by?.id === you ? "You" : (by?.name ?? "Someone")} caught ${who?.id === you ? "you" : (who?.name ?? "someone")} — +${pub?.settings.unoPenalty ?? 2} cards`}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── action callout: what an action or wild card just did ──

export function ActionCallout() {
  const c = useScene((s) => s.callout);
  return (
    // sits in the empty middle of the top bar; old and new callouts share one grid cell so
    // the one fading out never pushes the new one sideways
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[35] grid justify-items-center px-4 sm:top-3">
      <AnimatePresence>
        {c && (
          <motion.div
            key={c.id}
            initial={{ scale: 0.3, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: -10 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
            className="col-start-1 row-start-1 flex max-w-[min(50vw,460px)] items-center gap-3 rounded-2xl bg-white py-2 pl-2 pr-4 short:gap-2 short:py-1.5 max-sm:max-w-[min(92vw,460px)]"
            style={{ boxShadow: `inset 0 0 0 3px ${c.color}, 0 5px 0 rgba(20,33,61,0.3), 0 16px 30px -10px rgba(60,0,10,0.55)` }}
          >
            <motion.div
              initial={{ rotate: -25 }}
              animate={{ rotate: 0 }}
              className="font-display toon-text grid h-14 w-14 shrink-0 place-items-center rounded-xl text-2xl font-black text-white ring-2 ring-white short:h-11 short:w-11 short:text-xl"
              style={{ background: c.icon === "wheel" ? WHEEL : c.color, boxShadow: "0 3px 0 rgba(20,33,61,0.35)" }}
            >
              {c.icon === "wheel" ? <span className="h-5 w-5 rounded-full ring-[3px] ring-white" style={{ background: c.color }} /> : c.icon}
            </motion.div>
            <div className="min-w-0">
              <div className="font-display text-xl font-black leading-tight tracking-tight text-ink short:text-lg">{c.title}</div>
              <div className="text-sm font-semibold leading-snug text-ink/75 short:text-xs">{c.sub}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const WHEEL = `conic-gradient(${COLOR_HEX.red} 0 25%, ${COLOR_HEX.yellow} 0 50%, ${COLOR_HEX.green} 0 75%, ${COLOR_HEX.blue} 0)`;

// ── toasts ──

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  // white pills with colored text: readable over the bright table
  const color = { info: "#14213d", warn: "#b36b00", error: "#d0101c", good: "#1c8f37" };
  return (
    <div className="pointer-events-none fixed inset-x-0 top-28 z-50 flex flex-col items-center gap-2 px-3 short:top-14">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="rounded-full bg-white px-4 py-2 text-sm font-bold shadow-[0_3px_0_rgba(20,33,61,0.3),0_10px_24px_-10px_rgba(60,0,10,0.5)]"
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
        if (g.you) shoutNow(g.you);
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

