"use client";

/**
 * Best-effort participant study logging.
 *
 * Every participant has an ID (studyProfile.userId). Interaction events,
 * Pocket references, skeletons, and generated outputs are shipped to the
 * backend, which stores them under study_logs/<participantId>/ for post-session
 * analysis. Sync progress is tracked per session in localStorage so refreshes
 * and retries never duplicate records.
 */

import { recordStudyLogs, recordStudyOutput } from "./api";
import { imageUrlToDataUrl } from "./annotation-flatten";
import type {
  CustomIconReference,
  DiagramSkeletonCandidate,
  FigureVariant,
  ReferenceItem,
} from "./types";
import type { ReferenceUsage, StudyEvent, WorkspaceState } from "./workspace-state";

export type StudyLogSyncMarker = {
  eventCount: number;
  outputIds: string[];
  skeletonKeys: string[];
  referenceKeys: string[];
  iconKeys: string[];
  workspaceFingerprint: string | null;
};

const MARKER_PREFIX = "hichart-study-log-sync:";
const SUPPORTED_IMAGE_DATA_URL = /^data:image\/(png|jpeg|svg\+xml);base64,/i;

const EMPTY_MARKER: StudyLogSyncMarker = {
  eventCount: 0,
  outputIds: [],
  skeletonKeys: [],
  referenceKeys: [],
  iconKeys: [],
  workspaceFingerprint: null,
};

export function loadSyncMarker(sessionId: string): StudyLogSyncMarker {
  if (typeof window === "undefined") return { ...EMPTY_MARKER };
  try {
    const raw = window.localStorage.getItem(`${MARKER_PREFIX}${sessionId}`);
    if (!raw) return { ...EMPTY_MARKER };
    const parsed = JSON.parse(raw) as Partial<StudyLogSyncMarker>;
    return {
      eventCount: typeof parsed.eventCount === "number" && parsed.eventCount >= 0 ? parsed.eventCount : 0,
      outputIds: Array.isArray(parsed.outputIds) ? parsed.outputIds.filter((id) => typeof id === "string") : [],
      skeletonKeys: Array.isArray(parsed.skeletonKeys)
        ? parsed.skeletonKeys.filter((key) => typeof key === "string")
        : [],
      referenceKeys: Array.isArray(parsed.referenceKeys)
        ? parsed.referenceKeys.filter((key) => typeof key === "string")
        : [],
      iconKeys: Array.isArray(parsed.iconKeys)
        ? parsed.iconKeys.filter((key) => typeof key === "string")
        : [],
      workspaceFingerprint: typeof parsed.workspaceFingerprint === "string"
        ? parsed.workspaceFingerprint
        : null,
    };
  } catch {
    return { ...EMPTY_MARKER };
  }
}

