"use client";

import { useEffect, useState } from "react";
import { avatarUri, type Mood } from "@/client/avatars";
import { useScene } from "@/scene/sceneStore";

/** Blinks every few seconds, at a random rhythm per face. */
function useBlink(on: boolean) {
  const [shut, setShut] = useState(false);
  useEffect(() => {
    if (!on) return;
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      t = setTimeout(() => {
        setShut(true);
        t = setTimeout(() => {
          setShut(false);
          next();
        }, 140);
      }, 2200 + Math.random() * 3500);
    };
    next();
    return () => clearTimeout(t);
  }, [on]);
  return on && shut;
}

/**
 * A player's avatar as a round DOM image. `pid` makes it react (it shows that player's current
 * mood from the director), `mood` forces one, `alive` adds blinking. Legacy emoji avatars still
 * render, as text on a white disc.
 */
export function Face({ avatar, size, pid, mood, alive = false, className = "" }: { avatar: string; size: number; pid?: string; mood?: Mood; alive?: boolean; className?: string }) {
  const live = useScene((s) => (pid ? s.moods[pid] : undefined));
  const blink = useBlink(alive && !mood && !live);
  const now: Mood = mood ?? live ?? (blink ? "blink" : "idle");
  const base = avatarUri(avatar, "idle");
  const box = { width: size, height: size };
  if (!base) {
    return (
      <span className={`inline-grid shrink-0 place-items-center rounded-full bg-white leading-none ${className}`} style={{ ...box, fontSize: size * 0.58 }}>
        {avatar}
      </span>
    );
  }
  return (
    <span className={`relative inline-block shrink-0 overflow-hidden rounded-full ${className}`} style={box}>
      {/* the resting face stays underneath, so swapping expressions never flashes empty */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={base} alt="" draggable={false} className="absolute inset-0 h-full w-full" />
      {now !== "idle" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUri(avatar, now)!} alt="" draggable={false} className="absolute inset-0 h-full w-full" />
      )}
    </span>
  );
}
