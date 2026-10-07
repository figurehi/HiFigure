import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const onboardingSource = readFileSync(new URL("../components/study-onboarding.tsx", import.meta.url), "utf8");
const entryGateSource = readFileSync(new URL("../components/study-entry-gate.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("./workspace-state.ts", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("./api.ts", import.meta.url), "utf8");

test("onboarding enters the workspace directly without a selected-task summary or mode choice", () => {
  assert.doesNotMatch(onboardingSource, /Selected task/i);
  assert.doesNotMatch(onboardingSource, /Choose a research task|study-task-picker|selectedTaskVersion/);
  assert.match(onboardingSource, /getParticipantTaskAssignment\(cleanUserId, tasks\)/);
  assert.doesNotMatch(onboardingSource, /Guide mode|Fast mode|controlPreference|walkthrough/);
  assert.match(onboardingSource, /workflowMode: "freeform"/);
  assert.match(onboardingSource, /entryMode: "direct"/);
});

test("guide and tutorial state are absent from the workspace shell and persistence model", () => {
  for (const source of [entryGateSource, workspaceSource, apiSource]) {
    assert.doesNotMatch(source, /tutorialMode|firstRunGuide|FirstRunGuide|CanvasFirstRunGuide/);
  }
});
