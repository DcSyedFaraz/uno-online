"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Card } from "@/engine";
import { useGame } from "@/client/store/game-store";
import { sortHand, useUi } from "@/ui/uiStore";
import { cardGeometry, cardMaterials, faceMaterial, heldFaceGeometry } from "../cards/cardGeometry";
import { flatFaceDown, hash01, PILE_SCALE, SEAT_CARD_SCALE, SEAT_FACE_SCALE, seatCardSlot, seatFaceSlot, seatSideFacing } from "../layout/layout";
import { sceneRef } from "../sceneStore";

const FAN_MAX = 12;
/** a hand you may see (your teammate's, or any hand when spectating) shows up to this many faces */
const PEEK_MAX = 20;
const DECK_LAYERS = 34;
/** up to 10 seats around the table (a spectator sees all ten players as opponents) */
const SEATS = 10;
const MAX = DECK_LAYERS + SEATS * PEEK_MAX;

interface Slot {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: number;
}

const tPos = new THREE.Vector3();
const tQuat = new THREE.Quaternion();
const mtx = new THREE.Matrix4();
const scl = new THREE.Vector3();
const used = new Uint8Array(MAX);
/** in a face-up hand, the card each instance is showing (so a card keeps its instance as the hand changes) */
const owner: (string | null)[] = new Array(MAX).fill(null);
const shows: (Card | null)[] = new Array(MAX).fill(null);
const side = new Int8Array(MAX);

/**
 * Every held or stacked card on the table in one instanced draw call: the draw pile and
 * each opponent's hand, held upright. Each seat owns a fixed block of instances, and
 * instances glide to their slots so counts animate.
 *
 * Hands you may see are still drawn by the instanced bodies; each card just gets a face
 * laid over whichever side the camera sees (one small draw call per visible face).
 */
export function Backs() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const faceGroup = useRef<THREE.Group>(null);
  const slots = useMemo<Slot[]>(() => Array.from({ length: MAX }, () => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 0 })), []);
  const faces = useMemo<(THREE.Mesh | null)[]>(() => new Array(MAX).fill(null), []);
  const mats = useMemo(() => cardMaterials(null), []);

  useFrame(({ camera }, dt) => {
    const m = mesh.current;
    if (!m) return;
    const { pub, priv, you } = useGame.getState();
    const d = sceneRef.dims;
    used.fill(0);
    shows.fill(null);
    const k = 1 - Math.exp(-dt * 9);

    const place = (i: number, scale: number) => {
      const s = slots[i];
      if (s.scale === 0) {
        s.pos.copy(tPos);
        s.quat.copy(tQuat);
        s.scale = scale;
      } else {
        s.pos.lerp(tPos, k);
        s.quat.slerp(tQuat, k);
        s.scale += (scale - s.scale) * k;
      }
      used[i] = 1;
    };

    if (pub && pub.phase !== "lobby") {
      const layers = Math.min(DECK_LAYERS, Math.ceil(pub.drawCount / 3));
      for (let i = 0; i < layers; i++) {
        const h = `d${i}`;
        tPos.set(d.deck.x + (hash01(h) - 0.5) * 0.05, 0.045 + i * 0.014, d.deck.z + (hash01(h, 3) - 0.5) * 0.05);
        flatFaceDown((hash01(h, 7) - 0.5) * 0.12, tQuat);
        place(i, PILE_SCALE);
      }
      const sortMode = useUi.getState().sortMode;
      for (const p of pub.players) {
        if (p.id === you || p.status !== "active") continue;
        const seat = sceneRef.seats.get(p.id);
        if (!seat || seat.rel < 1 || seat.rel > SEATS) continue;
        const base = DECK_LAYERS + (seat.rel - 1) * PEEK_MAX;
        const peek = priv?.peek?.[p.id];
        if (!peek) {
          for (let j = 0; j < PEEK_MAX; j++) owner[base + j] = null;
          const shown = Math.min(FAN_MAX, p.cardCount);
          // held upright like a real hand: backs to the table, fanned along the edge
          for (let i = 0; i < shown; i++) {
            seatCardSlot(seat, i, shown, tPos, tQuat);
            place(base + i, SEAT_CARD_SCALE);
          }
          continue;
        }
        // face-up: sorted like your own hand, read left to right from wherever the camera is
        const cards = sortHand(peek, sortMode).slice(0, PEEK_MAX);
        const n = cards.length;
        const facing = seatSideFacing(seat, camera.position);
        // leave a gap before the nearest other hand on the table
        let gap = Infinity;
        for (const o of sceneRef.seats.values()) if (o !== seat && o.rel > 0) gap = Math.min(gap, o.fan.distanceTo(seat.fan));
        for (let j = 0; j < PEEK_MAX; j++) {
          const id = owner[base + j];
          if (id && !cards.some((c) => c.id === id)) owner[base + j] = null;
        }
        cards.forEach((c, at) => {
          let j = owner.indexOf(c.id, base);
          if (j < 0 || j >= base + PEEK_MAX) {
            j = owner.indexOf(null, base);
            owner[j] = c.id;
          }
          // the table side sees the fan mirrored, so the order flips to keep it left to right
          seatFaceSlot(seat, facing > 0 ? at : n - 1 - at, n, tPos, tQuat, gap * 0.88);
          place(j, SEAT_FACE_SCALE);
          shows[j] = c;
          side[j] = facing;
        });
      }
    }

    for (let i = 0; i < MAX; i++) {
      const s = slots[i];
      if (!used[i]) {
        s.scale = 0;
        mtx.makeScale(0, 0, 0);
      } else {
        scl.setScalar(s.scale);
        mtx.compose(s.pos, s.quat, scl);
      }
      m.setMatrixAt(i, mtx);

      const card = shows[i];
      let f = faces[i];
      if (!card) {
        if (f) f.visible = false;
        continue;
      }
      if (!f) {
        f = faces[i] = new THREE.Mesh();
        f.matrixAutoUpdate = false;
        faceGroup.current?.add(f);
      }
      f.visible = true;
      if (f.userData.id !== card.id) {
        f.userData.id = card.id;
        f.material = faceMaterial(card);
      }
      if (f.userData.side !== side[i]) {
        f.userData.side = side[i];
        f.geometry = heldFaceGeometry(side[i] as 1 | -1);
      }
      f.matrix.copy(mtx);
      f.matrixWorldNeedsUpdate = true;
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={mesh} args={[cardGeometry(), mats, MAX]} castShadow frustumCulled={false} />
      <group ref={faceGroup} />
    </>
  );
}
