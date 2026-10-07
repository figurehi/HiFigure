import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const demoSeedSource = readFileSync(new URL("./demo-seed.ts", import.meta.url), "utf8");
const onboardingSource = readFileSync(
  new URL("../components/study-onboarding.tsx", import.meta.url),
  "utf8",
);
const workspaceSource = readFileSync(new URL("./workspace-state.ts", import.meta.url), "utf8");
const workbenchSource = readFileSync(
  new URL("../components/figure-workbench.tsx", import.meta.url),
  "utf8",
);

test("a new HiFigure participant starts with an empty Working Prompt", () => {
  assert.match(demoSeedSource, /const workingPrompt = options\.seedWorkingPrompt === false \? "" : task\.prompt/);
  assert.match(demoSeedSource, /prompt: workingPrompt/);
  assert.match(demoSeedSource, /generationBrief: workingPrompt/);
  assert.match(demoSeedSource, /promptRevisions: workingPrompt \? \[initialPromptRevision\] : \[\]/);
  assert.match(demoSeedSource, /currentPromptRevisionId: workingPrompt \? initialPromptRevision\.id : null/);
  assert.match(
    onboardingSource,
    /createDemoWorkspaceState\(selectedTask, \{ seedWorkingPrompt: false \}\)/,
  );
});

test("the assigned task brief remains independent from the empty Working Prompt", () => {
  assert.match(demoSeedSource, /assignedTaskSnapshot: \{[\s\S]*?brief: task\.prompt/);
});

test("participant entry does not revive an old system-seeded task as the Working Prompt", () => {
  assert.match(workspaceSource, /isLegacyAutoSeededStudyPrompt\(/);
  assert.match(workspaceSource, /const workingPrompt = clearLegacyAutoSeededPrompt \? "" : storedWorkingPrompt/);
  assert.match(workspaceSource, /const promptRevisions = clearLegacyAutoSeededPrompt\s*\? \[\]/);
  assert.match(workbenchSource, /className="textarea workspace-prompt-textarea"\s*autoComplete="off"/);
});
