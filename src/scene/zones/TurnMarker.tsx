"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useGame } from "@/client/store/game-store";
import { sceneRef } from "../sceneStore";

let spotTex: THREE.CanvasTexture | null = null;

/** Soft round pool of light with a bright rim, drawn once. */
function spotTexture(): THREE.CanvasTexture {
  if (spotTex) return spotTex;
  const s = 256;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.55, "rgba(255,255,255,0.7)");
  g.addColorStop(0.72, "rgba(255,255,255,0.95)");
  g.addColorStop(0.8, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  spotTex = new THREE.CanvasTexture(c);
  spotTex.colorSpace = THREE.SRGBColorSpace;
  return spotTex;
}

const target = new THREE.Vector3();

/**
 * A golden spotlight on the felt under whoever's turn it is. It glides from seat to seat,
 * so you can follow play at a glance.
 */
export function TurnMarker() {
  const mesh = useRef<THREE.Mesh>(null);
  const turnPid = useGame((s) => (s.pub?.phase === "playing" ? s.pub.turnPlayerId : null));
  const tex = useMemo(() => (typeof document === "undefined" ? null : spotTexture()), []);
  const placed = useRef(false);

  useFrame((state, dt) => {
    const m = mesh.current;
    if (!m) return;
    const mat = m.material as THREE.MeshBasicMaterial;
    const seat = turnPid ? sceneRef.seats.get(turnPid) : undefined;
    if (!seat) {
      mat.opacity = THREE.MathUtils.damp(mat.opacity, 0, 8, dt);
      m.visible = mat.opacity > 0.01;
      placed.current = false;
      return;
    }
    // just inside the player's fanned cards, toward the middle of the table, where the chip can't cover it
    target.copy(seat.fan).lerp(seat.chip, -0.18).setY(0.016);
    if (!placed.current) {
      m.position.copy(target);
      placed.current = true;
    }
    m.position.x = THREE.MathUtils.damp(m.position.x, target.x, 7, dt);
    m.position.z = THREE.MathUtils.damp(m.position.z, target.z, 7, dt);
    m.position.y = target.y;
    m.rotation.z = -seat.yaw;
    const pulse = 0.85 + Math.sin(state.clock.elapsedTime * 5) * 0.12;
    mat.opacity = THREE.MathUtils.damp(mat.opacity, pulse, 8, dt);
    m.visible = true;
  });

  return (
    <mesh ref={mesh} name="turn-marker" rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={-1}>
      <planeGeometry args={[2.6, 1.7]} />
      <meshBasicMaterial map={tex ?? undefined} color="#fff6c8" transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}
