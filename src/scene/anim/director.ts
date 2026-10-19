"use client";

import * as THREE from "three";
import { BRAND } from "@/brand";
import { playSfx, playVoice, type VoiceLine } from "@/audio/sound";
import type { Card, CardKind, GameEvent, PublicView } from "@/engine";
import { drawValue, isDrawCard, isWild } from "@/engine/cards";
import { onBatch, playerName, useGame, type Batch } from "@/client/store/game-store";
import { CARD_H } from "../cards/cardGeometry";
import { computeSeats, flatFaceDown, flatFaceUp, PILE_SCALE, SEAT_CARD_SCALE, seatHandCenter, standingBack, tableDims } from "../layout/layout";
import { actorTransforms, COLOR_HEX, sceneRef, spawnHints, useScene, wildColors, type FaceSpec, type Ghost, type PileFx } from "../sceneStore";
import { describeMove } from "./callout";

/**
 * Turns server events into choreography: where new cards fly in from, transient
 * "ghost" cards for things we can't see, seat badges, pulses, sounds and toasts.
 * Runs before each new view is applied, so it can look at both old and new state.
 */

const SEAT_SCALE = SEAT_CARD_SCALE;

/** Middle of a player's held hand. */
function seatPos(pid: string): THREE.Vector3 {
  const s = sceneRef.seats.get(pid);
  return s ? seatHandCenter(s) : new THREE.Vector3(0, 0, sceneRef.dims.rz);
}
/** How a card sits in that player's hand (upright, back to the table). */
function seatQuat(pid: string) {
  return standingBack(sceneRef.seats.get(pid)?.yaw ?? 0);
}

function ghost(from: THREE.Vector3, to: THREE.Vector3, opts: Partial<Omit<Ghost, "id" | "born">> = {}): Omit<Ghost, "id" | "born"> {
  return {
    face: null,
    from,
    to,
    fromQuat: flatFaceDown(0),
    toQuat: flatFaceDown(0),
    fromScale: PILE_SCALE,
    toScale: SEAT_SCALE,
    delay: 0,
    duration: 520,
    ...opts,
  };
}

function deckTop(): THREE.Vector3 {
  return sceneRef.dims.deck.clone().setY(0.5);
}

function cardFlyGhosts(fromPid: string, toPid: string, count: number, delay: number) {
  const you = sceneRef.you;
  const gs: Omit<Ghost, "id" | "born">[] = [];
  const n = Math.min(count, 7);
  for (let i = 0; i < n; i++) {
    gs.push(
      ghost(seatPos(fromPid), seatPos(toPid), {
        fromQuat: seatQuat(fromPid),
        toQuat: seatQuat(toPid),
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
      toQuat: seatQuat(toPid),
      fromScale: t?.scale ?? 1,
      toScale: SEAT_SCALE,
      delay: delay + i * 35,
      duration: 650,
    });
  });
}

/** The big animation over the pile for an action or wild card (null for number cards). */
function pileFxFor(card: Card, ev: GameEvent[], next: PublicView): Omit<PileFx, "id"> | null {
  if (card.kind === "number") return null;
  const color = card.color ? COLOR_HEX[card.color] : COLOR_HEX.wild;
  let picked: string | null = null;
  let direction: 1 | -1 = next.direction;
  let victim: string | null = null;
  const skipped: string[] = [];
  for (const e of ev) {
    if (e.t === "color") picked = COLOR_HEX[e.color];
    if (e.t === "reverse") direction = e.direction;
    if (e.t === "skip") skipped.push(...e.pids);
    if (e.t === "draw" && e.reason === "penalty" && !victim) victim = e.pid;
  }
  const base = { color, picked, direction, label: "", targets: [] as string[] };
  switch (card.kind) {
    case "skip":
      return { ...base, kind: "skip", targets: skipped };
    case "skip_all":
      return { ...base, kind: "skip_all", label: "ALL" };
    case "reverse":
      return { ...base, kind: "reverse", targets: skipped };
    case "discard_all":
      return { ...base, kind: "discard_all", label: "ALL" };
    case "wild":
      return { ...base, kind: "wild", color: picked ?? color };
    case "wild_roulette":
      return { ...base, kind: "roulette", label: "?", targets: next.turnPlayerId ? [next.turnPlayerId] : [] };
    default: {
      // every draw card; the pending victim when it's waiting to be stacked
      const target = victim ?? (next.turn.kind === "stack" ? next.turnPlayerId : null);
      return { ...base, kind: "draw", label: `+${drawValue(card)}`, color: picked ?? color, targets: target ? [target] : [] };
    }
  }
}

