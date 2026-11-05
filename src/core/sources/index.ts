// core/sources — where the starter comes from: local folder (--template-dir), bundled tarball
// (template/ + template.lock.json) or GitHub (--ref). The only part of src/core allowed to do I/O.
import { bundledSource } from "./bundled.js";
import { githubSource, type Fetch, type Extract } from "./github.js";
import { localSource, type TemplateSource } from "./local.js";

export { LOCK_FILE, bundledSource, packageRoot, readLock } from "./bundled.js";
export { DEFAULT_STARTER_REPO, githubSource, systemTar } from "./github.js";
export type { Extract, Fetch, GithubOptions } from "./github.js";
export { MANIFEST_FILE, SourceError, listTemplateFiles, localSource, readGitCommit, readManifest } from "./local.js";
export type { StarterRef, TemplateSource } from "./local.js";

export interface SourceRequest {
  templateDir?: string;
  ref?: string;
  fetch?: Fetch;
  extract?: Extract;
}

/** Pick the source from the flags: --template-dir, then --ref, then the bundled starter. */
export async function openSource(request: SourceRequest): Promise<TemplateSource> {
  if (request.templateDir !== undefined) return localSource(request.templateDir);
  if (request.ref !== undefined) {
    return githubSource({
      ref: request.ref,
      ...(request.fetch ? { fetch: request.fetch } : {}),
      ...(request.extract ? { extract: request.extract } : {}),
    });
  }
  return bundledSource();
}
