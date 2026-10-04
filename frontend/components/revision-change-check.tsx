"use client";

import { useEffect, useMemo, useState } from "react";
import type { RefineEditTarget } from "../lib/evolve-artifact";

type ChangeCheck = {
  outsideChangedRatio: number;
  overallChangedRatio: number;
  heatmapDataUrl: string;
};

type RevisionChangeCheckProps = {
  beforeUrl: string;
  afterUrl: string;
  targets: RefineEditTarget[];
  figureBounds: { x: number; y: number; w: number; h: number } | null | undefined;
};

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be read in the browser."));
    image.src = url;
  });
}

function normalizedTargets(
  targets: RefineEditTarget[],
  bounds: RevisionChangeCheckProps["figureBounds"],
) {
  if (!bounds || bounds.w <= 0 || bounds.h <= 0) return [];
  return targets
    .filter((target) => target.status !== "protected")
    .map((target) => ({
      id: target.id,
      name: target.name,
      x: Math.max(0, Math.min(1, (target.bounds.x - bounds.x) / bounds.w)),
      y: Math.max(0, Math.min(1, (target.bounds.y - bounds.y) / bounds.h)),
      w: Math.max(0, Math.min(1, target.bounds.w / bounds.w)),
      h: Math.max(0, Math.min(1, target.bounds.h / bounds.h)),
    }));
}

export function RevisionChangeCheck({ beforeUrl, afterUrl, targets, figureBounds }: RevisionChangeCheckProps) {
  const [result, setResult] = useState<ChangeCheck | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const targetRects = useMemo(
    () => normalizedTargets(targets, figureBounds),
    [figureBounds, targets],
  );

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setUnavailable(false);
    void Promise.all([loadImage(beforeUrl), loadImage(afterUrl)])
      .then(([before, after]) => {
        if (cancelled) return;
        const width = Math.max(1, Math.min(720, after.naturalWidth || before.naturalWidth || 720));
        const aspect = (after.naturalHeight || before.naturalHeight || 1) / (after.naturalWidth || before.naturalWidth || 1);
        const height = Math.max(1, Math.min(720, Math.round(width * aspect)));
        const beforeCanvas = document.createElement("canvas");
        const afterCanvas = document.createElement("canvas");
        const heatCanvas = document.createElement("canvas");
        beforeCanvas.width = afterCanvas.width = heatCanvas.width = width;
        beforeCanvas.height = afterCanvas.height = heatCanvas.height = height;
        const beforeContext = beforeCanvas.getContext("2d", { willReadFrequently: true });
        const afterContext = afterCanvas.getContext("2d", { willReadFrequently: true });
        const heatContext = heatCanvas.getContext("2d");
        if (!beforeContext || !afterContext || !heatContext) throw new Error("Canvas unavailable");
        beforeContext.drawImage(before, 0, 0, width, height);
        afterContext.drawImage(after, 0, 0, width, height);
        const beforePixels = beforeContext.getImageData(0, 0, width, height);
        const afterPixels = afterContext.getImageData(0, 0, width, height);
        const heat = heatContext.createImageData(width, height);
        let outsidePixels = 0;
        let outsideChanged = 0;
        let overallChanged = 0;
        const threshold = 24;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const pixel = y * width + x;
            const offset = pixel * 4;
            const delta = (
              Math.abs(beforePixels.data[offset] - afterPixels.data[offset]) +
              Math.abs(beforePixels.data[offset + 1] - afterPixels.data[offset + 1]) +
              Math.abs(beforePixels.data[offset + 2] - afterPixels.data[offset + 2])
            ) / 3;
            const changed = delta >= threshold;
            if (changed) overallChanged += 1;
            const nx = x / width;
            const ny = y / height;
            const insideTarget = targetRects.some((target) =>
              nx >= target.x && nx <= target.x + target.w && ny >= target.y && ny <= target.y + target.h,
            );
            if (!insideTarget) {
              outsidePixels += 1;
              if (changed) {
                outsideChanged += 1;
                heat.data[offset] = 230;
                heat.data[offset + 1] = 48;
                heat.data[offset + 2] = 58;
                heat.data[offset + 3] = Math.min(190, Math.round(70 + delta));
              }
            }
          }
        }
        heatContext.putImageData(heat, 0, 0);
        setResult({
          outsideChangedRatio: outsidePixels ? outsideChanged / outsidePixels : 0,
          overallChangedRatio: overallChanged / (width * height),
          heatmapDataUrl: heatCanvas.toDataURL("image/png"),
        });
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });
    return () => { cancelled = true; };
  }, [afterUrl, beforeUrl, targetRects]);

  return (
    <section className="revision-change-check">
      <span className="inspector-section-title">Change outside selected targets</span>
      <p>
        Approximate browser comparison only. Red areas changed outside the saved masks; inspect scientific meaning manually.
      </p>
      <div className="revision-change-preview">
        {afterUrl ? <img src={afterUrl} alt="Current revision for comparison" /> : null}
        {result ? <img className="revision-change-heatmap" src={result.heatmapDataUrl} alt="" /> : null}
        {targetRects.map((target) => (
          <span
            key={target.id}
            className="revision-change-target"
            title={target.name}
            style={{
              left: `${target.x * 100}%`,
              top: `${target.y * 100}%`,
              width: `${target.w * 100}%`,
              height: `${target.h * 100}%`,
            }}
          />
        ))}
      </div>
      {result ? (
        <div className="revision-change-metrics">
          <span><strong>{(result.outsideChangedRatio * 100).toFixed(1)}%</strong> outside-target pixels flagged</span>
          <span>{(result.overallChangedRatio * 100).toFixed(1)}% overall pixels flagged</span>
        </div>
      ) : unavailable ? (
        <small>Automatic comparison is unavailable for this image source. Compare the versions manually.</small>
      ) : (
        <small>Comparing the source and revision…</small>
      )}
    </section>
  );
}
