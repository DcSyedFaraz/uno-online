"use client";

/** Offset between the server clock and this browser, from the `now` field on every message. */
let offset = 0;
let samples = 0;

export function syncClock(serverNow: number) {
  const sample = serverNow - Date.now();
  // smooth it a little; messages arrive with some latency
  offset = samples === 0 ? sample : offset * 0.7 + sample * 0.3;
  samples++;
}

export function serverNow(): number {
  return Date.now() + offset;
}
