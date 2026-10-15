// Generates the shouted voice clips with ElevenLabs and saves them to public/sfx/.
//
//   npm run voices            (only creates clips that are missing)
//   npm run voices -- --force (regenerate everything)
//
// The key is read from ELEVENLABS_API_KEY in the environment, then from .env.local, then from
// the sibling projects listed below. Only that one variable is parsed; it is never printed
// or copied anywhere. Optional: ELEVENLABS_VOICE_ID picks a different voice.
// The game plays these files when they exist and falls back to the browser's voice when not.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FORCE = process.argv.includes("--force");
const KEY_FILES = [".env.local", "../runware-checking/.env", "../AiCreativeDirector/.env"];

async function findKey() {
  if (process.env.ELEVENLABS_API_KEY) return { key: process.env.ELEVENLABS_API_KEY, from: "environment" };
  for (const f of KEY_FILES) {
    try {
      const text = await readFile(path.resolve(process.cwd(), f), "utf8");
      const m = text.match(/^\s*ELEVENLABS_API_KEY\s*=\s*["']?([^"'\r\n#]+?)["']?\s*$/m);
      if (m && m[1] && !/your_|here/i.test(m[1])) return { key: m[1], from: f };
    } catch {
      // file missing: try the next one
    }
  }
  return null;
}

const found = await findKey();
if (!found) {
  console.error("No ELEVENLABS_API_KEY found (environment, .env.local, or the sibling project .env files).");
  process.exit(1);
}
const { key } = found;
console.log(`Using the ElevenLabs key from ${found.from}`);
const voice = process.env.ELEVENLABS_VOICE_ID ?? "pNInz6obpgDQGcFmaJgB";

// [shouts] is an audio tag understood by eleven_v4 / eleven_v3; older models just read the words.
const LINES = {
  uno: ["[shouts] UNO!!", "UNO!!"],
  caught: ["[laughs] [shouts] Gotcha! Draw two!", "Gotcha! Draw two!"],
  skip: ["[shouts] Skipped!", "Skipped!"],
  reverse: ["[shouts] Reverse!", "Reverse!"],
  draw2: ["[shouts] Plus two!", "Plus two!"],
  draw4: ["[shouts] Plus four!", "Plus four!"],
  wild: ["[shouts] Wild!", "Wild!"],
  wild4: ["[shouts] Wild, draw four!", "Wild, draw four!"],
  wild_reverse4: ["[shouts] Reverse, plus four!", "Reverse, plus four!"],
  wild6: ["[shouts] Plus six!", "Plus six!"],
  wild10: ["[shouts] Plus ten!", "Plus ten!"],
  skip_all: ["[shouts] Skip everyone!", "Skip everyone!"],
  discard_all: ["[shouts] Discard all!", "Discard all!"],
  wild_roulette: ["[shouts] Color roulette!", "Color roulette!"],
  swap: ["[shouts] Swap!", "Swap!"],
  rotate: ["[shouts] Pass it around!", "Pass it around!"],
  draw: ["[shouts] Draw cards!", "Draw cards!"],
};

const MODELS = ["eleven_v4", "eleven_v3", "eleven_multilingual_v2"];
let modelIdx = 0;

async function tts(text, plain, model) {
  const tagged = model === "eleven_v4" || model === "eleven_v3";
  // v4 rejects the legacy style / speaker-boost controls
  const settings =
    model === "eleven_v4"
      ? { stability: 0.3, similarity_boost: 0.8 }
      : { stability: 0.3, similarity_boost: 0.75, style: 0.9, use_speaker_boost: true };
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text: tagged ? text : plain, model_id: model, voice_settings: settings }),
  });
  if (!res.ok) throw new Error(`${model}: ${res.status} ${(await res.text()).slice(0, 160).replaceAll(key, "***")}`);
  return Buffer.from(await res.arrayBuffer());
}

const out = path.join(process.cwd(), "public", "sfx");
await mkdir(out, { recursive: true });
let made = 0;
let failed = 0;
for (const [name, [text, plain]] of Object.entries(LINES)) {
  const file = path.join(out, `${name}.mp3`);
  if (!FORCE && existsSync(file)) {
    console.log(`kept   public/sfx/${name}.mp3`);
    continue;
  }
  let audio = null;
  while (!audio && modelIdx < MODELS.length) {
    try {
      audio = await tts(text, plain, MODELS[modelIdx]);
    } catch (e) {
      console.warn(`${e.message} → trying ${MODELS[modelIdx + 1] ?? "nothing else"}`);
      modelIdx++;
    }
  }
  if (!audio) {
    failed++;
    continue;
  }
  await writeFile(file, audio);
  made++;
  console.log(`saved  public/sfx/${name}.mp3 (${Math.round(audio.length / 1024)} KB, ${MODELS[modelIdx]})`);
}
console.log(`\nDone: ${made} created, ${failed} failed.`);
process.exit(failed ? 1 : 0);
