import type { FigureVariant } from "./types";

export function resolveCandidatePreviewVariantId({
  variants,
  currentPreviewVariantId,
  workspaceSelectedVariantId,
  previousVariantIds,
}: {
  variants: ReadonlyArray<Pick<FigureVariant, "id" | "deletedAt">>;
  currentPreviewVariantId: string | null;
  workspaceSelectedVariantId: string | null;
  previousVariantIds: ReadonlySet<string>;
}): string | null {
  const liveVariantIds = new Set(
    variants.filter((variant) => !variant.deletedAt).map((variant) => variant.id),
  );
  const workspaceSelection = workspaceSelectedVariantId && liveVariantIds.has(workspaceSelectedVariantId)
    ? workspaceSelectedVariantId
    : null;

  if (currentPreviewVariantId && liveVariantIds.has(currentPreviewVariantId)) {
    const workspaceSelectionIsNew = Boolean(
      workspaceSelection && !previousVariantIds.has(workspaceSelection),
    );
    return workspaceSelectionIsNew ? workspaceSelection : currentPreviewVariantId;
  }

  return workspaceSelection
    ?? variants.find((variant) => !variant.deletedAt)?.id
    ?? null;
}
