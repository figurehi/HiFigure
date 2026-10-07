import type { FigureVariant } from "./types";
import type { FigureHistoryEntry, StudyStage, WorkspaceState } from "./workspace-state";

export function appendFigureHistoryEntries(
  state: WorkspaceState,
  variants: FigureVariant[],
  options: {
    sourceStage: StudyStage;
    sourceType: FigureHistoryEntry["sourceType"];
    sourceVariantId?: string | null;
    createdAt?: string;
  },
): FigureHistoryEntry[] {
  if (variants.length === 0) return state.figureHistory;
  const requestedTimestamp = options.createdAt ? Date.parse(options.createdAt) : Number.NaN;
  const timestamp = Number.isFinite(requestedTimestamp) ? requestedTimestamp : Date.now();
  const createdAt = new Date(timestamp).toISOString();
  const newEntries = variants.map((variant, index) => ({
    id: `history-${timestamp}-${index}-${variant.id}`,
    variantId: variant.id,
    title: variant.title,
    previewImageUrl: variant.previewImageUrl ?? null,
    previewImageStorageKey: null,
    sourceStage: options.sourceStage,
    sourceType: options.sourceType,
    sourceVariantId: options.sourceVariantId ?? variant.sourceVariantId ?? null,
    createdAt,
  }));
  // Idea History relies on complete lineage metadata. Image payloads remain in
  // IndexedDB, so retaining these small entries does not duplicate previews.
  return [...newEntries, ...state.figureHistory];
}

/**
 * Revision variants are stored newest-first so the active output is cheap to
 * resolve. The Edit result strip reads in the opposite direction: Revision 1
 * must stay the first submitted result instead of changing numbers whenever a
 * newer background job finishes.
 */
export function sortRevisionVariantsByHistory(
  variants: FigureVariant[],
  history: FigureHistoryEntry[],
): FigureVariant[] {
  const chronologicalHistory = [...history].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const historyRank = new Map<string, number>();
  chronologicalHistory.forEach((entry, index) => {
    if (!historyRank.has(entry.variantId)) historyRank.set(entry.variantId, index);
  });
  const storageRank = new Map(variants.map((variant, index) => [variant.id, index] as const));

  return [...variants].sort((a, b) => {
    const aHistoryRank = historyRank.get(a.id);
    const bHistoryRank = historyRank.get(b.id);
    if (aHistoryRank !== undefined && bHistoryRank !== undefined) {
      return aHistoryRank - bHistoryRank;
    }
    if (aHistoryRank !== undefined) return -1;
    if (bHistoryRank !== undefined) return 1;
    // Legacy revisions without History metadata inherit the inverse of the
    // newest-first workspace storage order.
    return (storageRank.get(b.id) ?? 0) - (storageRank.get(a.id) ?? 0);
  });
}

export function compareIdsForModifyHistory(
  previousHistory: FigureHistoryEntry[],
  nextHistory: FigureHistoryEntry[],
): [string, string] | null {
  if (nextHistory.length < 2 || previousHistory.length === nextHistory.length) return null;
  return [nextHistory[1]!.id, nextHistory[0]!.id];
}

export function restoreVariantFromHistory(state: WorkspaceState, entry: FigureHistoryEntry): WorkspaceState {
  const variant = state.variants.find((item) => item.id === entry.variantId);
  if (!variant) return state;
  return {
    ...state,
    selectedVariantId: variant.id,
    status: `Restored "${variant.title}" from version history.`,
  };
}
