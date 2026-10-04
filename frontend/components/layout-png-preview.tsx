"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isDiagramGroupNode } from "../lib/diagram-xml";
import type { ScientificIconReferenceId } from "../lib/scientific-assets";
import type { CustomIconReference, DiagramNode, DiagramPlan } from "../lib/types";
import { workspaceIconDataUrl } from "../lib/workspace-icon-assets";

function centerOf(node: DiagramNode) {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines?: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return maxLines == null ? lines : lines.slice(0, maxLines);
}

function nodeColors(
  node: DiagramNode,
  nodeIndex: number,
  paletteColors?: string[],
  nodeFillColor?: string,
) {
  const role = (node.role ?? "process").toLowerCase();
  const shape = (node.shape ?? "").toLowerCase();
  const visualRole = (node.visualRole ?? "").toLowerCase();
  if (isDiagramGroupNode(node)) return { fill: "rgba(241,245,249,0.58)", stroke: "#94a3b8", text: "#475569" };
  if (visualRole === "proposed") return { fill: "#F1D7D4", stroke: "#B44948", text: "#263238" };
  if (visualRole === "input") return { fill: "#E8F2F5", stroke: "#58727D", text: "#263238" };
  if (visualRole === "tensor_transform") return { fill: "#EDE9F4", stroke: "#7B6A9A", text: "#263238" };
  if (visualRole === "decision") return { fill: "#F4EEDC", stroke: "#9A7B3F", text: "#263238" };
  if (visualRole === "output") return { fill: "#E5F1E3", stroke: "#5A8A55", text: "#263238" };
  if (visualRole === "standard_component") return { fill: "#EAF0F6", stroke: "#63758A", text: "#263238" };
  if (role === "model" || role === "fusion") return { fill: "#EDE9F4", stroke: "#7B6A9A", text: "#263238" };
  if (role === "data" || role === "document" || role === "encoder") return { fill: "#E8F2F5", stroke: "#58727D", text: "#263238" };
  if (role === "output") return { fill: "#E5F1E3", stroke: "#5A8A55", text: "#263238" };
  if (role === "callout" || role === "annotation" || shape === "text") return { fill: "#f8fafc", stroke: "#94a3b8", text: "#334155" };
  return { fill: "#EAF0F6", stroke: "#63758A", text: "#263238" };
}

