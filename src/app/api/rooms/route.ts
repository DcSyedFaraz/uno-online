import { handle, json, profileSchema, readJson } from "@/server/api";
import { createRoom } from "@/server/room-service";
import { ensurePlayerId } from "@/server/session";

/** Create a room; the caller becomes its host. */
export const POST = handle(async (req: Request) => {
  const profile = await readJson(req, profileSchema);
  const pid = await ensurePlayerId();
  const code = await createRoom(pid, profile);
  return json({ code });
});
