import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// FORGE-8: the CI workflow is infra-as-files and must keep its contract
// (triggers, Node 22, frozen lockfile, lint + check + test, cache, concurrency).
// Checked as text on purpose: no YAML parser dependency in the CLI.
const workflow = readFileSync(
  new URL("../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

const pkg = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { scripts: Record<string, string>; packageManager?: string };

describe(".github/workflows/ci.yml (FORGE-8)", () => {
  it("is named 'ci' so branch protection can require a single status", () => {
    expect(workflow).toMatch(/^name: ci$/m);
    expect(workflow).toMatch(/^\s+name: ci$/m);
  });

  it("runs on push to main and on pull requests", () => {
    expect(workflow).toMatch(/^on:\n\s+push:\n\s+branches: \[main\]\n\s+pull_request:/m);
  });

  it("cancels superseded runs per ref", () => {
    expect(workflow).toMatch(/group: ci-\$\{\{ github\.ref \}\}/);
    expect(workflow).toMatch(/cancel-in-progress: true/);
  });

  it("uses Node 22 with the pnpm store cached", () => {
    expect(workflow).toMatch(/node-version: 22/);
    expect(workflow).toMatch(/cache: pnpm/);
    expect(workflow).toMatch(/cache-dependency-path: pnpm-lock\.yaml/);
  });

  it("installs pnpm via corepack from package.json packageManager", () => {
    expect(pkg.packageManager).toMatch(/^pnpm@/);
    expect(workflow).toMatch(/run: corepack enable/);
    // corepack must be enabled before setup-node's pnpm cache lookup.
    expect(workflow.indexOf("corepack enable")).toBeLessThan(
      workflow.indexOf("cache: pnpm"),
    );
  });

  it("installs with a frozen lockfile", () => {
    expect(workflow).toMatch(/run: pnpm install --frozen-lockfile/);
  });

  it.each(["lint", "check", "test"])("runs `pnpm %s`, which exists in package.json", (script) => {
    expect(pkg.scripts[script]).toBeDefined();
    expect(workflow).toMatch(new RegExp(`run: pnpm ${script}$`, "m"));
  });

  it("runs install before lint, check and test", () => {
    const at = (s: string) => workflow.indexOf(s);
    expect(at("pnpm install")).toBeLessThan(at("run: pnpm lint"));
    expect(at("run: pnpm lint")).toBeLessThan(at("run: pnpm check"));
    expect(at("run: pnpm check")).toBeLessThan(at("run: pnpm test"));
  });
});
