import assert from "node:assert/strict";
import test from "node:test";

import { appendFigureHistoryEntries, sortRevisionVariantsByHistory } from "./figure-history";
import type { FigureVariant } from "./types";
import type { FigureHistoryEntry, WorkspaceState } from "./workspace-state";

function variant(id: string): FigureVariant {
  return {
    id,
    title: id,
    description: "",
    layoutStrategy: "",
    sourceVariantId: "candidate-a",
    svg: "",
  };
}

function historyEntry(variantId: string, createdAt: string, index: number): FigureHistoryEntry {
  return {
    id: `history-${index}-${variantId}`,
    variantId,
    title: variantId,
    sourceStage: "refine",
    sourceType: "modify",
    sourceVariantId: "candidate-a",
    createdAt,
  };
}

test("Edit revisions display by submission time while preserving batch order", () => {
  const revisions = [variant("new-a"), variant("new-b"), variant("old-a"), variant("old-b")];
  const history = [
    historyEntry("new-a", "2026-08-20T10:01:00.000Z", 0),
    historyEntry("new-b", "2026-08-20T10:01:00.000Z", 1),
    historyEntry("old-a", "2026-08-20T10:00:00.000Z", 2),
    historyEntry("old-b", "2026-08-20T10:00:00.000Z", 3),
  ];

  assert.deepEqual(
    sortRevisionVariantsByHistory(revisions, history).map((item) => item.id),
    ["old-a", "old-b", "new-a", "new-b"],
  );
});

test("background Edit History records the job submission time", () => {
  const createdAt = "2026-08-20T10:00:00.000Z";
  const state = { figureHistory: [] } as unknown as WorkspaceState;
  const entries = appendFigureHistoryEntries(state, [variant("revision-a")], {
    sourceStage: "refine",
    sourceType: "modify",
    sourceVariantId: "candidate-a",
    createdAt,
  });

  assert.equal(entries[0]?.createdAt, createdAt);
});
