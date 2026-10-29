import type { Manifest } from "../manifest/index.js";
import type { Selection } from "../selection/index.js";

/** Where the starter comes from; written verbatim into .forge/project.json (CLAUDE.md 4.3). */
export interface Provenance {
  cliVersion: string;
  starter: { repo: string; ref: string; commit: string };
}

export interface PlanInput {
  manifest: Manifest;
  selection: Selection;
  /** Relative POSIX paths of every file of the starter, as listed by core/sources. */
  templateFiles: readonly string[];
  provenance: Provenance;
}

export interface CopyEntry {
  from: string;
  to: string;
}

export interface ConditionalEntry {
  file: string;
  /** Conditions that hold for the selection, in the syntax the files use (CLAUDE.md 4.4). */
  keep: string[];
}

export interface PomRemoveEntry {
  file: string;
  /** "groupId:artifactId" */
  coords: string;
}

export interface EnvEntry {
  key: string;
  /** Always "" from the planner; apply fills it from the env example file (Étape 2). */
  value: string;
}

export interface ProjectJson {
  cliVersion: string;
  starter: { repo: string; ref: string; commit: string };
  modules: Selection;
}

export type PostStep = "git-init" | "pnpm-install" | "mvn-resolve";

/** Serialisable description of everything `apply` will do (CLAUDE.md 4.5). */
export interface Plan {
  copy: CopyEntry[];
  conditional: ConditionalEntry[];
  pomRemove: PomRemoveEntry[];
  env: EnvEntry[];
  projectJson: ProjectJson;
  postSteps: PostStep[];
}
