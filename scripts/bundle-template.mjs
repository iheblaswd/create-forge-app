#!/usr/bin/env node
// Embed a release of the starter in this CLI build (CLAUDE.md 4.1): copy a forge-starter
// checkout into template/ and pin it in template.lock.json { repo, ref, commit }.
//
//   node scripts/bundle-template.mjs <path-to-forge-starter> --repo iheblaswd/forge-starter --ref v0.1.0
//
// The checkout must be clean and at the commit the ref points to: the CLI later refuses a
// --ref whose tag moved away from this commit.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const starter = args.find((a) => !a.startsWith("--"));
/** @param {string} name */
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

if (!starter) {
  process.stderr.write("usage: node scripts/bundle-template.mjs <path-to-forge-starter> --repo <owner/name> --ref <tag>\n");
  process.exit(1);
}
const dir = resolve(starter);
if (!existsSync(join(dir, "forge.template.json"))) {
  process.stderr.write(`${dir} has no forge.template.json\n`);
  process.exit(1);
}
/** @param {string[]} gitArgs */
const git = (gitArgs) => execFileSync("git", gitArgs, { cwd: dir, encoding: "utf8" }).trim();
if (git(["status", "--porcelain"]) !== "") {
  process.stderr.write("the starter checkout has uncommitted changes: commit or stash them first\n");
  process.exit(1);
}
const commit = git(["rev-parse", "HEAD"]);
const ref = option("ref") ?? git(["describe", "--tags", "--exact-match"]);
const repo = option("repo") ?? "iheblaswd/forge-starter";

const target = join(root, "template");
rmSync(target, { recursive: true, force: true });
cpSync(dir, target, { recursive: true, filter: (src) => ![".git", "node_modules"].includes(basename(src)) });
writeFileSync(join(root, "template.lock.json"), `${JSON.stringify({ repo, ref, commit }, null, 2)}\n`);
process.stdout.write(`bundled ${repo}@${ref} (${commit.slice(0, 12)}) into template/\n`);
