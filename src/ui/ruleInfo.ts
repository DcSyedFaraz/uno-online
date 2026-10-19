import type { ExtraCardKey, RuleSettings } from "@/engine";

/** Plain-language explanations shown as tooltips in the rules panel and the in-game rules sheet. */
export const RULE_HELP = {
  handSize: "How many cards everyone is dealt at the start of a round.",
  turnTimerSec: "If a player doesn't move in time they automatically draw a card (or take the penalty).",
  roundTimerMin:
    "The longest a round can last. When time runs out, whoever holds the fewest card points wins (numbers count face value, action cards 20, wilds 50). In the last minute the turn timer halves and bots play twice as fast.",
  teamPlay:
    "Play in pairs (up to 5 teams). Partners sit opposite each other, see each other's cards, and win together when either one goes out. Invite a partner in the lobby; anyone left over is paired up at the start.",
  winMode: "Single round: first to empty their hand wins. Points: the winner scores everyone else's leftover cards; first to the target wins.",
  deckCount: "Auto adds a second deck for big tables (7+ players) and a third for huge hands.",
  stacking:
    "When someone plays a draw card on you, you may answer with another draw card instead of drawing. The total keeps growing until someone can't stack and has to take it all (drawn automatically).",
  sevenSwap: "Playing a 7 lets you swap your whole hand with a player you choose.",
  zeroRotate: "Playing a 0 makes everyone pass their hand to the next player in the direction of play.",
  jumpIn: "If you hold the exact same card as the one just played (same color and symbol), you can throw it in out of turn. Play continues from you.",
  drawUntilPlayable: "Instead of drawing one card, keep drawing until you get one you can play.",
  forcePlayDrawn: "If the card you drew can be played, you must play it.",
  wild4Mode:
    "Challenge (official): the next player may challenge a Wild +4. If the player had a card of the current color, they draw 4 instead; otherwise the challenger draws 6.",
  mercyRule: "Anyone who reaches the card limit is knocked out of the round. Their cards go back into the deck.",
  unoPenalty: "Cards drawn when someone catches you not shouting with one card left.",
  afkAutopilot: "After this many timeouts in a row, a bot plays for the idle player until they're back.",
} satisfies Partial<Record<keyof RuleSettings, string>>;

export const CARD_HELP: Record<ExtraCardKey, { title: string; text: string }> = {
  wildReverse4: { title: "Wild Reverse +4", text: "Reverses direction, then the new next player draws 4. Stackable — it can send a stack back the other way." },
  discardAll: { title: "Discard All", text: "Play it to also throw away every other card of that color in your hand." },
  skipAll: { title: "Skip Everyone", text: "Everyone else is skipped and you play again." },
  draw4Color: { title: "Color +4", text: "A colored +4 that matches by color like a +2. Can't be challenged." },
  wild6: { title: "Wild +6", text: "Next player draws 6 and loses their turn." },
  wild10: { title: "Wild +10", text: "Next player draws 10 and loses their turn." },
  roulette: { title: "Wild Color Roulette", text: "The next player names a color and flips cards until that color shows up, keeping every card flipped." },
};
