import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SourceError, listTemplateFiles, readManifest, type StarterRef, type TemplateSource } from "./local.js";

/** Root of the installed package (…/create-forge-app), from dist/core/sources or src/core/sources. */
export function packageRoot(): string {
  return fileURLToPath(new URL("../../../", import.meta.url));
}

export const LOCK_FILE = "template.lock.json";

/** Read `template.lock.json` (written by scripts/bundle-template.mjs). */
export function readLock(root = packageRoot()): StarterRef | undefined {
  const file = join(root, LOCK_FILE);
  if (!existsSync(file)) return undefined;
  const lock = JSON.parse(readFileSync(file, "utf8")) as Partial<StarterRef>;
  if (typeof lock.repo !== "string" || typeof lock.ref !== "string" || typeof lock.commit !== "string") {
    throw new SourceError(`${LOCK_FILE} is malformed`, "Re-run scripts/bundle-template.mjs.");
  }
  return { repo: lock.repo, ref: lock.ref, commit: lock.commit };
}

/** The starter embedded in this release of the CLI (`template/` + `template.lock.json`). */
export function bundledSource(root = packageRoot()): TemplateSource {
  const lock = readLock(root);
  const dir = join(root, "template");
  if (!lock || !existsSync(join(dir, "forge.template.json"))) {
    throw new SourceError(
      "this build of create-forge-app has no bundled starter",
      "Pass --template-dir <path-to-starter> or --ref <tag|branch|sha> (download from GitHub).",
    );
  }
  return {
    kind: "bundled",
    root: dir,
    manifest: readManifest(dir),
    files: listTemplateFiles(dir),
    starter: lock,
    cleanup: async () => undefined,
  };
}
