"use client";

import { useState } from "react";
import { avatarChoices, isCharacter } from "@/client/avatars";
import { STARTER_AVATARS } from "@/client/profile";
import type { Profile } from "@/client/api";
import { Face } from "./Face";

export function ProfileForm({ value, onChange, autoFocus }: { value: Profile; onChange: (p: Profile) => void; autoFocus?: boolean }) {
  // starts on a fixed set (same on server and client), 🎲 deals fresh characters; yours always shows
  const [pool, setPool] = useState(STARTER_AVATARS);
  const shown = pool.includes(value.avatar) || !isCharacter(value.avatar) ? pool : [value.avatar, ...pool.slice(0, pool.length - 1)];
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-white/75">Your name</span>
        <input
          className="input text-base"
          value={value.name}
          maxLength={20}
          autoFocus={autoFocus}
          placeholder="Guest name"
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </label>
      <div>
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-white/75">Avatar</span>
        <div className="grid grid-cols-6 gap-1.5">
          {shown.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onChange({ ...value, avatar: a })}
              className={`grid aspect-square place-items-center rounded-full p-0.5 transition-all ${
                value.avatar === a ? "scale-110 bg-gold shadow-[0_3px_0_rgba(10,30,90,0.35)]" : "bg-white/25 hover:scale-105 hover:bg-white/45"
              }`}
              aria-label="Pick this avatar"
              aria-pressed={value.avatar === a}
            >
              <Face avatar={a} size={44} mood={value.avatar === a ? "happy" : undefined} className="!h-full !w-full" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPool(avatarChoices(11))}
            className="grid aspect-square place-items-center rounded-full bg-white/25 text-xl transition-all hover:scale-105 hover:bg-white/45 active:rotate-12"
            aria-label="Show other avatars"
            title="Show other avatars"
          >
            🎲
          </button>
        </div>
      </div>
    </div>
  );
}
