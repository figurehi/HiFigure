"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { svgPreviewDataUrl } from "../lib/evolve-artifact";
import {
  appendStudyEvent,
  useWorkspaceState,
  type IdeaHistoryNode,
  type IdeaSparkStepId,
} from "../lib/workspace-state";
import type { FigureVariant } from "../lib/types";
import styles from "./idea-history-view.module.css";

export type { IdeaSparkStepId } from "../lib/workspace-state";

export type IdeaSparkGenerationStatus = {
  canGenerate: boolean;
  missing: Array<"prompt" | "skeleton" | "style">;
  running: {
    layout: boolean;
    style: boolean;
    candidate: boolean;
  };
  prompt: { ready: boolean; preview: string; revisionLabel: string };
  layout: { ready: boolean; referenceId: string | null; title: string };
  skeleton: {
    ready: boolean;
    stale: boolean;
    id: string | null;
    title: string;
    nodeCount: number;
    relationCount: number;
  };
  style: {
    ready: boolean;
    referenceId: string | null;
    title: string;
  };
  icons: { count: number };
  candidate: { id: string | null; title: string; count: number; stale: boolean };
  editCount: number;
  reviewCount: number;
};

type SparkStatus = "missing" | "ready" | "running" | "stale" | "generated" | "reviewed" | "optional";

type StepMeta = {
  id: IdeaSparkStepId;
  shortLabel: string;
  phase: "envision" | "externalize" | "evolve";
  role: "required" | "preparation" | "optional" | "result";
};

const STEPS: StepMeta[] = [
  { id: "prompt", shortLabel: "Prompt", phase: "envision", role: "required" },
  { id: "retrieval", shortLabel: "Retrieval", phase: "envision", role: "preparation" },
  { id: "layout", shortLabel: "Layout", phase: "externalize", role: "preparation" },
  { id: "style", shortLabel: "Style", phase: "externalize", role: "required" },
  { id: "icons", shortLabel: "Match", phase: "externalize", role: "optional" },
  { id: "candidate", shortLabel: "Candidate", phase: "evolve", role: "result" },
  { id: "review", shortLabel: "History", phase: "evolve", role: "result" },
];

const NAV_PHASES = [
  { id: "envision", label: "Envision", steps: ["prompt", "retrieval"] as IdeaSparkStepId[] },
  { id: "externalize", label: "Externalize", steps: ["layout", "style", "icons"] as IdeaSparkStepId[] },
  { id: "evolve", label: "Evolve", steps: ["candidate", "review"] as IdeaSparkStepId[] },
] as const;

function shortText(value: string, limit = 88) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}

function previewForVariant(variant: FigureVariant | null | undefined) {
  if (!variant) return null;
  return variant.previewImageDataUrl ?? variant.previewImageUrl ?? svgPreviewDataUrl(variant.svg);
}

