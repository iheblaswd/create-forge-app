import * as clack from "@clack/prompts";
import type { AskCallback } from "../core/selection/index.js";

/** Interactive questions (CLAUDE.md Étape 2 task 4): folder, "customise modules?", one select per module. */
export interface Prompter {
  askDirectory(defaultName: string): Promise<string>;
  askCustomise(): Promise<boolean>;
  ask: AskCallback;
  intro(text: string): void;
}

export class CancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "CancelledError";
  }
}

function orCancel<T>(value: T | symbol): T {
  if (clack.isCancel(value)) throw new CancelledError();
  return value as T;
}

export const clackPrompter: Prompter = {
  intro: (text) => clack.intro(text),
  askDirectory: async (defaultName) =>
    orCancel(
      await clack.text({
        message: "Project folder",
        placeholder: defaultName,
        defaultValue: defaultName,
        validate: (v) => (v !== undefined && /\s/.test(v) ? "No spaces in the folder name" : undefined),
      }),
    ),
  askCustomise: async () =>
    orCancel(await clack.confirm({ message: "Customise the modules? (No = recommended defaults)", initialValue: false })),
  ask: async (module, options, defaultOption) =>
    orCancel(
      await clack.select({
        message: module,
        initialValue: defaultOption,
        options: options.map((o) => ({ value: o, label: o, ...(o === defaultOption ? { hint: "default" } : {}) })),
      }),
    ),
};
