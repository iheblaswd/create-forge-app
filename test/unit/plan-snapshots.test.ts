/**
 * Plan snapshots for the 4 reference combinations (CLAUDE.md 4.5, Étape 1 task 6).
 *
 * Hand validation (each snapshot in __snapshots__/plan-snapshots.test.ts.snap was read by a human):
 *
 * - "all" (auth=jwt, email=smtp, frontend=next, deploy=docker): pomRemove is empty; every
 *   conditional file lists every selected fact (auth=jwt, email=smtp, frontend=next,
 *   deploy=docker) and the "!=" facts of the unselected options; env is the jwt + smtp keys;
 *   copy holds the whole fixture minus forge.template.json and docs/maintainers/**.
 * - "auth=none": no file under auth/ and no apps/web/middleware.ts in copy; env has no JWT_*
 *   key; pomRemove contains spring-boot-starter-security and jjwt-api for apps/api/pom.xml.
 * - "frontend=none": nothing under apps/web/ and no pnpm-workspace.yaml in copy; the auth,
 *   email and deploy parts are unchanged from "all".
 * - "all none" (auth=none, email=none, frontend=none, deploy=docker): copy holds only files
 *   owned by nobody plus the deploy=docker files; env is empty; pomRemove lists the jwt and
 *   mail coordinates.
 */
import { describe, expect, it } from "vitest";
import { plan, type Plan } from "../../src/core/planner/index.js";
import type { Selection } from "../../src/core/selection/index.js";
import { loadMiniStarter } from "../helpers/load-mini-starter.js";

const PROVENANCE = {
  cliVersion: "0.0.0-test",
  starter: { repo: "forge/mini-starter", ref: "v1", commit: "0000000" },
} as const;

const ALL: Selection = { auth: "jwt", email: "smtp", frontend: "next", deploy: "docker" };

function planFor(overrides: Selection = {}): Plan {
  const { manifest, templateFiles } = loadMiniStarter();
  return plan({ manifest, selection: { ...ALL, ...overrides }, templateFiles, provenance: PROVENANCE });
}

const copied = (p: Plan) => p.copy.map((c) => c.to);
const envKeys = (p: Plan) => p.env.map((e) => e.key);
const removed = (p: Plan) => p.pomRemove.map((r) => r.coords);

describe("plan snapshots — mini-starter, 4 combinations", () => {
  it("all", () => {
    const result = planFor();
    expect(result).toMatchSnapshot();
    expect(result.pomRemove).toEqual([]);
    expect(envKeys(result)).toEqual(expect.arrayContaining(["JWT_SECRET", "SMTP_HOST"]));
  });

  it("auth=none", () => {
    const result = planFor({ auth: "none" });
    expect(result).toMatchSnapshot();
    expect(copied(result).some((f) => f.includes("/auth/"))).toBe(false);
    expect(envKeys(result).some((k) => k.startsWith("JWT_"))).toBe(false);
    expect(removed(result)).toEqual(
      expect.arrayContaining(["org.springframework.boot:spring-boot-starter-security", "io.jsonwebtoken:jjwt-api"]),
    );
  });

  it("frontend=none", () => {
    const result = planFor({ frontend: "none" });
    expect(result).toMatchSnapshot();
    expect(copied(result).some((f) => f.startsWith("apps/web/"))).toBe(false);
  });

  it("all none", () => {
    const result = planFor({ auth: "none", email: "none", frontend: "none" });
    expect(result).toMatchSnapshot();
    expect(result.env).toEqual([]);
    expect(copied(result)).toContain("apps/api/Dockerfile");
    expect(copied(result)).toContain("infra/compose.prod.yaml");
    expect(copied(result).some((f) => f.startsWith("apps/web/"))).toBe(false);
  });
});
