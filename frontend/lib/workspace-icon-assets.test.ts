import assert from "node:assert/strict";
import test from "node:test";
import type { CustomIconReference } from "./types";
import type { WorkspaceState } from "./workspace-state";
import { createEmptyStyleKit, createSkeletonStyleApplication } from "./style-kit";
import {
  customIconKind,
  normalizeCustomIconReference,
  removeCustomIconFromWorkspaceState,
  resolveWorkspaceIcon,
  scoreWorkspaceIconMatch,
  searchCustomWorkspaceIcons,
  workspaceIconContentHash,
} from "./workspace-icon-assets";

const cropDataUrl = "data:image/png;base64,Y3JvcHBlZC1pY29u";
const customIcon: CustomIconReference = {
  id: "custom-icon-style-region-1",
  label: "Protein sample",
  tags: ["protein", "sample", "style crop"],
  description: "A user-cropped protein symbol.",
  cropDataUrl,
  sourceReferenceId: "reference-1",
  sourceRegionId: "style-region-1",
  kind: "icon",
  contentHash: workspaceIconContentHash(cropDataUrl),
};

test("explicit icon kind wins over legacy style-crop tags", () => {
  assert.equal(customIconKind(customIcon), "icon");
  assert.equal(customIconKind({ ...customIcon, id: "custom-screenshot-style-region-1", kind: undefined }), "style-crop");
});

test("normalizes old custom icons and resolves their original crop image", () => {
  const normalized = normalizeCustomIconReference({ ...customIcon, kind: undefined, contentHash: undefined });
  assert.equal(normalized.kind, "icon");
  assert.ok(normalized.contentHash);
  const resolved = resolveWorkspaceIcon(normalized.id, [normalized]);
  assert.equal(resolved?.dataUrl, cropDataUrl);
  assert.equal(resolved?.source, "custom-crop");
});

test("uses a non-empty fallback while an old custom crop is unavailable", () => {
  const resolved = resolveWorkspaceIcon(customIcon.id, [{ ...customIcon, cropDataUrl: "" }]);
  assert.ok(resolved?.dataUrl.startsWith("data:image/svg+xml"));
  assert.notEqual(resolved?.dataUrl, "");
});

test("searches workspace crops deterministically from label and tags", () => {
  const first = searchCustomWorkspaceIcons([customIcon], "protein");
  const second = searchCustomWorkspaceIcons([customIcon], "protein");
  assert.deepEqual(first.map((icon) => icon.id), [customIcon.id]);
  assert.deepEqual(second.map((icon) => icon.id), first.map((icon) => icon.id));
  assert.deepEqual(searchCustomWorkspaceIcons([customIcon], "camera"), []);
});

test("scores Style icons from Skeleton node content", () => {
  const asset = resolveWorkspaceIcon(customIcon.id, [customIcon]);
  assert.ok(asset);
  assert.ok(scoreWorkspaceIconMatch(asset, {
    label: "Protein sample",
    role: "experimental input",
    group: "biology",
  }) > scoreWorkspaceIconMatch(asset, {
    label: "Camera",
    role: "vision sensor",
    group: "hardware",
  }));
});

test("removing a custom icon clears skeleton, recent, reference, and canvas dependencies", () => {
  const styleKit = {
    ...createEmptyStyleKit("2026-08-03T00:00:00.000Z"),
    iconIds: [customIcon.id, "robot"],
    patternIds: [customIcon.id],
  };
  const application = createSkeletonStyleApplication(
    "skeleton-1",
    styleKit,
    { "module-1": customIcon.id, "module-2": "robot" },
    "2026-08-03T00:00:00.000Z",
  );
  const canvas = {
    drawerCollapsed: false,
    selectedItemId: "custom-asset",
    selectedItemIds: ["custom-asset"],
    items: [
      {
        id: "custom-asset",
        type: "asset" as const,
        assetKind: "icon" as const,
        assetId: customIcon.id,
        x: 10,
        y: 10,
        w: 100,
        h: 100,
        z: 20,
      },
    ],
  };
  const state = {
    customIconReferences: [customIcon],
    activeStyleKit: styleKit,
    skeletonStyleApplications: { "skeleton-1": application },
    nodeIconBindings: { "module-1": customIcon.id },
    recentIconIds: [customIcon.id, "robot"],
    iconReferenceIds: [customIcon.id, "robot"],
    iconReferenceId: customIcon.id,
    referenceRegions: [{
      id: customIcon.sourceRegionId,
      referenceId: customIcon.sourceReferenceId,
      x: 0,
      y: 0,
      w: 0.2,
      h: 0.2,
      label: customIcon.label,
      customIconId: customIcon.id,
      selectedIconSource: "detected" as const,
    }],
    activeCreativeCanvasId: "canvas-1",
    creativeCanvas: canvas,
    creativeCanvasUndoStack: [],
    creativeCanvases: [{
      id: "canvas-1",
      title: "Canvas 1",
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z",
      canvas,
      undoStack: [],
    }],
  } as unknown as WorkspaceState;
  const next = removeCustomIconFromWorkspaceState(state, customIcon.id);
  assert.deepEqual(next.nodeIconBindings, {});
  assert.deepEqual(next.activeStyleKit.iconIds, ["robot"]);
  assert.deepEqual(next.activeStyleKit.patternIds, []);
  assert.equal(next.activeStyleKit.confirmedAt, null);
  assert.deepEqual(next.skeletonStyleApplications["skeleton-1"].styleKitSnapshot.iconIds, ["robot"]);
  assert.deepEqual(next.skeletonStyleApplications["skeleton-1"].styleKitSnapshot.patternIds, []);
  assert.deepEqual(next.skeletonStyleApplications["skeleton-1"].nodeIconBindings, { "module-2": "robot" });
  assert.deepEqual(next.recentIconIds, ["robot"]);
  assert.deepEqual(next.iconReferenceIds, ["robot"]);
  assert.equal(next.iconReferenceId, "robot");
  assert.equal(next.customIconReferences.length, 0);
  assert.equal(next.referenceRegions[0]?.customIconId, undefined);
  assert.equal(next.creativeCanvas.items.some((item) => item.assetId === customIcon.id), false);
});
