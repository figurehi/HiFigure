"use client";

import { useMemo, useState } from "react";
import {
  figureFontReferences,
  figurePaletteReferences,
  type FigureFontReferenceId,
  type ScientificIconReferenceId,
} from "../lib/scientific-assets";
import { isDiagramGroupNode } from "../lib/diagram-xml";
import { createEmptyStyleKit, type StyleKitPalette } from "../lib/style-kit";
import type { DiagramPlan } from "../lib/types";
import {
  resolveWorkspaceIcon,
  scoreWorkspaceIconMatch,
  type WorkspaceIconAsset,
} from "../lib/workspace-icon-assets";
import {
  appendStudyEvent,
  useWorkspaceState,
} from "../lib/workspace-state";

function stylePaletteKey(palette: StyleKitPalette): string {
  return [palette.kind, palette.id, palette.sourceReferenceId ?? "", palette.sourceRegionId ?? ""].join("::");
}

function stylePaletteLabel(palette: StyleKitPalette, index: number): string {
  if (palette.kind === "preset") {
    return figurePaletteReferences.find((candidate) => candidate.id === palette.id)?.label ?? palette.id;
  }
  if (palette.id.startsWith("whole-image")) return "From the Style image";
  if (palette.sourceRegionId) return "Style crop colors";
  return `Style palette ${index + 1}`;
}

function isSameStylePalette(left: StyleKitPalette, right: StyleKitPalette): boolean {
  if (left.kind !== right.kind || left.id !== right.id) return false;
  if (left.kind === "preset") return true;
  return stylePaletteKey(left) === stylePaletteKey(right);
}

