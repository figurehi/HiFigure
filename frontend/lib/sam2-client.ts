"use client";

export type Sam2Device = "webgpu" | "wasm";

export type Sam2WorkerResponse =
  | { type: "status"; phase: string; detail?: string }
  | { type: "ready"; device: Sam2Device }
  | { type: "encoded"; requestId: number }
  | { type: "mask"; requestId: number; mask: Float32Array; width: number; height: number; score: number | null }
  | { type: "error"; requestId?: number; message: string };

let worker: Worker | null = null;
let initializationState: "idle" | "loading" | "ready" = "idle";
let readyDevice: Sam2Device | null = null;
let requestCounter = 0;

function createSam2Worker() {
  const instance = new Worker(new URL("../workers/sam2.worker.ts", import.meta.url), {
    type: "module",
  });
  instance.addEventListener("message", (event: MessageEvent<Sam2WorkerResponse>) => {
    if (event.data.type === "ready") {
      readyDevice = event.data.device;
      initializationState = "ready";
    } else if (event.data.type === "error" && initializationState === "loading") {
      // Permit a later extractor visit to retry a failed startup.
      initializationState = "idle";
    }
  });
  instance.addEventListener("error", () => {
    if (initializationState === "loading") initializationState = "idle";
  });
  return instance;
}

export function getSam2Worker() {
  if (!worker) worker = createSam2Worker();
  return worker;
}

export function getSam2ReadyDevice() {
  return readyDevice;
}

export function createSam2RequestId() {
  requestCounter += 1;
  return requestCounter;
}

/** Start downloading and initializing SAM2 once for the lifetime of the app. */
export function preloadSam2() {
  const instance = getSam2Worker();
  if (initializationState === "idle") {
    initializationState = "loading";
    instance.postMessage({ type: "init" });
  }
  return instance;
}
