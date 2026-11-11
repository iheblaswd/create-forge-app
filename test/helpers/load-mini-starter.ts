import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parseManifest, type Manifest } from "../../src/core/manifest/index.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "mini-starter");
const MANIFEST_FILE = "forge.template.json";

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [relative(FIXTURE, full).replaceAll("\\", "/")];
  });
}

/**
 * Test-only loader: the single place where the planner snapshot tests touch the disk.
 * Returns the fixture manifest and its file list (relative POSIX paths, sorted).
 */
export function loadMiniStarter(): { manifest: Manifest; templateFiles: string[] } {
  const manifest = parseManifest(JSON.parse(readFileSync(join(FIXTURE, MANIFEST_FILE), "utf8")), MANIFEST_FILE);
  return { manifest, templateFiles: listFiles(FIXTURE).sort() };
}
