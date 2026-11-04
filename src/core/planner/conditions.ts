import type { Manifest } from "../manifest/index.js";
import type { Selection } from "../selection/index.js";

/** Maintainer-only sections (CLAUDE.md 4.4): never kept in a generated project. */
export const STARTER_REPOSITORY = "starter-repository";

const CONDITION = /^([^=!\s]+)(!?=)(\S+)$/;

/**
 * Evaluate one `forge:if` condition against the selection:
 * `auth=jwt`, `auth!=none`, `email=smtp|resend` (true if the selected option is one of
 * the alternatives), `starter-repository` (always false). Unknown syntax or module throws.
 */
export function evaluateCondition(condition: string, selection: Selection): boolean {
  if (condition === STARTER_REPOSITORY) return false;
  const match = CONDITION.exec(condition);
  const module = match?.[1];
  const operator = match?.[2];
  const alternatives = match?.[3];
  if (module === undefined || operator === undefined || alternatives === undefined) {
    throw new Error(
      `invalid forge:if condition "${condition}" (expected "<module>=<option>[|<option>...]" or "<module>!=<option>")`,
    );
  }
  if (!Object.hasOwn(selection, module)) {
    throw new Error(`forge:if condition "${condition}" refers to unknown module "${module}"`);
  }
  const selected = selection[module] ?? "";
  const holds = alternatives.split("|").includes(selected);
  return operator === "=" ? holds : !holds;
}

/**
 * The plain fact list of the selection, in manifest order: for each module `<m>=<selected>`,
 * then `<m>!=<o>` for every non-selected option. `starter-repository` and `a|b` alternatives
 * are never listed.
 *
 * keep[] is informational (for `--dry-run` output and Plan snapshots). It is NOT how blocks are
 * decided: `apply` evaluates each `forge:if` marker with
 * `evaluateCondition(cond, plan.projectJson.modules)`, the normative evaluator, so any spelling
 * of alternatives (`email=smtp|resend`, `email=resend|smtp`) gives the same result as --dry-run.
 */
export function keptConditions(manifest: Manifest, selection: Selection): string[] {
  const keep: string[] = [];
  for (const [module, mod] of Object.entries(manifest.modules)) {
    const selected = selection[module];
    if (selected === undefined) throw new Error(`selection has no option for module "${module}"`);
    keep.push(`${module}=${selected}`);
    for (const option of Object.keys(mod.options)) {
      if (option !== selected) keep.push(`${module}!=${option}`);
    }
  }
  return keep;
}
