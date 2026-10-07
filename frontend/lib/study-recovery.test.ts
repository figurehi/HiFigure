import assert from "node:assert/strict";
import test from "node:test";

import type { StudyRecoveryArtifact } from "./api";
import {
  defaultWorkspaceState,
  latestRecoverableStudySessionArtifacts,
  mergeRecoveredStudyArtifacts,
} from "./workspace-state";

const artifact = (value: Partial<StudyRecoveryArtifact> & Pick<StudyRecoveryArtifact, "outputId" | "kind">): StudyRecoveryArtifact => ({
  receivedAt: "2026-08-21T13:00:00.000Z",
  sessionId: "20260801-session",
  title: value.outputId,
  metadata: {},
  ...value,
});

test("durable study archives restore missing Skeleton, Candidate, Edit, and History", () => {
  const state = structuredClone(defaultWorkspaceState);
  const recovered = mergeRecoveredStudyArtifacts(state, [
    artifact({
      outputId: "skeleton-1@0",
      kind: "skeleton",
      textFormat: "xml",
      textContent: "<mxfile>old</mxfile>",
      metadata: { skeletonId: "skeleton-1", selected: true, createdAt: "2026-08-21T12:59:00.000Z" },
    }),
    artifact({
      outputId: "skeleton-1@1",
      kind: "skeleton",
      receivedAt: "2026-08-21T13:01:00.000Z",
      textFormat: "xml",
      textContent: "<mxfile>latest</mxfile>",
      metadata: { skeletonId: "skeleton-1", selected: true, createdAt: "2026-08-21T12:59:00.000Z" },
    }),
    artifact({
      outputId: "candidate-1",
      kind: "candidate",
      receivedAt: "2026-08-21T13:02:00.000Z",
      artifactUrl: "http://127.0.0.1:8000/study/artifacts/20260801/outputs/candidate.png",
      metadata: { selected: true, sourceVariantId: null },
    }),
    artifact({
      outputId: "edit-1",
      kind: "revision",
      receivedAt: "2026-08-21T13:03:00.000Z",
      artifactUrl: "http://127.0.0.1:8000/study/artifacts/20260801/outputs/edit.png",
      metadata: { selected: true, sourceVariantId: "candidate-1" },
    }),
  ]);

  assert.equal(recovered.diagramSkeletonCandidates.length, 1);
  assert.equal(recovered.diagramSkeletonCandidates[0]?.xml, "<mxfile>latest</mxfile>");
  assert.deepEqual(recovered.variants.map((variant) => variant.id), ["edit-1", "candidate-1"]);
  assert.equal(recovered.variants.find((variant) => variant.id === "edit-1")?.sourceVariantId, "candidate-1");
  assert.deepEqual(recovered.figureHistory.map((entry) => entry.variantId), ["edit-1", "candidate-1"]);
  assert.equal(recovered.selectedDiagramSkeletonId, "skeleton-1");
  assert.equal(recovered.selectedVariantId, "edit-1");

  assert.equal(mergeRecoveredStudyArtifacts(recovered, []), recovered);
});

test("an empty replacement session falls back to the latest archived session with outputs", () => {
  const selected = latestRecoverableStudySessionArtifacts([
    artifact({
      outputId: "old-candidate",
      kind: "candidate",
      sessionId: "20260801-original",
      receivedAt: "2026-08-21T13:02:00.000Z",
    }),
    artifact({
      outputId: "old-edit",
      kind: "revision",
      sessionId: "20260801-original",
      receivedAt: "2026-08-21T13:03:00.000Z",
    }),
    artifact({
      outputId: "empty-session-reference",
      kind: "reference",
      sessionId: "20260801-empty-reentry",
      receivedAt: "2026-08-22T09:00:00.000Z",
    }),
  ]);

  assert.deepEqual(selected.map((item) => item.outputId), ["old-candidate", "old-edit"]);
  assert.ok(selected.every((item) => item.sessionId === "20260801-original"));
});

test("durable recovery repairs Skeleton content stripped by quota-safe browser persistence", () => {
  const state = structuredClone(defaultWorkspaceState);
  state.diagramSkeletonCandidates = [{
    id: "skeleton-compacted",
    title: "Saved Skeleton",
    referenceId: "reference-1",
    referenceTitle: "Layout reference",
    createdAt: "2026-08-21T12:59:00.000Z",
    source: "draw.io",
    xml: null,
    mermaid: null,
    diagramPlan: null,
    revisions: [],
  }];
  state.selectedDiagramSkeletonId = "skeleton-compacted";

  const recovered = mergeRecoveredStudyArtifacts(state, [
    artifact({
      outputId: "skeleton-compacted@0",
      kind: "skeleton",
      textFormat: "xml",
      textContent: "<mxfile>restored after refresh</mxfile>",
      metadata: { skeletonId: "skeleton-compacted", selected: true },
    }),
  ]);

  assert.notEqual(recovered, state);
  assert.equal(recovered.diagramSkeletonCandidates[0]?.xml, "<mxfile>restored after refresh</mxfile>");
  assert.equal(recovered.diagramSkeletonXml, "<mxfile>restored after refresh</mxfile>");
});

