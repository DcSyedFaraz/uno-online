# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: multiplayer.spec.ts >> host and guest play together through a share link
- Location: e2e\multiplayer.spec.ts:8:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Guesty')
Expected: visible
Error: strict mode violation: getByText('Guesty') resolved to 2 elements:
    1) <div class="truncate text-sm font-semibold">Guesty</div> aka getByText('Guesty', { exact: true })
    2) <div class="glass !rounded-full px-4 py-2 text-sm font-medium">Guesty joined</div> aka getByText('Guesty joined')

Call log:
  - Expect "toBeVisible" getByText('Guesty') with timeout 15000ms
  - waiting for getByText('Guesty')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - button "Open Next.js Dev Tools" [ref=e7] [cursor=pointer]
  - alert [ref=e11]
  - main [ref=e15]:
    - link "NEONO" [ref=e16] [cursor=pointer]:
      - /url: /
    - generic [ref=e17]:
      - generic [ref=e18]:
        - generic [ref=e19]:
          - generic [ref=e20]:
            - generic [ref=e21]: Room code
            - generic [ref=e22]: J87JDP
            - generic [ref=e23]: http://localhost:3100/r/J87JDP
            - generic [ref=e24]:
              - button "Copy invite link" [ref=e25]
              - button "Share…" [ref=e26]
          - img "QR code for the invite link" [ref=e27]
        - generic [ref=e28]:
          - generic [ref=e29]:
            - generic [ref=e30]:
              - text: Players
              - generic [ref=e31]: 2/10
            - button "+ Add bot" [ref=e32]
          - generic [ref=e33]:
            - generic [ref=e34]:
              - generic [ref=e35]: 😎
              - generic [ref=e37]:
                - generic [ref=e38]: Hosty (you)
                - generic [ref=e39]: 👑 Host
            - generic [ref=e40]:
              - generic [ref=e41]: 🤠
              - generic [ref=e43]:
                - generic [ref=e44]: Guesty
                - generic [ref=e45]: Guest
              - button "✕" [ref=e46]
            - generic [ref=e47]: Open seat
            - generic [ref=e48]: Open seat
            - generic [ref=e49]: Open seat
        - generic [ref=e50]:
          - button "Start game" [ref=e51]
          - generic [ref=e52]: Everyone's in? Deal 'em.
      - generic [ref=e53]:
        - generic [ref=e54]: Table rules
        - generic [ref=e56]:
          - generic [ref=e57]:
            - generic [ref=e58]: Basics
            - generic [ref=e59]:
              - generic [ref=e60]:
                - text: Cards per hand
                - generic [ref=e61]:
                  - text: "?"
                  - generic: How many cards everyone is dealt at the start of a round.
              - generic [ref=e62]:
                - button "5" [ref=e63]
                - button "6" [ref=e64]
                - button "7" [ref=e65]
                - button "8" [ref=e66]
                - button "9" [ref=e67]
                - button "10" [ref=e68]
            - generic [ref=e69]:
              - generic [ref=e70]:
                - text: Turn timer
                - generic [ref=e71]:
                  - text: "?"
                  - generic: If a player doesn't move in time they automatically draw a card (or take the penalty).
              - generic [ref=e72]:
                - button "Off" [ref=e73]
                - button "15s" [ref=e74]
                - button "30s" [ref=e75]
                - button "45s" [ref=e76]
                - button "60s" [ref=e77]
            - generic [ref=e78]:
              - generic [ref=e79]:
                - text: Win by
                - generic [ref=e80]:
                  - text: "?"
                  - generic: "Single round: first to empty their hand wins. Points: the winner scores everyone else's leftover cards; first to the target wins."
              - generic [ref=e81]:
                - button "1 round" [ref=e82]
                - button "Points" [ref=e83]
            - generic [ref=e84]:
              - generic [ref=e85]:
                - text: Decks
                - generic [ref=e86]:
                  - text: "?"
                  - generic: Auto adds a second deck for big tables (7+ players) and a third for huge hands.
              - generic [ref=e87]:
                - button "Auto" [ref=e88]
                - button "1" [ref=e89]
                - button "2" [ref=e90]
                - button "3" [ref=e91]
          - button "More rules Classic rules — every extra is off ▾" [ref=e92]:
            - generic [ref=e93]:
              - generic [ref=e94]: More rules
              - generic [ref=e95]: Classic rules — every extra is off
            - generic [ref=e96]: ▾
    - button "Chat" [ref=e99]: 💬
    - generic: Guesty joined
