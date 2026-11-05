import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLock } from "./bundled.js";
import { SourceError, listTemplateFiles, readManifest, type TemplateSource } from "./local.js";

/** Starter repository used when the lock file does not name one. */
export const DEFAULT_STARTER_REPO = "iheblaswd/forge-starter";

export type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/** Extract a .tar.gz into `dest`, dropping the top-level folder GitHub adds. */
export type Extract = (archive: string, dest: string) => void;

export const systemTar: Extract = (archive, dest) => {
  // tar ships with Windows 10+, macOS and Linux.
  const result = spawnSync("tar", ["-xzf", archive, "-C", dest, "--strip-components=1"], { stdio: "pipe" });
  if (result.status !== 0) {
    throw new SourceError(
      `could not extract the starter archive (${result.stderr?.toString().trim() || result.error?.message || "tar failed"})`,
      "Check that the `tar` command is available, or use --template-dir.",
    );
  }
};

export interface GithubOptions {
  ref: string;
  repo?: string;
  fetch?: Fetch;
  extract?: Extract;
  /** Commit the ref must point to (the lock commit when ref is the bundled ref). */
  expectedCommit?: string;
}

async function resolveCommit(fetchFn: Fetch, repo: string, ref: string): Promise<string> {
  const response = await fetchFn(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`, {
    headers: { Accept: "application/vnd.github.sha", "User-Agent": "create-forge-app" },
  });
  if (!response.ok) {
    throw new SourceError(
      `ref "${ref}" not found in github.com/${repo} (HTTP ${response.status})`,
      "Check the tag, branch or commit given to --ref.",
    );
  }
  const sha = (await response.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new SourceError(`unexpected answer from GitHub for ref "${ref}"`, "Retry later.");
  return sha;
}

/** `--ref <tag|branch|sha>`: download the starter tarball from GitHub, pinned to a commit. */
export async function githubSource(options: GithubOptions): Promise<TemplateSource> {
  const fetchFn = options.fetch ?? (globalThis.fetch as unknown as Fetch);
  const extract = options.extract ?? systemTar;
  const lock = readLock();
  const repo = options.repo ?? lock?.repo ?? DEFAULT_STARTER_REPO;
  const expected = options.expectedCommit ?? (lock && lock.ref === options.ref ? lock.commit : undefined);

  const commit = await resolveCommit(fetchFn, repo, options.ref);
  if (expected !== undefined && expected !== commit) {
    throw new SourceError(
      `${repo}@${options.ref} now points to ${commit.slice(0, 12)}, but this CLI was released with ${expected.slice(0, 12)}`,
      "The tag was moved: refuse to generate from an unverified starter. Pass --ref <sha> explicitly if you trust it.",
    );
  }

  const work = mkdtempSync(join(tmpdir(), "forge-starter-"));
  const cleanup = async (): Promise<void> => rmSync(work, { recursive: true, force: true });
  try {
    // Download the exact commit, not the moving ref.
    const response = await fetchFn(`https://codeload.github.com/${repo}/tar.gz/${commit}`, {
      headers: { "User-Agent": "create-forge-app" },
    });
    if (!response.ok) throw new SourceError(`download failed (HTTP ${response.status})`, "Retry, or use --template-dir.");
    const archive = join(work, "starter.tar.gz");
    writeFileSync(archive, new Uint8Array(await response.arrayBuffer()));
    const root = join(work, "starter");
    mkdirSync(root);
    extract(archive, root);
    if (readdirSync(root).length === 0) throw new SourceError("the starter archive is empty", "Check the --ref value.");
    return {
      kind: "github",
      root,
      manifest: readManifest(root),
      files: listTemplateFiles(root),
      starter: { repo, ref: options.ref, commit },
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
