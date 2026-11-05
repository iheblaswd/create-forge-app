import { describe, expect, it } from "vitest";
import { COMBINATIONS, planFor } from "../helpers/mini-starter.js";

// FORGE-7 (CLAUDE.md Étape 1 task 6): one Plan snapshot per combination of the mini-starter.
// The snapshots were checked by hand against the mini-starter README "Expected results".
// A change in the planner that alters a Plan shows up here as a snapshot diff to review.
describe("Plan snapshots — mini-starter", () => {
  it.each(Object.entries(COMBINATIONS))("%s", (_name, selection) => {
    expect(planFor(selection)).toMatchSnapshot();
  });
});
