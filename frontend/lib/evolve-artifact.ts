import type { WorkspaceState } from "./workspace-state";
import type { ReferenceRegion, ReviewIssue } from "./types";

const EVOLVE_STORAGE_PREFIX = "hichart-evolve-v1";

type ArtifactWorkspace = Pick<
  WorkspaceState,
  | "diagramSkeletonPlan"
  | "diagramSkeletonXml"
  | "diagramSkeletonMermaid"
  | "selectedDiagramSkeletonId"
  | "selectedVariantId"
  | "variants"
  | "nodeIconBindings"
  | "customIconReferences"
>;

export type EvolveReviewSnapshot = {
  schemaVersion: 1;
  artifactFingerprint: string;
  issueFingerprint: string;
  reviewedAt: string;
  selectedVariantId: string | null;
};

export type RefineEditTargetStatus = "draft" | "protected" | "accepted" | "rejected";

export type RefineEditScope = "target" | "global";

export type RefineAppearanceSelection = {
  /** One collected font treatment at most. Null explicitly means no font change. */
  fontId: string | null;
  /** One collected palette at most. Null explicitly means no palette change. */
  paletteId: string | null;
  scope: RefineEditScope;
};

export type RefineEditTarget = RefineAppearanceSelection & {
  id: string;
  kind: "mask";
  name: string;
  description: string;
  status: RefineEditTargetStatus;
  bounds: { x: number; y: number; w: number; h: number };
};

export type EvolveRefineSession = {
  schemaVersion: 1;
  variantId: string;
  sourceArtifactFingerprint: string;
  annotationSnapshot: unknown | null;
  figureBounds?: { x: number; y: number; w: number; h: number } | null;
  hasMarkup: boolean;
  instructions: string;
  editTargets: RefineEditTarget[];
  /** Independent whole-figure appearance instruction for the second-round edit. */
  globalAppearance: RefineAppearanceSelection;
  status: "draft" | "revision-requested" | "accepted" | "rejected";
  updatedAt: string;
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeAppearanceSelection(
  value: unknown,
  scope: RefineEditScope,
): RefineAppearanceSelection {
  const input = value && typeof value === "object"
    ? value as Partial<RefineAppearanceSelection>
    : {};
  return {
    fontId: nonEmptyString(input.fontId),
    paletteId: nonEmptyString(input.paletteId),
    scope: input.scope === "global" || input.scope === "target" ? input.scope : scope,
  };
}

export function normalizeRefineEditTarget(
  value: unknown,
  index = 0,
): RefineEditTarget | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<RefineEditTarget>;
  const id = nonEmptyString(input.id);
  if (!id) return null;
  const boundsInput = input.bounds && typeof input.bounds === "object" ? input.bounds : null;
  return {
    id,
    kind: "mask",
    name: nonEmptyString(input.name) ?? `Edit target ${index + 1}`,
    description: typeof input.description === "string" ? input.description : "",
    status: ["draft", "protected", "accepted", "rejected"].includes(input.status ?? "")
      ? input.status as RefineEditTargetStatus
      : "draft",
    bounds: {
      x: finiteNumber(boundsInput?.x),
      y: finiteNumber(boundsInput?.y),
      w: finiteNumber(boundsInput?.w),
      h: finiteNumber(boundsInput?.h),
    },
    ...normalizeAppearanceSelection(input, "target"),
  };
}

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, candidate) => {
    if (!candidate || typeof candidate !== "object") return candidate;
    if (seen.has(candidate)) return "[Circular]";
    seen.add(candidate);
    if (Array.isArray(candidate)) return candidate;
    return Object.keys(candidate as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = (candidate as Record<string, unknown>)[key];
        return result;
      }, {});
  });
}

