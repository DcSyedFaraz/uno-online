"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { cardGeometry, cardMaterials } from "../cards/cardGeometry";
import { useScene, type Ghost } from "../sceneStore";

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function GhostCard({ g }: { g: Ghost }) {
  const ref = useRef<THREE.Mesh>(null);
  const mats = useMemo(() => cardMaterials(g.face), [g.face]);
  const remove = useScene((s) => s.removeGhost);
  const arcH = useMemo(() => Math.min(1.1, g.from.distanceTo(g.to) * 0.28), [g.from, g.to]);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const t = (performance.now() - g.born - g.delay) / g.duration;
    if (t < 0) {
      m.visible = false;
      return;
    }
    if (t >= 1) {
      m.visible = false;
      remove(g.id);
      return;
    }
    m.visible = true;
    const e = ease(t);
    m.position.lerpVectors(g.from, g.to, e);
    m.position.y += Math.sin(Math.PI * e) * arcH;
    m.quaternion.slerpQuaternions(g.fromQuat, g.toQuat, e);
    m.scale.setScalar(THREE.MathUtils.lerp(g.fromScale, g.toScale, e));
  });
  return <mesh ref={ref} geometry={cardGeometry()} material={mats} visible={false} />;
}

/** Transient cards: opponents drawing, hands being swapped, reshuffles. */
export function Ghosts() {
  const ghosts = useScene((s) => s.ghosts);
  return (
    <group>
      {ghosts.map((g) => (
        <GhostCard key={g.id} g={g} />
      ))}
    </group>
  );
}
