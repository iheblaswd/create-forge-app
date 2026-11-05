import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { ManifestError, parseManifest, type Manifest } from "../manifest/index.js";

/** File name of the starter manifest (CLAUDE.md 4.4). */
export const MANIFEST_FILE = "forge.template.json";

/** Folders never part of a starter tree. */
const IGNORED_DIRS = new Set([".git", "node_modules"]);

export interface StarterRef {
  repo: string;
  ref: string;
  commit: string;
}

/** A starter ready to be planned and applied. */
export interface TemplateSource {
  kind: "local" | "bundled" | "github";
  /** Absolute folder of the starter. */
  root: string;
  manifest: Manifest;
  /** Relative POSIX paths of every file, sorted. */
  files: string[];
  starter: StarterRef;
  /** Removes temporary files (github downloads); no-op otherwise. */
  cleanup(): Promise<void>;
}

export class SourceError extends Error {
  constructor(
    readonly reason: string,
    readonly hint: string,
  ) {
    super(`${reason}\n  → ${hint}`);
    this.name = "SourceError";
  }
}

/** Every file under `dir`, as sorted relative POSIX paths (`.git` and `node_modules` skipped). */
export function listTemplateFiles(dir: string): string[] {
  const root = resolve(dir);
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (!IGNORED_DIRS.has(name)) walk(full);
      } else if (stat.isFile()) {
        out.push(relative(root, full).split("\\").join("/"));
      }
    }
  };
  walk(root);
  return out.sort();
}

/** Read and validate `<dir>/forge.template.json`. */
export function readManifest(dir: string): Manifest {
  const file = join(dir, MANIFEST_FILE);
  if (!existsSync(file)) {
    throw new SourceError(`no ${MANIFEST_FILE} in ${dir}`, "Point --template-dir to the root of a forge starter.");
  }
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new ManifestError(MANIFEST_FILE, "(root)", `not valid JSON (${(error as Error).message})`, "Fix the JSON syntax.");
  }
  return parseManifest(json, MANIFEST_FILE);
}

/** Commit of a git checkout (reads .git/HEAD and the ref file), or undefined. */
export function readGitCommit(dir: string): string | undefined {
  const head = join(dir, ".git", "HEAD");
  if (!existsSync(head)) return undefined;
  const content = readFileSync(head, "utf8").trim();
  if (!content.startsWith("ref: ")) return content;
  const refFile = join(dir, ".git", content.slice(5));
  if (existsSync(refFile)) return readFileSync(refFile, "utf8").trim();
  const packed = join(dir, ".git", "packed-refs");
  if (!existsSync(packed)) return undefined;
  const line = readFileSync(packed, "utf8")
    .split("\n")
    .find((l) => l.endsWith(` ${content.slice(5)}`));
  return line?.split(" ")[0];
}

/** `--template-dir <path>`: a starter folder on disk, used as is (development of a starter). */
export function localSource(dir: string): TemplateSource {
  const root = resolve(dir);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new SourceError(`template folder not found: ${dir}`, "Check the path given to --template-dir.");
  }
  const manifest = readManifest(root);
  return {
    kind: "local",
    root,
    manifest,
    files: listTemplateFiles(root),
    starter: { repo: `local:${root.split("\\").join("/")}`, ref: "local", commit: readGitCommit(root) ?? "unknown" },
    cleanup: async () => undefined,
  };
}
