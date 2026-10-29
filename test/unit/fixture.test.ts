import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { parseManifest, type Manifest } from "../../src/core/manifest/index.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "mini-starter");
const MANIFEST_FILE = "forge.template.json";

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [relative(FIXTURE, full).replaceAll("\\", "/")];
  });
}

function loadManifest(): Manifest {
  return parseManifest(JSON.parse(readFileSync(join(FIXTURE, MANIFEST_FILE), "utf8")), MANIFEST_FILE);
}

const isGlob = (path: string) => /[*?[\]{}]/.test(path);

function listedFiles(manifest: Manifest): string[] {
  const files = new Set<string>();
  for (const mod of Object.values(manifest.modules)) {
    for (const option of Object.values(mod.options)) option.files.forEach((f) => files.add(f));
  }
  manifest.conditional.forEach((f) => files.add(f));
  manifest.exclude.forEach((f) => files.add(f));
  for (const option of Object.values(manifest.modules).flatMap((m) => Object.values(m.options))) {
    Object.keys(option.maven).forEach((f) => files.add(f));
  }
  files.add(manifest.env.example);
  return [...files].filter((f) => !isGlob(f));
}

// Matches every block syntax of CLAUDE.md 4.4: XML comment, "# ", "// " and JSX "{/* ... */}" markers.
const MARKER = /forge:(if|end)\b[ \t]*([^\s*}]*)/g;

describe("mini-starter fixture (CLAUDE.md 4.4 / 4.5)", () => {
  const files = listFiles(FIXTURE);
  const manifest = loadManifest();

  it("AC1: has between 12 and 20 files, each documented in README.md with its owning option", () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
    expect(files.length).toBeLessThanOrEqual(20);
    const readme = readFileSync(join(FIXTURE, "README.md"), "utf8");
    for (const file of files) expect(readme, `README.md does not document ${file}`).toContain(`\`${file}\``);
  });

  it("AC2: forge.template.json is a valid schema 1 manifest with the expected modules", () => {
    expect(manifest.schema).toBe(1);
    expect(manifest.app.packageRoot).toBe("com.forge.starter");
    expect(Object.keys(manifest.modules)).toEqual(["auth", "email", "frontend", "deploy"]);
    expect(manifest.modules.auth?.default).toBe("jwt");
    expect(Object.keys(manifest.modules.auth?.options ?? {})).toEqual(["jwt", "none"]);
    expect(manifest.modules.email?.default).toBe("smtp");
    expect(manifest.modules.frontend?.default).toBe("next");
    expect(manifest.modules.deploy?.default).toBe("docker");
    expect(manifest.exclude.length).toBeGreaterThan(0);
    expect(manifest.conditional.length).toBeGreaterThan(0);
    expect(manifest.modules.auth?.options.jwt?.maven["apps/api/pom.xml"]?.length).toBeGreaterThan(0);
    expect(manifest.modules.auth?.options.jwt?.env.length).toBeGreaterThan(0);
  });

  it("AC3: every non-glob file cited by the manifest exists", () => {
    const listed = listedFiles(manifest);
    expect(listed.length).toBeGreaterThan(0);
    for (const file of listed) expect(existsSync(join(FIXTURE, file)), `${file} is listed but missing`).toBe(true);
  });

  it("AC3: every forge:if block is closed by a forge:end, in every file", () => {
    for (const file of files) {
      const content = readFileSync(join(FIXTURE, file), "utf8");
      let depth = 0;
      for (const [, kind] of content.matchAll(MARKER)) {
        if (kind === "if") depth += 1;
        else depth -= 1;
        expect(depth, `${file}: forge:end without forge:if`).toBeGreaterThanOrEqual(0);
      }
      expect(depth, `${file}: ${depth} unclosed forge:if block(s)`).toBe(0);
    }
  });

  it("AC3: every forge:if condition names a module/option of the manifest, '!=', '|' or starter-repository", () => {
    for (const file of files) {
      const content = readFileSync(join(FIXTURE, file), "utf8");
      for (const [, kind, condition] of content.matchAll(MARKER)) {
        if (kind !== "if") continue;
        if (condition === "starter-repository") continue;
        const match = /^([a-z]+)(!?=)([a-z|]+)$/.exec(condition ?? "");
        expect(match, `${file}: malformed condition "${condition}"`).not.toBeNull();
        const [, module, , values] = match!;
        const mod = manifest.modules[module!];
        expect(mod, `${file}: condition "${condition}" uses unknown module ${module}`).toBeDefined();
        for (const value of values!.split("|")) {
          expect(value in (mod?.options ?? {}), `${file}: "${condition}" uses unknown option ${module}=${value}`).toBe(
            true,
          );
        }
      }
    }
  });

  it("AC4: every block syntax and the starter-repository block are present", () => {
    const all = files.map((f) => readFileSync(join(FIXTURE, f), "utf8")).join("\n");
    expect(all).toMatch(/<!-- forge:if [^>]+ -->/);
    expect(all).toMatch(/^# forge:if /m);
    expect(all).toMatch(/^\s*\/\/ forge:if /m);
    expect(all).toMatch(/\{\/\* forge:if [^*]+ \*\/\}/);
    expect(all).toContain("forge:if starter-repository");
    expect(all).toContain("forge:if auth!=none");
    expect(all).toContain("forge:if email=smtp|resend");
  });

  it("files carrying a block are listed under conditional or owned by an option", () => {
    const owned = new Set(listedFiles(manifest));
    for (const file of files) {
      if (!/forge:if/.test(readFileSync(join(FIXTURE, file), "utf8"))) continue;
      const covered =
        owned.has(file) ||
        manifest.conditional.some((c) => isGlob(c) && file.startsWith(c.split("*")[0]!)) ||
        Object.values(manifest.modules).some((m) =>
          Object.values(m.options).some((o) => o.files.some((g) => isGlob(g) && file.startsWith(g.split("*")[0]!))),
        );
      expect(covered, `${file} has a forge:if block but is neither conditional nor owned by an option`).toBe(true);
    }
  });
});
