import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runCli, type CliIo } from "../../src/cli/index.js";
import { isWellFormedXml, listDependencies, parseMarker } from "../../src/core/apply/index.js";
import type { StepRunner } from "../../src/steps/index.js";
import { COMBINATIONS, FIXTURE } from "../helpers/mini-starter.js";

// CLAUDE.md Étape 2 task 6: real generations from the mini-starter, on disk.

const work = mkdtempSync(join(tmpdir(), "forge-it-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function io(): CliIo & { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, stdout: (t) => out.push(t), stderr: (t) => err.push(t), cwd: work, interactive: false };
}

function tree(root: string): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  return walk(root)
    .map((f) => relative(root, f).split("\\").join("/"))
    .sort();
}

const flags = (selection: Record<string, string>) => Object.entries(selection).flatMap(([m, o]) => [`--${m}`, o]);

const EXPECTED_FILES: Record<string, string[]> = {
  all: [
    ".env.local", ".forge/project.json", "README.md", "apps/api/Dockerfile", "apps/api/pom.xml",
    "apps/api/src/main/java/com/shop/auth/domain/entities/User.java",
    "apps/api/src/main/java/com/shop/shared/domain/entities/BaseEntity.java",
    "apps/api/src/main/resources/application.yml", "apps/web/middleware.ts", "apps/web/src/app/page.tsx",
    "apps/web/src/lib/env.ts", "env.example", "infra/compose.prod.yaml", "infra/compose.yaml", "package.json",
    "pnpm-workspace.yaml", "pom.xml",
  ],
  "auth=none": [
    ".env.local", ".forge/project.json", "README.md", "apps/api/Dockerfile", "apps/api/pom.xml",
    "apps/api/src/main/java/com/shop/shared/domain/entities/BaseEntity.java",
    "apps/api/src/main/resources/application.yml", "apps/web/src/app/page.tsx", "apps/web/src/lib/env.ts",
    "env.example", "infra/compose.prod.yaml", "infra/compose.yaml", "package.json", "pnpm-workspace.yaml", "pom.xml",
  ],
  "frontend=none": [
    ".env.local", ".forge/project.json", "README.md", "apps/api/Dockerfile", "apps/api/pom.xml",
    "apps/api/src/main/java/com/shop/auth/domain/entities/User.java",
    "apps/api/src/main/java/com/shop/shared/domain/entities/BaseEntity.java",
    "apps/api/src/main/resources/application.yml", "env.example", "infra/compose.prod.yaml", "infra/compose.yaml",
    "package.json", "pom.xml",
  ],
  "all none": [
    ".env.local", ".forge/project.json", "README.md", "apps/api/Dockerfile", "apps/api/pom.xml",
    "apps/api/src/main/java/com/shop/shared/domain/entities/BaseEntity.java",
    "apps/api/src/main/resources/application.yml", "env.example", "infra/compose.prod.yaml", "infra/compose.yaml",
    "package.json", "pom.xml",
  ],
};

const EXPECTED_DEPENDENCIES: Record<string, string[]> = {
  all: ["spring-boot-starter-web", "spring-boot-starter-security", "jjwt-api", "spring-boot-starter-mail"],
  "auth=none": ["spring-boot-starter-web", "spring-boot-starter-mail"],
  "frontend=none": ["spring-boot-starter-web", "spring-boot-starter-security", "jjwt-api", "spring-boot-starter-mail"],
  "all none": ["spring-boot-starter-web"],
};

