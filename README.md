# NEONO

A 3D neon online card game in the style of UNO, for 2–10 players. You create a room, share the link, and friends join as guests with any name. No sign-up needed.

- **Sensible defaults:** classic rules plus equal-or-higher stacking, Discard All and a 3-minute round clock (the fewest card points wins at time-up; the last minute plays at 2×). A +2/+4 you can't stack or challenge is drawn for you. The round clock can be set to 3, 5 or 7 minutes or switched off. The host can open **More rules** and switch individual extras on or off: stacking (3 modes), 7 = swap hands, 0 = pass hands, jump-in, draw until playable, forced play, Wild +4 modes, Wild Reverse +4, Discard All, Skip Everyone, colored +4, +6, +10, Color Roulette, the mercy rule, the missed-shout penalty size, and AFK autopilot. Each one is a separate switch. There are no bundles.
- **3D table.** Built with React Three Fiber. Every card glides between the deck, your hand, the seats and the pile. You also get:
  - a neon rim that takes on the current color
  - a direction ring, color shockwaves and particle bursts
  - confetti when someone wins
  - Bloom and Vignette post-processing
  - automatic quality scaling on slower devices
- **Shout and catch.** Press **UNO!** when you're down to one card. Everyone sees a banner and hears the shout. If you forget, other players get a **🔨 Catch** button for a few seconds, and you draw the penalty.
- **Extras.** Bots to fill seats, table chat and emoji reactions, synthesized sound effects with an optional music loop, a keyboard shortcut for every action, and a layout that works on phones.

## Play locally (no accounts needed)

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no environment variables set, the app uses an in-memory room store and a built-in live stream instead of Neon and Ably, so everything works offline.

To play several players from one browser, give each tab its own dev identity: `http://localhost:3000/r/ROOMCODE?devUser=alice`. This only works in development.

| Command | What it does |
|---|---|
| `npm test` | Rules engine, fuzz simulation and server tests (Vitest). Set `FUZZ_GAMES=2000` for a longer run. |
| `npm run test:e2e` | Two-browser multiplayer test (Playwright, uses your installed Edge; set `E2E_CHANNEL=chrome` for Chrome) |
| `npm run lint` | ESLint |
| `npm run voices` | Optional: generate shout voice clips with ElevenLabs (see below) |

Keyboard: ←/→ select a card · Enter plays it · D draws · U shouts · Esc cancels.

## Deploy for free (Vercel + Neon + Ably)

Everything below uses free tiers with no credit card.

### The quick way: one command

```bash
vercel login               # once
npx --yes neonctl auth     # once
npm run deploy
```

`npm run deploy` does the following:
- creates (or reuses) a Neon project called `neono`
- links a Vercel project
- sets `vercel.json` to the function region next to your database
- stores `DATABASE_URL`, `ABLY_API_KEY`, `SESSION_SECRET` and `CRON_SECRET` as sensitive Vercel environment variables
- deploys to production and prints your URL

It asks for your Ably key with hidden input. Get one free at [ably.com](https://ably.com): create an app, open API Keys, and copy the root key. Re-running it is safe; add `--reset-env` to replace the stored variables. The `rooms` table is created automatically on first use.

### By hand

1. **Neon:** create a project at [neon.com](https://neon.com) and copy the **pooled** connection string. Alternatively, add Neon from Vercel → Storage.
2. **Ably:** create an app at [ably.com](https://ably.com) and copy its root API key. Browsers never see this key; the server only hands out scoped tokens.
3. **Vercel:** import the project and set the four variables: `DATABASE_URL`, `ABLY_API_KEY`, `SESSION_SECRET` and `CRON_SECRET`. The last two are any long random strings, e.g. from `openssl rand -hex 32`.
4. **Region:** set `regions` in `vercel.json` to the region next to Neon, e.g. `aws-us-east-1` → `iad1`, `aws-eu-central-1` → `fra1`, `aws-ap-southeast-1` → `sin1`. Then deploy.

Room links look like `https://<project>.vercel.app/r/ABC123`. A daily Vercel cron (`/api/cron/cleanup`) deletes rooms that have been idle for 24 hours.

### Free-tier headroom (checked Oct 2026)

| Service | Limit that matters | In practice |
|---|---|---|
| [Ably Free](https://ably.com/docs/platform/pricing/free) | 6M messages/month, 200 concurrent connections | About 20 full 10-player tables at the same time |
| [Neon Free](https://neon.com/pricing) | 0.5 GB storage, 100 CU-hours/month, scales to zero after 5 minutes idle | The first move after an idle spell takes about a second |
| Vercel Hobby | Free for non-commercial use | Fine for playing with friends |

## Optional: real shout voices with ElevenLabs

The game plays `public/sfx/uno.mp3` and `public/sfx/caught.mp3` when they exist. Otherwise it falls back to the browser's built-in voice. To generate the clips with ElevenLabs (the free plan works), run:

```bash
ELEVENLABS_API_KEY=your-key npm run voices
```

On Windows PowerShell, set the key first with `$env:ELEVENLABS_API_KEY="your-key"`, then run `npm run voices`.

The script uses the `eleven_v3` model with a `[shouts]` audio tag, so the result is an actual shout. If v3 fails, it falls back to `eleven_multilingual_v2`. To use a different voice from your library, set `ELEVENLABS_VOICE_ID`. Commit the two mp3 files and redeploy. Check ElevenLabs' terms for the plan you use.

## How it works

```
Browser (Next.js page)                 Vercel route handlers                     Neon Postgres
 ├─ R3F 3D scene + HTML HUD   ──POST──► /api/rooms/[code]/action  ── load ──►  rooms(state jsonb, version)
 ├─ Zustand store (versioned views)     ├─ engine.applyAction() — pure TS      ◄─ UPDATE … WHERE version = v
 └─ Ably client (scoped token) ◄──────  └─ Ably batch publish → one private channel per player
```

- **The server decides everything.** The rules engine in `src/engine` is pure TypeScript. The deck order and other players' hands never leave the server.
- **One room is one database row.** Each change is an optimistic-locking update (`version`), retried on conflict.
- **Timers and bots without a server process.** Each turn has a `deadline`. A connected client calls `/tick` when it passes, and the server re-checks the deadline before acting.
- **Dev fallbacks.** Without `DATABASE_URL` and `ABLY_API_KEY`, `src/server/store.ts` uses memory and `src/server/realtime.ts` streams Server-Sent Events.

```
src/engine   rules engine (types, deck, effects/*, reducer, bots, views) + tests
src/server   room service, Neon store, Ably/dev realtime, guest sessions, API helpers
src/app      pages (/ and /r/[code]) and API routes
src/client   API client, realtime transport, game store, clock sync
src/scene    3D: table, cards (canvas-drawn faces), layout, actors, effects, camera
src/ui       HUD, lobby, rules panel, chat, scoreboard
src/audio    Web Audio sound effects, music loop, voice clips
```

To rename the game, edit `src/brand.ts`. It holds the game name and the shout label. "UNO" is a Mattel trademark, which is why the game is called NEONO and uses its own card art.
