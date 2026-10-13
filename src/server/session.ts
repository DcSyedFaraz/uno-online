import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { cookies, headers } from "next/headers";

const COOKIE = "neono_session";
const MAX_AGE = 60 * 60 * 24 * 30;
const DEV_SECRET = "neono-dev-secret-change-me-in-production-0123456789";

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set");
    return new TextEncoder().encode(DEV_SECRET);
  }
  return new TextEncoder().encode(s);
}

export const isDev = process.env.NODE_ENV !== "production";

/**
 * Dev-only: `?devUser=x` on the page sends this header so each browser tab can be a
 * different player while testing locally.
 */
async function devPlayerId(req?: Request): Promise<string | null> {
  if (!isDev) return null;
  const h = await headers();
  // EventSource can't send headers, so the dev stream passes it as a query param
  const v = h.get("x-dev-user") ?? (req ? new URL(req.url).searchParams.get("devUser") : null);
  return v && /^[a-z0-9_-]{1,24}$/i.test(v) ? `dev_${v}` : null;
}

export async function getPlayerId(req?: Request): Promise<string | null> {
  const dev = await devPlayerId(req);
  if (dev) return dev;
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.pid === "string" ? payload.pid : null;
  } catch {
    return null;
  }
}

/** Returns the guest's player id, creating a signed session cookie on first visit. */
export async function ensurePlayerId(): Promise<string> {
  const existing = await getPlayerId();
  if (existing) return existing;
  const pid = `g_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const token = await new SignJWT({ pid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: !isDev,
    path: "/",
    maxAge: MAX_AGE,
  });
  return pid;
}
