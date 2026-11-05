import { describe, expect, it } from "vitest";
import { TargetNotEmptyError, applyPlan, isText, type ApplyContext } from "../../src/core/apply/index.js";
import { parseManifest } from "../../src/core/manifest/index.js";
import { plan } from "../../src/core/planner/index.js";
import { MemoryFs } from "../helpers/memory-fs.js";
import { PROVENANCE } from "../helpers/mini-starter.js";

const manifest = parseManifest(
  {
    schema: 1,
    name: "tiny-starter",
    app: { api: "api", web: "web", packageRoot: "com.forge.starter" },
    env: { example: ".env.example", local: ".env.local" },
    exclude: ["forge.template.json"],
    conditional: ["README.md", "api/pom.xml", ".env.example"],
    modules: {
      auth: {
        default: "jwt",
        options: {
          jwt: { files: ["api/src/main/java/com/forge/starter/auth/**"], maven: { "api/pom.xml": ["a:jwt"] }, env: ["JWT_SECRET"] },
          none: {},
        },
      },
    },
  },
  "forge.template.json",
);

const POM = `<?xml version="1.0"?>\n<project>\n  <dependencies>\n    <dependency>\n      <groupId>a</groupId>\n      <artifactId>jwt</artifactId>\n    </dependency>\n  </dependencies>\n</project>\n`;

function starter(extra: Record<string, string> = {}): MemoryFs {
  return new MemoryFs({
    "/starter/forge.template.json": "{}",
    "/starter/README.md": "# tiny-starter\n<!-- forge:if auth=jwt -->\nLogin enabled.\n<!-- forge:end -->\n",
    "/starter/.env.example": "# forge:if auth=jwt\nJWT_SECRET=change-me\n# forge:end\nPORT=8080\n",
    "/starter/api/pom.xml": POM,
    "/starter/api/src/main/java/com/forge/starter/auth/User.java": "package com.forge.starter.auth;\n",
    "/starter/api/src/main/java/com/forge/starter/App.java": "package com.forge.starter;\nimport com.forge.starter.auth.User;\n",
    "/starter/logo.png": "\u0089PNG\u0000\u0001binary",
    ...extra,
  });
}

function context(fs: MemoryFs): ApplyContext {
  return { manifest, templateRoot: "/starter", targetDir: "/work/shop", projectName: "shop", fs, tempSuffix: "t", secret: () => "generated" };
}

function planOf(fs: MemoryFs, auth: string) {
  const templateFiles = fs.paths("/starter/").map((p) => p.slice("/starter/".length));
  return plan({ manifest, selection: { auth }, templateFiles, provenance: PROVENANCE });
}

describe("applyPlan", () => {
  it("auth=jwt: copies, renames the package, resolves blocks, writes .env.local and .forge/project.json", async () => {
    const fs = starter();
    const result = await applyPlan(planOf(fs, "jwt"), context(fs));
    expect(fs.paths("/work/shop/")).toEqual([
      "/work/shop/.env.example",
      "/work/shop/.env.local",
      "/work/shop/.forge/project.json",
      "/work/shop/README.md",
      "/work/shop/api/pom.xml",
      "/work/shop/api/src/main/java/com/shop/App.java",
      "/work/shop/api/src/main/java/com/shop/auth/User.java",
      "/work/shop/logo.png",
    ]);
    expect(fs.text("/work/shop/README.md")).toBe("# shop\nLogin enabled.\n");
    expect(fs.text("/work/shop/api/src/main/java/com/shop/App.java")).toBe("package com.shop;\nimport com.shop.auth.User;\n");
    expect(fs.text("/work/shop/.env.local")).toContain("JWT_SECRET=generated\nPORT=8080");
    expect(fs.text("/work/shop/api/pom.xml")).toBe(POM);
    expect(JSON.parse(fs.text("/work/shop/.forge/project.json")).modules).toEqual({ auth: "jwt" });
    expect(fs.files.get("/work/shop/logo.png")).toEqual(fs.files.get("/starter/logo.png"));
    expect(result).toMatchObject({ javaPackage: "com.shop", envLocal: ".env.local", generatedSecrets: ["JWT_SECRET"] });
    expect(fs.paths("/work/.shop.forge-tmp")).toEqual([]);
  });

  it("auth=none: drops the auth files, the jwt dependency and the JWT variables", async () => {
    const fs = starter();
    await applyPlan(planOf(fs, "none"), context(fs));
    expect(fs.paths("/work/shop/api/src/")).toEqual(["/work/shop/api/src/main/java/com/shop/App.java"]);
    expect(fs.text("/work/shop/README.md")).toBe("# shop\n");
    expect(fs.text("/work/shop/api/pom.xml")).not.toContain("jwt");
    expect(fs.text("/work/shop/.env.local")).not.toContain("JWT");
  });

  it("rollback: an error in the middle leaves no target and no temporary folder", async () => {
    const fs = starter();
    fs.failOn = "auth/User.java";
    await expect(applyPlan(planOf(fs, "jwt"), context(fs))).rejects.toThrow(/disk full/);
    expect(fs.paths("/work/")).toEqual([]);
    expect(await fs.list("/work/shop")).toBeUndefined();
  });

  it("rollback on an unclosed block", async () => {
    const fs = starter({ "/starter/README.md": "# x\n<!-- forge:if auth=jwt -->\nnever closed\n" });
    await expect(applyPlan(planOf(fs, "jwt"), context(fs))).rejects.toThrow(/README.md:2: forge:if block is never closed/);
    expect(fs.paths("/work/")).toEqual([]);
  });

  it("refuses a target that already contains files, and touches nothing", async () => {
    const fs = starter({ "/work/shop/notes.txt": "mine" });
    await expect(applyPlan(planOf(fs, "jwt"), context(fs))).rejects.toThrow(TargetNotEmptyError);
    expect(fs.paths("/work/")).toEqual(["/work/shop/notes.txt"]);
  });

  it("accepts an existing empty folder and keeps it", async () => {
    const fs = starter();
    fs.dirs.add("/work/shop");
    await applyPlan(planOf(fs, "jwt"), context(fs));
    expect(fs.paths("/work/shop/")).toContain("/work/shop/README.md");
    expect(fs.paths("/work/.shop")).toEqual([]);
  });

  it("isText: by extension, then by NUL byte", () => {
    expect(isText("a/Dockerfile", new Uint8Array([0]))).toBe(true);
    expect(isText("a/logo.png", new Uint8Array([137, 80, 0]))).toBe(false);
    expect(isText("a/LICENSE", new TextEncoder().encode("Apache"))).toBe(true);
  });
});
