"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatKind } from "@/shared/protocol";
import { api, ApiError } from "../api";
import { serverNow } from "../clock";
import { useGame } from "../store/game-store";
import { connectRoom, type RoomConnection } from "./transport";

export type RoomStatus = "loading" | "not_found" | "need_join" | "ready" | "error";

let connection: RoomConnection | null = null;

export function sendChat(kind: ChatKind, text: string) {
  return connection?.sendChat(kind, text);
}

/** Loads the room, keeps the realtime connection alive and resyncs on reconnect. */
export function useRoom(code: string) {
  const [status, setStatus] = useState<RoomStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const member = useGame((s) => s.member);
  const transport = useGame((s) => s.transport);
  const you = useGame((s) => s.you);

  useEffect(() => {
    let cancelled = false;
    useGame.getState().reset();
    api
      .snapshot(code)
      .then((snap) => {
        if (cancelled) return;
        const g = useGame.getState();
        g.init(snap.code, snap.you, snap.transport, snap.member);
        g.receive(snap.msg);
        setStatus(snap.member ? "ready" : "need_join");
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setStatus("not_found");
        else {
          setError(e instanceof Error ? e.message : "Couldn't load the room");
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (member && status === "need_join") setStatus("ready");
  }, [member, status]);

  // realtime connection once we're a member
  useEffect(() => {
    if (!member || !you) return;
    const g = useGame.getState();
    const conn = connectRoom(code, you, transport, {
      onGame: (m) => useGame.getState().receive(m),
      onChat: (m) => useGame.getState().addChat(m),
      onPresence: (members) => useGame.getState().setPresence(members),
      onConnected: () => {
        useGame.getState().setConnected(true);
        api.snapshot(code).then((snap) => useGame.getState().receive(snap.msg)).catch(() => {});
      },
      onDisconnected: () => g.setConnected(false),
    });
    connection = conn;
    return () => {
      conn.close();
      if (connection === conn) connection = null;
    };
  }, [code, member, you, transport]);

  useTicker(code);
  return { status, error, setStatus };
}

/**
 * Turn deadlines (AFK timeouts and bot moves) are resolved by clients poking the server.
 * The connected human in the lowest seat goes first; everyone else is a backup.
 */
function useTicker(code: string) {
  const deadline = useGame((s) => s.pub?.deadline ?? null);
  const version = useGame((s) => s.version);
  const leaderRef = useRef(false);

  const players = useGame((s) => s.pub?.players);
  const presence = useGame((s) => s.presence);
  const you = useGame((s) => s.you);
  useEffect(() => {
    const online = new Set(presence);
    const humans = (players ?? []).filter((p) => !p.isBot && p.status !== "left" && (online.size === 0 || online.has(p.id)));
    leaderRef.current = humans[0]?.id === you;
  }, [players, presence, you]);

  useEffect(() => {
    if (deadline === null) return;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const fire = async () => {
      if (useGame.getState().version !== version) return;
      try {
        const res = await api.tick(code);
        if (!res.applied && useGame.getState().version === version && attempts++ < 4) {
          timer = setTimeout(fire, 400 + attempts * 300);
        }
      } catch {
        if (attempts++ < 4) timer = setTimeout(fire, 1000);
      }
    };
    const wait = Math.max(0, deadline - serverNow()) + (leaderRef.current ? 120 : 1800 + Math.random() * 900);
    timer = setTimeout(fire, wait);
    return () => clearTimeout(timer);
  }, [code, deadline, version]);
}
