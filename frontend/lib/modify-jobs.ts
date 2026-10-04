"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { getVariantGenerationJob } from "./api";
import { appendFigureHistoryEntries, compareIdsForModifyHistory } from "./figure-history";
import type { FigureVariant } from "./types";
import {
  useWorkspaceState,
  type CreativeCanvasItem,
  type CreativeCanvasState,
  type WorkspaceState,
} from "./workspace-state";

/**
 * Edit revisions run as backend jobs, so a run outlives the dialog that started
 * it. This store keeps the pending list and the watcher registry outside React,
 * which lets the Candidate page report a revision that is still in flight after
 * the editor has been dismissed.
 */
export type PendingModifyJob = {
  jobId: string;
  sourceVariantId: string;
  sourceTitle: string;
  revisionSourceVariantId: string;
  createdAt: number;
  userId: string | null;
  studySessionId: string | null;
};

export type ModifyJobWorkspaceOwner = {
  userId: string | null;
  studySessionId: string | null;
};

const storageKey = "hichart-editor-pending-modify-jobs-v1";
export const PENDING_MODIFY_JOB_EXPIRY_MS = 30 * 60 * 1000;
const emptyJobs: PendingModifyJob[] = [];
const listeners = new Set<() => void>();
const watchedJobIds = new Set<string>();

let cachedJobs: PendingModifyJob[] | null = null;

function parseStoredJobs(raw: string | null): PendingModifyJob[] | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.flatMap((job): PendingModifyJob[] => {
      if (
        !job ||
        typeof job.jobId !== "string" ||
        typeof job.sourceVariantId !== "string" ||
        typeof job.sourceTitle !== "string" ||
        typeof job.revisionSourceVariantId !== "string" ||
        typeof job.createdAt !== "number"
      ) {
        return [];
      }
      return [{
        jobId: job.jobId,
        sourceVariantId: job.sourceVariantId,
        sourceTitle: job.sourceTitle,
        revisionSourceVariantId: job.revisionSourceVariantId,
        createdAt: job.createdAt,
        userId: typeof job.userId === "string" ? job.userId : null,
        studySessionId: typeof job.studySessionId === "string" ? job.studySessionId : null,
      }];
    });
  } catch {
    return null;
  }
}

function browserStorage(kind: "localStorage" | "sessionStorage"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window[kind];
  } catch {
    return null;
  }
}

function readStorageValue(storage: Storage | null): string | null {
  try {
    return storage?.getItem(storageKey) ?? null;
  } catch {
    return null;
  }
}

