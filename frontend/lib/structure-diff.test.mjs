import assert from "node:assert/strict";
import test from "node:test";

import { diffDiagramPlans } from "./structure-diff.ts";

function node(id, label, x, y) {
  return { id, label, x, y, w: 100, h: 60 };
}

test("summarizes node and connector changes without claiming an image diff", () => {
  const previous = {
    title: "Before",
    width: 600,
    height: 300,
    nodes: [node("a", "Input", 0, 0), node("b", "Model", 180, 0)],
    edges: [{ id: "edge-1", from: "a", to: "b", kind: "flow" }],
  };
  const current = {
    ...previous,
    title: "After",
    nodes: [node("a", "Query", 0, 0), node("b", "Model", 220, 20), node("c", "Answer", 420, 0)],
    edges: [{ id: "edge-1", from: "a", to: "c", kind: "data" }],
  };

  const diff = diffDiagramPlans(previous, current);
  assert.deepEqual(diff.added, ["Answer"]);
  assert.deepEqual(diff.renamed, ["Input → Query"]);
  assert.deepEqual(diff.moved, ["Model"]);
  assert.deepEqual(diff.connectionsChanged, ["Query → Answer"]);
});
