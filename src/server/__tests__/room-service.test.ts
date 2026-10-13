import { beforeEach, describe, expect, it } from "vitest";
import { createRoom, HttpError, perform, snapshot } from "../room-service";
import { createAblyToken } from "../realtime";
import { getStore } from "../store";

// Runs against the in-memory dev store (no DATABASE_URL) and the dev bus (no ABLY_API_KEY).
beforeEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.ABLY_API_KEY;
});

async function roomWithTwoBots() {
  const code = await createRoom("host", { name: "Host", avatar: "🙂" });
  await perform(code, "guest", { type: "join", name: "Guest", avatar: "😎" });
  await perform(code, "host", { type: "add_bot" });
  return code;
}

describe("room service", () => {
  it("serialises concurrent actions with optimistic locking", async () => {
    const code = await roomWithTwoBots();
    const before = (await getStore().get(code))!.version;
    // two different settings changes land at the same moment: both must apply, one after the other
    const [a, b] = await Promise.all([
      perform(code, "host", { type: "update_settings", settings: { jumpIn: true } }),
      perform(code, "host", { type: "update_settings", settings: { sevenSwap: true } }),
    ]);
    const after = await getStore().get(code);
    expect(after!.version).toBe(before + 2);
    expect(new Set([a.v, b.v]).size).toBe(2);
    expect(after!.state.settings.jumpIn).toBe(true);
    expect(after!.state.settings.sevenSwap).toBe(true);
  });

  it("a stale update is rejected by the store", async () => {
    const code = await roomWithTwoBots();
    const rec = (await getStore().get(code))!;
    expect(await getStore().update(code, rec.state, rec.version, Date.now())).toBe(true);
    expect(await getStore().update(code, rec.state, rec.version, Date.now())).toBe(false);
  });

  it("maps rule violations to 400 and hides other hands in snapshots", async () => {
    const code = await roomWithTwoBots();
    await expect(perform(code, "guest", { type: "start" })).rejects.toMatchObject({ status: 400 });
    await perform(code, "host", { type: "start" });
    const host = await snapshot(code, "host");
    const guest = await snapshot(code, "guest");
    expect(host.member && guest.member).toBe(true);
    const guestIds = guest.msg.priv!.hand.map((c) => c.id);
    const hostJson = JSON.stringify(host);
    for (const id of guestIds) expect(hostJson).not.toContain(`"id":"${id}"`);
    const outsider = await snapshot(code, "stranger");
    expect(outsider.member).toBe(false);
    expect(outsider.msg.priv).toBeNull();
  });

  it("unknown rooms are 404", async () => {
    await expect(snapshot("ZZZZZZ", "x")).rejects.toBeInstanceOf(HttpError);
  });
});

describe("Ably tokens", () => {
  it("only grant the player's own game channel plus room chat", async () => {
    process.env.ABLY_API_KEY = "appid.keyid:not-a-real-secret";
    const token = await createAblyToken("ABCDEF", "player1");
    expect(token.clientId).toBe("player1");
    const cap = JSON.parse(token.capability as string) as Record<string, string[]>;
    expect(Object.keys(cap).sort()).toEqual(["room:ABCDEF:chat", "room:ABCDEF:p:player1"]);
    expect(cap["room:ABCDEF:p:player1"]).toEqual(["subscribe"]);
    expect([...cap["room:ABCDEF:chat"]].sort()).toEqual(["presence", "publish", "subscribe"]);
  });
});
