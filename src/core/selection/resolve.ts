import type { Manifest, ManifestModule } from "../manifest/index.js";
import { SelectionError } from "./errors.js";

/** One option chosen per manifest module, e.g. { auth: "jwt", email: "none" }. */
export type Selection = Record<string, string>;

/** CLI flags as given by the user, e.g. { auth: "jwt" } for `--auth jwt`. */
export type SelectionFlags = Readonly<Record<string, string>>;

/**
 * Asked once for every module absent from the flags. Receives the module name, its
 * valid options (manifest order) and its default; returns the chosen option.
 * Étape 2 wires @clack/prompts here; without a callback the default is used.
 */
export type AskCallback = (module: string, options: readonly string[], defaultOption: string) => Promise<string>;

function formatList(items: readonly string[]): string {
  return items.join(", ");
}

function unknownModule(module: string, manifest: Manifest): SelectionError {
  const valid = Object.keys(manifest.modules);
  return new SelectionError(
    module,
    `module "${module}" is unknown (valid modules: ${formatList(valid)})`,
    `Remove --${module} or pick one of: ${valid.map((m) => `--${m}`).join(", ")}.`,
  );
}

function unknownOption(module: string, option: string, mod: ManifestModule): SelectionError {
  const valid = Object.keys(mod.options);
  return new SelectionError(
    module,
    `option "${option}" is unknown for module ${module} (valid options: ${formatList(valid)})`,
    `Pass ${valid.map((o) => `--${module} ${o}`).join(" or ")}.`,
  );
}

function checkOption(manifest: Manifest, module: string, option: string): void {
  const mod = manifest.modules[module];
  if (!mod) throw unknownModule(module, manifest);
  if (!(option in mod.options)) throw unknownOption(module, option, mod);
}

/** Every `requires` of every selected option must hold in the final selection. */
function checkRequires(manifest: Manifest, selection: Selection): void {
  for (const [module, option] of Object.entries(selection)) {
    const requires = manifest.modules[module]?.options[option]?.requires ?? {};
    for (const [reqModule, reqOption] of Object.entries(requires)) {
      const actual = selection[reqModule];
      if (actual !== reqOption) {
        throw new SelectionError(
          module,
          `${module}=${option} requires ${reqModule}=${reqOption} (you selected ${reqModule}=${actual})`,
          `Pass --${reqModule} ${reqOption} or choose another ${module} option.`,
        );
      }
    }
  }
}

/**
 * Resolve the option of every manifest module from CLI flags, the optional `ask`
 * callback (for modules absent from flags) and the manifest defaults, then check
 * every `requires`. Pure: no I/O. Throws SelectionError on the first problem.
 */
export async function resolve(manifest: Manifest, flags: SelectionFlags, ask?: AskCallback): Promise<Selection> {
  for (const [module, option] of Object.entries(flags)) {
    checkOption(manifest, module, option);
  }

  const selection: Selection = {};
  for (const [module, mod] of Object.entries(manifest.modules)) {
    const flagged = flags[module];
    if (flagged !== undefined) {
      selection[module] = flagged;
    } else if (ask) {
      const answer = await ask(module, Object.keys(mod.options), mod.default);
      checkOption(manifest, module, answer);
      selection[module] = answer;
    } else {
      selection[module] = mod.default;
    }
  }

  checkRequires(manifest, selection);
  return selection;
}
