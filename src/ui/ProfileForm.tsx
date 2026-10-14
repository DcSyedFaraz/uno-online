"use client";

import { AVATARS } from "@/client/profile";
import type { Profile } from "@/client/api";

export function ProfileForm({ value, onChange, autoFocus }: { value: Profile; onChange: (p: Profile) => void; autoFocus?: boolean }) {
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
        <div className="grid grid-cols-8 gap-1.5">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onChange({ ...value, avatar: a })}
              className={`grid aspect-square place-items-center rounded-xl text-xl transition-all ${
                value.avatar === a ? "scale-105 bg-white ring-[3px] ring-gold shadow-[0_3px_0_rgba(10,30,90,0.35)]" : "bg-white/20 hover:bg-white/35"
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
