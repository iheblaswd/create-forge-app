import { describe, expect, it } from "vitest";
import { ManifestError, parseManifest } from "../../src/core/manifest/index.js";

const FILE = "forge.template.json";

/** The CLAUDE.md 4.4 example, with the "..." placeholders replaced by valid options. */
function exampleManifest(): Record<string, unknown> {
  return {
    schema: 1,
    name: "forge-starter",
    app: { api: "apps/api", web: "apps/web", packageRoot: "com.forge.starter" },
    env: { example: ".env.example", local: ".env.local" },
    exclude: [".github/workflows/starter-release.yml", "docs/maintainers/**"],
    conditional: [
      "pom.xml",
      "apps/api/pom.xml",
      "apps/api/src/main/resources/application*.yml",
      "infra/compose.yaml",
      ".env.example",
      "package.json",
      "SETUP.md",
      "README.md",
    ],
    modules: {
      auth: {
        default: "jwt",
        options: {
          jwt: {
            files: [
              "apps/api/src/main/java/com/forge/starter/auth/**",
              "apps/api/src/test/java/com/forge/starter/auth/**",
              "apps/api/src/main/resources/db/migration/auth/**",
              "packages/contract/openapi/auth.yaml",
              "apps/web/src/app/(auth)/**",
              "apps/web/src/app/api/auth/**",
              "apps/web/src/lib/auth/**",
              "apps/web/middleware.ts",
            ],
            maven: {
              "apps/api/pom.xml": [
                "org.springframework.boot:spring-boot-starter-security",
                "io.jsonwebtoken:jjwt-api",
                "com.bucket4j:bucket4j-core",
              ],
            },
            env: ["JWT_SECRET", "JWT_ACCESS_TTL", "JWT_REFRESH_TTL"],
            requires: {},
          },
          none: { files: [], maven: {}, env: [] },
        },
      },
      email: {
        default: "smtp",
        options: {
          smtp: {
            files: ["apps/api/src/main/java/com/forge/starter/shared/infrastructure/email/**"],
            maven: { "apps/api/pom.xml": ["org.springframework.boot:spring-boot-starter-mail"] },
            env: ["SMTP_HOST", "SMTP_PORT"],
          },
          none: {},
        },
      },
      frontend: {
        default: "next",
        options: {
          next: { files: ["apps/web/**", "pnpm-workspace.yaml"] },
          none: {},
        },
      },
      deploy: {
        default: "docker",
        options: {
          docker: { files: ["apps/api/Dockerfile", "apps/web/Dockerfile", "infra/compose.prod.yaml"] },
        },
      },
    },
  };
}

function parseError(json: unknown): ManifestError {
  try {
    parseManifest(json, FILE);
  } catch (e) {
    if (e instanceof ManifestError) return e;
    throw e;
  }
  throw new Error("expected parseManifest to throw a ManifestError");
}

