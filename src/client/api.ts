"use client";

import type { Action } from "@/engine";
import type { ChatKind, GameMessage, RoomSnapshot } from "@/shared/protocol";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const DEV_KEY = "neono_dev_user";

/** Dev-only: `?devUser=name` makes this tab a separate player (kept for the tab's lifetime). */
export function devUser(): string | null {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return null;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("devUser");
    if (fromUrl) sessionStorage.setItem(DEV_KEY, fromUrl);
    return fromUrl ?? sessionStorage.getItem(DEV_KEY);
  } catch {
    return null;
  }
}

export function devHeaders(): Record<string, string> {
  const d = devUser();
  return d ? { "x-dev-user": d } : {};
}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: { "content-type": "application/json", ...devHeaders() },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "Something went wrong");
  return data as T;
}

export interface Profile {
  name: string;
  avatar: string;
}

export const api = {
  createRoom: (profile: Profile) => request<{ code: string }>("/api/rooms", { method: "POST", body: profile }),
  snapshot: (code: string) => request<RoomSnapshot>(`/api/rooms/${code}`),
  join: (code: string, profile: Profile) => request<GameMessage>(`/api/rooms/${code}/join`, { method: "POST", body: profile }),
  act: (code: string, action: Action) => request<GameMessage>(`/api/rooms/${code}/action`, { method: "POST", body: action }),
  tick: (code: string) => request<{ applied: boolean; v: number }>(`/api/rooms/${code}/tick`, { method: "POST" }),
  offline: (code: string, pid: string) => request<{ applied: boolean }>(`/api/rooms/${code}/offline`, { method: "POST", body: { pid } }),
  devChat: (code: string, kind: ChatKind, text: string, to?: string) =>
    request<{ ok: true }>("/api/dev/chat", { method: "POST", body: { code, kind, text, to } }),
};
