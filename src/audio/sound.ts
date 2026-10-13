"use client";

import { loadPref, savePref } from "@/client/profile";

/**
 * All sounds are synthesized with the Web Audio API (no audio files to download or license).
 * The audio context starts on the first user gesture, as browsers require.
 */

export type Sfx =
  | "play"
  | "action"
  | "draw"
  | "deal"
  | "shuffle"
  | "wild"
  | "skip"
  | "reverse"
  | "stack"
  | "shout"
  | "caught"
  | "turn"
  | "win"
  | "lose"
  | "click"
  | "error"
  | "swap"
  | "chat"
  | "out";

let ctx: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let musicBus: GainNode;
let noise: AudioBuffer;

const prefs = {
  muted: false,
  sfx: 0.8,
  music: false,
};

function loadPrefs() {
  prefs.muted = loadPref("muted", false);
  prefs.sfx = loadPref("sfxVolume", 0.8);
  prefs.music = loadPref("music", false);
}
if (typeof window !== "undefined") loadPrefs();

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master = ctx.createGain();
  master.gain.value = prefs.muted ? 0 : 1;
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = prefs.sfx;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0;
  musicBus.connect(master);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

/** Call from a click/tap handler so audio is allowed to start. */
export function unlockAudio() {
  const c = ensure();
  if (c && c.state === "suspended") void c.resume();
  if (prefs.music) startMusic();
  preloadVoices();
}

// ── building blocks ──

function env(g: GainNode, t: number, a: number, peak: number, dec: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}

function tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, out: AudioNode = sfxBus, detune = 0) {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = c.createGain();
  env(g, t, 0.006, peak, dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function hiss(t: number, dur: number, peak: number, type: BiquadFilterType, f0: number, f1 = f0, q = 1.2, out: AudioNode = sfxBus) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  env(g, t, 0.004, peak, dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

const N = (semi: number) => 440 * Math.pow(2, (semi - 9) / 12); // semitones from C4-ish

export function playSfx(name: Sfx, delayMs = 0) {
  if (prefs.muted) return;
  const c = ensure();
  if (!c || c.state !== "running") return;
  const t = c.currentTime + delayMs / 1000 + 0.005;
  switch (name) {
    case "play":
      hiss(t, 0.08, 0.5, "bandpass", 2600, 1800, 0.9);
      tone("sine", 150, 55, t, 0.12, 0.45);
      break;
    case "action":
      hiss(t, 0.08, 0.45, "bandpass", 2600, 1800, 0.9);
      tone("sine", 150, 55, t, 0.12, 0.4);
      tone("square", 880, 1320, t + 0.03, 0.09, 0.08);
      break;
    case "draw":
      hiss(t, 0.11, 0.3, "bandpass", 1400, 3600, 1.4);
      break;
    case "deal":
      hiss(t, 0.035, 0.22, "highpass", 3200, 3200, 0.7);
      break;
    case "shuffle":
      for (let i = 0; i < 12; i++) hiss(t + i * 0.042 + Math.random() * 0.01, 0.035, 0.18, "bandpass", 2800 + Math.random() * 1500, 2800, 1);
      break;
    case "wild":
      [0, 4, 7, 12].forEach((s, i) => tone("triangle", N(s + 12), N(s + 12), t + i * 0.06, 0.22, 0.16));
      break;
    case "skip":
      tone("sawtooth", 620, 180, t, 0.18, 0.09);
      break;
    case "reverse":
      hiss(t, 0.18, 0.28, "bandpass", 500, 3000, 2);
      hiss(t + 0.16, 0.18, 0.22, "bandpass", 3000, 600, 2);
      break;
    case "stack":
      tone("sine", 90, 70, t, 0.22, 0.55);
      tone("square", 440, 440, t, 0.1, 0.07);
      tone("square", 660, 660, t + 0.12, 0.12, 0.07);
      break;
    case "shout":
      [0, 4, 7].forEach((s) => {
        tone("sawtooth", N(s + 12), N(s + 12), t, 0.45, 0.07, sfxBus, -8);
        tone("sawtooth", N(s + 12), N(s + 12), t, 0.45, 0.07, sfxBus, 8);
      });
      tone("sine", N(24), N(24), t + 0.05, 0.4, 0.12);
      break;
    case "caught":
      tone("square", 130, 110, t, 0.28, 0.14);
      tone("square", 98, 90, t + 0.02, 0.28, 0.1);
      break;
    case "turn":
      tone("sine", 1046, 1046, t, 0.5, 0.14);
      tone("sine", 1568, 1568, t + 0.07, 0.45, 0.08);
      break;
    case "win":
      [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone("triangle", N(s), N(s), t + i * 0.07, 0.35, 0.16));
      [0, 4, 7].forEach((s) => tone("sawtooth", N(s + 12), N(s + 12), t + 0.5, 0.9, 0.05));
      break;
    case "lose":
      [7, 3, 0, -5].forEach((s, i) => tone("triangle", N(s), N(s), t + i * 0.12, 0.35, 0.14));
      break;
    case "click":
      tone("sine", 1200, 900, t, 0.04, 0.08);
      break;
    case "error":
      tone("square", 220, 220, t, 0.07, 0.07);
      tone("square", 180, 180, t + 0.09, 0.09, 0.07);
      break;
    case "swap":
      hiss(t, 0.3, 0.3, "bandpass", 400, 4000, 1.5);
      tone("sine", 300, 900, t, 0.3, 0.08);
      break;
    case "chat":
      tone("sine", 880, 1320, t, 0.07, 0.08);
      break;
    case "out":
      tone("sawtooth", 400, 60, t, 0.6, 0.1);
      hiss(t, 0.5, 0.2, "lowpass", 2000, 200);
      break;
  }
}

// ── voice lines ──
// Optional recorded clips in /public/sfx (e.g. generated with `npm run voices` via ElevenLabs).
// Without them, a pitched-up browser voice plus a synth hit is used instead.

export type VoiceLine = "uno" | "caught";
const VOICE_TEXT: Record<VoiceLine, string> = { uno: "Uno!", caught: "Gotcha!" };
const clips: Partial<Record<VoiceLine, AudioBuffer | null>> = {};

async function loadClip(name: VoiceLine) {
  if (name in clips || !ensure()) return;
  clips[name] = null;
  try {
    const res = await fetch(`/sfx/${name}.mp3`, { cache: "force-cache" });
    if (!res.ok) return;
    clips[name] = await ctx!.decodeAudioData(await res.arrayBuffer());
  } catch {
    clips[name] = null;
  }
}

export function preloadVoices() {
  void loadClip("uno");
  void loadClip("caught");
}

export function playVoice(name: VoiceLine) {
  if (prefs.muted) return;
  const c = ensure();
  if (!c) return;
  const buf = clips[name];
  if (buf) {
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = 1.15;
    src.connect(g).connect(sfxBus);
    src.start();
    return;
  }
  if (!(name in clips)) void loadClip(name);
  speak(VOICE_TEXT[name], name === "uno");
}

/** Browser text-to-speech fallback, pushed higher and faster so it sounds like a shout. */
export function speak(text: string, shout = true) {
  if (prefs.muted || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const lively = voices.find((v) => /en/i.test(v.lang) && /(female|zira|samantha|aria|jenny|google us)/i.test(v.name)) ?? voices.find((v) => /en/i.test(v.lang));
    if (lively) u.voice = lively;
    u.rate = shout ? 1.35 : 1.15;
    u.pitch = shout ? 1.7 : 1.3;
    u.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    // speech isn't available everywhere; the banner and sound still play
  }
}

// ── generative synthwave loop ──

let musicTimer: ReturnType<typeof setInterval> | null = null;
let nextBeat = 0;
let step = 0;
const BPM = 94;
const PROG = [
  [9, 12, 16], // Am
  [5, 9, 12], // F
  [0, 4, 7], // C
  [7, 11, 14], // G
];

function scheduleStep(t: number) {
  const c = ctx!;
  const sixteenth = 60 / BPM / 4;
  const bar = Math.floor(step / 16) % PROG.length;
  const chord = PROG[bar];
  const s = step % 16;
  // kick on beats, hat on off-beats
  if (s % 4 === 0) tone("sine", 120, 40, t, 0.22, 0.5, musicBus);
  if (s % 4 === 2) hiss(t, 0.04, 0.12, "highpass", 7000, 7000, 0.7, musicBus);
  // bass
  if (s % 2 === 0) tone("triangle", N(chord[0] - 24), N(chord[0] - 24), t, sixteenth * 1.8, 0.22, musicBus);
  // arp
  const note = chord[(step >> 0) % 3] + (s % 8 >= 4 ? 12 : 0);
  tone("square", N(note + 12), N(note + 12), t, sixteenth * 0.9, 0.025, musicBus);
  // pad at bar start
  if (s === 0) {
    for (const n of chord) {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = N(n);
      o.detune.value = Math.random() * 14 - 7;
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 900;
      const g = c.createGain();
      const len = sixteenth * 16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.03, t + 0.6);
      g.gain.linearRampToValueAtTime(0.0001, t + len);
      o.connect(f).connect(g).connect(musicBus);
      o.start(t);
      o.stop(t + len + 0.1);
    }
  }
}

function startMusic() {
  const c = ensure();
  if (!c || musicTimer) return;
  musicBus.gain.cancelScheduledValues(c.currentTime);
  musicBus.gain.setTargetAtTime(0.55, c.currentTime, 0.8);
  nextBeat = c.currentTime + 0.1;
  musicTimer = setInterval(() => {
    if (!ctx) return;
    const sixteenth = 60 / BPM / 4;
    while (nextBeat < ctx.currentTime + 0.35) {
      scheduleStep(nextBeat);
      nextBeat += sixteenth;
      step++;
    }
  }, 90);
}

function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  if (ctx) musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
}

export const audioPrefs = {
  get: () => ({ ...prefs }),
  setMuted(m: boolean) {
    prefs.muted = m;
    savePref("muted", m);
    if (ctx) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05);
  },
  setSfxVolume(v: number) {
    prefs.sfx = v;
    savePref("sfxVolume", v);
    if (ctx) sfxBus.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  },
  setMusic(on: boolean) {
    prefs.music = on;
    savePref("music", on);
    if (on) {
      unlockAudio();
      startMusic();
    } else stopMusic();
  },
};
