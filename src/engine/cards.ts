import type { Card, CardKind, Color } from "./types";

const WILD_KINDS: ReadonlySet<CardKind> = new Set(["wild", "wild4", "wild_reverse4", "wild6", "wild10", "wild_roulette"]);

export function isWild(card: Card): boolean {
  return WILD_KINDS.has(card.kind);
}

/** How many cards a draw card forces; 0 for non-draw cards. */
export function drawValue(card: Card): number {
  switch (card.kind) {
    case "draw2":
      return 2;
    case "wild4":
    case "draw4":
    case "wild_reverse4":
      return 4;
    case "wild6":
      return 6;
    case "wild10":
      return 10;
    default:
      return 0;
  }
}

export function isDrawCard(card: Card): boolean {
  return drawValue(card) > 0;
}

/** Same number/symbol (ignores color). */
export function sameSymbol(a: Card, b: Card): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== "number" || a.value === b.value;
}

/** Same color and same number/symbol, as required for jump-in. */
export function identical(a: Card, b: Card): boolean {
  return a.color !== null && a.color === b.color && sameSymbol(a, b);
}

/** Basic matching rule: same color, same number/symbol, or any wild. */
export function matches(card: Card, top: Card, currentColor: Color | null): boolean {
  if (isWild(card)) return true;
  if (currentColor && card.color === currentColor) return true;
  if (!isWild(top) && sameSymbol(card, top)) return true;
  return false;
}

export function cardPoints(card: Card): number {
  if (card.kind === "number") return card.value ?? 0;
  if (isWild(card)) return 50;
  return 20;
}

/** Stable key for the visual face of a card (used for texture caching). */
export function faceKey(card: Pick<Card, "kind" | "color" | "value">): string {
  return `${card.color ?? "wild"}:${card.kind}${card.kind === "number" ? card.value : ""}`;
}

export function cardLabel(card: Card): string {
  const color = card.color ? card.color[0].toUpperCase() + card.color.slice(1) + " " : "";
  switch (card.kind) {
    case "number":
      return `${color}${card.value}`;
    case "skip":
      return `${color}Skip`;
    case "reverse":
      return `${color}Reverse`;
    case "draw2":
      return `${color}+2`;
    case "draw4":
      return `${color}+4`;
    case "skip_all":
      return `${color}Skip Everyone`;
    case "discard_all":
      return `${color}Discard All`;
    case "wild":
      return "Wild";
    case "wild4":
      return "Wild +4";
    case "wild_reverse4":
      return "Wild Reverse +4";
    case "wild6":
      return "Wild +6";
    case "wild10":
      return "Wild +10";
    case "wild_roulette":
      return "Wild Color Roulette";
  }
}
