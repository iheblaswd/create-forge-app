import { readFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { NameError, applyPlan, javaPackageFor, validateProjectName } from "../core/apply/index.js";
import { ManifestError } from "../core/manifest/index.js";
import { plan as buildPlan } from "../core/planner/index.js";
import { SelectionError, resolve as resolveSelection } from "../core/selection/index.js";
import { SourceError, openSource, packageRoot, type SourceRequest } from "../core/sources/index.js";
import { runPostSteps, type StepRunner } from "../steps/index.js";
import { nodeFs, toPosix } from "../utils/fs.js";
import { UsageError, parseArgs, type CreateArgs } from "./args.js";
import { banner, formatPlan, formatSelection, formatSummary } from "./format.js";
import { CancelledError, clackPrompter, type Prompter } from "./prompts.js";

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
  /** Interactive terminal: prompts are allowed. */
  interactive: boolean;
  prompter?: Prompter;
  runner?: StepRunner;
  source?: Pick<SourceRequest, "fetch" | "extract">;
}

export function cliVersion(): string {
  const pkg = JSON.parse(readFileSync(resolve(packageRoot(), "package.json"), "utf8")) as { version: string };
  return pkg.version;
}

const DEFAULT_PROJECT = "my-forge-app";

async function create(args: CreateArgs, io: CliIo, version: string): Promise<number> {
  const prompter = io.prompter ?? clackPrompter;
  const interactive = io.interactive && !args.yes;
  if (interactive) prompter.intro(banner(version).trim());
  else if (!args.dryRun) io.stdout(banner(version));

  let directory = args.directory;
  if (directory === undefined) {
    if (!interactive) throw new UsageError("missing project folder: create-forge-app <directory> (or run it in a terminal to be asked)");
    directory = await prompter.askDirectory(DEFAULT_PROJECT);
  }
  const target = resolve(io.cwd, directory);
  const projectName = validateProjectName(basename(target));

  const source = await openSource({
    ...(args.templateDir !== undefined ? { templateDir: resolve(io.cwd, args.templateDir) } : {}),
    ...(args.ref !== undefined ? { ref: args.ref } : {}),
    ...io.source,
  });
  try {
    const customise = interactive && (await prompter.askCustomise());
    const selection = await resolveSelection(source.manifest, args.moduleFlags, customise ? prompter.ask : undefined);
    const thePlan = buildPlan({
      manifest: source.manifest,
      selection,
      templateFiles: source.files,
      provenance: { cliVersion: version, starter: source.starter },
    });
    const javaPackage = javaPackageFor(projectName);

    if (args.dryRun) {
      io.stdout(formatPlan(thePlan, projectName, javaPackage, source.manifest.env.local, source.manifest.app.packageRoot));
      return 0;
    }

    io.stdout(`Generating ${projectName} with ${formatSelection(selection)}\n`);
    const result = await applyPlan(thePlan, {
      manifest: source.manifest,
      templateRoot: toPosix(source.root),
      targetDir: toPosix(target),
      projectName,
      fs: nodeFs,
    });
    const reports = await runPostSteps(target, thePlan.postSteps, { install: args.install, git: args.git }, io.runner, (step) =>
      io.stdout(`… ${step}\n`),
    );
    const cdPath = relative(io.cwd, target) || ".";
    io.stdout(formatSummary(projectName, cdPath.includes(" ") ? `"${cdPath}"` : cdPath, result, reports));
    return 0;
  } finally {
    await source.cleanup();
  }
}

/** Run the CLI; returns the process exit code. Every expected error is printed, never thrown. */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const version = cliVersion();
  try {
    const args = parseArgs(argv, version);
    if (args.command === "create") return await create(args, io, version);
    if (args.command === "not-yet") {
      io.stderr(`${args.text}\n`);
      return 2;
    }
    io.stdout(args.text);
    return 0;
  } catch (error) {
    if (error instanceof CancelledError) {
      io.stderr("Cancelled, nothing was written.\n");
      return 130;
    }
    if (error instanceof SelectionError) {
      io.stderr(`✖ ${error.message}\n`);
      return 1;
    }
    if (
      error instanceof UsageError ||
      error instanceof ManifestError ||
      error instanceof SourceError ||
      error instanceof NameError ||
      (error instanceof Error && ["TargetNotEmptyError", "BlockError", "PomError"].includes(error.name))
    ) {
      io.stderr(`✖ ${error.message}\n`);
      if (error.name === "BlockError" || error.name === "PomError") io.stderr("  Nothing was written (rolled back).\n");
      return 1;
    }
    io.stderr(`✖ unexpected error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    return 1;
  }
}
