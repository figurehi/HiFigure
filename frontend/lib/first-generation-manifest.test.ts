import assert from "node:assert/strict";
import test from "node:test";
import {
  createDiagramPlanInputSignature,
  createFirstGenerationManifest,
  firstGenerationSkeletonChanged,
  resolveFirstGenerationReadiness,
} from "./first-generation-manifest";
import type { DiagramPlan } from "./types";

const plan: DiagramPlan = {
  title: "Conflict-driven RAG skeleton",
  width: 800,
  height: 400,
  nodes: [
    { id: "drawio-query", label: "User query", role: "input", groupId: null, x: 20, y: 40, w: 160, h: 70 },
    { id: "drawio-router", label: "Conflict router", role: "decision", groupId: null, x: 280, y: 40, w: 180, h: 70 },
  ],
  edges: [{ id: "edge-1", from: "drawio-query", to: "drawio-router", label: "routes", kind: "flow" }],
};

test("first-generation manifest maps Draw.io nodes deterministically", () => {
  const manifest = createFirstGenerationManifest({
    workingPrompt: "  Draw the assigned RAG framework.  ",
    promptRevisionId: "revision-2",
    skeletonId: "skeleton-1",
    skeletonXml: "<mxfile />",
    styleReferenceId: "style-1",
    plan,
    nodeIconBindings: {
      "drawio-router": "tabler:route",
      "drawio-query": "tabler:search",
      missing: "tabler:x",
    },
    styleKitFingerprint: "style-kit-1",
  });

  assert.equal(manifest.workingPrompt, "Draw the assigned RAG framework.");
  assert.deepEqual(
    manifest.nodeIconBindings.map(({ sourceNodeId, targetNodeId, iconId }) => ({ sourceNodeId, targetNodeId, iconId })),
    [
      { sourceNodeId: "drawio-query", targetNodeId: "drawio-query", iconId: "tabler:search" },
      { sourceNodeId: "drawio-router", targetNodeId: "drawio-router", iconId: "tabler:route" },
    ],
  );
  assert.deepEqual(manifest.boundIconIds, ["tabler:search", "tabler:route"]);
});

test("first-generation manifest freezes icon and optional appearance Match inputs", () => {
  const manifest = createFirstGenerationManifest({
    workingPrompt: "Figure prompt",
    skeletonId: "skeleton-1",
    styleReferenceId: "style-1",
    plan,
    nodeIconBindings: { "drawio-query": "tabler:search" },
    matchAppearanceFingerprint: "font:ibm-plex-sans|palette:preset:categorical",
    styleKitFingerprint: "style-kit-2",
  });

  assert.deepEqual(manifest.boundIconIds, ["tabler:search"]);
  assert.equal(manifest.matchAppearanceFingerprint, "font:ibm-plex-sans|palette:preset:categorical");
  assert.ok(!("editFontIds" in manifest));
  assert.ok(!("editPalettes" in manifest));
});

test("container modules never reach generation, matching what the preview draws", () => {
  const manifest = createFirstGenerationManifest({
    workingPrompt: "Figure prompt",
    skeletonId: "skeleton-1",
    styleReferenceId: "style-1",
    plan: {
      ...plan,
      nodes: [
        ...plan.nodes,
        { id: "drawio-stage", label: "Retrieval stage", role: "group", groupId: null, x: 0, y: 0, w: 520, h: 220 },
      ],
    },
    nodeIconBindings: { "drawio-query": "tabler:search", "drawio-stage": "tabler:box" },
    styleKitFingerprint: "style-kit-3",
  });

  assert.deepEqual(manifest.nodeIconBindings.map(({ targetNodeId }) => targetNodeId), ["drawio-query"]);
  assert.deepEqual(manifest.boundIconIds, ["tabler:search"]);
});

test("first-generation readiness requires Prompt, Skeleton, and Style but not Icons", () => {
  assert.deepEqual(resolveFirstGenerationReadiness({
    workingPrompt: "   ",
    skeletonId: "skeleton-1",
    styleReferenceId: null,
  }), {
    promptReady: false,
    skeletonReady: true,
    styleReady: false,
    canGenerate: false,
    missing: ["prompt", "style"],
  });

  assert.equal(resolveFirstGenerationReadiness({
    workingPrompt: "Create a scientific figure",
    skeletonId: "skeleton-1",
    styleReferenceId: "style-1",
  }).canGenerate, true);
});

test("reopening Layout does not mark an unchanged Skeleton as changed", () => {
  const reorderedPlan: DiagramPlan = {
    ...plan,
    nodes: [...plan.nodes].reverse(),
    edges: [...plan.edges].reverse(),
  };

  assert.equal(createDiagramPlanInputSignature(reorderedPlan), createDiagramPlanInputSignature(plan));
  assert.equal(firstGenerationSkeletonChanged({
    snapshotId: "skeleton-1",
    snapshotSource: '<mxfile host="app.diagrams.net"><diagram>old serialization</diagram></mxfile>',
    snapshotPlan: plan,
    currentId: "skeleton-1",
    currentSource: '<mxfile host="embed.diagrams.net" modified="later"><diagram>rewritten serialization</diagram></mxfile>',
    currentPlan: reorderedPlan,
  }), false);
});

test("Candidate highlights only an actual Skeleton structure change", () => {
  const movedPlan: DiagramPlan = {
    ...plan,
    nodes: plan.nodes.map((node) => node.id === "drawio-router" ? { ...node, x: node.x + 24 } : node),
  };

  assert.equal(firstGenerationSkeletonChanged({
    snapshotId: "skeleton-1",
    snapshotSource: "same",
    snapshotPlan: plan,
    currentId: "skeleton-1",
    currentSource: "same",
    currentPlan: movedPlan,
  }), true);
  assert.equal(firstGenerationSkeletonChanged({
    snapshotId: "skeleton-1",
    snapshotSource: "same",
    snapshotPlan: plan,
    currentId: "skeleton-2",
    currentSource: "same",
    currentPlan: plan,
  }), true);
});
