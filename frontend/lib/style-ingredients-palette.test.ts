import assert from "node:assert/strict";
import test from "node:test";
import { curateFigurePaletteCandidates } from "./style-ingredients";

test("palette curation keeps broad colored fills and recurring accents over gray headers and tiny warm details", () => {
  const colors = curateFigurePaletteCandidates([
    { rgb: [247, 247, 247], count: 1400 }, // page background
    { rgb: [112, 118, 116], count: 900 }, // gray headers
    { rgb: [255, 246, 190], count: 820 }, // pale yellow panel
    { rgb: [211, 249, 229], count: 670 }, // mint panel
    { rgb: [210, 241, 249], count: 590 }, // pale cyan panel
    { rgb: [8, 177, 220], count: 145 }, // cyan arrows
    { rgb: [32, 174, 101], count: 110 }, // green status accents
    { rgb: [231, 166, 132], count: 22 }, // small portrait / skin detail
    { rgb: [28, 31, 31], count: 760 }, // text and outlines
  ], ["#111111", "#444444", "#888888", "#bbbbbb"], 4);

  assert.deepEqual(colors, ["#fff6be", "#d3f9e5", "#08b1dc", "#20ae65"]);
  assert.equal(colors.includes("#707674"), false);
  assert.equal(colors.includes("#e7a684"), false);
});

test("palette curation still returns useful neutrals for a genuinely monochrome figure", () => {
  const colors = curateFigurePaletteCandidates([
    { rgb: [250, 250, 250], count: 1200 },
    { rgb: [210, 214, 220], count: 800 },
    { rgb: [130, 138, 148], count: 600 },
    { rgb: [55, 64, 75], count: 500 },
  ], ["#111111", "#555555", "#999999", "#dddddd"], 4);

  assert.deepEqual(colors, ["#d2d6dc", "#828a94", "#37404b"]);
});
