"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { resolveApiAssetUrl } from "../lib/api-assets";
import {
  createSam2RequestId,
  getSam2ReadyDevice,
  preloadSam2,
  type Sam2WorkerResponse,
} from "../lib/sam2-client";
import {
  createLetterboxTransform,
  logitsToSoftAlpha,
  maskBoundsFromLogits,
  normalizedPointToModel,
  refineMaskLogits,
  type LetterboxTransform,
  type NormalizedBox,
  type SamPoint,
} from "../lib/sam-icon-utils";

const MODEL_SIZE = 1024;
const MODEL_DOWNLOAD_MB = 151;
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

async function resolveImageSrcToDataUrl(src: string): Promise<string | null> {
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:image/")) return trimmed;

  const resolved = resolveApiAssetUrl(trimmed, API_BASE) ?? trimmed;
  try {
    const response = await fetch(resolved, { mode: "cors", cache: "no-store" });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") && blob.size === 0) return null;
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export type SamIconExtractionResult = {
  cropDataUrl: string;
  bbox: NormalizedBox;
  label: string;
  confidence: number | null;
};

export type SamIconExtractionStatus = {
  message: string;
  busy: boolean;
  device: "webgpu" | "wasm" | null;
  error: string | null;
};

type SamIconExtractorProps = {
  imageSrc: string;
  sourceTitle: string;
  /** Render inside the page instead of a modal dialog. */
  inline?: boolean;
  open?: boolean;
  preload?: boolean;
  showStatus?: boolean;
  onClose?: () => void;
  onExtract: (result: SamIconExtractionResult) => void;
  onStatusChange?: (status: SamIconExtractionStatus) => void;
};

type MaskPayload = {
  logits: Float32Array;
  width: number;
  height: number;
  seeds: Array<{ x: number; y: number }>;
};

function canvasToTensor(canvas: HTMLCanvasElement) {
  const pixels = canvas.getContext("2d", { willReadFrequently: true })?.getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  ).data;
  if (!pixels) throw new Error("Unable to read the selected image.");
  const plane = canvas.width * canvas.height;
  const values = new Float32Array(plane * 3);
  for (let index = 0, pixel = 0; pixel < plane; pixel += 1, index += 4) {
    values[pixel] = pixels[index] / 255;
    values[plane + pixel] = pixels[index + 1] / 255;
    values[plane * 2 + pixel] = pixels[index + 2] / 255;
  }
  return { pixels: values, shape: [1, 3, canvas.height, canvas.width] };
}

function createMaskCanvas(
  logits: Float32Array,
  width: number,
  height: number,
  transform: LetterboxTransform,
  targetWidth: number,
  targetHeight: number,
  seeds: Array<{ x: number; y: number }>,
  // White is required for destination-in alpha compositing; the preview
  // overlay passes a visible tint instead.
  tint: { r: number; g: number; b: number } = { r: 255, g: 255, b: 255 },
) {
  const refined = refineMaskLogits(logits, width, height, seeds);
  const alpha = logitsToSoftAlpha(refined);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < alpha.length; index += 1) {
    const value = alpha[index];
    if (value <= 4) continue;
    const target = index * 4;
    rgba[target] = tint.r;
    rgba[target + 1] = tint.g;
    rgba[target + 2] = tint.b;
    rgba[target + 3] = value;
  }
  const modelMask = document.createElement("canvas");
  modelMask.width = width;
  modelMask.height = height;
  modelMask.getContext("2d")?.putImageData(new ImageData(rgba, width, height), 0, 0);

  const sourceMask = document.createElement("canvas");
  sourceMask.width = targetWidth;
  sourceMask.height = targetHeight;
  const context = sourceMask.getContext("2d");
  if (!context) return sourceMask;
  const scaleX = width / transform.size;
  const scaleY = height / transform.size;
  context.imageSmoothingEnabled = true;
  context.drawImage(
    modelMask,
    transform.x * scaleX,
    transform.y * scaleY,
    transform.w * scaleX,
    transform.h * scaleY,
    0,
    0,
    targetWidth,
    targetHeight,
  );
  return sourceMask;
}

function expandBox(box: NormalizedBox, width: number, height: number): NormalizedBox {
  const padX = Math.max(4 / Math.max(1, width), box.w * 0.035);
  const padY = Math.max(4 / Math.max(1, height), box.h * 0.035);
  const x = Math.max(0, box.x - padX);
  const y = Math.max(0, box.y - padY);
  return {
    x,
    y,
    w: Math.min(1 - x, box.w + padX * 2),
    h: Math.min(1 - y, box.h + padY * 2),
  };
}

