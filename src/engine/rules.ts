import { z } from "zod";

/**
 * Room rule settings. Defaults are pure classic: every optional rule starts off,
 * and the engine reads each switch independently (there are no bundles).
 */
export const ruleSettingsSchema = z.object({
  // ── basic ──
  handSize: z.number().int().min(5).max(10),
  turnTimerSec: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(45), z.literal(60)]),
  winMode: z.enum(["single", "points"]),
  targetPoints: z.number().int().min(100).max(2000),
  deckCount: z.union([z.literal("auto"), z.literal(1), z.literal(2), z.literal(3)]),

  // ── more rules ──
  stacking: z.enum(["off", "same", "mixed", "higher"]),
  sevenSwap: z.boolean(),
  zeroRotate: z.boolean(),
  jumpIn: z.boolean(),
  drawUntilPlayable: z.boolean(),
  forcePlayDrawn: z.boolean(),
  wild4Mode: z.enum(["challenge", "free", "restricted"]),
  cards: z.object({
    wildReverse4: z.boolean(),
    discardAll: z.boolean(),
    skipAll: z.boolean(),
    draw4Color: z.boolean(),
    wild6: z.boolean(),
    wild10: z.boolean(),
    roulette: z.boolean(),
  }),
  mercyRule: z.boolean(),
  mercyLimit: z.number().int().min(15).max(40),
  unoPenalty: z.number().int().min(1).max(6),
  afkAutopilot: z.boolean(),
  afkThreshold: z.number().int().min(1).max(5),
});

export type RuleSettings = z.infer<typeof ruleSettingsSchema>;
export type ExtraCardKey = keyof RuleSettings["cards"];

export const CLASSIC_SETTINGS: RuleSettings = {
  handSize: 7,
  turnTimerSec: 30,
  winMode: "single",
  targetPoints: 500,
  deckCount: "auto",

  stacking: "off",
  sevenSwap: false,
  zeroRotate: false,
  jumpIn: false,
  drawUntilPlayable: false,
  forcePlayDrawn: false,
  wild4Mode: "challenge",
  cards: {
    wildReverse4: false,
    discardAll: false,
    skipAll: false,
    draw4Color: false,
    wild6: false,
    wild10: false,
    roulette: false,
  },
  mercyRule: false,
  mercyLimit: 25,
  unoPenalty: 2,
  afkAutopilot: false,
  afkThreshold: 2,
};

/** Settings keys that are "basic" (not part of the More rules panel). */
const BASIC_KEYS = ["handSize", "turnTimerSec", "winMode", "targetPoints", "deckCount"] as const;

/** Partial update schema used by the host's update_settings action. */
export const settingsPatchSchema = ruleSettingsSchema
  .omit({ cards: true })
  .partial()
  .extend({ cards: ruleSettingsSchema.shape.cards.partial().optional() });

export function mergeSettings(base: RuleSettings, patch: unknown): RuleSettings {
  const parsed = settingsPatchSchema.parse(patch);
  const { cards, ...rest } = parsed;
  return ruleSettingsSchema.parse({ ...base, ...rest, cards: { ...base.cards, ...(cards ?? {}) } });
}

/** Keep the basic settings, reset every optional rule back to classic. */
export function resetToClassic(s: RuleSettings): RuleSettings {
  const next: RuleSettings = structuredClone(CLASSIC_SETTINGS);
  for (const k of BASIC_KEYS) (next as Record<string, unknown>)[k] = s[k];
  return next;
}

export const EXTRA_CARD_LABELS: Record<ExtraCardKey, string> = {
  wildReverse4: "Reverse +4",
  discardAll: "Discard All",
  skipAll: "Skip Everyone",
  draw4Color: "Color +4",
  wild6: "+6",
  wild10: "+10",
  roulette: "Color Roulette",
};

export const STACKING_LABELS: Record<RuleSettings["stacking"], string> = {
  off: "Off",
  same: "Same card (+2 on +2, +4 on +4)",
  mixed: "+2 and +4 on each other",
  higher: "Equal or higher (+2 < +4 < +6 < +10)",
};

/** Short chips describing every non-classic rule that is on (for the in-game rules chip). */
export function activeExtras(s: RuleSettings): string[] {
  const out: string[] = [];
  if (s.stacking !== "off") {
    out.push(
      s.stacking === "same" ? "Stacking (same card)" : s.stacking === "mixed" ? "Stacking +2/+4" : "Stacking (higher)",
    );
  }
  if (s.sevenSwap) out.push("7 swaps hands");
  if (s.zeroRotate) out.push("0 rotates hands");
  if (s.jumpIn) out.push("Jump-in");
  if (s.drawUntilPlayable) out.push("Draw until playable");
  if (s.forcePlayDrawn) out.push("Must play drawn card");
  if (s.wild4Mode === "free") out.push("Wild +4 anytime");
  if (s.wild4Mode === "restricted") out.push("Wild +4 restricted");
  for (const [k, on] of Object.entries(s.cards) as [ExtraCardKey, boolean][]) {
    if (on) out.push(EXTRA_CARD_LABELS[k]);
  }
  if (s.mercyRule) out.push(`Mercy rule (${s.mercyLimit})`);
  if (s.unoPenalty !== 2) out.push(`Shout penalty +${s.unoPenalty}`);
  if (s.afkAutopilot) out.push("AFK autopilot");
  return out;
}

export function isClassic(s: RuleSettings): boolean {
  return activeExtras(s).length === 0;
}