export function ScientificStructurePanel({
  focusedModuleId,
  onFocusModule,
  diagramPlan = null,
  skeletonId = null,
  presentation = "stacked",
}: {
  focusedModuleId?: string | null;
  onFocusModule?: (moduleId: string) => void;
  diagramPlan?: DiagramPlan | null;
  skeletonId?: string | null;
  presentation?: "stacked" | "mapping";
} = {}) {
  const { state, setState } = useWorkspaceState();
  const mappingModules = useMemo(
    () => (diagramPlan?.nodes ?? [])
      .filter((node) => !isDiagramGroupNode(node))
      .map((node) => ({
          id: node.id,
          label: node.label || node.id,
          role: node.role || "skeleton node",
          group: node.groupId || "ungrouped",
          confirmed: Boolean(node.confirmed),
        })),
    [diagramPlan],
  );
  const [localSelectedModuleId, setLocalSelectedModuleId] = useState(mappingModules[0]?.id ?? "");
  const [figureStyleTab, setFigureStyleTab] = useState<"font" | "palette" | null>(null);
  const selectedModuleId = focusedModuleId && mappingModules.some((module) => module.id === focusedModuleId)
    ? focusedModuleId
    : localSelectedModuleId;
  const selectedModule = mappingModules.find((module) => module.id === selectedModuleId)
    ?? mappingModules[0]
    ?? null;
  const scopedApplication = skeletonId ? state.skeletonStyleApplications[skeletonId] ?? null : null;
  const candidateStyleKit = presentation === "mapping"
    ? state.activeStyleKit
    : scopedApplication?.appliedAt
      ? scopedApplication.styleKitSnapshot
      : state.activeStyleKit;
  const styleKitIcons = useMemo(
    () => candidateStyleKit.iconIds
      .map((iconId) => resolveWorkspaceIcon(iconId, state.customIconReferences))
      .filter((icon): icon is WorkspaceIconAsset => icon !== null && icon.kind !== "style-crop"),
    [candidateStyleKit.iconIds, state.customIconReferences],
  );
  const styleKitIconMatches = useMemo(() => {
    if (!selectedModule) return styleKitIcons.map((icon) => ({ icon, score: 0 }));
    const input = {
      label: selectedModule.label,
      role: selectedModule.role,
      group: selectedModule.group,
    };
    return styleKitIcons
      .map((icon) => ({ icon, score: scoreWorkspaceIconMatch(icon, input) }))
      .sort((left, right) => right.score - left.score || left.icon.id.localeCompare(right.icon.id));
  }, [selectedModule, styleKitIcons]);
  // These are the icons the author explicitly kept in Style, not a suggestion
  // list. Match must expose the complete set so none of those choices vanish.
  const selectedStyleKitIcons = styleKitIconMatches;
  const styleKitFontIds = candidateStyleKit.fontIds.length
    ? candidateStyleKit.fontIds
    : candidateStyleKit.fontId ? [candidateStyleKit.fontId] : [];
  const styleKitFonts = styleKitFontIds.flatMap((fontId) => {
    const font = figureFontReferences.find((candidate) => candidate.id === fontId);
    return font ? [font] : [];
  });
  const styleKitPalettes = candidateStyleKit.palettes.length
    ? candidateStyleKit.palettes
    : candidateStyleKit.palette ? [candidateStyleKit.palette] : [];
  const matchedFigureFont = figureFontReferences.find((font) => font.id === state.fontReferenceId) ?? null;
  const matchedPresetPalette = figurePaletteReferences.find((palette) => palette.id === state.paletteReferenceId) ?? null;
  const matchedFigurePalette = state.matchedStylePalette ?? (matchedPresetPalette
    ? {
        kind: "preset" as const,
        id: matchedPresetPalette.id,
        colors: matchedPresetPalette.colors,
      }
    : null);
  const matchedFigurePaletteLabel = state.matchedStylePalette
    ? stylePaletteLabel(state.matchedStylePalette, 0)
    : matchedPresetPalette?.label ?? null;
  const scopedBindings = skeletonId
    ? state.skeletonStyleApplications[skeletonId]?.nodeIconBindings ?? {}
    : state.nodeIconBindings;
  const currentBindingId = selectedModule ? scopedBindings[selectedModule.id] : undefined;
  const currentIcon = resolveWorkspaceIcon(currentBindingId, state.customIconReferences);
  const currentIconId = currentIcon?.id;
  const isMapping = presentation === "mapping";

  function selectModule(moduleId: string) {
    const module = mappingModules.find((item) => item.id === moduleId);
    if (!module) return;
    setLocalSelectedModuleId(moduleId);
    onFocusModule?.(moduleId);
  }

  function patchSkeletonStyleApplication(
    current: typeof state,
    patch: {
      nodeIconBindings?: Record<string, string>;
    },
  ) {
    if (!skeletonId) {
      return {
        skeletonStyleApplications: current.skeletonStyleApplications,
        nodeIconBindings: patch.nodeIconBindings ?? current.nodeIconBindings,
      };
    }
    const existing = current.skeletonStyleApplications[skeletonId];
    const bindingOnlyStyleKit = createEmptyStyleKit();
    const skeletonStyleApplications = {
      ...current.skeletonStyleApplications,
      [skeletonId]: {
        ...(existing ?? {
          skeletonId,
          styleKitFingerprint: bindingOnlyStyleKit.fingerprint,
          styleKitSnapshot: bindingOnlyStyleKit,
          appliedAt: null,
          nodeIconBindings: {},
          nodeFontBindings: {},
          nodeColorBindings: {},
        }),
        nodeIconBindings: patch.nodeIconBindings ?? existing?.nodeIconBindings ?? {},
      },
    };
    return {
      skeletonStyleApplications,
      nodeIconBindings: patch.nodeIconBindings ?? current.nodeIconBindings,
    };
  }

  function bindIcon(iconId: ScientificIconReferenceId | null) {
    if (!selectedModule) return;
    const selectedIcon = resolveWorkspaceIcon(iconId, state.customIconReferences);
    setState((current) => {
      const currentBindings = skeletonId
        ? current.skeletonStyleApplications[skeletonId]?.nodeIconBindings ?? {}
        : current.nodeIconBindings;
      const previous = currentBindings[selectedModule.id];
      const nodeIconBindings = { ...currentBindings };
      if (iconId) nodeIconBindings[selectedModule.id] = iconId;
      else delete nodeIconBindings[selectedModule.id];
      const patched = patchSkeletonStyleApplication(current, { nodeIconBindings });
      let next = {
        ...current,
        ...patched,
        iconReferenceIds: iconId
          ? Array.from(new Set([...current.iconReferenceIds, iconId]))
          : current.iconReferenceIds,
        iconReferenceId: iconId ?? current.iconReferenceId,
        recentIconIds: iconId
          ? [iconId, ...current.recentIconIds.filter((id) => id !== iconId)].slice(0, 12)
          : current.recentIconIds,
        status: iconId
          ? `Bound an icon to "${selectedModule.label}". Author confirmation is still required.`
          : `Removed the icon from "${selectedModule.label}".`,
      };
      return appendStudyEvent(next, {
        stage: "skeleton",
        type: iconId ? (previous ? "icon_replaced" : "icon_confirmed") : "icon_removed",
        targetIds: [selectedModule.id, ...(iconId ? [iconId] : [])],
        result: iconId ?? "none",
        metadata: {
          iconCatalogVersion: current.iconCatalogVersion,
          iconSource: selectedIcon?.source ?? "none",
          sourceReferenceId: selectedIcon?.sourceReferenceId ?? null,
          sourceRegionId: selectedIcon?.sourceRegionId ?? null,
        },
      });
    });
  }

  function selectFigureFont(fontId: FigureFontReferenceId | null) {
    const font = fontId ? figureFontReferences.find((entry) => entry.id === fontId) ?? null : null;
    setState((current) => appendStudyEvent({
      ...current,
      fontReferenceId: font?.id ?? null,
      status: font
        ? `${font.label} matched as the optional figure font.`
        : "Figure font match cleared; generation will infer typography from the Style reference.",
    }, {
      stage: "skeleton",
      type: font ? "figure_font_selected" : "figure_font_cleared",
      targetIds: font ? [font.id] : [],
      result: font ? "selected" : "none",
      metadata: { surface: "match" },
    }));
  }

  function selectFigurePalette(palette: StyleKitPalette | null) {
    const preset = palette?.kind === "preset"
      ? figurePaletteReferences.find((entry) => entry.id === palette.id) ?? null
      : null;
    const label = palette ? stylePaletteLabel(palette, styleKitPalettes.indexOf(palette)) : null;
    setState((current) => appendStudyEvent({
      ...current,
      paletteReferenceId: preset?.id ?? null,
      matchedStylePalette: palette?.kind === "region" ? palette : null,
      status: palette
        ? `${label ?? "Palette"} matched as the optional figure palette.`
        : "Figure color match cleared; generation will infer colors from the Style reference.",
    }, {
      stage: "skeleton",
      type: palette ? "figure_palette_selected" : "figure_palette_cleared",
      targetIds: palette ? [palette.id] : [],
      result: palette?.kind ?? "none",
      metadata: { surface: "match", colors: palette?.colors.length ?? 0 },
    }));
  }

  if (mappingModules.length === 0) {
    return (
      <section className="scientific-structure-panel">
        <span className="label-text">Text and icon mapping</span>
        <p className="dashboard-empty">Generate a skeleton with labeled nodes to choose matching icons here.</p>
      </section>
    );
  }

  return (
    <>
    <section className={`scientific-structure-panel ${presentation === "mapping" ? "is-mapping-layout" : ""}`}>
      <header>
        <div>
          <span className="label-text">{presentation === "mapping" ? "Match" : "Skeleton labels"}</span>
          <h2 title={isMapping ? selectedModule?.label : undefined}>
            {presentation === "mapping" ? (selectedModule?.label ?? "Select a module") : "Text → icon"}
          </h2>
        </div>
        <span className="badge">{mappingModules.length}</span>
      </header>
      {presentation === "mapping" ? (
        <div className="match-figure-style">
          <div className="match-figure-style-head">
            <strong>Font &amp; Color</strong>
            <small>Optional — leave either one unmatched to let generation infer it.</small>
          </div>
          <div className="match-figure-style-strip">
            <button
              type="button"
              className={`match-figure-style-item ${figureStyleTab === "palette" ? "is-open" : ""}`}
              onClick={() => setFigureStyleTab((current) => current === "palette" ? null : "palette")}
              aria-expanded={figureStyleTab === "palette"}
            >
              <small>Figure color · optional</small>
              <strong>{matchedFigurePaletteLabel ?? "Not matched"}</strong>
              <span className="match-figure-palette" aria-label={matchedFigurePaletteLabel ?? "No color matched"}>
                {matchedFigurePalette?.colors.length
                  ? matchedFigurePalette.colors.slice(0, 8).map((color) => (
                      <i key={color} style={{ backgroundColor: color }} aria-hidden="true" />
                    ))
                  : <span className="dashboard-empty">Follow Style reference</span>}
              </span>
              <em>{figureStyleTab === "palette" ? "Close" : matchedFigurePalette ? "Change" : "Match"}</em>
            </button>
            <button
              type="button"
              className={`match-figure-style-item ${figureStyleTab === "font" ? "is-open" : ""}`}
              onClick={() => setFigureStyleTab((current) => current === "font" ? null : "font")}
              aria-expanded={figureStyleTab === "font"}
            >
              <small>Figure font · optional</small>
              <strong>{matchedFigureFont?.label ?? "Not matched"}</strong>
              {matchedFigureFont ? (
                <span
                  className="match-figure-style-sample"
                  style={{ fontFamily: matchedFigureFont.cssFamily }}
                >
                  Aa Method Flow
                </span>
              ) : (
                <span className="match-figure-style-follow">
                  <span className="dashboard-empty">Follow Style reference</span>
                </span>
              )}
              <em>{figureStyleTab === "font" ? "Close" : matchedFigureFont ? "Change" : "Match"}</em>
            </button>
          </div>
          {figureStyleTab === "font" ? (
            <div className="match-figure-style-options" role="group" aria-label="Optional figure font match">
              <button
                type="button"
                className={!matchedFigureFont ? "is-selected" : ""}
                onClick={() => selectFigureFont(null)}
              >
                <strong>Do not match a font</strong>
                <small>Use the Style image and model default instead.</small>
              </button>
              {styleKitFonts.map((font) => (
                <button
                  key={font.id}
                  type="button"
                  className={font.id === matchedFigureFont?.id ? "is-selected" : ""}
                  aria-pressed={font.id === matchedFigureFont?.id}
                  onClick={() => selectFigureFont(font.id === matchedFigureFont?.id ? null : font.id)}
                >
                  <strong style={{ fontFamily: font.cssFamily }}>
                    {font.label}
                    <em className="match-style-origin">From Style</em>
                  </strong>
                  <small>{font.id === matchedFigureFont?.id ? "Selected · click again to clear" : font.tone}</small>
                </button>
              ))}
              {!styleKitFonts.length ? (
                <p className="dashboard-empty">No fonts were selected in Style.</p>
              ) : null}
            </div>
          ) : null}
          {figureStyleTab === "palette" ? (
            <div className="match-figure-style-options" role="group" aria-label="Optional figure color match">
              <button
                type="button"
                className={!matchedFigurePalette ? "is-selected" : ""}
                onClick={() => selectFigurePalette(null)}
              >
                <strong>Do not match colors</strong>
                <small>Use the Style image and model default instead.</small>
              </button>
              {styleKitPalettes.map((palette, index) => {
                const selected = matchedFigurePalette
                  ? isSameStylePalette(palette, matchedFigurePalette)
                  : false;
                return (
                  <button
                    key={stylePaletteKey(palette)}
                    type="button"
                    className={selected ? "is-selected" : ""}
                    aria-pressed={selected}
                    onClick={() => selectFigurePalette(selected ? null : palette)}
                  >
                    <strong>
                      {stylePaletteLabel(palette, index)}
                      <em className="match-style-origin">From Style</em>
                    </strong>
                    <span className="match-figure-palette" aria-hidden="true">
                      {palette.colors.slice(0, 8).map((color) => (
                        <i key={color} style={{ backgroundColor: color }} />
                      ))}
                    </span>
                    <small>{selected ? "Selected · click again to clear" : `${palette.colors.length} matched colors`}</small>
                  </button>
                );
              })}
              {!styleKitPalettes.length ? (
                <p className="dashboard-empty">No colors were selected in Style.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {presentation !== "mapping" ? (
        <p className="intent-details-copy">
          Select a skeleton node or module label, then bind one of the icons extracted in Style.
        </p>
      ) : null}
      <div className={`icon-mapping-workspace ${isMapping ? "is-icon-only" : ""}`}>
        {/* Match picks its block on the diagram, so the panel is only the icon
            chooser; Layout still needs its own text column. */}
        {isMapping ? null : (
          <div className="icon-mapping-text-column">
            <div className="icon-mapping-column-head">
              <span>1</span>
              <div><strong>Choose text</strong><small>Skeleton nodes and module labels</small></div>
            </div>
            <div className="structure-module-list">
              {mappingModules.map((module) => {
                const binding = resolveWorkspaceIcon(scopedBindings[module.id], state.customIconReferences);
                return (
                 <button
                    key={module.id}
                    type="button"
                    className={selectedModule?.id === module.id ? "is-active" : ""}
                    onClick={() => selectModule(module.id)}
                    title={module.label}
                  >
                    {binding ? (
                      <img src={binding.dataUrl} alt="" />
                    ) : (
                      <i>{module.label.slice(0, 1)}</i>
                    )}
                    <span>
                      <strong>{module.label}</strong>
                      <small>
                        {module.role} · {module.group || "ungrouped"}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {selectedModule ? (
          <div className="icon-mapping-icon-column">
            <div className="icon-mapping-column-head">
              {presentation === "mapping" ? null : <span>2</span>}
              <div>
                <strong>Choose icon</strong>
              </div>
            </div>
            <div className="match-options">
                {isMapping ? null : (
                  <>
                    <div className="icon-mapping-current" aria-live="polite">
                      <div><small>Text</small><strong>{selectedModule.label}</strong></div>
                      <span aria-hidden="true">→</span>
                      <div>
                        <small>Icon</small>
                        {currentIcon ? (
                          <span><img src={currentIcon.dataUrl} alt="" /><strong>{currentIcon.label}{currentIcon.stale ? " · stale source" : ""}</strong></span>
                        ) : <strong>No icon</strong>}
                      </div>
                    </div>
                    <div className="icon-recommendation-head">
                      <strong>Extracted icons</strong>
                      <button type="button" className={!currentIconId ? "is-active" : ""} onClick={() => bindIcon(null)}>No icon</button>
                    </div>
                  </>
                )}
                <div className="match-option-group">
                  <span className="match-option-group-head">From Style · {selectedStyleKitIcons.length} selected</span>
                  {selectedStyleKitIcons.length ? (
                    <div className="icon-choice-grid is-custom">
                      {selectedStyleKitIcons.map(({ icon }) => (
                        <button
                          key={icon.id}
                          type="button"
                          className={currentIconId === icon.id ? "is-selected" : ""}
                          aria-pressed={currentIconId === icon.id}
                          onClick={() => bindIcon(currentIconId === icon.id ? null : icon.id)}
                          title={`${icon.kind === "style-crop" ? "Style crop" : "Style Kit icon"} · ${icon.description}`}
                        >
                          <img src={icon.dataUrl} alt="" />
                          <span>{icon.label}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="dashboard-empty">No extracted icons yet. Extract icons in Style to use them here.</p>
                  )}
                </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
    </>
  );
}