export function saveSyncMarker(sessionId: string, marker: StudyLogSyncMarker) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${MARKER_PREFIX}${sessionId}`, JSON.stringify(marker));
  } catch {
    // Quota errors only cost us duplicate log lines on the next retry.
  }
}

/** Events not yet shipped; tolerates a marker ahead of a rewritten event list. */
export function selectUnsyncedEvents(events: StudyEvent[], syncedCount: number): StudyEvent[] {
  const safeCount = Math.max(0, Math.min(syncedCount, events.length));
  return events.slice(safeCount);
}

/** Outputs worth archiving: new, non-tutorial, and carrying an image. */
export function selectUnrecordedOutputs(
  variants: FigureVariant[],
  recordedIds: readonly string[],
): FigureVariant[] {
  const recorded = new Set(recordedIds);
  return variants.filter(
    (variant) =>
      !recorded.has(variant.id) &&
      !variant.id.includes("tutorial-") &&
      Boolean(variant.previewImageDataUrl || variant.previewImageUrl || variant.svg),
  );
}

/**
 * The key changes when a skeleton gains region revisions, so an edited
 * skeleton is archived again as a new version.
 */
export function skeletonSyncKey(candidate: DiagramSkeletonCandidate): string {
  return `${candidate.id}@${candidate.revisions?.length ?? 0}`;
}

/** Skeletons worth archiving: new (or newly revised), non-tutorial, with content. */
export function selectUnrecordedSkeletons(
  candidates: DiagramSkeletonCandidate[],
  recordedKeys: readonly string[],
): DiagramSkeletonCandidate[] {
  const recorded = new Set(recordedKeys);
  return candidates.filter(
    (candidate) =>
      !recorded.has(skeletonSyncKey(candidate)) &&
      !candidate.id.includes("tutorial-") &&
      Boolean(candidate.xml || candidate.mermaid),
  );
}

export type PocketReferenceRecord = {
  reference: ReferenceItem;
  role: "layout" | "style";
  key: string;
};

export function referenceSyncKey(referenceId: string, role: "layout" | "style"): string {
  return `${referenceId}@${role}`;
}

export function iconSyncKey(icon: CustomIconReference): string {
  return `${icon.id}@${icon.contentHash || icon.cropDataUrl.length}`;
}

export function selectUnrecordedIcons(
  icons: CustomIconReference[],
  recordedKeys: readonly string[],
): CustomIconReference[] {
  const recorded = new Set(recordedKeys);
  return icons.filter((icon) =>
    Boolean(icon.cropDataUrl) && !recorded.has(iconSyncKey(icon)),
  );
}

function stripReferenceBinary(reference: ReferenceItem): ReferenceItem {
  return {
    ...reference,
    imageDataUrl: null,
    thumbnailUrl: reference.thumbnailUrl?.startsWith("data:image/") ? null : reference.thumbnailUrl,
  };
}

function stripIconBinary(icon: CustomIconReference): CustomIconReference {
  return {
    ...icon,
    cropDataUrl: icon.cropDataUrl.startsWith("data:image/") ? "" : icon.cropDataUrl,
    cropStorageKey: null,
  };
}

/**
 * Browser storage remains the fast path, while this compact checkpoint is the
 * durable fallback. Generated images, Skeleton XML, Pocket images, and custom
 * icon pixels are archived separately and rejoined during recovery.
 */
export function createWorkspaceRecoveryCheckpoint(state: WorkspaceState): Partial<WorkspaceState> {
  return {
    studyTaskVersion: state.studyTaskVersion,
    assignedTaskSnapshot: state.assignedTaskSnapshot,
    activeStudyStage: state.activeStudyStage,
    activeStudyPhase: state.activeStudyPhase,
    visitedStudyStages: state.visitedStudyStages,
    visitedStudyPhases: state.visitedStudyPhases,
    completedStudyStages: state.completedStudyStages,
    completedStudyPhases: state.completedStudyPhases,
    workflowMode: state.workflowMode,
    workspaceView: state.workspaceView,
    activeStudioStep: state.activeStudioStep,
    guidedDialogue: state.guidedDialogue,
    skeletonConfirmedAt: state.skeletonConfirmedAt,
    reviewResult: state.reviewResult,
    reviewFocusTargetIds: state.reviewFocusTargetIds,
    activeStyleKit: state.activeStyleKit,
    skeletonStyleApplications: state.skeletonStyleApplications,
    nodeIconBindings: state.nodeIconBindings,
    nodeFontBindings: state.nodeFontBindings,
    nodeColorBindings: state.nodeColorBindings,
    recentIconIds: state.recentIconIds,
    lockedDiagramObjectIds: state.lockedDiagramObjectIds,
    prompt: state.prompt,
    generationBrief: state.generationBrief,
    promptUpdatedAt: state.promptUpdatedAt,
    promptRevisions: state.promptRevisions,
    currentPromptRevisionId: state.currentPromptRevisionId,
    diagramSkeletonPromptRevisionId: state.diagramSkeletonPromptRevisionId,
    diagramSkeletonPromptFingerprint: state.diagramSkeletonPromptFingerprint,
    skeletonCheckpointPlan: state.skeletonCheckpointPlan,
    board: state.board.map(stripReferenceBinary),
    references: state.references.map(stripReferenceBinary),
    retrievalSession: state.retrievalSession,
    referenceUsage: state.referenceUsage,
    layoutReferenceId: state.layoutReferenceId,
    canvasGenerationReferenceIds: state.canvasGenerationReferenceIds,
    canvasFocusReferenceId: state.canvasFocusReferenceId,
    iconReferenceIds: state.iconReferenceIds,
    iconReferenceId: state.iconReferenceId,
    fontReferenceId: state.fontReferenceId,
    paletteReferenceId: state.paletteReferenceId,
    matchedStylePalette: state.matchedStylePalette,
    customIconReferences: state.customIconReferences.map(stripIconBinary),
    styleVisualAnalyses: state.styleVisualAnalyses,
    styleAnalysisStates: state.styleAnalysisStates,
    referenceRegions: state.referenceRegions.map((region) => ({
      ...region,
      detectedIcon: region.detectedIcon
        ? { ...region.detectedIcon, cropDataUrl: "", cropStorageKey: null }
        : region.detectedIcon,
    })),
    selectedDiagramSkeletonId: state.selectedDiagramSkeletonId,
    candidateGenerationSnapshots: Object.fromEntries(
      Object.entries(state.candidateGenerationSnapshots).map(([variantId, snapshot]) => [variantId, {
        ...snapshot,
        workingPrompt: snapshot.workingPrompt.slice(0, 24_000),
        skeletonXml: null,
      }]),
    ),
    selectedVariantId: state.selectedVariantId,
    figureHistoryCompareIds: state.figureHistoryCompareIds,
    showProvenance: state.showProvenance,
  };
}

function textFingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${value.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

/** Each reference is archived once for every Pocket role the participant chose. */
export function selectUnrecordedReferences(
  references: ReferenceItem[],
  usageById: Record<string, ReferenceUsage>,
  recordedKeys: readonly string[],
): PocketReferenceRecord[] {
  const recorded = new Set(recordedKeys);
  const pending: PocketReferenceRecord[] = [];
  for (const reference of references) {
    // Binary Pocket hydration is asynchronous. Waiting until an image source is
    // available prevents a metadata-only record from suppressing the image log.
    if (!reference.imageDataUrl && !reference.thumbnailUrl) continue;
    const usage = usageById[reference.id];
    for (const role of ["layout", "style"] as const) {
      const key = referenceSyncKey(reference.id, role);
      if (usage?.[role] && !recorded.has(key)) {
        pending.push({ reference, role, key });
      }
    }
  }
  return pending;
}

function outputImagePayload(variant: FigureVariant): { imageDataUrl?: string; imageUrl?: string } {
  if (variant.previewImageDataUrl && SUPPORTED_IMAGE_DATA_URL.test(variant.previewImageDataUrl)) {
    return { imageDataUrl: variant.previewImageDataUrl, imageUrl: variant.previewImageUrl ?? undefined };
  }
  return { imageUrl: variant.previewImageUrl ?? undefined };
}

function referenceImagePayload(reference: ReferenceItem): { imageDataUrl?: string; imageUrl?: string } {
  const embeddedImage = reference.imageDataUrl ??
    (reference.thumbnailUrl?.startsWith("data:image/") ? reference.thumbnailUrl : null);
  if (embeddedImage && SUPPORTED_IMAGE_DATA_URL.test(embeddedImage)) {
    return {
      imageDataUrl: embeddedImage,
      imageUrl: reference.thumbnailUrl && !reference.thumbnailUrl.startsWith("data:image/")
        ? reference.thumbnailUrl
        : undefined,
    };
  }
  return {
    imageUrl: reference.thumbnailUrl && !reference.thumbnailUrl.startsWith("data:image/")
      ? reference.thumbnailUrl
      : undefined,
  };
}

let flushInFlight = false;
let queuedFlushState: WorkspaceState | null = null;

/**
 * Ship pending events and outputs for the active participant session.
 * Silent failure by design: logging must never disturb the participant.
 */
export async function flushStudyLog(state: WorkspaceState): Promise<void> {
  const participantId = state.studyProfile?.userId?.trim();
  const sessionId = state.studySessionId;
  if (!participantId || !sessionId) return;
  if (flushInFlight) {
    // Keep the newest snapshot so a Pocket addition immediately followed by
    // logout is not lost behind an older request that is still uploading.
    queuedFlushState = state;
    return;
  }
  flushInFlight = true;

  try {
    const marker = loadSyncMarker(sessionId);

    const pendingEvents = selectUnsyncedEvents(state.studyEvents, marker.eventCount);
    if (pendingEvents.length) {
      await recordStudyLogs({
        participantId,
        sessionId,
        sessionStartedAt: state.studySessionStartedAt,
        events: pendingEvents,
      });
      marker.eventCount = Math.min(marker.eventCount, state.studyEvents.length) + pendingEvents.length;
      saveSyncMarker(sessionId, marker);
    }

    for (const { reference, role, key } of selectUnrecordedReferences(
      state.board,
      state.referenceUsage,
      marker.referenceKeys,
    )) {
      let payload = referenceImagePayload(reference);
      if (!payload.imageDataUrl && payload.imageUrl) {
        const fetched = await imageUrlToDataUrl(payload.imageUrl).catch(() => null);
        if (fetched && SUPPORTED_IMAGE_DATA_URL.test(fetched)) {
          payload = { ...payload, imageDataUrl: fetched };
        }
      }
      await recordStudyOutput({
        participantId,
        sessionId,
        outputId: `reference-${role}-${reference.id}`,
        kind: "reference",
        title: reference.title,
        ...payload,
        metadata: {
          role,
          referenceId: reference.id,
          sourcePaper: reference.sourcePaper,
          venue: reference.venue,
          year: reference.year,
          imageType: reference.imageType,
          subject: reference.subject,
          styleTags: reference.styleTags,
          similarityReason: reference.similarityReason,
          structuralAnalysis: reference.structuralAnalysis,
        },
      });
      marker.referenceKeys = [...marker.referenceKeys, key];
      saveSyncMarker(sessionId, marker);
    }

    for (const icon of selectUnrecordedIcons(state.customIconReferences, marker.iconKeys)) {
      let payload = referenceImagePayload({
        id: icon.id,
        title: icon.label,
        sourcePaper: "Extracted workspace icon",
        venue: "HiFigure",
        year: new Date().getFullYear(),
        imageType: "scientific icon",
        subject: icon.description,
        styleTags: icon.tags,
        similarityReason: icon.description,
        thumbnail: "ICON",
        thumbnailUrl: icon.cropDataUrl,
        imageDataUrl: icon.cropDataUrl,
        structuralAnalysis: icon.description,
      });
      if (!payload.imageDataUrl && payload.imageUrl) {
        const fetched = await imageUrlToDataUrl(payload.imageUrl).catch(() => null);
        if (fetched && SUPPORTED_IMAGE_DATA_URL.test(fetched)) {
          payload = { ...payload, imageDataUrl: fetched };
        }
      }
      await recordStudyOutput({
        participantId,
        sessionId,
        outputId: `icon-${icon.id}`,
        kind: "icon",
        title: icon.label,
        ...payload,
        metadata: {
          iconId: icon.id,
          label: icon.label,
          tags: icon.tags,
          description: icon.description,
          sourceReferenceId: icon.sourceReferenceId,
          sourceRegionId: icon.sourceRegionId,
          iconKind: icon.kind ?? null,
          contentHash: icon.contentHash ?? null,
          createdAt: icon.createdAt ?? null,
          stale: icon.stale ?? false,
        },
      });
      marker.iconKeys = [...marker.iconKeys, iconSyncKey(icon)];
      saveSyncMarker(sessionId, marker);
    }

    for (const candidate of selectUnrecordedSkeletons(state.diagramSkeletonCandidates, marker.skeletonKeys)) {
      await recordStudyOutput({
        participantId,
        sessionId,
        outputId: skeletonSyncKey(candidate),
        kind: "skeleton",
        title: candidate.title,
        textContent: candidate.xml ?? candidate.mermaid,
        textFormat: candidate.xml ? "xml" : "mermaid",
        metadata: {
          skeletonId: candidate.id,
          referenceId: candidate.referenceId ?? null,
          referenceTitle: candidate.referenceTitle,
          source: candidate.source ?? null,
          createdAt: candidate.createdAt,
          revisionCount: candidate.revisions?.length ?? 0,
          selected: state.selectedDiagramSkeletonId === candidate.id,
        },
      });
      marker.skeletonKeys = [...marker.skeletonKeys, skeletonSyncKey(candidate)];
      saveSyncMarker(sessionId, marker);
    }

    for (const variant of selectUnrecordedOutputs(state.variants, marker.outputIds)) {
      let payload = outputImagePayload(variant);
      if (!payload.imageDataUrl && payload.imageUrl) {
        const fetched = await imageUrlToDataUrl(payload.imageUrl).catch(() => null);
        if (fetched && SUPPORTED_IMAGE_DATA_URL.test(fetched)) {
          payload = { ...payload, imageDataUrl: fetched };
        }
      }
      await recordStudyOutput({
        participantId,
        sessionId,
        outputId: variant.id,
        kind: variant.sourceVariantId ? "revision" : "candidate",
        title: variant.title,
        ...payload,
        metadata: {
          description: variant.description,
          layoutStrategy: variant.layoutStrategy,
          sourceVariantId: variant.sourceVariantId ?? null,
          generationPrompt: variant.generationPrompt ?? null,
          selected: state.selectedVariantId === variant.id,
        },
      });
      marker.outputIds = [...marker.outputIds, variant.id];
      saveSyncMarker(sessionId, marker);
    }

    const checkpointText = JSON.stringify({
      schemaVersion: 1,
      state: createWorkspaceRecoveryCheckpoint(state),
    });
    const checkpointFingerprint = textFingerprint(checkpointText);
    if (checkpointFingerprint !== marker.workspaceFingerprint) {
      await recordStudyOutput({
        participantId,
        sessionId,
        outputId: "workspace-checkpoint",
        kind: "workspace",
        title: "HiFigure workspace checkpoint",
        textContent: checkpointText,
        textFormat: "json",
        metadata: { schemaVersion: 1 },
      });
      marker.workspaceFingerprint = checkpointFingerprint;
      saveSyncMarker(sessionId, marker);
    }
  } catch {
    // Backend offline or mid-restart: the marker was only advanced for
    // records that were acknowledged, so the next flush retries the rest.
  } finally {
    flushInFlight = false;
    const queued = queuedFlushState;
    queuedFlushState = null;
    if (queued) void flushStudyLog(queued);
  }
}
