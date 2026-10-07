"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
import type { DiagramEdge, DiagramNode, DiagramPlan } from "../lib/types";

function wrapLabel(label: string): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 2) return [label || "Node"];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > 16 && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function nodeCenter(node: DiagramNode) {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

function edgePath(from: DiagramNode, to: DiagramNode) {
  const a = nodeCenter(from);
  const b = nodeCenter(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fromRole = (from.role ?? "").toLowerCase();
  const toRole = (to.role ?? "").toLowerCase();
  const fromShape = (from.shape ?? "").toLowerCase();
  const toShape = (to.shape ?? "").toLowerCase();
  const fromIsTextLike = fromShape === "text" || fromRole === "annotation";
  const toIsTextLike = toShape === "text" || toRole === "annotation";

  if (!fromIsTextLike && !toIsTextLike) {
    let startX = a.x;
    let startY = a.y;
    let endX = b.x;
    let endY = b.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      startX = dx >= 0 ? from.x + from.w : from.x;
      endX = dx >= 0 ? to.x : to.x + to.w;
    } else {
      startY = dy >= 0 ? from.y + from.h : from.y;
      endY = dy >= 0 ? to.y : to.y + to.h;
    }
    return {
      d: `M ${startX} ${startY} L ${endX} ${endY}`,
      labelX: (startX + endX) / 2,
      labelY: (startY + endY) / 2,
    };
  }

  if (Math.abs(dx) > Math.abs(dy)) {
    const startX = dx >= 0 ? from.x + from.w : from.x;
    const endX = dx >= 0 ? to.x : to.x + to.w;
    const startY = a.y;
    const endY = b.y;
    const midX = (startX + endX) / 2;
    return {
      d: `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`,
      labelX: midX,
      labelY: (startY + endY) / 2,
    };
  }
  const startY = dy >= 0 ? from.y + from.h : from.y;
  const endY = dy >= 0 ? to.y : to.y + to.h;
  const startX = a.x;
  const endX = b.x;
  const midY = (startY + endY) / 2;
  return {
    d: `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`,
    labelX: (startX + endX) / 2,
    labelY: midY,
  };
}

function nextId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Pastel fill + outline per node role so the skeleton reads as a designed figure, not blank boxes. */
const ROLE_COLORS: Record<string, { fill: string; stroke: string }> = {
  group: { fill: "#eef2ff", stroke: "#64748b" },
  input: { fill: "#dbeafe", stroke: "#3b82f6" },
  data: { fill: "#dcfce7", stroke: "#22c55e" },
  document: { fill: "#dcfce7", stroke: "#22c55e" },
  encoder: { fill: "#dcfce7", stroke: "#16a34a" },
  process: { fill: "#fef3c7", stroke: "#f59e0b" },
  reasoning: { fill: "#ffedd5", stroke: "#fb923c" },
  fusion: { fill: "#f3e8ff", stroke: "#a855f7" },
  model: { fill: "#f3e8ff", stroke: "#a855f7" },
  output: { fill: "#e0e7ff", stroke: "#6366f1" },
  annotation: { fill: "#f1f5f9", stroke: "#94a3b8" },
  callout: { fill: "#fff7ed", stroke: "#f59e0b" },
  divider: { fill: "#334155", stroke: "#334155" },
  marker: { fill: "#e0f2fe", stroke: "#0ea5e9" },
  goodmarker: { fill: "#dcfce7", stroke: "#22c55e" },
  badmarker: { fill: "#fee2e2", stroke: "#ef4444" },
};

type Selection = { type: "node" | "edge"; id: string } | null;

export function EditableDiagramPreview({
  plan,
  onChange,
  toolbarLabel = "Editable main diagram",
  compact = false,
}: {
  plan: DiagramPlan;
  onChange: (next: DiagramPlan) => void;
  toolbarLabel?: string;
  /** Render at a constrained size (used as a quick draft on the References page). */
  compact?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const idPrefix = useId().replace(/:/g, "-");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const accent = plan.style?.accent ?? "#4f46e5";
  const secondary = plan.style?.secondary ?? "#dbeafe";
  const text = plan.style?.text ?? "#172033";
  const background = plan.style?.background ?? "#ffffff";
  const highlight = "#f59e0b";
  const canvasScale = 1;
  const canvasPixelWidth = Math.round(plan.width * canvasScale);
  const canvasPixelHeight = Math.round(plan.height * canvasScale);

  const nodesById = useMemo(
    () => new Map(plan.nodes.map((node) => [node.id, node] as const)),
    [plan.nodes],
  );
  const layeredNodes = useMemo(() => {
    const layerOf = (node: DiagramNode) => {
      const role = (node.role ?? "").toLowerCase();
      const shape = (node.shape ?? "").toLowerCase();
      if (role === "group") return 0;
      if (role === "callout" || shape === "dashedbox" || role === "divider" || shape === "divider") return 1;
      if (shape === "text") return 3;
      if (role.includes("marker") || shape === "marker") return 4;
      return 2;
    };
    return [...plan.nodes].sort((a, b) => layerOf(a) - layerOf(b));
  }, [plan.nodes]);

  function pointFromEvent(event: PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return null;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    return pt.matrixTransform(matrix.inverse());
  }

  function updateNode(id: string, patch: Partial<DiagramNode>) {
    onChange({
      ...plan,
      nodes: plan.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
    });
  }

  function addNode() {
    const id = nextId("n");
    const w = 140;
    const h = 64;
    const offset = (plan.nodes.length % 4) * 22;
    const node: DiagramNode = {
      id,
      label: "New box",
      role: "process",
      x: Math.max(12, Math.min(plan.width - w - 12, plan.width / 2 - w / 2 + offset)),
      y: Math.max(12, Math.min(plan.height - h - 12, plan.height / 2 - h / 2 + offset)),
      w,
      h,
    };
    onChange({ ...plan, nodes: [...plan.nodes, node] });
    setSelected({ type: "node", id });
  }

  function addTextNode() {
    const id = nextId("t");
    const w = 180;
    const h = 34;
    const offset = (plan.nodes.length % 5) * 18;
    const node: DiagramNode = {
      id,
      label: "Text label",
      role: "annotation",
      shape: "text",
      x: Math.max(12, Math.min(plan.width - w - 12, plan.width / 2 - w / 2 + offset)),
      y: Math.max(12, Math.min(plan.height - h - 12, plan.height / 2 - h / 2 + offset)),
      w,
      h,
    };
    onChange({ ...plan, nodes: [...plan.nodes, node] });
    setSelected({ type: "node", id });
  }

  function deleteSelected() {
    if (!selected) return;
    if (selected.type === "node") {
      onChange({
        ...plan,
        nodes: plan.nodes.filter((n) => n.id !== selected.id),
        edges: plan.edges.filter((e) => e.from !== selected.id && e.to !== selected.id),
      });
    } else {
      onChange({ ...plan, edges: plan.edges.filter((e) => e.id !== selected.id) });
    }
    setSelected(null);
  }

  function renameNode(node: DiagramNode) {
    const next = window.prompt("Box text", node.label);
    if (next === null) return;
    updateNode(node.id, { label: next.trim() || node.label });
  }

  function renameEdge(edge: DiagramEdge) {
    const next = window.prompt("Arrow label", edge.label ?? "");
    if (next === null) return;
    onChange({
      ...plan,
      edges: plan.edges.map((e) => (e.id === edge.id ? { ...e, label: next.trim() } : e)),
    });
  }

  function startConnect() {
    setConnectMode((on) => !on);
    setConnectFromId(null);
    setSelected(null);
  }

  function handleNodePointerDown(node: DiagramNode, event: PointerEvent<SVGGElement>) {
    event.stopPropagation();
    if (connectMode) {
      if (!connectFromId) {
        setConnectFromId(node.id);
      } else if (connectFromId !== node.id) {
        const id = nextId("e");
        onChange({
          ...plan,
          edges: [...plan.edges, { id, from: connectFromId, to: node.id, label: "", kind: "flow" }],
        });
        setConnectMode(false);
        setConnectFromId(null);
        setSelected({ type: "edge", id });
      }
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(node.id);
    setSelected({ type: "node", id: node.id });
  }

  function handleResizePointerDown(node: DiagramNode, event: PointerEvent<SVGRectElement>) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(null);
    setResizingId(node.id);
    setSelected({ type: "node", id: node.id });
  }

  function clearSelection() {
    setSelected(null);
    setConnectFromId(null);
    setConnectMode(false);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;
      if (event.key === "Escape") {
        clearSelection();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selected) {
        event.preventDefault();
        deleteSelected();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, plan]);

  return (
    <div className="editable-diagram" style={compact ? { maxWidth: 560 } : undefined}>
      <div className="editable-diagram-toolbar">
        <span className="editable-diagram-title">{toolbarLabel}</span>
        <div className="editable-diagram-tools">
          <button type="button" className="btn btn-ghost btn-sm" onClick={addNode}>
            + Box
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addTextNode}>
            + Text
          </button>
          <button
            type="button"
            className={`btn btn-ghost btn-sm ${connectMode ? "is-active" : ""}`}
            onClick={startConnect}
            aria-pressed={connectMode}
          >
            {connectMode ? "Pick 2 boxes…" : "+ Arrow"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={deleteSelected}
            disabled={!selected}
          >
            Delete
          </button>
        </div>
      </div>
      <div className="editable-diagram-hint muted">
        {connectMode
          ? "Click a start box, then an end box to draw an arrow. Esc to cancel."
          : "Drag to move · drag bottom-right handle to resize · double-click to edit text · select then Delete."}
      </div>
      <div className="editable-diagram-canvas">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${plan.width} ${plan.height}`}
        role="img"
        aria-label={plan.title}
        className={connectMode ? "is-connecting" : undefined}
        style={
          compact
            ? { width: plan.width, height: plan.height, maxWidth: "none" }
            : { width: canvasPixelWidth, height: canvasPixelHeight, maxWidth: "none" }
        }
        onPointerMove={(event) => {
          const pt = pointFromEvent(event);
          if (!pt) return;
          if (resizingId) {
            const node = nodesById.get(resizingId);
            if (!node) return;
            const minW = (node.shape ?? "").toLowerCase() === "text" ? 48 : 60;
            const minH = (node.shape ?? "").toLowerCase() === "text" ? 20 : 28;
            updateNode(resizingId, {
              w: Math.max(minW, Math.min(plan.width - node.x - 12, pt.x - node.x)),
              h: Math.max(minH, Math.min(plan.height - node.y - 12, pt.y - node.y)),
            });
            return;
          }
          if (!draggingId) return;
          const node = nodesById.get(draggingId);
          if (!node) return;
          updateNode(draggingId, {
            x: Math.max(12, Math.min(plan.width - node.w - 12, pt.x - node.w / 2)),
            y: Math.max(12, Math.min(plan.height - node.h - 12, pt.y - node.h / 2)),
          });
        }}
        onPointerUp={() => {
          setDraggingId(null);
          setResizingId(null);
        }}
        onPointerLeave={() => {
          setDraggingId(null);
          setResizingId(null);
        }}
      >
        <defs>
          <marker
            id={`arrow-${idPrefix}`}
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L9,3 z" fill={accent} />
          </marker>
          <marker
            id={`arrow-sel-${idPrefix}`}
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L9,3 z" fill={highlight} />
          </marker>
          <filter id={`soft-${idPrefix}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#111827" floodOpacity="0.12" />
          </filter>
        </defs>
        <rect
          width={plan.width}
          height={plan.height}
          fill={background}
          onPointerDown={() => {
            if (!connectMode) setSelected(null);
          }}
        />
        {plan.edges.map((edge, index) => {
          const from = nodesById.get(edge.from);
          const to = nodesById.get(edge.to);
          if (!from || !to) return null;
          const path = edgePath(from, to);
          const isSelected = selected?.type === "edge" && selected.id === edge.id;
          const stroke = isSelected ? highlight : accent;
          return (
            <g
              key={`${edge.id}-${edge.from}-${edge.to}-${index}`}
              className="editable-diagram-edge"
              onPointerDown={(event) => {
                event.stopPropagation();
                if (!connectMode) setSelected({ type: "edge", id: edge.id });
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                renameEdge(edge);
              }}
            >
              <path
                d={path.d}
                stroke="transparent"
                strokeWidth="16"
                fill="none"
              />
              <path
                d={path.d}
                stroke={stroke}
                strokeWidth={isSelected ? 4 : 3}
                strokeLinecap="round"
                fill="none"
                markerEnd={`url(#${isSelected ? "arrow-sel" : "arrow"}-${idPrefix})`}
              />
              {edge.label ? (
                <text
                  x={path.labelX}
                  y={path.labelY - 8}
                  textAnchor="middle"
                  fontSize="13"
                  fill={text}
                  paintOrder="stroke"
                  stroke={background}
                  strokeWidth="5"
                >
                  {edge.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {layeredNodes.map((node) => {
          const isSelected = selected?.type === "node" && selected.id === node.id;
          const isConnectFrom = connectFromId === node.id;
          const roleName = (node.role ?? "").toLowerCase();
          const shapeName = (node.shape ?? "").toLowerCase();
          const role = ROLE_COLORS[roleName];
          const fill = role?.fill ?? secondary;
          const stroke = isSelected || isConnectFrom ? highlight : (role?.stroke ?? accent);
          const isGroup = roleName === "group";
          const isText = shapeName === "text";
          const isDivider = roleName === "divider" || shapeName === "divider";
          const isMarker = roleName === "marker" || roleName === "goodmarker" || roleName === "badmarker" || shapeName === "marker";
          const isCallout = roleName === "callout" || shapeName === "dashedbox";
          return (
            <g
              key={node.id}
              tabIndex={0}
              role="button"
              className="editable-diagram-node"
              transform={`translate(${node.x} ${node.y})`}
              onPointerDown={(event) => handleNodePointerDown(node, event)}
              onDoubleClick={(event) => {
                event.stopPropagation();
                renameNode(node);
              }}
            >
              {isGroup ? (
                <>
                  <rect
                    width={node.w}
                    height={node.h}
                    rx="24"
                    fill={fill}
                    fillOpacity="0.22"
                    stroke={stroke}
                    strokeWidth={isSelected || isConnectFrom ? 3.5 : 2.5}
                    strokeDasharray="8 8"
                  />
                  {node.label ? (
                    <text x={14} y={22} fontSize="15" fontWeight="800" fill={text}>
                      {node.label}
                    </text>
                  ) : null}
                </>
              ) : isDivider ? (
                <line
                  x1={node.w / 2}
                  y1={0}
                  x2={node.w / 2}
                  y2={node.h}
                  stroke={stroke}
                  strokeWidth={isSelected || isConnectFrom ? 4 : 3}
                  strokeDasharray="7 7"
                />
              ) : isMarker ? (
                <>
                  <circle
                    cx={node.w / 2}
                    cy={node.h / 2}
                    r={Math.max(7, Math.min(node.w, node.h) / 2)}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isSelected || isConnectFrom ? 3 : 2}
                  />
                  {node.label ? (
                    <text
                      x={node.w / 2}
                      y={node.h / 2 + 4}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="800"
                      fill={roleName === "badmarker" ? "#991b1b" : roleName === "goodmarker" ? "#166534" : text}
                    >
                      {node.label.slice(0, 2)}
                    </text>
                  ) : null}
                </>
              ) : isText ? (
                <text x={0} y={14} fontSize="13" fontWeight="700" fill={text}>
                  {node.label}
                </text>
              ) : (
                <>
                  <rect
                    width={node.w}
                    height={node.h}
                    rx={shapeName === "rect" ? 0 : isCallout ? 8 : 16}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isSelected || isConnectFrom ? 3.5 : 2.5}
                    strokeDasharray={isConnectFrom || isCallout ? "7 6" : undefined}
                    filter={isCallout ? undefined : `url(#soft-${idPrefix})`}
                  />
                  {wrapLabel(node.label).map((line, i, lines) => (
                    <text
                      key={`${node.id}-${i}`}
                      x={node.w / 2}
                      y={node.h / 2 + (i - (lines.length - 1) / 2) * 17 + 5}
                      textAnchor="middle"
                      fontSize={isCallout ? "13" : "15"}
                      fontWeight="700"
                      fill={text}
                    >
                      {line}
                    </text>
                  ))}
                </>
              )}
              {isSelected && !isDivider && !isMarker ? (
                <rect
                  x={node.w - 10}
                  y={node.h - 10}
                  width={14}
                  height={14}
                  rx={3}
                  fill={highlight}
                  stroke={background}
                  strokeWidth={2}
                  style={{ cursor: "nwse-resize" }}
                  onPointerDown={(event) => handleResizePointerDown(node, event)}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
      </div>
    </div>
  );
}
