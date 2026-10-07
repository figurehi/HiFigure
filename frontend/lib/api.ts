import {
  DiagramSkeletonResponse,
  FigureVariant,
  ReferenceItem,
  ReferenceRegion,
  RetrievalDomain,
  SearchGoal,
  SearchResponse,
  ReviewIssue,
  DiagramPlan,
  VectorizeImageResponse,
} from "./types";
import {
  resolveFigureVariantAssetUrls,
  resolveReferenceAssetUrls,
  resolveSearchResponseAssetUrls,
} from "./api-assets";
import type { StudyTask } from "./study-config";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const VARIANT_GENERATION_TIMEOUT_MS = 900_000;
const BACKEND_JOB_MISSING_RESTART_LIMIT = 3;

class ApiFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiFetchError";
  }
}

async function apiFetch<T>(path: string, init?: RequestInit, timeoutMs = 180_000): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const upstreamSignal = init?.signal;
  const abortFromUpstream = () => controller.abort();

  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      controller.abort();
    } else {
      upstreamSignal.addEventListener("abort", abortFromUpstream, { once: true });
    }
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      let detail = "";
      try {
        const payload = await response.json();
        detail = typeof payload?.detail === "string" ? payload.detail : "";
      } catch {
        detail = await response.text().catch(() => "");
      }
      throw new ApiFetchError(detail || `Request failed: ${response.status}`, response.status);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  }
}

export function searchReferences(query: {
  prompt: string;
  imageType?: string;
  searchGoal?: SearchGoal;
  excludeReferenceIds?: string[];
  limit?: number;
  offset?: number;
}): Promise<SearchResponse> {
  return apiFetch<SearchResponse>("/references/search", {
    method: "POST",
    body: JSON.stringify({
      prompt: query.prompt,
      searchGoal: query.searchGoal ?? "idea",
      imageType: query.imageType,
      excludeReferenceIds: query.excludeReferenceIds ?? [],
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    }),
  }).then((response) =>
    resolveSearchResponseAssetUrls(response, API_BASE),
  );
}

export type StudyLogBatchPayload = {
  participantId: string;
  sessionId: string;
  sessionStartedAt?: string | null;
  events: unknown[];
};

