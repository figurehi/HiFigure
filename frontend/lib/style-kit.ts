/**
 * Frontend-only visual style selections. These values are persisted with the
 * workspace. Font and palette collections are shortlisted in Style, then an
 * optional figure-wide choice is confirmed in Match before generation.
 */

import { isDiagramGroupNode } from "./diagram-xml";
import type { DiagramPlan } from "./types";

export type StyleKitPalette = {
  kind: "preset" | "region";
  id: string;
  colors: string[];
  sourceReferenceId?: string;
  sourceRegionId?: string;
};

export type StyleKitFontSource = {
  sourceReferenceId: string;
  sourceRegionId?: string;
};

export type StyleKit = {
  id: string;
  /** Bumped when a selected crop changes without changing its stable region ID. */
  revision: number;
  sourceReferenceId: string | null;
  sourceReferenceIds: string[];
  /** Multi-select collection used by Edit. `palette` mirrors the first item for old workspaces. */
  palettes: StyleKitPalette[];
  palette: StyleKitPalette | null;
  /** Multi-select collection used by Edit. `fontId` mirrors the first item for old workspaces. */
  fontIds: string[];
  fontId: string | null;
  /** Frontend-only provenance for font treatments inferred from a reference image or crop. */
  fontSources: Record<string, StyleKitFontSource>;
  iconIds: string[];
  patternIds: string[];
  regionIds: string[];
  updatedAt: string;
  confirmedAt: string | null;
  fingerprint: string;
};

export type SkeletonStyleApplication = {
  skeletonId: string;
  styleKitFingerprint: string;
  styleKitSnapshot: StyleKit;
  nodeIconBindings: Record<string, string>;
  nodeFontBindings: Record<string, string>;
  nodeColorBindings: Record<string, string>;
  /** Null when only per-node icon decisions exist and no Style Kit checkpoint was applied. */
  appliedAt: string | null;
};

export type StyleKitNormalizationOptions = {
  fallback?: StyleKit;
  now?: string;
  validReferenceIds?: Iterable<string>;
  validRegionIds?: Iterable<string>;
  validIconIds?: Iterable<string>;
  validFontIds?: Iterable<string>;
  validPaletteIds?: Iterable<string>;
  validPatternIds?: Iterable<string>;
};

export type LegacyStyleKitInput = {
  id?: string;
  revision?: number;
  sourceReferenceId?: string | null;
  sourceReferenceIds?: string[];
  palette?: StyleKitPalette | null;
  palettes?: StyleKitPalette[];
  fontId?: string | null;
  fontIds?: string[];
  fontSources?: Record<string, StyleKitFontSource>;
  iconIds?: string[];
  patternIds?: string[];
  regionIds?: string[];
  updatedAt?: string;
  confirmedAt?: string | null;
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalStringSet(values: Iterable<string> | undefined): Set<string> | null {
  return values ? new Set(values) : null;
}

function normalizeIds(value: unknown, validIds: Set<string> | null = null): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map(nonEmptyString)
        .filter((id): id is string => id !== null && (!validIds || validIds.has(id))),
    ),
  );
}

function stableIds(value: unknown): string[] {
  return normalizeIds(value).sort((left, right) => left.localeCompare(right));
}

function normalizePalette(
  value: unknown,
  validReferenceIds: Set<string> | null,
  validRegionIds: Set<string> | null,
  validPaletteIds: Set<string> | null,
): StyleKitPalette | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<StyleKitPalette>;
  const kind = input.kind === "preset" || input.kind === "region" ? input.kind : null;
  const id = nonEmptyString(input.id);
  if (!kind || !id || (kind === "preset" && validPaletteIds && !validPaletteIds.has(id))) return null;

  const sourceReferenceId = nonEmptyString(input.sourceReferenceId);
  const sourceRegionId = nonEmptyString(input.sourceRegionId);
  if (kind === "region") {
    if (sourceRegionId && validRegionIds && !validRegionIds.has(sourceRegionId)) return null;
    if (!sourceRegionId && (!sourceReferenceId || (validReferenceIds && !validReferenceIds.has(sourceReferenceId)))) {
      return null;
    }
  }

  const normalized: StyleKitPalette = {
    kind,
    id,
    colors: normalizeIds(input.colors),
  };
  if (sourceReferenceId && (!validReferenceIds || validReferenceIds.has(sourceReferenceId))) {
    normalized.sourceReferenceId = sourceReferenceId;
  }
  if (sourceRegionId && (!validRegionIds || validRegionIds.has(sourceRegionId))) {
    normalized.sourceRegionId = sourceRegionId;
  }
  return normalized;
}