export function SamIconExtractor({
  imageSrc,
  sourceTitle,
  inline = false,
  open = true,
  preload = false,
  showStatus = true,
  onClose,
  onExtract,
  onStatusChange,
}: SamIconExtractorProps) {
  const workerRef = useRef<Worker | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const modelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const transformRef = useRef<LetterboxTransform | null>(null);
  const pointsRef = useRef<SamPoint[]>([]);
  const maskRef = useRef<MaskPayload | null>(null);
  const pendingEncodeRef = useRef(false);
  const preloadRequestedRef = useRef(false);
  const imageRequestIdRef = useRef(0);
  const onExtractRef = useRef(onExtract);
  const onStatusChangeRef = useRef(onStatusChange);
  const pickCounterRef = useRef(0);
  const [imageReady, setImageReady] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [imageEncoded, setImageEncoded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<"webgpu" | "wasm" | null>(null);
  const [status, setStatus] = useState("Preparing…");
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<SamPoint[]>([]);
  const [maskVersion, setMaskVersion] = useState(0);

  useEffect(() => {
    onExtractRef.current = onExtract;
  }, [onExtract]);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    onStatusChangeRef.current?.({ message: status, busy, device, error });
  }, [busy, device, error, status]);

  const renderPreview = useCallback(() => {
    const source = sourceCanvasRef.current;
    const display = displayCanvasRef.current;
    if (!source || !display) return;
    display.width = source.width;
    display.height = source.height;
    const context = display.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, display.width, display.height);
    context.drawImage(source, 0, 0);

    const mask = maskRef.current;
    const transform = transformRef.current;
    if (mask && transform) {
      const sourceMask = createMaskCanvas(
        mask.logits,
        mask.width,
        mask.height,
        transform,
        source.width,
        source.height,
        mask.seeds,
        { r: 19, g: 178, b: 148 },
      );
      context.save();
      context.globalAlpha = 0.52;
      context.drawImage(sourceMask, 0, 0);
      context.restore();
    }

    const radius = Math.max(5, Math.min(source.width, source.height) * 0.012);
    for (const point of pointsRef.current) {
      context.beginPath();
      context.arc(point.x * source.width, point.y * source.height, radius, 0, Math.PI * 2);
      context.fillStyle = "#14b88f";
      context.fill();
      context.lineWidth = Math.max(2, radius * 0.25);
      context.strokeStyle = "#ffffff";
      context.stroke();
    }
  }, []);

  const extractCropFromMask = useCallback((mask: MaskPayload) => {
    const source = sourceCanvasRef.current;
    const transform = transformRef.current;
    if (!source || !transform) return null;
    const rawBox = maskBoundsFromLogits(mask.logits, mask.width, mask.height, transform);
    if (!rawBox) return null;
    const bbox = expandBox(rawBox, source.width, source.height);
    const x = Math.max(0, Math.floor(bbox.x * source.width));
    const y = Math.max(0, Math.floor(bbox.y * source.height));
    const right = Math.min(source.width, Math.ceil((bbox.x + bbox.w) * source.width));
    const bottom = Math.min(source.height, Math.ceil((bbox.y + bbox.h) * source.height));
    const width = Math.max(1, right - x);
    const height = Math.max(1, bottom - y);
    const sourceMask = createMaskCanvas(
      mask.logits,
      mask.width,
      mask.height,
      transform,
      source.width,
      source.height,
      mask.seeds,
    );
    const crop = document.createElement("canvas");
    crop.width = width;
    crop.height = height;
    const context = crop.getContext("2d");
    if (!context) return null;
    context.drawImage(source, x, y, width, height, 0, 0, width, height);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(sourceMask, x, y, width, height, 0, 0, width, height);
    return { cropDataUrl: crop.toDataURL("image/png"), bbox };
  }, []);

  const encodeCurrentImage = useCallback(() => {
    const worker = workerRef.current;
    const canvas = modelCanvasRef.current;
    if (!worker || !canvas) return;
    try {
      const tensor = canvasToTensor(canvas);
      worker.postMessage({
        type: "encode",
        requestId: imageRequestIdRef.current,
        ...tensor,
      }, [tensor.pixels.buffer]);
      setBusy(true);
      setStatus("Encoding this image locally…");
      setError(null);
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof Error ? caught.message : "Unable to encode this image.");
    }
  }, []);

  const requestMask = useCallback((point: SamPoint) => {
    const worker = workerRef.current;
    const transform = transformRef.current;
    if (!worker || !transform) return;
    worker.postMessage({
      type: "decode",
      requestId: imageRequestIdRef.current,
      points: [normalizedPointToModel(point, transform)],
      previousMask: null,
      previousMaskShape: null,
    });
    setBusy(true);
    setStatus("Extracting the clicked icon locally…");
    setError(null);
  }, []);

  useEffect(() => {
    const worker = preloadSam2();
    workerRef.current = worker;
    const handleMessage = (event: MessageEvent<Sam2WorkerResponse>) => {
      const response = event.data;
      if (response.type === "status") {
        setBusy(true);
        if (response.phase === "model-download") {
          const [loadedRaw, totalRaw] = response.detail?.split(":") ?? [];
          const loaded = Number(loadedRaw);
          const total = Number(totalRaw);
          const percent = Number.isFinite(loaded) && Number.isFinite(total) && total > 0
            ? Math.min(100, Math.round((loaded / total) * 100))
            : null;
          setStatus(
            percent === null
              ? `Downloading model (${MODEL_DOWNLOAD_MB} MB, once)…`
              : `Loading model… ${percent}%`,
          );
        } else if (response.phase === "model-cache") {
          setStatus("Loading cached model…");
        } else if (response.phase === "session-loading") {
          setStatus("Starting…");
        } else if (response.phase === "cache-unavailable") {
          setStatus(response.detail ?? "Model cache unavailable.");
        } else if (response.phase === "encoding") {
          setStatus("Preparing image…");
        } else if (response.phase === "decoding") {
          setStatus("Extracting…");
        }
        return;
      }
      if (response.type === "ready") {
        setModelReady(true);
        setDevice(response.device);
        setBusy(false);
        setStatus("Model ready.");
        if (pendingEncodeRef.current) {
          pendingEncodeRef.current = false;
          encodeCurrentImage();
        }
        return;
      }
      if (response.type === "encoded") {
        if (response.requestId !== imageRequestIdRef.current) return;
        setImageEncoded(true);
        setBusy(false);
        setStatus("Ready — click an icon to extract it.");
        return;
      }
      if (response.type === "mask") {
        if (response.requestId !== imageRequestIdRef.current) return;
        const transform = transformRef.current;
        const clicked = pointsRef.current[0] ?? null;
        const seeds = transform && clicked
          ? [(() => {
              const model = normalizedPointToModel(clicked, transform);
              return {
                x: model.x / MODEL_SIZE * response.width,
                y: model.y / MODEL_SIZE * response.height,
              };
            })()]
          : [{ x: response.width / 2, y: response.height / 2 }];
        const payload: MaskPayload = {
          logits: response.mask,
          width: response.width,
          height: response.height,
          seeds,
        };
        maskRef.current = payload;
        setMaskVersion((version) => version + 1);
        setBusy(false);
        const crop = extractCropFromMask(payload);
        if (crop) {
          pickCounterRef.current += 1;
          onExtractRef.current({
            cropDataUrl: crop.cropDataUrl,
            bbox: crop.bbox,
            confidence: response.score ?? 0,
            label: `Extracted icon ${pickCounterRef.current}`,
          });
          pointsRef.current = [];
          maskRef.current = null;
          setPoints([]);
          setMaskVersion((version) => version + 1);
          setStatus("Added. Click more icons or confirm the selection with Done.");
        } else {
          setStatus("No clean cutout — try clicking the icon center.");
        }
        return;
      }
      if (response.type === "error") {
        if (response.requestId && response.requestId !== imageRequestIdRef.current) return;
        pendingEncodeRef.current = false;
        setBusy(false);
        setError(response.message);
        setStatus("Local extraction stopped.");
      }
    };
    const handleError = () => {
      setBusy(false);
      setError("The local SAM2 worker could not start. Check browser WebGPU/WASM support.");
    };
    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    const preloadedDevice = getSam2ReadyDevice();
    if (preloadedDevice) {
      setModelReady(true);
      setDevice(preloadedDevice);
      setStatus("Model ready.");
    }
    return () => {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      workerRef.current = null;
    };
  }, [encodeCurrentImage, extractCropFromMask]);

  useEffect(() => {
    if (!imageSrc) return;
    imageRequestIdRef.current = createSam2RequestId();
    let cancelled = false;
    preloadRequestedRef.current = false;
    setImageReady(false);
    setImageEncoded(false);
    setError(null);
    pickCounterRef.current = 0;
    pointsRef.current = [];
    maskRef.current = null;
    setPoints([]);
    setMaskVersion((version) => version + 1);
    setBusy(true);
    setStatus("Loading image…");

    void (async () => {
      const dataUrl = await resolveImageSrcToDataUrl(imageSrc);
      if (cancelled) return;
      if (!dataUrl) {
        setBusy(false);
        setError("The selected reference image could not be loaded for local extraction.");
        setStatus("Image unavailable.");
        return;
      }

      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        if (!image.naturalWidth || !image.naturalHeight) {
          setBusy(false);
          setError("The selected reference image could not be loaded for local extraction.");
          setStatus("Image unavailable.");
          return;
        }
        const source = document.createElement("canvas");
        source.width = image.naturalWidth;
        source.height = image.naturalHeight;
        const sourceContext = source.getContext("2d");
        if (!sourceContext) {
          setBusy(false);
          setError("Unable to prepare this image.");
          return;
        }
        sourceContext.drawImage(image, 0, 0);
        const transform = createLetterboxTransform(image.naturalWidth, image.naturalHeight, MODEL_SIZE);
        const model = document.createElement("canvas");
        model.width = MODEL_SIZE;
        model.height = MODEL_SIZE;
        const modelContext = model.getContext("2d");
        if (!modelContext) {
          setBusy(false);
          setError("Unable to prepare the SAM2 input canvas.");
          return;
        }
        modelContext.fillStyle = "#000000";
        modelContext.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE);
        modelContext.drawImage(image, transform.x, transform.y, transform.w, transform.h);
        sourceCanvasRef.current = source;
        modelCanvasRef.current = model;
        transformRef.current = transform;
        setBusy(false);
        setImageReady(true);
        setStatus("Image ready.");
        requestAnimationFrame(renderPreview);
      };
      image.onerror = () => {
        if (cancelled) return;
        setBusy(false);
        setError("The selected reference image could not be loaded for local extraction.");
        setStatus("Image unavailable.");
      };
      // Data URLs must not set crossOrigin — that can fail the load in some browsers.
      image.src = dataUrl;
    })();

    return () => {
      cancelled = true;
    };
  }, [imageSrc, renderPreview]);

  // `open` and `imageReady` matter here: with preload the image can finish
  // loading while the dialog is closed, so the first paint happens on open.
  useEffect(() => {
    if (!open && !inline) return;
    renderPreview();
  }, [imageReady, inline, maskVersion, open, points, renderPreview]);

  useEffect(() => {
    if (inline || !open || !onClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inline, onClose, open]);

  const loadAndEncode = useCallback(() => {
    if (!imageReady || !workerRef.current) return;
    if (modelReady) {
      encodeCurrentImage();
      return;
    }
    pendingEncodeRef.current = true;
    setBusy(true);
    setStatus("Loading model…");
    setError(null);
    preloadSam2();
  }, [encodeCurrentImage, imageReady, modelReady]);

  // Encode as soon as the image is ready: inline usage preloads in the
  // background, and the dialog starts on open so clicking works right away.
  useEffect(() => {
    if (!imageReady || preloadRequestedRef.current || imageEncoded) return;
    if (!preload && !open) return;
    preloadRequestedRef.current = true;
    loadAndEncode();
  }, [imageEncoded, imageReady, loadAndEncode, open, preload]);

  function pickIcon(event: ReactMouseEvent<HTMLCanvasElement>) {
    event.preventDefault();
    if (!imageEncoded || busy) return;
    const canvas = displayCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const point: SamPoint = {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
      label: 1,
    };
    // Each click is an independent selection.
    pointsRef.current = [point];
    setPoints([point]);
    requestMask(point);
  }

  if (!inline && !open) return null;

  const body = (
    <div className={`sam-icon-extractor-layout${showStatus ? " has-status" : ""}`}>
      <div className="sam-icon-extractor-canvas-wrap">
        <canvas
          ref={displayCanvasRef}
          className={imageEncoded ? "is-interactive" : ""}
          aria-label="Image for local icon click selection"
          onClick={pickIcon}
          onContextMenu={(event) => event.preventDefault()}
        />
        {!imageEncoded ? (
          <div className="sam-icon-extractor-canvas-note">
            {imageReady ? "Preparing local extraction…" : "Preparing image…"}
          </div>
        ) : null}
      </div>

      {showStatus ? <aside className="sam-icon-extractor-controls">
        <div className="sam-icon-extractor-status" aria-live="polite">
          <span className={busy ? "is-busy" : ""} aria-hidden="true" />
          <div>
            <strong>{status}</strong>
            {device ? <small>Inference: {device === "webgpu" ? "WebGPU" : "CPU/WASM"}</small> : null}
          </div>
        </div>

        {error ? <p className="sam-icon-extractor-error" role="alert">{error}</p> : null}

      </aside> : null}
    </div>
  );

  if (inline) {
    return (
      <div className="sam-icon-extractor-inline">
        {body}
      </div>
    );
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="sam-icon-extractor-backdrop" role="presentation" onClick={onClose}>
      <section
        className="sam-icon-extractor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sam-icon-extractor-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sam-icon-extractor-head">
          <div>
            <span className="label-text">Local icon extraction</span>
            <h2 id="sam-icon-extractor-title">Extract icons from “{sourceTitle}”</h2>
            <p>Click each icon once to collect it. Everything runs locally in this browser.</p>
          </div>
          {onClose ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close local icon extractor">
              Close
            </button>
          ) : null}
        </header>
        {body}
      </section>
    </div>,
    document.body,
  );
}
