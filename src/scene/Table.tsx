"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { BRAND } from "@/brand";
import { useGame } from "@/client/store/game-store";
import { COLOR_HEX, sceneRef } from "./sceneStore";
import type { TableDims } from "./layout/layout";

/** The red "stage" around the table. The floor is unlit, so this is exactly what the fog fades to. */
export const STAGE = {
  backdrop: "#a3121c",
  dots: "#b8202a",
} as const;

function ellipseShape(rx: number, rz: number) {
  const s = new THREE.Shape();
  s.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
  return s;
}

function displayFont(size: number) {
  const fam = getComputedStyle(document.documentElement).getPropertyValue("--font-unbounded").trim() || "Arial Black";
  return `900 ${size}px ${fam}, "Arial Black", sans-serif`;
}

/** Bright red-orange felt with a glowing center burst and the logo pressed into it. */
function feltTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 752;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const cx = w / 2;
  const cy = h * 0.48;

  const g = ctx.createRadialGradient(cx, cy, 30, cx, cy, w * 0.6);
  g.addColorStop(0, "#ffc94a");
  g.addColorStop(0.28, "#ff8a2a");
  g.addColorStop(0.62, "#f5462c");
  g.addColorStop(1, "#d42029");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // sunburst rays
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "#fff6d0";
  ctx.globalAlpha = 0.07;
  const rays = 28;
  for (let i = 0; i < rays; i += 2) {
    const a0 = (i / rays) * Math.PI * 2;
    const a1 = ((i + 1) / rays) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, w, a0, a1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // glowing ring around the center
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, h / w / 0.74);
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = "#ffe9a0";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(0, 0, w * 0.33, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // embossed logo: a dark offset under a light fill
  ctx.font = displayFont(150);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#7a0710";
  ctx.fillText(BRAND.name, cx + 4, cy + 8);
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = "#fff4d6";
  ctx.fillText(BRAND.name, cx, cy);

  // darker edge so the felt meets the rim
  ctx.globalAlpha = 1;
  const edge = ctx.createRadialGradient(cx, h / 2, w * 0.36, cx, h / 2, w * 0.56);
  edge.addColorStop(0, "rgba(120,0,10,0)");
  edge.addColorStop(1, "rgba(120,0,10,0.32)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w, h);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Halftone dots for the stage floor (repeats). */
function floorTexture(): THREE.CanvasTexture {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = STAGE.backdrop;
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = STAGE.dots;
  for (const [x, y] of [
    [s / 4, s / 4],
    [(s * 3) / 4, (s * 3) / 4],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, s * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60);
  t.anisotropy = 4;
  return t;
}

/** Soft warm light pool and contact shadow around the table, painted on the floor. */
function poolTexture(): THREE.CanvasTexture {
  const s = 512;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(60,0,6,0.55)");
  g.addColorStop(0.42, "rgba(60,0,6,0.35)");
  g.addColorStop(0.5, "rgba(255,150,60,0.28)");
  g.addColorStop(0.75, "rgba(255,120,50,0.1)");
  g.addColorStop(1, "rgba(255,120,50,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Gold bumper plus a band on the felt that takes the active color. */
function Rim({ d }: { d: TableDims }) {
  const band = useRef<THREE.MeshBasicMaterial>(null);
  const color = useGame((s) => s.pub?.currentColor ?? null);
  const target = useMemo(() => new THREE.Color(), []);
  const bumper = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * (d.rx + 0.02), 0.06, Math.sin(a) * (d.rz + 0.02)));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 256, 0.11, 12, true);
  }, [d.rx, d.rz]);
  const bandGeom = useMemo(() => {
    const outer = ellipseShape(d.rx * 0.975, d.rz * 0.975);
    const hole = new THREE.Path();
    hole.absellipse(0, 0, d.rx * 0.975 - 0.1, d.rz * 0.975 - 0.1, 0, Math.PI * 2, true, 0);
    outer.holes.push(hole);
    return new THREE.ShapeGeometry(outer, 96);
  }, [d.rx, d.rz]);
  useFrame((_, dt) => {
    if (!band.current) return;
    target.set(color ? COLOR_HEX[color] : "#ffd25a");
    band.current.color.lerp(target, 1 - Math.exp(-dt * 3));
  });
  return (
    <>
      <mesh geometry={bumper} castShadow receiveShadow>
        <meshStandardMaterial color="#ffc22e" roughness={0.38} metalness={0.08} />
      </mesh>
      <mesh geometry={bandGeom} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <meshBasicMaterial ref={band} color="#ffd25a" />
      </mesh>
    </>
  );
}

/**
 * A clean ring around the piles with three arrowheads gliding along it in the direction of
 * play, filled with the active color. (The ring itself stays put; only the arrows move.)
 */