export function LayoutPngPreview({
  plan,
  compact = false,
  fit = false,
  focusedTargetIds = [],
  iconBindings = {},
  customIconReferences = [],
  fontFamily,
  paletteColors = [],
  nodeFontFamilies = {},
  nodeFillColors = {},
  onFocusTarget,
  onFocusEdge,
}: {
  plan: DiagramPlan;
  compact?: boolean;
  fit?: boolean;
  focusedTargetIds?: string[];
  iconBindings?: Record<string, ScientificIconReferenceId>;
  customIconReferences?: CustomIconReference[];
  fontFamily?: string;
  paletteColors?: string[];
  nodeFontFamilies?: Record<string, string>;
  nodeFillColors?: Record<string, string>;
  onFocusTarget?: (targetId: string) => void;
  onFocusEdge?: (edgeId: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  // Bumped once webfonts used by the preview finish loading, so the canvas redraws with them.
  const [fontRefresh, setFontRefresh] = useState(0);
  const focusSignature = [...focusedTargetIds].sort().join("|");
  const nodeFontSignature = useMemo(
    () => JSON.stringify(Object.entries(nodeFontFamilies).sort(([left], [right]) => left.localeCompare(right))),
    [nodeFontFamilies],
  );
  const nodeColorSignature = useMemo(
    () => JSON.stringify(Object.entries(nodeFillColors).sort(([left], [right]) => left.localeCompare(right))),
    [nodeFillColors],
  );
  const appearanceSignature = `${fontFamily ?? ""}|${paletteColors.join(",")}|${nodeFontSignature}|${nodeColorSignature}`;
  const iconBindingSignature = useMemo(
    () => JSON.stringify(Object.entries(iconBindings).sort(([left], [right]) => left.localeCompare(right))),
    [iconBindings],
  );
  const customIconSignature = useMemo(
    () => JSON.stringify(customIconReferences.map((icon) => [icon.id, icon.contentHash, icon.cropDataUrl.length])),
    [customIconReferences],
  );
  const planSignature = useMemo(
    () =>
      JSON.stringify({
        width: plan.width,
        height: plan.height,
        nodes: plan.nodes.map((node) => ({
          id: node.id,
          label: node.label,
          role: node.role,
          shape: node.shape,
          groupId: node.groupId,
          semanticId: node.semanticId,
          confirmed: node.confirmed,
          storyRole: node.storyRole,
          importanceTier: node.importanceTier,
          componentStatus: node.componentStatus,
          visualUnit: node.visualUnit,
          visualRole: node.visualRole,
          branchId: node.branchId,
          fontSize: node.fontSize,
          x: node.x,
          y: node.y,
          w: node.w,
          h: node.h,
        })),
        edges: plan.edges.map((edge) => ({
          id: edge.id,
          from: edge.from,
          to: edge.to,
          label: edge.label,
          kind: edge.kind,
          lineStyle: edge.lineStyle,
          sourcePort: edge.sourcePort,
          targetPort: edge.targetPort,
          points: edge.points,
          routingStyle: edge.routingStyle,
          semanticId: edge.semanticId,
          confirmed: edge.confirmed,
        })),
      }),
    [plan],
  );
  const previewExtent = useMemo(() => {
    const margin = 48;
    let right = Math.max(1, Number.isFinite(plan.width) ? plan.width : 0);
    let bottom = Math.max(1, Number.isFinite(plan.height) ? plan.height : 0);

    for (const node of plan.nodes) {
      if (Number.isFinite(node.x) && Number.isFinite(node.w)) right = Math.max(right, node.x + node.w + margin);
      if (Number.isFinite(node.y) && Number.isFinite(node.h)) bottom = Math.max(bottom, node.y + node.h + margin);
    }
    for (const edge of plan.edges) {
      for (const point of edge.points ?? []) {
        if (Number.isFinite(point.x)) right = Math.max(right, point.x + margin);
        if (Number.isFinite(point.y)) bottom = Math.max(bottom, point.y + margin);
      }
    }

    return {
      width: Math.ceil(right || 1600),
      height: Math.ceil(bottom || 960),
    };
  }, [plan.edges, plan.height, plan.nodes, plan.width]);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sourceWidth = previewExtent.width;
    const sourceHeight = previewExtent.height;
    const targetWidth = compact ? 1100 : 1600;
    const width = Math.round(Math.min(targetWidth, Math.max(720, sourceWidth)));
    const scale = width / sourceWidth;
    const height = Math.round(sourceHeight * scale);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const drawingContext = canvas.getContext("2d");
    if (!drawingContext) return;
    const ctx: CanvasRenderingContext2D = drawingContext;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, sourceWidth, sourceHeight);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sourceWidth, sourceHeight);

    const nodesById = new Map(plan.nodes.map((node) => [node.id, node] as const));
    const focusedIds = new Set(focusSignature.split("|").filter(Boolean));
    const groups = plan.nodes.filter(isDiagramGroupNode);
    const ordinaryNodes = plan.nodes.filter((node) => !isDiagramGroupNode(node));

    function roundedRect(x: number, y: number, w: number, h: number, r: number) {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo(x + radius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    }

    const resolvedFontCache = new Map<string, string>();
    const usedWebFonts = new Set<string>();
    const canvasComputedStyle = getComputedStyle(canvas);

    // ctx.font silently rejects values containing var(), so CSS variables must be
    // resolved against the live element before the family reaches the canvas.
    function resolveCanvasFontFamily(family: string) {
      const cached = resolvedFontCache.get(family);
      if (cached) return cached;
      const resolvedParts = family
        .replace(/var\((--[^),]+)\)/g, (_match, name: string) =>
          canvasComputedStyle.getPropertyValue(name.trim()).trim(),
        )
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      const resolved = resolvedParts.join(", ") || "Inter, Arial, sans-serif";
      if (resolvedParts.length) usedWebFonts.add(resolvedParts[0]);
      resolvedFontCache.set(family, resolved);
      return resolved;
    }

    function resolveNodeFont(node: DiagramNode) {
      return resolveCanvasFontFamily(
        nodeFontFamilies[node.semanticId ?? ""] ??
          nodeFontFamilies[node.id] ??
          fontFamily ??
          "Inter, Arial, sans-serif",
      );
    }

    function resolveNodeFillColor(node: DiagramNode) {
      return nodeFillColors[node.semanticId ?? ""] ?? nodeFillColors[node.id];
    }

    function drawNode(node: DiagramNode, group = false, nodeIndex = 0) {
      const colors = nodeColors(
        node,
        nodeIndex,
        paletteColors.length ? paletteColors : undefined,
        resolveNodeFillColor(node),
      );
      const focused = focusedIds.has(node.id) || Boolean(node.semanticId && focusedIds.has(node.semanticId));
      ctx.save();
      ctx.fillStyle = colors.fill;
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = group ? 1.8 / scale : node.visualRole === "proposed" ? 2.6 / scale : 1.8 / scale;
      if (group) ctx.setLineDash([8 / scale, 6 / scale]);
      roundedRect(node.x, node.y, node.w, node.h, group ? 10 : 6);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = colors.text;
      ctx.textAlign = group ? "left" : "center";
      ctx.textBaseline = "middle";
      const fontSize = group ? 20 : node.fontSize ?? (node.importanceTier === "primary" ? 15 : node.importanceTier === "annotation" ? 12 : 14);
      ctx.font = `${group || node.importanceTier === "primary" ? "700" : "650"} ${fontSize}px Inter, Arial, sans-serif`;
      const lines = wrapText(
        ctx,
        node.label,
        Math.max(20, node.w - (group ? 24 : 14)),
        group ? undefined : 3,
      );
      const lineHeight = fontSize * 1.22;
      const startY = group
        ? node.y + 20
        : node.y + node.h / 2 - ((lines.length - 1) * lineHeight) / 2;
      const textX = group ? node.x + 12 : node.x + node.w / 2;
      lines.forEach((line, index) => ctx.fillText(line, textX, startY + index * lineHeight));
      if (focused) {
        ctx.strokeStyle = "#d97706";
        ctx.lineWidth = 4 / scale;
        ctx.setLineDash([]);
        roundedRect(node.x - 4 / scale, node.y - 4 / scale, node.w + 8 / scale, node.h + 8 / scale, group ? 12 : 8);
        ctx.stroke();
      }
      ctx.restore();
    }

    groups.forEach((node, index) => drawNode(node, true, index));

    ctx.save();
    for (const edge of plan.edges) {
      const from = nodesById.get(edge.from);
      const to = nodesById.get(edge.to);
      if (!from || !to) continue;
      const routedPoints = edge.points?.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
      const points = routedPoints && routedPoints.length >= 2 ? routedPoints : [centerOf(from), centerOf(to)];
      const end = points[points.length - 1];
      const previous = points[points.length - 2];
      const angle = Math.atan2(end.y - previous.y, end.x - previous.x);
      const focused = focusedIds.has(edge.id) || Boolean(edge.semanticId && focusedIds.has(edge.semanticId));
      ctx.strokeStyle = focused ? "#d97706" : edge.kind === "feedback" ? "#6B7280" : "#263238";
      ctx.fillStyle = focused ? "#d97706" : edge.kind === "feedback" ? "#6B7280" : "#263238";
      ctx.lineWidth = (focused ? 4 : 1.6) / scale;
      if (edge.lineStyle === "dashed" || (!edge.lineStyle && edge.kind === "feedback")) {
        ctx.setLineDash([8 / scale, 6 / scale]);
      }
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - Math.cos(angle - 0.45) * 12, end.y - Math.sin(angle - 0.45) * 12);
      ctx.lineTo(end.x - Math.cos(angle + 0.45) * 12, end.y - Math.sin(angle + 0.45) * 12);
      ctx.closePath();
      ctx.fill();
      if (edge.label) {
        const segmentLengths = points.slice(1).map((point, index) =>
          Math.hypot(point.x - points[index].x, point.y - points[index].y),
        );
        const halfLength = segmentLengths.reduce((sum, length) => sum + length, 0) / 2;
        let traversed = 0;
        let labelPoint = points[Math.floor(points.length / 2)];
        for (let index = 0; index < segmentLengths.length; index += 1) {
          const length = segmentLengths[index];
          if (traversed + length >= halfLength && length > 0) {
            const ratio = (halfLength - traversed) / length;
            labelPoint = {
              x: points[index].x + (points[index + 1].x - points[index].x) * ratio,
              y: points[index].y + (points[index + 1].y - points[index].y) * ratio,
            };
            break;
          }
          traversed += length;
        }
        ctx.font = "600 11px Inter, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const textWidth = ctx.measureText(edge.label).width;
        ctx.fillStyle = "rgba(255,255,255,0.94)";
        ctx.fillRect(labelPoint.x - textWidth / 2 - 4, labelPoint.y - 9, textWidth + 8, 18);
        ctx.fillStyle = "#263238";
        ctx.fillText(edge.label, labelPoint.x, labelPoint.y);
      }
    }
    ctx.restore();

    ordinaryNodes.forEach((node, index) => drawNode(node, false, groups.length + index));

    if ("fonts" in document) {
      const pendingFonts = [...usedWebFonts].filter((family) => {
        try {
          return !document.fonts.check(`600 14px ${family}`);
        } catch {
          return false;
        }
      });
      if (pendingFonts.length) {
        void Promise.all(pendingFonts.map((family) => document.fonts.load(`600 14px ${family}`).catch(() => []))).then(() => {
          if (!cancelled) setFontRefresh((tick) => tick + 1);
        });
      }
    }

    const boundNodes = ordinaryNodes.flatMap((node) => {
      const iconId = iconBindings[node.semanticId ?? ""] ?? iconBindings[node.id];
      return iconId ? [{ node, iconId }] : [];
    });
    if (boundNodes.length === 0) {
      setPngUrl(canvas.toDataURL("image/png"));
      return () => {
        cancelled = true;
      };
    }

    void Promise.all(boundNodes.map(({ node, iconId }) => new Promise<{ node: DiagramNode; image: HTMLImageElement } | null>((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ node, image });
      image.onerror = () => resolve(null);
      image.src = workspaceIconDataUrl(iconId, customIconReferences);
    }))).then((loaded) => {
      if (cancelled) return;
      loaded.forEach((entry) => {
        if (!entry) return;
        const { node, image } = entry;
        const size = Math.max(18, Math.min(34, node.h * 0.34, node.w * 0.22));
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,0.96)";
        ctx.strokeStyle = "#c7d2fe";
        ctx.lineWidth = 1.5 / scale;
        roundedRect(node.x + 5, node.y + 5, size + 8, size + 8, 6);
        ctx.fill();
        ctx.stroke();
        ctx.drawImage(image, node.x + 9, node.y + 9, size, size);
        ctx.restore();
      });
      setPngUrl(canvas.toDataURL("image/png"));
    });
    return () => {
      cancelled = true;
    };
  }, [appearanceSignature, compact, customIconSignature, focusSignature, fontFamily, fontRefresh, iconBindingSignature, nodeColorSignature, nodeFontSignature, paletteColors, planSignature, previewExtent.height, previewExtent.width]);

  const nodesById = new Map(plan.nodes.map((node) => [node.id, node] as const));
  const panelCount = plan.nodes.filter(isDiagramGroupNode).length;
  const moduleCount = plan.nodes.length - panelCount;

  function edgePath(edge: DiagramPlan["edges"][number]) {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (!from || !to) return "";
    const routedPoints = edge.points?.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    const points = routedPoints && routedPoints.length >= 2 ? routedPoints : [centerOf(from), centerOf(to)];
    return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  }

  function focusTargetRect(node: DiagramNode) {
    if (!onFocusTarget) return null;
    return (
      <rect
        key={node.id}
        x={node.x}
        y={node.y}
        width={node.w}
        height={node.h}
        rx={6}
        role="button"
        tabIndex={0}
        aria-label={`Focus ${node.label || node.id}`}
        onClick={() => onFocusTarget(node.semanticId ?? node.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onFocusTarget(node.semanticId ?? node.id);
        }}
      />
    );
  }

  return (
    <div className={`layout-png-preview ${compact ? "is-compact" : ""} ${fit ? "is-fit" : ""}`}>
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="layout-png-preview-head">
        <div>
          <span className="label-text">Layout skeleton PNG</span>
          <p className="mono muted">
            {moduleCount} modules / {plan.edges.length} edges / {panelCount} panels
          </p>
        </div>
      </div>
      <div className="layout-png-preview-frame">
        {pngUrl ? (
          <div className="layout-png-preview-media">
            <img src={pngUrl} alt="Layout skeleton PNG preview" />
            {onFocusTarget || onFocusEdge ? (
              <svg
                className="layout-png-preview-hit-map"
                viewBox={`0 0 ${previewExtent.width} ${previewExtent.height}`}
                preserveAspectRatio={fit ? "xMidYMid meet" : "none"}
                aria-label="Interactive skeleton targets"
              >
                {/* Large transparent group hit areas must stay below arrows;
                    otherwise a panel covering the diagram swallows every edge click. */}
                {plan.nodes.filter(isDiagramGroupNode).map(focusTargetRect)}
                {onFocusEdge ? plan.edges.map((edge) => (
                  <path
                    key={edge.id}
                    d={edgePath(edge)}
                    className={focusedTargetIds.includes(edge.semanticId ?? edge.id) ? "is-focused" : undefined}
                    vectorEffect="non-scaling-stroke"
                    data-edge-id={edge.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Focus relation ${edge.label || edge.id}`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onFocusEdge(edge.semanticId ?? edge.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onFocusEdge(edge.semanticId ?? edge.id);
                      }
                    }}
                  />
                )) : null}
                {/* Ordinary modules remain above arrows so clicking a box near an
                    endpoint still selects the module rather than its connector. */}
                {plan.nodes.filter((node) => !isDiagramGroupNode(node)).map(focusTargetRect)}
              </svg>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