function hashText(value: string): string {
  // Two inexpensive 32-bit streams make accidental collisions unlikely while
  // keeping this synchronous for render-time freshness checks.
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

function contentSignature(value: string | null | undefined) {
  if (!value) return null;
  return `${value.length}:${hashText(value)}`;
}

export function createArtifactFingerprint(state: ArtifactWorkspace): string {
  const selectedVariant =
    state.variants.find((variant) => variant.id === state.selectedVariantId) ??
    state.variants[0] ??
    null;
  const fingerprintSource = {
    skeleton: {
      id: state.selectedDiagramSkeletonId,
      plan: state.diagramSkeletonPlan,
      xml: contentSignature(state.diagramSkeletonXml),
      mermaid: contentSignature(state.diagramSkeletonMermaid),
      iconBindings: state.nodeIconBindings,
      customIcons: state.customIconReferences
        .filter((icon) => Object.values(state.nodeIconBindings).includes(icon.id))
        .map((icon) => ({
          id: icon.id,
          kind: icon.kind ?? null,
          contentHash: icon.contentHash ?? contentSignature(icon.cropDataUrl),
          sourceReferenceId: icon.sourceReferenceId,
          sourceRegionId: icon.sourceRegionId,
        })),
    },
    output: selectedVariant
      ? {
          id: selectedVariant.id,
          sourceVariantId: selectedVariant.sourceVariantId ?? null,
          svg: contentSignature(selectedVariant.svg),
          previewImageUrl: selectedVariant.previewImageUrl ?? null,
          previewImageDataUrl: contentSignature(selectedVariant.previewImageDataUrl),
          draftPreviewImageUrl: selectedVariant.draftPreviewImageUrl ?? null,
          draftPreviewImageDataUrl: contentSignature(selectedVariant.draftPreviewImageDataUrl),
        }
      : null,
  };
  return `artifact-v1-${hashText(stableStringify(fingerprintSource))}`;
}

export function createIssueFingerprint(issues: ReviewIssue[]): string {
  return `issues-v1-${hashText(
    stableStringify(
      issues.map(({ id, category, severity, message, suggestedAction, targetIds }) => ({
        id,
        category,
        severity,
        message,
        suggestedAction,
        targetIds,
      })),
    ),
  )}`;
}

function storageScope(sessionId: string | null, participantId?: string | null) {
  return sessionId || participantId || "local";
}

function reviewStorageKey(sessionId: string | null, participantId?: string | null) {
  return `${EVOLVE_STORAGE_PREFIX}:review:${storageScope(sessionId, participantId)}`;
}

function refineStorageKey(
  sessionId: string | null,
  participantId: string | null | undefined,
  variantId: string,
) {
  return `${EVOLVE_STORAGE_PREFIX}:refine:${storageScope(sessionId, participantId)}:${variantId}`;
}

export function readReviewSnapshot(
  sessionId: string | null,
  participantId?: string | null,
): EvolveReviewSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(reviewStorageKey(sessionId, participantId)) ?? "null");
    if (
      !parsed ||
      parsed.schemaVersion !== 1 ||
      typeof parsed.artifactFingerprint !== "string" ||
      typeof parsed.issueFingerprint !== "string" ||
      typeof parsed.reviewedAt !== "string"
    ) {
      return null;
    }
    return parsed as EvolveReviewSnapshot;
  } catch {
    return null;
  }
}

export function writeReviewSnapshot(
  sessionId: string | null,
  participantId: string | null | undefined,
  snapshot: EvolveReviewSnapshot,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(reviewStorageKey(sessionId, participantId), JSON.stringify(snapshot));
  } catch {
    // Review results still remain in WorkspaceState if browser storage is full.
  }
}

export function clearReviewSnapshot(sessionId: string | null, participantId?: string | null) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(reviewStorageKey(sessionId, participantId));
}

function finiteNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function snapshotRecords(snapshot: unknown): Record<string, unknown>[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const document = (snapshot as { document?: unknown }).document;
  if (!document || typeof document !== "object") return [];
  const store = (document as { store?: unknown }).store;
  if (!store || typeof store !== "object") return [];
  return Object.values(store as Record<string, unknown>).filter(
    (record): record is Record<string, unknown> => Boolean(record && typeof record === "object"),
  );
}

