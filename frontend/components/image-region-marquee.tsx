"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type MarqueeRegion = {
  id: string;
  referenceId: string;
  intent?: "include" | "exclude" | "style" | "modify";
  x: number;
  y: number;
  w: number;
  h: number;
  label: string | null;
};

const INTENT_LABEL: Record<NonNullable<MarqueeRegion["intent"]>, string> = {
  include: "Content",
  style: "Style",
  modify: "Modify",
  exclude: "Avoid",
};

type RegionIntent = NonNullable<MarqueeRegion["intent"]>;

type Drag = {
  pointerId: number;
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
};

const ALL_INTENTS: RegionIntent[] = ["include", "style", "modify", "exclude"];

const INTENT_ACTIVE_CLASS: Record<RegionIntent, string> = {
  include: "is-active-include",
  style: "is-active-style",
  modify: "is-active-modify",
  exclude: "is-active-exclude",
};

type Props = {
  imageUrl: string | null;
  referenceId: string;
  regions: MarqueeRegion[];
  /** Omit or leave empty for Content + Style + Modify + Avoid. Canvas passes ["style","modify"]. */
  allowedIntents?: RegionIntent[];
  onCreate: (rect: {
    referenceId: string;
    intent: RegionIntent;
    x: number;
    y: number;
    w: number;
    h: number;
  }) => void;
  onRemove: (id: string) => void;
  onUpdateLabel: (id: string, label: string | null) => void;
};

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

