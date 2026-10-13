"use client";

import * as THREE from "three";
import { BRAND } from "@/brand";
import { playSfx } from "@/audio/sound";
import type { Card, GameEvent, PublicView } from "@/engine";
import { isDrawCard, isWild } from "@/engine/cards";
import { onBatch, playerName, useGame, type Batch } from "@/client/store/game-store";
import { CARD_H } from "../cards/cardGeometry";
import { computeSeats, flatFaceDown, flatFaceUp, tableDims } from "../layout/layout";
import { actorTransforms, COLOR_HEX, sceneRef, spawnHints, useScene, type FaceSpec, type Ghost } from "../sceneStore";

/**
 * Turns server events into choreography: where new cards fly in from, transient
 * "ghost" cards for things we can't see, seat badges, pulses, sounds and toasts.
 * Runs before each new view is applied, so it can look at both old and new state.
 */

const SEAT_SCALE = 0.62;

function seatPos(pid: string): THREE.Vector3 {
  const s = sceneRef.seats.get(pid);
  return s ? s.fan.clone() : new THREE.Vector3(0, 0, sceneRef.dims.rz);
}
function seatYaw(pid: string) {
  return sceneRef.seats.get(pid)?.yaw ?? 0;
}

function ghost(from: THREE.Vector3, to: THREE.Vector3, opts: Partial<Omit<Ghost, "id" | "born">> = {}): Omit<Ghost, "id" | "born"> {
  return {
    face: null,
    from,
    to,
    fromQuat: flatFaceDown(0),
    toQuat: flatFaceDown(0),
    fromScale: 1,
    toScale: SEAT_SCALE,
    delay: 0,
    duration: 520,
    ...opts,
  };
}

function deckTop(): THREE.Vector3 {
  return sceneRef.dims.deck.clone().setY(0.25);
}

function cardFlyGhosts(fromPid: string, toPid: string, count: number, delay: number) {
  const you = sceneRef.you;
  const gs: Omit<Ghost, "id" | "born">[] = [];
  const n = Math.min(count, 7);
  for (let i = 0; i < n; i++) {
    gs.push(
      ghost(seatPos(fromPid), seatPos(toPid), {
        fromQuat: flatFaceDown(seatYaw(fromPid)),
        toQuat: flatFaceDown(seatYaw(toPid)),
        fromScale: fromPid === you ? 1 : SEAT_SCALE,
        toScale: toPid === you ? 1 : SEAT_SCALE,
        delay: delay + i * 45,
        duration: 650,
      }),
    );
  }
  return gs;
}

/** My current hand cards fly off to another seat (they're about to leave my hand). */
function myHandGhosts(ids: string[], toPid: string, delay: number) {
  return ids.slice(0, 12).map((id, i) => {
    const t = actorTransforms.get(id);
    return ghost(t?.pos.clone() ?? seatPos(sceneRef.you ?? ""), seatPos(toPid), {
      fromQuat: t?.quat.clone() ?? flatFaceUp(0),
      toQuat: flatFaceDown(seatYaw(toPid)),
      fromScale: t?.scale ?? 1,
      toScale: SEAT_SCALE,
      delay: delay + i * 35,
      duration: 650,
    });
  });
}

function colorOf(card: Card): string {
  return card.color ? COLOR_HEX[card.color] : COLOR_HEX.wild;
}

function cardSfx(card: Card) {
  if (isWild(card)) return "wild" as const;
  if (card.kind === "number") return "play" as const;
  return "action" as const;
}