function paletteIdentity(palette: StyleKitPalette): string {
  return [
    palette.kind,
    palette.id,
    palette.sourceReferenceId ?? "",
    palette.sourceRegionId ?? "",
  ].join("::");
}

function normalizePalettes(
  value: unknown,
  validReferenceIds: Set<string> | null,
  validRegionIds: Set<string> | null,
  validPaletteIds: Set<string> | null,
): StyleKitPalette[] {
  if (!Array.isArray(value)) return [];
  const result: StyleKitPalette[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    const palette = normalizePalette(candidate, validReferenceIds, validRegionIds, validPaletteIds);
    if (!palette) continue;
    const identity = paletteIdentity(palette);
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(palette);
  }
  return result;
}

function normalizeFontSources(
  value: unknown,
  validFontIds: Set<string> | null,
  validReferenceIds: Set<string> | null,
  validRegionIds: Set<string> | null,
  selectedFontIds: Set<string>,
): Record<string, StyleKitFontSource> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, StyleKitFontSource> = {};
  for (const [rawFontId, rawSource] of Object.entries(value as Record<string, unknown>)) {
    const fontId = nonEmptyString(rawFontId);
    if (
      !fontId ||
      !selectedFontIds.has(fontId) ||
      (validFontIds && !validFontIds.has(fontId)) ||
      !rawSource ||
      typeof rawSource !== "object" ||
      Array.isArray(rawSource)
    ) continue;
    const input = rawSource as Partial<StyleKitFontSource>;
    const sourceReferenceId = nonEmptyString(input.sourceReferenceId);
    const sourceRegionId = nonEmptyString(input.sourceRegionId);
    if (!sourceReferenceId || (validReferenceIds && !validReferenceIds.has(sourceReferenceId))) continue;
    result[fontId] = {
      sourceReferenceId,
      ...(sourceRegionId && (!validRegionIds || validRegionIds.has(sourceRegionId))
        ? { sourceRegionId }
        : {}),
    };
  }
  return result;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

/**
 * Produce a stable content fingerprint. Volatile timestamps, confirmation
 * state, the kit id, and the previous fingerprint are intentionally ignored.
 */
export function createStyleKitFingerprint(
  value: Pick<
    StyleKit,
    | "sourceReferenceId"
    | "revision"
    | "sourceReferenceIds"
    | "palette"
    | "palettes"
    | "fontId"
    | "fontIds"
    | "fontSources"
    | "iconIds"
    | "patternIds"
    | "regionIds"
  >,
): string {
  const canonicalPalette = (palette: StyleKitPalette) => ({
        kind: palette.kind,
        id: palette.id,
        // Palette order carries visual meaning and is therefore preserved.
        colors: normalizeIds(palette.colors),
        sourceReferenceId: nonEmptyString(palette.sourceReferenceId),
        sourceRegionId: nonEmptyString(palette.sourceRegionId),
      });
  const palettes = (value.palettes.length ? value.palettes : value.palette ? [value.palette] : [])
    .map(canonicalPalette)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const fontIds = stableIds(value.fontIds.length ? value.fontIds : value.fontId ? [value.fontId] : []);
  const fontSources = Object.fromEntries(
    fontIds
      .map((fontId) => {
        const source = value.fontSources[fontId];
        return source
          ? [fontId, {
              sourceReferenceId: nonEmptyString(source.sourceReferenceId),
              sourceRegionId: nonEmptyString(source.sourceRegionId),
            }] as const
          : null;
      })
      .filter((entry): entry is readonly [string, { sourceReferenceId: string | null; sourceRegionId: string | null }] => Boolean(entry)),
  );
  const canonical = JSON.stringify({
    revision: Number.isFinite(value.revision) ? Math.max(0, Math.floor(value.revision)) : 0,
    sourceReferenceId: nonEmptyString(value.sourceReferenceId),
    sourceReferenceIds: stableIds(value.sourceReferenceIds),
    palettes,
    fontIds,
    fontSources,
    iconIds: stableIds(value.iconIds),
    patternIds: stableIds(value.patternIds),
    regionIds: stableIds(value.regionIds),
  });
  return `style-kit-${fnv1a(canonical)}`;
}

