import { renamePath, type ApplyResult } from "../core/apply/index.js";
import type { Plan } from "../core/planner/index.js";
import type { StepReport } from "../steps/index.js";

/** Human-readable output of the CLI (banner, --dry-run plan, final summary). Pure. */

export function banner(version: string): string {
  return `\n  ▲ forge  create-forge-app v${version}\n    Spring Boot 3 + Next.js 15, only the modules you choose\n`;
}

export function formatSelection(selection: Readonly<Record<string, string>>): string {
  return Object.entries(selection)
    .map(([module, option]) => `${module}=${option}`)
    .join("  ");
}

/** The Plan as a person reads it (--dry-run). Faithful: every entry of the Plan is printed. */
export function formatPlan(
  plan: Plan,
  projectName: string,
  javaPackage: string,
  envLocal: string,
  packageRoot: string,
): string {
  const { projectJson } = plan;
  const lines = [
    `Plan for ${projectName} (dry run, nothing written)`,
    "",
    `Starter   ${projectJson.starter.repo} @ ${projectJson.starter.ref} (${projectJson.starter.commit.slice(0, 12)})`,
    `Modules   ${formatSelection(projectJson.modules)}`,
    `Package   ${javaPackage}`,
    "",
    `Files to copy (${plan.copy.length})`,
    ...plan.copy.map((c) => `  + ${renamePath(c.to, packageRoot, javaPackage)}`),
    "",
    `Conditional blocks resolved in (${plan.conditional.length})`,
    ...plan.conditional.map((c) => `  ~ ${c.file}`),
    `  kept facts: ${plan.conditional[0]?.keep.join(", ") ?? "-"}`,
    "",
    `Maven dependencies removed (${plan.pomRemove.length})`,
    ...(plan.pomRemove.length ? plan.pomRemove.map((p) => `  - ${p.coords}  (${p.file})`) : ["  none"]),
    "",
    `Environment variables in ${envLocal} (${plan.env.length})`,
    ...(plan.env.length ? plan.env.map((e) => `  ${e.key}`) : ["  none"]),
    "",
    "Also written",
    "  .forge/project.json",
    "",
    `Then: ${plan.postSteps.join(", ")}`,
    "",
  ];
  return lines.join("\n");
}

export function formatSummary(
  projectName: string,
  directoryForCd: string,
  result: ApplyResult,
  reports: readonly StepReport[],
): string {
  const icon = { done: "✔", skipped: "·", warning: "!" } as const;
  const lines = [
    "",
    `✔ ${projectName} created (${result.files.length} files, Java package ${result.javaPackage})`,
    ...(result.envLocal ? [`✔ ${result.envLocal} written${result.generatedSecrets.length ? ` (random ${result.generatedSecrets.join(", ")})` : ""}`] : []),
    ...reports.map((r) => `${icon[r.status]} ${r.step}: ${r.message}`),
    "",
    "Next steps:",
    `  cd ${directoryForCd}`,
    ...(reports.some((r) => r.step === "pnpm-install" && r.status !== "done") ? ["  pnpm install"] : []),
    "  pnpm dev",
    "",
    "Provenance is recorded in .forge/project.json (used later by forge upgrade / add / remove).",
    "",
  ];
  return lines.join("\n");
}
