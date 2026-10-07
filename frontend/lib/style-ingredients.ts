import { scientificIconReferences, type ScientificIconReferenceId } from "./scientific-assets";
import type { ReferenceItem, ReferenceRegion } from "./types";

export type LocalIconCandidate = {
  label: string;
  tags: string[];
  description: string;
  cropDataUrl: string;
  bbox: { x: number; y: number; w: number; h: number };
  matchedPresetIconId: ScientificIconReferenceId;
};

type IconCandidateLike = {
  label: string;
  tags: string[];
  description: string;
  cropDataUrl: string;
  bbox?: { x: number; y: number; w: number; h: number } | null;
  matchedPresetIconId?: ScientificIconReferenceId | null;
};

function keywordText(reference: ReferenceItem, region?: ReferenceRegion | null) {
  return `${reference.title} ${reference.subject} ${reference.imageType} ${reference.styleTags.join(" ")} ${reference.similarityReason} ${region?.label ?? ""}`.toLowerCase();
}

export function inferIconReferenceId(reference: ReferenceItem, region?: ReferenceRegion | null): ScientificIconReferenceId {
  const text = keywordText(reference, region);
  const direct = scientificIconReferences.find((icon) => {
    const id = icon.id.toLowerCase();
    const label = icon.label.toLowerCase();
    return text.includes(id) || text.includes(label);
  });
  if (direct) return direct.id;
  if (text.includes("arrow") || text.includes("flow") || text.includes("pipeline")) return "arrow";
  if (text.includes("database") || text.includes("dataset") || text.includes("data")) return "database";
  if (text.includes("model") || text.includes("network") || text.includes("neural")) return "model";
  if (text.includes("chart") || text.includes("plot") || text.includes("metric")) return "chart";
  if (text.includes("document") || text.includes("paper") || text.includes("citation")) return "document";
  if (text.includes("search") || text.includes("retriev")) return "search";
  return "model";
}

type PaletteBucket = {
  count: number;
  total: [number, number, number];
};

function paletteRgbToHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function paletteColorDistance(a: [number, number, number], b: [number, number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function paletteSaturation([r, g, b]: [number, number, number]) {
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
}

function paletteChroma([r, g, b]: [number, number, number]) {
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

function paletteHue([r, g, b]: [number, number, number]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (!delta) return 0;
  const hue = max === r
    ? ((g - b) / delta) % 6
    : max === g
      ? (b - r) / delta + 2
      : (r - g) / delta + 4;
  return (hue * 60 + 360) % 360;
}

function paletteHueDistance(a: number, b: number) {
  const gap = Math.abs(a - b) % 360;
  return gap > 180 ? 360 - gap : gap;
}

export type FigurePaletteCandidate = {
  count: number;
  rgb: [number, number, number];
};

function paletteBrightness([r, g, b]: [number, number, number]) {
  return (r + g + b) / (3 * 255);
}

/**
 * Select visual roles rather than the four most frequent buckets: two broad
 * colored fills, then the strongest recurring accents. Neutral ink only fills
 * an empty slot for genuinely monochrome references.
 */
export function curateFigurePaletteCandidates(
  candidates: FigurePaletteCandidate[],
  fallbackColors: string[],
  limit = 4,
) {
  const totalSamples = candidates.reduce((sum, candidate) => sum + candidate.count, 0);
  const minimumAccentCount = Math.max(2, Math.floor(totalSamples * 0.0015));
  const chromatic = candidates.filter(({ rgb }) => {
    const brightness = paletteBrightness(rgb);
    const saturation = paletteSaturation(rgb);
    return brightness > 0.14 && brightness < 0.97 && saturation >= 0.09 && paletteChroma(rgb) >= 0.1;
  });
  const fills = chromatic
    .filter(({ rgb }) => paletteBrightness(rgb) >= 0.68 && paletteChroma(rgb) >= 0.1)
    .sort((a, b) => b.count - a.count);
  const accents = chromatic
    .filter(({ count, rgb }) => (
      count >= minimumAccentCount &&
      paletteBrightness(rgb) >= 0.18 &&
      paletteBrightness(rgb) <= 0.9 &&
      paletteSaturation(rgb) >= 0.34 &&
      paletteChroma(rgb) >= 0.22
    ))
    .sort((a, b) => (
      Math.sqrt(b.count) * Math.pow(0.6 + paletteSaturation(b.rgb), 2) -
      Math.sqrt(a.count) * Math.pow(0.6 + paletteSaturation(a.rgb), 2)
    ));

  const picked: [number, number, number][] = [];
  const pushDistinct = (rgb: [number, number, number], minimumDistance: number) => {
    if (picked.some((color) => paletteColorDistance(color, rgb) < minimumDistance)) return false;
    picked.push(rgb);
    return true;
  };

  for (const candidate of fills) {
    pushDistinct(candidate.rgb, 38);
    if (picked.length >= Math.min(2, limit)) break;
  }

  const accentHues: number[] = [];
  for (const candidate of accents) {
    if (picked.length >= limit) break;
    const hue = paletteHue(candidate.rgb);
    if (accentHues.some((existing) => paletteHueDistance(existing, hue) < 18)) continue;
    if (pushDistinct(candidate.rgb, 48)) accentHues.push(hue);
  }

  const remainingChromatic = [...chromatic].sort(
    (a, b) => b.count * (0.45 + paletteSaturation(b.rgb)) - a.count * (0.45 + paletteSaturation(a.rgb)),
  );
  for (const candidate of remainingChromatic) {
    if (picked.length >= limit) break;
    pushDistinct(candidate.rgb, 44);
  }

  if (picked.length < 3) {
    const usefulNeutrals = candidates
      .filter(({ rgb }) => {
        const brightness = paletteBrightness(rgb);
        return brightness > 0.16 && brightness < 0.92 && paletteChroma(rgb) < 0.08;
      })
      .sort((a, b) => b.count - a.count);
    for (const candidate of usefulNeutrals) {
      if (picked.length >= limit) break;
      pushDistinct(candidate.rgb, 42);
    }
  }

  return picked.length >= 3
    ? picked.slice(0, limit).map(paletteRgbToHex)
    : fallbackColors.slice(0, limit);
}

/**
 * Extract one compact, figure-ready palette instead of exposing every frequent
 * pixel color. Large colored panels and recurring accents are treated as
 * separate roles so gray headers or a tiny illustration cannot crowd them out.
 */
export function extractCuratedPaletteFromImageRegion(
  image: HTMLImageElement,
  region: Pick<ReferenceRegion, "x" | "y" | "w" | "h">,
  fallbackColors: string[],
  limit = 4,
) {
  try {
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    if (!sourceWidth || !sourceHeight) return fallbackColors.slice(0, limit);
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 72;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return fallbackColors.slice(0, limit);
    ctx.drawImage(
      image,
      region.x * sourceWidth,
      region.y * sourceHeight,
      region.w * sourceWidth,
      region.h * sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const buckets = new Map<string, PaletteBucket>();
    for (let i = 0; i < data.length; i += 16) {
      if (data[i + 3] < 180) continue;
      const raw: [number, number, number] = [data[i], data[i + 1], data[i + 2]];
      const key = raw.map((value) => Math.min(224, Math.round(value / 32) * 32)).join(",");
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.total[0] += raw[0];
        bucket.total[1] += raw[1];
        bucket.total[2] += raw[2];
      } else {
        buckets.set(key, { count: 1, total: [...raw] });
      }
    }

    const candidates = Array.from(buckets.values())
      .map((bucket) => ({
        count: bucket.count,
        rgb: bucket.total.map((value) => value / bucket.count) as [number, number, number],
      }));

    return curateFigurePaletteCandidates(candidates, fallbackColors, limit);
  } catch {
    return fallbackColors.slice(0, limit);
  }
}

export function cropImageRegionToDataUrl(
  image: HTMLImageElement,
  region: Pick<ReferenceRegion, "x" | "y" | "w" | "h">,
  fallback: string | null = null,
) {
  try {
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    if (!sourceWidth || !sourceHeight) return fallback;
    const cropWidth = Math.max(1, region.w * sourceWidth);
    const cropHeight = Math.max(1, region.h * sourceHeight);
    const maxSide = 384;
    const scale = Math.min(1, maxSide / Math.max(cropWidth, cropHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(cropWidth * scale));
    canvas.height = Math.max(1, Math.round(cropHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return fallback;
    ctx.drawImage(
      image,
      region.x * sourceWidth,
      region.y * sourceHeight,
      cropWidth,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return canvas.toDataURL("image/png");
  } catch {
    return fallback;
  }
}

function overlapRatio(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const smaller = Math.min(a.w * a.h, b.w * b.h);
  return smaller > 0 ? intersection / smaller : 0;
}

function iconRegionQuality(
  image: HTMLImageElement,
  bbox: { x: number; y: number; w: number; h: number },
) {
  try {
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    if (!sourceWidth || !sourceHeight) return 0;
    const aspect = bbox.w / Math.max(0.001, bbox.h);
    const area = bbox.w * bbox.h;
    if (aspect < 0.42 || aspect > 2.25) return 0;
    if (area < 0.00012 || area > 0.055) return 0;
    if (bbox.w > 0.24 || bbox.h > 0.38) return 0;

    const sample = 96;
    const canvas = document.createElement("canvas");
    canvas.width = sample;
    canvas.height = sample;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 0;
    ctx.drawImage(
      image,
      bbox.x * sourceWidth,
      bbox.y * sourceHeight,
      bbox.w * sourceWidth,
      bbox.h * sourceHeight,
      0,
      0,
      sample,
      sample,
    );
    const { data } = ctx.getImageData(0, 0, sample, sample);
    let foreground = 0;
    let borderForeground = 0;
    let coloredForeground = 0;
    let horizontalInkRows = 0;
    for (let y = 0; y < sample; y += 1) {
      let rowForeground = 0;
      for (let x = 0; x < sample; x += 1) {
        const i = (y * sample + x) * 4;
        const alpha = data[i + 3];
        if (alpha < 120) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const brightness = r + g + b;
        const saturation = max - min;
        const isInk = brightness < 610 || (saturation > 34 && brightness < 720);
        if (!isInk) continue;
        foreground += 1;
        rowForeground += 1;
        if (saturation > 36) coloredForeground += 1;
        if (x < 4 || y < 4 || x >= sample - 4 || y >= sample - 4) borderForeground += 1;
      }
      if (rowForeground > sample * 0.38) horizontalInkRows += 1;
    }
    const fill = foreground / (sample * sample);
    if (fill < 0.012 || fill > 0.58) return 0;
    if (borderForeground / Math.max(1, foreground) > 0.34) return 0;
    if (horizontalInkRows >= 16 && coloredForeground / Math.max(1, foreground) < 0.16) return 0;
    const compactness = 1 - Math.abs(Math.log(aspect)) / Math.log(2.25);
    const colorBonus = Math.min(0.18, coloredForeground / Math.max(1, foreground) * 0.25);
    return Math.max(0, compactness) + fill * 0.8 + colorBonus;
  } catch {
    return 0;
  }
}

export function filterObviousIconCandidates<T extends IconCandidateLike>(
  image: HTMLImageElement,
  candidates: T[],
  limit = 6,
): T[] {
  const ranked = candidates
    .filter((candidate) => candidate.cropDataUrl && candidate.bbox)
    .map((candidate) => ({
      candidate,
      quality: iconRegionQuality(image, candidate.bbox!),
    }))
    .filter((entry) => entry.quality > 0.2)
    .sort((a, b) => b.quality - a.quality);
  const selected: T[] = [];
  for (const entry of ranked) {
    const bbox = entry.candidate.bbox!;
    if (selected.some((candidate) => candidate.bbox && overlapRatio(candidate.bbox, bbox) > 0.38)) continue;
    selected.push(entry.candidate);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function extractLocalIconCandidatesFromImage(
  image: HTMLImageElement,
  reference: ReferenceItem,
  limit = 6,
): LocalIconCandidate[] {
  try {
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    if (!sourceWidth || !sourceHeight) return [];
    const maxWidth = 900;
    const scale = Math.min(1, maxWidth / sourceWidth);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(image, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    const foreground = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      const alpha = data[i + 3];
      if (alpha < 120) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const brightness = r + g + b;
      const saturation = max - min;
      const darkInk = brightness < 610;
      const coloredInk = saturation > 34 && brightness < 720;
      if (darkInk || coloredInk) foreground[p] = 1;
    }

    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    const components: Array<{ x: number; y: number; w: number; h: number; pixels: number; score: number }> = [];
    for (let start = 0; start < foreground.length; start += 1) {
      if (!foreground[start] || visited[start]) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;
      let pixels = 0;
      while (head < tail) {
        const point = queue[head++];
        const x = point % width;
        const y = Math.floor(point / width);
        pixels += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        for (const next of [point - 1, point + 1, point - width, point + width]) {
          if (next < 0 || next >= foreground.length || visited[next] || !foreground[next]) continue;
          const nx = next % width;
          if (Math.abs(nx - x) > 1) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      const boxW = maxX - minX + 1;
      const boxH = maxY - minY + 1;
      const area = boxW * boxH;
      const fill = pixels / Math.max(1, area);
      const aspect = boxW / Math.max(1, boxH);
      if (boxW < 16 || boxH < 16) continue;
      if (boxW > width * 0.22 || boxH > height * 0.36) continue;
      if (area > width * height * 0.055) continue;
      if (aspect < 0.36 || aspect > 2.7) continue;
      if (fill < 0.012 || fill > 0.68) continue;
      components.push({
        x: minX,
        y: minY,
        w: boxW,
        h: boxH,
        pixels,
        score: pixels * Math.min(boxW, boxH) / Math.max(boxW, boxH),
      });
    }

    const padded = components
      .sort((a, b) => b.score - a.score)
      .map((box) => {
        const pad = Math.round(Math.max(box.w, box.h) * 0.12);
        const x = Math.max(0, box.x - pad);
        const y = Math.max(0, box.y - pad);
        const right = Math.min(width, box.x + box.w + pad);
        const bottom = Math.min(height, box.y + box.h + pad);
        return {
          x: x / width,
          y: y / height,
          w: (right - x) / width,
          h: (bottom - y) / height,
        };
      });

    const selected: typeof padded = [];
    for (const box of padded) {
      if (selected.some((existing) => overlapRatio(existing, box) > 0.45)) continue;
      selected.push(box);
      if (selected.length >= limit) break;
    }

    const candidates = selected.map((bbox, index) => {
      const label = `Local icon ${index + 1}`;
      const region = {
        id: `local-icon-${index}`,
        referenceId: reference.id,
        intent: "style" as const,
        x: bbox.x,
        y: bbox.y,
        w: bbox.w,
        h: bbox.h,
        label,
      };
      const matchedPresetIconId = inferIconReferenceId(reference, region);
      return {
        label,
        tags: ["extracted from style", "local detection", matchedPresetIconId],
        description: "Local pixel-based icon candidate from the style reference.",
        cropDataUrl: cropImageRegionToDataUrl(image, bbox, "") ?? "",
        bbox,
        matchedPresetIconId,
      };
    }).filter((candidate) => candidate.cropDataUrl);
    return filterObviousIconCandidates(image, candidates, limit);
  } catch {
    return [];
  }
}