export function createEmptyStyleKit(now = new Date().toISOString()): StyleKit {
  const base = {
    id: "active-style-kit",
    revision: 0,
    sourceReferenceId: null,
    sourceReferenceIds: [],
    palettes: [],
    palette: null,
    fontIds: [],
    fontId: null,
    fontSources: {},
    iconIds: [],
    patternIds: [],
    regionIds: [],
    updatedAt: now,
    confirmedAt: null,
  } satisfies Omit<StyleKit, "fingerprint">;
  return { ...base, fingerprint: createStyleKitFingerprint(base) };
}

export const EMPTY_STYLE_KIT: Readonly<StyleKit> = Object.freeze(
  createEmptyStyleKit("1970-01-01T00:00:00.000Z"),
);

export function normalizeStyleKit(
  value: unknown,
  options: StyleKitNormalizationOptions = {},
): StyleKit {
  const now = options.now ?? new Date().toISOString();
  const fallback = options.fallback ?? createEmptyStyleKit(now);
  const input = value && typeof value === "object" ? value as Partial<StyleKit> : {};
  const validReferenceIds = optionalStringSet(options.validReferenceIds);
  const validRegionIds = optionalStringSet(options.validRegionIds);
  const validIconIds = optionalStringSet(options.validIconIds);
  const validFontIds = optionalStringSet(options.validFontIds);
  const validPaletteIds = optionalStringSet(options.validPaletteIds);
  const validPatternIds = optionalStringSet(options.validPatternIds);

  let sourceReferenceIds = normalizeIds(
    input.sourceReferenceIds ?? fallback.sourceReferenceIds,
    validReferenceIds,
  );
  let sourceReferenceId = nonEmptyString(input.sourceReferenceId ?? fallback.sourceReferenceId);
  if (sourceReferenceId && validReferenceIds && !validReferenceIds.has(sourceReferenceId)) {
    sourceReferenceId = null;
  }
  if (sourceReferenceId && !sourceReferenceIds.includes(sourceReferenceId)) {
    sourceReferenceIds = [sourceReferenceId, ...sourceReferenceIds];
  }
  if (!sourceReferenceId && sourceReferenceIds.length > 0) sourceReferenceId = sourceReferenceIds[0];

  const legacyFontId = nonEmptyString(input.fontId ?? fallback.fontId);
  const fontIds = normalizeIds(
    input.fontIds ?? (legacyFontId ? [legacyFontId] : fallback.fontIds),
    validFontIds,
  );
  const fontId = fontIds[0] ?? null;
  const rawPalettes = input.palettes ?? (
    input.palette !== undefined
      ? input.palette ? [input.palette] : []
      : fallback.palettes.length
        ? fallback.palettes
        : fallback.palette ? [fallback.palette] : []
  );
  const palettes = normalizePalettes(
    rawPalettes,
    validReferenceIds,
    validRegionIds,
    validPaletteIds,
  );
  const updatedAt = nonEmptyString(input.updatedAt) ?? fallback.updatedAt ?? now;
  const confirmedAt = input.confirmedAt === null
    ? null
    : nonEmptyString(input.confirmedAt ?? fallback.confirmedAt);
  const normalizedWithoutFingerprint = {
    id: nonEmptyString(input.id) ?? fallback.id ?? "active-style-kit",
    revision: typeof input.revision === "number" && Number.isFinite(input.revision)
      ? Math.max(0, Math.floor(input.revision))
      : fallback.revision ?? 0,
    sourceReferenceId,
    sourceReferenceIds,
    palettes,
    palette: palettes[0] ?? null,
    fontIds,
    fontId,
    fontSources: normalizeFontSources(
      input.fontSources ?? fallback.fontSources,
      validFontIds,
      validReferenceIds,
      validRegionIds,
      new Set(fontIds),
    ),
    iconIds: normalizeIds(input.iconIds ?? fallback.iconIds, validIconIds),
    patternIds: normalizeIds(input.patternIds ?? fallback.patternIds, validPatternIds),
    regionIds: normalizeIds(input.regionIds ?? fallback.regionIds, validRegionIds),
    updatedAt,
    confirmedAt,
  } satisfies Omit<StyleKit, "fingerprint">;
  return {
    ...normalizedWithoutFingerprint,
    fingerprint: createStyleKitFingerprint(normalizedWithoutFingerprint),
  };
}