describe("forge <dir> --template-dir mini-starter (real disk)", () => {
  it.each(Object.entries(COMBINATIONS))("%s", async (name, selection) => {
    const dir = join(work, name.replace(/[^a-z]/g, "-"), "shop");
    mkdirSync(join(dir, ".."), { recursive: true });
    const cli = io();
    const code = await runCli([dir, "--template-dir", FIXTURE, "-y", "--no-install", "--no-git", ...flags(selection)], cli);
    expect(cli.err.join(""), "stderr").toBe("");
    expect(code).toBe(0);

    expect(tree(dir)).toEqual(EXPECTED_FILES[name]);
    for (const file of tree(dir)) {
      const text = readFileSync(join(dir, file), "utf8");
      const markers = text.split("\n").filter((line) => parseMarker(line) !== undefined);
      expect(markers, `${file} still has forge markers`).toEqual([]);
      expect(text, file).not.toContain("com.forge.starter");
    }
    for (const pom of ["pom.xml", "apps/api/pom.xml"]) {
      expect(isWellFormedXml(readFileSync(join(dir, pom), "utf8")), pom).toBe(true);
    }
    const deps = listDependencies(readFileSync(join(dir, "apps/api/pom.xml"), "utf8")).map((c) => c.split(":")[1]);
    expect(deps).toEqual(EXPECTED_DEPENDENCIES[name]);

    const project = JSON.parse(readFileSync(join(dir, ".forge/project.json"), "utf8"));
    expect(project.modules).toEqual(selection);
    expect(project.starter.ref).toBe("local");
    expect(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).name).toBe("shop");

    const env = readFileSync(join(dir, ".env.local"), "utf8");
    expect(env.includes("JWT_SECRET="), "JWT_SECRET").toBe(selection.auth === "jwt");
    expect(env.includes("SMTP_HOST="), "SMTP_HOST").toBe(selection.email === "smtp");
    expect(env).not.toContain("change-me");
    expect(readFileSync(join(dir, "README.md"), "utf8")).not.toContain("Maintainers");
    expect(cli.out.join("")).toContain("shop created");
  });

  it("--dry-run prints the plan and writes nothing", async () => {
    const dir = join(work, "dry", "shop");
    const cli = io();
    expect(await runCli([dir, "--template-dir", FIXTURE, "--auth", "none", "--dry-run"], cli)).toBe(0);
    const out = cli.out.join("");
    expect(out).toContain("Modules   auth=none  email=smtp  frontend=next  deploy=docker");
    expect(out).toContain("- io.jsonwebtoken:jjwt-api  (apps/api/pom.xml)");
    expect(out).toContain("+ apps/api/src/main/java/com/shop/shared/domain/entities/BaseEntity.java");
    expect(out).not.toContain("User.java");
    expect(existsSync(join(work, "dry"))).toBe(false);
  });

  it("rollback: a broken starter leaves nothing behind", async () => {
    const broken = join(work, "broken-starter");
    cpSync(FIXTURE, broken, { recursive: true });
    writeFileSync(join(broken, "infra/compose.yaml"), "services:\n# forge:if email=smtp\n  mailpit: {}\n");
    const cli = io();
    const target = join(work, "rolled-back");
    expect(await runCli([target, "--template-dir", broken, "-y", "--no-install", "--no-git"], cli)).toBe(1);
    expect(cli.err.join("")).toMatch(/infra\/compose.yaml:2: forge:if block is never closed[\s\S]*rolled back/);
    expect(existsSync(target)).toBe(false);
    expect(readdirSync(work).filter((n) => n.includes("forge-tmp"))).toEqual([]);
  });

  it("refuses a non-empty folder and leaves it untouched", async () => {
    const target = join(work, "occupied");
    mkdirSync(target);
    writeFileSync(join(target, "mine.txt"), "keep me");
    const cli = io();
    expect(await runCli([target, "--template-dir", FIXTURE, "-y", "--no-install", "--no-git"], cli)).toBe(1);
    expect(cli.err.join("")).toContain("already exists and is not empty");
    expect(readdirSync(target)).toEqual(["mine.txt"]);
  });

  it("unknown module flag is rejected with the valid list", async () => {
    const cli = io();
    expect(await runCli([join(work, "x"), "--template-dir", FIXTURE, "--storage", "r2", "-y"], cli)).toBe(1);
    expect(cli.err.join("")).toContain('module "storage" is unknown (valid modules: auth, email, frontend, deploy)');
  });

  it("post steps run in order (installs, then git) through the runner", async () => {
    const calls: string[] = [];
    const runner: StepRunner = {
      commandExists: () => true,
      run: async (command, args) => {
        calls.push(`${command} ${args.join(" ")}`);
        return { code: 0, output: "" };
      },
    };
    const cli = { ...io(), runner };
    expect(await runCli([join(work, "steps", "shop"), "--template-dir", FIXTURE, "-y"], cli)).toBe(0);
    expect(calls).toEqual([
      "pnpm install",
      "mvn -q dependency:resolve",
      "git init -q -b main",
      "git add -A",
      "git commit -q -m chore: initial commit from create-forge-app",
    ]);
  });

  it("interactive: asks the folder, then one question per module when the user customises", async () => {
    const asked: string[] = [];
    const prompter = {
      intro: () => undefined,
      askDirectory: async () => join(work, "interactive", "shop"),
      askCustomise: async () => true,
      ask: async (module: string, options: readonly string[], defaultOption: string) => {
        asked.push(`${module}:${options.join("|")}:${defaultOption}`);
        return module === "auth" ? "none" : defaultOption;
      },
    };
    const cli = { ...io(), interactive: true, prompter };
    expect(await runCli(["--template-dir", FIXTURE, "--no-install", "--no-git", "--email", "none"], cli)).toBe(0);
    // --email given as a flag is not asked again
    expect(asked).toEqual(["auth:jwt|none:jwt", "frontend:next|none:next", "deploy:docker:docker"]);
    const project = JSON.parse(readFileSync(join(work, "interactive", "shop", ".forge/project.json"), "utf8"));
    expect(project.modules).toEqual({ auth: "none", email: "none", frontend: "next", deploy: "docker" });
  });

  it("missing tools are warnings, not failures", async () => {
    const runner: StepRunner = { commandExists: () => false, run: async () => ({ code: 0, output: "" }) };
    const cli = { ...io(), runner };
    expect(await runCli([join(work, "no-tools", "shop"), "--template-dir", FIXTURE, "-y"], cli)).toBe(0);
    expect(cli.out.join("")).toMatch(/! pnpm-install: pnpm not found/);
    expect(cli.out.join("")).toMatch(/! mvn-resolve: Maven not found/);
  });
});
