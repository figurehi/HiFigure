import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyStyleKit,
  createLegacyStyleKit,
  createSkeletonStyleApplication,
  createSkeletonStyleReferenceSet,
  createStyleKitFingerprint,
  nodeIconBindingsForSkeleton,
  normalizeSkeletonStyleApplications,
  normalizeStyleKit,
  pruneNodeIconBindingsForPlan,
} from "./style-kit";

const now = "2026-08-04T00:00:00.000Z";

test("StyleKit fingerprints are stable for set-like selections", () => {
  const first = createLegacyStyleKit({
    sourceReferenceId: "style-a",
    sourceReferenceIds: ["style-b", "style-a"],
    iconIds: ["robot", "database"],
    patternIds: ["loop", "groups"],
    regionIds: ["region-b", "region-a"],
    updatedAt: now,
  });
  const second = createLegacyStyleKit({
    sourceReferenceId: "style-a",
    sourceReferenceIds: ["style-a", "style-b"],
    iconIds: ["database", "robot"],
    patternIds: ["groups", "loop"],
    regionIds: ["region-a", "region-b"],
    updatedAt: "2027-01-01T00:00:00.000Z",
    confirmedAt: "2027-01-01T00:01:00.000Z",
  });
  assert.equal(first.fingerprint, second.fingerprint);
  assert.notEqual(
    first.fingerprint,
    createStyleKitFingerprint({ ...first, iconIds: ["robot"] }),
  );
});

test("StyleKit fingerprints preserve palette color order", () => {
  const kit = createLegacyStyleKit({
    palette: { kind: "preset", id: "paper", colors: ["#111111", "#eeeeee"] },
  });
  const reversed = createLegacyStyleKit({
    palette: { kind: "preset", id: "paper", colors: ["#eeeeee", "#111111"] },
  });
  assert.notEqual(kit.fingerprint, reversed.fingerprint);
});

test("StyleKit fingerprints treat font and palette collections as stable sets", () => {
  const first = createLegacyStyleKit({
    fontIds: ["paper", "code"],
    palettes: [
      { kind: "preset", id: "categorical", colors: ["#111111", "#eeeeee"] },
      { kind: "preset", id: "diverging", colors: ["#cc0000", "#0000cc"] },
    ],
  });
  const reordered = createLegacyStyleKit({
    fontIds: ["code", "paper"],
    palettes: [
      { kind: "preset", id: "diverging", colors: ["#cc0000", "#0000cc"] },
      { kind: "preset", id: "categorical", colors: ["#111111", "#eeeeee"] },
    ],
  });
  assert.equal(first.fingerprint, reordered.fingerprint);
  assert.deepEqual(first.fontIds, ["paper", "code"]);
  assert.equal(first.fontId, "paper");
  assert.equal(first.palette?.id, "categorical");
});

test("StyleKit revision invalidates an applied crop without changing its stable region id", () => {
  const first = createLegacyStyleKit({ regionIds: ["crop-a"], revision: 0 });
  const adjusted = createLegacyStyleKit({ regionIds: ["crop-a"], revision: 1 });
  assert.notEqual(first.fingerprint, adjusted.fingerprint);
  assert.equal(normalizeStyleKit({ ...first, revision: undefined }).revision, 0);
});

test("normalization migrates legacy selections and removes missing assets", () => {
  const fallback = createLegacyStyleKit({
    sourceReferenceId: "style-a",
    sourceReferenceIds: ["style-a"],
    palette: { kind: "preset", id: "safe", colors: ["#123456"] },
    fontId: "paper",
    iconIds: ["robot"],
    updatedAt: now,
  });
  const normalized = normalizeStyleKit({
    ...fallback,
    sourceReferenceIds: ["style-a", "removed-reference", "style-a"],
    iconIds: ["robot", "removed-icon", "robot"],
    regionIds: ["region-a", "removed-region"],
    fingerprint: "stale-fingerprint",
  }, {
    fallback,
    now,
    validReferenceIds: ["style-a"],
    validRegionIds: ["region-a"],
    validIconIds: ["robot"],
    validFontIds: ["paper"],
    validPaletteIds: ["safe"],
  });
  assert.deepEqual(normalized.sourceReferenceIds, ["style-a"]);
  assert.deepEqual(normalized.iconIds, ["robot"]);
  assert.deepEqual(normalized.regionIds, ["region-a"]);
  assert.deepEqual(normalized.fontIds, ["paper"]);
  assert.deepEqual(normalized.palettes.map((palette) => palette.id), ["safe"]);
  assert.equal(normalized.fontId, normalized.fontIds[0]);
  assert.equal(normalized.palette, normalized.palettes[0]);
  assert.notEqual(normalized.fingerprint, "stale-fingerprint");
});

