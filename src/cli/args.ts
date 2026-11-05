import { Command, CommanderError } from "commander";

/**
 * Command-line parsing (CLAUDE.md 5). The CLI knows no module in hard code (CLAUDE.md 1): any
 * `--<name> <value>` that is not a CLI option is a module flag, validated later against the
 * manifest by core/selection (`--auth none`, `--storage r2`, …).
 */

export interface CreateArgs {
  command: "create";
  directory?: string;
  moduleFlags: Record<string, string>;
  ref?: string;
  templateDir?: string;
  dryRun: boolean;
  yes: boolean;
  install: boolean;
  git: boolean;
}

export interface OtherArgs {
  command: "help" | "version" | "not-yet";
  text: string;
}

export type ParsedArgs = CreateArgs | OtherArgs;

/** Later stages (CLAUDE.md 6, Étapes 4-5). */
export const LATER_COMMANDS: Readonly<Record<string, string>> = {
  add: "Étape 5",
  remove: "Étape 5",
  upgrade: "Étape 4",
  status: "Étape 4",
  doctor: "Étape 4",
};

const VALUE_OPTIONS = new Set(["--ref", "--template-dir"]);
const FLAG_OPTIONS = new Set(["--dry-run", "-y", "--yes", "--no-install", "--no-git", "-h", "--help", "-V", "--version"]);

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/** Split argv into CLI arguments and module flags (`--auth none` or `--auth=none`). */
export function splitModuleFlags(argv: readonly string[]): { rest: string[]; moduleFlags: Record<string, string> } {
  const rest: string[] = [];
  const moduleFlags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    const [name, inline] = arg.startsWith("--") && arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    if (!name.startsWith("--") || VALUE_OPTIONS.has(name) || FLAG_OPTIONS.has(name)) {
      rest.push(arg);
      if (VALUE_OPTIONS.has(name) && inline === undefined && i + 1 < argv.length) rest.push(argv[++i] ?? "");
      continue;
    }
    const module = name.slice(2);
    const value = inline ?? argv[i + 1];
    if (value === undefined || (inline === undefined && value.startsWith("-"))) {
      throw new UsageError(`--${module} needs a value, e.g. --${module} <option>`);
    }
    if (inline === undefined) i++;
    moduleFlags[module] = value;
  }
  return { rest, moduleFlags };
}

export function buildProgram(version: string): Command {
  return new Command("create-forge-app")
    .description("Generate a Spring Boot 3 + Next.js 15 project with only the modules you choose.")
    .argument("[directory]", "folder of the new project (its name becomes the project name)")
    .option("--ref <ref>", "starter release to use: tag, branch or commit sha (downloaded from GitHub)")
    .option("--template-dir <path>", "use a starter folder on disk instead of the bundled one")
    .option("--dry-run", "print what would be generated, write nothing", false)
    .option("-y, --yes", "no questions: defaults for every module not given as a flag", false)
    .option("--no-install", "skip pnpm install and mvn dependency:resolve")
    .option("--no-git", "skip git init and the first commit")
    .version(`create-forge-app v${version}`, "-V, --version")
    .addHelpText(
      "after",
      `
Modules and their options come from the starter manifest, not from this CLI: pass any
module as "--<module> <option>". Use --dry-run to see the starter's modules and defaults.

Examples:
  create-forge-app my-app                       interactive
  create-forge-app my-app -y                    all defaults
  create-forge-app my-app --auth none --dry-run show the plan only
  create-forge-app my-app --template-dir ../forge-starter

Later: forge add | remove | upgrade | status | doctor`,
    )
    .exitOverride()
    .configureOutput({ writeOut: () => undefined, writeErr: () => undefined })
    .showHelpAfterError(false);
}

export function parseArgs(argv: readonly string[], version: string): ParsedArgs {
  const first = argv[0];
  if (first !== undefined && Object.hasOwn(LATER_COMMANDS, first)) {
    return {
      command: "not-yet",
      text: `"${first}" is planned for ${LATER_COMMANDS[first]} of the roadmap and is not available in this version yet.`,
    };
  }
  const { rest, moduleFlags } = splitModuleFlags(argv);
  const program = buildProgram(version);
  try {
    program.parse(rest, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === "commander.helpDisplayed" || error.code === "commander.help") {
        return { command: "help", text: program.helpInformation() + "\n" };
      }
      if (error.code === "commander.version") return { command: "version", text: `create-forge-app v${version}\n` };
      throw new UsageError(error.message.replace(/^error: /, ""));
    }
    throw error;
  }
  if (program.args.length > 1) throw new UsageError(`expected one project folder, got: ${program.args.join(" ")}`);
  const opts = program.opts<{ ref?: string; templateDir?: string; dryRun: boolean; yes: boolean; install: boolean; git: boolean }>();
  if (opts.ref !== undefined && opts.templateDir !== undefined) throw new UsageError("--ref and --template-dir cannot be used together");
  const directory = program.args[0];
  return {
    command: "create",
    ...(directory !== undefined ? { directory } : {}),
    moduleFlags,
    ...(opts.ref !== undefined ? { ref: opts.ref } : {}),
    ...(opts.templateDir !== undefined ? { templateDir: opts.templateDir } : {}),
    dryRun: opts.dryRun,
    yes: opts.yes,
    install: opts.install,
    git: opts.git,
  };
}