function stepPresentation(
  step: IdeaSparkStepId,
  generation: IdeaSparkGenerationStatus,
  referenceCount: number,
) {
  if (step === "prompt") return {
    status: generation.prompt.ready ? "ready" : "missing" as SparkStatus,
    tooltip: generation.prompt.ready
      ? `${generation.prompt.revisionLabel}: ${shortText(generation.prompt.preview)}`
      : "An assigned task brief is required for first generation.",
  };
  if (step === "retrieval") return {
    status: referenceCount ? "ready" : "missing" as SparkStatus,
    tooltip: referenceCount
      ? `${referenceCount} saved reference${referenceCount === 1 ? "" : "s"}. Retrieval prepares Layout and Style inputs.`
      : "Search for references. Retrieval is preparation and is not sent directly.",
  };
  if (step === "layout") return {
    status: generation.running.layout ? "running" : generation.layout.ready ? "ready" : "missing" as SparkStatus,
    tooltip: generation.running.layout
      ? "Generating the editable Skeleton…"
      : generation.layout.ready
      ? `${generation.layout.title}. Layout builds the Skeleton and is not a direct first-generation input.`
      : "Choose a Layout reference or start a blank Skeleton.",
  };
  if (step === "skeleton") return {
    status: generation.skeleton.stale
      ? "stale"
      : generation.skeleton.ready
        ? "ready"
        : "missing" as SparkStatus,
    tooltip: generation.skeleton.ready
      ? `${generation.skeleton.title}: ${generation.skeleton.nodeCount} node${generation.skeleton.nodeCount === 1 ? "" : "s"}${generation.skeleton.stale ? "; prompt changed since generation" : ""}.`
      : "Generate a Skeleton from Layout before continuing to Style and Match.",
  };
  if (step === "style") return {
    status: generation.style.ready ? "ready" : "missing" as SparkStatus,
    tooltip: generation.style.ready
      ? `${generation.style.title}. Extract icons from this reference for Match.`
      : "Choose one Primary overall Style reference.",
  };
  if (step === "icons") return {
    status: generation.icons.count ? "ready" : "optional" as SparkStatus,
    tooltip: generation.icons.count
      ? `${generation.icons.count} confirmed node–Icon mapping${generation.icons.count === 1 ? "" : "s"}.`
      : "Match is optional; confirm icons before generation.",
  };
  if (step === "candidate") return {
    status: generation.running.candidate
      ? "running"
      : generation.candidate.stale
      ? "stale"
      : generation.candidate.id
        ? "generated"
        : generation.canGenerate
          ? "ready"
          : "missing" as SparkStatus,
    tooltip: generation.running.candidate
      ? "Generating a Candidate or applying an Edit revision…"
      : generation.candidate.id
      ? `${generation.candidate.title}${generation.candidate.stale ? " uses earlier inputs" : ""}.`
      : generation.canGenerate
        ? "Prompt, Skeleton, and Style are ready to confirm."
        : `Missing ${generation.missing.join(", ") || "generation inputs"}.`,
  };
  if (step === "edit") return {
    status: generation.editCount ? "generated" : generation.candidate.id ? "ready" : "missing" as SparkStatus,
    tooltip: generation.editCount
      ? `${generation.editCount} saved Edit result${generation.editCount === 1 ? "" : "s"}.`
      : generation.candidate.id ? "Refine the current Candidate." : "Generate a Candidate before editing.",
  };
  return {
    status: generation.reviewCount ? "reviewed" : generation.candidate.id ? "ready" : "missing" as SparkStatus,
    tooltip: generation.reviewCount
      ? `${generation.reviewCount} current author check${generation.reviewCount === 1 ? "" : "s"}.`
      : generation.candidate.id ? "Browse the version tree and jump to any saved step." : "Generate a Candidate before opening History.",
  };
}

