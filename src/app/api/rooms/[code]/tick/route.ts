import { handle, json } from "@/server/api";
import { tick } from "@/server/room-service";

/** Any client may poke the room when a turn deadline has passed; the server re-checks it. */
export const POST = handle(async (_req: Request, ctx: RouteContext<"/api/rooms/[code]/tick">) => {
  const { code } = await ctx.params;
  return json(await tick(code.toUpperCase()));
});
