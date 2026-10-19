"use client";

import type { Profile } from "./api";
import { isCharacter, randomAvatarId } from "./avatars";

const KEY = "neono_profile";

/** Hand-picked characters the avatar picker starts with (🎲 deals new ones). */
export const STARTER_AVATARS = ["neono1", "neono4", "neono6", "neono10", "neono17", "neono19", "neono23", "neono24", "neono33", "neono36", "neono38"].map((s) => `h:${s}`);

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
    if (typeof p.name !== "string" || typeof p.avatar !== "string") return null;
    // emoji avatars were retired: give old profiles a character
    return isCharacter(p.avatar) ? p : { ...p, avatar: randomAvatarId() };
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
