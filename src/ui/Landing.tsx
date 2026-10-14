"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { BRAND } from "@/brand";
import { api, ApiError, type Profile } from "@/client/api";
import { AVATARS, loadProfile, randomName, saveProfile } from "@/client/profile";
import { unlockAudio } from "@/audio/sound";
import { ProfileForm } from "./ProfileForm";

const HeroCanvas = dynamic(() => import("@/scene/HeroCanvas"), { ssr: false });

export function useStoredProfile() {
  const [profile, setProfile] = useState<Profile>({ name: "", avatar: AVATARS[0] });
  useEffect(() => {
    // the profile lives in localStorage, which is only readable after mount
    const stored = loadProfile() ?? { name: randomName(), avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)] };
    queueMicrotask(() => setProfile(stored));
  }, []);
  return [profile, setProfile] as const;
}

export function Landing() {
  const router = useRouter();
  const [profile, setProfile] = useStoredProfile();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const valid = profile.name.trim().length > 0;
  const create = async () => {
    unlockAudio();
    setBusy("create");
    setError(null);
    try {
      saveProfile(profile);
      const { code } = await api.createRoom(profile);
      router.push(`/r/${code}${window.location.search}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't create a room");
      setBusy(null);
    }
  };
  const join = (e: React.FormEvent) => {
    e.preventDefault();
    unlockAudio();
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (c.length !== 6) {
      setError("Room codes have 6 characters");
      return;
    }
    saveProfile(profile);
    setBusy("join");
    router.push(`/r/${c}${window.location.search}`);
  };

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <HeroCanvas />
      <div className="stage-vignette pointer-events-none fixed inset-0" />
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-5xl flex-col items-center justify-center gap-8 px-4 py-12 lg:flex-row lg:justify-between">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="max-w-md text-center lg:text-left">
          <h1 className="font-display toon-text text-6xl font-black tracking-tight text-[#ffd84a] sm:text-7xl">{BRAND.name}</h1>
          <p className="mt-4 text-lg font-semibold text-white [text-shadow:0_2px_0_rgba(60,0,10,0.45)]">{BRAND.tagline}</p>
          <ul className="mt-6 hidden space-y-2 text-sm font-medium text-white/90 [text-shadow:0_1px_0_rgba(60,0,10,0.45)] lg:block">
            <li>⚡ Stacking, Discard All and 3-minute rounds out of the box — change any rule in the lobby, or go back to pure classic</li>
            <li>🔗 Share a link, friends join as guests — no sign-up</li>
            <li>🤖 Fill empty seats with bots</li>
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="glass w-full max-w-sm p-5"
        >
          <ProfileForm value={profile} onChange={setProfile} />
          <button className="btn btn-primary font-display mt-5 w-full py-3.5 text-base tracking-wide" disabled={!valid || !!busy} onClick={create}>
            {busy === "create" ? "Creating…" : "Create a room"}
          </button>
          <div className="my-4 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
            <div className="h-0.5 flex-1 rounded bg-white/30" />
            or join
            <div className="h-0.5 flex-1 rounded bg-white/30" />
          </div>
          <form onSubmit={join} className="flex gap-2">
            <input
              className="input font-display text-center text-lg uppercase tracking-[0.3em]"
              placeholder="CODE"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              aria-label="Room code"
            />
            <button className="btn btn-ghost px-5" disabled={!valid || !!busy} type="submit">
              Join
            </button>
          </form>
          {error && <div className="mt-3 rounded-lg bg-white px-3 py-2 text-center text-sm font-semibold text-neon-red">{error}</div>}
        </motion.div>
      </div>
    </main>
  );
}