export function compactAnnotationSnapshot(snapshot: unknown): unknown {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const document = (snapshot as { document?: unknown }).document;
  if (!document || typeof document !== "object") return snapshot;
  const store = (document as { store?: unknown }).store;
  if (!store || typeof store !== "object") return snapshot;

  const records = store as Record<string, unknown>;
  const backgroundAssetIds = new Set<string>();
  for (const record of Object.values(records)) {
    if (!record || typeof record !== "object") continue;
    const shape = record as Record<string, unknown>;
    const meta = shape.meta as Record<string, unknown> | undefined;
    if (shape.typeName !== "shape" || meta?.hichartFigureBackground !== true) continue;
    const props = shape.props as Record<string, unknown> | undefined;
    if (typeof props?.assetId === "string") backgroundAssetIds.add(props.assetId);
  }

  // Keep the figure shape (and a src-less asset) so reopening can put the
  // image back in the same place. Dropping the shape used to recreate it at
  // (0, 0), which left every mask and arrow sitting under the figure.
  const compactStore = Object.fromEntries(
    Object.entries(records).map(([id, record]) => {
      if (!record || typeof record !== "object") return [id, record];
      const item = record as Record<string, unknown>;
      if (item.typeName !== "asset" || typeof item.id !== "string" || !backgroundAssetIds.has(item.id)) {
        return [id, record];
      }
      const props = item.props as Record<string, unknown> | undefined;
      if (!props || props.src == null) return [id, record];
      return [id, { ...item, props: { ...props, src: null } }];
    }),
  );

  return {
    ...(snapshot as Record<string, unknown>),
    document: {
      ...(document as Record<string, unknown>),
      store: compactStore,
    },
  };
}

/**
 * Markup is listed top-to-bottom then left-to-right so the notes panel numbers
 * regions the same way the badges on the canvas do.
 */
function compareReadingOrder(
  left: { x: number; y: number },
  right: { x: number; y: number },
): number {
  const rowGap = 24;
  if (Math.abs(left.y - right.y) > rowGap) return left.y - right.y;
  return left.x - right.x;
}

export function deriveMaskTargets(
  snapshot: unknown,
  previousTargets: RefineEditTarget[] = [],
): RefineEditTarget[] {
  const previousById = new Map(previousTargets.map((target) => [target.id, target]));
  return snapshotRecords(snapshot)
    .filter((record) => {
      const props = record.props as Record<string, unknown> | undefined;
      return (
        record.typeName === "shape" &&
        record.type === "geo" &&
        props?.geo === "rectangle" &&
        props?.color === "violet" &&
        props?.fill === "semi"
      );
    })
    .sort((left, right) =>
      compareReadingOrder(
        { x: finiteNumber(left.x), y: finiteNumber(left.y) },
        { x: finiteNumber(right.x), y: finiteNumber(right.y) },
      ),
    )
    .map((record, index) => {
      const id = typeof record.id === "string" ? record.id : `mask-${index + 1}`;
      const props = (record.props ?? {}) as Record<string, unknown>;
      const previous = previousById.get(id);
      return {
        id,
        kind: "mask" as const,
        name: previous?.name ?? `Edit target ${index + 1}`,
        description: previous?.description ?? "",
        status: previous?.status ?? "draft",
        fontId: previous?.fontId ?? null,
        paletteId: previous?.paletteId ?? null,
        scope: previous?.scope ?? "target",
        bounds: {
          x: finiteNumber(record.x),
          y: finiteNumber(record.y),
          w: finiteNumber(props.w),
          h: finiteNumber(props.h),
        },
      };
    });
}

function unitInterval(value: number) {
  return Math.min(1, Math.max(0, value));
}

/**
 * Page-space mask boxes, clipped to the figure and shifted to figure origin.
 * The Edit canvas uses this to stamp a white-on-black PNG the same size as
 * the figure, instead of hoping the backend can rebuild that mask from HTTP.
 */
export function figureRelativeMaskRects(
  figure: { x: number; y: number; w: number; h: number },
  masks: Array<{ x: number; y: number; w: number; h: number }>,
): Array<{ x: number; y: number; w: number; h: number }> {
  if (figure.w <= 0 || figure.h <= 0) return [];
  return masks.flatMap((mask) => {
    const x0 = Math.max(figure.x, mask.x);
    const y0 = Math.max(figure.y, mask.y);
    const x1 = Math.min(figure.x + figure.w, mask.x + mask.w);
    const y1 = Math.min(figure.y + figure.h, mask.y + mask.h);
    const w = x1 - x0;
    const h = y1 - y0;
    if (w < 1 || h < 1) return [];
    return [{ x: x0 - figure.x, y: y0 - figure.y, w, h }];
  });
}

/**
 * Masks are drawn in figure pixels. The backend's edit mask is a 0–1 box on
 * the source sheet, so Apply edits has to convert before the job starts.
 */
