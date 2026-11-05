import { describe, expect, it } from "vitest";
import { UsageError, parseArgs, splitModuleFlags } from "../../src/cli/args.js";

describe("parseArgs", () => {
  it("module flags are generic: any --<module> <option> that is not a CLI option", () => {
    expect(parseArgs(["my-app", "--auth", "none", "--storage=r2", "-y", "--dry-run"], "1.0.0")).toEqual({
      command: "create",
      directory: "my-app",
      moduleFlags: { auth: "none", storage: "r2" },
      dryRun: true,
      yes: true,
      install: true,
      git: true,
    });
  });

  it("CLI options of CLAUDE.md 5", () => {
    const args = parseArgs(["--template-dir", "../starter", "app", "--no-install", "--no-git"], "1.0.0");
    expect(args).toMatchObject({ directory: "app", templateDir: "../starter", install: false, git: false, moduleFlags: {} });
    expect(parseArgs(["app", "--ref=v0.2.0"], "1.0.0")).toMatchObject({ directory: "app", ref: "v0.2.0" });
  });

  it("help and version", () => {
    expect(parseArgs(["--version"], "1.2.3")).toEqual({ command: "version", text: "create-forge-app v1.2.3\n" });
    const help = parseArgs(["--help"], "1.2.3");
    expect(help.command).toBe("help");
    expect(help.command === "help" && help.text).toContain("--template-dir");
  });

  it("later commands are announced, not run", () => {
    expect(parseArgs(["upgrade"], "1.0.0")).toMatchObject({ command: "not-yet" });
  });

  it("usage errors", () => {
    expect(() => splitModuleFlags(["--auth"])).toThrow(UsageError);
    expect(() => parseArgs(["a", "b"], "1")).toThrow(/too many arguments/);
    expect(() => parseArgs(["a", "--ref", "x", "--template-dir", "y"], "1")).toThrow(/cannot be used together/);
  });
});
