import { createAvatar } from "@dicebear/core";
import * as avataaars from "@dicebear/avataaars";
import * as bottts from "@dicebear/bottts";

/**
 * Player avatars: illustrated characters (Avataaars by Pablo Stanley) for people and robots
 * (Bottts) for bots, both drawn with DiceBear from a seed, so an avatar is just a short id:
 * `h:<seed>` or `b:<seed>`. Anything else is a legacy emoji avatar and is drawn as text.
 *
 * A mood swaps the face (eyes, brows, mouth) without changing who it is, so avatars can blink
 * and react to the game.
 */

export type Mood = "idle" | "blink" | "happy" | "sad" | "shock" | "angry" | "love" | "wink" | "dizzy" | "annoyed" | "sleepy";

const HUMAN_FACES: Record<Mood, { eyes: string; eyebrows: string; mouth: string }> = {
  idle: { eyes: "default", eyebrows: "defaultNatural", mouth: "twinkle" },
  blink: { eyes: "closed", eyebrows: "defaultNatural", mouth: "twinkle" },
  happy: { eyes: "happy", eyebrows: "raisedExcitedNatural", mouth: "smile" },
  sad: { eyes: "cry", eyebrows: "sadConcernedNatural", mouth: "sad" },
  shock: { eyes: "surprised", eyebrows: "raisedExcited", mouth: "screamOpen" },
  angry: { eyes: "squint", eyebrows: "angryNatural", mouth: "grimace" },
  love: { eyes: "hearts", eyebrows: "raisedExcitedNatural", mouth: "smile" },
  wink: { eyes: "wink", eyebrows: "raisedExcitedNatural", mouth: "tongue" },
  dizzy: { eyes: "xDizzy", eyebrows: "upDownNatural", mouth: "disbelief" },
  annoyed: { eyes: "eyeRoll", eyebrows: "flatNatural", mouth: "concerned" },
  sleepy: { eyes: "closed", eyebrows: "flatNatural", mouth: "default" },
};

/** Resting robot faces (the seed picks one), kept clear of the ones that mean a mood. */
const BOT_IDLE = { eyes: ["eva", "frame1", "frame2", "round", "roundFrame01", "roundFrame02", "sensor"], mouth: ["smile01", "smile02", "square01", "grill03"] };

/** Robots only have eyes and a mouth to work with; idle keeps the seed's own. */
const BOT_FACES: Partial<Record<Mood, { eyes: string; mouth?: string }>> = {
  blink: { eyes: "shade01" },
  happy: { eyes: "happy", mouth: "smile01" },
  sad: { eyes: "dizzy", mouth: "grill02" },
  shock: { eyes: "bulging", mouth: "square02" },
  angry: { eyes: "glow", mouth: "bite" },
  love: { eyes: "hearts", mouth: "smile02" },
  wink: { eyes: "happy", mouth: "smile01" },
  dizzy: { eyes: "dizzy", mouth: "diagram" },
  annoyed: { eyes: "robocop", mouth: "grill01" },
  sleepy: { eyes: "shade01", mouth: "square01" },
};

/** Bright gradient backdrops so every face pops off the table. */
const BACKDROPS = ["ffd84a", "6fe07d", "5aa8ff", "ff8a65", "c49bff", "4dd0e1", "ff6fa8", "ffb74d", "8fdc3b", "ff5a52"];

export function isCharacter(avatar: string | undefined | null): boolean {
  return !!avatar && (avatar.startsWith("h:") || avatar.startsWith("b:"));
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** A fresh random character id for a person. */
export function randomAvatarId(): string {
  return `h:${randomSeed()}`;
}

const svgs = new Map<string, string>();

/** The avatar as an SVG string, or null for a legacy emoji avatar. */
export function avatarSvg(avatar: string, mood: Mood = "idle"): string | null {
  if (!isCharacter(avatar)) return null;
  const key = `${avatar}|${mood}`;
  let svg = svgs.get(key);
  if (svg) return svg;
  const seed = avatar.slice(2);
  const common = { seed, size: 128, backgroundColor: BACKDROPS, backgroundType: ["gradientLinear" as const], backgroundRotation: [0, 360] };
  if (avatar.startsWith("b:")) {
    const f = BOT_FACES[mood];
    svg = createAvatar(bottts, {
      ...common,
      scale: 92,
      eyes: (f ? [f.eyes] : BOT_IDLE.eyes) as never[],
      mouth: (f?.mouth ? [f.mouth] : BOT_IDLE.mouth) as never[],
    }).toString();
  } else {
    const f = HUMAN_FACES[mood];
    svg = createAvatar(avataaars, {
      ...common,
      // a little closer than the default framing, so the face fills a small circle
      scale: 112,
      translateY: 6,
      style: ["default"],
      eyes: [f.eyes as never],
      eyebrows: [f.eyebrows as never],
      mouth: [f.mouth as never],
      clothingGraphic: ["bear", "deer", "diamond", "pizza", "bat", "hola"],
      accessoriesProbability: 18,
      facialHairProbability: 15,
    }).toString();
  }
  svgs.set(key, svg);
  return svg;
}

const uris = new Map<string, string>();

/** For <img src>: a data URI of the avatar in a mood (null for legacy emoji). */
export function avatarUri(avatar: string, mood: Mood = "idle"): string | null {
  const key = `${avatar}|${mood}`;
  let uri = uris.get(key);
  if (uri) return uri;
  const svg = avatarSvg(avatar, mood);
  if (!svg) return null;
  uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  uris.set(key, uri);
  return uri;
}

const rasters = new Map<string, HTMLCanvasElement | null>();
const waiting = new Map<string, (() => void)[]>();

/**
 * For canvas painting: the avatar rasterised once at `px` pixels, or null while it loads
 * (`onReady` then fires once). Drawing an SVG image every repaint is slow, a bitmap isn't.
 */
export function avatarBitmap(avatar: string, mood: Mood, px: number, onReady?: () => void): HTMLCanvasElement | null {
  const key = `${avatar}|${mood}|${px}`;
  const done = rasters.get(key);
  if (done) return done;
  if (onReady) waiting.set(key, [...(waiting.get(key) ?? []), onReady]);
  if (rasters.has(key)) return null; // already loading
  const uri = avatarUri(avatar, mood);
  if (!uri) return null;
  rasters.set(key, null);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = c.height = px;
    c.getContext("2d")!.drawImage(img, 0, 0, px, px);
    rasters.set(key, c);
    for (const f of waiting.get(key) ?? []) f();
    waiting.delete(key);
  };
  img.onerror = () => {
    rasters.delete(key);
    waiting.delete(key);
  };
  img.src = uri;
  return null;
}

/** A random pick of fresh characters for the profile picker. */
export function avatarChoices(n: number, keep?: string): string[] {
  const out = keep && isCharacter(keep) && keep.startsWith("h:") ? [keep] : [];
  while (out.length < n) out.push(randomAvatarId());
  return out;
}

export const AVATAR_CREDIT = "Avatars: Avataaars & Bottts by Pablo Stanley, via DiceBear";
