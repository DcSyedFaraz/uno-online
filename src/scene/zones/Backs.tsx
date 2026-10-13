"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useGame } from "@/client/store/game-store";
import { cardGeometry, cardMaterials } from "../cards/cardGeometry";
import { flatFaceDown, hash01, PILE_SCALE } from "../layout/layout";
import { sceneRef } from "../sceneStore";

const FAN_MAX = 12;
const DECK_LAYERS = 34;
const MAX = DECK_LAYERS + 9 * FAN_MAX;

interface Slot {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: number;
}

const tPos = new THREE.Vector3();
const tQuat = new THREE.Quaternion();
const qYaw = new THREE.Quaternion();
const mtx = new THREE.Matrix4();
const scl = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
const used = new Uint8Array(MAX);

/**
 * Every face-down card on the table in one instanced draw call: the draw pile and
 * each opponent's fanned hand. Each seat owns a fixed block of instances, and
 * instances glide to their slots so counts animate.
 */
export function Backs() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const slots = useMemo<Slot[]>(() => Array.from({ length: MAX }, () => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 0 })), []);
  const mats = useMemo(() => cardMaterials(null), []);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const { pub, you } = useGame.getState();
    const d = sceneRef.dims;
    used.fill(0);
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
        tPos.set(d.deck.x + (hash01(h) - 0.5) * 0.05, 0.02 + i * 0.014, d.deck.z + (hash01(h, 3) - 0.5) * 0.05);
        flatFaceDown((hash01(h, 7) - 0.5) * 0.12, tQuat);
        place(i, PILE_SCALE);
      }
      for (const p of pub.players) {
        if (p.id === you || p.status !== "active") continue;
        const seat = sceneRef.seats.get(p.id);
        if (!seat || seat.rel < 1 || seat.rel > 9) continue;
        const base = DECK_LAYERS + (seat.rel - 1) * FAN_MAX;
        const shown = Math.min(FAN_MAX, p.cardCount);
        const spread = Math.min(0.13, 0.95 / Math.max(1, shown));
        for (let i = 0; i < shown; i++) {
          const off = (i - (shown - 1) / 2) * spread;
          // fan along the tangent of the table edge, facing the center
          tPos.set(seat.fan.x + Math.cos(seat.yaw) * off, 0.02 + i * 0.004, seat.fan.z - Math.sin(seat.yaw) * off);
          flatFaceDown(seat.yaw + Math.PI, tQuat);
          qYaw.setFromAxisAngle(Y, -off * 0.9);
          tQuat.premultiply(qYaw);
          place(base + i, 0.62);
        }
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
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[cardGeometry(), mats, MAX]} castShadow frustumCulled={false} />;
}
