import assert from "node:assert/strict";
import test from "node:test";
import {
  createGuidedDialogueState,
  appendNarratorMessage,
  markNarratorMessagesStale,
  normalizeWorkspaceView,
  normalizeGuidedDialogueState,
  normalizeStyleAnalysisStates,
} from "./workspace-state";

test("old workspaces default to Studio while an explicit Advanced Board choice is preserved", () => {
  assert.equal(normalizeWorkspaceView(undefined), "studio");
  assert.equal(normalizeWorkspaceView("canvas"), "studio");
  assert.equal(normalizeWorkspaceView("advanced-board"), "advanced-board");
});

test("missing Narrator and Style Analysis data migrate to safe frontend defaults", () => {
  assert.deepEqual(normalizeGuidedDialogueState(undefined), createGuidedDialogueState());
  assert.deepEqual(normalizeStyleAnalysisStates(undefined), {});
});

test("Narrator decisions and explicit Style Analysis provenance survive normalization", () => {
  const dialogue = normalizeGuidedDialogueState({
    version: "older-script",
    currentSteps: { skeleton: "checkpoint", style: "review" },
    seenStepIds: ["skeleton:prompt", 2],
    completedStepIds: ["style:analysis"],
    skippedStepIds: [],
    collapsed: { skeleton: true, style: false },
    decisions: {
      style: {
        id: "decision-style-1",
        surface: "style",
        stepId: "style:checkpoint",
        choiceId: "confirm_style_collection",
        summary: "Primary Style selected; cached.",
        promptRevisionId: null,
        layoutReferenceId: null,
        skeletonId: "skeleton-1",
        styleReferenceId: "style-1",
        styleKitId: "kit-1",
        analysisStatus: "cached",
        artifactFingerprint: "fingerprint-1",
        status: "current",
        createdAt: "2026-08-04T10:00:00.000Z",
      },
    },
  });
  assert.equal(dialogue.currentSteps.style, "review");
  assert.equal(dialogue.decisions.style?.styleReferenceId, "style-1");
  assert.equal(dialogue.decisions.style?.analysisStatus, "cached");
  assert.deepEqual(dialogue.seenStepIds, ["skeleton:prompt"]);

  const analyses = normalizeStyleAnalysisStates({
    "style-1": {
      status: "completed",
      requestedAt: "2026-08-04T09:59:00.000Z",
      completedAt: "2026-08-04T10:00:00.000Z",
      resultFingerprint: "analysis-1",
      iconCount: 4,
      fontCount: 2,
      patternCount: 3,
      userRequested: true,
    },
    invalid: { status: "automatic" },
    interrupted: { status: "analyzing", userRequested: true },
  });
  assert.equal(analyses["style-1"].userRequested, true);
  assert.equal(analyses["style-1"].iconCount, 4);
  assert.equal(analyses.invalid, undefined);
  assert.equal(analyses.interrupted.status, "failed");
  assert.match(analyses.interrupted.errorReason ?? "", /interrupted/i);
});

test("conversation history is capped, keeps Prompt drafts, and can mark linked artifacts stale", () => {
  let dialogue = createGuidedDialogueState("draft prompt");
  for (let index = 0; index < 84; index += 1) {
    dialogue = appendNarratorMessage(dialogue, {
      surface: "skeleton",
      speaker: index % 2 ? "author" : "assistant",
      templateId: `message-${index}`,
      summary: `Message ${index}`,
      promptRevisionId: null,
      referenceId: "layout-1",
      artifactId: index === 83 ? "skeleton-1" : null,
      artifactFingerprint: `artifact-${index}`,
      createdAt: `2026-08-04T10:${String(index).padStart(2, "0")}:00.000Z`,
    });
  }
  assert.equal(dialogue.skeletonPromptDraft, "draft prompt");
  assert.equal(dialogue.messages.skeleton.length, 80);
  const stale = markNarratorMessagesStale(
    dialogue,
    "skeleton",
    (message) => message.artifactId === "skeleton-1",
  );
  assert.equal(stale.messages.skeleton.at(-1)?.status, "stale");
  assert.equal(stale.messages.skeleton.at(-2)?.status, "current");
});
