"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { NEON } from "@/brand";
import { sendAction } from "@/client/actions";
import { useGame } from "@/client/store/game-store";
import { playSfx } from "@/audio/sound";
import { CARD_H, CARD_W } from "../cards/cardGeometry";
import { glowTexture } from "../cards/glow";
import { PILE_SCALE } from "../layout/layout";
import { sceneRef } from "../sceneStore";

function arrowGeometry() {
  const s = new THREE.Shape();
  // a chunky down-pointing arrow, tip at the origin
  s.moveTo(0, 0);
  s.lineTo(0.34, 0.36);
  s.lineTo(0.13, 0.36);
  s.lineTo(0.13, 0.78);
  s.lineTo(-0.13, 0.78);
  s.lineTo(-0.13, 0.36);
  s.lineTo(-0.34, 0.36);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.03, bevelSegments: 3 });
  g.translate(0, 0, -0.06);
  return g;
}

/**
 * Tap the deck to draw. When drawing (or taking a pending penalty) is possible, a glowing
 * 3D arrow bobs above the pile and the deck lights up.
 */
export function DeckTarget() {
  const canDraw = useGame((s) => !!s.priv?.canDraw);
  const canTake = useGame((s) => !!s.priv?.canTakePenalty);
  const active = canDraw || canTake;
  const [hover, setHover] = useState(false);
  const arrow = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const arrowMat = useRef<THREE.MeshStandardMaterial>(null);
  const geom = useMemo(() => arrowGeometry(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const d = sceneRef.dims;
  const w = CARD_W * PILE_SCALE;
  const h = CARD_H * PILE_SCALE;

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const a = arrow.current;
    if (a) {
      const target = active ? 1 : 0;
      const sc = THREE.MathUtils.damp(a.scale.x, target * (hover ? 1.15 : 1), 10, dt);
      a.scale.setScalar(Math.max(0.0001, sc));
      a.visible = sc > 0.01;
      a.position.set(d.deck.x, 1.15 + Math.abs(Math.sin(t * 3.2)) * 0.32, d.deck.z);
      a.rotation.y += dt * 1.6;
    }
    if (arrowMat.current) {
      color.set(canTake ? NEON.red : NEON.green);
      arrowMat.current.color.copy(color);
      arrowMat.current.emissive.copy(color);
      arrowMat.current.emissiveIntensity = 0.25 + Math.sin(t * 6) * 0.1;
    }
    if (ring.current) {
      const m = ring.current.material as THREE.MeshBasicMaterial;
      m.opacity = THREE.MathUtils.damp(m.opacity, active ? 0.75 + Math.sin(t * 4) * 0.2 : 0, 8, dt);
      ring.current.visible = m.opacity > 0.01;
      m.color.set(canTake ? "#ffd0c8" : "#fff4b0");
    }
  });

  const onClick = (e: { stopPropagation(): void }) => {
    e.stopPropagation();
    const priv = useGame.getState().priv;
    if (priv?.canDraw) {
      playSfx("draw");
      void sendAction({ type: "draw" });
    } else if (priv?.canTakePenalty) {
      void sendAction({ type: "take_penalty" });
    }
  };

  return (
    <group>
      {/* invisible hit box over the draw pile */}
      <mesh
        position={[d.deck.x, 0.3, d.deck.z]}
        onClick={onClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          if (active) document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
      >
        <boxGeometry args={[w * 1.2, 0.8, h * 1.15]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* glow outline under the deck */}
      <mesh ref={ring} position={[d.deck.x, 0.018, d.deck.z]} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={-1}>
        <planeGeometry args={[w * 1.9, h * 1.7]} />
        <meshBasicMaterial map={glowTexture()} transparent opacity={0} depthWrite={false} />
      </mesh>
      <group ref={arrow} visible={false}>
        <mesh geometry={geom}>
          <meshStandardMaterial ref={arrowMat} color={NEON.green} emissive={NEON.green} emissiveIntensity={0.25} roughness={0.4} metalness={0} />
        </mesh>
      </group>
    </group>
  );
}
