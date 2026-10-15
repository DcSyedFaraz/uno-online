"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGame } from "@/client/store/game-store";
import { ellipsePoint, type Seat, type TableDims } from "../layout/layout";
import { box, cyl, FLOOR_Y, GOLD, mat, sphere } from "./kit";
import { Blob } from "./props";

export type ChairStyle = "lounge" | "casino" | "wood";

export interface ChairSpec {
  style: ChairStyle;
  /** seat and back upholstery (the cushion on wooden chairs) */
  fabric: string;
  /** frame / legs */
  frame: string;
  /** upholstery color while it's this player's turn */
  active: string;
}

/** How far out from the table edge the chairs stand (1 = the rim). */
const CHAIR_K = 1.4;
/** Chair width at full scale; chairs shrink when seats are closer than this allows. */
const CHAIR_SPAN = 1.45;

function LoungeChair({ fabric, frame }: { fabric: THREE.Material; frame: THREE.Material }) {
  return (
    <group>
      <Blob w={1.4} d={1.25} />
      {[-0.4, 0.4].flatMap((x) => [-0.32, 0.32].map((z) => <mesh key={`${x}${z}`} geometry={cyl(0.035, 0.03, 0.44, 10)} material={frame} position={[x, 0.22, z]} />))}
      <mesh geometry={box(1.0, 0.18, 0.86, 0.07)} material={fabric} position={[0, 0.52, 0]} />
      <mesh geometry={box(1.02, 0.05, 0.06, 0.02)} material={frame} position={[0, 0.44, 0.42]} />
      <group position={[0, 0.6, -0.38]} rotation={[-0.12, 0, 0]}>
        <mesh geometry={box(1.0, 0.92, 0.18, 0.08)} material={fabric} position={[0, 0.44, 0]} />
        <mesh geometry={box(1.04, 0.07, 0.22, 0.03)} material={frame} position={[0, 0.92, 0]} />
      </group>
    </group>
  );
}

const BUTTONS: [number, number][] = [
  [-0.3, 0.25],
  [0, 0.25],
  [0.3, 0.25],
  [-0.3, 0.6],
  [0, 0.6],
  [0.3, 0.6],
];

function CasinoChair({ fabric, frame }: { fabric: THREE.Material; frame: THREE.Material }) {
  return (
    <group>
      <Blob w={1.6} d={1.35} />
      {[-0.5, 0.5].flatMap((x) => [-0.36, 0.36].map((z) => <mesh key={`${x}${z}`} geometry={cyl(0.05, 0.035, 0.28, 10)} material={frame} position={[x, 0.14, z]} />))}
      <mesh geometry={box(1.24, 0.3, 0.96, 0.08)} material={fabric} position={[0, 0.43, 0]} />
      <mesh geometry={box(0.92, 0.14, 0.8, 0.06)} material={fabric} position={[0, 0.63, 0.06]} />
      <mesh geometry={box(0.2, 0.44, 0.96, 0.08)} material={fabric} position={[-0.6, 0.72, 0]} />
      <mesh geometry={box(0.2, 0.44, 0.96, 0.08)} material={fabric} position={[0.6, 0.72, 0]} />
      <group position={[0, 0.58, -0.38]} rotation={[-0.1, 0, 0]}>
        <mesh geometry={box(1.24, 1.05, 0.24, 0.1)} material={fabric} position={[0, 0.52, 0]} />
        <mesh geometry={box(1.28, 0.08, 0.28, 0.04)} material={frame} position={[0, 1.06, 0]} />
        {BUTTONS.map(([x, y]) => (
          <mesh key={`${x}${y}`} geometry={sphere(0.035, 8)} material={frame} position={[x, y + 0.08, 0.12]} />
        ))}
      </group>
    </group>
  );
}

