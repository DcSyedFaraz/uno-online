import { expect, test, type Page } from "@playwright/test";

// the in-game turn prompt (not the lobby's "Turn timer" label, which also contains "turn")
const IN_GAME = /your turn|'s turn|choose a color|stack it|faces \+/i;

async function profile(page: Page, name: string) {
  const input = page.getByPlaceholder("Guest name");
  await input.fill(name);
}

test("host and guest play together through a share link", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  // host creates a room
  await host.goto("/");
  await profile(host, "Hosty");
  await host.getByRole("button", { name: "Create a room" }).click();
  await host.waitForURL(/\/r\/[A-Z0-9]{6}/);
  const code = host.url().match(/\/r\/([A-Z0-9]{6})/)![1];
  await expect(host.getByText(code).first()).toBeVisible();

  // guest joins through the link
  await guest.goto(`/r/${code}`);
  await profile(guest, "Guesty");
  await guest.getByRole("button", { name: "Join table" }).click();
  await expect(guest.getByText("Waiting for the host to start")).toBeVisible();
  await expect(host.getByText("Guesty", { exact: true })).toBeVisible();

  // guest can't change rules; host turns on one extra rule and it syncs
  await guest.getByText("More rules").click();
  await expect(guest.getByRole("switch", { name: "Jump-in" })).toBeDisabled();
  await host.getByText("More rules").click();
  await host.getByRole("switch", { name: "Jump-in" }).click();
  await expect(guest.getByRole("switch", { name: "Jump-in" })).toHaveAttribute("aria-checked", "true");

  // add a bot and start
  await host.getByRole("button", { name: "+ Add bot" }).click();
  await host.getByRole("button", { name: "Start game" }).click();
  await expect(host.getByText(IN_GAME).first()).toBeVisible();
  await expect(guest.getByText(IN_GAME).first()).toBeVisible();

  // hidden information: each player only receives their own hand
  const snap = async (p: Page) => p.evaluate(async (c) => (await fetch(`/api/rooms/${c}`)).json(), code);
  const hs = await snap(host);
  const gs = await snap(guest);
  expect(hs.msg.priv.hand).toHaveLength(gs.msg.pub.players.find((p: { id: string }) => p.id === hs.you).cardCount);
  const guestIds: string[] = gs.msg.priv.hand.map((c: { id: string }) => c.id);
  const hostJson = JSON.stringify(hs);
  for (const id of guestIds) expect(hostJson).not.toContain(`"id":"${id}"`);
  expect(hostJson).not.toContain("drawPile");

  // whoever's turn it is takes an action (D = draw); both clients must see the new version
  const v0 = hs.msg.v;
  const turn = hs.msg.pub.turnPlayerId;
  const actor = turn === hs.you ? host : turn === gs.you ? guest : null;
  if (actor && hs.msg.pub.turn.kind === "play") {
    await actor.locator("body").click({ position: { x: 5, y: 300 } });
    await actor.keyboard.press("d");
  }
  await expect.poll(async () => (await snap(guest)).msg.v, { timeout: 20_000 }).toBeGreaterThan(v0);
  const [a, b] = await Promise.all([snap(host), snap(guest)]);
  expect(Math.abs(a.msg.v - b.msg.v)).toBeLessThanOrEqual(1);

  // a refresh keeps your seat and your hand
  const before = (await snap(guest)).msg.priv.hand.length;
  await guest.reload();
  await expect(guest.getByText(IN_GAME).first()).toBeVisible();
  const after = await snap(guest);
  expect(after.member).toBe(true);
  expect(Math.abs(after.msg.priv.hand.length - before)).toBeLessThanOrEqual(4);

  await hostCtx.close();
  await guestCtx.close();
});

test("unknown room shows a friendly message", async ({ page }) => {
  await page.goto("/r/ZZZZZZ");
  await expect(page.getByText("Room not found")).toBeVisible();
});