export function maskTargetsToModifyRegions(
  targets: RefineEditTarget[],
  figureBounds: { x: number; y: number; w: number; h: number } | null | undefined,
  referenceId: string,
): ReferenceRegion[] {
  if (!figureBounds || figureBounds.w <= 0 || figureBounds.h <= 0) return [];
  return targets.flatMap((target) => {
    const x = unitInterval((target.bounds.x - figureBounds.x) / figureBounds.w);
    const y = unitInterval((target.bounds.y - figureBounds.y) / figureBounds.h);
    const w = Math.min(1 - x, target.bounds.w / figureBounds.w);
    const h = Math.min(1 - y, target.bounds.h / figureBounds.h);
    if (w <= 0 || h <= 0) return [];
    const label = [target.name.trim(), target.description.trim()].filter(Boolean).join(": ");
    return [{
      id: target.id,
      referenceId,
      intent: "modify" as const,
      x,
      y,
      w,
      h,
      label: label || null,
    }];
  });
}

export function deriveFigureBounds(
  snapshot: unknown,
): { x: number; y: number; w: number; h: number } | null {
  const background = snapshotRecords(snapshot).find((record) => {
    const meta = record.meta as Record<string, unknown> | undefined;
    return record.typeName === "shape" && meta?.hichartFigureBackground === true;
  });
  if (!background) return null;
  const props = (background.props ?? {}) as Record<string, unknown>;
  const w = finiteNumber(props.w);
  const h = finiteNumber(props.h);
  if (w <= 0 || h <= 0) return null;
  return {
    x: finiteNumber(background.x),
    y: finiteNumber(background.y),
    w,
    h,
  };
}

export function createEmptyRefineSession(
  variantId: string,
  sourceArtifactFingerprint: string,
): EvolveRefineSession {
  return {
    schemaVersion: 1,
    variantId,
    sourceArtifactFingerprint,
    annotationSnapshot: null,
    figureBounds: null,
    hasMarkup: false,
    instructions: "",
    editTargets: [],
    globalAppearance: {
      fontId: null,
      paletteId: null,
      scope: "global",
    },
    status: "draft",
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeRefineSession(
  value: unknown,
  expectedVariantId?: string,
): EvolveRefineSession | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<EvolveRefineSession>;
  const variantId = nonEmptyString(parsed.variantId);
  if (!variantId || (expectedVariantId && variantId !== expectedVariantId)) return null;
  if (parsed.schemaVersion !== 1) return null;
  const status = ["draft", "revision-requested", "accepted", "rejected"].includes(
    parsed.status ?? "",
  )
    ? parsed.status as EvolveRefineSession["status"]
    : "draft";
  return {
    schemaVersion: 1,
    variantId,
    sourceArtifactFingerprint: nonEmptyString(parsed.sourceArtifactFingerprint) ?? "",
    annotationSnapshot: parsed.annotationSnapshot ?? null,
    figureBounds: parsed.figureBounds ?? null,
    hasMarkup: Boolean(parsed.hasMarkup),
    instructions: typeof parsed.instructions === "string" ? parsed.instructions : "",
    editTargets: Array.isArray(parsed.editTargets)
      ? parsed.editTargets
          .map((target, index) => normalizeRefineEditTarget(target, index))
          .filter((target): target is RefineEditTarget => target !== null)
      : [],
    globalAppearance: {
      ...normalizeAppearanceSelection(parsed.globalAppearance, "global"),
      scope: "global",
    },
    status,
    updatedAt: nonEmptyString(parsed.updatedAt) ?? new Date().toISOString(),
  };
}

export function readRefineSession(
  sessionId: string | null,
  participantId: string | null | undefined,
  variantId: string,
): EvolveRefineSession | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(refineStorageKey(sessionId, participantId, variantId)) ?? "null",
    );
    return normalizeRefineSession(parsed, variantId);
  } catch {
    return null;
  }
}

export function writeRefineSession(
  sessionId: string | null,
  participantId: string | null | undefined,
  session: EvolveRefineSession,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      refineStorageKey(sessionId, participantId, session.variantId),
      JSON.stringify({ ...session, updatedAt: new Date().toISOString() }),
    );
  } catch {
    // Large tldraw snapshots can exceed storage quota; editing remains available for this mount.
  }
}

export function clearRefineSession(
  sessionId: string | null,
  participantId: string | null | undefined,
  variantId: string,
) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(refineStorageKey(sessionId, participantId, variantId));
}

export function svgPreviewDataUrl(svg: string | null | undefined): string | null {
  if (!svg?.trim()) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
