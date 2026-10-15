import "server-only";
import { z, ZodError } from "zod";
import { COLORS, type Action } from "@/engine";
import { HttpError } from "./room-service";

export const profileSchema = z.object({
  name: z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "Enter a name").max(20, "Name is too long")),
  avatar: z.string().min(1).max(16),
});

const color = z.enum(COLORS as unknown as [string, ...string[]]);
const id = z.string().min(1).max(64);

/** Actions a client may send. `join` and `timeout` have their own routes. */
export const clientActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("play"), cardId: id, color: color.optional(), swapTargetId: id.optional() }),
  z.object({ type: z.literal("jump_in"), cardId: id, color: color.optional(), swapTargetId: id.optional() }),
  z.object({ type: z.literal("draw") }),
  z.object({ type: z.literal("pass") }),
  z.object({ type: z.literal("take_penalty") }),
  z.object({ type: z.literal("challenge") }),
  z.object({ type: z.literal("choose_color"), color }),
  z.object({ type: z.literal("call_uno") }),
  z.object({ type: z.literal("catch_uno"), targetId: id }),
  z.object({ type: z.literal("update_settings"), settings: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("add_bot") }),
  z.object({ type: z.literal("remove_bot"), playerId: id }),
  z.object({ type: z.literal("kick"), playerId: id }),
  z.object({ type: z.literal("leave") }),
  z.object({ type: z.literal("close_room") }),
  z.object({ type: z.literal("transfer_host"), playerId: id }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("next_round") }),
  z.object({ type: z.literal("back_to_lobby") }),
]) as unknown as z.ZodType<Action>;

export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Invalid request");
  }
  return schema.parse(body);
}

/** Wraps a route handler: maps known errors to JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError) return Response.json({ error: e.issues[0]?.message ?? "Invalid request" }, { status: 400 });
      console.error(e);
      return Response.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "cache-control": "no-store", ...init?.headers } });
}
