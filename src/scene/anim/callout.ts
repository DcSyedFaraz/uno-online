import type { Card, Color, GameEvent, PublicView } from "@/engine";
import { drawValue } from "@/engine/cards";
import { playerName } from "@/client/store/game-store";
import { COLOR_HEX } from "../sceneStore";

/** What the big center callout shows for one move. */
export interface CalloutSpec {
  /** short glyph on the colored tile: ⊘, ⇄, +4, … ("wheel" draws the four-color wheel) */
  icon: string;
  title: string;
  /** one plain sentence: who it hits and what happens next */
  sub: string;
  /** tile color */
  color: string;
}

const COLOR_NAME: Record<Color, string> = { red: "RED", yellow: "YELLOW", green: "GREEN", blue: "BLUE" };

/**
 * Turns the events of one move into a single headline, so action and wild cards say
 * what just happened ("SKIP! Kilo loses a turn") instead of leaving players to guess.
 * Returns null for plain moves (number cards, ordinary draws).
 */
export function describeMove(ev: GameEvent[], next: PublicView, you: string | null): CalloutSpec | null {
  const name = (pid: string | null | undefined) => playerName(next, pid, you);
  /** "You lose a turn" / "Kilo loses a turn" */
  const says = (pid: string | null | undefined, youForm: string, otherForm: string) => `${name(pid)} ${pid === you ? youForm : otherForm}`;

  let card: Card | null = null;
  let by: string | null = null;
  let jumpIn = false;
  let color: Color | null = null;
  let colorBy: string | null = null;
  let skipped: string[] = [];
  let reversed: 1 | -1 | null = null;
  let stack = 0;
  let penalty: { pid: string; count: number } | null = null;
  let start = false;

  for (const e of ev) {
    switch (e.t) {
      case "start_card":
        card = e.card;
        start = true;
        break;
      case "play":
        card = e.card;
        by = e.pid;
        jumpIn = !!e.jumpIn;
        break;
      case "color":
        color = e.color;
        colorBy = e.pid;
        break;
      case "skip":
        skipped = e.pids;
        break;
      case "reverse":
        reversed = e.direction;
        break;
      case "stack":
        stack = e.total;
        break;
      case "draw":
        if (e.reason === "penalty") penalty = { pid: e.pid, count: e.count };
        break;
      case "challenge":
        return e.guilty
          ? { icon: "⚖", title: "BUSTED!", sub: `${says(e.offender, "were bluffing", "was bluffing")} and draws 4`, color: COLOR_HEX.red }
          : { icon: "⚖", title: "FAIR PLAY!", sub: `${says(e.victim, "draw", "draws")} 6 for the failed challenge`, color: COLOR_HEX.blue };
      case "roulette":
        return {
          icon: "wheel",
          title: "ROULETTE!",
          sub: `${says(e.pid, "flip", "flips")} ${e.cards.length} card${e.cards.length === 1 ? "" : "s"} to find ${COLOR_NAME[e.color]}`,
          color: COLOR_HEX[e.color],
        };
      case "swap":
        return { icon: "⇄", title: "SWAP HANDS!", sub: `${name(e.a)} ↔ ${name(e.b)}`, color: COLOR_HEX.wild };
      case "rotate":
        return { icon: e.direction === 1 ? "↻" : "↺", title: "PASS HANDS!", sub: `Everyone passes their hand ${e.direction === 1 ? "clockwise" : "counter-clockwise"}`, color: COLOR_HEX.wild };
      case "discard_all":
        return {
          icon: "ALL",
          title: "DISCARD ALL!",
          sub: `${says(e.pid, "dump", "dumps")} ${e.cards.length} more ${e.cards[0]?.color ?? ""} card${e.cards.length === 1 ? "" : "s"}`,
          color: e.cards[0]?.color ? COLOR_HEX[e.cards[0].color] : COLOR_HEX.wild,
        };
    }
  }

  // a wild's color chosen on its own (e.g. the first card was a wild)
  if (!card && color) return { icon: "wheel", title: "NEW COLOR", sub: `${says(colorBy, "picked", "picked")} ${COLOR_NAME[color]}`, color: COLOR_HEX[color] };
  if (!card || card.kind === "number") {
    return card && jumpIn ? { icon: String(card.value ?? ""), title: "JUMP-IN!", sub: `${name(by)} jumped in out of turn`, color: card.color ? COLOR_HEX[card.color] : COLOR_HEX.wild } : null;
  }

  const tile = card.color ? COLOR_HEX[card.color] : color ? COLOR_HEX[color] : COLOR_HEX.wild;
  const lead = start ? "First card: " : "";
  const picked = color && colorBy ? `${says(colorBy, "picked", "picked")} ${COLOR_NAME[color]}` : null;
  const join = (...parts: (string | null | false)[]) => parts.filter(Boolean).join(" · ");
  const victim = skipped[0];
  const dir = (d: 1 | -1) => (d === 1 ? "clockwise ↻" : "counter-clockwise ↺");

  switch (card.kind) {
    case "skip":
      return { icon: "⊘", title: `${lead}SKIP!`, sub: says(victim, "lose a turn", "loses a turn"), color: tile };
    case "skip_all":
      return { icon: "⊘", title: "SKIP ALL!", sub: `Everyone is skipped · ${says(by, "go", "goes")} again`, color: tile };
    case "reverse":
      return {
        icon: "⇄",
        title: `${lead}REVERSE!`,
        sub: victim && reversed === null ? says(victim, "are skipped", "is skipped") : victim ? `${says(victim, "are skipped", "is skipped")} (2 players)` : `Play now goes ${dir(reversed ?? next.direction)}`,
        color: tile,
      };
    case "wild":
      return { icon: "wheel", title: "WILD!", sub: picked ?? "A new color will be picked", color: tile };
    case "wild_roulette":
      return { icon: "wheel", title: "COLOR ROULETTE!", sub: `${says(next.turnPlayerId, "name", "names")} a color, then flips until it shows`, color: COLOR_HEX.wild };
    default: {
      const n = drawValue(card);
      if (!n) return null;
      const wild = card.color === null;
      const hit = penalty
        ? `${says(penalty.pid, "draw", "draws")} ${penalty.count} and ${penalty.pid === you ? "are" : "is"} skipped`
        : stack
          ? `${name(next.turnPlayerId)} must stack or take +${stack}${next.turn.kind === "stack" && next.turn.challengeable ? " (or challenge)" : ""}`
          : null;
      return {
        icon: `+${n}`,
        title: `${lead}${wild ? `WILD +${n}!` : `+${n}!`}`,
        sub: join(card.kind === "wild_reverse4" && reversed && `Reversed ${dir(reversed)}`, picked, hit) || "Draw cards!",
        color: tile,
      };
    }
  }
}
