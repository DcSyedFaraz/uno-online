import type { RuleSettings, ExtraCardKey } from "./rules";
import { COLORS, type Card, type CardKind, type Color } from "./types";

/**
 * Card counts for ONE deck. Classic counts are official (108 cards).
 * Extra-card counts follow the proportions of the No Mercy deck and are only
 * added when that card's switch is on.
 */
export const EXTRA_CARD_COUNTS: Record<ExtraCardKey, { kind: CardKind; perColor?: number; wild?: number }> = {
  discardAll: { kind: "discard_all", perColor: 2 },
  skipAll: { kind: "skip_all", perColor: 2 },
  draw4Color: { kind: "draw4", perColor: 2 },
  wildReverse4: { kind: "wild_reverse4", wild: 8 },
  wild6: { kind: "wild6", wild: 4 },
  wild10: { kind: "wild10", wild: 4 },
  roulette: { kind: "wild_roulette", wild: 8 },
};

export const CLASSIC_DECK_SIZE = 108;

type CardSpec = Omit<Card, "id">;

export function deckSpecs(settings: RuleSettings): CardSpec[] {
  const specs: CardSpec[] = [];
  for (const color of COLORS) {
    specs.push({ kind: "number", color, value: 0 });
    for (let v = 1; v <= 9; v++) {
      specs.push({ kind: "number", color, value: v }, { kind: "number", color, value: v });
    }
    for (const kind of ["skip", "reverse", "draw2"] as const) {
      specs.push({ kind, color }, { kind, color });
    }
  }
  for (let i = 0; i < 4; i++) specs.push({ kind: "wild", color: null }, { kind: "wild4", color: null });

  for (const [key, spec] of Object.entries(EXTRA_CARD_COUNTS) as [ExtraCardKey, (typeof EXTRA_CARD_COUNTS)[ExtraCardKey]][]) {
    if (!settings.cards[key]) continue;
    if (spec.perColor) {
      for (const color of COLORS) for (let i = 0; i < spec.perColor; i++) specs.push({ kind: spec.kind, color: color as Color });
    }
    if (spec.wild) for (let i = 0; i < spec.wild; i++) specs.push({ kind: spec.kind, color: null });
  }
  return specs;
}

export function hasExtraDrawCards(settings: RuleSettings): boolean {
  const c = settings.cards;
  return c.draw4Color || c.wildReverse4 || c.wild6 || c.wild10;
}

/** Auto deck count: 2 decks at 7+ players (or with extra draw cards at 5+), 3 for huge hands. */
export function resolveDeckCount(settings: RuleSettings, playerCount: number): number {
  if (settings.deckCount !== "auto") return settings.deckCount;
  const needed = playerCount * settings.handSize * 2.5 + (hasExtraDrawCards(settings) ? playerCount * 8 : 0);
  return Math.min(3, Math.max(1, Math.ceil(needed / CLASSIC_DECK_SIZE)));
}

export function buildDeck(settings: RuleSettings, playerCount: number, startId = 0): Card[] {
  const decks = resolveDeckCount(settings, playerCount);
  const specs = deckSpecs(settings);
  const cards: Card[] = [];
  let id = startId;
  for (let d = 0; d < decks; d++) {
    for (const s of specs) cards.push({ ...s, id: `c${id++}` });
  }
  return cards;
}
