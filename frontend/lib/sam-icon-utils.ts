export type SamPoint = {
  x: number;
  y: number;
  label: 0 | 1 | 2 | 3;
};

export type NormalizedBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LetterboxTransform = {
  size: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type AutoSeedOptions = {
  columns?: number;
  rows?: number;
  maxPoints?: number;
  minDistance?: number;
};

export type ForegroundRegion = {
  box: NormalizedBox;
  center: { x: number; y: number };
  area: number;
  score: number;
};

export type RegionDetectOptions = {
  minAreaRatio?: number;
  maxAreaRatio?: number;
  minPixels?: number;
  maxRegions?: number;
  foregroundThreshold?: number;
  minBoxRatio?: number;
  maxBoxRatio?: number;
};

function channelMedian(values: number[]) {
  if (!values.length) return 255;
  values.sort((left, right) => left - right);
  return values[Math.floor(values.length / 2)];
}

function estimateBorderBackground(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const borderR: number[] = [];
  const borderG: number[] = [];
  const borderB: number[] = [];
  const borderStep = Math.max(1, Math.floor(Math.max(width, height) / 96));
  const sample = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    if (rgba[index + 3] < 32) return;
    borderR.push(rgba[index]);
    borderG.push(rgba[index + 1]);
    borderB.push(rgba[index + 2]);
  };
  for (let x = 0; x < width; x += borderStep) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += borderStep) {
    sample(0, y);
    sample(width - 1, y);
  }
  return {
    r: channelMedian(borderR),
    g: channelMedian(borderG),
    b: channelMedian(borderB),
  };
}

function foregroundWeightAtPixel(
  rgba: Uint8ClampedArray,
  index: number,
  background: { r: number; g: number; b: number },
) {
  if (rgba[index + 3] < 32) return 0;
  const dr = rgba[index] - background.r;
  const dg = rgba[index + 1] - background.g;
  const db = rgba[index + 2] - background.b;
  const distance = Math.sqrt(dr * dr + dg * dg + db * db) / 441.673;
  const chroma = (Math.max(rgba[index], rgba[index + 1], rgba[index + 2]) -
    Math.min(rgba[index], rgba[index + 1], rgba[index + 2])) / 255;
  return Math.max(distance, chroma * 0.78);
}

/**
 * Finds connected foreground components and returns bbox + centroid prompts for SAM2.
 */
