import { z } from "zod";
import { CHAT_MAX, chatChannel, type ChatMessage } from "@/shared/protocol";
import { handle, json, readJson } from "@/server/api";
import { devPublish, transport } from "@/server/realtime";
import { HttpError, loadRoom } from "@/server/room-service";
import { getPlayerId } from "@/server/session";

const schema = z.object({ code: z.string(), kind: z.enum(["chat", "react"]), text: z.string().min(1).max(CHAT_MAX) });

/** Local-development stand-in for publishing chat on Ably. */
export const POST = handle(async (req: Request) => {
  if (transport() !== "sse") throw new HttpError(404, "Not found");
  const body = await readJson(req, schema);
  const pid = await getPlayerId();
  const code = body.code.toUpperCase();
  const room = await loadRoom(code);
  if (!pid || !room.state.players.some((p) => p.id === pid)) throw new HttpError(403, "Not in this room");
  const msg: ChatMessage = { id: crypto.randomUUID(), kind: body.kind, pid, text: body.text, at: Date.now() };
  devPublish(chatChannel(code), body.kind, msg);
  return json({ ok: true });
});
