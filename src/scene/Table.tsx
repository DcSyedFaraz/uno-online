"use client";

import { MeshReflectorMaterial } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { BRAND } from "@/brand";
import { useGame } from "@/client/store/game-store";
import { COLOR_HEX, sceneRef } from "./sceneStore";
import type { TableDims } from "./layout/layout";

function ellipseShape(rx: number, rz: number) {
  const s = new THREE.Shape();
  s.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
  return s;
}

function feltTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 640;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.62);
  g.addColorStop(0, "#1c1838");
  g.addColorStop(0.6, "#100e22");
  g.addColorStop(1, "#08070f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // fine grid
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = "#a99bff";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // logo
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = "#ffffff";
  const fam = getComputedStyle(document.documentElement).getPropertyValue("--font-unbounded").trim() || "Arial Black";
  ctx.font = `900 120px ${fam}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(BRAND.name, w / 2, h / 2 + 150);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Rim tube that glows in the active color. */
function Rim({ d }: { d: TableDims }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const color = useGame((s) => s.pub?.currentColor ?? null);
  const target = useMemo(() => new THREE.Color(), []);
  const geom = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * d.rx, 0.07, Math.sin(a) * d.rz));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 256, 0.035, 10, true);
  }, [d.rx, d.rz]);
  useFrame((_, dt) => {
    if (!mat.current) return;
    target.set(color ? COLOR_HEX[color] : COLOR_HEX.wild).multiplyScalar(2.6);
    mat.current.color.lerp(target, 1 - Math.exp(-dt * 3));
  });
  return (
    <mesh geometry={geom}>
      <meshBasicMaterial ref={mat} color="#8a5cff" toneMapped={false} />
    </mesh>
  );
}

/** Ring of chevrons around the piles showing the direction of play. */
function DirectionRing({ d }: { d: TableDims }) {
  const group = useRef<THREE.Group>(null);
  const direction = useGame((s) => s.pub?.direction ?? 1);
  const playing = useGame((s) => s.pub?.phase === "playing");
  const speed = useRef(0.25);
  const chevrons = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.08, -0.07);
    shape.lineTo(0.04, 0);
    shape.lineTo(-0.08, 0.07);
    shape.lineTo(-0.04, 0);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, []);
  const r = Math.min(d.rx, d.rz) * 0.52;
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const sinceReverse = performance.now() - sceneRef.reverseAt;
    const boost = sinceReverse > 0 && sinceReverse < 900 ? 6 * (1 - sinceReverse / 900) : 0;
    speed.current = THREE.MathUtils.damp(speed.current, (0.22 + boost) * -direction, 6, dt);
    g.rotation.y += speed.current * dt;
  });
  return (
    <group ref={group} position={[0, 0.03, (d.deck.z + d.discard.z) / 2]} visible={playing}>
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return (
          <mesh
            key={i}
            geometry={chevrons}
            position={[Math.cos(a) * r, 0, Math.sin(a) * r * 0.82]}
            rotation={[-Math.PI / 2, 0, -a + (direction === 1 ? -Math.PI / 2 : Math.PI / 2)]}
          >
            <meshBasicMaterial color="#9d8cff" transparent opacity={0.55} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

export function Table({ d, reflect }: { d: TableDims; reflect: boolean }) {
  const shape = useMemo(() => ellipseShape(d.rx, d.rz), [d.rx, d.rz]);
  const felt = useMemo(() => (typeof document === "undefined" ? null : feltTexture()), []);
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
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.72, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        {reflect ? (
          <MeshReflectorMaterial
            blur={[400, 120]}
            resolution={512}
            mixBlur={1}
            mixStrength={1.6}
            roughness={0.85}
            depthScale={1}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
            color="#06060c"
            metalness={0.6}
          />
        ) : (
          <meshStandardMaterial color="#06060c" roughness={0.9} />
        )}
      </mesh>
      {/* table body */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.066, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[shape, { depth: 0.55, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.06, bevelSegments: 4, curveSegments: 96 }]} />
        <meshPhysicalMaterial color="#121021" roughness={0.35} metalness={0.4} clearcoat={1} clearcoatRoughness={0.25} />
      </mesh>
      {/* felt */}
      <mesh geometry={feltGeom} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow>
        <meshStandardMaterial map={felt ?? undefined} roughness={0.92} metalness={0.05} />
      </mesh>
      <Rim d={d} />
      <DirectionRing d={d} />
    </group>
  );
}