function readFromStorage(): PendingModifyJob[] {
  // A quota failure writes the latest snapshot to sessionStorage. Prefer it so
  // an older localStorage value cannot resurrect a job that has since settled.
  const sessionJobs = parseStoredJobs(readStorageValue(browserStorage("sessionStorage")));
  if (sessionJobs) return sessionJobs;
  return parseStoredJobs(readStorageValue(browserStorage("localStorage"))) ?? emptyJobs;
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function pendingModifyJobs(): PendingModifyJob[] {
  if (!cachedJobs) cachedJobs = readFromStorage();
  return cachedJobs;
}

function writePendingModifyJobs(jobs: PendingModifyJob[]) {
  cachedJobs = jobs.filter((job) => !isPendingModifyJobExpired(job)).slice(-12);
  const payload = JSON.stringify(cachedJobs);
  const local = browserStorage("localStorage");
  const session = browserStorage("sessionStorage");
  let localError: unknown = null;
  let persistedLocally = false;

  if (local) {
    try {
      local.setItem(storageKey, payload);
      persistedLocally = true;
    } catch (error) {
      localError = error;
    }
  }

  if (persistedLocally) {
    // A successful durable write supersedes a previous quota fallback.
    try {
      session?.removeItem(storageKey);
    } catch {
      // The local copy is already current, so a cleanup failure is harmless.
    }
  } else if (session) {
    try {
      // sessionStorage has a separate lifetime and commonly remains writable
      // when the origin's durable localStorage quota has been exhausted.
      session.setItem(storageKey, payload);
      localError = null;
    } catch (sessionError) {
      // The live in-memory list still lets the reconciler watch a backend job.
      // Persistence is best-effort and must never turn a successfully started
      // generation job into a UI failure.
      console.warn("Pending modify jobs could not be persisted; tracking them in memory", {
        localError,
        sessionError,
      });
    }
  }
  notify();
}

export function upsertPendingModifyJob(job: PendingModifyJob) {
  writePendingModifyJobs([...pendingModifyJobs().filter((item) => item.jobId !== job.jobId), job]);
}

export function removePendingModifyJob(jobId: string) {
  writePendingModifyJobs(pendingModifyJobs().filter((job) => job.jobId !== jobId));
}

export function subscribeModifyJobs(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isModifyJobWatched(jobId: string) {
  return watchedJobIds.has(jobId);
}

export function setModifyJobWatched(jobId: string, watched: boolean) {
  if (watched) watchedJobIds.add(jobId);
  else watchedJobIds.delete(jobId);
  notify();
}

export function watchedModifyJobCount() {
  return watchedJobIds.size;
}

export function usePendingModifyJobs(): PendingModifyJob[] {
  return useSyncExternalStore(subscribeModifyJobs, pendingModifyJobs, () => emptyJobs);
}

export function useWatchedModifyJobCount(): number {
  return useSyncExternalStore(subscribeModifyJobs, watchedModifyJobCount, () => 0);
}

export function isPendingModifyJobExpired(job: PendingModifyJob, now = Date.now()): boolean {
  return now - job.createdAt > PENDING_MODIFY_JOB_EXPIRY_MS;
}

function normalizedUserId(userId: string | null | undefined) {
  return userId?.trim().toLowerCase() || null;
}

export function pendingModifyJobBelongsToWorkspace(
  job: PendingModifyJob,
  owner: ModifyJobWorkspaceOwner,
): boolean {
  return normalizedUserId(job.userId) === normalizedUserId(owner.userId)
    && (job.studySessionId ?? null) === (owner.studySessionId ?? null);
}

function modifyJobOwnerFromWorkspace(
  state: Pick<WorkspaceState, "studyProfile" | "studySessionId">,
): ModifyJobWorkspaceOwner {
  return {
    userId: state.studyProfile?.userId ?? null,
    studySessionId: state.studySessionId,
  };
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isMissingGenerationJobError(error: unknown) {
  return error instanceof Error && error.message.toLowerCase().includes("generation job not found");
}

function fignumLetter(index: number) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return letters[index] ?? `${index + 1}`;
}

function maxCanvasZ(items: CreativeCanvasItem[]) {
  return items.reduce((max, item) => Math.max(max, item.z), 0);
}

const creativeCanvasHeight = 920;
const revisionOutputWidth = 470;
const revisionOutputHeight = 320;

export function integrateModifyJobResult(
  current: WorkspaceState,
  generated: FigureVariant[],
  pending: PendingModifyJob,
): WorkspaceState {
  if (!pendingModifyJobBelongsToWorkspace(pending, modifyJobOwnerFromWorkspace(current))) {
    return current;
  }
  if (current.studySessionStatus === "finished") return current;
  if (generated.length === 0) {
    return { ...current, status: "Modify job finished without a generated image." };
  }

  const sourceVariant = current.variants.find((variant) => variant.id === pending.sourceVariantId);
  const sourceTitle = sourceVariant?.title ?? pending.sourceTitle;
  const existingIds = new Set(current.variants.map((variant) => variant.id));
  const revised = generated
    .map((variant, index) => ({
      ...variant,
      id: `modify-${pending.jobId}-${index + 1}-${variant.id}`,
      title: `${sourceTitle} revision ${fignumLetter(index)}`,
      sourceVariantId: pending.revisionSourceVariantId,
    }))
    .filter((variant) => !existingIds.has(variant.id));

  if (revised.length === 0) {
    return { ...current, status: "Modify job result is already in the workspace." };
  }

  const canvas = current.creativeCanvas;
  const existingSource = canvas.items.find(
    (item) => item.type === "output" && item.variantId === pending.sourceVariantId,
  );
  const sourceItem: CreativeCanvasItem =
    existingSource ?? {
      id: `canvas-output-${pending.sourceVariantId}`,
      type: "output",
      variantId: pending.sourceVariantId,
      x: 760,
      y: 180,
      w: revisionOutputWidth,
      h: revisionOutputHeight,
      z: maxCanvasZ(canvas.items) + 1,
    };
  const baseItems = existingSource ? canvas.items : [...canvas.items, sourceItem];
  const withoutExistingRevisions = baseItems.filter(
    (item) => !revised.some((variant) => item.type === "output" && item.variantId === variant.id),
  );
  const startX = Math.max(0, sourceItem.x + sourceItem.w + 56);
  const startY = Math.max(
    0,
    Math.min(
      creativeCanvasHeight - revisionOutputHeight,
      sourceItem.y - Math.max(0, revised.length - 1) * 44,
    ),
  );
  let z = maxCanvasZ(withoutExistingRevisions);
  const revisionItems: CreativeCanvasItem[] = revised.map((variant, index) => ({
    id: `canvas-output-${variant.id}`,
    type: "output",
    variantId: variant.id,
    sourceVariantId: pending.sourceVariantId,
    x: startX,
    y: Math.max(
      0,
      Math.min(creativeCanvasHeight - revisionOutputHeight, startY + index * 92),
    ),
    w: revisionOutputWidth,
    h: revisionOutputHeight,
    z: ++z,
  }));
  const nextCreativeCanvas: CreativeCanvasState = {
    ...canvas,
    items: [...withoutExistingRevisions, ...revisionItems],
    selectedItemId: revisionItems[0]?.id ?? sourceItem.id,
    selectedItemIds: revisionItems[0]?.id ? [revisionItems[0].id] : [sourceItem.id],
  };
  const nextUndoStack = [...(current.creativeCanvasUndoStack ?? []), current.creativeCanvas].slice(-80);
  const previousHistory = current.figureHistory;
  const figureHistory = appendFigureHistoryEntries(current, revised, {
    sourceStage: "refine",
    sourceType: "modify",
    sourceVariantId: pending.sourceVariantId,
    createdAt: new Date(pending.createdAt).toISOString(),
  });
  const figureHistoryCompareIds =
    compareIdsForModifyHistory(previousHistory, figureHistory) ?? current.figureHistoryCompareIds;

  return {
    ...current,
    variants: [...revised, ...current.variants],
    selectedVariantId: revised[0]?.id ?? current.selectedVariantId,
    creativeCanvas: nextCreativeCanvas,
    creativeCanvasUndoStack: nextUndoStack,
    creativeCanvases: current.creativeCanvases.map((document) =>
      document.id === current.activeCreativeCanvasId
        ? {
            ...document,
            canvas: nextCreativeCanvas,
            undoStack: nextUndoStack,
            updatedAt: new Date().toISOString(),
          }
        : document,
    ),
    figureHistory,
    figureHistoryCompareIds,
    status:
      revised.length === 1
        ? "Background modify job completed with 1 localized revision."
        : `Background modify job completed with ${revised.length} localized revisions.`,
  };
}

/**
 * Reconnects saved Edit jobs wherever the workspace is mounted. A missing,
 * failed, or expired job is removed so Candidate never spins forever merely
 * because an old localStorage record survived a reload or backend restart.
 */
export function useModifyJobReconciler(): PendingModifyJob[] {
  const { state, setState } = useWorkspaceState();
  const allJobs = usePendingModifyJobs();
  const owner = modifyJobOwnerFromWorkspace(state);
  const jobs = useMemo(
    () => allJobs.filter((job) => pendingModifyJobBelongsToWorkspace(job, owner)),
    [allJobs, owner.studySessionId, owner.userId],
  );
  const activeOwnerRef = useRef<ModifyJobWorkspaceOwner | null>(owner);
  activeOwnerRef.current = owner;

  useEffect(() => () => {
    activeOwnerRef.current = null;
  }, []);

  const belongsToActiveWorkspace = useCallback((pending: PendingModifyJob) => {
    const activeOwner = activeOwnerRef.current;
    return activeOwner !== null && pendingModifyJobBelongsToWorkspace(pending, activeOwner);
  }, []);

  const settleModifyJob = useCallback((
    pending: PendingModifyJob,
    updateWorkspace: (current: WorkspaceState) => WorkspaceState,
  ) => {
    if (!belongsToActiveWorkspace(pending)) return;
    setState((current) => {
      if (!pendingModifyJobBelongsToWorkspace(pending, modifyJobOwnerFromWorkspace(current))) {
        return current;
      }
      return updateWorkspace(current);
    });
    // Removing the job notifies useSyncExternalStore subscribers. Keep that
    // notification outside the WorkspaceProvider state updater so React never
    // receives a ProjectDashboard update while evaluating WorkspaceProvider.
    removePendingModifyJob(pending.jobId);
  }, [belongsToActiveWorkspace, setState]);

  const pollModifyJob = useCallback(async (pending: PendingModifyJob) => {
    if (isModifyJobWatched(pending.jobId)) return;
    setModifyJobWatched(pending.jobId, true);
    try {
      for (;;) {
        if (!belongsToActiveWorkspace(pending)) break;
        try {
          const job = await getVariantGenerationJob(pending.jobId);
          if (!belongsToActiveWorkspace(pending)) break;
          if (job.status === "succeeded") {
            settleModifyJob(
              pending,
              (current) => integrateModifyJobResult(current, job.result ?? [], pending),
            );
            break;
          }
          if (job.status === "failed") {
            settleModifyJob(pending, (current) => ({
              ...current,
              status: `Background modify job failed: ${job.error ?? "Unknown error"}`,
            }));
            break;
          }
          if (isPendingModifyJobExpired(pending)) {
            settleModifyJob(pending, (current) => ({
              ...current,
              status: "Cleared an expired background Edit job.",
            }));
            break;
          }
          await delay(2500);
        } catch (error) {
          if (!belongsToActiveWorkspace(pending)) break;
          if (isMissingGenerationJobError(error)) {
            settleModifyJob(pending, (current) => ({
              ...current,
              status: "Cleared a background Edit job that no longer exists on the backend.",
            }));
            break;
          }
          if (isPendingModifyJobExpired(pending)) {
            settleModifyJob(pending, (current) => ({
              ...current,
              status: "Cleared an expired background Edit job after it could not be verified.",
            }));
            break;
          }
          await delay(5000);
        }
      }
    } finally {
      setModifyJobWatched(pending.jobId, false);
    }
  }, [belongsToActiveWorkspace, settleModifyJob]);

  useEffect(() => {
    jobs.forEach((job) => {
      void pollModifyJob(job);
    });
  }, [jobs, pollModifyJob]);

  return jobs;
}
