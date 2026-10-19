"use client";

import { useEffect, useRef, useState } from "react";
import { dueAt } from "@/engine/state";
import type { PublicView } from "@/engine";
import type { ChatKind } from "@/shared/protocol";
import { api, ApiError } from "../api";
import { serverNow } from "../clock";
import { loadProfile } from "../profile";
import { useGame } from "../store/game-store";
import { connectRoom, type RoomConnection } from "./transport";

export type RoomStatus = "loading" | "not_found" | "need_join" | "ready" | "error";

let connection: RoomConnection | null = null;

export function sendChat(kind: ChatKind, text: string, to?: string) {
  return connection?.sendChat(kind, text, to);
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
  useOfflineWatch(code);
  useReclaim(code);
  // joining flips us to ready as soon as the join response arrives
  return { status: status === "need_join" && member ? "ready" : status, error, setStatus };
}

/** The connected human in the lowest seat: the one who resolves deadlines and reports dropped players first. */
function isLeader(players: PublicView["players"] | undefined, presence: string[], you: string | null) {
  const online = new Set(presence);
  const humans = (players ?? []).filter((p) => !p.isBot && p.status !== "left" && (online.size === 0 || online.has(p.id)));
  return humans[0]?.id === you;
}

/** How long someone must be gone before a bot takes their seat (a page refresh is quicker than this). */
const OFFLINE_GRACE_MS = 3000;
/** Someone we've never seen connect (still loading, a slow phone) gets much longer. */
const NEVER_SEEN_GRACE_MS = 20_000;

/**
 * Watches presence for players (and spectators) whose connection dropped and reports them.
 * The server re-checks presence before a bot takes over, so a wrong report does nothing.
 */
function useOfflineWatch(code: string) {
  const players = useGame((s) => s.pub?.players);
  const spectators = useGame((s) => s.pub?.spectators);
  const presence = useGame((s) => s.presence);
  const connected = useGame((s) => s.connected);
  const you = useGame((s) => s.you);
  const missing = useRef(new Map<string, number>());
  const reported = useRef(new Map<string, number>());
  const seen = useRef(new Set<string>());

  useEffect(() => {
    // an empty list means presence isn't known yet
    if (!connected || presence.length === 0) {
      missing.current.clear();
      return;
    }
    const here = new Set(presence);
    for (const pid of here) seen.current.add(pid);
    const watched = [...(players ?? []).filter((p) => !p.isBot && p.status !== "left").map((p) => p.id), ...(spectators ?? []).map((s) => s.id)];
    const now = Date.now();
    for (const pid of watched) {
      if (here.has(pid) || pid === you) missing.current.delete(pid);
      else if (!missing.current.has(pid)) missing.current.set(pid, now);
    }
    for (const pid of [...missing.current.keys()]) if (!watched.includes(pid)) missing.current.delete(pid);
  }, [players, spectators, presence, connected, you]);

  useEffect(() => {
    const timer = setInterval(() => {
      const g = useGame.getState();
      if (!g.connected || missing.current.size === 0) return;
      // the leader reports first; everyone else is a backup
      const backup = isLeader(g.pub?.players, g.presence, g.you) ? 1 : g.spectator ? 3 : 2;
      const now = Date.now();
      for (const [pid, since] of missing.current) {
        const grace = (seen.current.has(pid) ? OFFLINE_GRACE_MS : NEVER_SEEN_GRACE_MS) * backup;
        if (now - since < grace || now - (reported.current.get(pid) ?? 0) < 10_000) continue;
        reported.current.set(pid, now);
        api.offline(code, pid).catch(() => {});
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [code]);
}

/** Back online after a bot took over our seat: take it back (once per message burst). */
function useReclaim(code: string) {
  const mine = useGame((s) => s.pub?.players.find((p) => p.id === s.you));
  const mineOffline = !!(mine?.takenOver && mine.offline);
  const connected = useGame((s) => s.connected);
  const last = useRef(0);
  useEffect(() => {
    if (!mineOffline || !connected || Date.now() - last.current < 5000) return;
    last.current = Date.now();
    const profile = loadProfile();
    const g = useGame.getState();
    const me = g.pub?.players.find((p) => p.id === g.you);
    if (!me) return;
    api
      .join(code, profile ?? { name: me.name, avatar: me.avatar })
      .then((msg) => useGame.getState().receive(msg))
      .catch(() => {});
  }, [code, mineOffline, connected]);
}

/**
 * Turn deadlines (AFK timeouts and bot moves) and the round clock are resolved by clients
 * poking the server. The connected human in the lowest seat goes first; everyone else is a backup.
 */
function useTicker(code: string) {
  const deadline = useGame((s) => (s.pub ? dueAt(s.pub) : null));
  const version = useGame((s) => s.version);
  const leaderRef = useRef(false);

  const players = useGame((s) => s.pub?.players);
  const presence = useGame((s) => s.presence);
  const you = useGame((s) => s.you);
  useEffect(() => {
    leaderRef.current = isLeader(players, presence, you);
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
