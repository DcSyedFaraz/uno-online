"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { easing } from "maath";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Card, Color } from "@/engine";
import { playCard } from "@/client/actions";
import { useGame } from "@/client/store/game-store";
import { useUi, sortHand } from "@/ui/uiStore";
import { playSfx } from "@/audio/sound";
import { CARD_H, CARD_W, cardGeometry, cardMaterials } from "./cardGeometry";
import { glowTexture } from "./glow";
import { discardSlot, flatFaceDown, flatFaceUp, handSlot, PILE_SCALE, SEAT_CARD_SCALE, seatHandCenter, standingBack, type HandSlot } from "../layout/layout";
import { actorTransforms, sceneRef, spawnHints, wildColors } from "../sceneStore";

type Zone = "hand" | "discard" | "pending";

interface ActorProps {
  card: Card;
  zone: Zone;
  index: number;
  count: number;
  playable: boolean;
  selected: boolean;
  rejected: boolean;
  myTurn: boolean;
  /** color picked for a played wild (shown instead of purple) */
  tint: Color | null;
}

const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const localQuat = new THREE.Quaternion();
const euler = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
const camUp = new THREE.Vector3();
const slot: HandSlot = { pos: new THREE.Vector3(), rotZ: 0, scale: 1 };
/** warm highlight behind playable cards (normal blending: additive washes out on the bright table) */
const HALO = "#fff1a6";

function CardActor({ card, zone, index, count, playable, selected, rejected, myTurn, tint }: ActorProps) {
  const group = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const shade = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const materials = useMemo(() => cardMaterials(card, tint), [card, tint]);
  const sim = useRef({
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    scale: 1,
    startAt: 0,
    init: false,
    zone: zone as Zone,
    d0: 0,
    roll: 0,
    down: null as null | { x: number; y: number; t: number },
  });

  // where does this card enter from?
  useLayoutEffect(() => {
    const s = sim.current;
    const hint = spawnHints.get(card.id);
    spawnHints.delete(card.id);
    if (!hint) return;
    const d = sceneRef.dims;
    if (hint.from === "deck") {
      s.pos.copy(d.deck).setY(0.5);
      if (hint.faceUp) flatFaceUp(0, s.quat);
      else flatFaceDown(0, s.quat);
      s.scale = PILE_SCALE;
    } else if (hint.from === "discard") {
      s.pos.copy(d.discard).setY(0.2);
      flatFaceUp(0, s.quat);
      s.scale = PILE_SCALE;
    } else {
      // an opponent's card leaves their upright hand
      const seat = sceneRef.seats.get(hint.from.seat);
      if (seat) seatHandCenter(seat, s.pos);
      else s.pos.copy(d.deck).setY(0.12);
      standingBack(seat?.yaw ?? 0, 0, s.quat);
      s.scale = SEAT_CARD_SCALE;
    }
    s.startAt = performance.now() + hint.delay;
    s.init = true;
    s.d0 = 0;
    s.roll = (Math.random() - 0.5) * 1.4;
  }, [card.id]);

  useFrame((state, dt) => {
    const g = group.current;
    const cam = sceneRef.camera;
    if (!g || !cam) return;
    const s = sim.current;
    const now = performance.now();
    if (now < s.startAt) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const d = sceneRef.dims;

    // target transform
    let targetScale = 1;
    let smooth = 0.26;
    if (zone === "hand") {
      const lift = rejected ? 0 : selected ? 0.34 : hovered ? 0.2 : playable && myTurn ? 0.06 : 0;
      handSlot(count, index, handParams(state), lift, slot);
      tmpPos.copy(slot.pos).applyMatrix4(cam.matrixWorld);
      euler.set(-0.08, 0, slot.rotZ);
      localQuat.setFromEuler(euler);
      tmpQuat.copy(cam.quaternion).multiply(localQuat);
      targetScale = slot.scale * (hovered || selected ? 1.07 : 1);
      smooth = s.zone === "hand" ? 0.1 : 0.22;
      if (rejected) tmpPos.addScaledVector(camRight(cam), Math.sin(now / 28) * 0.03);
    } else {
      const top = zone === "pending" || index === count - 1;
      discardSlot(d, card.id, index, tmpPos, tmpQuat, top);
      if (zone === "pending") tmpPos.y += 0.08;
      targetScale = PILE_SCALE;
    }

    if (!s.init) {
      s.pos.copy(tmpPos);
      s.quat.copy(tmpQuat);
      s.scale = targetScale;
      s.init = true;
    }
    if (s.zone !== zone || s.d0 === 0) {
      s.zone = zone;
      s.d0 = Math.max(0.0001, s.pos.distanceTo(tmpPos));
      if (zone !== "hand") s.roll = (Math.random() - 0.5) * 1.2;
    }

    easing.damp3(s.pos, tmpPos, smooth, dt);
    easing.dampQ(s.quat, tmpQuat, smooth * 1.1, dt);
    s.scale = THREE.MathUtils.damp(s.scale, targetScale, 10, dt);

    // arc + roll while travelling between zones
    const dist = s.pos.distanceTo(tmpPos);
    const p = THREE.MathUtils.clamp(1 - dist / s.d0, 0, 1);
    const travelling = s.d0 > 0.35 && p < 0.995;
    const arc = travelling ? Math.sin(Math.PI * p) * Math.min(1.3, s.d0 * 0.32) : 0;
    g.position.copy(s.pos);
    if (arc) {
      if (zone === "hand") g.position.addScaledVector(camUp.set(0, 1, 0).applyQuaternion(cam.quaternion), arc * 0.4);
      else g.position.addScaledVector(UP, arc);
    }
    g.quaternion.copy(s.quat);
    if (travelling && zone !== "hand") g.rotateZ(s.roll * (1 - p));
    g.scale.setScalar(s.scale);

    let t = actorTransforms.get(card.id);
    if (!t) actorTransforms.set(card.id, (t = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1 }));
    t.pos.copy(g.position);
    t.quat.copy(g.quaternion);
    t.scale = s.scale;

    if (halo.current && shade.current) {
      const m = halo.current.material as THREE.MeshBasicMaterial;
      const on = zone === "hand" && playable && myTurn;
      const target = on ? (selected || hovered ? 0.95 : 0.6 + Math.sin(now / 340) * 0.12) : 0;
      m.opacity = THREE.MathUtils.damp(m.opacity, target, 8, dt);
      halo.current.visible = m.opacity > 0.01;
      // dim cards you can't play while it's your turn
      const sm = shade.current.material as THREE.MeshBasicMaterial;
      sm.opacity = THREE.MathUtils.damp(sm.opacity, zone === "hand" && myTurn && !playable ? 0.36 : 0, 8, dt);
      shade.current.visible = sm.opacity > 0.01;
    }
  });

  const interactive = zone === "hand";
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    sim.current.down = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    const down = sim.current.down;
    sim.current.down = null;
    if (!down) return;
    const dy = e.clientY - down.y;
    const g = useGame.getState();
    if (dy < -45 || g.selectedCardId === card.id) {
      void playCard(card.id);
    } else {
      g.select(card.id);
      playSfx("click");
    }
  };

  return (
    <group ref={group}>
      <mesh
        geometry={cardGeometry()}
        material={materials}
        castShadow={zone !== "hand"}
        onPointerOver={interactive ? (e) => (e.stopPropagation(), setHovered(true)) : undefined}
        onPointerOut={interactive ? () => setHovered(false) : undefined}
        onPointerDown={interactive ? onDown : undefined}
        onPointerUp={interactive ? onUp : undefined}
      />
      {interactive && (
        <>
          <mesh ref={halo} position={[0, 0, -0.03]}>
            <planeGeometry args={[0.98, 1.3]} />
            <meshBasicMaterial map={glowTexture()} color={HALO} transparent opacity={0} depthWrite={false} />
          </mesh>
          <mesh ref={shade} position={[0, 0, 0.0085]}>
            <planeGeometry args={[CARD_W * 0.995, CARD_H * 0.995]} />
            <meshBasicMaterial color="#2a1030" transparent opacity={0} depthWrite={false} />
          </mesh>
        </>
      )}
    </group>
  );
}

