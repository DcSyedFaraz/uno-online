"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "motion/react";
import { useState } from "react";
import { BRAND } from "@/brand";
import { api, ApiError } from "@/client/api";
import { saveProfile } from "@/client/profile";
import { useRoom } from "@/client/realtime/useRoom";
import { useGame } from "@/client/store/game-store";
import { unlockAudio } from "@/audio/sound";
import { useNeedsRotate } from "@/client/device";
import { ActionCallout, BottomHud, ColorPicker, FullscreenButton, RulesSheet, SettingsSheet, ShoutBanner, SwapHint, Toasts, TopBar, TurnStatus, useKeyboard } from "./GameHud";
import { useStoredProfile } from "./Landing";
import { Lobby } from "./Lobby";
import { ProfileForm } from "./ProfileForm";
import { RotateGate } from "./RotateGate";
import { Scoreboard } from "./Scoreboard";
import { ChatDock, useSocialFx } from "./Social";
import { SeatChips } from "@/scene/zones/SeatChips";

const GameCanvas = dynamic(() => import("@/scene/GameCanvas"), { ssr: false });
const HeroCanvas = dynamic(() => import("@/scene/HeroCanvas"), { ssr: false });

function Center({ children }: { children: React.ReactNode }) {
  return <div className="relative z-10 grid min-h-dvh place-items-center p-4">{children}</div>;
}

function JoinCard({ code }: { code: string }) {
  const pub = useGame((s) => s.pub);
  const [profile, setProfile] = useStoredProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const host = pub?.players.find((p) => p.id === pub.hostId);
  const join = async () => {
    unlockAudio();
    setBusy(true);
    setError(null);
    try {
      saveProfile(profile);
      useGame.getState().receive(await api.join(code, profile));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't join");
      setBusy(false);
    }
  };
  return (
    <Center>
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="glass w-full max-w-sm p-5">
        <div className="mb-4 text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">You&apos;re invited to</div>
          <div className="font-display text-3xl font-black tracking-[0.18em]">{code}</div>
          {host && (
            <div className="mt-1 text-sm text-white/80">
              {host.avatar} {host.name}&apos;s table · {pub?.players.filter((p) => p.status !== "left").length}/10 players
            </div>
          )}
          {pub?.phase === "playing" && <div className="mt-2 text-xs font-semibold text-[#ffe48a]">A round is in progress — you can join when it ends.</div>}
        </div>
        <ProfileForm value={profile} onChange={setProfile} autoFocus />
        <button className="btn btn-primary font-display mt-5 w-full py-3.5" disabled={busy || !profile.name.trim()} onClick={join}>
          {busy ? "Joining…" : "Join table"}
        </button>
        {error && <div className="mt-3 rounded-lg bg-white px-3 py-2 text-center text-sm font-semibold text-neon-red">{error}</div>}
      </motion.div>
    </Center>
  );
}

function InGame() {
  useKeyboard();
  return (
    <>
      <SeatChips />
      <TopBar />
      <TurnStatus />
      <BottomHud />
      <ActionCallout />
      <ShoutBanner />
      <SwapHint />
      <ColorPicker />
      <Scoreboard />
      <ChatDock />
      <Toasts />
      <SettingsSheet />
      <RulesSheet />
    </>
  );
}

function LobbyView() {
  return (
    <main className="relative min-h-dvh">
      {/* dims the table a little behind the lobby panels (no blur: see globals.css .glass) */}
      <div className="pointer-events-none fixed inset-0 bg-[#3a0a14]/20" />
      <div className="fixed left-[max(1rem,env(safe-area-inset-left))] top-4 z-20 flex items-center gap-2 short:top-2">
        <Link href="/" className="font-display toon-text text-xl font-black tracking-wider text-[#ffd84a] short:text-lg">
          {BRAND.name}
        </Link>
        <FullscreenButton />
      </div>
      <Lobby />
      <ChatDock />
      <Toasts />
    </main>
  );
}

export function Room({ code }: { code: string }) {
  const { status, error } = useRoom(code);
  const phase = useGame((s) => s.pub?.phase);
  const needsRotate = useNeedsRotate();
  const removed = useGame((s) => s.removed);
  useSocialFx();

  if (removed) {
    return (
      <main>
        <HeroCanvas />
        <Center>
          <div className="glass p-6 text-center">
            <div className="font-display text-xl font-bold">You&apos;re no longer at this table</div>
            <Link href="/" className="btn btn-primary mt-4">
              Back to {BRAND.name}
            </Link>
          </div>
        </Center>
      </main>
    );
  }

  // the 3D table stays mounted from the lobby on, so the deal animation plays from the first frame
  if (status === "ready" && phase) {
    return (
      <>
        {/* tables are landscape-only on phones; the scene pauses while the rotate prompt is up */}
        <GameCanvas paused={needsRotate} />
        <div className="stage-vignette pointer-events-none fixed inset-0 z-[5]" />
        {phase === "lobby" ? <LobbyView /> : <InGame />}
        {needsRotate && <RotateGate />}
      </>
    );
  }

  return (
    <main className="relative min-h-dvh">
      <HeroCanvas />
      <div className="stage-vignette pointer-events-none fixed inset-0" />
      {status === "loading" && (
        <Center>
          <div className="font-display toon-text animate-pulse text-white">Finding the table…</div>
        </Center>
      )}
      {status === "not_found" && (
        <Center>
          <div className="glass max-w-sm p-6 text-center">
            <div className="font-display text-xl font-bold">Room not found</div>
            <p className="mt-2 text-sm text-white/80">The code {code} doesn&apos;t match an open table. It may have expired.</p>
            <Link href="/" className="btn btn-primary mt-4">
              Create a new room
            </Link>
          </div>
        </Center>
      )}
      {status === "error" && (
        <Center>
          <div className="glass p-6 text-center font-semibold">{error}</div>
        </Center>
      )}
      {status === "need_join" && <JoinCard code={code} />}
    </main>
  );
}
