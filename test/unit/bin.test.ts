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
  it("prints the package name and version and exits 0", () => {
    const out = execFileSync(process.execPath, ["bin/create.mjs"], { cwd: root, encoding: "utf8" });
    expect(out.trim()).toBe(`${pkg.name} v${pkg.version}`);
  });
});

describe("package.json", () => {
  it("is an ESM package exposing the create-forge-app bin for Node >= 22", () => {
    expect(pkg.type).toBe("module");
    expect(pkg.bin["create-forge-app"]).toBe("bin/create.mjs");
    expect(pkg.engines.node).toBe(">=22");
  });
});
