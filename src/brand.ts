/** Rename the game in one place. "UNO" is a Mattel trademark, so NEONO uses its own name and art. */
export const BRAND = {
  name: "NEONO",
  tagline: "The neon card game. Up to 10 friends, one link.",
  /** label on the last-card shout button (change it here if you'd rather not use the word "UNO") */
  shout: "UNO!",
} as const;

/** The four card colors plus wild: the one palette for cards, table, HUD and effects. */
export const NEON = {
  red: "#f0303a",
  yellow: "#ffcf1a",
  green: "#2fb84c",
  blue: "#1f74e8",
  wild: "#8a3ffc",
} as const;
