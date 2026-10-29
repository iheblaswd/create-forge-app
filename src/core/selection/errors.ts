/**
 * A selection error a human can act on: which module, what is wrong and what to
 * pass instead. The message carries all of them (CLAUDE.md 7: cause + action).
 */
export class SelectionError extends Error {
  override readonly name = "SelectionError";

  constructor(
    readonly module: string,
    readonly reason: string,
    readonly hint: string,
  ) {
    super(`${reason}. ${hint}`);
  }
}
