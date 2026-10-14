"use client";

import { BRAND } from "@/brand";
import { canLockLandscape, enterLandscapeFullscreen } from "@/client/device";

/** Shown on a phone or tablet held upright: tables are played in landscape. */
export function RotateGate() {
  const canLock = canLockLandscape();
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-bg p-8 text-center">
      <div className="stage-vignette pointer-events-none absolute inset-0" />
      <div className="turn-sideways relative grid h-28 w-16 place-items-center rounded-[14px] border-4 border-white bg-[#1d5fd6] shadow-[0_6px_0_#133f99]">
        <div className="absolute top-1.5 h-1 w-5 rounded-full bg-white/60" />
        <span className="text-3xl">🃏</span>
      </div>
      <div className="relative">
        <div className="font-display toon-text text-3xl font-black text-[#ffd84a]">Turn your phone sideways</div>
        <p className="mt-2 text-sm font-semibold text-white/85">{BRAND.name} is played in landscape.</p>
      </div>
      {canLock && (
        <button className="btn btn-primary font-display relative px-6 py-3.5" onClick={() => void enterLandscapeFullscreen()}>
          Play fullscreen
        </button>
      )}
    </div>
  );
}
