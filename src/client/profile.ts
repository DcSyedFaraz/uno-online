"use client";

import type { Profile } from "./api";

const KEY = "neono_profile";

export const AVATARS = ["😎", "🦊", "🐼", "🐸", "🦄", "🐯", "👻", "🤠", "🧛", "🐙", "🦖", "🐵", "🐧", "🦉", "🐲", "🍕"];

const ADJ = ["Neon", "Lucky", "Cosmic", "Turbo", "Sneaky", "Wild", "Swift", "Mystic", "Hyper", "Chill"];
const NOUN = ["Fox", "Comet", "Panda", "Wizard", "Rocket", "Tiger", "Ghost", "Ninja", "Otter", "Falcon"];

export function randomName(): string {
  const r = (n: number) => Math.floor(Math.random() * n);
  return `${ADJ[r(ADJ.length)]} ${NOUN[r(NOUN.length)]}`;
}

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Profile;
    return typeof p.name === "string" && typeof p.avatar === "string" ? p : null;
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // private mode etc. — the profile just isn't remembered
  }
}

export function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`neono_${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown) {
  try {
    localStorage.setItem(`neono_${key}`, JSON.stringify(value));
  } catch {}
}
