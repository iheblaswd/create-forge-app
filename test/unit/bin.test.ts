import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
  version: string;
  type: string;
  bin: Record<string, string>;
  engines: { node: string };
};

describe("bin/create.mjs", () => {
  it("--version prints the package name and version and exits 0", () => {
    const out = execFileSync(process.execPath, ["bin/create.mjs", "--version"], { cwd: root, encoding: "utf8" });
    expect(out.trim()).toBe(`${pkg.name} v${pkg.version}`);
  });

  it("--help lists the options of CLAUDE.md 5", () => {
    const out = execFileSync(process.execPath, ["bin/create.mjs", "--help"], { cwd: root, encoding: "utf8" });
    for (const option of ["--ref", "--template-dir", "--dry-run", "--yes", "--no-install", "--no-git"]) {
      expect(out).toContain(option);
    }
  });

  it("generates a project end to end from the mini-starter (--dry-run)", () => {
    const out = execFileSync(
      process.execPath,
      ["bin/create.mjs", "demo", "--template-dir", "test/fixtures/mini-starter", "--dry-run"],
      { cwd: root, encoding: "utf8" },
    );
    expect(out).toContain("Plan for demo (dry run, nothing written)");
  });
});

describe("package.json", () => {
  it("is an ESM package exposing the create-forge-app bin for Node >= 22", () => {
    expect(pkg.type).toBe("module");
    expect(pkg.bin["create-forge-app"]).toBe("bin/create.mjs");
    expect(pkg.bin["forge"]).toBe("bin/create.mjs");
    expect(pkg.engines.node).toBe(">=22");
  });
});
