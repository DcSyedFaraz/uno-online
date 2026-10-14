"use client";

import { useSyncExternalStore } from "react";

/** Phones and tablets (a finger, not a mouse). Decided once at load. */
export const IS_TOUCH = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

const ROTATE_QUERY = "(pointer: coarse) and (orientation: portrait)";

function subscribeRotate(cb: () => void) {
  const mq = window.matchMedia?.(ROTATE_QUERY);
  mq?.addEventListener("change", cb);
  return () => mq?.removeEventListener("change", cb);
}

/** True on a phone or tablet held upright: rooms are played in landscape only. */
export function useNeedsRotate(): boolean {
  return useSyncExternalStore(
    subscribeRotate,
    () => !!window.matchMedia?.(ROTATE_QUERY).matches,
    () => false,
  );
}

type LockableOrientation = ScreenOrientation & { lock?: (o: "landscape") => Promise<void> };

/** Android Chrome can go fullscreen and lock landscape; iPhones can't (no fullscreen for pages). */
export function canLockLandscape(): boolean {
  if (typeof document === "undefined" || !IS_TOUCH) return false;
  const orientation = screen.orientation as LockableOrientation | undefined;
  return !!document.fullscreenEnabled && typeof orientation?.lock === "function";
}

const noSubscribe = () => () => {};

/** Hydration-safe `canLockLandscape()` for rendering a fullscreen button. */
export function useCanLockLandscape(): boolean {
  return useSyncExternalStore(noSubscribe, canLockLandscape, () => false);
}

function subscribeFullscreen(cb: () => void) {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
}

export function useIsFullscreen(): boolean {
  return useSyncExternalStore(
    subscribeFullscreen,
    () => !!document.fullscreenElement,
    () => false,
  );
}

/** Must run inside a tap. Locking only works once the page is fullscreen. */
export async function enterLandscapeFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    await (screen.orientation as LockableOrientation).lock?.("landscape");
  } catch {
    // not allowed here; the rotate prompt still explains what to do
  }
}

export async function exitFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {}
}