test("durable recovery rejoins Layout, Style, icon pixels, and Match choices", () => {
  const state = structuredClone(defaultWorkspaceState);
  const checkpoint = {
    schemaVersion: 1,
    state: {
      activeStudioStep: "style",
      layoutReferenceId: "layout-ref",
      canvasFocusReferenceId: "style-ref",
      referenceUsage: {
        "layout-ref": { layout: true },
        "style-ref": { style: true },
      },
      customIconReferences: [{
        id: "custom-icon-1",
        label: "Recovered icon",
        tags: ["model"],
        description: "Saved icon",
        cropDataUrl: "",
        sourceReferenceId: "style-ref",
        sourceRegionId: "region-1",
        contentHash: "icon-hash",
      }],
      nodeIconBindings: { node1: "custom-icon-1" },
      iconReferenceIds: ["custom-icon-1"],
      iconReferenceId: "custom-icon-1",
    },
  };
  const recovered = mergeRecoveredStudyArtifacts(state, [
    artifact({
      outputId: "workspace-checkpoint",
      kind: "workspace",
      textFormat: "json",
      textContent: JSON.stringify(checkpoint),
    }),
    artifact({
      outputId: "reference-layout-layout-ref",
      kind: "reference",
      artifactUrl: "http://127.0.0.1:8000/layout.png",
      metadata: {
        role: "layout",
        referenceId: "layout-ref",
        sourcePaper: "Layout paper",
        venue: "CHI",
        year: 2026,
        imageType: "method figure",
        subject: "layout",
        styleTags: ["flow"],
        similarityReason: "layout",
        structuralAnalysis: "left to right",
      },
    }),
    artifact({
      outputId: "reference-style-style-ref",
      kind: "reference",
      artifactUrl: "http://127.0.0.1:8000/style.png",
      metadata: {
        role: "style",
        referenceId: "style-ref",
        sourcePaper: "Style paper",
        venue: "UIST",
        year: 2026,
        imageType: "method figure",
        subject: "style",
        styleTags: ["clean"],
        similarityReason: "style",
        structuralAnalysis: "rounded modules",
      },
    }),
    artifact({
      outputId: "icon-custom-icon-1",
      kind: "icon",
      artifactUrl: "http://127.0.0.1:8000/icon.png",
      metadata: {
        iconId: "custom-icon-1",
        label: "Recovered icon",
        tags: ["model"],
        description: "Saved icon",
        sourceReferenceId: "style-ref",
        sourceRegionId: "region-1",
        iconKind: "icon",
        contentHash: "icon-hash",
      },
    }),
  ]);

  assert.deepEqual(recovered.board.map((reference) => reference.id), ["layout-ref", "style-ref"]);
  assert.equal(recovered.referenceUsage["layout-ref"]?.layout, true);
  assert.equal(recovered.referenceUsage["style-ref"]?.style, true);
  assert.equal(recovered.layoutReferenceId, "layout-ref");
  assert.equal(recovered.canvasFocusReferenceId, "style-ref");
  assert.equal(recovered.customIconReferences[0]?.cropDataUrl, "http://127.0.0.1:8000/icon.png");
  assert.deepEqual(recovered.nodeIconBindings, { node1: "custom-icon-1" });
  assert.equal(recovered.activeStudioStep, "style");
});

test("archive checkpoints never overwrite a newer browser workspace", () => {
  const state = structuredClone(defaultWorkspaceState);
  state.prompt = "newer local prompt";
  state.activeStudioStep = "candidate";
  const recovered = mergeRecoveredStudyArtifacts(state, [
    artifact({
      outputId: "workspace-checkpoint",
      kind: "workspace",
      textFormat: "json",
      textContent: JSON.stringify({
        schemaVersion: 1,
        state: { prompt: "older archived prompt", activeStudioStep: "style" },
      }),
    }),
  ], { restoreCheckpoint: false });

  assert.equal(recovered, state);
  assert.equal(recovered.prompt, "newer local prompt");
  assert.equal(recovered.activeStudioStep, "candidate");
});
