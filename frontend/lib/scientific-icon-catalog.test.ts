import assert from "node:assert/strict";
import test from "node:test";

import {
  SCIENTIFIC_ICON_CATALOG_VERSION,
  findScientificIconReference,
  legacyScientificIconReferenceIds,
  scientificIconReferences,
  scientificIconSourceManifest,
  scientificIconSvg,
} from "./scientific-assets";
import {
  normalizeRecentIconIds,
  recommendScientificIcons,
  searchScientificIcons,
} from "./icon-recommendations";

const unsafeSvg = /<\s*(?:script|foreignObject|iframe|object|embed|image|use|style|font)\b|\bon[a-z]+\s*=|\b(?:href|xlink:href)\s*=|\burl\s*\(|<!DOCTYPE|<\?xml/i;

test("ships one frozen 867-icon catalog while preserving every legacy ID", () => {
  assert.equal(SCIENTIFIC_ICON_CATALOG_VERSION, "2026.08.06-v3");
  assert.equal(scientificIconReferences.length, 867);
  assert.equal(new Set(scientificIconReferences.map((icon) => icon.id)).size, 867);
  assert.equal(legacyScientificIconReferenceIds.length, 103);
  for (const id of legacyScientificIconReferenceIds) {
    assert.ok(findScientificIconReference(id), `missing legacy icon ${id}`);
  }
});

test("shows distinct glyph-only source icons on the first browse page", () => {
  const firstPage = searchScientificIcons({ limit: 80 }).items;
  assert.equal(firstPage.length, 80);
  assert.ok(firstPage.every((icon) => icon.source !== "hichart"));
  assert.equal(new Set(firstPage.map((icon) => icon.svg)).size, firstPage.length);
  assert.ok(firstPage.every((icon) => !/<text\b|<rect[^>]+width="128"[^>]+height="112"/i.test(icon.svg)));
});

test("manifest and per-icon source metadata are complete and license-safe", () => {
  assert.deepEqual(
    Object.values(scientificIconSourceManifest).map(({ count }) => count),
    [239, 191, 93, 128, 113],
  );
  assert.equal(scientificIconSourceManifest.healthicons.license, "CC0-1.0");
  assert.equal(scientificIconSourceManifest.healthicons.packageLicense, "MIT");

  const allowedLicenses = new Set(["Project-authored", "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "CC0-1.0"]);
  for (const icon of scientificIconReferences) {
    assert.ok(icon.source);
    assert.ok(icon.sourceId);
    assert.ok(icon.sourceVersion);
    assert.ok(icon.sourceUrl);
    assert.ok(allowedLicenses.has(icon.license), `${icon.id} has unexpected license ${icon.license}`);
    assert.ok(icon.licenseUrl);
    assert.ok(icon.author);
    assert.ok(icon.attribution);
    assert.ok(icon.category);
    assert.ok(icon.keywords.length > 0);
    assert.ok(icon.svg.startsWith("<svg"), `${icon.id} is missing local SVG data`);
    assert.equal(unsafeSvg.test(icon.svg), false, `${icon.id} contains unsafe SVG content`);
  }
});

test("bounded search provides stable pages without loading the entire catalog", () => {
  const first = searchScientificIcons();
  const second = searchScientificIcons({ offset: first.nextOffset ?? 0, limit: first.limit });
  assert.equal(first.total, 867);
  assert.equal(first.items.length, 72);
  assert.equal(first.hasMore, true);
  assert.equal(second.items.length, 72);
  assert.equal(first.items.some((icon) => second.items.some((next) => next.id === icon.id)), false);

  const health = searchScientificIcons({ source: "healthicons", category: "biology", limit: 100 });
  assert.ok(health.items.length > 0);
  assert.ok(health.items.every((icon) => icon.source === "healthicons" && icon.category === "biology"));
});

test("recommendations are deterministic and require a semantic match", () => {
  const input = { label: "DNA sequence", role: "science", group: "Biological sample" };
  const first = recommendScientificIcons(input);
  const second = recommendScientificIcons(input);
  assert.deepEqual(first.map((icon) => icon.id), second.map((icon) => icon.id));
  assert.ok(first.some((icon) => icon.id === "dna" || icon.sourceId === "dna"));
  assert.deepEqual(recommendScientificIcons({ label: "Zzq frobnicator module", role: "model" }), []);
});

test("recent IDs discard unknown catalog entries and unknown SVGs fail visibly", () => {
  assert.deepEqual(normalizeRecentIconIds(["dna", "missing:icon", "dna", "tabler:brain"]), ["dna", "tabler:brain"]);
  assert.match(scientificIconSvg("missing:icon"), /data-hichart-source="unavailable"/);
});