```

# Test source

```ts
  1  | import { expect, test, type Page } from "@playwright/test";
  2  | 
  3  | async function profile(page: Page, name: string) {
  4  |   const input = page.getByPlaceholder("Guest name");
  5  |   await input.fill(name);
  6  | }
  7  | 
  8  | test("host and guest play together through a share link", async ({ browser }) => {
  9  |   const hostCtx = await browser.newContext();
  10 |   const guestCtx = await browser.newContext();
  11 |   const host = await hostCtx.newPage();
  12 |   const guest = await guestCtx.newPage();
  13 | 
  14 |   // host creates a room
  15 |   await host.goto("/");
  16 |   await profile(host, "Hosty");
  17 |   await host.getByRole("button", { name: "Create a room" }).click();
  18 |   await host.waitForURL(/\/r\/[A-Z0-9]{6}/);
  19 |   const code = host.url().match(/\/r\/([A-Z0-9]{6})/)![1];
  20 |   await expect(host.getByText(code).first()).toBeVisible();
  21 | 
  22 |   // guest joins through the link
  23 |   await guest.goto(`/r/${code}`);
  24 |   await profile(guest, "Guesty");
  25 |   await guest.getByRole("button", { name: "Join table" }).click();
  26 |   await expect(guest.getByText("Waiting for the host to start")).toBeVisible();
> 27 |   await expect(host.getByText("Guesty")).toBeVisible();
     |                                          ^ Error: expect(locator).toBeVisible() failed
  28 | 
  29 |   // guest can't change rules; host turns on one extra rule and it syncs
  30 |   await guest.getByText("More rules").click();
  31 |   await expect(guest.getByRole("switch", { name: "Jump-in" })).toBeDisabled();
  32 |   await host.getByText("More rules").click();
  33 |   await host.getByRole("switch", { name: "Jump-in" }).click();
  34 |   await expect(guest.getByRole("switch", { name: "Jump-in" })).toHaveAttribute("aria-checked", "true");
  35 | 
  36 |   // add a bot and start
  37 |   await host.getByRole("button", { name: "+ Add bot" }).click();
  38 |   await host.getByRole("button", { name: "Start game" }).click();
  39 |   await expect(host.getByText(/turn|choose a color/i).first()).toBeVisible();
  40 |   await expect(guest.getByText(/turn|choose a color/i).first()).toBeVisible();
  41 | 
  42 |   // hidden information: each player only receives their own hand
  43 |   const snap = async (p: Page) => p.evaluate(async (c) => (await fetch(`/api/rooms/${c}`)).json(), code);
  44 |   const hs = await snap(host);
  45 |   const gs = await snap(guest);
  46 |   expect(hs.msg.priv.hand).toHaveLength(gs.msg.pub.players.find((p: { id: string }) => p.id === hs.you).cardCount);
  47 |   const guestIds: string[] = gs.msg.priv.hand.map((c: { id: string }) => c.id);
  48 |   const hostJson = JSON.stringify(hs);
  49 |   for (const id of guestIds) expect(hostJson).not.toContain(`"id":"${id}"`);
  50 |   expect(hostJson).not.toContain("drawPile");
  51 | 
  52 |   // both clients stay in sync as the game moves on (bots + timeouts keep it going)
  53 |   const v0 = hs.msg.v;
  54 |   await expect.poll(async () => (await snap(guest)).msg.v, { timeout: 20_000 }).toBeGreaterThan(v0);
  55 |   const [a, b] = await Promise.all([snap(host), snap(guest)]);
  56 |   expect(Math.abs(a.msg.v - b.msg.v)).toBeLessThanOrEqual(1);
  57 | 
  58 |   // a refresh keeps your seat and your hand
  59 |   const before = (await snap(guest)).msg.priv.hand.length;
  60 |   await guest.reload();
  61 |   await expect(guest.getByText(/turn|choose a color/i).first()).toBeVisible();
  62 |   const after = await snap(guest);
  63 |   expect(after.member).toBe(true);
  64 |   expect(Math.abs(after.msg.priv.hand.length - before)).toBeLessThanOrEqual(4);
  65 | 
  66 |   await hostCtx.close();
  67 |   await guestCtx.close();
  68 | });
  69 | 
  70 | test("unknown room shows a friendly message", async ({ page }) => {
  71 |   await page.goto("/r/ZZZZZZ");
  72 |   await expect(page.getByText("Room not found")).toBeVisible();
  73 | });
  74 | 
```