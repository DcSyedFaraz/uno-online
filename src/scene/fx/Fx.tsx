"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { dotTexture } from "../cards/glow";
import { useScene, type Pulse } from "../sceneStore";

function Shockwave({ p }: { p: Pulse }) {
  const ref = useRef<THREE.Mesh>(null);
  const remove = useScene((s) => s.removePulse);
  const color = useMemo(() => new THREE.Color(p.color).multiplyScalar(2.2), [p.color]);
  const duration = p.kind === "colorburst" ? 1100 : 750;
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const t = (performance.now() - p.born - p.delay) / duration;
    if (t < 0) {
      m.visible = false;
      return;
    }
    if (t >= 1) {
      remove(p.id);
      return;
    }
    m.visible = true;
    const e = 1 - Math.pow(1 - t, 3);
    const s = p.kind === "colorburst" ? 0.4 + e * 5.5 : 0.3 + e * 2.6;
    m.scale.set(s, s, s);
    (m.material as THREE.MeshBasicMaterial).opacity = (1 - t) * (p.kind === "colorburst" ? 0.75 : 0.9);
  });
  return (
    <mesh ref={ref} position={[p.pos.x, 0.04, p.pos.z]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.42, 0.5, 64]} />
      <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </mesh>
  );
}

const BURST_N = 42;

function Burst({ p }: { p: Pulse }) {
  const ref = useRef<THREE.Points>(null);
  const remove = useScene((s) => s.removePulse);
  const { geom, vel } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(BURST_N * 3);
    const v: THREE.Vector3[] = [];
    for (let i = 0; i < BURST_N; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.6 + Math.random() * 2.2;
      const sp = 1.2 + Math.random() * 2.6;
      v.push(new THREE.Vector3(Math.cos(a) * sp, up, Math.sin(a) * sp));
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return { geom: g, vel: v };
  }, []);
  const color = useMemo(() => new THREE.Color(p.color).multiplyScalar(2.5), [p.color]);
  useFrame(() => {
    const pts = ref.current;
    if (!pts) return;
    const t = (performance.now() - p.born - p.delay) / 900;
    if (t < 0) {
      pts.visible = false;
      return;
    }
    if (t >= 1) {
      remove(p.id);
      return;
    }
    pts.visible = true;
    const arr = geom.getAttribute("position") as THREE.BufferAttribute;
    const s = t * 0.9;
    for (let i = 0; i < BURST_N; i++) {
      const v = vel[i];
      arr.setXYZ(i, p.pos.x + v.x * s, 0.1 + v.y * s - 2.6 * s * s, p.pos.z + v.z * s);
    }
    arr.needsUpdate = true;
    (pts.material as THREE.PointsMaterial).opacity = 1 - t;
  });
  return (
    <points ref={ref} geometry={geom} visible={false} frustumCulled={false}>
      <pointsMaterial
        map={dotTexture()}
        color={color}
        size={0.16}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        sizeAttenuation
      />
    </points>
  );
}

export function Pulses() {
  const pulses = useScene((s) => s.pulses);
  return (
    <group>
      {pulses.map((p) => (p.kind === "burst" ? <Burst key={p.id} p={p} /> : <Shockwave key={p.id} p={p} />))}
    </group>
  );
}

const CONFETTI_N = 260;
const CONFETTI_COLORS = ["#ff3b5c", "#ffd23f", "#2bff88", "#3b9eff", "#b56bff", "#ffffff"];

/** Falling confetti quads for round wins. */
export function Confetti() {
  const confetti = useScene((s) => s.confetti);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const state = useMemo(
    () =>
      Array.from({ length: CONFETTI_N }, () => ({
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        r: new THREE.Euler(),
        w: new THREE.Vector3(),
      })),
    [],
  );
  const born = useRef(0);
  const last = useRef<number | null>(null);
  const tmp = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    if (confetti && last.current !== confetti.id) {
      last.current = confetti.id;
      born.current = performance.now();
      const n = confetti.big ? CONFETTI_N : CONFETTI_N / 3;
      state.forEach((c, i) => {
        if (i >= n) {
          c.p.set(0, -100, 0);
          return;
        }
        c.p.set((Math.random() - 0.5) * 2, 0.4, (Math.random() - 0.5) * 1.5);
        const a = Math.random() * Math.PI * 2;
        const sp = 2 + Math.random() * 5;
        c.v.set(Math.cos(a) * sp, 5 + Math.random() * 6, Math.sin(a) * sp * 0.7);
        c.w.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      });
      state.forEach((c, i) => m.setColorAt(i, new THREE.Color(CONFETTI_COLORS[i % CONFETTI_COLORS.length])));
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    const age = (performance.now() - born.current) / 1000;
    m.visible = !!confetti && age < 5;
    if (!m.visible) return;
    const step = Math.min(dt, 0.05);
    state.forEach((c, i) => {
      c.v.y -= 9 * step;
      c.v.multiplyScalar(1 - 1.4 * step);
      c.p.addScaledVector(c.v, step);
      c.r.x += c.w.x * step;
      c.r.y += c.w.y * step;
      c.r.z += c.w.z * step;
      tmp.position.copy(c.p);
      tmp.rotation.copy(c.r);
      tmp.scale.setScalar(age > 4 ? Math.max(0, 5 - age) : 1);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, CONFETTI_N]} frustumCulled={false} visible={false}>
      <planeGeometry args={[0.09, 0.05]} />
      <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} />
    </instancedMesh>
  );
}