test("normalization keeps provenance for selected font and extracted palette collections", () => {
  const normalized = normalizeStyleKit({
    sourceReferenceId: "style-a",
    sourceReferenceIds: ["style-a"],
    fontIds: ["paper", "removed-font"],
    fontSources: {
      paper: { sourceReferenceId: "style-a", sourceRegionId: "region-a" },
      "removed-font": { sourceReferenceId: "style-a" },
    },
    palettes: [
      {
        kind: "region",
        id: "region-palette-a",
        colors: ["#123456", "#abcdef"],
        sourceReferenceId: "style-a",
        sourceRegionId: "region-a",
      },
      {
        kind: "region",
        id: "removed-region-palette",
        colors: ["#000000"],
        sourceReferenceId: "style-a",
        sourceRegionId: "removed-region",
      },
    ],
  }, {
    validReferenceIds: ["style-a"],
    validRegionIds: ["region-a"],
    validFontIds: ["paper"],
  });

  assert.deepEqual(normalized.fontIds, ["paper"]);
  assert.deepEqual(normalized.fontSources, {
    paper: { sourceReferenceId: "style-a", sourceRegionId: "region-a" },
  });
  assert.deepEqual(normalized.palettes.map((palette) => palette.id), ["region-palette-a"]);
});

test("whole-image extracted palettes survive persistence without a crop region", () => {
  const normalized = normalizeStyleKit({
    sourceReferenceId: "style-a",
    sourceReferenceIds: ["style-a"],
    palettes: [{
      kind: "region",
      id: "whole-image-style-a",
      colors: ["#123456", "#abcdef"],
      sourceReferenceId: "style-a",
    }],
  }, {
    validReferenceIds: ["style-a"],
    validRegionIds: [],
  });

  assert.deepEqual(normalized.palettes.map((palette) => palette.id), ["whole-image-style-a"]);
  assert.equal(normalized.palette?.sourceReferenceId, "style-a");
});

test("per-skeleton applications isolate bindings and retain the legacy fallback", () => {
  const styleKit = createLegacyStyleKit({ iconIds: ["robot"], updatedAt: now });
  const application = createSkeletonStyleApplication(
    "skeleton-a",
    styleKit,
    { "node-a": "robot" },
    now,
  );
  const normalized = normalizeSkeletonStyleApplications({
    wrongRecordKey: {
      ...application,
      styleKitFingerprint: "stale",
      nodeIconBindings: { "node-a": "robot", "node-b": "removed-icon" },
    },
    removed: {
      ...application,
      skeletonId: "removed-skeleton",
    },
  }, {
    validSkeletonIds: ["skeleton-a"],
    validIconIds: ["robot"],
    now,
  });
  assert.deepEqual(Object.keys(normalized), ["skeleton-a"]);
  assert.equal(normalized["skeleton-a"].styleKitFingerprint, styleKit.fingerprint);
  assert.deepEqual(normalized["skeleton-a"].nodeIconBindings, { "node-a": "robot" });
  assert.deepEqual(
    nodeIconBindingsForSkeleton("skeleton-a", normalized, { legacy: "database" }),
    { "node-a": "robot" },
  );
  assert.deepEqual(
    nodeIconBindingsForSkeleton("skeleton-b", normalized, { legacy: "database" }),
    { legacy: "database" },
  );
});

test("Skeleton prompt edits discard icon bindings for nodes that no longer exist", () => {
  const bindings = pruneNodeIconBindingsForPlan({
    "node-kept": "robot",
    "semantic-kept": "database",
    "node-removed": "trash",
  }, {
    nodes: [
      {
        id: "node-kept",
        semanticId: "semantic-kept",
        label: "Kept",
        x: 0,
        y: 0,
        w: 120,
        h: 60,
      },
    ],
  });

  assert.deepEqual(bindings, {
    "node-kept": "robot",
    "semantic-kept": "database",
  });
});

test("Container modules cannot hold icon bindings", () => {
  const bindings = pruneNodeIconBindingsForPlan({
    "node-leaf": "robot",
    "node-stage": "database",
    "semantic-stage": "trash",
  }, {
    nodes: [
      { id: "node-leaf", label: "Leaf", role: "process", x: 0, y: 0, w: 120, h: 60 },
      {
        id: "node-stage",
        semanticId: "semantic-stage",
        label: "Stage",
        role: "group",
        x: 0,
        y: 0,
        w: 480,
        h: 200,
      },
    ],
  });

  assert.deepEqual(bindings, { "node-leaf": "robot" });
});

test("Skeleton style references exclude palette and typography edits", () => {
  const styleKit = createLegacyStyleKit({
    sourceReferenceId: "style-a",
    sourceReferenceIds: ["style-a"],
    palette: { kind: "preset", id: "paper", colors: ["#123456"] },
    fontId: "paper",
    iconIds: ["robot"],
    updatedAt: now,
  });
  const referenceSet = createSkeletonStyleReferenceSet(styleKit);
  const application = createSkeletonStyleApplication("skeleton-a", styleKit, {}, now);

  assert.equal(referenceSet.palette, null);
  assert.deepEqual(referenceSet.palettes, []);
  assert.equal(referenceSet.fontId, null);
  assert.deepEqual(referenceSet.fontIds, []);
  assert.deepEqual(referenceSet.fontSources, {});
  assert.equal(application.styleKitSnapshot.palette, null);
  assert.deepEqual(application.styleKitSnapshot.palettes, []);
  assert.equal(application.styleKitSnapshot.fontId, null);
  assert.deepEqual(application.styleKitSnapshot.fontIds, []);
  assert.equal(application.styleKitFingerprint, referenceSet.fingerprint);
});

test("empty StyleKit is deterministic apart from its timestamp", () => {
  const first = createEmptyStyleKit(now);
  const second = createEmptyStyleKit("2030-01-01T00:00:00.000Z");
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.confirmedAt, null);
});
