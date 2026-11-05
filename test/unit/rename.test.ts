import { describe, expect, it } from "vitest";
import { NameError, javaPackageFor, renameJavaSource, renamePath, renameProjectName, validateProjectName } from "../../src/core/apply/index.js";

describe("project naming", () => {
  it.each([
    ["my-app", "com.myapp"],
    ["Shop_2", "com.shop2"],
    ["2fast", "com.app2fast"],
    ["class", "com.appclass"],
  ])("javaPackageFor(%s) = %s", (name, pkg) => {
    expect(javaPackageFor(name)).toBe(pkg);
  });

  it.each(["my-app", "app2", "a.b_c"])("accepts %s", (name) => {
    expect(validateProjectName(name)).toBe(name);
  });

  it.each(["My App", "-app", ".hidden", "", "été"])("rejects %j", (name) => {
    expect(() => validateProjectName(name)).toThrow(NameError);
  });

  it("moves files out of the starter package folder", () => {
    expect(renamePath("apps/api/src/main/java/com/forge/starter/auth/User.java", "com.forge.starter", "com.myapp")).toBe(
      "apps/api/src/main/java/com/myapp/auth/User.java",
    );
    expect(renamePath("apps/web/page.tsx", "com.forge.starter", "com.myapp")).toBe("apps/web/page.tsx");
  });

  it("rewrites package, import and qualified references, whole segments only", () => {
    const src = [
      "package com.forge.starter.auth;",
      "import com.forge.starter.shared.Base;",
      "import static com.forge.starter.Util.x;",
      '@Scan("com.forge.starter")',
      "import com.forge.starterkit.Other;",
    ].join("\n");
    expect(renameJavaSource(src, "com.forge.starter", "com.myapp")).toBe(
      ["package com.myapp.auth;", "import com.myapp.shared.Base;", "import static com.myapp.Util.x;", '@Scan("com.myapp")', "import com.forge.starterkit.Other;"].join("\n"),
    );
  });

  it("replaces the starter name as a whole word", () => {
    expect(renameProjectName("# mini-starter\nmini-starter-parent\nmini_starter\nmini-starters", "mini-starter", "shop")).toBe(
      "# shop\nshop-parent\nmini_starter\nmini-starters",
    );
  });
});
