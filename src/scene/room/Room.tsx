"use client";

import { useThree } from "@react-three/fiber";
import { useLayoutEffect } from "react";
import * as THREE from "three";
import { effectiveTier, useUi } from "@/ui/uiStore";
import type { Seat, TableDims } from "../layout/layout";
import { Chairs } from "./Chairs";
import { decal, FLOOR_Y, plane, tablePoolTexture } from "./kit";
import { BarStool, Bookshelf, CoffeeTable, FloorLamp, NeonSign, Plant, SideTable, SlotMachine, Sofa, Stanchions } from "./props";
import { NEON_LINES, THEMES, type PropSpec } from "./themes";

function Prop({ p }: { p: PropSpec }) {
  const v = p.v ?? 0;
  let el: React.ReactNode;
  switch (p.kind) {
    case "lamp":
      el = v === 1 ? <FloorLamp metal="#3b3b46" shade="#fff1d6" /> : <FloorLamp />;
      break;
    case "plant":
      el = <Plant pot={v === 3 ? "#d9693f" : "#ffffff"} seed={v} />;
      break;
    case "sideTable":
      el = <SideTable />;
      break;
    case "neon":
      el = <NeonSign lines={NEON_LINES[v % NEON_LINES.length]} />;
      break;
    case "stool":
      el = <BarStool />;
      break;
    case "slot":
      el = <SlotMachine />;
      break;
    case "rope":
      el = <Stanchions />;
      break;
    case "sofa":
      el = <Sofa />;
      break;
    case "shelf":
      el = <Bookshelf />;
      break;
    case "coffee":
      el = <CoffeeTable />;
      break;
  }
  return (
    <group position={[p.x, FLOOR_Y, p.z]} rotation={[0, p.rot ?? 0, 0]} scale={p.scale ?? 1}>
      {el}
    </group>
  );
}

/**
 * Everything around the table: floor, rug, chairs behind the opponents and a few props.
 * The theme is a per-viewer preference (Settings → Room); the low graphics tier drops the props.
 */
export function Room({ d, seats }: { d: TableDims; seats: Map<string, Seat> }) {
  const themeKey = useUi((s) => s.roomTheme);
  const tier = useUi(effectiveTier);
  const theme = THEMES[themeKey] ?? THEMES.lounge;
  const scene = useThree((s) => s.scene);

  // the floor is unlit and the fog fades it into the background, so all three share one color
  useLayoutEffect(() => {
    if (scene.background instanceof THREE.Color) scene.background.set(theme.backdrop);
    if (scene.fog) scene.fog.color.set(theme.backdrop);
  }, [scene, theme]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y - 0.02, 0]}>
        <planeGeometry args={[120, 120]} />
        <meshBasicMaterial key={themeKey} map={theme.floor()} />
      </mesh>
      <mesh geometry={plane(1, 1)} material={decal(theme.rug())} rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y - 0.004, 0]} scale={[d.rx * 3.5, d.rz * 3.7, 1]} renderOrder={-2} />
      <mesh geometry={plane(1, 1)} material={decal(tablePoolTexture())} rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y + 0.004, 0]} scale={[d.rx * 3.6, d.rz * 3.6, 1]} renderOrder={-1} />
      <Chairs seats={seats} d={d} spec={theme.chair} />
      {tier !== "low" && theme.props.map((p, i) => <Prop key={`${themeKey}${i}`} p={p} />)}
    </group>
  );
}
