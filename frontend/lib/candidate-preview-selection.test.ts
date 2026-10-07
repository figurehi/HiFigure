import assert from "node:assert/strict";
import test from "node:test";
import { resolveCandidatePreviewVariantId } from "./candidate-preview-selection";

const variants = [
  { id: "candidate-latest", deletedAt: null },
  { id: "edit-chosen", deletedAt: null },
  { id: "candidate-first", deletedAt: null },
];

test("manual Candidate preview selection survives workspace selection updates", () => {
  assert.equal(resolveCandidatePreviewVariantId({
    variants,
    currentPreviewVariantId: "edit-chosen",
    workspaceSelectedVariantId: "candidate-latest",
    previousVariantIds: new Set(variants.map((variant) => variant.id)),
  }), "edit-chosen");
});

test("a newly generated Edit becomes the Candidate preview", () => {
  const withNewEdit = [{ id: "edit-new", deletedAt: null }, ...variants];
  assert.equal(resolveCandidatePreviewVariantId({
    variants: withNewEdit,
    currentPreviewVariantId: "candidate-first",
    workspaceSelectedVariantId: "edit-new",
    previousVariantIds: new Set(variants.map((variant) => variant.id)),
  }), "edit-new");
});

test("a deleted preview falls back to a valid workspace selection", () => {
  assert.equal(resolveCandidatePreviewVariantId({
    variants: variants.map((variant) =>
      variant.id === "edit-chosen" ? { ...variant, deletedAt: "2026-08-31T00:00:00.000Z" } : variant,
    ),
    currentPreviewVariantId: "edit-chosen",
    workspaceSelectedVariantId: "candidate-first",
    previousVariantIds: new Set(variants.map((variant) => variant.id)),
  }), "candidate-first");
});
