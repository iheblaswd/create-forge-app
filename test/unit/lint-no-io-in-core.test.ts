import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cwd = fileURLToPath(new URL("../../", import.meta.url));

// First ESLint boot (config + typescript-eslint) takes 2-3 s on a cold cache under parallel load.
const ESLINT_TIMEOUT_MS = 20_000;

async function lintVirtualFile(filePath: string, code: string) {
  const eslint = new ESLint({ cwd });
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === "no-restricted-imports") ?? [];
}

describe("lint rule: no I/O in src/core/* except src/core/sources", () => {
  it.each(["node:fs", "node:child_process", "node:http", "fs", "node:fs/promises"])(
    "fails when src/core/planner imports %s",
    async (mod) => {
      const messages = await lintVirtualFile("src/core/planner/x.ts", `import "${mod}";\n`);
      expect(messages).toHaveLength(1);
      expect(messages[0]?.message).toContain("No I/O in src/core/*");
    },
    ESLINT_TIMEOUT_MS,
  );

  it("allows src/core/sources to import node:fs", async () => {
    const messages = await lintVirtualFile("src/core/sources/x.ts", 'import "node:fs";\n');
    expect(messages).toHaveLength(0);
  }, ESLINT_TIMEOUT_MS);

  it("allows src/core to import node:path (no I/O)", async () => {
    const messages = await lintVirtualFile("src/core/apply/x.ts", 'import "node:path";\n');
    expect(messages).toHaveLength(0);
  }, ESLINT_TIMEOUT_MS);
});
