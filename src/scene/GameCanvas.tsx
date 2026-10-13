"use client";

import { Environment, Lightformer, PerformanceMonitor, Sparkles } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { useGame } from "@/client/store/game-store";
import { effectiveTier, useUi } from "@/ui/uiStore";
import { installDirector } from "./anim/director";
import { refreshTexturesWhenFontsReady } from "./cards/cardTextures";
import { CardActors } from "./cards/CardActors";
import { CameraRig } from "./CameraRig";
import { Confetti, Pulses } from "./fx/Fx";
import { computeSeats, tableDims } from "./layout/layout";
import { actorTransforms, sceneRef } from "./sceneStore";
import { Table } from "./Table";
import { Backs } from "./zones/Backs";
import { DeckTarget } from "./zones/DeckTarget";
import { Ghosts } from "./zones/Ghosts";
import { SeatProjector } from "./zones/SeatChips";

function World() {
  const size = useThree((s) => s.size);
  const aspect = size.width / Math.max(1, size.height);
  const d = useMemo(() => tableDims(aspect), [aspect]);
  const players = useGame((s) => s.pub?.players);
  const you = useGame((s) => s.you);
  const tier = useUi(effectiveTier);
  const seats = useMemo(() => computeSeats(players ?? [], you, d), [players, you, d]);
  // layout is read every frame by the animation code
  useLayoutEffect(() => {
    sceneRef.dims = d;
    sceneRef.seats = seats;
    sceneRef.you = you;
  }, [d, seats, you]);

  return (
    <>
      <color attach="background" args={["#07070c"]} />
      <fog attach="fog" args={["#07070c", 16, 42]} />
      <CameraRig d={d} />
      <ambientLight intensity={0.35} color="#9a96ff" />
      <directionalLight
        position={[2, 9, 5]}
        intensity={1.6}
        castShadow={tier !== "low"}
        shadow-mapSize={[tier === "high" ? 2048 : 1024, tier === "high" ? 2048 : 1024]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0004}
      />
      <pointLight position={[-7, 2.5, 0]} intensity={18} distance={16} color="#ff3b8d" />
      <pointLight position={[7, 2.5, 0]} intensity={18} distance={16} color="#3b9eff" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 6, -6]} scale={[12, 3, 1]} color="#b9a8ff" />
        <Lightformer form="rect" intensity={1.4} position={[-7, 3, 2]} rotation-y={Math.PI / 2} scale={[8, 2, 1]} color="#ff5c9d" />
        <Lightformer form="rect" intensity={1.4} position={[7, 3, 2]} rotation-y={-Math.PI / 2} scale={[8, 2, 1]} color="#5cb0ff" />
        <Lightformer form="ring" intensity={1.2} position={[0, 8, 3]} scale={4} color="#ffffff" />
      </Environment>

      <Table d={d} reflect={tier === "high"} />
      <Backs />
      <DeckTarget />
      <CardActors />
      <Ghosts />
      <Pulses />
      <Confetti />
      <SeatProjector />
      {tier !== "low" && <Sparkles count={tier === "high" ? 70 : 35} scale={[d.rx * 3, 3.5, d.rz * 3]} position={[0, 1.6, 0]} size={2.2} speed={0.25} opacity={0.55} color="#9d8cff" />}

      {tier !== "low" && (
        <EffectComposer multisampling={tier === "high" ? 4 : 0} enableNormalPass={false}>
          <Bloom mipmapBlur intensity={tier === "high" ? 1.15 : 0.85} luminanceThreshold={1} luminanceSmoothing={0.2} radius={0.72} />
          <Vignette offset={0.28} darkness={0.72} />
        </EffectComposer>
      )}
    </>
  );
}

export default function GameCanvas() {
  const tier = useUi(effectiveTier);
  const setAutoTier = useUi((s) => s.setAutoTier);
  useEffect(() => {
    installDirector();
    refreshTexturesWhenFontsReady();
    if (process.env.NODE_ENV !== "production") (window as unknown as { __neono: unknown }).__neono = { sceneRef, useGame, useUi, actorTransforms };
  }, []);
  const dpr: [number, number] = tier === "high" ? [1, 2] : tier === "medium" ? [1, 1.5] : [0.75, 1];
  return (
    <Canvas
      className="!fixed inset-0"
      shadows
      dpr={dpr}
      gl={{ antialias: false, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      camera={{ position: [0, 9, 8], fov: 38 }}
    >
      <PerformanceMonitor
        onDecline={() => setAutoTier(useUi.getState().autoTier === "high" ? "medium" : "low")}
        onIncline={() => setAutoTier(useUi.getState().autoTier === "low" ? "medium" : "high")}
        flipflops={3}
      >
        <World />
      </PerformanceMonitor>
    </Canvas>
  );
}
