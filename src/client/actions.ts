"use client";

import type { Action, Color } from "@/engine";
import { api, ApiError } from "./api";
import { randomAvatarId } from "./avatars";
import { loadProfile } from "./profile";
import { useGame } from "./store/game-store";

export async function sendAction(action: Action): Promise<boolean> {
  const { code, receive, toast } = useGame.getState();
  if (!code) return false;
  try {
    receive(await api.act(code, action));
    return true;
  } catch (e) {
    toast(e instanceof ApiError ? e.message : "Connection problem — try again", "error");
    return false;
  }
}

/** A spectator takes a free seat (between rounds), or a returning player takes theirs back. */
export async function takeSeat(): Promise<boolean> {
  const { code, you, pub, receive, toast } = useGame.getState();
  if (!code) return false;
  const w = pub?.spectators.find((s) => s.id === you);
  const profile = loadProfile() ?? { name: w?.name ?? "Guest", avatar: w?.avatar ?? randomAvatarId() };
  try {
    receive(await api.join(code, profile));
    return true;
  } catch (e) {
    toast(e instanceof ApiError ? e.message : "Connection problem — try again", "error");
    return false;
  }
}

/**
 * Plays (or jumps in with) a card from the hand. Opens the color / swap picker
 * first when the card needs it, and animates optimistically.
 */
export async function playCard(cardId: string, opts: { color?: Color; swapTargetId?: string } = {}) {
  const s = useGame.getState();
  const priv = s.priv;
  if (!priv || s.pendingPlayId) return;
  const isJump = priv.jumpIn.includes(cardId) && !priv.playable.includes(cardId);
  if (!isJump && !priv.playable.includes(cardId)) {
    s.reject(cardId);
    return;
  }
  const type = isJump ? "jump_in" : "play";
  if (priv.needsColor.includes(cardId) && !opts.color) {
    s.setPicker({ kind: "color", cardId, action: type });
    return;
  }
  if (priv.needsSwapTarget.includes(cardId) && !opts.swapTargetId) {
    s.setPicker({ kind: "swap", cardId, action: type, color: opts.color });
    return;
  }
  s.setPicker(null);
  s.select(null);
  s.setPending(cardId, opts.color ?? null);
  const ok = await sendAction({ type, cardId, ...opts });
  if (!ok) useGame.getState().reject(cardId);
}
