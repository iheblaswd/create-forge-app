import { describe, expect, it, vi } from "vitest";
import { parseManifest, type Manifest } from "../../src/core/manifest/index.js";
import { SelectionError, resolve, type AskCallback } from "../../src/core/selection/index.js";

const FILE = "forge.template.json";

/** Same module set as the mini-starter fixture (FORGE-5): auth, email, frontend, deploy. */
function miniStarterManifest(): Manifest {
  return parseManifest(
    {
      schema: 1,
      name: "mini-starter",
      app: { api: "apps/api", web: "apps/web", packageRoot: "com.forge.starter" },
      env: { example: ".env.example", local: ".env.local" },
      modules: {
        auth: { default: "jwt", options: { jwt: { env: ["JWT_SECRET"] }, none: {} } },
        email: { default: "smtp", options: { smtp: { env: ["SMTP_HOST"] }, none: {} } },
        frontend: { default: "next", options: { next: { files: ["apps/web/**"] }, none: {} } },
        deploy: { default: "docker", options: { docker: { files: ["apps/api/Dockerfile"] } } },
      },
    },
    FILE,
  );
}

/** A manifest where storage=supabase requires auth=supabase. */
function supabaseManifest(authDefault: "jwt" | "supabase"): Manifest {
  return parseManifest(
    {
      schema: 1,
      name: "supabase-starter",
      app: { api: "apps/api", web: "apps/web", packageRoot: "com.forge.starter" },
      env: { example: ".env.example", local: ".env.local" },
      modules: {
        auth: { default: authDefault, options: { jwt: {}, supabase: {}, none: {} } },
        storage: {
          default: "none",
          options: { supabase: { requires: { auth: "supabase" } }, none: {} },
        },
      },
    },
    FILE,
  );
}

describe("resolve(manifest, flags) — defaults and flags", () => {
  it("AC1: no flags gives every module its default", async () => {
    await expect(resolve(miniStarterManifest(), {})).resolves.toEqual({
      auth: "jwt",
      email: "smtp",
      frontend: "next",
      deploy: "docker",
    });
  });

  it("AC2: a flag overrides one module and the others keep their default", async () => {
    await expect(resolve(miniStarterManifest(), { auth: "none" })).resolves.toEqual({
      auth: "none",
      email: "smtp",
      frontend: "next",
      deploy: "docker",
    });
  });
});

describe("resolve(manifest, flags) — unknown names", () => {
  it("AC3: an unknown option names the module and lists the valid options", async () => {
    const promise = resolve(miniStarterManifest(), { auth: "ldap" });
    await expect(promise).rejects.toBeInstanceOf(SelectionError);
    await expect(promise).rejects.toThrow('option "ldap" is unknown for module auth (valid options: jwt, none)');
    await expect(promise).rejects.toThrow("Pass --auth jwt or --auth none.");
  });

  it("AC4: an unknown module names it and lists the valid modules", async () => {
    const promise = resolve(miniStarterManifest(), { payments: "stripe" });
    await expect(promise).rejects.toBeInstanceOf(SelectionError);
    await expect(promise).rejects.toThrow(
      'module "payments" is unknown (valid modules: auth, email, frontend, deploy)',
    );
  });

  it("reports the unknown module before checking its option value", async () => {
    await expect(resolve(miniStarterManifest(), { payments: "" })).rejects.toThrow('module "payments" is unknown');
  });
});

describe("resolve(manifest, flags) — requires", () => {
  it("AC5: an unsatisfied requires is reported as module=option requires module=option", async () => {
    const promise = resolve(supabaseManifest("jwt"), { storage: "supabase", auth: "jwt" });
    await expect(promise).rejects.toBeInstanceOf(SelectionError);
    await expect(promise).rejects.toThrow("storage=supabase requires auth=supabase (you selected auth=jwt)");
    await expect(promise).rejects.toThrow("Pass --auth supabase or choose another storage option.");
  });

  it("AC5b: a requires is also checked against a default, not only against flags", async () => {
    await expect(resolve(supabaseManifest("jwt"), { storage: "supabase" })).rejects.toThrow(
      "storage=supabase requires auth=supabase (you selected auth=jwt)",
    );
  });

  it("AC6: a requires satisfied by a default is valid", async () => {
    await expect(resolve(supabaseManifest("supabase"), { storage: "supabase" })).resolves.toEqual({
      auth: "supabase",
      storage: "supabase",
    });
  });
});

describe("resolve(manifest, flags, ask) — prompting for modules absent from flags", () => {
  it("AC7: ask is called once per missing module with its options and default, and its answer is used", async () => {
    const ask = vi.fn<AskCallback>(async (module) => (module === "email" ? "none" : "jwt"));
    const selection = await resolve(miniStarterManifest(), { auth: "jwt", frontend: "next", deploy: "docker" }, ask);

    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith("email", ["smtp", "none"], "smtp");
    expect(selection).toEqual({ auth: "jwt", email: "none", frontend: "next", deploy: "docker" });
  });

  it("asks for every module absent from flags, in manifest order", async () => {
    const ask = vi.fn<AskCallback>(async (_module, _options, def) => def);
    await resolve(miniStarterManifest(), {}, ask);
    expect(ask.mock.calls.map(([module]) => module)).toEqual(["auth", "email", "frontend", "deploy"]);
  });

  it("rejects an answer that is not one of the module's options", async () => {
    const ask: AskCallback = async () => "ldap";
    await expect(resolve(miniStarterManifest(), { email: "smtp", frontend: "next", deploy: "docker" }, ask)).rejects.toThrow(
      'option "ldap" is unknown for module auth',
    );
  });

  it("validates flags before asking anything", async () => {
    const ask = vi.fn<AskCallback>(async (_module, _options, def) => def);
    await expect(resolve(miniStarterManifest(), { auth: "ldap" }, ask)).rejects.toBeInstanceOf(SelectionError);
    expect(ask).not.toHaveBeenCalled();
  });
});

describe("SelectionError", () => {
  it("carries the module, the reason and the hint", async () => {
    const error = await resolve(miniStarterManifest(), { auth: "ldap" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SelectionError);
    const selectionError = error as SelectionError;
    expect(selectionError.name).toBe("SelectionError");
    expect(selectionError.module).toBe("auth");
    expect(selectionError.hint).toBe("Pass --auth jwt or --auth none.");
  });
});
