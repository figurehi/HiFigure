"use client";

import { useMemo, useState } from "react";
import { restoreVariantFromHistory } from "../lib/figure-history";
import { svgPreviewDataUrl } from "../lib/evolve-artifact";
import { useWorkspaceState, type FigureHistoryEntry } from "../lib/workspace-state";
import type { FigureVariant } from "../lib/types";

function variantPreview(variant: FigureVariant | null | undefined): string | null {
  if (!variant) return null;
  return variant.previewImageDataUrl ?? variant.previewImageUrl ?? svgPreviewDataUrl(variant.svg);
}

type FigureVersionPanelProps = {
  /** Renders as a collapsed floating widget (bottom-right) instead of an inline sidebar. */
  floating?: boolean;
  compact?: boolean;
  className?: string;
};

export function FigureVersionPanel({ floating = false, compact = false, className = "" }: FigureVersionPanelProps) {
  const { state, setState } = useWorkspaceState();
  const { figureHistory, figureHistoryCompareIds, variants, selectedVariantId } = state;
  const [expanded, setExpanded] = useState(!floating);
  const readOnly = state.studySessionStatus === "finished";

  const compareEntries = useMemo(() => {
    if (!figureHistoryCompareIds) return null;
    const [leftId, rightId] = figureHistoryCompareIds;
    return {
      left: figureHistory.find((entry) => entry.id === leftId) ?? null,
      right: figureHistory.find((entry) => entry.id === rightId) ?? null,
    };
  }, [figureHistory, figureHistoryCompareIds]);

  // A pending compare (e.g. after a modify job) force-opens the floating panel.
  const shouldShow = expanded || Boolean(compareEntries);

  function handleRestore(entry: FigureHistoryEntry) {
    if (readOnly) return;
    setState((current) => restoreVariantFromHistory(current, entry));
  }

  function handleCompare(entry: FigureHistoryEntry) {
    const previous = figureHistory.find((item) => item.variantId === entry.sourceVariantId) ?? figureHistory[1] ?? null;
    if (!previous) {
      setState((current) => ({
        ...current,
        status: "No earlier version available for comparison.",
      }));
      return;
    }
    setState((current) => ({
      ...current,
      figureHistoryCompareIds: [previous.id, entry.id],
    }));
  }

  function closeCompare() {
    setState((current) => ({ ...current, figureHistoryCompareIds: null }));
  }

  if (figureHistory.length === 0) return null;

  if (floating && !shouldShow) {
    return (
      <button
        type="button"
        className="figure-version-fab"
        onClick={() => setExpanded(true)}
        title="Open version history"
      >
        Versions · {figureHistory.length}
      </button>
    );
  }

  return (
    <aside
      className={`figure-version-panel ${floating ? "is-floating" : ""} ${compact ? "is-compact" : ""} ${className}`.trim()}
    >
      <header className="figure-version-head">
        <div>
          <span className="label-text">Version history</span>
          <strong>{figureHistory.length} snapshot{figureHistory.length === 1 ? "" : "s"}</strong>
        </div>
        <div className="figure-version-head-actions">
          {compareEntries ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={closeCompare}>
              Close compare
            </button>
          ) : null}
          {floating ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                closeCompare();
                setExpanded(false);
              }}
              aria-label="Collapse version history"
            >
              ×
            </button>
          ) : null}
        </div>
      </header>

      {compareEntries?.left && compareEntries.right ? (
        <div>
          <div className="figure-version-compare">
            {[compareEntries.left, compareEntries.right].map((entry, index) => {
              const variant = variants.find((item) => item.id === entry.variantId);
              const preview = variantPreview(variant) ?? entry.previewImageUrl ?? null;
              return (
                <figure key={`${entry.id}-${index}`} className="figure-version-compare-card">
                  <figcaption>{index === 0 ? "Before" : "After"} · {entry.title}</figcaption>
                  {preview ? <img src={preview} alt="" /> : <div className="figure-version-empty">No preview</div>}
                </figure>
              );
            })}
          </div>
          <p className="muted" style={{ margin: "8px 0 12px", fontSize: 11.5 }}>
            Visual comparison only. HiChart compares version sources and timestamps; it does not claim a pixel-level or scientific-equivalence diff.
          </p>
        </div>
      ) : null}

      {readOnly ? (
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 11.5 }}>
          The finished study is read-only. Ask the facilitator to reopen it before restoring a version.
        </p>
      ) : null}

      <div className="figure-version-list scroll-y">
        {figureHistory.map((entry) => {
          const variant = variants.find((item) => item.id === entry.variantId);
          const preview = variantPreview(variant) ?? entry.previewImageUrl ?? null;
          const isSelected = selectedVariantId === entry.variantId;
          return (
            <article key={entry.id} className={`figure-version-item ${isSelected ? "is-selected" : ""}`}>
              <button
                type="button"
                className="figure-version-thumb"
                onClick={() => handleRestore(entry)}
                disabled={readOnly}
                title={readOnly ? "Reopen the study before restoring" : `Restore ${entry.title}`}
              >
                {preview ? <img src={preview} alt="" /> : <span>No preview</span>}
              </button>
              <div className="figure-version-copy">
                <strong>{entry.title}</strong>
                <span>{entry.sourceStage} · {entry.sourceType}</span>
                <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleTimeString()}</time>
              </div>
              <div className="figure-version-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleRestore(entry)}
                  disabled={readOnly}
                >
                  Restore
                </button>
                {entry.sourceVariantId ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleCompare(entry)}>
                    Compare
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </aside>
  );
}