function DirectionRing({ d }: { d: TableDims }) {
  const arrows = useRef<(THREE.Group | null)[]>([]);
  const direction = useGame((s) => s.pub?.direction ?? 1);
  const playing = useGame((s) => s.pub?.phase === "playing");
  const color = useGame((s) => s.pub?.currentColor ?? null);
  const target = useMemo(() => new THREE.Color(), []);
  const speed = useRef(0.35);
  const phase = useRef(0);
  const a = 2.45;
  const b = 1.6;
  // one material per layer, so a single lerp recolors every arrow
  const fill = useMemo(() => new THREE.MeshBasicMaterial({ color: COLOR_HEX.wild }), []);
  const outline = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff" }), []);
  const ring = useMemo(() => {
    const outer = new THREE.Shape();
    outer.absellipse(0, 0, a + 0.05, b + 0.05, 0, Math.PI * 2, false, 0);
    const hole = new THREE.Path();
    hole.absellipse(0, 0, a - 0.05, b - 0.05, 0, Math.PI * 2, true, 0);
    outer.holes.push(hole);
    return new THREE.ShapeGeometry(outer, 96);
  }, []);
  const head = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0.2, 0);
    shape.lineTo(-0.16, 0.2);
    shape.lineTo(-0.08, 0);
    shape.lineTo(-0.16, -0.2);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, []);
  useFrame((_, dt) => {
    const sinceReverse = performance.now() - sceneRef.reverseAt;
    const boost = sinceReverse > 0 && sinceReverse < 900 ? 4 * (1 - sinceReverse / 900) : 0;
    speed.current = THREE.MathUtils.damp(speed.current, (0.35 + boost) * direction, 6, dt);
    phase.current += speed.current * dt;
    target.set(color ? COLOR_HEX[color] : COLOR_HEX.wild);
    fill.color.lerp(target, 1 - Math.exp(-dt * 3));
    arrows.current.forEach((g, i) => {
      if (!g) return;
      const th = phase.current + (i * Math.PI * 2) / 3;
      g.position.set(Math.cos(th) * a, 0.004, Math.sin(th) * b);
      // point along the ellipse in the direction of play (direction 1 is clockwise on screen)
      const tx = -Math.sin(th) * a * direction;
      const tz = Math.cos(th) * b * direction;
      g.rotation.set(-Math.PI / 2, 0, Math.atan2(-tz, tx));
    });
  });
  return (
    <group position={[0, 0.016, (d.deck.z + d.discard.z) / 2]} visible={playing}>
      <mesh geometry={ring} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
        <meshBasicMaterial color="#ffffff" transparent opacity={0.45} depthWrite={false} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <group key={i} ref={(el) => void (arrows.current[i] = el)}>
          <mesh geometry={head} material={outline} scale={1.35} position={[-0.03, 0, 0]} />
          <mesh geometry={head} material={fill} position={[0, 0, 0.003]} />
        </group>
      ))}
    </group>
  );
}

export function Table({ d }: { d: TableDims }) {
  const shape = useMemo(() => ellipseShape(d.rx, d.rz), [d.rx, d.rz]);
  const felt = useMemo(() => (typeof document === "undefined" ? null : feltTexture()), []);
  const floor = useMemo(() => (typeof document === "undefined" ? null : floorTexture()), []);
  const pool = useMemo(() => (typeof document === "undefined" ? null : poolTexture()), []);
  const feltGeom = useMemo(() => {
    const g = new THREE.ShapeGeometry(ellipseShape(d.rx * 0.985, d.rz * 0.985), 96);
    const pos = g.getAttribute("position");
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) / (d.rx * 2) + 0.5;
      uv[i * 2 + 1] = pos.getY(i) / (d.rz * 2) + 0.5;
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return g;
  }, [d.rx, d.rz]);

  return (
    <group>
      {/* floor: unlit so it matches the fog and background exactly */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.72, 0]}>
        <planeGeometry args={[120, 120]} />
        <meshBasicMaterial map={floor ?? undefined} color="#ffffff" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.7, 0]}>
        <planeGeometry args={[d.rx * 3.6, d.rz * 3.6]} />
        <meshBasicMaterial map={pool ?? undefined} transparent depthWrite={false} />
      </mesh>
      {/* table body */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.066, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[shape, { depth: 0.55, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.06, bevelSegments: 4, curveSegments: 96 }]} />
        <meshStandardMaterial color="#9c1019" roughness={0.45} metalness={0.05} />
      </mesh>
      {/* felt */}
      <mesh geometry={feltGeom} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow>
        <meshStandardMaterial map={felt ?? undefined} roughness={0.95} metalness={0} />
      </mesh>
      <Rim d={d} />
      <DirectionRing d={d} />
    </group>
  );
}
