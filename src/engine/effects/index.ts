import type { CardKind } from "../types";
import { discardAllEffect } from "./discardAll";
import { drawEffect } from "./draw";
import { numberEffect } from "./numbers";
import { reverseEffect } from "./reverse";
import { skipAllEffect, skipEffect } from "./skip";
import type { Effect } from "./types";
import { rouletteEffect, wildEffect } from "./wild";

export const EFFECTS: Record<CardKind, Effect> = {
  number: numberEffect,
  skip: skipEffect,
  reverse: reverseEffect,
  draw2: drawEffect,
  wild: wildEffect,
  wild4: drawEffect,
  skip_all: skipAllEffect,
  discard_all: discardAllEffect,
  draw4: drawEffect,
  wild_reverse4: drawEffect,
  wild6: drawEffect,
  wild10: drawEffect,
  wild_roulette: rouletteEffect,
};

export { discardMatching } from "./discardAll";
export type { PlayOptions } from "./types";
