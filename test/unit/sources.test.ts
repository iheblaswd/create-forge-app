import { cpSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SourceError, bundledSource, githubSource, listTemplateFiles, localSource, type Fetch } from "../../src/core/sources/index.js";
import { FIXTURE } from "../helpers/mini-starter.js";

const SHA = "a".repeat(40);

function fakeFetch(shaStatus = 200): { fetch: Fetch; urls: string[] } {
  const urls: string[] = [];
  const fetch: Fetch = async (url) => {
    urls.push(url);
    const isApi = url.startsWith("https://api.github.com/");
    return {
      ok: isApi ? shaStatus === 200 : true,
      status: isApi ? shaStatus : 200,
      text: async () => SHA,
      arrayBuffer: async () => new ArrayBuffer(8),
    };
  };
  return { fetch, urls };
}

describe("core/sources", () => {
  it("local: lists the starter files as sorted POSIX paths", () => {
    const source = localSource(FIXTURE);
    expect(source.kind).toBe("local");
    expect(source.files).toEqual(listTemplateFiles(FIXTURE));
    expect(source.files).toContain("apps/api/src/main/java/com/forge/starter/auth/domain/entities/User.java");
    expect(source.files).toEqual([...source.files].sort());
    expect(source.manifest.name).toBe("mini-starter");
  });

  it("local: a folder without a manifest is a SourceError", () => {
    expect(() => localSource(`${FIXTURE}/apps`)).toThrow(SourceError);
    expect(() => localSource(`${FIXTURE}/does-not-exist`)).toThrow(/template folder not found/);
  });

  it("bundled: a clear error when the build has no starter", () => {
    expect(() => bundledSource(FIXTURE)).toThrow(/no bundled starter/);
  });

  it("github: pins the ref to a commit, downloads that commit, reads the manifest", async () => {
    const { fetch, urls } = fakeFetch();
    const source = await githubSource({
      ref: "v0.1.0",
      repo: "someone/forge-starter",
      fetch,
      extract: (_archive, dest) => cpSync(FIXTURE, dest, { recursive: true }),
    });
    try {
      expect(urls).toEqual([
        "https://api.github.com/repos/someone/forge-starter/commits/v0.1.0",
        `https://codeload.github.com/someone/forge-starter/tar.gz/${SHA}`,
      ]);
      expect(source.starter).toEqual({ repo: "someone/forge-starter", ref: "v0.1.0", commit: SHA });
      expect(source.manifest.name).toBe("mini-starter");
    } finally {
      await source.cleanup();
    }
  });

  it("github: refuses a tag that moved away from the released commit", async () => {
    const { fetch } = fakeFetch();
    await expect(
      githubSource({ ref: "v0.1.0", repo: "r/s", fetch, extract: () => undefined, expectedCommit: "b".repeat(40) }),
    ).rejects.toThrow(/tag was moved/);
  });

  it("github: unknown ref", async () => {
    const { fetch } = fakeFetch(404);
    await expect(githubSource({ ref: "nope", repo: "r/s", fetch, extract: () => undefined })).rejects.toThrow(/not found/);
  });
});