export function detectForegroundRegions(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: RegionDetectOptions = {},
): ForegroundRegion[] {
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) return [];
  const minAreaRatio = Math.max(0.0001, options.minAreaRatio ?? 0.00035);
  const maxAreaRatio = Math.min(0.5, options.maxAreaRatio ?? 0.32);
  const minPixels = Math.max(4, Math.floor(options.minPixels ?? 16));
  const maxRegions = Math.max(1, Math.floor(options.maxRegions ?? 12));
  const foregroundThreshold = options.foregroundThreshold ?? 0.075;
  const minBoxRatio = options.minBoxRatio ?? 0.012;
  const maxBoxRatio = options.maxBoxRatio ?? 0.42;
  const totalPixels = width * height;
  const minArea = Math.max(minPixels, Math.floor(totalPixels * minAreaRatio));
  const maxArea = Math.floor(totalPixels * maxAreaRatio);
  const background = estimateBorderBackground(rgba, width, height);
  const foreground = new Uint8Array(totalPixels);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      foreground[pixel] = foregroundWeightAtPixel(rgba, pixel * 4, background) >= foregroundThreshold ? 1 : 0;
    }
  }

  const visited = new Uint8Array(totalPixels);
  const regions: ForegroundRegion[] = [];
  const queueX = new Int32Array(totalPixels);
  const queueY = new Int32Array(totalPixels);

  for (let startY = 0; startY < height; startY += 1) {
    for (let startX = 0; startX < width; startX += 1) {
      const start = startY * width + startX;
      if (!foreground[start] || visited[start]) continue;
      let head = 0;
      let tail = 0;
      queueX[tail] = startX;
      queueY[tail] = startY;
      tail += 1;
      visited[start] = 1;
      let area = 0;
      let sumX = 0;
      let sumY = 0;
      let minX = startX;
      let minY = startY;
      let maxX = startX;
      let maxY = startY;
      let weightSum = 0;
      while (head < tail) {
        const x = queueX[head];
        const y = queueY[head];
        head += 1;
        area += 1;
        sumX += x;
        sumY += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        weightSum += foregroundWeightAtPixel(rgba, (y * width + x) * 4, background);
        if (x > 0) {
          const left = y * width + (x - 1);
          if (foreground[left] && !visited[left]) {
            visited[left] = 1;
            queueX[tail] = x - 1;
            queueY[tail] = y;
            tail += 1;
          }
        }
        if (x + 1 < width) {
          const right = y * width + (x + 1);
          if (foreground[right] && !visited[right]) {
            visited[right] = 1;
            queueX[tail] = x + 1;
            queueY[tail] = y;
            tail += 1;
          }
        }
        if (y > 0) {
          const up = (y - 1) * width + x;
          if (foreground[up] && !visited[up]) {
            visited[up] = 1;
            queueX[tail] = x;
            queueY[tail] = y - 1;
            tail += 1;
          }
        }
        if (y + 1 < height) {
          const down = (y + 1) * width + x;
          if (foreground[down] && !visited[down]) {
            visited[down] = 1;
            queueX[tail] = x;
            queueY[tail] = y + 1;
            tail += 1;
          }
        }
      }
      if (area < minArea || area > maxArea) continue;
      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const boxRatio = (boxWidth * boxHeight) / Math.max(1, totalPixels);
      if (boxRatio < minBoxRatio || boxRatio > maxBoxRatio) continue;
      const centerX = sumX / area;
      const centerY = sumY / area;
      regions.push({
        box: {
          x: minX / width,
          y: minY / height,
          w: boxWidth / width,
          h: boxHeight / height,
        },
        center: {
          x: Math.min(0.995, Math.max(0.005, centerX / width)),
          y: Math.min(0.995, Math.max(0.005, centerY / height)),
        },
        area,
        score: (weightSum / Math.max(1, area)) * Math.sqrt(area / Math.max(1, totalPixels)),
      });
    }
  }

  regions.sort((left, right) => right.score - left.score);
  const selected: ForegroundRegion[] = [];
  for (const region of regions) {
    const overlaps = selected.some((existing) => normalizedBoxIoU(existing.box, region.box) >= 0.55);
    if (overlaps) continue;
    selected.push(region);
    if (selected.length >= maxRegions) break;
  }
  return selected;
}

export function regionToSamPoints(region: ForegroundRegion): SamPoint[] {
  const { box, center } = region;
  return [
    { x: center.x, y: center.y, label: 1 },
    { x: box.x, y: box.y, label: 2 },
    { x: box.x + box.w, y: box.y + box.h, label: 3 },
  ];
}

export function normalizedBoxIoU(left: NormalizedBox, right: NormalizedBox) {
  const leftRight = left.x + left.w;
  const leftBottom = left.y + left.h;
  const rightRight = right.x + right.w;
  const rightBottom = right.y + right.h;
  const intersectionLeft = Math.max(left.x, right.x);
  const intersectionTop = Math.max(left.y, right.y);
  const intersectionRight = Math.min(leftRight, rightRight);
  const intersectionBottom = Math.min(leftBottom, rightBottom);
  const intersectionWidth = Math.max(0, intersectionRight - intersectionLeft);
  const intersectionHeight = Math.max(0, intersectionBottom - intersectionTop);
  const intersection = intersectionWidth * intersectionHeight;
  const union = left.w * left.h + right.w * right.h - intersection;
  return union > 0 ? intersection / union : 0;
}

export function sigmoid(value: number) {
  if (value >= 0) {
    const expValue = Math.exp(-value);
    return 1 / (1 + expValue);
  }
  const expValue = Math.exp(value);
  return expValue / (1 + expValue);
}

export function logitsToSoftAlpha(
  logits: Float32Array,
  sharpness = 6,
): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(logits.length);
  for (let index = 0; index < logits.length; index += 1) {
    alpha[index] = Math.round(sigmoid(logits[index] * sharpness) * 255);
  }
  return alpha;
}

function binaryMaskFromLogits(logits: Float32Array, threshold: number) {
  const mask = new Uint8Array(logits.length);
  for (let index = 0; index < logits.length; index += 1) {
    mask[index] = logits[index] > threshold ? 1 : 0;
  }
  return mask;
}

export function maskIoUAtThresholds(
  logits: Float32Array,
  lowThreshold: number,
  highThreshold: number,
) {
  if (logits.length === 0) return 0;
  let intersection = 0;
  let union = 0;
  for (let index = 0; index < logits.length; index += 1) {
    const low = logits[index] > lowThreshold;
    const high = logits[index] > highThreshold;
    if (low && high) intersection += 1;
    if (low || high) union += 1;
  }
  return union ? intersection / union : 0;
}

