"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { IS_TOUCH } from "@/client/device";
import { useGame } from "@/client/store/game-store";
import { effectiveTier, useUi } from "@/ui/uiStore";
import { installDirector } from "./anim/director";
import { refreshTexturesWhenFontsReady } from "./cards/cardTextures";
import { CardActors } from "./cards/CardActors";
import { CameraRig } from "./CameraRig";
import { Confetti, Pulses } from "./fx/Fx";
import { cameraFov, computeSeats, handTopPx, tableDims } from "./layout/layout";
import { Room } from "./room/Room";
import { actorTransforms, sceneRef, seatScreen, useScene } from "./sceneStore";
import { STAGE, Table } from "./Table";
import { Backs } from "./zones/Backs";
import { DeckTarget } from "./zones/DeckTarget";
import { Ghosts } from "./zones/Ghosts";
import { SeatAvatars } from "./zones/SeatAvatars";
import { SeatProjector } from "./zones/SeatChips";
import { TurnBaton, TurnMarker } from "./zones/TurnMarker";

type Tier = "high" | "medium" | "low";

/**
 * Pixel ratio per tier. It only changes when the tier does, never on its own.
 * Phones start at medium: a 2× canvas keeps cards crisp next to the HUD on 3× screens.
 */
function tierDpr(tier: Tier): [number, number] {
  if (tier === "high") return [1, IS_TOUCH ? 2.5 : 2];
  if (tier === "medium") return [1, 2];
  return [0.75, 1];
}

/** A soft light from the camera, so cards facing you (your hand, the propped-up top card) are lit evenly. */
function FrontFill() {
  const light = useRef<THREE.DirectionalLight>(null);
  useFrame(({ camera }) => {
    light.current?.position.copy(camera.position);
  });
  return <directionalLight ref={light} intensity={0.85} color="#ffffff" />;
}

function World() {
  const size = useThree((s) => s.size);
  const scene = useThree((s) => s.scene);
  // dev debug handle: the live three.js scene
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      const w = window as unknown as { __neono?: object };
      w.__neono = { ...w.__neono, scene };
    }
  }, [scene]);
  const aspect = size.width / Math.max(1, size.height);
  const compact = size.height < 520;
  const d = useMemo(() => tableDims(aspect, compact), [aspect, compact]);
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
  // the HUD sits just above the hand; tell it where that is
  useLayoutEffect(() => {
    const top = handTopPx({ aspect, fovDeg: cameraFov(d.portrait), portrait: d.portrait, compact: d.compact }, size.height);
    document.documentElement.style.setProperty("--hand-top", `${Math.round(top)}px`);
  }, [aspect, d, size.height]);

  const shadowSize = tier === "high" && !IS_TOUCH ? 2048 : 1024;
  return (
    <>
      <color attach="background" args={[STAGE.backdrop]} />
      <fog attach="fog" args={[STAGE.backdrop, 16, 42]} />
      <CameraRig d={d} />
      <hemisphereLight args={["#fff6e6", "#ffb39a", 1.45]} />
      <ambientLight intensity={0.3} />
      <FrontFill />
      <directionalLight
        key={shadowSize}
        position={[2, 9, 5]}
        intensity={2.2}
        color="#fff2dc"
        castShadow={tier !== "low"}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={3}
      />

      <Room d={d} seats={seats} />
      <Table d={d} />
      <TurnMarker />
      <TurnBaton />
      <Backs />
      <DeckTarget />
      <CardActors />
      <Ghosts />
      <Pulses />
      <Confetti />
      <SeatAvatars />
      <SeatProjector />
    </>
  );
}

/**
 * No post-processing on purpose: the bloom/SMAA composer's half-float buffers flashed the
 * whole screen on phones. The renderer's own MSAA is cheap on mobile GPUs and never rebuilds.
 */
export default function GameCanvas({ paused = false }: { paused?: boolean }) {
  const tier = useUi(effectiveTier);
  const stepDown = useUi((s) => s.stepDownAutoTier);
  useEffect(() => {
    installDirector();
    refreshTexturesWhenFontsReady();
    if (process.env.NODE_ENV !== "production") {
      const w = window as unknown as { __neono?: object };
      w.__neono = { ...w.__neono, sceneRef, useGame, useUi, useScene, actorTransforms, seatScreen };
    }
  }, []);
  return (
    <Canvas
      className="!fixed inset-0"
      shadows="percentage"
      dpr={tierDpr(tier)}
      frameloop={paused ? "never" : "always"}
      gl={{ antialias: true, stencil: false, powerPreference: "high-performance", toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.1 }}
      camera={{ position: [0, 9, 8], fov: 38, near: 1.2, far: 120 }}
      // the mobile address bar slides in and out; don't reallocate buffers on every pixel of it
      resize={{ debounce: { scroll: 50, resize: 180 } }}
    >
      {/* auto quality only ever steps down: every change resizes the canvas */}
      <PerformanceMonitor onDecline={() => useUi.getState().quality === "auto" && stepDown()}>
        <World />
      </PerformanceMonitor>
    </Canvas>
  );
}
