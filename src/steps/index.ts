// steps (CLAUDE.md 4.5, Étape 2 task 5): post-generation commands run inside the new project.
// A missing tool is a warning, never a failure: the project is already generated.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PostStep } from "../core/planner/index.js";
import { commandExists as realCommandExists, run as realRun, type RunResult } from "../utils/process.js";

export interface StepOptions {
  install: boolean;
  git: boolean;
}

export interface StepReport {
  step: PostStep;
  status: "done" | "skipped" | "warning";
  message: string;
}

export interface StepRunner {
  run(command: string, args: readonly string[], cwd: string): Promise<RunResult>;
  commandExists(command: string): boolean;
}

export const systemRunner: StepRunner = { run: realRun, commandExists: realCommandExists };

const lastLine = (output: string): string =>
  output
    .trim()
    .split("\n")
    .filter((l) => l.trim() !== "")
    .at(-1) ?? "";

async function pnpmInstall(dir: string, runner: StepRunner): Promise<StepReport> {
  const step: PostStep = "pnpm-install";
  if (!existsSync(join(dir, "package.json"))) return { step, status: "skipped", message: "no package.json" };
  const viaPnpm = runner.commandExists("pnpm");
  const [cmd, args]: [string, string[]] = viaPnpm ? ["pnpm", ["install"]] : ["corepack", ["pnpm", "install"]];
  if (!viaPnpm && !runner.commandExists("corepack")) {
    return { step, status: "warning", message: "pnpm not found (install Node 22+ and run `corepack enable`), then run `pnpm install`" };
  }
  const result = await runner.run(cmd, args, dir);
  return result.code === 0
    ? { step, status: "done", message: `${cmd} ${args.join(" ")}` }
    : { step, status: "warning", message: `pnpm install failed: ${lastLine(result.output)} — run it again inside the project` };
}

async function mvnResolve(dir: string, runner: StepRunner): Promise<StepReport> {
  const step: PostStep = "mvn-resolve";
  if (!existsSync(join(dir, "pom.xml"))) return { step, status: "skipped", message: "no pom.xml" };
  if (!runner.commandExists("mvn")) {
    return { step, status: "warning", message: "Maven not found: install Maven 3.9+ then run `mvn -q dependency:resolve`" };
  }
  const result = await runner.run("mvn", ["-q", "dependency:resolve"], dir);
  return result.code === 0
    ? { step, status: "done", message: "mvn -q dependency:resolve" }
    : { step, status: "warning", message: `mvn dependency:resolve failed: ${lastLine(result.output)}` };
}

async function gitInit(dir: string, runner: StepRunner): Promise<StepReport> {
  const step: PostStep = "git-init";
  if (!runner.commandExists("git")) return { step, status: "warning", message: "git not found: the project is not a repository" };
  if (existsSync(join(dir, ".git"))) return { step, status: "skipped", message: "already a git repository" };
  for (const args of [["init", "-q", "-b", "main"], ["add", "-A"]]) {
    const result = await runner.run("git", args, dir);
    if (result.code !== 0) return { step, status: "warning", message: `git ${args[0]} failed: ${lastLine(result.output)}` };
  }
  const commit = await runner.run("git", ["commit", "-q", "-m", "chore: initial commit from create-forge-app"], dir);
  if (commit.code !== 0) {
    return { step, status: "warning", message: "repository created, first commit skipped (set git user.name / user.email)" };
  }
  return { step, status: "done", message: "git init + first commit" };
}

/**
 * Run the plan's post steps: installs first, then git (so the first commit contains the lock files).
 * `--no-install` skips pnpm and Maven, `--no-git` skips git.
 */
export async function runPostSteps(
  dir: string,
  steps: readonly PostStep[],
  options: StepOptions,
  runner: StepRunner = systemRunner,
  onStep?: (step: PostStep) => void,
): Promise<StepReport[]> {
  const reports: StepReport[] = [];
  const order: PostStep[] = ["pnpm-install", "mvn-resolve", "git-init"];
  for (const step of order.filter((s) => steps.includes(s))) {
    const enabled = step === "git-init" ? options.git : options.install;
    if (!enabled) {
      reports.push({ step, status: "skipped", message: step === "git-init" ? "--no-git" : "--no-install" });
      continue;
    }
    onStep?.(step);
    if (step === "pnpm-install") reports.push(await pnpmInstall(dir, runner));
    else if (step === "mvn-resolve") reports.push(await mvnResolve(dir, runner));
    else reports.push(await gitInit(dir, runner));
  }
  return reports;
}
