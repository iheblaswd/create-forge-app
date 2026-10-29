// core/manifest — loading + validation of forge.template.json (CLAUDE.md 4.4 / 4.5).
export { ManifestError } from "./errors.js";
export { parseManifest } from "./parse.js";
export { SUPPORTED_SCHEMA, manifestSchema } from "./schema.js";
export type { Manifest, ManifestModule, ManifestOption } from "./schema.js";
