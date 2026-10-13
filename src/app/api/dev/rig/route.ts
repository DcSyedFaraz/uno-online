import { z } from "zod";
import { handle, json, readJson } from "@/server/api";
import { transport } from "@/server/realtime";
import { HttpError, loadRoom, rigRoom } from "@/server/room-service";

const schema = z.object({ code: z.string(), pid: z.string(), keep: z.number().int().min(1).max(30), keepIds: z.array(z.string()).optional() });

/**
 * Local-development only (never in production, never with Ably configured):
 * trims a player's hand to `keep` cards so UI states like the last-card shout
 * can be tested without playing a whole round.
 */
export const POST = handle(async (req: Request) => {
  if (process.env.NODE_ENV === "production" || transport() !== "sse") throw new HttpError(404, "Not found");
  const body = await readJson(req, schema);
  const code = body.code.toUpperCase();
  await loadRoom(code);
  return json(await rigRoom(code, body.pid, body.keep, body.keepIds));
});
