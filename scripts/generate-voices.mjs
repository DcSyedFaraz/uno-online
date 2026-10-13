// Generates the shout voice clips with ElevenLabs and saves them to public/sfx/.
//
//   ELEVENLABS_API_KEY=your-key npm run voices
//
// Optional: ELEVENLABS_VOICE_ID (pick any voice from your ElevenLabs voice library).
// The game plays these files automatically when they exist and falls back to the
// browser's built-in voice when they don't, so this step is optional.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error("Set ELEVENLABS_API_KEY first (create a free key at https://elevenlabs.io → Profile → API keys).");
  process.exit(1);
}
const voice = process.env.ELEVENLABS_VOICE_ID ?? "pNInz6obpgDQGcFmaJgB";

// eleven_v3 understands audio tags like [shouts]; older models just read the text.
const LINES = {
  uno: { v3: "[shouts] UNO!!", plain: "UNO!!" },
  caught: { v3: "[laughs] [shouts] Gotcha! Draw two!", plain: "Gotcha! Draw two!" },
};

async function tts(text, model) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: { stability: 0.3, similarity_boost: 0.75, style: 0.9, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`${model}: ${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

const out = path.join(process.cwd(), "public", "sfx");
await mkdir(out, { recursive: true });
for (const [name, line] of Object.entries(LINES)) {
  let audio;
  try {
    audio = await tts(line.v3, "eleven_v3");
  } catch (e) {
    console.warn(`eleven_v3 failed (${e.message.slice(0, 120)}), trying eleven_multilingual_v2…`);
    audio = await tts(line.plain, "eleven_multilingual_v2");
  }
  await writeFile(path.join(out, `${name}.mp3`), audio);
  console.log(`saved public/sfx/${name}.mp3 (${Math.round(audio.length / 1024)} KB)`);
}
