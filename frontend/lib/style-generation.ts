import type { FigureFontReference, FigurePaletteReference } from "./scientific-assets";
import type { StyleKitPalette } from "./style-kit";

/** Stable signature for the optional choices that were actually confirmed in Match. */
export function createMatchedStyleAppearanceFingerprint(args: {
  fontId: string | null;
  paletteId: string | null;
  extractedPalette: StyleKitPalette | null;
}): string {
  const palette = args.extractedPalette?.colors.length
    ? `region:${args.extractedPalette.id}:${args.extractedPalette.colors.join(",")}`
    : args.paletteId
      ? `preset:${args.paletteId}`
      : "none";
  return `font:${args.fontId ?? "none"}|palette:${palette}`;
}

/** Turn optional Match choices into secondary appearance preferences. */
export function buildStyleAppearanceGenerationLines(args: {
  font: FigureFontReference | null;
  palette: FigurePaletteReference | null;
  extractedPalette: StyleKitPalette | null;
}): string[] {
  const lines: string[] = [];
  if (args.font) {
    lines.push(
      `Typography preference (secondary): when compatible, use ${args.font.label} only for text glyphs in figure labels and annotations. This choice must not change the primary Style reference's shapes, strokes, spacing, icon treatment, visual density, or overall character. The primary Style reference remains authoritative.`,
    );
  }
  if (args.extractedPalette?.colors.length) {
    lines.push(
      `Color preference (secondary): use these selected colors mainly as accents when compatible: ${args.extractedPalette.colors.join(", ")}. Preserve the primary Style reference's background, neutrals, color proportions, contrast pattern, and overall visual character; do not repaint the whole figure to fit this palette. Maintain readable contrast.`,
    );
  } else if (args.palette) {
    lines.push(
      `Color preference (secondary): use colors from the ${args.palette.label} palette mainly as accents when compatible: ${args.palette.colors.join(", ")}. Preserve the primary Style reference's background, neutrals, color proportions, contrast pattern, and overall visual character; do not repaint the whole figure to fit this palette. Maintain readable contrast.`,
    );
  }
  return lines;
}
