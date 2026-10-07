import type { DiagramEdge, DiagramNode, DiagramPlan } from "./types";

function escapeMermaidLabel(label: string): string {
  return label
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\|/g, "/")
    .replace(/\r?\n/g, "<br/>")
    .trim();
}

function makeNodeIds(nodes: DiagramNode[]) {
  const ids = new Map<string, string>();
  nodes.forEach((node, index) => {
    ids.set(node.id, `n${index + 1}`);
  });
  return ids;
}

function nodeStatement(node: DiagramNode, mermaidId: string): string {
  const label = escapeMermaidLabel(node.label || "Node");
  const role = (node.role ?? "").toLowerCase();
  const shape = (node.shape ?? "").toLowerCase();

  if (role === "marker" || role === "goodmarker" || role === "badmarker" || shape === "marker") {
    return `${mermaidId}(("${label}"))`;
  }
  if (shape === "text" || role === "annotation" || role === "callout") {
    return `${mermaidId}["${label}"]`;
  }
  if (role === "model" || role === "process" || role === "reasoning" || role === "fusion") {
    return `${mermaidId}("${label}")`;
  }
  return `${mermaidId}["${label}"]`;
}

function edgeStatement(edge: DiagramEdge, ids: Map<string, string>): string | null {
  const from = ids.get(edge.from);
  const to = ids.get(edge.to);
  if (!from || !to) return null;
  const arrow = edge.kind === "feedback" ? "-.->" : "-->";
  const label = escapeMermaidLabel(edge.label ?? "");
  return label ? `${from} ${arrow}|${label}| ${to}` : `${from} ${arrow} ${to}`;
}

function classForNode(node: DiagramNode): string {
  const role = (node.role ?? "process").toLowerCase();
  if (role === "goodmarker") return "goodMarker";
  if (role === "badmarker") return "badMarker";
  if (role === "document" || role === "data" || role === "encoder") return "data";
  if (role === "model" || role === "fusion") return "model";
  if (role === "output") return "output";
  if (role === "annotation" || role === "callout") return "annotation";
  if (role === "input") return "input";
  return "process";
}

export function diagramPlanToMermaid(plan: DiagramPlan): string {
  const drawableNodes = plan.nodes.filter((node) => {
    const role = (node.role ?? "").toLowerCase();
    const shape = (node.shape ?? "").toLowerCase();
    return role !== "group" && role !== "divider" && shape !== "divider";
  });
  const ids = makeNodeIds(drawableNodes);
  const lines = ["flowchart LR"];

  drawableNodes.forEach((node) => {
    const id = ids.get(node.id);
    if (!id) return;
    lines.push(`  ${nodeStatement(node, id)}`);
  });

  plan.edges.forEach((edge) => {
    const statement = edgeStatement(edge, ids);
    if (statement) lines.push(`  ${statement}`);
  });

  const classGroups = new Map<string, string[]>();
  drawableNodes.forEach((node) => {
    const id = ids.get(node.id);
    if (!id) return;
    const className = classForNode(node);
    classGroups.set(className, [...(classGroups.get(className) ?? []), id]);
  });

  classGroups.forEach((nodeIds, className) => {
    lines.push(`  class ${nodeIds.join(",")} ${className};`);
  });

  lines.push("  classDef input fill:#dbeafe,stroke:#3b82f6,color:#172033,stroke-width:1.5px;");
  lines.push("  classDef data fill:#dcfce7,stroke:#22c55e,color:#172033,stroke-width:1.5px;");
  lines.push("  classDef process fill:#fef3c7,stroke:#f59e0b,color:#172033,stroke-width:1.5px;");
  lines.push("  classDef model fill:#f3e8ff,stroke:#a855f7,color:#172033,stroke-width:1.5px;");
  lines.push("  classDef output fill:#e0e7ff,stroke:#6366f1,color:#172033,stroke-width:1.5px;");
  lines.push("  classDef annotation fill:#f1f5f9,stroke:#94a3b8,color:#172033,stroke-width:1.5px;");
  lines.push("  classDef goodMarker fill:#dcfce7,stroke:#22c55e,color:#166534,stroke-width:1.5px;");
  lines.push("  classDef badMarker fill:#fee2e2,stroke:#ef4444,color:#991b1b,stroke-width:1.5px;");

  return lines.join("\n");
}