function colorOf(card: Card): string {
  return card.color ? COLOR_HEX[card.color] : COLOR_HEX.wild;
}

/** Shouted callout for each action / wild card (number cards stay silent). */
const CARD_VOICE: Partial<Record<CardKind, VoiceLine>> = {
  skip: "skip", reverse: "reverse", draw2: "draw2", draw4: "draw4", wild: "wild", wild4: "wild4",
  wild_reverse4: "wild_reverse4", wild6: "wild6", wild10: "wild10", skip_all: "skip_all",
  discard_all: "discard_all", wild_roulette: "wild_roulette",
};
/** Pause after a card's own callout before "Draw cards!" for whoever takes the penalty. */
const DRAW_VOICE_GAP = 650;

function cardSfx(card: Card) {
  if (isWild(card)) return "wild" as const;
  if (card.kind === "number") return "play" as const;
  return "action" as const;
}

export function choreograph(b: Batch) {
  const { ev, prev, next, prevPriv, nextPriv, you } = b;
  // keep seat positions current even if the canvas hasn't rendered this state yet
  if (typeof window !== "undefined") sceneRef.dims = tableDims(window.innerWidth / Math.max(1, window.innerHeight), window.innerHeight < 520);
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
        wildColors.clear();
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
              ghosts.push(ghost(deckTop(), seatPos(p.id), { toQuat: seatQuat(p.id), delay: d, duration: 420 }));
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
        const cardVoice = CARD_VOICE[e.card.kind];
        if (cardVoice) playVoice(cardVoice, land);
        if (e.jumpIn) scene.addSeatFx(e.pid, "JUMP-IN!", "gold", true, t);
        // faces: a cheeky grin for hitting someone, a smile for any other action
        if (e.card.kind !== "number") scene.setMood(e.pid, isDrawCard(e.card) ? "wink" : "happy", land, 1800);
        if (isDrawCard(e.card)) sceneRef.shake = Math.max(sceneRef.shake, e.card.kind === "wild10" ? 1 : 0.35);
        const fx = pileFxFor(e.card, ev, next);
        if (fx) scene.addPileFx(fx, land - 40);
        t += 160;
        break;
      }
      case "draw": {
        const penalty = e.reason !== "draw" && e.reason !== "deal";
        if (e.pid === you) {
          (e.cards ?? []).forEach((c, i) => spawnHints.set(c.id, { from: "deck", delay: t + i * 85 }));
        } else {
          for (let i = 0; i < Math.min(e.count, 10); i++) {
            ghosts.push(ghost(deckTop(), seatPos(e.pid), { toQuat: seatQuat(e.pid), delay: t + i * 70 }));
          }
        }
        for (let i = 0; i < Math.min(e.count, 5); i++) playSfx("draw", t + i * 80);
        if (e.reason === "penalty" || e.reason === "challenge") playVoice("draw", t + DRAW_VOICE_GAP);
        // a plain draw that can't be played ends the turn by itself: say so
        if (e.reason === "draw" && next.phase === "playing" && next.turnPlayerId !== e.pid && !ev.some((x) => x.t === "eliminated" && x.pid === e.pid)) {
          scene.addSeatFx(e.pid, "NO PLAY", "white", false, t + 450);
          if (e.pid === you) game.toast("Nothing you can play, turn passes", "info");
        }
        if (e.reason === "draw" && next.phase === "playing" && next.turnPlayerId !== e.pid) scene.setMood(e.pid, "annoyed", t + 450, 1800);
        if (penalty) {
          scene.setMood(e.pid, e.count >= 4 ? "shock" : "sad", t + 200, e.count >= 4 ? 2600 : 2000);
          scene.addSeatFx(e.pid, `+${e.count}`, "red", e.count >= 4, t + 200);
          if (e.count >= 4) sceneRef.shake = Math.max(sceneRef.shake, Math.min(1, e.count / 10));
        }
        t += Math.min(e.count, 6) * 75 + 120;
        break;
      }
      case "color": {
        scene.addPulse("colorburst", discardPos, COLOR_HEX[e.color], t + 200);
        // the wild on top of the pile takes the picked color
        const top = next.discardTop[next.discardTop.length - 1];
        if (top && top.color === null) wildColors.set(top.id, e.color);
        break;
      }
      case "skip":
        e.pids.forEach((pid) => {
          scene.addSeatFx(pid, "⊘ SKIP", "white", true, t + 250);
          scene.setMood(pid, "annoyed", t + 250, 2000);
        });
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
        scene.setMood(e.a, "happy", t + 300, 2000);
        scene.setMood(e.b, "shock", t + 300, 2200);
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
        playVoice("swap", t + 100);
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
        playSfx("swap", t + 150);
        playVoice("rotate", t + 100);
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
                toQuat: flatFaceUp(sceneRef.seats.get(e.pid)?.yaw ?? 0),
                delay: t + i * 170,
                duration: 600,
              }),
            );
          playSfx("draw", t + i * 170);
        });
        scene.addSeatFx(e.pid, `+${e.cards.length}`, "red", true, t + e.cards.length * 170);
        playVoice("draw", t + DRAW_VOICE_GAP);
        t += e.cards.length * 170 + 200;
        break;
      }
      case "challenge":
        scene.addSeatFx(e.guilty ? e.offender : e.victim, e.guilty ? "BUSTED!" : "FAIR!", e.guilty ? "red" : "blue", true, t);
        scene.setMood(e.guilty ? e.offender : e.victim, "sad", t, 2400);
        scene.setMood(e.guilty ? e.victim : e.offender, "happy", t, 2400);
        break;
      case "uno_call":
        scene.addSeatFx(e.pid, BRAND.shout, "gold", true, t);
        scene.setMood(e.pid, "wink", t, 2200);
        // my own shout already played instantly on click
        if (e.pid !== you || !recentOwnShout()) {
          scene.addShout({ pid: e.pid, kind: "shout" });
          playSfx("shout", t);
          playVoice("uno");
        }
        break;
      case "uno_caught":
        scene.addSeatFx(e.pid, "🔨 CAUGHT!", "red", true, t);
        scene.setMood(e.pid, "shock", t, 2400);
        scene.setMood(e.by, "happy", t, 2000);
        scene.addShout({ pid: e.pid, kind: "caught", by: e.by });
        playVoice("caught");
        sceneRef.shake = Math.max(sceneRef.shake, 0.6);
        game.toast(`${name(e.by)} caught ${name(e.pid)} not shouting!`, "warn");
        playSfx("caught", t);
        break;
      case "eliminated":
        scene.addSeatFx(e.pid, "OUT!", "red", true, t);
        scene.setMood(e.pid, "dizzy", t, 3000);
        game.toast(`${name(e.pid)} hit the card limit and is out of the round`, "warn");
        playSfx("out", t);
        break;
      case "reshuffle":
        for (let i = 0; i < 6; i++) {
          ghosts.push(
            ghost(discardPos.clone(), deckTop(), { fromQuat: flatFaceUp(i), toQuat: flatFaceDown(0), fromScale: PILE_SCALE, toScale: PILE_SCALE, delay: t + i * 50 }),
          );
        }
        playSfx("shuffle", t);
        t += 400;
        break;
      case "timeout":
        if (e.pid === you) game.toast("Time's up!", "warn");
        scene.setMood(e.pid, "sleepy", t, 2000);
        scene.addSeatFx(e.pid, "TIME!", "white", false, t);
        break;
      case "round_over": {
        // in team play your partner going out is your win too
        const me = next.players.find((p) => p.id === you);
        const won = !!e.winnerId && (e.winnerId === you || me?.partnerId === e.winnerId);
        // let the last card land and be seen before the party (the scoreboard waits longer still)
        const at = t + 650;
        setTimeout(() => useScene.getState().celebrate(won), at);
        const winners = new Set([e.winnerId, next.players.find((p) => p.id === e.winnerId)?.partnerId].filter(Boolean));
        for (const p of next.players) if (p.status !== "left") scene.setMood(p.id, winners.has(p.id) ? "love" : "sad", at, 4000);
        playSfx(won ? "win" : "lose", at + 200);
        if (e.winnerId && !e.timeUp) {
          const last = findPlayedCard(ev);
          const winner = name(e.winnerId);
          const seat = sceneRef.seats.get(e.winnerId);
          if (seat) scene.addPulse("shockwave", seat.chip, "#ffcf1a", at);
          scene.showCallout(
            {
              icon: "🏆",
              title: e.winnerId === you ? "YOU'RE OUT!" : "OUT!",
              sub: `${winner} ${e.winnerId === you ? "played your" : "played their"} last card`,
              color: last ? colorOf(last) : "#ffcf1a",
            },
            at,
          );
        }
        break;
      }
      case "player_offline":
        if (e.pid !== you) game.toast(`${name(e.pid)} lost connection, a bot is playing for them`, "warn");
        break;
      case "spectator_joined":
        if (e.pid !== you) game.toast(`${next.spectators.find((w) => w.id === e.pid)?.name ?? "Someone"} is watching`, "info");
        break;
      case "team_invite":
        if (e.to === you) game.toast(`${name(e.from)} wants to team up`, "good");
        break;
      case "team_paired":
        if (e.a === you || e.b === you) game.toast(`You're teamed up with ${name(e.a === you ? e.b : e.a)}`, "good");
        break;
      case "player_joined":
        if (e.pid !== you) game.toast(`${name(e.pid)} joined`, "info");
        break;
      case "player_left":
        if (e.pid !== you) game.toast(`${prev ? playerName(prev, e.pid) : "A player"} left`, "info");
        break;
      case "room_closed":
        game.toast("The host closed the room", "warn");
        if (typeof window !== "undefined") setTimeout(() => window.location.replace(`${window.location.origin}/`), 1400);
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

  // one plain-language headline for action and wild cards, shown as the card lands
  const callout = describeMove(ev, next, you);
  if (callout) {
    const byOther = ev.some((e) => e.t === "play" && e.pid !== you);
    scene.showCallout(callout, byOther ? 380 : 180);
  }

  // your turn cue: banner, chime and a buzz
  if (next.phase === "playing" && next.turnPlayerId === you && prev?.turnPlayerId !== you) {
    playSfx("turn", t + 150);
    scene.markYourTurn(t + 120);
    try {
      setTimeout(() => navigator.vibrate?.([30, 60, 40]), t + 120);
    } catch {}
  }
}

let ownShoutAt = 0;
/** Called when you press the shout button so the banner/voice don't wait for the server. */
export function shoutNow(you: string) {
  ownShoutAt = performance.now();
  useScene.getState().addShout({ pid: you, kind: "shout" });
  playSfx("shout");
  playVoice("uno");
}
function recentOwnShout() {
  return performance.now() - ownShoutAt < 4000;
}

function findPlayedCard(ev: GameEvent[]): Card | undefined {
  for (const e of ev) if (e.t === "play") return e.card;
  return undefined;
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
