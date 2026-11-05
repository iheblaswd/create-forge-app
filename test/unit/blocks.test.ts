import { describe, expect, it } from "vitest";
import { BlockError, hasMarkers, parseMarker, stripBlocks } from "../../src/core/apply/index.js";
import { evaluateCondition } from "../../src/core/planner/index.js";

const selection = { auth: "jwt", email: "none", frontend: "next" };
const holds = (c: string) => evaluateCondition(c, selection);

describe("parseMarker", () => {
  it.each([
    ["<!-- forge:if auth=jwt -->", { kind: "if", condition: "auth=jwt" }],
    ["  # forge:if email=smtp|resend", { kind: "if", condition: "email=smtp|resend" }],
    ["// forge:if frontend=next", { kind: "if", condition: "frontend=next" }],
    ["      {/* forge:if auth!=none */}", { kind: "if", condition: "auth!=none" }],
    ["/* forge:end */", { kind: "end" }],
    ["# forge:end", { kind: "end" }],
    ["<!-- forge:end -->", { kind: "end" }],
  ])("%s", (line, expected) => {
    expect(parseMarker(line)).toEqual(expected);
  });

  it.each(["const x = 1; // forge:if auth=jwt", "# forge:if", "# forge:ifauth=jwt", "DATABASE_URL=postgresql://forge:forge@localhost"])(
    "ignores %s",
    (line) => {
      expect(parseMarker(line)).toBeUndefined();
    },
  );
});

describe("stripBlocks", () => {
  it("keeps holding blocks, drops the others, always removes markers (XML, YAML, TS, JSX)", () => {
    const text = [
      "<a>",
      "  <!-- forge:if auth=jwt -->",
      "  <jwt/>",
      "  <!-- forge:end -->",
      "# forge:if email=smtp",
      "mail: on",
      "# forge:end",
      "  // forge:if frontend=next",
      "  web: true,",
      "  // forge:end",
      "  {/* forge:if auth=none */}",
      "  <Anonymous/>",
      "  {/* forge:end */}",
      "</a>",
    ].join("\n");
    expect(stripBlocks(text, "f", holds)).toBe(["<a>", "  <jwt/>", "  web: true,", "</a>"].join("\n"));
  });

  it("nested blocks: a line is kept only when every enclosing condition holds", () => {
    const text = ["# forge:if auth=jwt", "a", "# forge:if email=smtp", "b", "# forge:end", "c", "# forge:end"].join("\n");
    expect(stripBlocks(text, "f", holds)).toBe("a\nc");
  });

  it("starter-repository blocks are always removed", () => {
    expect(stripBlocks("x\n<!-- forge:if starter-repository -->\nsecret\n<!-- forge:end -->\ny", "f", holds)).toBe("x\ny");
  });

  it("removing a block never leaves a double blank line", () => {
    const text = ["# Title", "", "<!-- forge:if auth=none -->", "## Removed", "<!-- forge:end -->", "", "## Next"].join("\n");
    expect(stripBlocks(text, "README.md", holds)).toBe(["# Title", "", "## Next"].join("\n"));
  });

  it("keeps the trailing newline", () => {
    expect(stripBlocks("a\n# forge:if auth=none\nb\n# forge:end\n", "f", holds)).toBe("a\n");
  });

  it("unclosed block: BlockError with file and line of the forge:if", () => {
    expect(() => stripBlocks("a\n# forge:if auth=jwt\nb", "infra/compose.yaml", holds)).toThrowError(
      new BlockError("infra/compose.yaml", 2, "forge:if block is never closed (missing forge:end)"),
    );
  });

  it("stray forge:end: BlockError", () => {
    expect(() => stripBlocks("a\n# forge:end", "f", holds)).toThrow(/f:2: forge:end without a matching forge:if/);
  });

  it("invalid condition: BlockError with file and line", () => {
    expect(() => stripBlocks("# forge:if storage=r2\nx\n# forge:end", "f", holds)).toThrow(/f:1: .*unknown module "storage"/);
  });

  it("hasMarkers is false for text that only mentions forge:", () => {
    expect(hasMarkers("url=postgresql://forge:forge@localhost")).toBe(false);
    expect(hasMarkers("a\n# forge:end")).toBe(true);
  });
});