/** Build an Active StyleKit from fields used by workspaces saved before StyleKit existed. */
export function createLegacyStyleKit(input: LegacyStyleKitInput = {}): StyleKit {
  return normalizeStyleKit({
    ...input,
    id: input.id ?? "active-style-kit",
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    confirmedAt: input.confirmedAt ?? null,
  });
}

/**
 * Skeletons consume only broad visual references, motifs, and icon choices.
 * Palette and typography are artifact-level edits made later in Edit, so they
 * are intentionally excluded from every Skeleton snapshot.
 */
export function createSkeletonStyleReferenceSet(styleKit: StyleKit): StyleKit {
  return normalizeStyleKit({
    ...styleKit,
    palettes: [],
    palette: null,
    fontIds: [],
    fontId: null,
    fontSources: {},
  }, { now: styleKit.updatedAt });
}

export function createSkeletonStyleApplication(
  skeletonId: string,
  styleKit: StyleKit,
  nodeIconBindings: Record<string, string> = {},
  appliedAt = new Date().toISOString(),
  nodeFontBindings: Record<string, string> = {},
  nodeColorBindings: Record<string, string> = {},
): SkeletonStyleApplication {
  const snapshot = createSkeletonStyleReferenceSet(styleKit);
  return {
    skeletonId,
    styleKitFingerprint: snapshot.fingerprint,
    styleKitSnapshot: snapshot,
    nodeIconBindings: normalizeNodeIconBindings(nodeIconBindings),
    nodeFontBindings: normalizeNodeFontBindings(nodeFontBindings),
    nodeColorBindings: normalizeNodeColorBindings(nodeColorBindings),
    appliedAt,
  };
}

function normalizeNodeIconBindings(
  value: unknown,
  validIconIds: Set<string> | null = null,
): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([nodeId, iconId]) => [nonEmptyString(nodeId), nonEmptyString(iconId)] as const)
      .filter(
        (entry): entry is readonly [string, string] =>
          Boolean(entry[0] && entry[1] && (!validIconIds || validIconIds.has(entry[1]))),
      ),
  );
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function normalizeNodeFontBindings(
  value: unknown,
  validFontIds: Set<string> | null = null,
): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([nodeId, fontId]) => [nonEmptyString(nodeId), nonEmptyString(fontId)] as const)
      .filter(
        (entry): entry is readonly [string, string] =>
          Boolean(entry[0] && entry[1] && (!validFontIds || validFontIds.has(entry[1]))),
      ),
  );
}

function normalizeNodeColorBindings(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([nodeId, color]) => [nonEmptyString(nodeId), nonEmptyString(color)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0] && entry[1] && isHexColor(entry[1]))),
  );
}

export function normalizeSkeletonStyleApplications(
  value: unknown,
  options: {
    now?: string;
    validSkeletonIds?: Iterable<string>;
    validIconIds?: Iterable<string>;
    validFontIds?: Iterable<string>;
  } = {},
): Record<string, SkeletonStyleApplication> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const now = options.now ?? new Date().toISOString();
  const validSkeletonIds = optionalStringSet(options.validSkeletonIds);
  const validIconIds = optionalStringSet(options.validIconIds);
  const validFontIds = optionalStringSet(options.validFontIds);
  const result: Record<string, SkeletonStyleApplication> = {};

  for (const [recordKey, rawApplication] of Object.entries(value as Record<string, unknown>)) {
    if (!rawApplication || typeof rawApplication !== "object") continue;
    const input = rawApplication as Partial<SkeletonStyleApplication>;
    const skeletonId = nonEmptyString(input.skeletonId) ?? nonEmptyString(recordKey);
    if (!skeletonId || (validSkeletonIds && !validSkeletonIds.has(skeletonId))) continue;
    const snapshot = createSkeletonStyleReferenceSet(
      normalizeStyleKit(input.styleKitSnapshot, { now }),
    );
    result[skeletonId] = {
      skeletonId,
      styleKitFingerprint: snapshot.fingerprint,
      styleKitSnapshot: snapshot,
      nodeIconBindings: normalizeNodeIconBindings(input.nodeIconBindings, validIconIds),
      nodeFontBindings: normalizeNodeFontBindings(input.nodeFontBindings, validFontIds),
      nodeColorBindings: normalizeNodeColorBindings(input.nodeColorBindings),
      appliedAt: input.appliedAt === null ? null : nonEmptyString(input.appliedAt) ?? now,
    };
  }
  return result;
}

