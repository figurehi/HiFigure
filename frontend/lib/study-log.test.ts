import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkspaceRecoveryCheckpoint,
  iconSyncKey,
  referenceSyncKey,
  selectUnrecordedIcons,
  selectUnrecordedReferences,
  selectUnrecordedOutputs,
  selectUnrecordedSkeletons,
  selectUnsyncedEvents,
  skeletonSyncKey,
} from "./study-log";
import type { CustomIconReference, DiagramSkeletonCandidate, FigureVariant, ReferenceItem } from "./types";
import { defaultWorkspaceState, type StudyEvent } from "./workspace-state";

function makeEvent(index: number): StudyEvent {
  return {
    id: `event-${index}`,
    sessionId: "session-1",
    elapsedMs: index * 1000,
    stage: "brief",
    type: "session_started",
    targetIds: [],
  };
}

function makeVariant(overrides: Partial<FigureVariant> & { id: string }): FigureVariant {
  return {
    title: "Variant",
    description: "",
    layoutStrategy: "grid",
    svg: "",
    previewImageDataUrl: "data:image/png;base64,AAAA",
    ...overrides,
  };
}

test("selectUnsyncedEvents ships only events after the synced count", () => {
  const events = [makeEvent(1), makeEvent(2), makeEvent(3)];
  assert.deepEqual(selectUnsyncedEvents(events, 0).map((event) => event.id), [
    "event-1",
    "event-2",
    "event-3",
  ]);
  assert.deepEqual(selectUnsyncedEvents(events, 2).map((event) => event.id), ["event-3"]);
  assert.deepEqual(selectUnsyncedEvents(events, 3), []);
});

test("selectUnsyncedEvents tolerates a marker ahead of a rewritten event list", () => {
  const events = [makeEvent(1)];
  assert.deepEqual(selectUnsyncedEvents(events, 99), []);
  assert.deepEqual(selectUnsyncedEvents(events, -5).map((event) => event.id), ["event-1"]);
});

function makeSkeleton(overrides: Partial<DiagramSkeletonCandidate> & { id: string }): DiagramSkeletonCandidate {
  return {
    title: "Skeleton",
    referenceId: "ref-1",
    referenceTitle: "Reference",
    createdAt: "2026-08-11T00:00:00Z",
    xml: "<mxfile />",
    ...overrides,
  };
}

test("selectUnrecordedSkeletons skips recorded, tutorial, and empty candidates", () => {
  const candidates = [
    makeSkeleton({ id: "skeleton-1" }),
    makeSkeleton({ id: "skeleton-2" }),
    makeSkeleton({ id: "tutorial-skeleton-1" }),
    makeSkeleton({ id: "skeleton-3", xml: null, mermaid: null }),
    makeSkeleton({ id: "skeleton-4", xml: null, mermaid: "graph TD; A-->B" }),
  ];
  const pending = selectUnrecordedSkeletons(candidates, [skeletonSyncKey(candidates[0])]);
  assert.deepEqual(pending.map((candidate) => candidate.id), ["skeleton-2", "skeleton-4"]);
});

test("a revised skeleton is archived again as a new version", () => {
  const original = makeSkeleton({ id: "skeleton-1" });
  const revised = makeSkeleton({
    id: "skeleton-1",
    revisions: [
      { id: "rev-1", createdAt: "2026-08-11T00:05:00Z", instruction: "swap", targetLabel: "A", xmlBefore: "<mxfile />" },
    ],
  });
  assert.notEqual(skeletonSyncKey(original), skeletonSyncKey(revised));
  assert.deepEqual(
    selectUnrecordedSkeletons([revised], [skeletonSyncKey(original)]).map((candidate) => candidate.id),
    ["skeleton-1"],
  );
});