describe("parseManifest", () => {
  it("parses the CLAUDE.md 4.4 example and fills missing option fields with empty values", () => {
    const manifest = parseManifest(exampleManifest(), FILE);

    expect(manifest.schema).toBe(1);
    expect(manifest.name).toBe("forge-starter");
    expect(manifest.app).toEqual({ api: "apps/api", web: "apps/web", packageRoot: "com.forge.starter" });
    expect(manifest.env).toEqual({ example: ".env.example", local: ".env.local" });
    expect(manifest.exclude).toEqual([".github/workflows/starter-release.yml", "docs/maintainers/**"]);
    expect(manifest.conditional).toHaveLength(8);

    expect(manifest.modules.auth?.default).toBe("jwt");
    expect(manifest.modules.auth?.options.jwt?.maven).toEqual({
      "apps/api/pom.xml": [
        "org.springframework.boot:spring-boot-starter-security",
        "io.jsonwebtoken:jjwt-api",
        "com.bucket4j:bucket4j-core",
      ],
    });
    expect(manifest.modules.auth?.options.jwt?.requires).toEqual({});

    // "none" omitted requires; email/none and frontend/none omitted everything.
    expect(manifest.modules.auth?.options.none).toEqual({ files: [], maven: {}, env: [], requires: {} });
    expect(manifest.modules.email?.options.none).toEqual({ files: [], maven: {}, env: [], requires: {} });
    expect(manifest.modules.frontend?.options.next).toEqual({
      files: ["apps/web/**", "pnpm-workspace.yaml"],
      maven: {},
      env: [],
      requires: {},
    });
  });

  it("refuses schema 2 with a message naming the file, the path and the supported schema", () => {
    const err = parseError({ ...exampleManifest(), schema: 2 });

    expect(err.file).toBe(FILE);
    expect(err.path).toBe("schema");
    expect(err.reason).toBe("unsupported manifest schema 2, this CLI supports schema 1");
    expect(err.hint).toBe("upgrade create-forge-app");
    expect(err.message).toContain(FILE);
    expect(err.message).toContain("schema");
    expect(err.message).toContain("this CLI supports schema 1");
    expect(err.message).toContain("upgrade create-forge-app");
  });

  it("rejects a default that is not one of the module's options and lists the available ones", () => {
    const json = exampleManifest();
    (json.modules as Record<string, { default: string }>).auth!.default = "oauth";
    const err = parseError(json);

    expect(err.path).toBe("modules.auth.default");
    expect(err.reason).toContain('"oauth"');
    expect(err.reason).toContain("jwt");
    expect(err.reason).toContain("none");
    expect(err.message).toContain(FILE);
  });

  it("rejects a requires target naming an option the module does not have", () => {
    const json = exampleManifest();
    const email = (json.modules as Record<string, { options: Record<string, Record<string, unknown>> }>)
      .email!;
    email.options.smtp!.requires = { auth: "supabase" };
    const err = parseError(json);

    expect(err.path).toBe("modules.email.options.smtp.requires.auth");
    expect(err.reason).toContain("supabase");
    expect(err.reason).toContain("auth");
  });

  it("rejects a requires target naming a module that does not exist", () => {
    const json = exampleManifest();
    const email = (json.modules as Record<string, { options: Record<string, Record<string, unknown>> }>)
      .email!;
    email.options.smtp!.requires = { storage: "s3" };
    const err = parseError(json);

    expect(err.path).toBe("modules.email.options.smtp.requires.storage");
    expect(err.reason).toContain("storage");
  });

  it("rejects a maven coordinate without a colon and says the expected form", () => {
    const json = exampleManifest();
    const auth = (json.modules as Record<string, { options: Record<string, Record<string, unknown>> }>)
      .auth!;
    auth.options.jwt!.maven = { "apps/api/pom.xml": ["io.jsonwebtoken"] };
    const err = parseError(json);

    expect(err.path).toBe("modules.auth.options.jwt.maven.apps/api/pom.xml.0");
    expect(err.reason).toContain("groupId:artifactId");
    expect(err.message).toContain("groupId:artifactId");
  });

  it("reports a missing top-level modules key with the file and the path, not a zod dump", () => {
    const json = exampleManifest();
    delete json.modules;
    const err = parseError(json);

    expect(err.file).toBe(FILE);
    expect(err.path).toBe("modules");
    expect(err.message).not.toMatch(/ZodError|issues|\[\s*{/);
    expect(err.message).toContain(FILE);
    expect(err.message).toContain("modules");
  });

  it("rejects unknown top-level keys (typo protection)", () => {
    const json = exampleManifest();
    json.modulse = json.modules;
    delete json.modules;
    const err = parseError(json);

    // Both "modules missing" and "modulse unknown" are reportable; the first one wins.
    expect(["modules", "modulse"]).toContain(err.path);
  });

  it("rejects a non-object root", () => {
    const err = parseError("not a manifest");
    expect(err.path).toBe("(root)");
    expect(err.message).toContain(FILE);
  });
});