/**
 * Read bindings scoped to a skeleton, falling back to the legacy workspace-wide
 * map so saved studies keep their existing icon choices until first re-apply.
 */
export function nodeIconBindingsForSkeleton(
  skeletonId: string | null | undefined,
  applications: Record<string, SkeletonStyleApplication>,
  legacyBindings: Record<string, string>,
): Record<string, string> {
  if (!skeletonId) return legacyBindings;
  return applications[skeletonId]?.nodeIconBindings ?? legacyBindings;
}

export function nodeFontBindingsForSkeleton(
  skeletonId: string | null | undefined,
  applications: Record<string, SkeletonStyleApplication>,
  legacyBindings: Record<string, string>,
): Record<string, string> {
  if (!skeletonId) return legacyBindings;
  return applications[skeletonId]?.nodeFontBindings ?? legacyBindings;
}

export function nodeColorBindingsForSkeleton(
  skeletonId: string | null | undefined,
  applications: Record<string, SkeletonStyleApplication>,
  legacyBindings: Record<string, string>,
): Record<string, string> {
  if (!skeletonId) return legacyBindings;
  return applications[skeletonId]?.nodeColorBindings ?? legacyBindings;
}

/**
 * Keep Match mappings aligned with the latest version of a Skeleton. Prompt
 * edits can remove or replace nodes while preserving the candidate id, so
 * bindings whose targets no longer exist must not leak into the updated view.
 */
export function pruneNodeIconBindingsForPlan(
  bindings: Record<string, string>,
  plan: Pick<DiagramPlan, "nodes"> | null | undefined,
): Record<string, string> {
  const scoped = pruneNodeBindingsForPlan(bindings, plan);
  if (!plan) return scoped;
  const containerTargetIds = new Set(
    plan.nodes
      .filter(isDiagramGroupNode)
      .flatMap((node) => [node.id, node.semanticId].filter((id): id is string => Boolean(id))),
  );
  return Object.fromEntries(
    Object.entries(scoped).filter(([targetId]) => !containerTargetIds.has(targetId)),
  );
}

export function pruneNodeFontBindingsForPlan(
  bindings: Record<string, string>,
  plan: Pick<DiagramPlan, "nodes"> | null | undefined,
): Record<string, string> {
  return pruneNodeBindingsForPlan(bindings, plan);
}

export function pruneNodeColorBindingsForPlan(
  bindings: Record<string, string>,
  plan: Pick<DiagramPlan, "nodes"> | null | undefined,
): Record<string, string> {
  return pruneNodeBindingsForPlan(bindings, plan);
}

function pruneNodeBindingsForPlan(
  bindings: Record<string, string>,
  plan: Pick<DiagramPlan, "nodes"> | null | undefined,
): Record<string, string> {
  if (!plan) return bindings;
  const validTargetIds = new Set(
    plan.nodes.flatMap((node) => [node.id, node.semanticId].filter((id): id is string => Boolean(id))),
  );
  return Object.fromEntries(
    Object.entries(bindings).filter(([targetId]) => validTargetIds.has(targetId)),
  );
}

export function styleKitHasSelections(styleKit: StyleKit): boolean {
  return Boolean(
    styleKit.sourceReferenceIds.length ||
    styleKit.palettes.length ||
    styleKit.fontIds.length ||
    styleKit.iconIds.length ||
    styleKit.patternIds.length ||
    styleKit.regionIds.length,
  );
}
