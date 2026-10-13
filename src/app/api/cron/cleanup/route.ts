import { handle, json } from "@/server/api";
import { cleanupInactive } from "@/server/room-service";

/** Daily Vercel cron: delete rooms with no activity for 24 hours. */
export const GET = handle(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const deleted = await cleanupInactive(24 * 60 * 60 * 1000);
  return json({ deleted });
});