test("selectUnrecordedOutputs skips recorded, tutorial, and imageless variants", () => {
  const variants = [
    makeVariant({ id: "variant-1" }),
    makeVariant({ id: "variant-2" }),
    makeVariant({ id: "generate-9-tutorial-variant-1" }),
    makeVariant({ id: "variant-3", previewImageDataUrl: null, previewImageUrl: null, svg: "" }),
    makeVariant({ id: "variant-4", previewImageDataUrl: null, previewImageUrl: "/assets/v4.png" }),
  ];
  const pending = selectUnrecordedOutputs(variants, ["variant-1"]);
  assert.deepEqual(pending.map((variant) => variant.id), ["variant-2", "variant-4"]);
});

function makeReference(overrides: Partial<ReferenceItem> & { id: string }): ReferenceItem {
  return {
    title: "Reference",
    sourcePaper: "Paper",
    venue: "CHI",
    year: 2026,
    imageType: "method diagram",
    subject: "System",
    styleTags: ["clean"],
    similarityReason: "Relevant structure",
    thumbnail: "REF",
    thumbnailUrl: "/dataset/images/reference.png",
    imageDataUrl: null,
    structuralAnalysis: "Left-to-right flow",
    ...overrides,
  };
}

test("selectUnrecordedReferences archives each chosen Pocket role once", () => {
  const references = [
    makeReference({ id: "ref-layout" }),
    makeReference({ id: "ref-both", imageDataUrl: "data:image/png;base64,AAAA" }),
    makeReference({ id: "ref-not-selected" }),
  ];
  const pending = selectUnrecordedReferences(
    references,
    {
      "ref-layout": { layout: true },
      "ref-both": { layout: true, style: true },
      "ref-not-selected": {},
    },
    [referenceSyncKey("ref-both", "layout")],
  );
  assert.deepEqual(
    pending.map(({ reference, role, key }) => [reference.id, role, key]),
    [
      ["ref-layout", "layout", "ref-layout@layout"],
      ["ref-both", "style", "ref-both@style"],
    ],
  );
});

test("selectUnrecordedReferences waits for asynchronous Pocket image hydration", () => {
  const reference = makeReference({ id: "ref-hydrating", thumbnailUrl: null, imageDataUrl: null });
  assert.deepEqual(selectUnrecordedReferences([reference], { "ref-hydrating": { layout: true } }, []), []);
});

test("custom icon pixels are archived once per content version", () => {
  const icon: CustomIconReference = {
    id: "custom-icon-1",
    label: "Microscope",
    tags: ["lab"],
    description: "Extracted microscope",
    cropDataUrl: "data:image/png;base64,AAAA",
    sourceReferenceId: "style-ref",
    sourceRegionId: "region-1",
    contentHash: "hash-1",
  };
  assert.deepEqual(selectUnrecordedIcons([icon], []).map((item) => item.id), [icon.id]);
  assert.deepEqual(selectUnrecordedIcons([icon], [iconSyncKey(icon)]), []);
});

test("the durable workspace checkpoint keeps author choices but strips archived pixels", () => {
  const state = structuredClone(defaultWorkspaceState);
  state.board = [makeReference({
    id: "style-ref",
    thumbnailUrl: "data:image/png;base64,AAAA",
    imageDataUrl: "data:image/png;base64,BBBB",
  })];
  state.customIconReferences = [{
    id: "custom-icon-1",
    label: "Microscope",
    tags: ["lab"],
    description: "Extracted microscope",
    cropDataUrl: "data:image/png;base64,CCCC",
    sourceReferenceId: "style-ref",
    sourceRegionId: "region-1",
    contentHash: "hash-1",
  }];
  state.nodeIconBindings = { node1: "custom-icon-1" };

  const checkpoint = createWorkspaceRecoveryCheckpoint(state);
  assert.equal(checkpoint.board?.[0]?.thumbnailUrl, null);
  assert.equal(checkpoint.board?.[0]?.imageDataUrl, null);
  assert.equal(checkpoint.customIconReferences?.[0]?.cropDataUrl, "");
  assert.deepEqual(checkpoint.nodeIconBindings, { node1: "custom-icon-1" });
});