export function ImageRegionMarquee({
  imageUrl,
  referenceId,
  regions,
  allowedIntents,
  onCreate,
  onRemove,
  onUpdateLabel,
}: Props) {
  const intentModes = useMemo(() => {
    if (!allowedIntents?.length) return ALL_INTENTS;
    const filtered = allowedIntents.filter((m): m is RegionIntent => ALL_INTENTS.includes(m));
    return filtered.length ? filtered : ALL_INTENTS;
  }, [allowedIntents]);

  const imgRef = useRef<HTMLImageElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [intent, setIntent] = useState<RegionIntent>(() => intentModes[0] ?? "include");
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  useEffect(() => {
    if (!intentModes.includes(intent)) {
      setIntent(intentModes[0] ?? "include");
    }
  }, [intent, intentModes]);
  const localRegions = regions.filter((r) => r.referenceId === referenceId);
  const selectedRegion = localRegions.find((r) => r.id === selectedRegionId) ?? null;
  const includeCount = localRegions.filter((r) => (r.intent ?? "include") === "include").length;
  const styleCount = localRegions.filter((r) => r.intent === "style").length;
  const modifyCount = localRegions.filter((r) => r.intent === "modify").length;
  const excludeCount = localRegions.filter((r) => r.intent === "exclude").length;
  const onlyStyle = intentModes.length === 1 && intentModes[0] === "style";
  const onlyModify = intentModes.length === 1 && intentModes[0] === "modify";

  const toNorm = useCallback((clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return {
      x: clamp01((clientX - r.left) / r.width),
      y: clamp01((clientY - r.top) / r.height),
    };
  }, []);

  useEffect(() => {
    if (!drag) return;

    const activeDrag = drag;

    function onMove(e: PointerEvent) {
      if (e.pointerId !== activeDrag.pointerId) return;
      const n = toNorm(e.clientX, e.clientY);
      if (!n) return;
      setDrag((d) => (d ? { ...d, x: n.x, y: n.y } : null));
    }

    function onUp(e: PointerEvent) {
      if (e.pointerId !== activeDrag.pointerId) return;
      const n = toNorm(e.clientX, e.clientY);

      setDrag(null);
      if (!n) return;

      const x0 = Math.min(activeDrag.anchorX, n.x);
      const y0 = Math.min(activeDrag.anchorY, n.y);
      const w = Math.abs(n.x - activeDrag.anchorX);
      const h = Math.abs(n.y - activeDrag.anchorY);
      if (w < 0.02 || h < 0.02) return;

      const cx = clamp01(x0);
      const cy = clamp01(y0);
      const cw = Math.min(w, 1 - cx);
      const ch = Math.min(h, 1 - cy);

      onCreate({
        referenceId,
        intent,
        x: cx,
        y: cy,
        w: Math.max(0.02, cw),
        h: Math.max(0.02, ch),
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, intent, onCreate, referenceId, toNorm]);

  useEffect(() => {
    setSelectedRegionId(null);
  }, [referenceId]);

  useEffect(() => {
    if (selectedRegionId && !localRegions.some((region) => region.id === selectedRegionId)) {
      setSelectedRegionId(null);
    }
  }, [localRegions, selectedRegionId]);

  function handlePointerDown(e: React.PointerEvent) {
    if (!imageUrl || e.button !== 0) return;
    const n = toNorm(e.clientX, e.clientY);
    if (!n) return;
    e.preventDefault();
    setDrag({ pointerId: e.pointerId, anchorX: n.x, anchorY: n.y, x: n.x, y: n.y });
  }

  const draftRect = drag
    ? {
        x0: Math.min(drag.anchorX, drag.x),
        y0: Math.min(drag.anchorY, drag.y),
        w: Math.abs(drag.x - drag.anchorX),
        h: Math.abs(drag.y - drag.anchorY),
      }
    : null;

  if (!imageUrl) {
    return <div className="marquee-empty">This reference has no figure image to mark.</div>;
  }

  return (
    <div className="marquee-root">
      <div className="marquee-toolbar">
        <div className="marquee-toolbar-lead">
          <span className="marquee-toolbar-eyebrow">Region marquee</span>
          <span className="marquee-toolbar-title">
            {intentModes.includes("include") ? (
              <>
                Mark <strong>Content</strong> (preserve), <strong>Style</strong> (palette/typography only),{" "}
                <strong>Modify</strong> (local edits), or <strong>Avoid</strong> (omit).
              </>
            ) : onlyStyle ? (
              <>
                Mark <strong>Style</strong> cues: palette, stroke weight, typography, icon treatment.
              </>
            ) : onlyModify ? (
              <>
                Mark <strong>Modify</strong> areas for localized cleanup, label changes, or redraw.
              </>
            ) : (
              <>
                Mark <strong>Style</strong> (overall look) or <strong>Modify</strong> (box where you want localized changes — clearer labels,
                simpler arrows, less clutter). Figure layout comes from your prompt.
              </>
            )}
          </span>
        </div>
        <div className="marquee-mode" role="group" aria-label="Choose region intent">
          {intentModes.map((mode) => {
            const count =
              mode === "include"
                ? includeCount
                : mode === "style"
                  ? styleCount
                  : mode === "modify"
                    ? modifyCount
                    : excludeCount;
            const title =
              mode === "include"
                ? "Preserve content shown in this region"
                : mode === "style"
                  ? "Use this region's palette / line weight / typography only — do not depict its content"
                  : mode === "modify"
                    ? "Prioritize revising whatever lands in this rectangle — keep the rest comparatively stable"
                    : "Do not depict this content";
            return (
              <button
                key={mode}
                type="button"
                className={intent === mode ? `is-active ${INTENT_ACTIVE_CLASS[mode]}` : ""}
                onClick={() => setIntent(mode)}
                title={title}
              >
                {INTENT_LABEL[mode]}
                <span>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="marquee-stage">
        <div className="marquee-canvas" onPointerDown={handlePointerDown}>
          {imageUrl ? <img ref={imgRef} src={imageUrl} alt="" className="marquee-img" draggable={false} /> : null}
          {localRegions.map((r) => {
            const regionIntent = r.intent ?? "include";
            return (
              <div
                key={r.id}
                className={`marquee-rect marquee-rect-${regionIntent}${
                  selectedRegionId === r.id ? " marquee-rect-selected" : ""
                }`}
                style={{
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.w * 100}%`,
                  height: `${r.h * 100}%`,
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedRegionId(r.id);
                }}
              >
                <span className="marquee-rect-label">
                  {r.label?.trim() || INTENT_LABEL[regionIntent]}
                </span>
                <button
                  type="button"
                  className="marquee-rect-remove"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedRegionId((current) => (current === r.id ? null : current));
                    onRemove(r.id);
                  }}
                  aria-label="Remove region"
                >
                  ×
                </button>
              </div>
            );
          })}
          {draftRect && draftRect.w > 0 && draftRect.h > 0 ? (
            <div
              className={`marquee-rect marquee-rect-draft marquee-rect-${intent}`}
              style={{
                left: `${draftRect.x0 * 100}%`,
                top: `${draftRect.y0 * 100}%`,
                width: `${draftRect.w * 100}%`,
                height: `${draftRect.h * 100}%`,
              }}
            />
          ) : null}
        </div>
      </div>

      <div className="marquee-foot">
        {selectedRegion ? (
          <label className="marquee-note-field">
            <span className="marquee-note-field-label">
              Note for selected{" "}
              {INTENT_LABEL[selectedRegion.intent ?? "include"].toLowerCase()} region
            </span>
            <textarea
              rows={2}
              value={selectedRegion.label ?? ""}
              placeholder={
                (selectedRegion.intent ?? "include") === "style"
                  ? "e.g. match saturated accents and rounded cards"
                  : (selectedRegion.intent ?? "include") === "modify"
                    ? "e.g. shorten labels here; untangle crossing arrows"
                    : (selectedRegion.intent ?? "include") === "exclude"
                      ? "e.g. omit mascot icons and watermark-like badges"
                      : "e.g. keep the multi-head attention stack, but simplify labels"
              }
              onChange={(event) =>
                onUpdateLabel(selectedRegion.id, event.target.value || null)
              }
            />
          </label>
        ) : (
          <p className="marquee-hint">
            {intentModes.includes("include") ? (
              <>
                <strong>Content</strong> regions are redrawn into your figure.{" "}
                <strong>Style</strong> regions only contribute palette/line/typography.{" "}
                <strong>Modify</strong> regions anchor localized edits.{" "}
                <strong>Avoid</strong> regions are excluded.
              </>
            ) : onlyStyle ? (
              <>
                <strong>Style</strong> regions supply visual language only: palette,
                strokes, typography, icon treatment.
              </>
            ) : onlyModify ? (
              <>
                <strong>Modify</strong> regions mark where localized cleanup or redraw
                should happen in the editor.
              </>
            ) : (
              <>
                <strong>Style</strong> regions supply palette / strokes / typography.{" "}
                <strong>Modify</strong> regions tell the generator where to concentrate redraw/refinement.
              </>
            )}{" "}
            Click a marked region to attach a note.
          </p>
        )}
      </div>
    </div>
  );
}
