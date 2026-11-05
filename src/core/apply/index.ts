// core/apply — execution of a Plan: copy, conditional blocks, pom.xml, env, project.json, rollback
// (CLAUDE.md 4.5, Étape 2). No direct I/O: disk access goes through the FsPort given by the caller.
export { TargetNotEmptyError, applyPlan, isText, transformText } from "./apply.js";
export type { ApplyContext, ApplyResult, FsPort } from "./apply.js";
export { BlockError, hasMarkers, parseMarker, stripBlocks } from "./blocks.js";
export { buildEnvLocal, randomSecret } from "./env.js";
export type { EnvLocalResult, SecretGenerator } from "./env.js";
export { PomError, isWellFormedXml, listDependencies, removeDependencies } from "./pom.js";
export { NameError, javaPackageFor, renameJavaSource, renamePath, renameProjectName, validateProjectName } from "./rename.js";
