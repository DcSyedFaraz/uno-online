/** A move that breaks the rules. The message is shown to the player. */
export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}

export function assertRule(cond: unknown, message: string): asserts cond {
  if (!cond) throw new RuleError(message);
}
