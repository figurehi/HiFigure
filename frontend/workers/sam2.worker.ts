import * as ort from "onnxruntime-web/all";
import {
  maskIoUAtThresholds,
  normalizedBoxIoU,
  type NormalizedBox,
} from "../lib/sam-icon-utils";

const ENCODER_FILE = "sam2_hiera_tiny_encoder.with_runtime_opt.ort";
const DECODER_FILE = "sam2_hiera_tiny_decoder_pr1.onnx";
const ENCODER_BYTES = 134_736_672;
const DECODER_BYTES = 16_531_241;
const MODEL_BYTES = ENCODER_BYTES + DECODER_BYTES;
const MODEL_CACHE_NAME = "hichart-sam2-models-v1";
const ENCODER_URLS = [
  `/models/sam2/${ENCODER_FILE}`,
  `https://huggingface.co/g-ronimo/sam2-tiny/resolve/main/${ENCODER_FILE}`,
];
const DECODER_URLS = [
  `/models/sam2/${DECODER_FILE}`,
  `https://huggingface.co/g-ronimo/sam2-tiny/resolve/main/${DECODER_FILE}`,
];

type SamPromptPoint = {
  x: number;
  y: number;
  label: 0 | 1 | 2 | 3;
};

type RegionPrompt = {
  box: NormalizedBox;
  center: { x: number; y: number };
};

type WorkerRequest =
  | { type: "init" }
  | { type: "encode"; requestId: number; pixels: Float32Array; shape: number[] }
  | {
      type: "decode";
      requestId: number;
      points: SamPromptPoint[];
      previousMask?: Float32Array | null;
      previousMaskShape?: number[] | null;
    }
  | {
      type: "auto-decode";
      regions: RegionPrompt[];
      maxMasks?: number;
    };

type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

const workerScope = globalThis as unknown as WorkerScope;

let encoderBuffer: ArrayBuffer | null = null;
let decoderBuffer: ArrayBuffer | null = null;
let encoderSession: ort.InferenceSession | null = null;
let decoderSession: ort.InferenceSession | null = null;
let imageEmbedding: Record<string, ort.Tensor> | null = null;
let activeDevice: "webgpu" | "wasm" | null = null;
let initializing: Promise<void> | null = null;
let latestEncodeRequestId = 0;
let imageEmbeddingRequestId = 0;
const modelDownloadBytes = new Map<string, number>();

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

function report(phase: string, detail?: string) {
  workerScope.postMessage({ type: "status", phase, detail });
}

function reportModelDownload(filename: string, loaded: number) {
  modelDownloadBytes.set(filename, loaded);
  const totalLoaded = Array.from(modelDownloadBytes.values()).reduce((sum, value) => sum + value, 0);
  report("model-download", `${Math.min(totalLoaded, MODEL_BYTES)}:${MODEL_BYTES}`);
}

function modelCacheUrl(filename: string) {
  return new URL(`/__hichart-sam2-cache/${filename}`, globalThis.location.origin).href;
}

async function readOpfsModel(filename: string, expectedBytes: number) {
  try {
    const storage = navigator.storage as StorageManager & {
      getDirectory?: () => Promise<FileSystemDirectoryHandle>;
    };
    if (!storage.getDirectory) return null;
    const root = await storage.getDirectory();
    const handle = await root.getFileHandle(filename);
    const file = await handle.getFile();
    if (file.size !== expectedBytes) return null;
    return await file.arrayBuffer();
  } catch {
    return null;
  }
}

async function readCacheStorageModel(filename: string, expectedBytes: number) {
  try {
    if (typeof caches === "undefined") return null;
    const cache = await caches.open(MODEL_CACHE_NAME);
    const cacheUrl = modelCacheUrl(filename);
    const response = await cache.match(cacheUrl);
    if (!response) return null;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength !== expectedBytes) {
      await cache.delete(cacheUrl);
      return null;
    }
    return buffer;
  } catch {
    return null;
  }
}

async function readCachedModel(filename: string, expectedBytes: number) {
  return await readOpfsModel(filename, expectedBytes) ??
    await readCacheStorageModel(filename, expectedBytes);
}

async function cacheModelInOpfs(filename: string, buffer: ArrayBuffer) {
  try {
    const storage = navigator.storage as StorageManager & {
      getDirectory?: () => Promise<FileSystemDirectoryHandle>;
    };
    if (!storage.getDirectory) return false;
    const root = await storage.getDirectory();
    const handle = await root.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    await writable.write(buffer);
    await writable.close();
    return true;
  } catch (error) {
    console.warn("Unable to cache SAM2 model in OPFS", error);
    return false;
  }
}

