import "server-only";
import {
  applyAction,
  createGame,
  cryptoRng,
  dueAt,
  eventsFor,
  privateView,
  publicView,
  RuleError,
  type Action,
  type ApplyResult,
  type GameState,
} from "@/engine";
import { gameChannel, type GameMessage, type RoomSnapshot } from "@/shared/protocol";
import { presentIds, publishAll, transport, type OutboundMessage } from "./realtime";
import { getStore, type RoomRecord } from "./store";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export interface Profile {
  name: string;
  avatar: string;
}

const isSpectator = (state: GameState, pid: string) => !!state.spectators?.some((s) => s.id === pid);
const isMember = (state: GameState, pid: string) => state.players.some((p) => p.id === pid) || isSpectator(state, pid);

function messageFor(state: GameState, version: number, pid: string, res: ApplyResult | null, now: number): GameMessage {
  const member = isMember(state, pid);
  return {
    v: version,
    pub: publicView(state),
    priv: member ? privateView(state, pid) : null,
    ev: res ? eventsFor(res.events, pid, isSpectator(state, pid)) : [],
    now,
    removed: !member || undefined,
  };
}

export async function createRoom(pid: string, profile: Profile): Promise<string> {
  const store = getStore();
  const now = Date.now();
  const state = createGame({ id: pid, name: profile.name, avatar: profile.avatar });
  for (let i = 0; i < 8; i++) {
    const code = randomCode();
    if (await store.create(code, state, now)) return code;
  }
  throw new HttpError(503, "Couldn't create a room, please try again");
}

export async function loadRoom(code: string): Promise<RoomRecord> {
  if (!CODE_RE.test(code)) throw new HttpError(404, "Room not found");
  const rec = await getStore().get(code);
  if (!rec) throw new HttpError(404, "Room not found — check the code");
  return rec;
}

export async function snapshot(code: string, pid: string): Promise<RoomSnapshot> {
  const rec = await loadRoom(code);
  const msg = messageFor(rec.state, rec.version, pid, null, Date.now());
  return { code, you: pid, member: !msg.removed, spectator: isSpectator(rec.state, pid), transport: transport(), msg };
}

/**
 * load → apply (pure engine) → optimistic-locking save → publish to every player.
 * Retries a few times if another action landed first.
 */
export async function perform(code: string, actorId: string, action: Action): Promise<GameMessage> {
  const store = getStore();
  for (let attempt = 0; attempt < 4; attempt++) {
    const rec = await loadRoom(code);
    const now = Date.now();
    let res: ApplyResult;
    try {
      res = applyAction(rec.state, action, actorId, now, cryptoRng());
    } catch (e) {
      if (e instanceof RuleError) throw new HttpError(400, e.message);
      throw e;
    }
    if (!(await store.update(code, res.state, rec.version, now))) continue;
    const version = rec.version + 1;
    await broadcast(code, rec.state, res, version, now);
    // the host closed the room, or the last human walked out: nobody is left to play
    const nobodyLeft = !res.state.players.some((p) => !p.isBot && p.status !== "left");
    if (action.type === "close_room" || ((action.type === "leave" || action.type === "kick") && nobodyLeft)) await store.remove(code);
    return messageFor(res.state, version, actorId, res, now);
  }
  throw new HttpError(409, "The table is busy — try again");
}

/** Called by clients when a turn deadline (AFK timeout or bot move) or the round clock runs out. */
export async function tick(code: string): Promise<{ applied: boolean; v: number }> {
  const rec = await loadRoom(code);
  const now = Date.now();
  const due = dueAt(rec.state);
  if (rec.state.phase !== "playing" || due === null || now < due - 50) {
    return { applied: false, v: rec.version };
  }
  try {
    const msg = await perform(code, "system", { type: "timeout" });
    return { applied: true, v: msg.v };
  } catch (e) {
    // someone else's tick (or a move) got there first
    if (e instanceof HttpError && (e.status === 400 || e.status === 409)) return { applied: false, v: rec.version };
    throw e;
  }
}

/**
 * A player's connection dropped. Any member may report it, but the server only acts if presence
 * confirms they're really gone: then a bot takes their seat (or they leave the lobby).
 */
export async function markOffline(code: string, reporter: string, target: string, present = presentIds): Promise<{ applied: boolean }> {
  const rec = await loadRoom(code);
  if (!isMember(rec.state, reporter)) throw new HttpError(403, "Not in this room");
  let here: Set<string>;
  try {
    here = await present(code);
  } catch {
    return { applied: false };
  }
  if (here.has(target)) return { applied: false };
  try {
    await perform(code, "system", { type: "offline", playerId: target });
    return { applied: true };
  } catch (e) {
    if (e instanceof HttpError && (e.status === 400 || e.status === 409)) return { applied: false };
    throw e;
  }
}

async function broadcast(code: string, prev: GameState, res: ApplyResult, version: number, now: number) {
  // humans, including seats a bot is minding for them, and everyone watching
  const humans = new Set<string>();
  for (const p of [...prev.players, ...res.state.players]) if (!p.isBot || p.takenOver) humans.add(p.id);
  for (const s of [...(prev.spectators ?? []), ...(res.state.spectators ?? [])]) humans.add(s.id);
  const out: OutboundMessage[] = [...humans].map((pid) => ({
    channel: gameChannel(code, pid),
    name: "game",
    data: messageFor(res.state, version, pid, res, now),
  }));
  try {
    await publishAll(out);
  } catch (e) {
    // the move is saved; clients resync on the next message or reconnect
    console.error("publish failed", e);
  }
}

/** Dev-only helper behind /api/dev/rig: trims one player's hand (cards go under the draw pile). */
export async function rigRoom(code: string, pid: string, keep: number, keepIds?: string[]): Promise<{ v: number }> {
  const store = getStore();
  const rec = await loadRoom(code);
  const state = structuredClone(rec.state);
  const p = state.players.find((x) => x.id === pid);
  if (!p) throw new HttpError(404, "Player not found");
  if (keepIds?.length) p.hand.sort((a, b) => Number(keepIds.includes(b.id)) - Number(keepIds.includes(a.id)));
  state.drawPile.unshift(...p.hand.splice(keep));
  p.saidUno = false;
  const now = Date.now();
  if (!(await store.update(code, state, rec.version, now))) throw new HttpError(409, "Busy");
  await broadcast(code, rec.state, { state, events: [] }, rec.version + 1, now);
  return { v: rec.version + 1 };
}

export async function cleanupInactive(maxIdleMs: number): Promise<number> {
  return getStore().deleteInactive(Date.now() - maxIdleMs);
}
