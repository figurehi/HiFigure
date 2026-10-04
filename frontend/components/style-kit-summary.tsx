"use client";

import { useState } from "react";
import {
  figureFontReferences,
  figurePaletteReferences,
} from "../lib/scientific-assets";
import type { StyleKit } from "../lib/style-kit";
import type { CustomIconReference, ReferenceItem } from "../lib/types";
import { workspaceIconDataUrl } from "../lib/workspace-icon-assets";

export type StyleKitSummaryProps = {
  kit: StyleKit;
  references: ReferenceItem[];
  customIcons?: CustomIconReference[];
  compact?: boolean;
  collapsible?: boolean;
  showAppearance?: boolean;
  title?: string;
  confirmLabel?: string;
  applyLabel?: string;
  guideAnchor?: string;
  stale?: boolean;
  onConfirm?: () => void;
  onClearSource?: () => void;
  onRemovePalette?: () => void;
  onRemoveFont?: () => void;
  onRemoveVisualVocabulary?: () => void;
  onEdit?: () => void;
  onApply?: () => void;
};

export function StyleKitSummary({
  kit,
  references,
  customIcons = [],
  compact = false,
  collapsible = false,
  showAppearance = true,
  title = "Current Style Kit",
  confirmLabel = "Use this Style Kit",
  applyLabel = "Apply to Skeleton",
  guideAnchor,
  stale = false,
  onConfirm,
  onClearSource,
  onRemovePalette,
  onRemoveFont,
  onRemoveVisualVocabulary,
  onEdit,
  onApply,
}: StyleKitSummaryProps) {
  const [collapsed, setCollapsed] = useState(false);
  const primarySource = references.find((reference) => reference.id === kit.sourceReferenceId) ?? null;
  const primarySourceImage = primarySource?.imageDataUrl ?? primarySource?.thumbnailUrl ?? null;
  const selectedPalettes = kit.palettes.length ? kit.palettes : kit.palette ? [kit.palette] : [];
  const selectedFonts = (kit.fontIds.length ? kit.fontIds : kit.fontId ? [kit.fontId] : [])
    .map((fontId) => figureFontReferences.find((candidate) => candidate.id === fontId) ?? null)
    .filter((font): font is NonNullable<typeof font> => Boolean(font));
  const selectedIconPreviews = kit.iconIds.slice(0, 5).map((id) => ({
    id,
    src: workspaceIconDataUrl(id, customIcons),
  }));
  const selectedMotifPreviews = customIcons
    .filter((icon) => kit.patternIds.includes(icon.id))
    .filter((icon) => !kit.iconIds.includes(icon.id))
    .filter((icon) => Boolean(icon.cropDataUrl))
    .slice(0, 5);
  const selectedVisualCount = kit.iconIds.length + customIcons.filter(
    (icon) => kit.patternIds.includes(icon.id) && !kit.iconIds.includes(icon.id) && Boolean(icon.cropDataUrl),
  ).length;
  const actionGuideTarget = onConfirm ? "confirm" : onEdit ? "edit" : onApply ? "apply" : null;

  return (
    <section className={`style-kit-summary ${compact ? "is-compact" : ""} ${showAppearance ? "" : "is-style-only"} ${stale ? "is-stale" : ""}`}>
      <header className="style-kit-summary-head">
        <div>
          <span className="label-text">{showAppearance ? "Style Kit" : "Style reference"}</span>
          <h2>{title}</h2>
        </div>
        <span className="style-kit-summary-head-actions">
          <span className={`style-kit-status ${stale ? "is-stale" : kit.confirmedAt ? "is-confirmed" : "is-draft"}`}>
            {stale ? "Update needed" : kit.confirmedAt ? "Confirmed" : "Draft"}
          </span>
          {collapsible ? (
            <button
              type="button"
              className="style-kit-collapse"
              onClick={() => setCollapsed((value) => !value)}
              aria-expanded={!collapsed}
            >
              {collapsed ? "Show" : "Hide"}
            </button>
          ) : null}
        </span>
      </header>

      {!collapsed ? <div className="style-kit-summary-grid">
        <div className="style-kit-summary-source">
          <small>Source</small>
          <span className="style-kit-summary-source-row">
            {primarySourceImage ? <img src={primarySourceImage} alt="" /> : null}
            <strong>{primarySource?.title ?? "No style source"}</strong>
          </span>
          {kit.sourceReferenceIds.length > 1 ? <span>+{kit.sourceReferenceIds.length - 1} supporting</span> : null}
        </div>
        {showAppearance ? <div>
          <small>Palettes · Edit collection</small>
          <strong>{selectedPalettes.length ? `${selectedPalettes.length} saved` : "None"}</strong>
          {selectedPalettes.length ? (
            <span className="style-kit-summary-palette-list" aria-label="Selected palette colors">
              {selectedPalettes.slice(0, 3).map((palette) => {
                const preset = palette.kind === "preset"
                  ? figurePaletteReferences.find((candidate) => candidate.id === palette.id) ?? null
                  : null;
                const source = references.find((reference) => reference.id === palette.sourceReferenceId) ?? null;
                return (
                  <span key={`${palette.kind}-${palette.id}-${palette.sourceRegionId ?? "whole"}`} className="style-kit-summary-palette-row">
                    <span className="style-kit-summary-swatches">
                      {palette.colors.slice(0, 6).map((color) => <i key={color} style={{ background: color }} />)}
                    </span>
                    <small>{preset?.label ?? "Image palette"}{source ? ` · ${source.title}` : ""}</small>
                  </span>
                );
              })}
            </span>
          ) : null}
          {selectedPalettes.length && onRemovePalette ? <button type="button" className="style-kit-item-remove" onClick={onRemovePalette}>Remove all</button> : null}
        </div> : null}
        {showAppearance ? <div>
          <small>Typography · Edit collection</small>
          <strong>{selectedFonts.length ? selectedFonts.map((font) => font.label).join(" · ") : "None"}</strong>
          {selectedFonts.slice(0, 3).map((font) => {
            const source = references.find((reference) => reference.id === kit.fontSources[font.id]?.sourceReferenceId) ?? null;
            return <span key={font.id} style={{ fontFamily: font.cssFamily }}>{font.label}{source ? ` · ${source.title}` : ""}</span>;
          })}
          {selectedFonts.length && onRemoveFont ? <button type="button" className="style-kit-item-remove" onClick={onRemoveFont}>Remove all</button> : null}
        </div> : null}
        <div>
          <small>Visual vocabulary</small>
          <strong>{kit.iconIds.length} icons · {kit.patternIds.length} patterns</strong>
          <span>{kit.regionIds.length} selected area{kit.regionIds.length === 1 ? "" : "s"}</span>
          {(selectedIconPreviews.length || selectedMotifPreviews.length) ? (
            <span className="style-kit-summary-media" aria-label="Selected icons and crops">
              {selectedIconPreviews.filter((preview) => Boolean(preview.src)).map((preview) => <img key={preview.id} src={preview.src} alt="" />)}
              {selectedIconPreviews.length < 5 ? selectedMotifPreviews.slice(0, 5 - selectedIconPreviews.length).map((icon) => <img key={icon.id} src={icon.cropDataUrl} alt="" />) : null}
              {selectedVisualCount > 5 ? (
                <i className="style-kit-summary-overflow">+{selectedVisualCount - 5}</i>
              ) : null}
            </span>
          ) : null}
          {(kit.iconIds.length || kit.patternIds.length || kit.regionIds.length) && onRemoveVisualVocabulary ? (
            <button type="button" className="style-kit-item-remove" onClick={onRemoveVisualVocabulary}>Remove</button>
          ) : null}
        </div>
      </div> : (
        <p className="style-kit-collapsed-copy">
          {showAppearance ? `${selectedPalettes.length} palettes · ${selectedFonts.length} fonts · ` : ""}{kit.iconIds.length} icons
        </p>
      )}

      {!collapsed && (onConfirm || onEdit || onApply || onClearSource) ? (
        <div className="style-kit-summary-actions">
          {onConfirm ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onConfirm}
              data-guide-anchor={actionGuideTarget === "confirm" ? guideAnchor : undefined}
            >
              {confirmLabel}
            </button>
          ) : null}
          {onApply ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onApply}
              data-guide-anchor={actionGuideTarget === "apply" ? guideAnchor : undefined}
            >
              {applyLabel}
            </button>
          ) : null}
          {onEdit ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onEdit}
              data-guide-anchor={actionGuideTarget === "edit" ? guideAnchor : undefined}
            >
              {showAppearance ? "Edit Style Kit" : "Edit style references"}
            </button>
          ) : null}
          {onClearSource && kit.sourceReferenceId ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClearSource}>
              Clear source
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
