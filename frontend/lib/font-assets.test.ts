import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { figureFontReferences } from "./scientific-assets";

test("Style exposes six genuinely distinct bundled font families", () => {
  const primaryFamilies = figureFontReferences.slice(0, 6);
  assert.deepEqual(
    primaryFamilies.map((font) => font.label),
    [
      "IBM Plex Sans",
      "IBM Plex Sans Condensed",
      "Source Serif 4",
      "JetBrains Mono",
      "Atkinson Hyperlegible",
      "Inter",
    ],
  );
  assert.equal(
    new Set(primaryFamilies.map((font) => font.cssFamily.split(",")[0].trim())).size,
    primaryFamilies.length,
  );
});

test("the expanded English font library is bundled and registered locally", () => {
  const layoutSource = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.equal(figureFontReferences.length, 50);
  assert.equal(new Set(figureFontReferences.map((font) => font.id)).size, 50);
  assert.equal(new Set(figureFontReferences.map((font) => font.label)).size, 50);

  for (const font of figureFontReferences) {
    const variable = font.cssFamily.match(/^var\((--[^)]+)\)/)?.[1];
    assert.ok(variable, `${font.label} must use a local font CSS variable`);
    assert.match(layoutSource, new RegExp(`variable:\\s*["']${variable}["']`));
  }

  assert.deepEqual(
    figureFontReferences.slice(-20).map((font) => font.label),
    [
      "Noto Sans",
      "Noto Serif",
      "Open Sans",
      "Source Sans 3",
      "Roboto Slab",
      "PT Sans",
      "PT Serif",
      "Ubuntu",
      "Mulish",
      "Rubik",
      "Poppins",
      "Lexend",
      "Inconsolata",
      "Source Code Pro",
      "Alegreya",
      "Cabin",
      "Exo 2",
      "Titillium Web",
      "Spectral",
      "Cormorant Garamond",
    ],
  );
});
