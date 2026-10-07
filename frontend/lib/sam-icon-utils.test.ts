import assert from "node:assert/strict";
import test from "node:test";
import {
  createLetterboxTransform,
  detectForegroundRegions,
  fillSmallHoles,
  keepSeedConnectedComponent,
  logitsToSoftAlpha,
  maskBoundsFromLogits,
  maskIoUAtThresholds,
  normalizedPointToModel,
  suggestAutoSeedPoints,
} from "./sam-icon-utils";

test("letterboxes landscape images vertically", () => {
  const transform = createLetterboxTransform(2000, 1000, 1024);
  assert.deepEqual(transform, { size: 1024, x: 0, y: 256, w: 1024, h: 512 });
});

test("maps normalized source points into padded model coordinates", () => {
  const transform = createLetterboxTransform(2000, 1000, 1024);
  assert.deepEqual(
    normalizedPointToModel({ x: 0.5, y: 0.5, label: 1 }, transform),
    { x: 512, y: 512, label: 1 },
  );
});

test("returns normalized mask bounds inside the unpadded image", () => {
  const transform = createLetterboxTransform(200, 100, 8);
  const logits = new Float32Array(8 * 8).fill(-1);
  for (const y of [3, 4]) {
    for (const x of [2, 3]) logits[y * 8 + x] = 1;
  }
  assert.deepEqual(maskBoundsFromLogits(logits, 8, 8, transform), {
    x: 0.25,
    y: 0.25,
    w: 0.25,
    h: 0.5,
  });
});

test("suggests local SAM prompts inside separated foreground objects", () => {
  const width = 120;
  const height = 80;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 12; y < 30; y += 1) {
    for (let x = 10; x < 30; x += 1) {
      const index = (y * width + x) * 4;
      pixels[index] = 25;
      pixels[index + 1] = 90;
      pixels[index + 2] = 190;
    }
  }
  for (let y = 48; y < 70; y += 1) {
    for (let x = 82; x < 110; x += 1) {
      const index = (y * width + x) * 4;
      pixels[index] = 220;
      pixels[index + 1] = 55;
      pixels[index + 2] = 45;
    }
  }
  const points = suggestAutoSeedPoints(pixels, width, height, { columns: 4, rows: 2, maxPoints: 6 });
  assert.ok(points.some((point) => point.x < 0.35 && point.y < 0.5));
  assert.ok(points.some((point) => point.x > 0.65 && point.y > 0.5));
  assert.ok(points.every((point) => point.label === 1));
});

test("does not invent auto prompts for a blank image", () => {
  const pixels = new Uint8ClampedArray(64 * 48 * 4).fill(255);
  assert.deepEqual(suggestAutoSeedPoints(pixels, 64, 48), []);
});

test("detects separated foreground regions with bounding boxes", () => {
  const width = 160;
  const height = 100;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 10; y < 34; y += 1) {
    for (let x = 12; x < 44; x += 1) {
      const index = (y * width + x) * 4;
      pixels[index] = 20;
      pixels[index + 1] = 80;
      pixels[index + 2] = 180;
    }
  }
  for (let y = 58; y < 88; y += 1) {
    for (let x = 96; x < 140; x += 1) {
      const index = (y * width + x) * 4;
      pixels[index] = 210;
      pixels[index + 1] = 40;
      pixels[index + 2] = 35;
    }
  }
  const regions = detectForegroundRegions(pixels, width, height, { maxRegions: 4 });
  assert.equal(regions.length, 2);
  assert.ok(regions.some((region) => region.center.x < 0.35 && region.center.y < 0.45));
  assert.ok(regions.some((region) => region.center.x > 0.65 && region.center.y > 0.65));
  assert.ok(regions.every((region) => region.box.w > 0.05 && region.box.h > 0.05));
});

test("returns no foreground regions for a blank image", () => {
  const pixels = new Uint8ClampedArray(80 * 60 * 4).fill(255);
  assert.deepEqual(detectForegroundRegions(pixels, 80, 60), []);
});

test("keeps only the connected component that contains the seed", () => {
  const width = 6;
  const height = 4;
  const logits = new Float32Array(width * height).fill(-2);
  const mark = (x: number, y: number) => {
    logits[y * width + x] = 2;
  };
  mark(0, 1);
  mark(1, 1);
  mark(4, 2);
  mark(5, 2);
  const cleaned = keepSeedConnectedComponent(logits, width, height, [{ x: 0, y: 1 }]);
  assert.ok(cleaned[1 * width + 0] > 0);
  assert.ok(cleaned[1 * width + 1] > 0);
  assert.ok(cleaned[2 * width + 4] <= 0);
  assert.ok(cleaned[2 * width + 5] <= 0);
});

test("keeps every component that contains one of multiple seeds", () => {
  const width = 6;
  const height = 4;
  const logits = new Float32Array(width * height).fill(-2);
  const mark = (x: number, y: number) => {
    logits[y * width + x] = 2;
  };
  mark(0, 1);
  mark(1, 1);
  mark(4, 2);
  mark(5, 2);
  const cleaned = keepSeedConnectedComponent(logits, width, height, [
    { x: 0, y: 1 },
    { x: 5, y: 2 },
  ]);
  assert.ok(cleaned[1 * width + 0] > 0);
  assert.ok(cleaned[1 * width + 1] > 0);
  assert.ok(cleaned[2 * width + 4] > 0);
  assert.ok(cleaned[2 * width + 5] > 0);
});

test("fills small interior holes but keeps large ones", () => {
  const width = 7;
  const height = 5;
  const logits = new Float32Array(width * height).fill(-2);
  for (let y = 1; y < 4; y += 1) {
    for (let x = 1; x < 6; x += 1) {
      logits[y * width + x] = 2;
    }
  }
  logits[2 * width + 3] = -2;
  const filled = fillSmallHoles(logits, width, height, 0, 0.2);
  assert.ok(filled[2 * width + 3] > 0);
});

test("maps logits to soft alpha values", () => {
  const logits = new Float32Array([-4, 0, 4]);
  const alpha = logitsToSoftAlpha(logits, 6);
  assert.ok(alpha[0] < 20);
  assert.ok(alpha[1] > 100 && alpha[1] < 160);
  assert.ok(alpha[2] > 230);
});

test("measures mask stability across nearby thresholds", () => {
  const logits = new Float32Array([2, 2, -2, -2]);
  assert.equal(maskIoUAtThresholds(logits, -1, 0), 1);
  const unstable = new Float32Array([-0.5, 0.5, -2, 2]);
  assert.ok(maskIoUAtThresholds(unstable, -1, 0) < 1);
});
