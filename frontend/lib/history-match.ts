import { figureFontReferences, figurePaletteReferences } from "./scientific-assets";
import type { StyleKit, StyleKitPalette } from "./style-kit";

type HistoryMatchSnapshot = {
  activeStyleKit?: StyleKit | null;
  nodeIconBindings?: Record<string, string> | null;
  fontReferenceId?: string | null;
  paletteReferenceId?: string | null;
  matchedStylePalette?: StyleKitPalette | null;
};

export type HistoryMatchIngredients = {
  iconIds: string[];
  boundIconCount: number;
  font: { id: string; label: string; cssFamily: string } | null;
  palette: { key: string; label: string; colors: string[] } | null;
};

/**
 * Resolve the choices that were confirmed in Match from one immutable History
 * snapshot. Unknown legacy IDs are kept visible instead of silently dropping
 * the corresponding card.
 */
export function historyMatchIngredients(snapshot: HistoryMatchSnapshot): HistoryMatchIngredients {
  const bindings = snapshot.nodeIconBindings ?? {};
  const iconIds = Array.from(new Set([
    ...(snapshot.activeStyleKit?.iconIds ?? []),
    ...Object.values(bindings),
  ])).filter(Boolean);

  const fontId = snapshot.fontReferenceId ?? null;
  const knownFont = fontId
    ? figureFontReferences.find((candidate) => candidate.id === fontId) ?? null
    : null;
  const font = fontId
    ? {
        id: fontId,
        label: knownFont?.label ?? fontId,
        cssFamily: knownFont?.cssFamily ?? "inherit",
      }
    : null;

  const matchedPalette = snapshot.matchedStylePalette ?? null;
  const presetId = matchedPalette?.kind === "preset"
    ? matchedPalette.id
    : snapshot.paletteReferenceId ?? null;
  const knownPreset = presetId
    ? figurePaletteReferences.find((candidate) => candidate.id === presetId) ?? null
    : null;
  const palette = matchedPalette
    ? {
        key: [
          matchedPalette.kind,
          matchedPalette.id,
          matchedPalette.sourceReferenceId ?? "",
          matchedPalette.sourceRegionId ?? "",
          ...matchedPalette.colors,
        ].join(":"),
        label: matchedPalette.kind === "preset"
          ? knownPreset?.label ?? matchedPalette.id
          : matchedPalette.id.startsWith("whole-image")
            ? "From the Style image"
            : matchedPalette.sourceRegionId
              ? "Style crop colors"
              : "Matched colors",
        colors: [...matchedPalette.colors],
      }
    : presetId
      ? {
          key: `preset:${presetId}`,
          label: knownPreset?.label ?? presetId,
          colors: [...(knownPreset?.colors ?? [])],
        }
      : null;

  return {
    iconIds,
    boundIconCount: Object.keys(bindings).length,
    font,
    palette,
  };
}