export type StudyOutputPayload = {
  participantId: string;
  sessionId: string;
  outputId: string;
  kind?: string;
  title?: string | null;
  imageDataUrl?: string | null;
  imageUrl?: string | null;
  textContent?: string | null;
  textFormat?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type StudyRecoveryArtifact = {
  receivedAt: string;
  sessionId: string;
  outputId: string;
  kind: "reference" | "skeleton" | "candidate" | "revision" | string;
  title?: string | null;
  imageUrl?: string | null;
  artifactPath?: string | null;
  artifactUrl?: string | null;
  textFormat?: string | null;
  textContent?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Participant study logging is best-effort and must never block the UI. */
export function recordStudyLogs(payload: StudyLogBatchPayload): Promise<{ stored: number }> {
  return apiFetch<{ stored: number }>("/study/logs", {
    method: "POST",
    body: JSON.stringify(payload),
  }, 20_000);
}

export function recordStudyOutput(payload: StudyOutputPayload): Promise<{ stored: boolean; imageFile: string | null }> {
  return apiFetch<{ stored: boolean; imageFile: string | null }>("/study/outputs", {
    method: "POST",
    body: JSON.stringify(payload),
  }, 30_000);
}

export function fetchStudyRecovery(
  participantId: string,
  sessionId?: string | null,
): Promise<{ artifacts: StudyRecoveryArtifact[] }> {
  const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
  return apiFetch<{ artifacts: StudyRecoveryArtifact[] }>(
    `/study/recovery/${encodeURIComponent(participantId)}${query}`,
    undefined,
    30_000,
  ).then((response) => ({
    artifacts: response.artifacts.map((artifact) => ({
      ...artifact,
      artifactUrl: artifact.artifactPath
        ? `${API_BASE}${artifact.artifactPath}`
        : artifact.imageUrl ?? null,
    })),
  }));
}

export function fetchStudyTasks(): Promise<StudyTask[]> {
  return apiFetch<StudyTask[]>("/study/tasks", undefined, 20_000);
}

export function moreLikeThis(
  referenceId: string,
  retrievalDomain?: RetrievalDomain,
  excludeReferenceIds: string[] = [],
): Promise<ReferenceItem[]> {
  const params = new URLSearchParams();
  if (retrievalDomain) {
    params.set("retrieval_domain", retrievalDomain);
  }
  for (const id of excludeReferenceIds) {
    params.append("exclude_reference_ids", id);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<ReferenceItem[]>(`/references/more-like-this/${referenceId}${suffix}`).then((items) =>
    items.map((item) => resolveReferenceAssetUrls(item, API_BASE)),
  );
}

export type VariantGenerationPayload = {
  prompt: string;
  referenceIds: string[];
  selectedReferenceId?: string | null;
  layoutReferenceId?: string | null;
  compositionMode?: "guided" | "locked_refine";
  baseReferenceId?: string | null;
  references?: ReferenceItem[];
  referenceRegions?: ReferenceRegion[];
  diagramSkeletonXml: string;
  annotationControlImageDataUrl?: string | null;
  editMaskImageDataUrl?: string | null;
  matchInstructions?: string | null;
};

/**
 * Waits on work the backend already owns. Because the generation runs off the
 * request, closing the page or switching stages mid-flight costs at most the
 * polling loop — the result is still waiting when the caller comes back.
 */
async function awaitJobResult<T, TProgress extends { version: number } = never>(
  readJob: (progressAfter?: number) => Promise<{
    status: string;
    result?: T | null;
    error?: string | null;
    progress?: TProgress | null;
  }>,
  {
    timeoutMs,
    intervalMs = 2_000,
    onProgress,
  }: {
    timeoutMs: number;
    intervalMs?: number;
    onProgress?: (progress: TProgress) => void;
  },
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let progressVersion = 0;
  for (;;) {
    const job = await readJob(progressVersion);
    if (job.progress && job.progress.version > progressVersion) {
      progressVersion = job.progress.version;
      onProgress?.(job.progress);
    }
    if (job.status === "succeeded" && job.result != null) return job.result;
    if (job.status === "failed") {
      throw new Error(job.error || "Generation failed on the server.");
    }
    if (Date.now() >= deadline) {
      throw new Error("Generation is still running on the server. Check back in a moment.");
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * The development backend keeps jobs in memory, so a hot reload can erase a
 * job while the browser is polling it. Re-submit the same payload a bounded
 * number of times; other errors still surface immediately.
 */
async function awaitRestartableJob<T, TProgress extends { version: number } = never>(
  startJob: () => Promise<{ jobId: string }>,
  readJob: (jobId: string, progressAfter?: number) => Promise<{
    status: string;
    result?: T | null;
    error?: string | null;
    progress?: TProgress | null;
  }>,
  timeoutMs: number,
  onProgress?: (progress: TProgress) => void,
): Promise<T> {
  let started = await startJob();
  let missingRestartCount = 0;
  for (;;) {
    try {
      return await awaitJobResult(
        (progressAfter) => readJob(started.jobId, progressAfter),
        { timeoutMs, onProgress },
      );
    } catch (error) {
      if (
        !(error instanceof ApiFetchError) ||
        error.status !== 404 ||
        missingRestartCount >= BACKEND_JOB_MISSING_RESTART_LIMIT
      ) {
        throw error;
      }
      missingRestartCount += 1;
      started = await startJob();
    }
  }
}

export async function generateVariants(
  payload: VariantGenerationPayload,
  onProgress?: (progress: VariantGenerationProgress) => void,
): Promise<FigureVariant[]> {
  return awaitRestartableJob(
    () => startVariantGenerationJob(payload),
    getVariantGenerationJob,
    VARIANT_GENERATION_TIMEOUT_MS,
    onProgress,
  );
}

export type VariantGenerationProgress = {
  version: number;
  phase: "draft_streaming" | "refining" | "completed";
  label: string;
  passIndex: number;
  passCount: number;
  previewKind?: "partial" | "draft" | "final" | null;
  partialImageIndex?: number | null;
  stable: boolean;
  previewImageUrl?: string | null;
  previewImageDataUrl?: string | null;
};

export type VariantGenerationJob = {
  jobId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  result?: FigureVariant[] | null;
  error?: string | null;
  progress?: VariantGenerationProgress | null;
};

/**
 * Queuing is cheap on the backend, but this request uploads the annotated
 * control image and its source figure, so it needs a full upload budget.
 */
export function startVariantGenerationJob(
  payload: VariantGenerationPayload,
): Promise<Pick<VariantGenerationJob, "jobId" | "status">> {
  return apiFetch<Pick<VariantGenerationJob, "jobId" | "status">>("/figures/variants/jobs", {
    method: "POST",
    body: JSON.stringify(payload),
  }, 180_000);
}

export function getVariantGenerationJob(
  jobId: string,
  progressAfter = 0,
): Promise<VariantGenerationJob> {
  // The poll that finds the job finished downloads the rendered PNGs with it.
  const query = progressAfter > 0 ? `?progress_after=${progressAfter}` : "";
  return apiFetch<VariantGenerationJob>(`/figures/variants/jobs/${encodeURIComponent(jobId)}${query}`, undefined, 120_000).then(
    (job) => ({
      ...job,
      result: job.result?.map((variant) => resolveFigureVariantAssetUrls(variant, API_BASE)) ?? null,
    }),
  );
}

export async function generateDiagramSkeleton(payload: {
  prompt: string;
  references: ReferenceItem[];
}): Promise<DiagramSkeletonResponse> {
  return awaitRestartableJob(
    () => startDiagramSkeletonJob(payload),
    getDiagramSkeletonJob,
    600_000,
  );
}

export type DiagramSkeletonJob = {
  jobId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  result?: DiagramSkeletonResponse | null;
  error?: string | null;
};

/**
 * Skeletons take minutes, so the work is queued on the backend and polled;
 * leaving the Layout page no longer cancels the request that was in flight.
 */
export function startDiagramSkeletonJob(payload: {
  prompt: string;
  references: ReferenceItem[];
}): Promise<Pick<DiagramSkeletonJob, "jobId" | "status">> {
  return apiFetch<Pick<DiagramSkeletonJob, "jobId" | "status">>("/figures/skeleton/jobs", {
    method: "POST",
    body: JSON.stringify(payload),
  }, 120_000);
}

export function getDiagramSkeletonJob(jobId: string): Promise<DiagramSkeletonJob> {
  return apiFetch<DiagramSkeletonJob>(
    `/figures/skeleton/jobs/${encodeURIComponent(jobId)}`,
    undefined,
    60_000,
  );
}

export function refineDiagramSkeletonRegion(payload: {
  prompt: string;
  diagramPlan: DiagramPlan;
  targetIds: string[];
  scope?: "region" | "whole";
  brief?: string;
  /** Current draw.io XML; backend preserves cells that the requested edit does not change. */
  xml?: string;
}): Promise<DiagramSkeletonResponse & { changedIds?: string[] }> {
  return apiFetch<DiagramSkeletonResponse & { changedIds?: string[] }>("/figures/skeleton/refine-region", {
    method: "POST",
    body: JSON.stringify(payload),
  }, 300_000);
}

export type StyleAnalysisResponse = {
  fonts: { id: string; confidence?: number | null; reason?: string | null }[];
  typographyNote?: string | null;
};

/** Rank the installed font catalog from lettering visible in the Style image. */
export function analyzeStyleReference(payload: {
  imageDataUrl: string;
  fontOptions: { id: string; label: string; tone?: string; description?: string }[];
  referenceTitle?: string;
}): Promise<StyleAnalysisResponse> {
  return apiFetch<StyleAnalysisResponse>("/style/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  }, 120_000);
}

export function reviewFigure(payload: {
  diagramPlan: DiagramPlan | null;
}): Promise<ReviewIssue[]> {
  return apiFetch<ReviewIssue[]>("/figures/review", {
    method: "POST",
    body: JSON.stringify(payload),
  }, 120_000);
}

export function vectorizeImage(payload: {
  imageDataUrl?: string | null;
  imageUrl?: string | null;
}): Promise<VectorizeImageResponse> {
  return apiFetch<VectorizeImageResponse>("/images/vectorize", {
    method: "POST",
    body: JSON.stringify(payload),
  }, 240_000);
}
