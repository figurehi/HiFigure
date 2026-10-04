"use client";

import { useMemo } from "react";
import type { DiagramNode, DiagramPlan } from "../lib/types";

function isGroupNode(node: DiagramNode) {
  return ["group", "container", "panel", "lane", "section"].includes((node.role ?? "").toLowerCase());
}

function centerOf(node: DiagramNode) {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

export function HtmlBlueprintPreview({ plan, compact = false }: { plan: DiagramPlan; compact?: boolean }) {
  const nodesById = useMemo(() => new Map(plan.nodes.map((node) => [node.id, node] as const)), [plan.nodes]);
  const groups = plan.nodes.filter(isGroupNode);
  const ordinaryNodes = plan.nodes.filter((node) => !isGroupNode(node));
  const width = Math.max(1, plan.width || 1600);
  const height = Math.max(1, plan.height || 960);

  function styleFor(node: DiagramNode) {
    return {
      left: `${(node.x / width) * 100}%`,
      top: `${(node.y / height) * 100}%`,
      width: `${(node.w / width) * 100}%`,
      height: `${(node.h / height) * 100}%`,
    };
  }

  return (
    <div className={`layout-html-panel ${compact ? "is-compact" : ""}`}>
      <div className="layout-html-panel-head">
        <div className="min-w-0">
          <span className="label-text">Generated blueprint HTML</span>
          <p className="mono muted">
            {plan.nodes.length} nodes / {plan.edges.length} edges / {groups.length} groups
          </p>
        </div>
      </div>
      <div className="layout-html-canvas-wrap">
        <div className="layout-html-canvas" style={{ aspectRatio: `${width} / ${height}` }}>
          <svg className="layout-html-edges" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
            <defs>
              <marker id="layout-html-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>
            {plan.edges.map((edge, index) => {
              const from = nodesById.get(edge.from);
              const to = nodesById.get(edge.to);
              if (!from || !to) return null;
              const a = centerOf(from);
              const b = centerOf(to);
              return (
                <g key={`${edge.id}-${edge.from}-${edge.to}-${index}`}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    markerEnd="url(#layout-html-arrow)"
                    className={edge.kind === "feedback" ? "is-feedback" : undefined}
                  />
                  {edge.label ? (
                    <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6}>
                      {edge.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          {groups.map((node) => (
            <div key={node.id} className="layout-html-node is-group" style={styleFor(node)}>
              <span>{node.label}</span>
            </div>
          ))}
          {ordinaryNodes.map((node) => (
            <div
              key={node.id}
              className={`layout-html-node role-${(node.role ?? "process").toLowerCase()} shape-${(node.shape ?? "roundRect").toLowerCase()}`}
              style={styleFor(node)}
              title={`${node.id}${node.groupId ? ` in ${node.groupId}` : ""}`}
            >
              <span>{node.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
