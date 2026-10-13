"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useUi } from "@/ui/uiStore";
import { sceneRef } from "./sceneStore";
import type { TableDims } from "./layout/layout";

/** Frames the table above the hand, with gentle pointer parallax and impact shake. */
export function CameraRig({ d }: { d: TableDims }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const reduceMotion = useUi((s) => s.reduceMotion);
  const aspect = size.width / Math.max(1, size.height);

  const base = useMemo(() => {
    const portrait = d.portrait;
    const fov = portrait ? 50 : 38;
    const phi = THREE.MathUtils.degToRad(portrait ? 63 : 54);
    const vfov = THREE.MathUtils.degToRad(fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const dw = (d.rx * (portrait ? 1.22 : 1.16)) / Math.tan(hfov / 2);
    const dh = (d.rz * 1.18 * Math.sin(phi) + 0.6) / Math.tan(vfov * 0.32);
    const dist = Math.max(dw, dh);
    const target = new THREE.Vector3(0, 0, d.rz * (portrait ? 0.34 : 0.3));
    const pos = target.clone().add(new THREE.Vector3(0, Math.sin(phi), Math.cos(phi)).multiplyScalar(dist));
    return { fov, pos, target };
  }, [d, aspect]);

  useEffect(() => {
    camera.fov = base.fov;
    camera.near = 0.1;
    camera.far = 120;
    camera.position.copy(base.pos);
    camera.lookAt(base.target);
    camera.updateProjectionMatrix();
    sceneRef.camera = camera;
  }, [camera, base]);

  const look = useMemo(() => new THREE.Vector3(), []);
  const want = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    const par = reduceMotion ? 0 : 1;
    want.copy(base.pos);
    want.x += state.pointer.x * 0.45 * par;
    want.y += state.pointer.y * 0.25 * par;
    const k = 1 - Math.exp(-dt * 2.5);
    camera.position.lerp(want, k);
    look.copy(base.target);
    if (sceneRef.shake > 0.001 && !reduceMotion) {
      const s = sceneRef.shake * 0.12;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      sceneRef.shake *= Math.exp(-dt * 6);
    } else sceneRef.shake = 0;
    camera.lookAt(look);
    camera.updateMatrixWorld();
  }, -1);

  return null;
}
