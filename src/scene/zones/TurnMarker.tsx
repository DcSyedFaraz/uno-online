"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { playSfx } from "@/audio/sound";
import { useGame } from "@/client/store/game-store";
import { ellipsePoint } from "../layout/layout";
import { sceneRef, useScene } from "../sceneStore";

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

const BATON_MS = 480;
const TRAIL = 7;
const TAU = Math.PI * 2;
const mod = (a: number) => ((a % TAU) + TAU) % TAU;
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const at = new THREE.Vector3();

/**
 * The hand-off between turns: a glowing comet runs along the table edge from the player who
 * just moved to the next one, in the direction of play, and lands with a ripple.
 */
export function TurnBaton() {
  const turnPid = useGame((s) => (s.pub?.phase === "playing" ? s.pub.turnPlayerId : null));
  const direction = useGame((s) => s.pub?.direction ?? 1);
  const group = useRef<THREE.Group>(null);
  const prev = useRef<string | null>(null);
  const run = useRef<{ a0: number; delta: number; start: number; to: string; landed: boolean } | null>(null);
  const head = useMemo(() => new THREE.MeshBasicMaterial({ color: "#fff3a8", transparent: true, depthWrite: false }), []);
  const tail = useMemo(
    () => Array.from({ length: TRAIL }, (_, i) => new THREE.MeshBasicMaterial({ color: "#ffcf1a", transparent: true, opacity: 0.75 * (1 - i / TRAIL), depthWrite: false })),
    [],
  );

  useEffect(() => {
    const from = prev.current;
    prev.current = turnPid;
    if (!from || !turnPid || from === turnPid) return;
    const a = sceneRef.seats.get(from);
    const b = sceneRef.seats.get(turnPid);
    if (!a || !b) return;
    // direction 1 runs clockwise on screen (increasing angle): the next player is on your left
    const delta = direction > 0 ? mod(b.angle - a.angle) : -mod(a.angle - b.angle);
    if (Math.abs(delta) < 0.05) return;
    run.current = { a0: a.angle, delta, start: performance.now(), to: turnPid, landed: false };
    playSfx("baton");
  }, [turnPid, direction]);

  useFrame(() => {
    const g = group.current;
    const r = run.current;
    if (!g) return;
    if (!r) {
      g.visible = false;
      return;
    }
    const p = (performance.now() - r.start) / BATON_MS;
    if (p >= 1 && !r.landed) {
      r.landed = true;
      const seat = sceneRef.seats.get(r.to);
      if (seat) useScene.getState().addPulse("shockwave", seat.fan.clone().setY(0.03), "#ffcf1a");
    }
    if (p > 1.35) {
      run.current = null;
      g.visible = false;
      return;
    }
    g.visible = true;
    g.children.forEach((m, i) => {
      // the head leads, the trail follows a little behind and fades out after landing
      const q = Math.min(1, Math.max(0, p - i * 0.045));
      ellipsePoint(sceneRef.dims, r.a0 + r.delta * ease(q), 0.9, 0.09, at);
      m.position.copy(at);
      m.visible = p - i * 0.045 > 0 && p - i * 0.045 < 1.3;
    });
  });

  return (
    <group ref={group} visible={false} renderOrder={1}>
      <mesh material={head} scale={1}>
        <sphereGeometry args={[0.16, 16, 12]} />
      </mesh>
      {tail.map((m, i) => (
        <mesh key={i} material={m} scale={1 - (i + 1) / (TRAIL + 2)}>
          <sphereGeometry args={[0.14, 12, 8]} />
        </mesh>
      ))}
    </group>
  );
}