export function keepSeedConnectedComponent(
  logits: Float32Array,
  width: number,
  height: number,
  seeds: Array<{ x: number; y: number }>,
  threshold = 0,
) {
  if (logits.length !== width * height || width <= 0 || height <= 0) return logits;
  const binary = binaryMaskFromLogits(logits, threshold);
  const seedIndices = seeds
    .map((seed) => {
      const clampedX = Math.min(width - 1, Math.max(0, Math.floor(seed.x)));
      const clampedY = Math.min(height - 1, Math.max(0, Math.floor(seed.y)));
      return clampedY * width + clampedX;
    })
    .filter((index) => binary[index]);
  if (!seedIndices.length) return logits;

  const visited = new Uint8Array(binary.length);
  const queue = new Int32Array(binary.length);
  let head = 0;
  let tail = 0;
  for (const seedIndex of seedIndices) {
    if (visited[seedIndex]) continue;
    visited[seedIndex] = 1;
    queue[tail] = seedIndex;
    tail += 1;
  }
  const cleaned = new Float32Array(logits);
  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    const neighbors = [
      x > 0 ? index - 1 : -1,
      x + 1 < width ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y + 1 < height ? index + width : -1,
    ];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || visited[neighbor] || !binary[neighbor]) continue;
      visited[neighbor] = 1;
      queue[tail] = neighbor;
      tail += 1;
    }
  }
  for (let index = 0; index < cleaned.length; index += 1) {
    if (!visited[index]) cleaned[index] = Math.min(cleaned[index], threshold - 4);
  }
  return cleaned;
}

export function fillSmallHoles(
  logits: Float32Array,
  width: number,
  height: number,
  threshold = 0,
  maxHoleAreaRatio = 0.05,
) {
  if (logits.length !== width * height || width <= 0 || height <= 0) return logits;
  const binary = binaryMaskFromLogits(logits, threshold);
  let foregroundArea = 0;
  for (let index = 0; index < binary.length; index += 1) {
    if (binary[index]) foregroundArea += 1;
  }
  if (!foregroundArea) return logits;
  const maxHoleArea = Math.max(4, Math.floor(foregroundArea * maxHoleAreaRatio));
  const visited = new Uint8Array(binary.length);
  const filled = new Float32Array(logits);
  const queue = new Int32Array(binary.length);

  for (let start = 0; start < binary.length; start += 1) {
    if (binary[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail] = start;
    tail += 1;
    visited[start] = 1;
    const component: number[] = [start];
    let touchesBorder = start % width === 0
      || start % width === width - 1
      || start < width
      || start >= binary.length - width;
    while (head < tail) {
      const index = queue[head];
      head += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || visited[neighbor] || binary[neighbor]) continue;
        visited[neighbor] = 1;
        component.push(neighbor);
        queue[tail] = neighbor;
        tail += 1;
        const neighborX = neighbor % width;
        const neighborY = Math.floor(neighbor / width);
        if (
          neighborX === 0
          || neighborX === width - 1
          || neighborY === 0
          || neighborY === height - 1
        ) {
          touchesBorder = true;
        }
      }
    }
    if (touchesBorder || component.length > maxHoleArea) continue;
    for (const index of component) {
      filled[index] = threshold + 4;
    }
  }
  return filled;
}

export function refineMaskLogits(
  logits: Float32Array,
  width: number,
  height: number,
  seeds: Array<{ x: number; y: number }>,
  threshold = 0,
) {
  const connected = keepSeedConnectedComponent(logits, width, height, seeds, threshold);
  return fillSmallHoles(connected, width, height, threshold);
}

/**
 * Finds a small set of foreground-heavy points without uploading the image.
 * These are prompts for SAM2, not final detections: the worker still rejects
 * oversized, tiny, low-confidence, and duplicate masks.
 */
