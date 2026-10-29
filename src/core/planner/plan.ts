import picomatch from "picomatch";
import type { Manifest, ManifestOption } from "../manifest/index.js";
import type { Selection } from "../selection/index.js";
import { keptConditions } from "./conditions.js";
import type { EnvEntry, Plan, PlanInput, PomRemoveEntry, PostStep } from "./types.js";

export const POST_STEPS: readonly PostStep[] = ["git-init", "pnpm-install", "mvn-resolve"];

type Matcher = (path: string) => boolean;

/** One matcher for a list of globs / exact paths (dotfiles included, POSIX separators). */
function matcher(patterns: readonly string[]): Matcher {
  if (patterns.length === 0) return () => false;
  return picomatch([...patterns], { dot: true });
}

interface OptionRef {
  module: string;
  option: string;
  def: ManifestOption;
  selected: boolean;
  owns: Matcher;
}

function listOptions(manifest: Manifest, selection: Selection): OptionRef[] {
  const refs: OptionRef[] = [];
  for (const [module, mod] of Object.entries(manifest.modules)) {
    for (const [option, def] of Object.entries(mod.options)) {
      refs.push({ module, option, def, selected: selection[module] === option, owns: matcher(def.files) });
    }
  }
  return refs;
}

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * A file is copied unless it is excluded, or some module owns it (through one of its
 * options' `files`) while that module's selected option does not. Alternatives of one
 * module may share files (auth=jwt and auth=supabase); a file owned by two modules needs
 * both (apps/web/middleware.ts needs auth=jwt AND frontend=next). Files owned by nobody
 * are always copied.
 */
function filesToCopy(input: PlanInput, options: readonly OptionRef[]): string[] {
  const excluded = matcher(input.manifest.exclude);
  return input.templateFiles
    .filter((file) => {
      if (excluded(file)) return false;
      const owners = options.filter((o) => o.owns(file));
      const owningModules = new Set(owners.map((o) => o.module));
      return [...owningModules].every((module) => owners.some((o) => o.module === module && o.selected));
    })
    .sort(byString);
}

/** Union of unselected coords minus coords declared by a selected option, per pom file. */
function pomRemovals(options: readonly OptionRef[]): PomRemoveEntry[] {
  const kept = new Set<string>();
  const candidates = new Map<string, PomRemoveEntry>();
  for (const { def, selected } of options) {
    for (const [file, coordsList] of Object.entries(def.maven)) {
      for (const coords of coordsList) {
        const key = `${file} ${coords}`;
        if (selected) kept.add(key);
        else candidates.set(key, { file, coords });
      }
    }
  }
  return [...candidates.entries()]
    .filter(([key]) => !kept.has(key))
    .map(([, entry]) => entry)
    .sort((a, b) => byString(a.file, b.file) || byString(a.coords, b.coords));
}

/** Env keys of selected options, manifest order, deduplicated, value "". */
function envEntries(options: readonly OptionRef[]): EnvEntry[] {
  const keys = new Set<string>();
  for (const { def, selected } of options) {
    if (selected) def.env.forEach((key) => keys.add(key));
  }
  return [...keys].map((key) => ({ key, value: "" }));
}

/** Build the Plan (CLAUDE.md 4.5). Pure and deterministic: no I/O, stable ordering. */
export function plan(input: PlanInput): Plan {
  const options = listOptions(input.manifest, input.selection);
  const copy = filesToCopy(input, options).map((file) => ({ from: file, to: file }));
  const isConditional = matcher(input.manifest.conditional);
  const keep = keptConditions(input.manifest, input.selection);
  const conditional = copy.filter((c) => isConditional(c.to)).map((c) => ({ file: c.to, keep: [...keep] }));
  const { cliVersion, starter } = input.provenance;
  return {
    copy,
    conditional,
    pomRemove: pomRemovals(options),
    env: envEntries(options),
    projectJson: {
      cliVersion,
      starter: { repo: starter.repo, ref: starter.ref, commit: starter.commit },
      modules: { ...input.selection },
    },
    postSteps: [...POST_STEPS],
  };
}
