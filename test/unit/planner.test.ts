import { ESLint } from "eslint";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { parseManifest, type Manifest } from "../../src/core/manifest/index.js";
import { evaluateCondition, plan, type Plan, type PlanInput } from "../../src/core/planner/index.js";
import type { Selection } from "../../src/core/selection/index.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "mini-starter");
const MANIFEST_FILE = "forge.template.json";

/** Lists the mini-starter tree the way core/sources will later (relative POSIX paths). */
function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [relative(FIXTURE, full).replaceAll("\\", "/")];
  });
}

function loadManifest(): Manifest {
  return parseManifest(JSON.parse(readFileSync(join(FIXTURE, MANIFEST_FILE), "utf8")), MANIFEST_FILE);
}

const PROVENANCE = {
  cliVersion: "0.1.0",
  starter: { repo: "forge/forge-starter", ref: "v0.1.0", commit: "0123456789abcdef0123456789abcdef01234567" },
} as const;

const DEFAULTS: Selection = { auth: "jwt", email: "smtp", frontend: "next", deploy: "docker" };

function miniStarterInput(selection: Selection = DEFAULTS): PlanInput {
  return { manifest: loadManifest(), selection, templateFiles: listFiles(FIXTURE), provenance: PROVENANCE };
}

const copied = (p: Plan) => p.copy.map((c) => c.to);
const keepFor = (p: Plan, file: string) => p.conditional.find((c) => c.file === file)?.keep;

describe("plan(input) — mini-starter (CLAUDE.md 4.3 / 4.4 / 4.5)", () => {
  it("AC1: default selection copies every fixture file except exclude, with keep[] per conditional file", () => {
    const input = miniStarterInput();
    const result = plan(input);

    const expected = input.templateFiles.filter((f) => !f.startsWith("docs/maintainers/")).sort();
    expect(copied(result)).toEqual(expected);
    expect(result.copy.every((c) => c.from === c.to)).toBe(true);

    const conditionalFiles = input.manifest.conditional.sort();
    expect(result.conditional.map((c) => c.file).sort()).toEqual(conditionalFiles);
    for (const file of conditionalFiles) {
      const keep = keepFor(result, file);
      expect(keep, file).toEqual(
        expect.arrayContaining(["auth=jwt", "auth!=none", "email=smtp", "email!=none", "email!=resend", "frontend=next", "frontend!=none", "deploy=docker"]),
      );
      expect(keep).not.toContain("starter-repository");
      expect(keep).not.toContain("auth=none");
    }
    // Alternatives are evaluated by the planner: "email=smtp|resend" holds for email=smtp.
    expect(keepFor(result, "infra/compose.yaml")).toContain("email=smtp|resend");

    expect(result.pomRemove).toEqual([]);
    expect(result.env).toEqual([
      { key: "JWT_SECRET", value: "" },
      { key: "JWT_ACCESS_TTL", value: "" },
      { key: "SMTP_HOST", value: "" },
      { key: "SMTP_PORT", value: "" },
    ]);
    expect(result.projectJson).toEqual({
      cliVersion: "0.1.0",
      starter: { repo: "forge/forge-starter", ref: "v0.1.0", commit: PROVENANCE.starter.commit },
      modules: DEFAULTS,
    });
    expect(result.postSteps).toEqual(["git-init", "pnpm-install", "mvn-resolve"]);
  });

  it("AC2: auth=none drops auth files, removes jwt maven coords, no JWT env, keep has auth=none and auth!=jwt", () => {
    const result = plan(miniStarterInput({ ...DEFAULTS, auth: "none" }));

    const files = copied(result);
    expect(files.some((f) => f.startsWith("apps/api/src/main/java/com/forge/starter/auth/"))).toBe(false);
    expect(files).not.toContain("apps/web/middleware.ts");
    expect(files).toContain("apps/api/src/main/java/com/forge/starter/shared/domain/entities/BaseEntity.java");

    expect(result.pomRemove).toEqual([
      { file: "apps/api/pom.xml", coords: "io.jsonwebtoken:jjwt-api" },
      { file: "apps/api/pom.xml", coords: "org.springframework.boot:spring-boot-starter-security" },
    ]);
    expect(result.env.map((e) => e.key).some((k) => k.startsWith("JWT_"))).toBe(false);
    expect(result.env.map((e) => e.key)).toEqual(["SMTP_HOST", "SMTP_PORT"]);

    const keep = keepFor(result, "apps/api/pom.xml");
    expect(keep).toEqual(expect.arrayContaining(["auth=none", "auth!=jwt"]));
    expect(keep).not.toContain("auth=jwt");
    expect(keep).not.toContain("auth!=none");
    expect(keepFor(result, "infra/compose.yaml")).toContain("email=smtp|resend");
  });

  it("AC3: frontend=none drops apps/web/** and pnpm-workspace.yaml, postSteps still lists mvn-resolve", () => {
    const result = plan(miniStarterInput({ ...DEFAULTS, frontend: "none" }));

    const files = copied(result);
    expect(files.some((f) => f.startsWith("apps/web/"))).toBe(false);
    expect(files).not.toContain("pnpm-workspace.yaml");
    expect(files).toContain("apps/api/pom.xml");
    expect(result.postSteps).toContain("mvn-resolve");
    expect(keepFor(result, "package.json")).toContain("frontend=none");
  });

  it("AC2b: email=none removes smtp coords and the email=smtp|resend alternative is not kept", () => {
    const result = plan(miniStarterInput({ ...DEFAULTS, email: "none" }));
    expect(result.pomRemove).toEqual([
      { file: "apps/api/pom.xml", coords: "org.springframework.boot:spring-boot-starter-mail" },
    ]);
    expect(result.env).toEqual([
      { key: "JWT_SECRET", value: "" },
      { key: "JWT_ACCESS_TTL", value: "" },
    ]);
    const keep = keepFor(result, "infra/compose.yaml");
    expect(keep).not.toContain("email=smtp|resend");
    expect(keep).toEqual(expect.arrayContaining(["email=none", "email!=smtp", "email!=resend"]));
  });
});

