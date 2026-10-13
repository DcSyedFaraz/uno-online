import { handle, json } from "@/server/api";
import { snapshot } from "@/server/room-service";
import { ensurePlayerId } from "@/server/session";

/** Current views of the room for the caller (used on load and to resync). */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/rooms/[code]">) => {
  const { code } = await ctx.params;
  const pid = await ensurePlayerId();
  return json(await snapshot(code.toUpperCase(), pid));
});
