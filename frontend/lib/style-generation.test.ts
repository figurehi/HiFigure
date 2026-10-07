import assert from "node:assert/strict";
import test from "node:test";
import { figureFontReferences, figurePaletteReferences } from "./scientific-assets";
import {
  buildStyleAppearanceGenerationLines,
  createMatchedStyleAppearanceFingerprint,
} from "./style-generation";

test("unmatched font and color remain an explicit no-op", () => {
  assert.equal(createMatchedStyleAppearanceFingerprint({
    fontId: null,
    paletteId: null,
    extractedPalette: null,
  }), "font:none|palette:none");
  assert.deepEqual(buildStyleAppearanceGenerationLines({
    font: null,
    palette: null,
    extractedPalette: null,
  }), []);
});

test("Match fingerprints distinguish the confirmed font and extracted colors", () => {
  const fingerprint = createMatchedStyleAppearanceFingerprint({
    fontId: figureFontReferences[0].id,
    paletteId: null,
    extractedPalette: {
      kind: "region",
      id: "whole-image-role-v2-style-a",
      colors: ["#fff6be", "#d3f9e5", "#08b1dc", "#20ae65"],
    },
  });
  assert.match(fingerprint, new RegExp(figureFontReferences[0].id));
  assert.match(fingerprint, /#08b1dc/);
});

test("style appearance choices become secondary generation preferences", () => {
  const lines = buildStyleAppearanceGenerationLines({
    font: figureFontReferences[0],
    palette: figurePaletteReferences[0],
    extractedPalette: null,
  });
  assert.equal(lines.length, 2);
  assert.match(lines[0], /IBM Plex Sans/);
  assert.match(lines[1], /#0072B2/);
  assert.match(lines[0], /text glyphs/);
  assert.match(lines[0], /primary Style reference remains authoritative/);
  assert.match(lines[1], /mainly as accents/);
  assert.match(lines[1], /do not repaint the whole figure/);
  assert.doesNotMatch(lines.join("\n"), /across the whole figure|Typography constraint|Color constraint/);
});

test("an extracted palette takes priority over a preset palette", () => {
  const lines = buildStyleAppearanceGenerationLines({
    font: null,
    palette: figurePaletteReferences[0],
    extractedPalette: {
      kind: "region",
      id: "whole-image-curated-style-a",
      colors: ["#203040", "#4f78a5", "#d08b52", "#65a486"],
    },
  });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /#203040, #4f78a5, #d08b52, #65a486/);
  assert.doesNotMatch(lines[0], /#0072B2/);
});
