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

/** Every subset of `options` (manifest order, size >= 2) that contains `selected`, joined by "|". */
function alternativesContaining(options: readonly string[], selected: string): string[] {
  const result: string[] = [];
  const count = options.length;
  for (let mask = 1; mask < 1 << count; mask++) {
    const subset = options.filter((_, i) => mask & (1 << i));
    if (subset.length >= 2 && subset.includes(selected)) result.push(subset.join("|"));
  }
  return result;
}

/**
 * All conditions that hold for the selection, in manifest order: for each module,
 * `<m>=<selected>`, every `<m>=<a>|<b>...` alternative (manifest order) containing the
 * selected option, then `<m>!=<o>` for every non-selected option.
 * `starter-repository` is never listed. Files must write alternatives in manifest order;
 * `evaluateCondition` is the normative evaluator for anything else.
 */
export function keptConditions(manifest: Manifest, selection: Selection): string[] {
  const keep: string[] = [];
  for (const [module, mod] of Object.entries(manifest.modules)) {
    const selected = selection[module];
    if (selected === undefined) throw new Error(`selection has no option for module "${module}"`);
    const options = Object.keys(mod.options);
    keep.push(`${module}=${selected}`);
    for (const alt of alternativesContaining(options, selected)) keep.push(`${module}=${alt}`);
    for (const option of options) {
      if (option !== selected) keep.push(`${module}!=${option}`);
    }
  }
  return keep;
}
