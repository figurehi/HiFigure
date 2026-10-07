import assert from "node:assert/strict";
import test from "node:test";

import type { DiagramSkeletonCandidate } from "./types";
import { latestSkeletonForReference } from "./layout-skeleton-selection";

function skeleton(
  id: string,
  referenceId: string,
  createdAt: string,
): DiagramSkeletonCandidate {
  return {
    id,
    title: id,
    referenceId,
    referenceTitle: referenceId,
    createdAt,
  };
}

test("latestSkeletonForReference returns the newest Skeleton for the selected Layout", () => {
  const candidates = [
    skeleton("layout-a-new", "layout-a", "2026-08-24T12:00:00.000Z"),
    skeleton("layout-b-new", "layout-b", "2026-08-24T13:00:00.000Z"),
    skeleton("layout-a-old", "layout-a", "2026-08-24T11:00:00.000Z"),
  ];

  assert.equal(latestSkeletonForReference(candidates, "layout-a")?.id, "layout-a-new");
  assert.equal(latestSkeletonForReference(candidates, "layout-b")?.id, "layout-b-new");
});

test("latestSkeletonForReference returns null when a Layout has no Skeleton", () => {
  assert.equal(
    latestSkeletonForReference(
      [skeleton("layout-a", "layout-a", "2026-08-24T12:00:00.000Z")],
      "layout-without-skeleton",
    ),
    null,
  );
});