function WoodChair({ fabric, frame }: { fabric: THREE.Material; frame: THREE.Material }) {
  return (
    <group>
      <Blob w={1.3} d={1.2} />
      {[-0.38, 0.38].flatMap((x) => [-0.32, 0.32].map((z) => <mesh key={`${x}${z}`} geometry={box(0.08, 0.5, 0.08, 0.02)} material={frame} position={[x, 0.25, z]} />))}
      <mesh geometry={box(0.92, 0.08, 0.82, 0.02)} material={frame} position={[0, 0.54, 0]} />
      <mesh geometry={box(0.84, 0.1, 0.74, 0.05)} material={fabric} position={[0, 0.63, 0.02]} />
      {[-0.38, 0.38].map((x) => (
        <mesh key={x} geometry={box(0.08, 0.95, 0.08, 0.02)} material={frame} position={[x, 1.02, -0.34]} />
      ))}
      <mesh geometry={box(0.92, 0.16, 0.09, 0.03)} material={frame} position={[0, 1.44, -0.34]} />
      {[-0.18, 0, 0.18].map((x) => (
        <mesh key={x} geometry={box(0.08, 0.62, 0.05, 0.02)} material={frame} position={[x, 1.05, -0.34]} />
      ))}
    </group>
  );
}

const STYLES = { lounge: LoungeChair, casino: CasinoChair, wood: WoodChair } as const;

interface ChairProps {
  spec: ChairSpec;
  pos: THREE.Vector3;
  yaw: number;
  scale: number;
  active: boolean;
}

/** One chair that glides to its spot when seats change and lights up on its player's turn. */
function Chair({ spec, pos, yaw, scale, active }: ChairProps) {
  const group = useRef<THREE.Group>(null);
  const placed = useRef(false);
  // each chair owns its upholstery so it can light up on its own
  const fabric = useMemo(() => mat(spec.fabric, spec.style === "casino" ? 0.9 : 0.8).clone(), [spec.fabric, spec.style]);
  useEffect(() => () => fabric.dispose(), [fabric]);
  const frame = spec.style === "wood" ? mat(spec.frame, 0.6) : spec.frame === "gold" ? GOLD() : mat(spec.frame, 0.4, 0.3);
  const base = useMemo(() => new THREE.Color(spec.fabric), [spec.fabric]);
  const lit = useMemo(() => new THREE.Color(spec.active), [spec.active]);
  const Style = STYLES[spec.style];

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const k = placed.current ? 1 - Math.exp(-dt * 5) : 1;
    placed.current = true;
    g.position.lerp(pos, k);
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, yaw, k);
    g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x || scale, scale, k));
    fabric.color.lerp(active ? lit : base, 1 - Math.exp(-dt * 4));
  });

  return (
    <group ref={group}>
      <Style fabric={fabric} frame={frame} />
    </group>
  );
}

/** A chair behind every opponent's seat, facing the table. Yours is behind the camera. */
export function Chairs({ seats, d, spec }: { seats: Map<string, Seat>; d: TableDims; spec: ChairSpec }) {
  const turn = useGame((s) => (s.pub?.phase === "playing" ? s.pub.turnPlayerId : null));
  const placed = useMemo(() => {
    const list = [...seats.values()].filter((s) => s.rel > 0).sort((a, b) => a.angle - b.angle);
    const pts = list.map((s) => ellipsePoint(d, s.angle, CHAIR_K, FLOOR_Y));
    return list.map((s, i) => {
      const p = pts[i];
      const near = Math.min(i > 0 ? p.distanceTo(pts[i - 1]) : Infinity, i < pts.length - 1 ? p.distanceTo(pts[i + 1]) : Infinity);
      return { pid: s.pid, pos: p, yaw: Math.atan2(-p.x, -p.z), scale: THREE.MathUtils.clamp(near / CHAIR_SPAN, 0.6, 1) };
    });
  }, [seats, d]);
  return (
    <>
      {placed.map((c) => (
        <Chair key={c.pid} spec={spec} pos={c.pos} yaw={c.yaw} scale={c.scale} active={c.pid === turn} />
      ))}
    </>
  );
}
