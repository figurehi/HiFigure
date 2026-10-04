"use client";

import mermaid from "mermaid";
import { useEffect, useId, useMemo, useState } from "react";
import { diagramPlanToMermaid } from "../lib/diagram-mermaid";
import type { DiagramPlan } from "../lib/types";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "base",
  themeVariables: {
    background: "#ffffff",
    primaryTextColor: "#172033",
    lineColor: "#4f46e5",
    fontFamily: "Inter, Arial, sans-serif",
  },
});

// Mermaid creates and removes temporary DOM nodes while rendering. Rendering
// several Skeleton thumbnails concurrently (especially during React strict
// mode remounts) can make two jobs clean up the same temporary node. Keep the
// jobs serial and give every invocation a unique id.
let mermaidRenderQueue: Promise<unknown> = Promise.resolve();
let mermaidRenderSequence = 0;

function queueMermaidRender(renderId: string, source: string) {
  const uniqueRenderId = `${renderId}-${++mermaidRenderSequence}`;
  const render = mermaidRenderQueue
    .catch(() => undefined)
    .then(() => mermaid.render(uniqueRenderId, source));
  mermaidRenderQueue = render.then(() => undefined, () => undefined);
  return render;
}

export function MermaidDiagramPreview({
  source: sourceProp,
  plan,
  toolbarLabel = "Mermaid layout skeleton",
  compact = false,
}: {
  source?: string;
  plan?: DiagramPlan;
  toolbarLabel?: string;
  compact?: boolean;
}) {
  const renderId = useId().replace(/:/g, "-");
  const source = useMemo(() => sourceProp ?? (plan ? diagramPlanToMermaid(plan) : ""), [plan, sourceProp]);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (!source.trim()) {
      setSvg("");
      return () => {
        cancelled = true;
      };
    }
    void queueMermaidRender(`mermaid-${renderId}`, source)
      .then((result) => {
        if (cancelled) return;
        setSvg(result.svg);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSvg("");
        setError(err instanceof Error ? err.message : "Mermaid render failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [renderId, source]);

  async function copySource() {
    try {
      await navigator.clipboard?.writeText(source);
    } catch {
      // Clipboard is optional in insecure browser contexts.
    }
  }

  return (
    <div className="mermaid-diagram" style={compact ? { maxWidth: 560 } : undefined}>
      <div className="mermaid-diagram-toolbar">
        <span className="mermaid-diagram-title">{toolbarLabel}</span>
        <div className="mermaid-diagram-tools">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copySource()}>
            Copy Mermaid
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowSource((open) => !open)}
            aria-expanded={showSource}
          >
            {showSource ? "Hide source" : "Show source"}
          </button>
        </div>
      </div>
      <div className="mermaid-diagram-hint muted">
        Mermaid auto-layout is generated from the current structural plan. Copy it into draw.io via Arrange → Insert → Advanced → Mermaid.
      </div>
      <div className="mermaid-diagram-canvas">
        {error ? (
          <pre className="mermaid-diagram-error">{error}</pre>
        ) : svg ? (
          <div className="mermaid-diagram-svg" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <p className="mermaid-diagram-loading muted">
            {source.trim() ? "Rendering Mermaid…" : "No Mermaid source yet."}
          </p>
        )}
      </div>
      {showSource ? <pre className="mermaid-diagram-source">{source}</pre> : null}
    </div>
  );
}
