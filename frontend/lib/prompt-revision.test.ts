import assert from "node:assert/strict";
import test from "node:test";
import {
  commitWorkingPromptRevision,
  createPromptFingerprint,
  defaultWorkspaceState,
  isLegacyAutoSeededStudyPrompt,
  promptArtifactIsStale,
} from "./workspace-state";

function createTestWorkspace() {
  return {
    ...defaultWorkspaceState,
    promptRevisions: [...defaultWorkspaceState.promptRevisions],
    studyEvents: [],
    candidateGenerationSnapshots: {},
  };
}

test("commits a Working Prompt revision without changing the assigned task", () => {
  const seeded = createTestWorkspace();
  const originalTask = seeded.assignedTaskSnapshot;
  const edited = {
    ...seeded,
    studySessionId: "prompt-test",
    studySessionStartedAt: "2026-08-04T00:00:00.000Z",
    studySessionStatus: "active" as const,
    prompt: `${seeded.prompt}\nEmphasize the conflict routing loop.`,
    generationBrief: `${seeded.prompt}\nEmphasize the conflict routing loop.`,
  };
  const committed = commitWorkingPromptRevision(
    edited,
    "retrieval",
    "2026-08-04T00:01:00.000Z",
  );

  assert.deepEqual(committed.assignedTaskSnapshot, originalTask);
  assert.equal(committed.promptRevisions.length, seeded.promptRevisions.length + 1);
  assert.equal(committed.generationBrief, edited.prompt);
  assert.equal(
    committed.promptRevisions.at(-1)?.fingerprint,
    createPromptFingerprint(edited.prompt),
  );
  assert.equal(
    committed.studyEvents.filter((event) => event.type === "working_prompt_revised").length,
    1,
  );
});

test("does not emit duplicate revisions for blur followed by retrieval", () => {
  const seeded = createTestWorkspace();
  const blurred = commitWorkingPromptRevision(seeded, "blur", "2026-08-04T00:01:00.000Z");
  const searched = commitWorkingPromptRevision(blurred, "retrieval", "2026-08-04T00:02:00.000Z");
  assert.equal(searched.promptRevisions.length, seeded.promptRevisions.length);
});

test("keeps the Skeleton composer in sync with a prompt committed elsewhere", () => {
  const seeded = createTestWorkspace();
  const nextPrompt = `${seeded.prompt}\nUse a compact left-to-right flow.`;
  const committed = commitWorkingPromptRevision({
    ...seeded,
    prompt: nextPrompt,
    generationBrief: nextPrompt,
  }, "blur", "2026-08-04T00:01:00.000Z");

  assert.equal(committed.guidedDialogue.skeletonPromptDraft, nextPrompt);
});

test("does not overwrite an intentional unsent Skeleton prompt draft", () => {
  const seeded = createTestWorkspace();
  const committed = commitWorkingPromptRevision({
    ...seeded,
    prompt: `${seeded.prompt}\nUse a compact left-to-right flow.`,
    guidedDialogue: {
      ...seeded.guidedDialogue,
      skeletonPromptDraft: "An unsent alternative direction.",
    },
  }, "blur", "2026-08-04T00:01:00.000Z");

  assert.equal(committed.guidedDialogue.skeletonPromptDraft, "An unsent alternative direction.");
});

test("marks a prompt-derived skeleton stale without deleting it", () => {
  const seeded = createTestWorkspace();
  const oldFingerprint = createPromptFingerprint(seeded.prompt);
  const withArtifacts = {
    ...seeded,
    diagramSkeletonXml: "<mxGraphModel />",
    diagramSkeletonPromptFingerprint: oldFingerprint,
    prompt: `${seeded.prompt}\nUse a compact reading order.`,
  };

  assert.equal(promptArtifactIsStale(withArtifacts, "skeleton"), true);
  assert.equal(withArtifacts.diagramSkeletonXml, "<mxGraphModel />");
});

test("clears only the legacy task text that the system auto-filled for a participant", () => {
  const taskBrief = "Assigned methodology description";
  assert.equal(isLegacyAutoSeededStudyPrompt(taskBrief, taskBrief, undefined), true);
  assert.equal(isLegacyAutoSeededStudyPrompt(taskBrief, taskBrief, [{
    id: "seed",
    text: taskBrief,
    fingerprint: createPromptFingerprint(taskBrief),
    createdAt: "2026-08-23T00:00:00.000Z",
    source: "initial",
  }]), true);
  assert.equal(isLegacyAutoSeededStudyPrompt("My own research idea", taskBrief, []), false);
  assert.equal(isLegacyAutoSeededStudyPrompt(taskBrief, taskBrief, [{
    id: "authored",
    text: taskBrief,
    fingerprint: createPromptFingerprint(taskBrief),
    createdAt: "2026-08-23T00:00:00.000Z",
    source: "blur",
  }]), false);
});