describe("plan(input) — rules on a hand-written manifest", () => {
  function tinyManifest(): Manifest {
    return parseManifest(
      {
        schema: 1,
        name: "tiny",
        app: { api: "apps/api", web: "apps/web", packageRoot: "com.forge.starter" },
        env: { example: ".env.example", local: ".env.local" },
        conditional: ["apps/api/pom.xml"],
        modules: {
          auth: {
            default: "jwt",
            options: {
              jwt: {
                files: ["shared-by-both.txt", "only-jwt.txt", "auth-and-email.txt"],
                maven: { "apps/api/pom.xml": ["g:shared-dep", "g:jwt-only"] },
                env: ["JWT_SECRET"],
              },
              supabase: { files: ["shared-by-both.txt"] },
              none: {},
            },
          },
          email: {
            default: "smtp",
            options: {
              smtp: {
                files: ["auth-and-email.txt"],
                maven: { "apps/api/pom.xml": ["g:shared-dep", "g:mail"] },
                env: ["SMTP_HOST"],
              },
              none: {},
            },
          },
        },
      },
      MANIFEST_FILE,
    );
  }

  const FILES = ["shared-by-both.txt", "only-jwt.txt", "auth-and-email.txt", "orphan.txt", "apps/api/pom.xml"];

  function tinyInput(selection: Selection): PlanInput {
    return { manifest: tinyManifest(), selection, templateFiles: FILES, provenance: PROVENANCE };
  }

  it("AC4: a file owned by two options of one module with only one selected is copied; a file owned by nobody is always copied", () => {
    const result = plan(tinyInput({ auth: "jwt", email: "none" }));
    expect(copied(result)).toEqual(["apps/api/pom.xml", "only-jwt.txt", "orphan.txt", "shared-by-both.txt"]);
    expect(copied(plan(tinyInput({ auth: "supabase", email: "none" })))).toEqual([
      "apps/api/pom.xml",
      "orphan.txt",
      "shared-by-both.txt",
    ]);
    expect(copied(plan(tinyInput({ auth: "none", email: "none" })))).toEqual(["apps/api/pom.xml", "orphan.txt"]);
  });

  it("a file owned by options of two modules is copied only when both modules select an owning option", () => {
    expect(copied(plan(tinyInput({ auth: "jwt", email: "smtp" })))).toContain("auth-and-email.txt");
    expect(copied(plan(tinyInput({ auth: "none", email: "smtp" })))).not.toContain("auth-and-email.txt");
    expect(copied(plan(tinyInput({ auth: "jwt", email: "none" })))).not.toContain("auth-and-email.txt");
  });

  it("pomRemove is the union of unselected coords minus coords declared by a selected option", () => {
    const result = plan(tinyInput({ auth: "none", email: "smtp" }));
    expect(result.pomRemove).toEqual([{ file: "apps/api/pom.xml", coords: "g:jwt-only" }]);
    expect(plan(tinyInput({ auth: "none", email: "none" })).pomRemove).toEqual([
      { file: "apps/api/pom.xml", coords: "g:jwt-only" },
      { file: "apps/api/pom.xml", coords: "g:mail" },
      { file: "apps/api/pom.xml", coords: "g:shared-dep" },
    ]);
  });

  it("AC5: the same input planned twice gives byte-identical JSON, whatever the order of templateFiles", () => {
    const a = plan(tinyInput({ auth: "jwt", email: "smtp" }));
    const shuffled = { ...tinyInput({ auth: "jwt", email: "smtp" }), templateFiles: [...FILES].reverse() };
    const b = plan(shuffled);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("AC6: the Plan survives a JSON round-trip unchanged (plain data only)", () => {
    const result = plan(tinyInput({ auth: "jwt", email: "none" }));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("does not mutate its input", () => {
    const input = tinyInput({ auth: "jwt", email: "smtp" });
    const snapshot = JSON.stringify(input);
    plan(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("evaluateCondition(condition, selection) — CLAUDE.md 4.4 syntax", () => {
  const selection: Selection = { auth: "jwt", email: "smtp" };

  it("evaluates =, != and alternatives; starter-repository is always false", () => {
    expect(evaluateCondition("auth=jwt", selection)).toBe(true);
    expect(evaluateCondition("auth=none", selection)).toBe(false);
    expect(evaluateCondition("auth!=none", selection)).toBe(true);
    expect(evaluateCondition("auth!=jwt", selection)).toBe(false);
    expect(evaluateCondition("email=smtp|resend", selection)).toBe(true);
    expect(evaluateCondition("email=resend|none", selection)).toBe(false);
    expect(evaluateCondition("starter-repository", selection)).toBe(false);
  });

  it("rejects malformed conditions and unknown modules with a readable message", () => {
    expect(() => evaluateCondition("auth", selection)).toThrow(/invalid forge:if condition "auth"/);
    expect(() => evaluateCondition("cache=redis", selection)).toThrow(/unknown module "cache"/);
  });
});

// First ESLint boot (config + typescript-eslint) takes 2-3 s on a cold cache under parallel load.
const ESLINT_TIMEOUT_MS = 20_000;

describe("AC7: src/core/planner performs no I/O", () => {
  it("passes the no-restricted-imports rule on every planner source file", async () => {
    const cwd = join(import.meta.dirname, "..", "..");
    const eslint = new ESLint({ cwd });
    const results = await eslint.lintFiles(["src/core/planner/**/*.ts"]);
    expect(results.length).toBeGreaterThan(0);
    expect(results.flatMap((r) => r.messages.map((m) => `${r.filePath}: ${m.message}`))).toEqual([]);
  }, ESLINT_TIMEOUT_MS);
});
