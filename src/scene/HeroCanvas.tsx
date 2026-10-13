"use client";

import { Environment, Float, Lightformer, Sparkles } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Card } from "@/engine";
import { cardGeometry, cardMaterials } from "./cards/cardGeometry";
import { refreshTexturesWhenFontsReady } from "./cards/cardTextures";

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

export default function HeroCanvas() {
  useEffect(() => refreshTexturesWhenFontsReady(), []);
  return (
    <Canvas className="!fixed inset-0" dpr={[1, 1.8]} camera={{ position: [0, 1.2, 8.5], fov: 42 }} gl={{ antialias: false, toneMapping: THREE.ACESFilmicToneMapping }}>
      <color attach="background" args={["#07070c"]} />
      <fog attach="fog" args={["#07070c", 8, 18]} />
      <ambientLight intensity={0.4} color="#9a96ff" />
      <pointLight position={[-5, 3, 3]} intensity={30} color="#ff3b8d" />
      <pointLight position={[5, 3, 3]} intensity={30} color="#3b9eff" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2} position={[0, 5, -5]} scale={[10, 3, 1]} color="#b9a8ff" />
        <Lightformer form="ring" intensity={1.4} position={[0, 4, 5]} scale={4} />
      </Environment>
      <Orbit />
      <Sparkles count={90} scale={[14, 6, 10]} size={2.4} speed={0.3} opacity={0.6} color="#a99bff" />
      <EffectComposer multisampling={4} enableNormalPass={false}>
        <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.95} radius={0.75} />
        <Vignette offset={0.25} darkness={0.75} />
      </EffectComposer>
    </Canvas>
  );
}