export function suggestAutoSeedPoints(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: AutoSeedOptions = {},
): SamPoint[] {
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) return [];
  const columns = Math.max(2, Math.floor(options.columns ?? 6));
  const rows = Math.max(2, Math.floor(options.rows ?? 4));
  const maxPoints = Math.max(1, Math.floor(options.maxPoints ?? 12));
  const minDistance = Math.max(0.03, options.minDistance ?? 0.105);
  const background = estimateBorderBackground(rgba, width, height);

  const candidates: Array<SamPoint & { score: number }> = [];
  for (let row = 0; row < rows; row += 1) {
    const top = Math.floor((row * height) / rows);
    const bottom = Math.max(top + 1, Math.floor(((row + 1) * height) / rows));
    for (let column = 0; column < columns; column += 1) {
      const left = Math.floor((column * width) / columns);
      const right = Math.max(left + 1, Math.floor(((column + 1) * width) / columns));
      let weightedX = 0;
      let weightedY = 0;
      let totalWeight = 0;
      let activePixels = 0;
      let sampledPixels = 0;
      let peakWeight = 0;
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const index = (y * width + x) * 4;
          if (rgba[index + 3] < 32) continue;
          sampledPixels += 1;
          const foreground = foregroundWeightAtPixel(rgba, index, background);
          if (foreground < 0.075) continue;
          const weight = Math.pow(foreground - 0.055, 1.35);
          weightedX += (x + 0.5) * weight;
          weightedY += (y + 0.5) * weight;
          totalWeight += weight;
          activePixels += 1;
          peakWeight = Math.max(peakWeight, weight);
        }
      }
      const density = activePixels / Math.max(1, sampledPixels);
      if (activePixels < 5 || density < 0.008 || totalWeight <= 0) continue;
      candidates.push({
        x: Math.min(0.995, Math.max(0.005, weightedX / totalWeight / width)),
        y: Math.min(0.995, Math.max(0.005, weightedY / totalWeight / height)),
        label: 1,
        score: (totalWeight / Math.max(1, activePixels)) * Math.sqrt(Math.min(1, density * 5)) + peakWeight * 0.18,
      });
    }
  }

  candidates.sort((left, right) => right.score - left.score);
  const selected: SamPoint[] = [];
  for (const candidate of candidates) {
    if (selected.some((point) => Math.hypot(point.x - candidate.x, point.y - candidate.y) < minDistance)) {
      continue;
    }
    selected.push({ x: candidate.x, y: candidate.y, label: 1 });
    if (selected.length >= maxPoints) break;
  }
  return selected;
}

export function createLetterboxTransform(
  width: number,
  height: number,
  size = 1024,
): LetterboxTransform {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Image dimensions must be positive finite numbers.");
  }
  const scale = Math.min(size / width, size / height);
  const w = width * scale;
  const h = height * scale;
  return {
    size,
    x: (size - w) / 2,
    y: (size - h) / 2,
    w,
    h,
  };
}

export function normalizedPointToModel(
  point: SamPoint,
  transform: LetterboxTransform,
): SamPoint {
  return {
    x: transform.x + Math.min(1, Math.max(0, point.x)) * transform.w,
    y: transform.y + Math.min(1, Math.max(0, point.y)) * transform.h,
    label: point.label,
  };
}

export function normalizedBoxToModel(
  box: NormalizedBox,
  transform: LetterboxTransform,
): NormalizedBox {
  return {
    x: transform.x + Math.min(1, Math.max(0, box.x)) * transform.w,
    y: transform.y + Math.min(1, Math.max(0, box.y)) * transform.h,
    w: Math.min(transform.w, Math.max(0, box.w) * transform.w),
    h: Math.min(transform.h, Math.max(0, box.h) * transform.h),
  };
}

export function maskBoundsFromLogits(
  logits: Float32Array,
  width: number,
  height: number,
  transform: LetterboxTransform,
  threshold = 0,
): NormalizedBox | null {
  if (logits.length !== width * height || width <= 0 || height <= 0) return null;

  const scaleX = width / transform.size;
  const scaleY = height / transform.size;
  const contentLeft = Math.max(0, Math.floor(transform.x * scaleX));
  const contentTop = Math.max(0, Math.floor(transform.y * scaleY));
  const contentRight = Math.min(width, Math.ceil((transform.x + transform.w) * scaleX));
  const contentBottom = Math.min(height, Math.ceil((transform.y + transform.h) * scaleY));

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = contentTop; y < contentBottom; y += 1) {
    const row = y * width;
    for (let x = contentLeft; x < contentRight; x += 1) {
      if (logits[row + x] <= threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;

  return {
    x: Math.max(0, (minX - contentLeft) / Math.max(1, contentRight - contentLeft)),
    y: Math.max(0, (minY - contentTop) / Math.max(1, contentBottom - contentTop)),
    w: Math.min(1, (maxX - minX + 1) / Math.max(1, contentRight - contentLeft)),
    h: Math.min(1, (maxY - minY + 1) / Math.max(1, contentBottom - contentTop)),
  };
}
