import {
  findScientificIconReference,
  scientificIconDataUrl,
  scientificIconReferences,
  type ScientificIconCategory,
  type ScientificIconReference,
  type ScientificIconReferenceId,
} from "./scientific-assets";
import type { CustomIconReference } from "./types";
import { normalizeStyleKit } from "./style-kit";
import type { CreativeCanvasState, WorkspaceState } from "./workspace-state";

export type WorkspaceIconAsset = {
  id: ScientificIconReferenceId;
  label: string;
  description: string;
  category: ScientificIconCategory | "custom";
  role: string;
  keywords: string[];
  aliases: string[];
  dataUrl: string;
  source: "custom-crop" | ScientificIconReference["source"];
  license: ScientificIconReference["license"] | "User-provided";
  custom: boolean;
  kind: "catalog" | "icon" | "style-crop";
  sourceReferenceId?: string;
  sourceRegionId?: string;
  contentHash?: string;
  stale?: boolean;
};

function normalizeTerms(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u4e00-\u9fff]+/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

export function workspaceIconContentHash(value: string | null | undefined) {
  if (!value) return "empty";
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b);
  }
  return `${value.length.toString(36)}-${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

export function customIconKind(icon: Pick<CustomIconReference, "id" | "tags" | "kind">): "icon" | "style-crop" {
  if (icon.kind === "icon" || icon.kind === "style-crop") return icon.kind;
  if (icon.id.startsWith("custom-icon-")) return "icon";
  if (icon.id.startsWith("custom-screenshot-")) return "style-crop";
  return icon.tags.some((tag) => {
    const normalized = tag.toLowerCase();
    return normalized.includes("style crop") || normalized.includes("crop from style");
  })
    ? "style-crop"
    : "icon";
}

export function normalizeCustomIconReference(icon: CustomIconReference): CustomIconReference {
  return {
    ...icon,
    kind: customIconKind(icon),
    contentHash: icon.contentHash || workspaceIconContentHash(icon.cropDataUrl),
  };
}

export function normalizeCustomIconReferences(icons: CustomIconReference[] | null | undefined) {
  return (icons ?? []).map(normalizeCustomIconReference);
}

function catalogAsset(icon: ScientificIconReference): WorkspaceIconAsset {
  return {
    id: icon.id,
    label: icon.label,
    description: icon.description,
    category: icon.category,
    role: icon.role,
    keywords: icon.keywords,
    aliases: icon.aliases,
    dataUrl: scientificIconDataUrl(icon.id),
    source: icon.source,
    license: icon.license,
    custom: false,
    kind: "catalog",
  };
}

export function customIconAsset(icon: CustomIconReference): WorkspaceIconAsset {
  const normalized = normalizeCustomIconReference(icon);
  const kind = customIconKind(normalized);
  return {
    id: normalized.id,
    label: normalized.label,
    description: normalized.description,
    category: "custom",
    role: kind === "icon" ? "science" : "visual motif",
    keywords: Array.from(new Set([...normalized.tags, normalized.label].flatMap(normalizeTerms))),
    aliases: normalized.tags,
    // Older workspaces can contain a custom icon record before its IndexedDB
    // crop has been restored. Never let that transient empty value reach an
    // <img src>; use the catalog's deterministic unavailable preview instead.
    dataUrl: normalized.cropDataUrl || scientificIconDataUrl(normalized.id),
    source: "custom-crop",
    license: "User-provided",
    custom: true,
    kind,
    sourceReferenceId: normalized.sourceReferenceId,
    sourceRegionId: normalized.sourceRegionId,
    contentHash: normalized.contentHash,
    stale: Boolean(normalized.stale),
  };
}

export function resolveWorkspaceIcon(
  id: ScientificIconReferenceId | null | undefined,
  customIcons: CustomIconReference[] | null | undefined,
): WorkspaceIconAsset | null {
  if (!id) return null;
  const custom = customIcons?.find((icon) => icon.id === id);
  if (custom) return customIconAsset(custom);
  const catalog = findScientificIconReference(id);
  return catalog ? catalogAsset(catalog) : null;
}

export function workspaceIconDataUrl(
  id: ScientificIconReferenceId,
  customIcons: CustomIconReference[] | null | undefined,
) {
  return resolveWorkspaceIcon(id, customIcons)?.dataUrl ?? scientificIconDataUrl(id);
}

export function customWorkspaceIconAssets(customIcons: CustomIconReference[] | null | undefined) {
  return normalizeCustomIconReferences(customIcons).map(customIconAsset);
}

function customMatchScore(asset: WorkspaceIconAsset, text: string) {
  const queryTerms = normalizeTerms(text);
  if (queryTerms.length === 0) return 0;
  const label = asset.label.toLowerCase();
  const haystack = `${asset.label} ${asset.description} ${asset.keywords.join(" ")} ${asset.aliases.join(" ")}`.toLowerCase();
  return queryTerms.reduce((score, term) => {
    if (label === term) return score + 12;
    if (label.includes(term)) return score + 8;
    if (asset.keywords.some((keyword) => keyword === term)) return score + 6;
    return haystack.includes(term) ? score + 2 : score;
  }, 0);
}

export function scoreWorkspaceIconMatch(
  asset: WorkspaceIconAsset,
  input: { label: string; role?: string | null; group?: string | null },
) {
  return customMatchScore(asset, [input.label, input.role, input.group].filter(Boolean).join(" "));
}

export function searchCustomWorkspaceIcons(customIcons: CustomIconReference[] | null | undefined, query = "") {
  const assets = customWorkspaceIconAssets(customIcons);
  const trimmed = query.trim();
  if (!trimmed) return assets;
  return assets
    .map((asset) => ({ asset, score: customMatchScore(asset, trimmed) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.asset.label.localeCompare(right.asset.label) || left.asset.id.localeCompare(right.asset.id))
    .map((entry) => entry.asset);
}

export function recommendCustomWorkspaceIcons(
  customIcons: CustomIconReference[] | null | undefined,
  input: { label: string; role?: string | null; group?: string | null },
  limit = 3,
) {
  const text = [input.label, input.role, input.group].filter(Boolean).join(" ");
  return customWorkspaceIconAssets(customIcons)
    .filter((asset) => !asset.stale)
    .map((asset) => ({ asset, score: customMatchScore(asset, text) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.asset.id.localeCompare(right.asset.id))
    .slice(0, limit)
    .map((entry) => entry.asset);
}

export function allWorkspaceIconAssets(customIcons: CustomIconReference[] | null | undefined) {
  return [
    ...customWorkspaceIconAssets(customIcons),
    ...scientificIconReferences.map(catalogAsset),
  ];
}

function clearIconFromCanvas(canvas: CreativeCanvasState, iconId: string): CreativeCanvasState {
  const hasDependency = canvas.items.some((item) =>
    (item.type === "asset" && item.assetKind === "icon" && item.assetId === iconId) ||
    item.sourceIconReferenceId === iconId ||
    item.sourceIconReferenceIds?.includes(iconId),
  );
  if (!hasDependency) return canvas;
  const items = canvas.items
    .filter((item) => !(item.type === "asset" && item.assetKind === "icon" && item.assetId === iconId))
    .map((item) => ({
      ...item,
      sourceIconReferenceId: item.sourceIconReferenceId === iconId ? undefined : item.sourceIconReferenceId,
      sourceIconReferenceIds: item.sourceIconReferenceIds?.filter((id) => id !== iconId),
    }));
  const availableIds = new Set(items.map((item) => item.id));
  return {
    ...canvas,
    items,
    selectedItemId: canvas.selectedItemId && availableIds.has(canvas.selectedItemId) ? canvas.selectedItemId : null,
    selectedItemIds: canvas.selectedItemIds.filter((id) => availableIds.has(id)),
  };
}

/** Removes one workspace-local icon and every live dependency, while named versions remain recoverable snapshots. */
export function removeCustomIconFromWorkspaceState(
  state: WorkspaceState,
  iconId: string,
  status = "Removed custom icon.",
): WorkspaceState {
  const now = new Date().toISOString();
  const nodeIconBindings = Object.fromEntries(
    Object.entries(state.nodeIconBindings).filter(([, bindingId]) => bindingId !== iconId),
  );
  const activeStyleKit = normalizeStyleKit({
    ...state.activeStyleKit,
    iconIds: state.activeStyleKit.iconIds.filter((id) => id !== iconId),
    patternIds: state.activeStyleKit.patternIds.filter((id) => id !== iconId),
    updatedAt: now,
    confirmedAt: state.activeStyleKit.iconIds.includes(iconId) || state.activeStyleKit.patternIds.includes(iconId)
      ? null
      : state.activeStyleKit.confirmedAt,
  });
  const skeletonStyleApplications = Object.fromEntries(
    Object.entries(state.skeletonStyleApplications).map(([skeletonId, application]) => {
      const styleKitSnapshot = normalizeStyleKit({
        ...application.styleKitSnapshot,
        iconIds: application.styleKitSnapshot.iconIds.filter((id) => id !== iconId),
        patternIds: application.styleKitSnapshot.patternIds.filter((id) => id !== iconId),
      });
      return [skeletonId, {
        ...application,
        styleKitSnapshot,
        styleKitFingerprint: styleKitSnapshot.fingerprint,
        nodeIconBindings: Object.fromEntries(
          Object.entries(application.nodeIconBindings).filter(([, bindingId]) => bindingId !== iconId),
        ),
      }];
    }),
  );
  const iconReferenceIds = state.iconReferenceIds.filter((id) => id !== iconId);
  const fallbackIconId = iconReferenceIds[0] ?? (state.iconReferenceId === iconId ? "robot" : state.iconReferenceId);
  const creativeCanvases = state.creativeCanvases.map((document) => {
    const nextCanvas = clearIconFromCanvas(document.canvas, iconId);
    return nextCanvas === document.canvas
      ? document
      : {
          ...document,
          canvas: nextCanvas,
          undoStack: [...document.undoStack, document.canvas].slice(-80),
          updatedAt: new Date().toISOString(),
        };
  });
  const activeDocument = creativeCanvases.find((document) => document.id === state.activeCreativeCanvasId) ?? creativeCanvases[0];
  const fallbackCanvas = clearIconFromCanvas(state.creativeCanvas, iconId);
  return {
    ...state,
    customIconReferences: state.customIconReferences.filter((icon) => icon.id !== iconId),
    referenceRegions: state.referenceRegions.map((region) =>
      region.customIconId === iconId
        ? { ...region, customIconId: undefined, selectedIconSource: "preset" }
        : region,
    ),
    nodeIconBindings,
    activeStyleKit,
    skeletonStyleApplications,
    recentIconIds: state.recentIconIds.filter((id) => id !== iconId),
    iconReferenceIds,
    iconReferenceId: fallbackIconId,
    creativeCanvases,
    creativeCanvas: activeDocument?.canvas ?? fallbackCanvas,
    creativeCanvasUndoStack: activeDocument?.undoStack ?? [...state.creativeCanvasUndoStack, state.creativeCanvas].slice(-80),
    status,
  };
}