const right = new THREE.Vector3();
function camRight(cam: THREE.Camera) {
  return right.set(1, 0, 0).applyQuaternion(cam.quaternion);
}

function handParams(state: { size: { width: number; height: number }; camera: THREE.Camera }) {
  const aspect = state.size.width / Math.max(1, state.size.height);
  const fov = (state.camera as THREE.PerspectiveCamera).fov ?? 40;
  return { aspect, fovDeg: fov, portrait: sceneRef.dims.portrait, compact: sceneRef.dims.compact };
}

/** Every card the game lets us see: our hand and the top of the discard pile. */
export function CardActors() {
  const priv = useGame((s) => s.priv);
  const pub = useGame((s) => s.pub);
  const you = useGame((s) => s.you);
  const pending = useGame((s) => s.pendingPlayId);
  const pendingColor = useGame((s) => s.pendingColor);
  const selected = useGame((s) => s.selectedCardId);
  const rejected = useGame((s) => s.rejectedCardId);
  const sortMode = useUi((s) => s.sortMode);

  const myTurn = !!pub && pub.turnPlayerId === you;
  const hand = useMemo(() => sortHand(priv?.hand ?? [], sortMode), [priv?.hand, sortMode]);
  const playable = useMemo(() => new Set([...(priv?.playable ?? []), ...(priv?.jumpIn ?? [])]), [priv]);
  const canJump = (priv?.jumpIn.length ?? 0) > 0;

  if (!pub || pub.phase === "lobby") return null;
  const inHand = hand.filter((c) => c.id !== pending);
  const pendingCard = pending ? hand.find((c) => c.id === pending) : undefined;
  const handIds = new Set(hand.map((c) => c.id));
  const pile = pub.discardTop.filter((c) => !handIds.has(c.id));

  // one keyed list, so a card keeps its 3D object as it moves hand → pile
  const actors = [
    ...inHand.map((c, i) => (
      <CardActor
        key={c.id}
        card={c}
        zone="hand"
        index={i}
        count={inHand.length}
        playable={playable.has(c.id)}
        selected={selected === c.id}
        rejected={rejected === c.id}
        myTurn={myTurn || canJump}
        tint={null}
      />
    )),
    ...(pendingCard
      ? [<CardActor key={pendingCard.id} card={pendingCard} zone="pending" index={0} count={1} playable={false} selected={false} rejected={false} myTurn={false} tint={pendingColor} />]
      : []),
    ...pile.map((c, i) => (
      <CardActor
        key={c.id}
        card={c}
        zone="discard"
        index={i}
        count={pendingCard ? pile.length + 1 : pile.length}
        playable={false}
        selected={false}
        rejected={false}
        myTurn={false}
        tint={c.color ? null : (wildColors.get(c.id) ?? (i === pile.length - 1 && !pendingCard ? pub.currentColor : null))}
      />
    )),
  ];
  return <group>{actors}</group>;
}
