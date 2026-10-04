import assert from "node:assert/strict";
import test from "node:test";

import {
  compactAnnotationSnapshot,
  createEmptyRefineSession,
  deriveMaskTargets,
  figureRelativeMaskRects,
  maskTargetsToModifyRegions,
  normalizeRefineEditTarget,
  normalizeRefineSession,
} from "./evolve-artifact";

test("compact snapshots keep the figure shape and only drop its pixels", () => {
  const compact = compactAnnotationSnapshot({
    document: {
      store: {
        "page:page": { id: "page:page", typeName: "page" },
        "asset:fig": {
          id: "asset:fig",
          typeName: "asset",
          type: "image",
          props: { src: "data:image/png;base64,AAAA", w: 800, h: 400 },
        },
        "shape:figure-bg": {
          id: "shape:figure-bg",
          typeName: "shape",
          type: "image",
          x: 12,
          y: 48,
          parentId: "page:page",
          meta: { hichartFigureBackground: true },
          props: { assetId: "asset:fig", w: 800, h: 400 },
        },
        "shape:mask-1": {
          id: "shape:mask-1",
          typeName: "shape",
          type: "geo",
          x: 40,
          y: 80,
          parentId: "page:page",
          props: { geo: "rectangle", color: "violet", fill: "semi", w: 60, h: 30 },
        },
      },
    },
  }) as {
    document: { store: Record<string, { props?: { src?: unknown }; x?: number; y?: number }> };
  };

  assert.equal(compact.document.store["shape:figure-bg"]?.x, 12);
  assert.equal(compact.document.store["shape:figure-bg"]?.y, 48);
  assert.equal(compact.document.store["asset:fig"]?.props?.src, null);
  assert.equal(compact.document.store["shape:mask-1"]?.x, 40);
  assert.equal(compact.document.store["shape:mask-1"]?.y, 80);
});

test("mask boxes convert to normalized modify regions on the source figure", () => {
  const regions = maskTargetsToModifyRegions(
    [{
      id: "shape:mask-1",
      kind: "mask",
      name: "Reasoner Pool",
      description: "Split into two experts",
      status: "draft",
      fontId: null,
      paletteId: null,
      scope: "target",
      bounds: { x: 100, y: 50, w: 200, h: 100 },
    }],
    { x: 0, y: 0, w: 1000, h: 500 },
    "variant-1",
  );

  assert.equal(regions.length, 1);
  assert.equal(regions[0].referenceId, "variant-1");
  assert.equal(regions[0].intent, "modify");
  assert.equal(regions[0].label, "Reasoner Pool: Split into two experts");
  assert.equal(regions[0].x, 0.1);
  assert.equal(regions[0].y, 0.1);
  assert.equal(regions[0].w, 200 / 1000);
  assert.equal(regions[0].h, 100 / 500);
});

test("mask rects clip to the figure and shift to figure origin", () => {
  assert.deepEqual(
    figureRelativeMaskRects(
      { x: 10, y: 20, w: 200, h: 100 },
      [
        { x: 0, y: 0, w: 30, h: 30 },
        { x: 50, y: 40, w: 40, h: 20 },
        { x: 250, y: 40, w: 20, h: 20 },
      ],
    ),
    [
      { x: 0, y: 0, w: 20, h: 10 },
      { x: 40, y: 20, w: 40, h: 20 },
    ],
  );
});

test("masks without figure bounds do not invent a modify region", () => {
  assert.deepEqual(
    maskTargetsToModifyRegions(
      [{
        id: "shape:mask-1",
        kind: "mask",
        name: "Legend",
        description: "",
        status: "draft",
        fontId: null,
        paletteId: null,
        scope: "target",
        bounds: { x: 10, y: 10, w: 40, h: 20 },
      }],
      null,
      "variant-1",
    ),
    [],
  );
});

test("legacy mask targets migrate to explicit no-change appearance choices", () => {
  const target = normalizeRefineEditTarget({
    id: "shape:mask-1",
    kind: "mask",
    name: "Legend",
    description: "Simplify the legend",
    status: "draft",
    bounds: { x: 12, y: 18, w: 140, h: 60 },
  });

  assert.deepEqual(target, {
    id: "shape:mask-1",
    kind: "mask",
    name: "Legend",
    description: "Simplify the legend",
    status: "draft",
    fontId: null,
    paletteId: null,
    scope: "target",
    bounds: { x: 12, y: 18, w: 140, h: 60 },
  });
});

test("mask derivation preserves at most one font and palette selection per stable target", () => {
  const snapshot = {
    document: {
      store: {
        "shape:mask-1": {
          id: "shape:mask-1",
          typeName: "shape",
          type: "geo",
          x: 20,
          y: 30,
          props: {
            geo: "rectangle",
            color: "violet",
            fill: "semi",
            w: 180,
            h: 90,
          },
        },
      },
    },
  };
  const targets = deriveMaskTargets(snapshot, [{
    id: "shape:mask-1",
    kind: "mask",
    name: "Method block",
    description: "Use the selected typography and colors",
    status: "draft",
    fontId: "paper",
    paletteId: "region-palette-2",
    scope: "target",
    bounds: { x: 0, y: 0, w: 1, h: 1 },
  }]);

  assert.equal(targets.length, 1);
  assert.equal(targets[0].fontId, "paper");
  assert.equal(targets[0].paletteId, "region-palette-2");
  assert.equal(targets[0].scope, "target");
  assert.deepEqual(targets[0].bounds, { x: 20, y: 30, w: 180, h: 90 });
});

test("native tldraw masks are numbered in reading order", () => {
  const mask = (id: string, x: number, y: number) => ({
    id,
    typeName: "shape",
    type: "geo",
    x,
    y,
    props: { geo: "rectangle", color: "violet", fill: "semi", w: 60, h: 40 },
  });
  const snapshot = {
    document: {
      store: {
        "shape:mask-bottom": mask("shape:mask-bottom", 10, 400),
        "shape:mask-top-right": mask("shape:mask-top-right", 300, 20),
        "shape:mask-top-left": mask("shape:mask-top-left", 12, 24),
      },
    },
  };

  assert.deepEqual(
    deriveMaskTargets(snapshot).map((target) => target.id),
    ["shape:mask-top-left", "shape:mask-top-right", "shape:mask-bottom"],
  );
});

test("legacy refine sessions gain an independent global no-change selection", () => {
  const legacy = {
    ...createEmptyRefineSession("variant-1", "artifact-v1-test"),
    globalAppearance: undefined,
    editTargets: [{
      id: "mask-a",
      kind: "mask",
      name: "A",
      description: "",
      status: "draft",
      bounds: { x: 0, y: 0, w: 100, h: 80 },
    }],
  };

  const normalized = normalizeRefineSession(legacy, "variant-1");
  assert.ok(normalized);
  assert.deepEqual(normalized.globalAppearance, {
    fontId: null,
    paletteId: null,
    scope: "global",
  });
  assert.equal(normalized.editTargets[0].scope, "target");
});
