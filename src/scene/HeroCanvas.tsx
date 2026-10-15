"use client";

import { Float } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { IS_TOUCH } from "@/client/device";
import type { Card } from "@/engine";
import { cardGeometry, cardMaterials } from "./cards/cardGeometry";
import { refreshTexturesWhenFontsReady } from "./cards/cardTextures";
import { STAGE } from "./Table";

const HERO: Omit<Card, "id">[] = [
  { kind: "wild4", color: null },
  { kind: "number", color: "red", value: 7 },
  { kind: "skip", color: "blue" },
  { kind: "reverse", color: "green" },
  { kind: "draw2", color: "yellow" },
  { kind: "wild", color: null },
  { kind: "number", color: "blue", value: 0 },
  { kind: "wild_reverse4", color: null },
  { kind: "discard_all", color: "red" },
  { kind: "number", color: "green", value: 9 },
  { kind: "wild_roulette", color: null },
  { kind: "skip_all", color: "yellow" },
];

function Orbit() {
  const group = useRef<THREE.Group>(null);
  const cards = useMemo(() => HERO.map((c) => cardMaterials(c)), []);
  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    g.rotation.y += dt * 0.12;
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, state.pointer.y * 0.15, 3, dt);
    g.rotation.z = THREE.MathUtils.damp(g.rotation.z, -state.pointer.x * 0.1, 3, dt);
  });
  return (
    <group ref={group} rotation={[0.15, 0, 0]} position={[0, -0.2, -3.2]}>
      {cards.map((mats, i) => {
        const a = (i / cards.length) * Math.PI * 2;
        const r = 4.2;
        return (
          <Float key={i} speed={1.4} rotationIntensity={0.6} floatIntensity={0.9}>
            <mesh
              geometry={cardGeometry()}
              material={mats}
              position={[Math.cos(a) * r, Math.sin(i * 1.7) * 0.6, Math.sin(a) * r]}
              rotation={[0, -a + Math.PI / 2, (i % 2 ? 1 : -1) * 0.18]}
              scale={1.25}
            />
          </Float>
        );
      })}
    </group>
  );
}

/** Landing backdrop: bright cards orbiting on the red stage. No post-processing (see GameCanvas). */
export default function HeroCanvas() {
  useEffect(() => refreshTexturesWhenFontsReady(), []);
  return (
    <Canvas
      className="!fixed inset-0"
      dpr={[1, IS_TOUCH ? 1.75 : 2]}
      camera={{ position: [0, 1.2, 8.5], fov: 42, near: 0.5, far: 60 }}
      gl={{ antialias: true, stencil: false, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.1 }}
      resize={{ debounce: { scroll: 50, resize: 180 } }}
    >
      <color attach="background" args={[STAGE.backdrop]} />
      <fog attach="fog" args={[STAGE.backdrop, 9, 19]} />
      <hemisphereLight args={["#fff6e6", "#ffb39a", 1.55]} />
      <directionalLight position={[2, 6, 6]} intensity={1.8} color="#fff2dc" />
      <Orbit />
    </Canvas>
  );
}
