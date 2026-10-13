import { handle, json, profileSchema, readJson } from "@/server/api";
import { perform } from "@/server/room-service";
import { ensurePlayerId } from "@/server/session";

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/rooms/[code]/join">) => {
  const { code } = await ctx.params;
  const profile = await readJson(req, profileSchema);
  const pid = await ensurePlayerId();
  return json(await perform(code.toUpperCase(), pid, { type: "join", ...profile }));
});