async function cacheModelInCacheStorage(filename: string, buffer: ArrayBuffer) {
  try {
    if (typeof caches === "undefined") return false;
    const cache = await caches.open(MODEL_CACHE_NAME);
    await cache.put(
      modelCacheUrl(filename),
      new Response(buffer, {
        headers: {
          "Content-Length": String(buffer.byteLength),
          "Content-Type": "application/octet-stream",
        },
      }),
    );
    return true;
  } catch (error) {
    console.warn("Unable to cache SAM2 model in Cache Storage", error);
    return false;
  }
}

async function cacheModel(filename: string, buffer: ArrayBuffer) {
  if (await cacheModelInOpfs(filename, buffer)) return;
  if (await cacheModelInCacheStorage(filename, buffer)) return;
  workerScope.postMessage({
    type: "status",
    phase: "cache-unavailable",
    detail: "Browser storage is unavailable; the model will need to be loaded again next session.",
  });
}

function markCachedModelLoaded(filename: string, expectedBytes: number) {
  modelDownloadBytes.set(filename, expectedBytes);
  report("model-cache", filename);
}

function resetModelDownloadProgress(filename: string) {
  if (!modelDownloadBytes.has(filename)) {
    modelDownloadBytes.set(filename, 0);
  }
}

async function responseToModelBuffer(
  response: Response,
  filename: string,
  expectedBytes: number,
): Promise<ArrayBuffer> {
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    reportModelDownload(filename, buffer.byteLength);
    return buffer;
  }
  const reader = response.body.getReader();
  const bytes = new Uint8Array(expectedBytes);
  let offset = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (offset + value.byteLength > bytes.byteLength) {
      await reader.cancel();
      throw new Error(`Model download exceeded the expected size for ${filename}.`);
    }
    bytes.set(value, offset);
    offset += value.byteLength;
    reportModelDownload(filename, offset);
  }
  if (offset !== expectedBytes) {
    throw new Error(`Model download was incomplete (${offset}/${expectedBytes} bytes).`);
  }
  return bytes.buffer;
}

async function downloadModel(urls: string[], filename: string, expectedBytes: number) {
  const cached = await readCachedModel(filename, expectedBytes);
  if (cached) {
    markCachedModelLoaded(filename, expectedBytes);
    return cached;
  }
  resetModelDownloadProgress(filename);
  let lastError: unknown = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "force-cache", mode: "cors" });
      if (!response.ok) throw new Error(`Model source returned HTTP ${response.status}.`);
      const buffer = await responseToModelBuffer(response, filename, expectedBytes);
      if (buffer.byteLength !== expectedBytes) {
        throw new Error(`Model download was incomplete (${buffer.byteLength}/${expectedBytes} bytes).`);
      }
      await cacheModel(filename, buffer);
      return buffer;
    } catch (error) {
      lastError = error;
      console.warn(`Unable to load SAM2 model from ${url}`, error);
    }
  }
  throw lastError instanceof Error
    ? new Error(`Unable to load ${filename}: ${lastError.message}`)
    : new Error(`Unable to load ${filename}.`);
}

