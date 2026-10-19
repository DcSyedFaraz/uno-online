import { handle, json } from "@/server/api";
import { createAblyToken } from "@/server/realtime";
import { HttpError, loadRoom } from "@/server/room-service";
import { getPlayerId } from "@/server/session";

/** Ably token auth: only for players (and spectators) in the room, scoped to their own channels. */
export const GET = handle(async (req: Request) => {
  const code = new URL(req.url).searchParams.get("code")?.toUpperCase() ?? "";
  const pid = await getPlayerId();
  if (!pid) throw new HttpError(401, "No session");
  const room = await loadRoom(code);
  const inRoom = room.state.players.some((p) => p.id === pid) || room.state.spectators?.some((s) => s.id === pid);
  if (!inRoom) throw new HttpError(403, "Not in this room");
  return json(await createAblyToken(code, pid));
});
