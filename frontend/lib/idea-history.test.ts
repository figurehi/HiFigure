import assert from "node:assert/strict";
import test from "node:test";
import {
  createNewIdeaRoot,
  defaultWorkspaceState,
  reconcileIdeaHistory,
  restoreIdeaHistoryNode,
  saveIdeaCheckpoint,
} from "./workspace-state";
import type { DiagramSkeletonCandidate, FigureVariant, ReferenceItem } from "./types";

const t0 = "2026-08-05T00:00:00.000Z";
const t1 = "2026-08-05T00:01:00.000Z";
const t2 = "2026-08-05T00:02:00.000Z";
const t3 = "2026-08-05T00:03:00.000Z";

function createTestWorkspace() {
  return structuredClone(defaultWorkspaceState);
}

const skeleton: DiagramSkeletonCandidate = {
  id: "skeleton-a",
  title: "Skeleton A",
  referenceId: "layout-a",
  referenceTitle: "Layout A",
  createdAt: t1,
  source: "model",
  xml: "<mxGraphModel />",
  mermaid: null,
  diagramPlan: { title: "A", width: 800, height: 500, nodes: [], edges: [] },
};

function reference(id: string, title: string): ReferenceItem {
  return {
    id,
    title,
    sourcePaper: "Paper",
    venue: "Venue",
    year: 2026,
    imageType: "method",
    subject: "AI",
    styleTags: [],
    similarityReason: "Saved reference",
    thumbnail: "R",
    thumbnailUrl: null,
    imageDataUrl: null,
    structuralAnalysis: "",
  };
}

const candidate: FigureVariant = {
  id: "candidate-a",
  title: "Candidate A",
  description: "first",
  layoutStrategy: "guided",
  svg: "<svg />",
};

const edit: FigureVariant = {
  ...candidate,
  id: "edit-a",
  title: "Edit A",
  sourceVariantId: candidate.id,
};

test("Idea History reconciles Skeleton, Candidate, and Edit lineage", () => {
  const initial = createTestWorkspace();
  const state = reconcileIdeaHistory({
    ...initial,
    diagramSkeletonCandidates: [skeleton],
    selectedDiagramSkeletonId: skeleton.id,
    diagramSkeletonXml: skeleton.xml ?? null,
    diagramSkeletonPlan: skeleton.diagramPlan ?? null,
    variants: [edit, candidate],
    selectedVariantId: edit.id,
    candidateGenerationSnapshots: {
      [candidate.id]: {
        variantId: candidate.id,
        createdAt: t2,
        promptRevisionId: initial.currentPromptRevisionId,
        promptFingerprint: initial.promptRevisions[0]!.fingerprint,
        workingPrompt: initial.prompt,
        skeletonId: skeleton.id,
        skeletonXml: skeleton.xml ?? null,
        styleReferenceId: null,
        nodeIconBindings: {},
        matchAppearanceFingerprint: "font:none|palette:none",
        styleKitFingerprint: "",
      },
    },
    figureHistory: [
      {
        id: "history-edit",
        variantId: edit.id,
        title: edit.title,
        sourceStage: "refine",
        sourceType: "modify",
        sourceVariantId: candidate.id,
        createdAt: t3,
      },
      {
        id: "history-candidate",
        variantId: candidate.id,
        title: candidate.title,
        sourceStage: "compose",
        sourceType: "generate",
        sourceVariantId: null,
        createdAt: t2,
      },
    ],
  }, t3);

  const skeletonNode = state.ideaHistory.nodes.find((node) => node.skeletonId === skeleton.id);
  const candidateNode = state.ideaHistory.nodes.find((node) => node.variantId === candidate.id);
  const editNode = state.ideaHistory.nodes.find((node) => node.variantId === edit.id);
  assert.ok(skeletonNode);
  assert.equal(candidateNode?.parentId, skeletonNode.id);
  assert.equal(editNode?.parentId, candidateNode?.id);
  assert.equal(editNode?.kind, "edit");
});

test("restoring an idea restores inputs but keeps the shared reference library", () => {
  const savedReference = reference("layout-a", "Layout A");
  let state = reconcileIdeaHistory({
    ...createTestWorkspace(),
    references: [savedReference],
    board: [savedReference],
    referenceUsage: { [savedReference.id]: { layout: true } },
    layoutReferenceId: savedReference.id,
    prompt: "first prompt",
    generationBrief: "first prompt",
  }, t0);
  state = saveIdeaCheckpoint(state, { title: "First direction", studioSurface: "content", now: t1 });
  const savedNodeId = state.ideaHistory.activeNodeId!;
  state = {
    ...state,
    prompt: "later prompt",
    generationBrief: "later prompt",
    layoutReferenceId: null,
  };
  const restored = restoreIdeaHistoryNode(state, savedNodeId, t2);
  assert.equal(restored.prompt, "first prompt");
  assert.equal(restored.layoutReferenceId, savedReference.id);
  assert.deepEqual(restored.references.map((item) => item.id), [savedReference.id]);
  assert.deepEqual(restored.board.map((item) => item.id), [savedReference.id]);
  assert.equal(restored.reviewResult.length, 0);
});

test("New Figure creates a task-root path and retains retrieved references", () => {
  const initial = reconcileIdeaHistory(createTestWorkspace(), t0);
  const withReference = {
    ...initial,
    references: [reference("ref-a", "Reference")],
    prompt: "custom direction",
    generationBrief: "custom direction",
    selectedDiagramSkeletonId: skeleton.id,
    selectedVariantId: candidate.id,
  };
  const next = createNewIdeaRoot(withReference, t1);
  assert.equal(next.ideaHistory.nodes.filter((node) => node.kind === "root").length, 2);
  assert.equal(next.prompt, next.assignedTaskSnapshot.brief);
  assert.equal(next.selectedDiagramSkeletonId, null);
  assert.equal(next.selectedVariantId, null);
  assert.deepEqual(next.references.map((item) => item.id), ["ref-a"]);
  assert.equal(next.ideaHistory.homeOpen, false);
  assert.equal(next.activeStudioStep, "prompt");
});
