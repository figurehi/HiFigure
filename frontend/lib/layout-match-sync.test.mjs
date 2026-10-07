import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardPath = new URL("../components/project-dashboard.tsx", import.meta.url);
const layoutPath = new URL("../components/layout-studio.tsx", import.meta.url);

test("Match follows the Skeleton selected or generated in Layout", async () => {
  const source = await readFile(dashboardPath, "utf8");

  assert.match(
    source,
    /const workflowSkeleton = selectedSkeleton \?\? selectedCanvasSkeleton \?\? diagramSkeletonCandidates\.at\(-1\) \?\? null;/,
  );
  assert.match(source, /function focusNodeIconMapping\(\) \{\s*const candidate = workflowSkeleton;/);
  assert.match(source, /const firstGenerationSkeleton = workflowSkeleton;/);
  assert.match(source, /plan=\{studioSkeletonPlan\}/);
  assert.match(source, /diagramPlan=\{studioSkeletonPlan\}/);
});

test("Layout prompt generation commits the new Skeleton as the shared selection", async () => {
  const source = await readFile(layoutPath, "utf8");

  assert.match(source, /diagramSkeletonCandidates: \[\.\.\.current\.diagramSkeletonCandidates, candidate\]/);
  assert.match(source, /selectedDiagramSkeletonId: candidateId/);
  assert.match(source, /fillSkeletonTemplateSlot\(activeCanvas, candidateId, skeletonReference\.id\)/);
});
