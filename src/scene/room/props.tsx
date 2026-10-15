"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { NEON } from "@/brand";
import { blobTexture, box, cyl, decal, glow, GOLD, ico, lampPoolTexture, mat, paint, plane, rand, sphere, torus } from "./kit";

/**
 * Room furniture built from primitives, in the same toy-like style as the table.
 * Every prop stands on the floor at its local origin, front facing +z.
 */

/** Soft shadow under a prop, `w` × `d` world units. */
export function Blob({ w, d, opacity = 0.8 }: { w: number; d: number; opacity?: number }) {
  return (
    <mesh geometry={plane(1, 1)} material={decal(blobTexture(), opacity)} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} scale={[w, d, 1]} renderOrder={-1} />
  );
}

// ── lounge ──

export function FloorLamp({ shade = "#fff3cf", metal, height = 2.1 }: { shade?: string; metal?: string; height?: number }) {
  const m = metal ? mat(metal, 0.4, 0.3) : GOLD();
  return (
    <group>
      <mesh geometry={plane(1, 1)} material={decal(lampPoolTexture(), 0.9)} rotation={[-Math.PI / 2, 0, 0]} position={[0.15, 0.008, 0.2]} scale={[3.2, 3.2, 1]} renderOrder={-1} />
      <Blob w={0.9} d={0.9} />
      <mesh geometry={cyl(0.3, 0.32, 0.06)} material={m} position={[0, 0.03, 0]} />
      <mesh geometry={cyl(0.035, 0.035, height)} material={m} position={[0, height / 2, 0]} />
      <mesh geometry={cyl(0.27, 0.44, 0.52, 28)} material={glow(shade)} position={[0, height + 0.12, 0]} />
      <mesh geometry={torus(0.44, 0.025)} material={m} position={[0, height - 0.14, 0]} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

const LEAVES = ["#2fb84c", "#24a043", "#46d063"];

export function Plant({ pot = "#ffffff", leaves = LEAVES, seed = 1 }: { pot?: string; leaves?: string[]; seed?: number }) {
  const bits = useMemo(() => {
    const r = rand(seed);
    return Array.from({ length: 6 }, (_, i) => ({
      x: (r() - 0.5) * 0.42,
      z: (r() - 0.5) * 0.42,
      y: 0.75 + r() * 0.55,
      s: 0.26 + r() * 0.16,
      c: leaves[i % leaves.length],
      rot: r() * Math.PI,
    }));
  }, [seed, leaves]);
  return (
    <group>
      <Blob w={1.1} d={1.1} />
      <mesh geometry={cyl(0.34, 0.25, 0.56)} material={mat(pot, 0.5)} position={[0, 0.28, 0]} />
      <mesh geometry={cyl(0.37, 0.37, 0.08)} material={mat(pot, 0.5)} position={[0, 0.56, 0]} />
      <mesh geometry={cyl(0.31, 0.31, 0.02)} material={mat("#5a3420", 0.9)} position={[0, 0.59, 0]} />
      {bits.map((b, i) => (
        <mesh key={i} geometry={ico(1)} material={mat(b.c, 0.7, 0, true)} position={[b.x, b.y, b.z]} rotation={[b.rot, b.rot * 0.7, 0]} scale={[b.s, b.s * 1.25, b.s]} />
      ))}
    </group>
  );
}

function stripes(a: string, b: string, n = 8) {
  return paint(`stripes:${a}:${b}:${n}`, 128, 32, (ctx, w, h) => {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? b : a;
      ctx.fillRect((i * w) / n, 0, w / n + 1, h);
    }
  });
}

export function SideTable({ top = "#ffffff" }: { top?: string }) {
  const bucket = useMemo(() => new THREE.MeshStandardMaterial({ map: stripes("#f0303a", "#ffffff"), roughness: 0.6 }), []);
  return (
    <group>
      <Blob w={1.2} d={1.2} />
      <mesh geometry={cyl(0.3, 0.34, 0.05)} material={GOLD()} position={[0, 0.025, 0]} />
      <mesh geometry={cyl(0.06, 0.06, 0.6)} material={GOLD()} position={[0, 0.32, 0]} />
      <mesh geometry={cyl(0.52, 0.52, 0.07, 32)} material={mat(top, 0.45)} position={[0, 0.65, 0]} />
      {/* popcorn bucket */}
      <mesh geometry={cyl(0.18, 0.13, 0.32)} material={bucket} position={[-0.17, 0.85, 0.02]} />
      {[
        [-0.22, 1.03, 0.04],
        [-0.12, 1.04, -0.02],
        [-0.17, 1.08, 0.06],
        [-0.1, 1.02, 0.08],
        [-0.24, 1.02, -0.05],
        [-0.16, 1.1, -0.01],
      ].map((p, i) => (
        <mesh key={i} geometry={sphere(0.055, 8)} material={mat(i % 2 ? "#fff3c4" : "#ffe08a", 0.8)} position={p as [number, number, number]} />
      ))}
      {/* soda */}
      <mesh geometry={cyl(0.1, 0.08, 0.28)} material={mat(NEON.blue, 0.5)} position={[0.22, 0.83, -0.05]} />
      <mesh geometry={cyl(0.105, 0.105, 0.03)} material={mat("#ffffff", 0.5)} position={[0.22, 0.98, -0.05]} />
      <mesh geometry={cyl(0.012, 0.012, 0.22, 8)} material={mat(NEON.red, 0.5)} position={[0.25, 1.06, -0.05]} rotation={[0, 0, -0.2]} />
    </group>
  );
}

// ── casino ──

function neonSignTexture(lines: { text: string; color: string; size: number }[]) {
  const key = `neon:${lines.map((l) => l.text).join("|")}`;
  return paint(key, 512, 256, (ctx, w, h) => {
    ctx.fillStyle = "#1a0f33";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#ff4fd8";
    ctx.lineWidth = 6;
    ctx.shadowColor = "#ff4fd8";
    ctx.shadowBlur = 18;
    ctx.strokeRect(16, 16, w - 32, h - 32);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fam = getComputedStyle(document.documentElement).getPropertyValue("--font-unbounded").trim() || "Arial Black";
    lines.forEach((l, i) => {
      ctx.font = `900 ${l.size}px ${fam}, "Arial Black", sans-serif`;
      ctx.shadowColor = l.color;
      ctx.shadowBlur = 24;
      ctx.fillStyle = l.color;
      const y = h / 2 + (i - (lines.length - 1) / 2) * (h * 0.36);
      ctx.fillText(l.text, w / 2, y);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.55;
      ctx.fillText(l.text, w / 2, y);
      ctx.globalAlpha = 1;
    });
  });
}

export function NeonSign({ lines }: { lines: { text: string; color: string; size: number }[] }) {
  const face = useMemo(() => new THREE.MeshBasicMaterial({ map: neonSignTexture(lines) }), [lines]);
  return (
    <group>
      <Blob w={2.2} d={0.7} />
      {[-0.85, 0.85].map((x) => (
        <group key={x}>
          <mesh geometry={cyl(0.18, 0.2, 0.05)} material={GOLD()} position={[x, 0.025, 0]} />
          <mesh geometry={cyl(0.03, 0.03, 1.4)} material={GOLD()} position={[x, 0.7, 0]} />
        </group>
      ))}
      <mesh geometry={box(2.1, 1.1, 0.1, 0.04)} material={mat("#24124a", 0.5)} position={[0, 1.75, 0]} />
      <mesh geometry={plane(1.96, 0.96)} material={face} position={[0, 1.75, 0.052]} />
    </group>
  );
}

export function BarStool({ seat = "#e0243a" }: { seat?: string }) {
  return (
    <group>
      <Blob w={0.8} d={0.8} />
      <mesh geometry={cyl(0.26, 0.3, 0.05)} material={GOLD()} position={[0, 0.025, 0]} />
      <mesh geometry={cyl(0.045, 0.045, 0.9)} material={GOLD()} position={[0, 0.48, 0]} />
      <mesh geometry={torus(0.22, 0.02)} material={GOLD()} position={[0, 0.38, 0]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh geometry={cyl(0.3, 0.27, 0.1)} material={GOLD()} position={[0, 0.95, 0]} />
      <mesh geometry={cyl(0.32, 0.32, 0.14, 28)} material={mat(seat, 0.85)} position={[0, 1.06, 0]} />
    </group>
  );
}

function reelsTexture() {
  return paint("reels", 256, 128, (ctx, w, h) => {
    ctx.fillStyle = "#1a0f33";
    ctx.fillRect(0, 0, w, h);
    const cols = [NEON.red, NEON.yellow, NEON.green];
    for (let i = 0; i < 3; i++) {
      const x = 12 + i * ((w - 24) / 3);
      const cw = (w - 24) / 3 - 8;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(x, 14, cw, h - 28, 10);
      ctx.fill();
      ctx.fillStyle = cols[i];
      ctx.font = `900 ${h * 0.55}px "Arial Black", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("7", x + cw / 2, h / 2 + 4);
    }
  });
}

export function SlotMachine({ body = "#e0243a" }: { body?: string }) {
  const screen = useMemo(() => new THREE.MeshBasicMaterial({ map: reelsTexture() }), []);
  return (
    <group>
      <Blob w={1.3} d={1.1} />
      <mesh geometry={box(1.0, 1.55, 0.78, 0.08)} material={mat(body, 0.45)} position={[0, 0.78, 0]} />
      <mesh geometry={box(1.06, 0.12, 0.84, 0.04)} material={GOLD()} position={[0, 0.06, 0]} />
      <mesh geometry={box(1.06, 0.26, 0.84, 0.08)} material={GOLD()} position={[0, 1.66, 0]} />
      <mesh geometry={sphere(0.13)} material={glow(NEON.yellow)} position={[0, 1.88, 0]} />
      <mesh geometry={box(0.84, 0.48, 0.06, 0.03)} material={GOLD()} position={[0, 1.12, 0.39]} />
      <mesh geometry={plane(0.74, 0.38)} material={screen} position={[0, 1.12, 0.425]} />
      <mesh geometry={box(0.84, 0.2, 0.3, 0.05)} material={GOLD()} position={[0, 0.72, 0.42]} />
      {/* lever */}
      <mesh geometry={cyl(0.03, 0.03, 0.62)} material={GOLD()} position={[0.58, 1.3, 0]} />
      <mesh geometry={sphere(0.09)} material={mat(NEON.red, 0.4)} position={[0.58, 1.64, 0]} />
    </group>
  );
}

export function Stanchions({ rope = "#c8102e", span = 1.8 }: { rope?: string; span?: number }) {
  const ropeGeom = useMemo(() => {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-span / 2, 0.88, 0), new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(span / 2, 0.88, 0));
    return new THREE.TubeGeometry(curve, 24, 0.045, 8, false);
  }, [span]);
  return (
    <group>
      {[-span / 2, span / 2].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <Blob w={0.6} d={0.6} />
          <mesh geometry={cyl(0.2, 0.22, 0.05)} material={GOLD()} position={[0, 0.025, 0]} />
          <mesh geometry={cyl(0.045, 0.045, 0.9)} material={GOLD()} position={[0, 0.48, 0]} />
          <mesh geometry={sphere(0.085)} material={GOLD()} position={[0, 0.95, 0]} />
        </group>
      ))}
      <mesh geometry={ropeGeom} material={mat(rope, 0.85)} />
    </group>
  );
}

// ── living room ──

export function Sofa({ color = "#2aa6a0", pillows = ["#ffcf1a", "#ff7a59"] }: { color?: string; pillows?: string[] }) {
  const m = mat(color, 0.85);
  const wood = mat("#8a5530", 0.6);
  return (
    <group>
      <Blob w={3.2} d={1.5} />
      {[-1.15, 1.15].flatMap((x) => [-0.38, 0.38].map((z) => <mesh key={`${x}${z}`} geometry={cyl(0.05, 0.04, 0.16, 10)} material={wood} position={[x, 0.08, z]} />))}
      <mesh geometry={box(2.7, 0.36, 1.0, 0.08)} material={m} position={[0, 0.34, 0]} />
      <mesh geometry={box(1.24, 0.22, 0.86, 0.08)} material={m} position={[-0.62, 0.62, 0.06]} />
      <mesh geometry={box(1.24, 0.22, 0.86, 0.08)} material={m} position={[0.62, 0.62, 0.06]} />
      <mesh geometry={box(2.7, 0.78, 0.3, 0.1)} material={m} position={[0, 0.86, -0.38]} />
      <mesh geometry={box(0.3, 0.66, 1.0, 0.1)} material={m} position={[-1.35, 0.62, 0]} />
      <mesh geometry={box(0.3, 0.66, 1.0, 0.1)} material={m} position={[1.35, 0.62, 0]} />
      <mesh geometry={box(0.5, 0.44, 0.16, 0.08)} material={mat(pillows[0], 0.85)} position={[-0.85, 0.9, -0.16]} rotation={[-0.2, 0.25, 0.1]} />
      <mesh geometry={box(0.5, 0.44, 0.16, 0.08)} material={mat(pillows[1], 0.85)} position={[0.85, 0.9, -0.16]} rotation={[-0.2, -0.25, -0.1]} />
    </group>
  );
}

const BOOK_COLORS = [NEON.red, NEON.yellow, NEON.green, NEON.blue, NEON.wild, "#ff7a59", "#2aa6a0", "#ffffff"];

export function Bookshelf({ wood = "#a5683a" }: { wood?: string }) {
  const m = mat(wood, 0.65);
  const books = useMemo(() => {
    const r = rand(7);
    const out: { x: number; y: number; w: number; h: number; c: string; lean: number }[] = [];
    for (let shelf = 0; shelf < 4; shelf++) {
      let x = -0.62;
      while (x < 0.5) {
        const w = 0.07 + r() * 0.07;
        const h = 0.28 + r() * 0.14;
        if (r() < 0.12) {
          x += 0.12;
          continue;
        }
        out.push({ x: x + w / 2, y: 0.12 + shelf * 0.5 + h / 2, w, h, c: BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)], lean: r() < 0.1 ? 0.25 : 0 });
        x += w + 0.01;
      }
    }
    return out;
  }, []);
  return (
    <group>
      <Blob w={1.8} d={0.8} />
      <mesh geometry={box(1.5, 2.1, 0.06, 0.02)} material={mat("#7d4a26", 0.7)} position={[0, 1.05, -0.2]} />
      <mesh geometry={box(0.08, 2.1, 0.46, 0.02)} material={m} position={[-0.71, 1.05, 0]} />
      <mesh geometry={box(0.08, 2.1, 0.46, 0.02)} material={m} position={[0.71, 1.05, 0]} />
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} geometry={box(1.46, 0.06, 0.46, 0.02)} material={m} position={[0, 0.06 + i * 0.5, 0]} />
      ))}
      {books.map((b, i) => (
        <mesh key={i} geometry={box(b.w, b.h, 0.32, 0.015)} material={mat(b.c, 0.6)} position={[b.x, b.y, 0.02]} rotation={[0, 0, b.lean]} />
      ))}
    </group>
  );
}

export function CoffeeTable({ wood = "#b97a45" }: { wood?: string }) {
  const m = mat(wood, 0.55);
  return (
    <group>
      <Blob w={1.8} d={1.1} />
      {[-0.6, 0.6].flatMap((x) => [-0.3, 0.3].map((z) => <mesh key={`${x}${z}`} geometry={box(0.08, 0.42, 0.08, 0.02)} material={m} position={[x, 0.21, z]} />))}
      <mesh geometry={box(1.5, 0.08, 0.84, 0.03)} material={m} position={[0, 0.46, 0]} />
      {[
        { x: -0.35, c: "#ffffff" },
        { x: 0.1, c: "#2aa6a0" },
      ].map((mug) => (
        <group key={mug.x} position={[mug.x, 0.57, 0.08]}>
          <mesh geometry={cyl(0.08, 0.07, 0.14)} material={mat(mug.c, 0.4)} />
          <mesh geometry={torus(0.045, 0.014)} material={mat(mug.c, 0.4)} position={[0.09, 0, 0]} />
        </group>
      ))}
      <mesh geometry={box(0.42, 0.05, 0.3, 0.01)} material={mat(NEON.yellow, 0.6)} position={[0.45, 0.525, -0.12]} rotation={[0, 0.3, 0]} />
      <mesh geometry={box(0.38, 0.04, 0.28, 0.01)} material={mat(NEON.blue, 0.6)} position={[0.45, 0.57, -0.12]} rotation={[0, 0.1, 0]} />
    </group>
  );
}
