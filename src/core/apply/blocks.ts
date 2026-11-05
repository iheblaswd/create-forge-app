/**
 * Conditional blocks (CLAUDE.md 4.4). A block starts with a `forge:if <condition>` marker and
 * ends with a `forge:end` marker, each alone on its line, in the comment syntax of the file:
 *
 *   XML / HTML / Markdown   <!-- forge:if auth=jwt -->         <!-- forge:end -->
 *   YAML / env / shell      # forge:if email=smtp              # forge:end
 *   TS / JS / Java          // forge:if frontend=next          // forge:end
 *   JSX                     {/* forge:if frontend=next *\/}    {/* forge:end *\/}
 *
 * The block's lines are kept when the condition holds, removed otherwise; marker lines are
 * always removed. Blocks may nest: a line is kept only when every enclosing condition holds.
 * Pure: no I/O.
 */

export class BlockError extends Error {
  constructor(
    readonly file: string,
    readonly line: number,
    readonly reason: string,
  ) {
    super(`${file}:${line}: ${reason}`);
    this.name = "BlockError";
  }
}

type Marker = { kind: "if"; condition: string } | { kind: "end" };

const MARKER_SHAPES: ReadonlyArray<readonly [open: string, close: string]> = [
  ["<!--", "-->"],
  ["{/*", "*/}"],
  ["/*", "*/"],
  ["//", ""],
  ["#", ""],
];

/** Parse one line as a marker, or return undefined when it is ordinary content. */
export function parseMarker(line: string): Marker | undefined {
  const trimmed = line.trim();
  for (const [open, close] of MARKER_SHAPES) {
    if (!trimmed.startsWith(open) || !trimmed.endsWith(close)) continue;
    const inner = trimmed.slice(open.length, trimmed.length - close.length).trim();
    if (inner === "forge:end") return { kind: "end" };
    if (inner.startsWith("forge:if ")) {
      const condition = inner.slice("forge:if ".length).trim();
      if (condition.length > 0) return { kind: "if", condition };
    }
  }
  return undefined;
}

/** True when the text contains at least one marker line (cheap pre-check before stripping). */
export function hasMarkers(text: string): boolean {
  if (!text.includes("forge:")) return false;
  return text.split("\n").some((line) => parseMarker(line) !== undefined);
}

/**
 * Remove every conditional block whose condition does not hold and every marker line.
 * `holds(condition)` decides a condition (usually `evaluateCondition(c, selection)`);
 * it may throw for an invalid condition, reported with file and line.
 * Throws BlockError for an unclosed block or a stray `forge:end`.
 */
export function stripBlocks(text: string, file: string, holds: (condition: string) => boolean): string {
  const lines = text.split("\n");
  const out: string[] = [];
  const stack: Array<{ line: number; keep: boolean }> = [];
  // Set when lines were dropped since the last kept line: a blank line that would follow
  // another blank line is dropped too, so removing a block never leaves a double gap.
  let dropped = false;

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const marker = parseMarker(line);
    if (marker?.kind === "if") {
      let keep: boolean;
      try {
        keep = holds(marker.condition);
      } catch (error) {
        throw new BlockError(file, lineNo, error instanceof Error ? error.message : String(error));
      }
      stack.push({ line: lineNo, keep });
      dropped = true;
      return;
    }
    if (marker?.kind === "end") {
      if (stack.pop() === undefined) throw new BlockError(file, lineNo, "forge:end without a matching forge:if");
      dropped = true;
      return;
    }
    if (!stack.every((block) => block.keep)) {
      dropped = true;
      return;
    }
    if (dropped && line.trim() === "" && (out.length === 0 || out.at(-1)?.trim() === "")) return;
    dropped = false;
    out.push(line);
  });

  const unclosed = stack.at(-1);
  if (unclosed) throw new BlockError(file, unclosed.line, "forge:if block is never closed (missing forge:end)");
  return out.join("\n");
}
