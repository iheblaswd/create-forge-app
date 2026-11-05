import { join } from "node:path";
import type { Plan } from "../../src/core/planner/index.js";
import { plan } from "../../src/core/planner/index.js";
import type { Selection } from "../../src/core/selection/index.js";
import { localSource } from "../../src/core/sources/index.js";

export const FIXTURE = join(import.meta.dirname, "..", "fixtures", "mini-starter");

export const PROVENANCE = {
  cliVersion: "0.1.0",
  starter: { repo: "forge/forge-starter", ref: "v0.1.0", commit: "0123456789abcdef0123456789abcdef01234567" },
} as const;

export const DEFAULTS: Selection = { auth: "jwt", email: "smtp", frontend: "next", deploy: "docker" };

/** The four combinations of CLAUDE.md Étape 1 task 6. */
export const COMBINATIONS: Readonly<Record<string, Selection>> = {
  all: DEFAULTS,
  "auth=none": { ...DEFAULTS, auth: "none" },
  "frontend=none": { ...DEFAULTS, frontend: "none" },
  "all none": { auth: "none", email: "none", frontend: "none", deploy: "docker" },
};

export function planFor(selection: Selection): Plan {
  const source = localSource(FIXTURE);
  return plan({ manifest: source.manifest, selection, templateFiles: source.files, provenance: PROVENANCE });
}
