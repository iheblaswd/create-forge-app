import { posix } from "node:path";
import picomatch from "picomatch";
import type { Manifest } from "../manifest/index.js";
import { evaluateCondition, type Plan } from "../planner/index.js";
import { hasMarkers, stripBlocks } from "./blocks.js";
import { buildEnvLocal, randomSecret, type SecretGenerator } from "./env.js";
import { removeDependencies } from "./pom.js";
import { javaPackageFor, renameJavaSource, renamePath, renameProjectName } from "./rename.js";

/**
 * Execution of a Plan (CLAUDE.md 4.5, Étape 2 task 2). core/* does no I/O (lint rule), so every
 * disk operation goes through the FsPort given by the caller (src/utils/fs.ts in the CLI, an
 * in-memory fake in tests).
 *
 * Safety rules (CLAUDE.md 1): the target must not exist or be an empty folder; everything is
 * written into a temporary sibling folder first and moved into place with one rename at the end;
 * on any error the temporary folder is deleted and the target is left exactly as it was.
 */
export interface FsPort {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array | string): Promise<void>;
  mkdir(path: string): Promise<void>;
  /** Names inside a folder, or undefined when the path does not exist. */
  list(path: string): Promise<string[] | undefined>;
  rename(from: string, to: string): Promise<void>;
  removeTree(path: string): Promise<void>;
}

export interface ApplyContext {
  manifest: Manifest;
  /** Folder of the starter (absolute or relative to the cwd). */
  templateRoot: string;
  /** Target folder of the new project. */
  targetDir: string;
  /** Project name (folder name), already validated. */
  projectName: string;
  fs: FsPort;
  /** Unique suffix for the temporary folder (tests pass a fixed value). */
  tempSuffix?: string;
  secret?: SecretGenerator;
}

export interface ApplyResult {
  /** Paths written, relative to the target, sorted. */
  files: string[];
  javaPackage: string;
  envLocal?: string;
  generatedSecrets: string[];
}

export class TargetNotEmptyError extends Error {
  constructor(readonly targetDir: string) {
    super(`${targetDir} already exists and is not empty`);
    this.name = "TargetNotEmptyError";
  }
}

const TEXT_EXTENSIONS = new Set(
  "java kt kts xml yml yaml properties json md mdx txt ts tsx js jsx mjs cjs css scss html sql sh bash env example toml ini gradle dockerfile gitignore gitattributes editorconfig npmrc nvmrc prettierrc eslintrc conf cfg graphql proto svg".split(
    " ",
  ),
);

/** Decide whether a file is text: known extension or name, or no NUL byte in the first 8 KiB. */
export function isText(path: string, data: Uint8Array): boolean {
  const base = posix.basename(path).toLowerCase();
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".") + 1) : base;
  if (TEXT_EXTENSIONS.has(ext) || base === "dockerfile" || base.startsWith(".env")) return true;
  const sample = data.subarray(0, 8192);
  return !sample.includes(0);
}

const decoder = new TextDecoder("utf-8", { fatal: false });

function join(...parts: string[]): string {
  return parts.join("/").replace(/\/+/g, "/");
}

function parentOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "." : path.slice(0, index);
}

/** Transform the content of one copied text file. Exported for tests. */
export function transformText(
  text: string,
  file: string,
  plan: Plan,
  ctx: Pick<ApplyContext, "manifest" | "projectName">,
  isProjectFile: (file: string) => boolean,
): string {
  const selection = plan.projectJson.modules;
  let out = hasMarkers(text) ? stripBlocks(text, file, (c) => evaluateCondition(c, selection)) : text;

  const coords = plan.pomRemove.filter((entry) => entry.file === file).map((entry) => entry.coords);
  if (coords.length > 0) out = removeDependencies(out, coords, file);

  out = renameJavaSource(out, ctx.manifest.app.packageRoot, javaPackageFor(ctx.projectName));
  if (isProjectFile(file)) out = renameProjectName(out, ctx.manifest.name, ctx.projectName);
  return out;
}

async function ensureEmptyTarget(fs: FsPort, target: string): Promise<void> {
  const entries = await fs.list(target);
  if (entries !== undefined && entries.length > 0) throw new TargetNotEmptyError(target);
}

/** Execute the plan. Throws (after rollback) on the first error. */
export async function applyPlan(plan: Plan, ctx: ApplyContext): Promise<ApplyResult> {
  const { fs, manifest, targetDir } = ctx;
  await ensureEmptyTarget(fs, targetDir);
  const targetExisted = (await fs.list(targetDir)) !== undefined;

  const temp = join(parentOf(targetDir), `.${posix.basename(targetDir)}.forge-tmp-${ctx.tempSuffix ?? Date.now().toString(36)}`);
  const javaPackage = javaPackageFor(ctx.projectName);
  const isProjectFile = picomatch([...manifest.conditional, "package.json", "README.md"], { dot: true });
  const created = new Set<string>();
  const files: string[] = [];
  const moved: string[] = [];

  const write = async (relative: string, data: Uint8Array | string): Promise<void> => {
    const full = join(temp, relative);
    const dir = parentOf(full);
    if (!created.has(dir)) {
      await fs.mkdir(dir);
      created.add(dir);
    }
    await fs.writeFile(full, data);
    files.push(relative);
  };

  try {
    await fs.mkdir(temp);
    created.add(temp);
    let exampleText: string | undefined;

    for (const entry of plan.copy) {
      const data = await fs.readFile(join(ctx.templateRoot, entry.from));
      const to = renamePath(entry.to, manifest.app.packageRoot, javaPackage);
      if (!isText(entry.from, data)) {
        await write(to, data);
        continue;
      }
      const text = transformText(decoder.decode(data), entry.from, plan, ctx, isProjectFile);
      if (entry.to === manifest.env.example) exampleText = text;
      await write(to, text);
    }

    let envLocal: string | undefined;
    let generatedSecrets: string[] = [];
    if (exampleText !== undefined) {
      const built = buildEnvLocal(exampleText, plan.env, manifest.env.example, ctx.secret ?? randomSecret);
      await write(manifest.env.local, built.text);
      envLocal = manifest.env.local;
      generatedSecrets = built.generated;
    }

    await write(".forge/project.json", `${JSON.stringify(plan.projectJson, null, 2)}\n`);

    if (targetExisted) {
      // The user's empty folder (possibly the current directory) is kept: move our entries into it.
      for (const name of (await fs.list(temp)) ?? []) {
        await fs.rename(join(temp, name), join(targetDir, name));
        moved.push(join(targetDir, name));
      }
      await fs.removeTree(temp);
    } else {
      await fs.rename(temp, targetDir);
    }
    return { files: files.sort(), javaPackage, ...(envLocal ? { envLocal } : {}), generatedSecrets };
  } catch (error) {
    for (const path of moved) await fs.removeTree(path).catch(() => undefined);
    await fs.removeTree(temp).catch(() => undefined);
    throw error;
  }
}
