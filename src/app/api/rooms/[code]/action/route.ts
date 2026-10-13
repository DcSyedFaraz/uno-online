import { clientActionSchema, handle, json, readJson } from "@/server/api";
import { HttpError, perform } from "@/server/room-service";
import { getPlayerId } from "@/server/session";

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/rooms/[code]/action">) => {
  const { code } = await ctx.params;
  const pid = await getPlayerId();
  if (!pid) throw new HttpError(401, "Join the room first");
  const action = await readJson(req, clientActionSchema);
  return json(await perform(code.toUpperCase(), pid, action));
});