export function IdeaSparkNavigator({
  activeStep,
  generation,
  onOpenStep,
}: {
  activeStep: IdeaSparkStepId;
  generation: IdeaSparkGenerationStatus;
  onOpenStep: (step: IdeaSparkStepId) => void;
}) {
  const { state } = useWorkspaceState();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeStep]);

  return (
    <nav className={styles.navigator} aria-label="Idea Spark workflow">
      <div className={styles.navigatorHeading}>
        <i aria-hidden="true">✦</i>
        <span><strong>Idea Spark</strong><small>Navigate</small></span>
      </div>
      <div className={styles.navigatorScroller} ref={scrollerRef}>
        <div className={styles.compactFlow}>
          {NAV_PHASES.map((phase) => (
            <section key={phase.id} className={`${styles.phaseGroup} ${styles[`phase_${phase.id}`]}`}>
              <span className={styles.phaseLabel}>{phase.label}</span>
              <div className={styles.phaseSteps}>
                {phase.steps.map((stepId) => {
                  const step = STEPS.find((item) => item.id === stepId)!;
                  const display = stepPresentation(step.id, generation, state.board.length);
                  const active = activeStep === step.id;
                  return (
                    <button
                      key={step.id}
                      ref={active ? activeRef : undefined}
                      type="button"
                      className={`${styles.compactNode} ${styles[`status_${display.status}`]} ${active ? styles.activeNode : ""}`}
                      onClick={() => onOpenStep(step.id)}
                      aria-current={active ? "step" : undefined}
                      aria-busy={display.status === "running" || undefined}
                      aria-label={`${step.shortLabel}: ${display.tooltip}`}
                      title={display.tooltip}
                      data-guide-anchor={step.id === "style" ? "style-open-action" : step.id === "candidate" ? "generation-action" : undefined}
                    >
                      <i aria-hidden="true" />
                      <span>{step.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </nav>
  );
}

function historyNodeLabel(node: IdeaHistoryNode) {
  if (node.kind === "root") return "Prompt";
  if (node.kind === "checkpoint") return "Saved idea";
  if (node.kind === "skeleton") return "Skeleton";
  if (node.kind === "candidate") return "Candidate";
  return "Edit";
}

export function IdeaHistoryPanel({
  onClose,
  onRestore,
  onNewFigure,
  onSaveIdea,
}: {
  onClose: () => void;
  onRestore: (nodeId: string) => void;
  onNewFigure: () => void;
  onSaveIdea: () => void;
}) {
  const { state, setState } = useWorkspaceState();
  const [mounted, setMounted] = useState(false);
  const { nodes, snapshots, activeNodeId, previewNodeId, activeRootId } = state.ideaHistory;
  const roots = useMemo(
    () => nodes.filter((node) => node.kind === "root").sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [nodes],
  );
  const selectedNode = nodes.find((node) => node.id === previewNodeId) ??
    nodes.find((node) => node.id === activeNodeId) ??
    roots.find((node) => node.id === activeRootId) ?? roots[0] ?? null;
  const viewedRootId = selectedNode?.rootId ?? activeRootId ?? roots[0]?.id ?? null;
  const viewedNodes = nodes
    .filter((node) => node.rootId === viewedRootId && node.kind !== "root")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const selectedSnapshot = selectedNode ? snapshots[selectedNode.snapshotId] ?? null : null;
  const selectedVariant = selectedNode?.variantId
    ? state.variants.find((variant) => variant.id === selectedNode.variantId) ?? null
    : null;
  const selectedPreview = previewForVariant(selectedVariant);

  useEffect(() => {
    setMounted(true);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  function previewNode(node: IdeaHistoryNode) {
    setState((current) => appendStudyEvent({
      ...current,
      ideaHistory: { ...current.ideaHistory, previewNodeId: node.id },
    }, {
      stage: current.activeStudyStage,
      type: "idea_node_previewed",
      targetIds: [node.id, ...(node.skeletonId ? [node.skeletonId] : []), ...(node.variantId ? [node.variantId] : [])],
      result: node.kind,
      metadata: { rootId: node.rootId },
    }));
  }

  if (!mounted) return null;
  return createPortal(
    <div className={styles.historyBackdrop} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.historyPanel}
        role="dialog"
        aria-modal="true"
        aria-label="Saved ideas"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.historyHeader}>
          <div><span>Idea history</span><h2>Saved branches</h2></div>
          <button type="button" onClick={onClose} aria-label="Close Idea history">×</button>
        </header>
        <div className={styles.historyActions}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onSaveIdea} disabled={state.studySessionStatus === "finished"}>Save idea</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => { onNewFigure(); onClose(); }} disabled={state.studySessionStatus === "finished"}>+ New Figure</button>
        </div>
        <div className={styles.figureTabs} role="tablist" aria-label="Saved figures">
          {roots.map((root, index) => (
            <button
              key={root.id}
              type="button"
              role="tab"
              aria-selected={root.id === viewedRootId}
              className={root.id === viewedRootId ? styles.figureTabActive : ""}
              onClick={() => previewNode(root)}
            >
              Figure {index + 1}{root.id === activeRootId ? <em>Current</em> : null}
            </button>
          ))}
        </div>
        <div className={styles.historyBody}>
          <div className={styles.lineage} aria-label="Idea lineage">
            {viewedNodes.length ? viewedNodes.map((node) => (
              <button
                key={node.id}
                type="button"
                className={`${styles.lineageNode} ${node.id === selectedNode?.id ? styles.lineageNodeActive : ""} ${node.kind === "checkpoint" ? styles.lineageCheckpoint : ""}`}
                onClick={() => previewNode(node)}
              >
                <i aria-hidden="true" />
                <span>{historyNodeLabel(node)}</span>
                <strong>{node.title}</strong>
                <small>{new Date(node.createdAt).toLocaleString()}</small>
              </button>
            )) : <p className={styles.emptyHistory}>No saved artifacts yet. Use Save idea or generate a Skeleton.</p>}
          </div>
          {selectedNode ? (
            <article className={styles.historyPreview}>
              <span>{historyNodeLabel(selectedNode)}</span>
              <h3>{selectedNode.title}</h3>
              {selectedPreview ? <img src={selectedPreview} alt="" /> : null}
              <p>{selectedSnapshot?.prompt ? shortText(selectedSnapshot.prompt, 150) : "Prompt starting point."}</p>
              <dl>
                <div><dt>Skeleton</dt><dd>{selectedSnapshot?.selectedSkeleton?.title ?? "None"}</dd></div>
                <div><dt>Style</dt><dd>{selectedSnapshot?.styleReferenceId ? "Selected" : "None"}</dd></div>
                <div><dt>Icons</dt><dd>{Object.keys(selectedSnapshot?.nodeIconBindings ?? {}).length}</dd></div>
              </dl>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => { onRestore(selectedNode.id); onClose(); }}
                disabled={selectedNode.id === activeNodeId}
              >
                {selectedNode.id === activeNodeId ? "Current idea" : "Restore this idea"}
              </button>
            </article>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  );
}
