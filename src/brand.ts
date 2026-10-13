/** Rename the game in one place. "UNO" is a Mattel trademark, so NEONO uses its own name and art. */
export const BRAND = {
  name: "NEONO",
  tagline: "The neon card game. Up to 10 friends, one link.",
  /** label on the last-card shout button (change it here if you'd rather not use the word "UNO") */
  shout: "UNO!",
} as const;

export const NEON = {
  red: "#ff3b5c",
  yellow: "#ffd23f",
  green: "#2bff88",
  blue: "#3b9eff",
  wild: "#b56bff",
} as const;
