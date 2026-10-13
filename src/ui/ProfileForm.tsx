"use client";

import { AVATARS } from "@/client/profile";
import type { Profile } from "@/client/api";

export function ProfileForm({ value, onChange, autoFocus }: { value: Profile; onChange: (p: Profile) => void; autoFocus?: boolean }) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Your name</span>
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
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Avatar</span>
        <div className="grid grid-cols-8 gap-1.5">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onChange({ ...value, avatar: a })}
              className={`grid aspect-square place-items-center rounded-xl text-xl transition-all ${
                value.avatar === a ? "scale-105 bg-white/15 ring-2 ring-accent shadow-[0_0_18px_rgba(124,92,255,0.6)]" : "bg-white/5 hover:bg-white/10"
              }`}
              aria-label={`Avatar ${a}`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