async function createSessionPair(encoderModel: ArrayBuffer, decoderModel: ArrayBuffer) {
  const candidates: Array<"webgpu" | "wasm"> = ["webgpu", "wasm"];
  let lastError: unknown = null;
  for (const device of candidates) {
    let encoder: ort.InferenceSession | null = null;
    try {
      encoder = await ort.InferenceSession.create(encoderModel, {
        executionProviders: [device],
        graphOptimizationLevel: "all",
      });
      const decoder = await ort.InferenceSession.create(decoderModel, {
        executionProviders: [device],
        graphOptimizationLevel: "all",
      });
      return { encoder, decoder, device };
    } catch (error) {
      lastError = error;
      await encoder?.release();
      console.warn(`SAM2 ${device} session pair unavailable`, error);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No local ONNX execution provider is available.");
}

async function initialize() {
  if (encoderSession && decoderSession) return;
  if (initializing) return initializing;
  initializing = (async () => {
    report("model-loading", "Preparing local SAM2 model");
    [encoderBuffer, decoderBuffer] = await Promise.all([
      downloadModel(ENCODER_URLS, ENCODER_FILE, ENCODER_BYTES),
      downloadModel(DECODER_URLS, DECODER_FILE, DECODER_BYTES),
    ]);
    report("session-loading", "Starting local inference engine");
    const sessions = await createSessionPair(encoderBuffer, decoderBuffer);
    encoderSession = sessions.encoder;
    decoderSession = sessions.decoder;
    activeDevice = sessions.device;
    workerScope.postMessage({ type: "ready", device: activeDevice });
  })().finally(() => {
    initializing = null;
  });
  return initializing;
}

async function encodeImage(pixels: Float32Array, shape: number[], requestId: number) {
  await initialize();
  if (!encoderSession) throw new Error("SAM2 encoder is unavailable.");
  report("encoding", "Encoding image locally");
  const results = await encoderSession.run({
    image: new ort.Tensor("float32", pixels, shape),
  });
  if (requestId !== latestEncodeRequestId) return;
  imageEmbedding = {
    high_res_feats_0: results[encoderSession.outputNames[0]],
    high_res_feats_1: results[encoderSession.outputNames[1]],
    image_embed: results[encoderSession.outputNames[2]],
  };
  imageEmbeddingRequestId = requestId;
  workerScope.postMessage({ type: "encoded", requestId });
}

async function decodeMask(
  requestId: number,
  points: SamPromptPoint[],
  previousMask?: Float32Array | null,
  previousMaskShape?: number[] | null,
) {
  if (!decoderSession || !imageEmbedding) throw new Error("Encode the image before selecting an icon.");
  if (requestId !== imageEmbeddingRequestId) throw new Error("The selected image is no longer encoded.");
  if (!points.length) throw new Error("At least one point is required.");
  report("decoding", "Refining icon mask locally");

  const candidates = await runDecoder(points, previousMask, previousMaskShape);
  const best = candidates.reduce((current, candidate) =>
    candidate.score > current.score ? candidate : current,
  );
  workerScope.postMessage(
    {
      type: "mask",
      requestId,
      mask: best.mask,
      width: best.width,
      height: best.height,
      score: best.score,
    },
    [best.mask.buffer],
  );
}

type DecoderMask = {
  mask: Float32Array;
  width: number;
  height: number;
  score: number;
  seedX: number;
  seedY: number;
  bbox: NormalizedBox;
};

async function runDecoder(
  points: SamPromptPoint[],
  previousMask?: Float32Array | null,
  previousMaskShape?: number[] | null,
): Promise<DecoderMask[]> {
  if (!decoderSession || !imageEmbedding) throw new Error("Encode the image before selecting an icon.");

  const coords = new Float32Array(points.length * 2);
  const labels = new Float32Array(points.length);
  points.forEach((point, index) => {
    coords[index * 2] = point.x;
    coords[index * 2 + 1] = point.y;
    labels[index] = point.label;
  });

  const maskInput = previousMask && previousMaskShape
    ? new ort.Tensor("float32", previousMask, previousMaskShape)
    : new ort.Tensor("float32", new Float32Array(256 * 256), [1, 1, 256, 256]);
  const hasMaskInput = new ort.Tensor(
    "float32",
    new Float32Array([previousMask && previousMaskShape ? 1 : 0]),
    [1],
  );
  const results = await decoderSession.run({
    ...imageEmbedding,
    point_coords: new ort.Tensor("float32", coords, [1, points.length, 2]),
    point_labels: new ort.Tensor("float32", labels, [1, points.length]),
    mask_input: maskInput,
    has_mask_input: hasMaskInput,
  });

  const masks = results.masks;
  const scores = results.iou_predictions;
  if (!masks || !scores || masks.dims.length !== 4) {
    throw new Error("SAM2 decoder returned an unexpected result.");
  }
  const maskCount = masks.dims[1];
  const maskWidth = masks.dims[3];
  const maskHeight = masks.dims[2];
  const scoreData = Array.from(await scores.getData() as Float32Array);
  const stride = maskWidth * maskHeight;
  const allMasks = await masks.getData() as Float32Array;
  const positivePoint = points.find((point) => point.label === 1) ?? points[0];
  return Array.from({ length: Math.min(maskCount, scoreData.length) }, (_, index) => {
    const mask = new Float32Array(stride);
    mask.set(allMasks.subarray(index * stride, (index + 1) * stride));
    const metrics = maskMetrics({ mask, width: maskWidth, height: maskHeight, score: scoreData[index] ?? 0, seedX: positivePoint.x, seedY: positivePoint.y, bbox: { x: 0, y: 0, w: 0, h: 0 } }, positivePoint);
    return {
      mask,
      width: maskWidth,
      height: maskHeight,
      score: scoreData[index] ?? 0,
      seedX: positivePoint.x,
      seedY: positivePoint.y,
      bbox: metrics.bbox,
    };
  });
}

function regionToPromptPoints(region: RegionPrompt): SamPromptPoint[] {
  return [
    { x: region.center.x, y: region.center.y, label: 1 },
    { x: region.box.x, y: region.box.y, label: 2 },
    { x: region.box.x + region.box.w, y: region.box.y + region.box.h, label: 3 },
  ];
}

function maskMetrics(candidate: DecoderMask, seed: SamPromptPoint) {
  let area = 0;
  let minX = candidate.width;
  let minY = candidate.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < candidate.height; y += 1) {
    const row = y * candidate.width;
    for (let x = 0; x < candidate.width; x += 1) {
      if (candidate.mask[row + x] <= 0) continue;
      area += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const total = candidate.width * candidate.height;
  const boxWidth = maxX >= minX ? maxX - minX + 1 : 0;
  const boxHeight = maxY >= minY ? maxY - minY + 1 : 0;
  const seedX = Math.min(candidate.width - 1, Math.max(0, Math.floor(seed.x / 1024 * candidate.width)));
  const seedY = Math.min(candidate.height - 1, Math.max(0, Math.floor(seed.y / 1024 * candidate.height)));
  return {
    areaRatio: area / Math.max(1, total),
    bboxRatio: boxWidth * boxHeight / Math.max(1, total),
    widthRatio: boxWidth / Math.max(1, candidate.width),
    heightRatio: boxHeight / Math.max(1, candidate.height),
    containsSeed: candidate.mask[seedY * candidate.width + seedX] > 0,
    bbox: {
      x: minX / Math.max(1, candidate.width),
      y: minY / Math.max(1, candidate.height),
      w: boxWidth / Math.max(1, candidate.width),
      h: boxHeight / Math.max(1, candidate.height),
    },
    stability: maskIoUAtThresholds(candidate.mask, -1, 0),
  };
}

function binaryMaskIou(left: DecoderMask, right: DecoderMask) {
  if (left.width !== right.width || left.height !== right.height) return 0;
  let intersection = 0;
  let union = 0;
  for (let index = 0; index < left.mask.length; index += 1) {
    const a = left.mask[index] > 0;
    const b = right.mask[index] > 0;
    if (a && b) intersection += 1;
    if (a || b) union += 1;
  }
  return union ? intersection / union : 0;
}

function isDuplicateCandidate(candidate: DecoderMask, accepted: DecoderMask[]) {
  return accepted.some((existing) =>
    binaryMaskIou(existing, candidate) >= 0.58
    || normalizedBoxIoU(existing.bbox, candidate.bbox) >= 0.72,
  );
}

function rankCandidate(candidate: DecoderMask, metrics: ReturnType<typeof maskMetrics>) {
  return candidate.score
    - Math.max(0, metrics.areaRatio - 0.08) * 1.8
    - Math.max(0, metrics.bboxRatio - 0.2)
    + metrics.stability * 0.12;
}

async function autoDecodeMasks(
  regions: RegionPrompt[],
  maxMasks = 6,
) {
  if (!decoderSession || !imageEmbedding) throw new Error("Encode the image before automatic extraction.");
  if (!regions.length) throw new Error("No likely foreground objects were found in this image.");
  const accepted: DecoderMask[] = [];
  const limit = Math.min(8, Math.max(1, Math.floor(maxMasks)));
  for (let index = 0; index < regions.length && accepted.length < limit; index += 1) {
    report("auto-decoding", `${index + 1}:${regions.length}`);
    const region = regions[index];
    const prompts = regionToPromptPoints(region);
    const decoded = await runDecoder(prompts);
    const eligible = decoded
      .map((candidate) => ({ candidate, metrics: maskMetrics(candidate, prompts[0]) }))
      .filter(({ candidate, metrics }) =>
        candidate.score >= 0.45 &&
        metrics.containsSeed &&
        metrics.stability >= 0.82 &&
        metrics.areaRatio >= 0.00045 &&
        metrics.areaRatio <= 0.24 &&
        metrics.bboxRatio <= 0.38 &&
        metrics.widthRatio <= 0.78 &&
        metrics.heightRatio <= 0.78,
      )
      .sort((left, right) => rankCandidate(right.candidate, right.metrics) - rankCandidate(left.candidate, left.metrics));
    const best = eligible[0]?.candidate;
    if (!best || isDuplicateCandidate(best, accepted)) continue;
    accepted.push(best);
  }
  workerScope.postMessage(
    {
      type: "auto-masks",
      masks: accepted,
    },
    accepted.map((candidate) => candidate.mask.buffer),
  );
}

workerScope.onmessage = (event) => {
  const request = event.data;
  if (request.type === "encode") latestEncodeRequestId = request.requestId;
  const task = request.type === "init"
    ? initialize()
    : request.type === "encode"
      ? encodeImage(request.pixels, request.shape, request.requestId)
      : request.type === "decode"
        ? decodeMask(request.requestId, request.points, request.previousMask, request.previousMaskShape)
        : request.type === "auto-decode"
          ? autoDecodeMasks(request.regions, request.maxMasks)
        : Promise.reject(new Error("Unknown SAM2 worker request."));
  void task.catch((error) => {
    const message = error instanceof Error ? error.message : "Local SAM2 inference failed.";
    console.error(error);
    workerScope.postMessage({
      type: "error",
      requestId: "requestId" in request ? request.requestId : undefined,
      message,
    });
  });
};
