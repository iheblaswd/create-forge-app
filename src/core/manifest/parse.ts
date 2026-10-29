import type { z } from "zod";
import { ManifestError } from "./errors.js";
import { SUPPORTED_SCHEMA, manifestSchema, type Manifest } from "./schema.js";

const ROOT_PATH = "(root)";

function joinPath(path: ReadonlyArray<PropertyKey>): string {
  return path.length === 0 ? ROOT_PATH : path.map(String).join(".");
}

function issueToError(file: string, issue: z.core.$ZodIssue): ManifestError {
  switch (issue.code) {
    case "unrecognized_keys": {
      const key = issue.keys[0] ?? "";
      const path = joinPath([...issue.path, key]);
      return new ManifestError(file, path, `unknown key "${key}"`, "Remove it or fix the typo.");
    }
    case "invalid_type":
      if (issue.input === undefined) {
        return new ManifestError(
          file,
          joinPath(issue.path),
          `missing required field (expected ${issue.expected})`,
          "Add it to the manifest.",
        );
      }
      return new ManifestError(file, joinPath(issue.path), issue.message, "Fix the value type.");
    case "invalid_format":
    case "too_small":
      return new ManifestError(file, joinPath(issue.path), issue.message, "Fix the value.");
    default:
      return new ManifestError(file, joinPath(issue.path), issue.message, "Fix the manifest.");
  }
}

function checkSchemaVersion(file: string, json: unknown): void {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new ManifestError(
      file,
      ROOT_PATH,
      "the manifest must be a JSON object",
      "Check that the file contains a single JSON object.",
    );
  }
  const schema = (json as Record<string, unknown>).schema;
  if (typeof schema === "number" && schema > SUPPORTED_SCHEMA) {
    throw new ManifestError(
      file,
      "schema",
      `unsupported manifest schema ${schema}, this CLI supports schema ${SUPPORTED_SCHEMA}`,
      "upgrade create-forge-app",
    );
  }
}

/** Cross-field rules zod cannot express by shape alone. */
function checkSemantics(file: string, manifest: Manifest): void {
  for (const [moduleName, mod] of Object.entries(manifest.modules)) {
    const optionNames = Object.keys(mod.options);
    if (!(mod.default in mod.options)) {
      throw new ManifestError(
        file,
        `modules.${moduleName}.default`,
        `"${mod.default}" is not an option of module "${moduleName}" (available: ${optionNames.join(", ")})`,
        "Set default to one of the available options or add the missing option.",
      );
    }
    for (const [optionName, option] of Object.entries(mod.options)) {
      for (const [reqModule, reqOption] of Object.entries(option.requires)) {
        const path = `modules.${moduleName}.options.${optionName}.requires.${reqModule}`;
        const target = manifest.modules[reqModule];
        if (!target) {
          throw new ManifestError(
            file,
            path,
            `requires unknown module "${reqModule}" (available modules: ${Object.keys(manifest.modules).join(", ")})`,
            "Point requires to an existing module or add that module.",
          );
        }
        if (!(reqOption in target.options)) {
          throw new ManifestError(
            file,
            path,
            `requires "${reqModule}=${reqOption}" but module "${reqModule}" has no option "${reqOption}" (available: ${Object.keys(target.options).join(", ")})`,
            "Point requires to an existing option of that module.",
          );
        }
      }
    }
  }
}

/**
 * Validate an already-parsed forge.template.json and return a typed Manifest with
 * optional option fields (files, maven, env, requires) filled with empty values.
 * Pure: no I/O. Throws ManifestError on the first problem found.
 */
export function parseManifest(json: unknown, fileName: string): Manifest {
  checkSchemaVersion(fileName, json);

  const result = manifestSchema.safeParse(json);
  if (!result.success) {
    const [first] = result.error.issues;
    if (!first) {
      throw new ManifestError(fileName, ROOT_PATH, "invalid manifest", "Fix the manifest.");
    }
    throw issueToError(fileName, first);
  }

  checkSemantics(fileName, result.data);
  return result.data;
}
