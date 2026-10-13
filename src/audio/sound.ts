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

/**
 * One audio engine per page, kept on globalThis so a hot-reloaded copy of this module
 * reuses it instead of starting a second music loop it can't stop.
 */
interface Engine {
  ctx: AudioContext | null;
  master: GainNode;
  sfxBus: GainNode;
  musicBus: GainNode;
  noise: AudioBuffer;
  musicTimer: ReturnType<typeof setInterval> | null;
  nextBeat: number;
  step: number;
  clips: Partial<Record<VoiceLine, AudioBuffer | null>>;
  prefs: { muted: boolean; sfx: number; music: boolean };
}
const E: Engine = ((globalThis as unknown as { __neonoAudio?: Engine }).__neonoAudio ??= {
  ctx: null,
  musicTimer: null,
  nextBeat: 0,
  step: 0,
  clips: {},
  prefs: { muted: false, sfx: 0.8, music: false },
} as unknown as Engine);
const prefs = E.prefs;

function loadPrefs() {
  prefs.muted = loadPref("muted", false);
  prefs.sfx = loadPref("sfxVolume", 0.8);
  prefs.music = loadPref("music", false);
}
if (typeof window !== "undefined") loadPrefs();

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (E.ctx) return E.ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  E.ctx = new AC();
  const comp = E.ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  E.master = E.ctx.createGain();
  E.master.gain.value = prefs.muted ? 0 : 1;
  E.master.connect(comp).connect(E.ctx.destination);
  E.sfxBus = E.ctx.createGain();
  E.sfxBus.gain.value = prefs.sfx;
  E.sfxBus.connect(E.master);
  E.musicBus = E.ctx.createGain();
  E.musicBus.gain.value = 0;
  E.musicBus.connect(E.master);
  E.noise = E.ctx.createBuffer(1, E.ctx.sampleRate, E.ctx.sampleRate);
  const d = E.noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return E.ctx;
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

function tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, out: AudioNode = E.sfxBus, detune = 0) {
  const c = E.ctx!;
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

function hiss(t: number, dur: number, peak: number, type: BiquadFilterType, f0: number, f1 = f0, q = 1.2, out: AudioNode = E.sfxBus) {
  const c = E.ctx!;
  const src = c.createBufferSource();
  src.buffer = E.noise;
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
        tone("sawtooth", N(s + 12), N(s + 12), t, 0.45, 0.07, E.sfxBus, -8);
        tone("sawtooth", N(s + 12), N(s + 12), t, 0.45, 0.07, E.sfxBus, 8);
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
const clips = E.clips;

async function loadClip(name: VoiceLine) {
  if (name in clips || !ensure()) return;
  clips[name] = null;
  try {
    const res = await fetch(`/sfx/${name}.mp3`, { cache: "force-cache" });
    if (!res.ok) return;
    clips[name] = await E.ctx!.decodeAudioData(await res.arrayBuffer());
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
    src.connect(g).connect(E.sfxBus);
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

const BPM = 94;
const PROG = [
  [9, 12, 16], // Am
  [5, 9, 12], // F
  [0, 4, 7], // C
  [7, 11, 14], // G
];

function scheduleStep(t: number) {
  const c = E.ctx!;
  const sixteenth = 60 / BPM / 4;
  const bar = Math.floor(E.step / 16) % PROG.length;
  const chord = PROG[bar];
  const s = E.step % 16;
  // kick on beats, hat on off-beats
  if (s % 4 === 0) tone("sine", 120, 40, t, 0.22, 0.5, E.musicBus);
  if (s % 4 === 2) hiss(t, 0.04, 0.12, "highpass", 7000, 7000, 0.7, E.musicBus);
  // bass
  if (s % 2 === 0) tone("triangle", N(chord[0] - 24), N(chord[0] - 24), t, sixteenth * 1.8, 0.22, E.musicBus);
  // arp
  const note = chord[(E.step >> 0) % 3] + (s % 8 >= 4 ? 12 : 0);
  tone("square", N(note + 12), N(note + 12), t, sixteenth * 0.9, 0.025, E.musicBus);
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
      o.connect(f).connect(g).connect(E.musicBus);
      o.start(t);
      o.stop(t + len + 0.1);
    }
  }
}

function startMusic() {
  const c = ensure();
  if (!c || E.musicTimer) return;
  E.musicBus.gain.cancelScheduledValues(c.currentTime);
  E.musicBus.gain.setTargetAtTime(0.55, c.currentTime, 0.8);
  E.nextBeat = c.currentTime + 0.1;
  E.musicTimer = setInterval(() => {
    if (!E.ctx) return;
    const sixteenth = 60 / BPM / 4;
    while (E.nextBeat < E.ctx.currentTime + 0.35) {
      scheduleStep(E.nextBeat);
      E.nextBeat += sixteenth;
      E.step++;
    }
  }, 90);
}

function stopMusic() {
  if (E.musicTimer) clearInterval(E.musicTimer);
  E.musicTimer = null;
  const c = E.ctx;
  if (!c) return;
  const old = E.musicBus;
  old.gain.cancelScheduledValues(c.currentTime);
  old.gain.setTargetAtTime(0, c.currentTime, 0.06);
  // notes already scheduled on the old bus die with it
  setTimeout(() => old.disconnect(), 400);
  E.musicBus = c.createGain();
  E.musicBus.gain.value = 0;
  E.musicBus.connect(E.master);
}

export const audioPrefs = {
  get: () => ({ ...prefs }),
  setMuted(m: boolean) {
    prefs.muted = m;
    savePref("muted", m);
    if (E.ctx) E.master.gain.setTargetAtTime(m ? 0 : 1, E.ctx.currentTime, 0.05);
  },
  setSfxVolume(v: number) {
    prefs.sfx = v;
    savePref("sfxVolume", v);
    if (E.ctx) E.sfxBus.gain.setTargetAtTime(v, E.ctx.currentTime, 0.05);
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
