import { isDiagramGroupNode } from "./diagram-xml";
import type { DiagramPlan } from "./types";

export type FirstGenerationNodeIconBinding = {
  sourceNodeId: string;
  targetNodeId: string;
  targetNodeLabel: string;
  iconId: string;
};

export type FirstGenerationManifest = {
  workingPrompt: string;
  promptRevisionId: string | null;
  promptFingerprint: string;
  skeletonId: string;
  skeletonXml: string | null;
  styleReferenceId: string;
  nodeIconBindings: FirstGenerationNodeIconBinding[];
  boundIconIds: string[];
  matchAppearanceFingerprint: string;
  styleKitFingerprint: string;
};

export type FirstGenerationReadiness = {
  promptReady: boolean;
  skeletonReady: boolean;
  styleReady: boolean;
  canGenerate: boolean;
  missing: Array<"prompt" | "skeleton" | "style">;
};

function roundedPlanNumber(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

/**
 * Draw.io can rewrite equivalent XML when its page is reopened. Candidate
 * staleness therefore compares the generation-relevant diagram structure,
 * not serialization details such as wrapper attributes or element order.
 */
export function createDiagramPlanInputSignature(plan: DiagramPlan | null | undefined): string | null {
  if (!plan) return null;
  return JSON.stringify({
    width: roundedPlanNumber(plan.width),
    height: roundedPlanNumber(plan.height),
    nodes: [...plan.nodes]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((node) => ({
        id: node.id,
        label: node.label.trim(),
        role: node.role ?? null,
        shape: node.shape ?? null,
        groupId: node.groupId ?? null,
        x: roundedPlanNumber(node.x),
        y: roundedPlanNumber(node.y),
        w: roundedPlanNumber(node.w),
        h: roundedPlanNumber(node.h),
      })),
    edges: [...plan.edges]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        label: edge.label?.trim() ?? "",
        kind: edge.kind ?? null,
        sourcePort: edge.sourcePort ?? null,
        targetPort: edge.targetPort ?? null,
        points: (edge.points ?? []).map((point) => ({
          x: roundedPlanNumber(point.x),
          y: roundedPlanNumber(point.y),
        })),
      })),
  });
}

function normalizedSkeletonSource(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\r\n/g, "\n");
}

export function firstGenerationSkeletonChanged(args: {
  snapshotId: string | null;
  snapshotSource: string | null;
  snapshotPlan: DiagramPlan | null;
  currentId: string | null;
  currentSource: string | null;
  currentPlan: DiagramPlan | null;
}): boolean {
  if (args.snapshotId !== args.currentId) return true;
  const snapshotSignature = createDiagramPlanInputSignature(args.snapshotPlan);
  const currentSignature = createDiagramPlanInputSignature(args.currentPlan);
  if (snapshotSignature && currentSignature) return snapshotSignature !== currentSignature;
  return normalizedSkeletonSource(args.snapshotSource) !== normalizedSkeletonSource(args.currentSource);
}

/**
 * Frontend-only source of truth for the three required first-generation inputs.
 * Node–Icon mappings remain optional and are therefore intentionally excluded.
 */
export function resolveFirstGenerationReadiness(args: {
  workingPrompt: string;
  skeletonId?: string | null;
  styleReferenceId?: string | null;
}): FirstGenerationReadiness {
  const promptReady = args.workingPrompt.trim().length > 0;
  const skeletonReady = Boolean(args.skeletonId);
  const styleReady = Boolean(args.styleReferenceId);
  const missing: FirstGenerationReadiness["missing"] = [];
  if (!promptReady) missing.push("prompt");
  if (!skeletonReady) missing.push("skeleton");
  if (!styleReady) missing.push("style");
  return {
    promptReady,
    skeletonReady,
    styleReady,
    canGenerate: missing.length === 0,
    missing,
  };
}

export function fingerprintWorkingPrompt(value: string): string {
  let hash = 0x811c9dc5;
  const normalized = value.trim().replace(/\r\n/g, "\n");
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `prompt-${(hash >>> 0).toString(36).padStart(7, "0")}`;
}

export function resolveFirstGenerationNodeIconBindings(args: {
  plan: DiagramPlan | null;
  nodeIconBindings: Record<string, string>;
}): FirstGenerationNodeIconBinding[] {
  if (!args.plan) return [];
  const directNodes = new Map(args.plan.nodes.map((node) => [node.id, node] as const));
  const resolved: FirstGenerationNodeIconBinding[] = [];

  Object.entries(args.nodeIconBindings)
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([sourceNodeId, iconId]) => {
      const direct = directNodes.get(sourceNodeId);
      const target = direct ?? null;
      if (!target || !iconId.trim()) return;
      if (isDiagramGroupNode(target)) return;
      resolved.push({
        sourceNodeId,
        targetNodeId: target.id,
        targetNodeLabel: target.label || target.id,
        iconId: iconId.trim(),
      });
    });

  return resolved;
}

export function createFirstGenerationManifest(args: {
  workingPrompt: string;
  promptRevisionId?: string | null;
  promptFingerprint?: string | null;
  skeletonId: string;
  skeletonXml?: string | null;
  styleReferenceId: string;
  plan: DiagramPlan | null;
  nodeIconBindings: Record<string, string>;
  matchAppearanceFingerprint?: string;
  styleKitFingerprint: string;
}): FirstGenerationManifest {
  const workingPrompt = args.workingPrompt.trim();
  const nodeIconBindings = resolveFirstGenerationNodeIconBindings({
    plan: args.plan,
    nodeIconBindings: args.nodeIconBindings,
  });
  return {
    workingPrompt,
    promptRevisionId: args.promptRevisionId ?? null,
    promptFingerprint: args.promptFingerprint || fingerprintWorkingPrompt(workingPrompt),
    skeletonId: args.skeletonId,
    skeletonXml: args.skeletonXml ?? null,
    styleReferenceId: args.styleReferenceId,
    nodeIconBindings,
    boundIconIds: Array.from(new Set(nodeIconBindings.map((binding) => binding.iconId))),
    matchAppearanceFingerprint: args.matchAppearanceFingerprint ?? "font:none|palette:none",
    styleKitFingerprint: args.styleKitFingerprint,
  };
}
