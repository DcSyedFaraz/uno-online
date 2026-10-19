import { z } from "zod";
import { handle, json, readJson } from "@/server/api";
import { HttpError, markOffline } from "@/server/room-service";
import { getPlayerId } from "@/server/session";

const schema = z.object({ pid: z.string().min(1).max(64) });

/** A client noticed a player's connection is gone; the server checks presence before a bot takes over. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/rooms/[code]/offline">) => {
  const { code } = await ctx.params;
  const reporter = await getPlayerId();
  if (!reporter) throw new HttpError(401, "No session");
  const { pid } = await readJson(req, schema);
  return json(await markOffline(code.toUpperCase(), reporter, pid));
});
