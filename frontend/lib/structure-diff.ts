import type { DiagramPlan } from "./types";

export type StructureDiffSummary = {
  added: string[];
  removed: string[];
  renamed: string[];
  moved: string[];
  connectionsAdded: string[];
  connectionsRemoved: string[];
  connectionsChanged: string[];
};

function nodeLabel(plan: DiagramPlan, id: string) {
  return plan.nodes.find((node) => node.id === id)?.label || id;
}

export function diffDiagramPlans(
  previous: DiagramPlan | null | undefined,
  current: DiagramPlan | null | undefined,
): StructureDiffSummary {
  const empty: StructureDiffSummary = {
    added: [],
    removed: [],
    renamed: [],
    moved: [],
    connectionsAdded: [],
    connectionsRemoved: [],
    connectionsChanged: [],
  };
  if (!current) return empty;
  if (!previous) {
    return {
      ...empty,
      added: current.nodes.map((node) => node.label || node.id),
      connectionsAdded: current.edges.map((edge) =>
        `${nodeLabel(current, edge.from)} → ${nodeLabel(current, edge.to)}`,
      ),
    };
  }

  const previousNodes = new Map(previous.nodes.map((node) => [node.id, node]));
  const currentNodes = new Map(current.nodes.map((node) => [node.id, node]));
  const previousEdges = new Map(previous.edges.map((edge) => [edge.id, edge]));
  const currentEdges = new Map(current.edges.map((edge) => [edge.id, edge]));

  for (const node of current.nodes) {
    const before = previousNodes.get(node.id);
    if (!before) {
      empty.added.push(node.label || node.id);
      continue;
    }
    if (before.label.trim() !== node.label.trim()) {
      empty.renamed.push(`${before.label || before.id} → ${node.label || node.id}`);
    }
    if (Math.abs(before.x - node.x) > 1 || Math.abs(before.y - node.y) > 1) {
      empty.moved.push(node.label || node.id);
    }
  }
  for (const node of previous.nodes) {
    if (!currentNodes.has(node.id)) empty.removed.push(node.label || node.id);
  }

  for (const edge of current.edges) {
    const before = previousEdges.get(edge.id);
    const description = `${nodeLabel(current, edge.from)} → ${nodeLabel(current, edge.to)}`;
    if (!before) {
      empty.connectionsAdded.push(description);
      continue;
    }
    if (
      before.from !== edge.from ||
      before.to !== edge.to ||
      (before.label ?? "") !== (edge.label ?? "") ||
      (before.kind ?? "") !== (edge.kind ?? "")
    ) {
      empty.connectionsChanged.push(description);
    }
  }
  for (const edge of previous.edges) {
    if (!currentEdges.has(edge.id)) {
      empty.connectionsRemoved.push(`${nodeLabel(previous, edge.from)} → ${nodeLabel(previous, edge.to)}`);
    }
  }
  return empty;
}
