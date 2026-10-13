import { chatChannel, gameChannel } from "@/shared/protocol";
import { devPresence, devSubscribe, transport } from "@/server/realtime";
import { CODE_RE } from "@/server/room-service";
import { getPlayerId } from "@/server/session";

/**
 * Local-development stand-in for Ably (used only when ABLY_API_KEY is not set):
 * streams the player's game channel and the room chat over Server-Sent Events.
 */
export async function GET(req: Request) {
  if (transport() !== "sse") return new Response("Not found", { status: 404 });
  const code = new URL(req.url).searchParams.get("code")?.toUpperCase() ?? "";
  const pid = await getPlayerId(req);
  if (!pid || !CODE_RE.test(code)) return new Response("Bad request", { status: 400 });

  const enc = new TextEncoder();
  const connId = crypto.randomUUID();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (name: string, data: unknown) => {
        try {
          controller.enqueue(enc.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const offGame = devSubscribe(gameChannel(code, pid), send);
      const offChat = devSubscribe(chatChannel(code), send);
      const ping = setInterval(() => send("ping", {}), 15000);
      send("ready", { pid });
      devPresence(code, connId, pid);
      cleanup = () => {
        clearInterval(ping);
        offGame();
        offChat();
        devPresence(code, connId, null);
        cleanup = () => {};
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" },
  });
}