export function choreograph(b: Batch) {
  const { ev, prev, next, prevPriv, nextPriv, you } = b;
  // keep seat positions current even if the canvas hasn't rendered this state yet
  if (typeof window !== "undefined") sceneRef.dims = tableDims(window.innerWidth / Math.max(1, window.innerHeight));
  sceneRef.seats = computeSeats(next.players, you, sceneRef.dims);
  sceneRef.you = you;
  const scene = useScene.getState();
  const game = useGame.getState();
  const name = (pid: string | null | undefined) => playerName(next, pid, you);
  const ghosts: Omit<Ghost, "id" | "born">[] = [];
  let t = 0; // timeline cursor (ms)
  const discardPos = sceneRef.dims.discard.clone().setY(0.05);

  const prevHand = new Set(prevPriv?.hand.map((c) => c.id) ?? []);

  for (const e of ev) {
    switch (e.t) {
      case "deal": {
        const order = next.players.filter((p) => p.status === "active");
        const per = Math.max(16, Math.min(55, 1700 / Math.max(1, order.length * (next.settings.handSize || 7))));
        const handIds = nextPriv?.hand.map((c) => c.id) ?? [];
        const rounds = Math.max(...Object.values(e.counts));
        let k = 0;
        for (let r = 0; r < rounds; r++) {
          for (const p of order) {
            if (r >= (e.counts[p.id] ?? 0)) continue;
            const d = k++ * per;
            if (p.id === you) {
              const id = handIds[r];
              if (id) spawnHints.set(id, { from: "deck", delay: d });
            } else if (r < 10) {
              ghosts.push(ghost(deckTop(), seatPos(p.id), { toQuat: flatFaceDown(seatYaw(p.id)), delay: d, duration: 420 }));
            }
            if (k % 3 === 0) playSfx("deal", d);
          }
        }
        playSfx("shuffle");
        t = k * per + 250;
        break;
      }
      case "start_card":
        spawnHints.set(e.card.id, { from: "deck", delay: t });
        scene.addPulse("shockwave", discardPos, colorOf(e.card), t + 400);
        playSfx("play", t + 380);
        t += 300;
        break;
      case "play": {
        if (e.pid !== you) spawnHints.set(e.card.id, { from: { seat: e.pid }, delay: t });
        const land = t + (e.pid === you ? 260 : 420);
        scene.addPulse("shockwave", discardPos, colorOf(e.card), land);
        if (e.card.kind !== "number") scene.addPulse("burst", discardPos, colorOf(e.card), land);
        playSfx(cardSfx(e.card), land - 60);
        if (e.jumpIn) scene.addSeatFx(e.pid, "JUMP-IN!", "gold", true, t);
        if (isDrawCard(e.card)) sceneRef.shake = Math.max(sceneRef.shake, e.card.kind === "wild10" ? 1 : 0.35);
        t += 160;
        break;
      }
      case "draw": {
        const penalty = e.reason !== "draw" && e.reason !== "deal";
        if (e.pid === you) {
          (e.cards ?? []).forEach((c, i) => spawnHints.set(c.id, { from: "deck", delay: t + i * 85 }));
        } else {
          for (let i = 0; i < Math.min(e.count, 10); i++) {
            ghosts.push(ghost(deckTop(), seatPos(e.pid), { toQuat: flatFaceDown(seatYaw(e.pid)), delay: t + i * 70 }));
          }
        }
        for (let i = 0; i < Math.min(e.count, 5); i++) playSfx("draw", t + i * 80);
        if (penalty) {
          scene.addSeatFx(e.pid, `+${e.count}`, "red", e.count >= 4, t + 200);
          if (e.count >= 4) sceneRef.shake = Math.max(sceneRef.shake, Math.min(1, e.count / 10));
        }
        t += Math.min(e.count, 6) * 75 + 120;
        break;
      }
      case "color":
        scene.addPulse("colorburst", discardPos, COLOR_HEX[e.color], t + 200);
        if (e.pid && e.pid !== you) game.toast(`${name(e.pid)} picked ${e.color.toUpperCase()}`, "info");
        break;
      case "skip":
        if (e.pids.length > 2) game.toast(`${name(next.turnPlayerId)} skipped everyone!`, "warn");
        e.pids.forEach((pid) => scene.addSeatFx(pid, "SKIP", "white", false, t + 250));
        playSfx("skip", t + 250);
        break;
      case "reverse":
        sceneRef.reverseAt = performance.now() + t;
        playSfx("reverse", t + 150);
        break;
      case "stack":
        playSfx("stack", t + 300);
        break;
      case "swap": {
        const mine = e.a === you || e.b === you;
        if (mine) {
          const other = e.a === you ? e.b : e.a;
          ghosts.push(...myHandGhosts([...prevHand].filter((id) => id !== findPlayedId(ev)), other, t + 200));
          nextPriv?.hand.forEach((c, i) => {
            if (!prevHand.has(c.id)) spawnHints.set(c.id, { from: { seat: other }, delay: t + 250 + i * 35 });
          });
        } else {
          ghosts.push(...cardFlyGhosts(e.a, e.b, countOf(next, e.b), t + 200), ...cardFlyGhosts(e.b, e.a, countOf(next, e.a), t + 200));
        }
        scene.addSeatFx(e.a, "SWAP!", "wild", true, t);
        scene.addSeatFx(e.b, "SWAP!", "wild", true, t);
        playSfx("swap", t + 150);
        t += 700;
        break;
      }
      case "rotate": {
        const active = next.players.filter((p) => p.status === "active");
        const k = active.length;
        active.forEach((p, i) => {
          const to = active[(((i + e.direction) % k) + k) % k];
          if (p.id === you) ghosts.push(...myHandGhosts([...prevHand].filter((id) => id !== findPlayedId(ev)), to.id, t + 200));
          else if (to.id !== you) ghosts.push(...cardFlyGhosts(p.id, to.id, Math.min(4, countOf(next, to.id)), t + 200));
          if (to.id === you) {
            nextPriv?.hand.forEach((c, j) => {
              if (!prevHand.has(c.id)) spawnHints.set(c.id, { from: { seat: p.id }, delay: t + 250 + j * 35 });
            });
          }
        });
        game.toast("Everyone passes their hand!", "info");
        playSfx("swap", t + 150);
        t += 700;
        break;
      }
      case "discard_all":
        if (e.pid !== you) e.cards.forEach((c, i) => spawnHints.set(c.id, { from: { seat: e.pid }, delay: t + i * 60 }));
        scene.addSeatFx(e.pid, `DISCARD ×${e.cards.length}`, "gold", true, t);
        scene.addPulse("burst", discardPos, COLOR_HEX[e.cards[0]?.color ?? "red"], t + 300);
        e.cards.forEach((_, i) => playSfx("play", t + 200 + i * 60));
        t += 200 + e.cards.length * 60;
        break;
      case "roulette": {
        e.cards.forEach((c, i) => {
          if (e.pid === you) spawnHints.set(c.id, { from: "deck", delay: t + i * 170, faceUp: true });
          else
            ghosts.push(
              ghost(deckTop(), seatPos(e.pid), {
                face: c,
                fromQuat: flatFaceUp(0),
                toQuat: flatFaceUp(seatYaw(e.pid)),
                delay: t + i * 170,
                duration: 600,
              }),
            );
          playSfx("draw", t + i * 170);
        });
        scene.addSeatFx(e.pid, `+${e.cards.length}`, "red", true, t + e.cards.length * 170);
        game.toast(`${name(e.pid)} flipped ${e.cards.length} card${e.cards.length === 1 ? "" : "s"} looking for ${e.color.toUpperCase()}`, "warn");
        t += e.cards.length * 170 + 200;
        break;
      }
      case "challenge":
        game.toast(
          e.guilty ? `Challenge! ${name(e.offender)} was bluffing and draws instead` : `${name(e.offender)} played fair — ${name(e.victim)} draws 6`,
          e.guilty ? "good" : "warn",
        );
        scene.addSeatFx(e.guilty ? e.offender : e.victim, e.guilty ? "BUSTED!" : "FAIR!", e.guilty ? "red" : "blue", true, t);
        break;
      case "uno_call":
        scene.addSeatFx(e.pid, BRAND.shout, "gold", true, t);
        playSfx("shout", t);
        break;
      case "uno_caught":
        scene.addSeatFx(e.pid, "CAUGHT!", "red", true, t);
        game.toast(`${name(e.by)} caught ${name(e.pid)} not shouting!`, "warn");
        playSfx("caught", t);
        break;
      case "eliminated":
        scene.addSeatFx(e.pid, "OUT!", "red", true, t);
        game.toast(`${name(e.pid)} hit the card limit and is out of the round`, "warn");
        playSfx("out", t);
        break;
      case "reshuffle":
        for (let i = 0; i < 6; i++) {
          ghosts.push(
            ghost(discardPos.clone(), deckTop(), { fromQuat: flatFaceUp(i), toQuat: flatFaceDown(0), fromScale: 1, toScale: 1, delay: t + i * 50 }),
          );
        }
        playSfx("shuffle", t);
        t += 400;
        break;
      case "timeout":
        if (e.pid === you) game.toast("Time's up!", "warn");
        scene.addSeatFx(e.pid, "TIME!", "white", false, t);
        break;
      case "round_over": {
        const won = e.winnerId === you;
        scene.celebrate(won);
        playSfx(won ? "win" : "lose", t + 300);
        break;
      }
      case "player_joined":
        if (e.pid !== you) game.toast(`${name(e.pid)} joined`, "info");
        break;
      case "player_left":
        if (e.pid !== you) game.toast(`${prev ? playerName(prev, e.pid) : "A player"} left`, "info");
        break;
      case "host_changed":
        if (e.pid === you) game.toast("You're the host now", "good");
        break;
    }
  }

  // anything new in my hand without a specific origin comes from the deck
  let extra = 0;
  for (const c of nextPriv?.hand ?? []) {
    if (!prevHand.has(c.id) && !spawnHints.has(c.id) && prevPriv) spawnHints.set(c.id, { from: "deck", delay: extra++ * 60 });
  }

  if (ghosts.length) scene.addGhosts(ghosts);

  // your turn cue
  if (next.phase === "playing" && next.turnPlayerId === you && prev?.turnPlayerId !== you) {
    playSfx("turn", t + 150);
    try {
      navigator.vibrate?.(25);
    } catch {}
  }
}

function findPlayedId(ev: GameEvent[]): string | undefined {
  for (const e of ev) if (e.t === "play") return e.card.id;
  return undefined;
}

function countOf(pub: PublicView, pid: string) {
  return pub.players.find((p) => p.id === pid)?.cardCount ?? 0;
}

/** Hooks the director into the game store. Safe to call repeatedly. */
export function installDirector() {
  onBatch("director", choreograph);
}

export const CARD_LIFT = CARD_H * 0.3;
export type { FaceSpec };
