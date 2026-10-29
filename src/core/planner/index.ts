// core/planner — manifest + selection + template file list → Plan (CLAUDE.md 4.5, Étape 1 task 4).
export { STARTER_REPOSITORY, evaluateCondition, keptConditions } from "./conditions.js";
export { POST_STEPS, plan } from "./plan.js";
export type {
  ConditionalEntry,
  CopyEntry,
  EnvEntry,
  Plan,
  PlanInput,
  PomRemoveEntry,
  PostStep,
  ProjectJson,
  Provenance,
} from "./types.js";
