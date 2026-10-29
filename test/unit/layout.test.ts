import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);

describe("repository layout (CLAUDE.md 4.5)", () => {
  it.each([
    "src/cli",
    "src/core/manifest",
    "src/core/sources",
    "src/core/selection",
    "src/core/planner",
    "src/core/apply",
    "src/core/merge",
    "src/steps",
    "src/utils",
    "test/unit",
    "test/fixtures",
    "test/integration",
  ])("has %s", (dir) => {
    expect(existsSync(new URL(dir, root))).toBe(true);
  });
});
