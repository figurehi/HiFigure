"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { generateDiagramSkeleton } from "../lib/api";
import { parseDrawioXmlToDiagramPlan } from "../lib/diagram-xml";
import { latestSkeletonForReference } from "../lib/layout-skeleton-selection";
import { diffDiagramPlans } from "../lib/structure-diff";
import { pruneNodeIconBindingsForPlan } from "../lib/style-kit";
import type { DiagramSkeletonCandidate, ReferenceItem } from "../lib/types";
import type { StagePrimaryActionRegistration } from "../lib/stage-primary-action";
import { continueToStepLabel } from "../lib/idea-spark-flow";
import {
  appendNarratorMessage,
  appendStudyEvent,
  commitWorkingPromptRevision,
  createNarratorArtifactFingerprint,
  transitionStudyStage,
  updateActiveCreativeCanvasState,
  useWorkspaceState,
  type CreativeCanvasState,
} from "../lib/workspace-state";
import { DrawioEmbed } from "./drawio-embed";
import { LayoutPngPreview } from "./layout-png-preview";
import { MermaidDiagramPreview } from "./mermaid-diagram-preview";
import { ScientificStructurePanel } from "./scientific-structure-panel";
import { SkeletonPromptConfirmDialog } from "./skeleton-prompt-confirm-dialog";
import { GuidedConversationPanel } from "./studio-narrator";
import styles from "./layout-studio.module.css";

type LayoutIntentKind =
  | "pipeline"
  | "loop"
  | "branch"
  | "hub"
  | "modules"
  | "groups"
  | "dense"
  | "sparse"
  | "anchors"
  | "connectors"
  | "panels"
  | "inset";

type LayoutIntent = {
  id: string;
  kind: LayoutIntentKind;
  category: string;
  label: string;
  description: string;
  brief: string;
};

function LayoutActionIcon({ type }: { type: "layout" | "skeleton" | "preview" }) {
  if (type === "layout") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <rect x="3" y="4" width="14" height="12" rx="2" />
        <path d="M8 4v12M3 9h14" />
      </svg>
    );
  }
  if (type === "preview") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M2.8 10s2.6-4.5 7.2-4.5S17.2 10 17.2 10s-2.6 4.5-7.2 4.5S2.8 10 2.8 10Z" />
        <circle cx="10" cy="10" r="2" />
      </svg>
    );
  }
  if (type === "skeleton") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <rect x="3" y="4" width="5" height="4" rx="1" />
        <rect x="12" y="4" width="5" height="4" rx="1" />
        <rect x="7.5" y="12" width="5" height="4" rx="1" />
        <path d="M8 6h4M10 8v4M12 14h-1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="8.5" cy="8.5" r="4.5" />
      <path d="M12 12l4 4M4 5.5c1.5-1.4 3.1-2 5-1.8" />
    </svg>
  );
}

function imageUrlToDataUrl(url: string): Promise<string | null> {
  if (url.startsWith("data:image/")) return Promise.resolve(url);
  return fetch(url, { mode: "cors", cache: "no-store" })
    .then((response) => {
      if (!response.ok) return null;
      return response.blob();
    })
    .then((blob) => {
      if (!blob) return null;
      return new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    })
    .catch(() => null);
}

function layoutIntentText(reference: ReferenceItem | null) {
  if (!reference) return "";
  return `${reference.title} ${reference.subject} ${reference.imageType} ${reference.styleTags.join(" ")} ${reference.similarityReason} ${reference.structuralAnalysis}`.toLowerCase();
}

function inferLayoutIntents(reference: ReferenceItem | null): LayoutIntent[] {
  if (!reference) return [];
  const text = layoutIntentText(reference);
  const flow: LayoutIntent = /loop|cycle|feedback|iterat|dialog/.test(text)
    ? {
        id: "flow-loop",
        kind: "loop",
        category: "Flow",
        label: "Loop flow",
        description: "Reuse a cyclic or feedback-oriented reading path.",
        brief: "loop or feedback flow",
      }
    : /branch|tree|split|multi-path|parallel|compare|comparison/.test(text)
      ? {
          id: "flow-branch",
          kind: "branch",
          category: "Flow",
          label: "Branch flow",
          description: "Split the story into parallel paths or alternatives.",
          brief: "branching multi-path flow",
        }
      : /hub|center|central|spoke|radial/.test(text)
        ? {
            id: "flow-hub",
            kind: "hub",
            category: "Flow",
            label: "Hub-spoke",
            description: "Place a central module with surrounding inputs and outputs.",
            brief: "central hub-and-spoke organization",
          }
        : {
            id: "flow-pipeline",
            kind: "pipeline",
            category: "Flow",
            label: "Left-right pipeline",
            description: "Move from input to process to output across the page.",
            brief: "left-to-right pipeline",
          };

  const grammar: LayoutIntent = /dash|dotted|group|cluster|container|region/.test(text)
    ? {
        id: "grammar-groups",
        kind: "groups",
        category: "Modules",
        label: "Dashed groups",
        description: "Use grouped regions to organize related steps.",
        brief: "dashed group containers",
      }
    : {
        id: "grammar-modules",
        kind: "modules",
        category: "Modules",
        label: "Rounded modules",
        description: "Use compact module boxes as the basic grammar.",
        brief: "rounded module boxes",
      };

  const density: LayoutIntent = /dense|many|multi|several|detailed|complex|paper|figure/.test(text)
    ? {
        id: "density-dense",
        kind: "dense",
        category: "Density",
        label: "Dense figure",
        description: "Keep many compact steps visible in one paper figure.",
        brief: "dense multi-step paper figure rhythm",
      }
    : {
        id: "density-sparse",
        kind: "sparse",
        category: "Density",
        label: "Sparse overview",
        description: "Use fewer larger modules for a high-level overview.",
        brief: "sparse overview with large modules",
      };

  const connector: LayoutIntent = /curve|round|loop|feedback|cycle|dialog/.test(text)
    ? {
        id: "connector-curved",
        kind: "connectors",
        category: "Connectors",
        label: "Curved connectors",
        description: "Use curved arrows to show return paths or iteration.",
        brief: "curved feedback connectors",
      }
    : {
        id: "connector-straight",
        kind: "connectors",
        category: "Connectors",
        label: "Straight arrows",
        description: "Use clean directional arrows between modules.",
        brief: "straight directional arrows",
      };

  const composition: LayoutIntent = /panel|subplot|multi-panel|comparison|ablation|inset/.test(text)
    ? {
        id: "composition-panels",
        kind: /inset/.test(text) ? "inset" : "panels",
        category: "Composition",
        label: /inset/.test(text) ? "Main + inset" : "Multi-panel",
        description: /inset/.test(text)
          ? "Keep one main view with a smaller supporting inset."
          : "Organize the figure into multiple coordinated panels.",
        brief: /inset/.test(text) ? "main panel with inset" : "multi-panel composition",
      }
    : {
        id: "composition-anchors",
        kind: "anchors",
        category: "Anchors",
        label: "Spatial anchors",
        description: "Preserve input, model, and output positions from the reference.",
        brief: "clear spatial anchors for input, process, and output",
      };

  return [flow, grammar, density, connector, composition];
}

function maxCanvasZ(canvas: CreativeCanvasState) {
  return canvas.items.reduce((max, item) => Math.max(max, item.z), 0);
}

function fillLayoutTemplateSlot(canvas: CreativeCanvasState, referenceId: string): CreativeCanvasState {
  const existingSelected = canvas.items.find(
    (item) =>
      item.type === "reference" &&
      item.role === "layout" &&
      item.referenceId === referenceId &&
      !item.deletedAt,
  );
  if (existingSelected) {
    return { ...canvas, selectedItemId: existingSelected.id };
  }

  const layoutSlot = canvas.items.find(
    (item) =>
      !item.deletedAt &&
      ((item.type === "template" && item.templateKind === "layout") ||
        (item.type === "reference" && item.role === "layout")),
  );
  const target = layoutSlot ?? {
    id: `canvas-ref-layout-${referenceId}-${Date.now()}`,
    x: 72,
    y: 94,
    w: 430,
    h: 292,
    z: maxCanvasZ(canvas) + 1,
  };
  const nextItem = {
    ...target,
    type: "reference" as const,
    role: "layout" as const,
    referenceId,
    templateKind: undefined,
    templateTitle: undefined,
    templateHint: undefined,
    w: Math.max(target.w, 430),
    h: Math.max(target.h, 292),
  };
  const items = layoutSlot
    ? canvas.items.map((item) => (item.id === layoutSlot.id ? nextItem : item))
    : [...canvas.items, nextItem];
  return {
    ...canvas,
    items,
    selectedItemId: nextItem.id,
  };
}

function fillSkeletonTemplateSlot(canvas: CreativeCanvasState, skeletonId: string, sourceReferenceId?: string | null): CreativeCanvasState {
  const existingSelected = canvas.items.find(
    (item) => item.type === "skeleton" && item.skeletonId === skeletonId && !item.deletedAt,
  );
  if (existingSelected) {
    return { ...canvas, selectedItemId: existingSelected.id };
  }

  const skeletonSlot = canvas.items.find(
    (item) =>
      !item.deletedAt &&
      ((item.type === "template" && item.templateKind === "skeleton") ||
        item.type === "skeleton"),
  );
  const target = skeletonSlot ?? {
    id: `canvas-skeleton-${skeletonId}`,
    x: 478,
    y: 154,
    w: 590,
    h: 390,
    z: maxCanvasZ(canvas) + 1,
  };
  const existingSourceReferenceId = "sourceReferenceId" in target ? target.sourceReferenceId : undefined;
  const nextItem = {
    ...target,
    type: "skeleton" as const,
    skeletonId,
    sourceReferenceId: sourceReferenceId ?? existingSourceReferenceId,
    templateKind: undefined,
    templateTitle: undefined,
    templateHint: undefined,
    w: Math.max(target.w, 590),
    h: Math.max(target.h, 390),
  };
  const items = skeletonSlot
    ? canvas.items.map((item) => (item.id === skeletonSlot.id ? nextItem : item))
    : [...canvas.items, nextItem];
  return {
    ...canvas,
    items,
    selectedItemId: nextItem.id,
  };
}

export function LayoutStudio({
  embedded = false,
  onEditSkeleton,
  onContinueToStyle,
  onRegisterStageAction,
  previewRequest,
}: {
  embedded?: boolean;
  onEditSkeleton?: (candidate: DiagramSkeletonCandidate) => void;
  onContinueToStyle?: () => void;
  onRegisterStageAction?: (action: StagePrimaryActionRegistration | null) => void;
  previewRequest?: { referenceId: string; nonce: number } | null;
} = {}) {
  const { state, setState } = useWorkspaceState();
  const onEditSkeletonRef = useRef(onEditSkeleton);
  const onContinueToStyleRef = useRef(onContinueToStyle);
  const embeddedGalleryScrollRef = useRef<HTMLDivElement | null>(null);
  const embeddedReferenceCardRefs = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    onEditSkeletonRef.current = onEditSkeleton;
  }, [onEditSkeleton]);
  useEffect(() => {
    onContinueToStyleRef.current = onContinueToStyle;
  }, [onContinueToStyle]);
  const canEditSkeleton = Boolean(onEditSkeleton);
  const [layoutPreviewReference, setLayoutPreviewReference] = useState<ReferenceItem | null>(null);
  const [referenceChooserOpen, setReferenceChooserOpen] = useState<boolean | null>(null);
  const [selectedIntentIds, setSelectedIntentIds] = useState<string[]>([]);
  const [focusedStructureTargetId, setFocusedStructureTargetId] = useState<string | null>(
    state.reviewFocusTargetIds?.[0] ?? null,
  );
  const [skeletonEditorOpen, setSkeletonEditorOpen] = useState(false);
  const [generationError, setGenerationError] = useState<{ referenceId: string; message: string } | null>(null);
  const [promptConfirmation, setPromptConfirmation] = useState<{
    reference: ReferenceItem;
    value: string;
  } | null>(null);
  const skeletonNarratorSeenRef = useRef<Set<string>>(new Set());
  const {
    board,
    referenceUsage,
    layoutReferenceId,
    prompt,
    diagramSkeletonCandidates,
    selectedDiagramSkeletonId,
    layoutSkeletonGenerationInProgress,
    skeletonCheckpointPlan,
    guidedDialogue,
  } = state;
  const busy = layoutSkeletonGenerationInProgress;
  // Read from the workspace, not local state: the run keeps going on the
  // backend while this page is unmounted, so its spinner has to come back too.
  const generatingReferenceId = layoutSkeletonGenerationInProgress ? layoutReferenceId : null;
  const layoutCandidates = useMemo(() => {
    const tagged = board.filter((reference) => referenceUsage[reference.id]?.layout);
    return tagged.length > 0 ? tagged : board;
  }, [board, referenceUsage]);
  // Keep this visit stable. Remounting the stage captures the latest selection
  // and promotes it only when the author comes back to Layout.
  const [layoutReferenceIdOnEntry] = useState(layoutReferenceId);
  const orderedLayoutCandidates = useMemo(() => {
    const firstId = layoutReferenceId;
    const pinnedId = firstId === layoutReferenceIdOnEntry ? firstId : layoutReferenceIdOnEntry;
    if (!pinnedId) return layoutCandidates;
    const first = layoutCandidates.find((reference) => reference.id === pinnedId);
    if (!first) return layoutCandidates;
    return [first, ...layoutCandidates.filter((reference) => reference.id !== pinnedId)];
  }, [layoutCandidates, layoutReferenceId, layoutReferenceIdOnEntry]);
  const selectedReference = useMemo(
    () => board.find((reference) => reference.id === layoutReferenceId) ?? null,
    [board, layoutReferenceId],
  );
  const showReferenceChooser = referenceChooserOpen ?? !selectedReference;
  const displayedLayoutReference = layoutPreviewReference ?? selectedReference;
  useEffect(() => {
    if (!previewRequest) return;
    const reference = board.find((item) => item.id === previewRequest.referenceId) ?? null;
    if (!reference) return;
    setLayoutPreviewReference(reference);
    if (!embedded) setReferenceChooserOpen(true);
    else requestAnimationFrame(() => {
      embeddedReferenceCardRefs.current[reference.id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [board, embedded, previewRequest?.nonce, previewRequest?.referenceId]);
  const layoutIntents = useMemo(
    () => inferLayoutIntents(displayedLayoutReference),
    [displayedLayoutReference],
  );
  const selectedSkeleton = useMemo(
    () =>
      selectedDiagramSkeletonId
        ? diagramSkeletonCandidates.find((candidate) => candidate.id === selectedDiagramSkeletonId) ?? null
        : null,
    [diagramSkeletonCandidates, selectedDiagramSkeletonId],
  );
  const selectedSkeletonPlan = useMemo(
    () =>
      selectedSkeleton?.xml
        ? parseDrawioXmlToDiagramPlan(selectedSkeleton.xml) ?? selectedSkeleton.diagramPlan ?? null
        : selectedSkeleton?.diagramPlan ?? null,
    [selectedSkeleton],
  );
  const skeletonDiff = useMemo(
    () => diffDiagramPlans(skeletonCheckpointPlan, selectedSkeletonPlan),
    [selectedSkeletonPlan, skeletonCheckpointPlan],
  );
  const skeletonDiffCount =
    skeletonDiff.added.length +
    skeletonDiff.removed.length +
    skeletonDiff.renamed.length +
    skeletonDiff.moved.length +
    skeletonDiff.connectionsAdded.length +
    skeletonDiff.connectionsRemoved.length +
    skeletonDiff.connectionsChanged.length;
  const focusedPreviewTargetIds = focusedStructureTargetId ? [focusedStructureTargetId] : [];
  const focusedModuleId = selectedSkeletonPlan?.nodes.some((node) => node.id === focusedStructureTargetId)
    ? focusedStructureTargetId
    : null;
  const previewIconBindings = useMemo(() => {
    const scopedBindings = selectedSkeleton
      ? state.skeletonStyleApplications[selectedSkeleton.id]?.nodeIconBindings ?? {}
      : {};
    return { ...scopedBindings };
  }, [selectedSkeleton, state.nodeIconBindings, state.skeletonStyleApplications]);
  const selectedIntentBriefs = layoutIntents
    .filter((intent) => selectedIntentIds.includes(intent.id))
    .map((intent) => intent.brief);
  useEffect(() => {
    const step = busy ? "generating" : displayedLayoutReference ? "prompt" : "layout";
    const stepId = `skeleton:${displayedLayoutReference?.id ?? "no_layout"}:${step}`;
    if (skeletonNarratorSeenRef.current.has(stepId)) return;
    skeletonNarratorSeenRef.current.add(stepId);
    setState((current) => {
      if (current.guidedDialogue.seenStepIds.includes(stepId)) return current;
      let nextDialogue = current.guidedDialogue;
      if (!displayedLayoutReference) {
        nextDialogue = appendNarratorMessage(nextDialogue, {
          surface: "skeleton",
          speaker: "assistant",
          templateId: "choose_layout",
          summary: "Select a Layout reference from the left pocket to establish the spatial layout.",
          promptRevisionId: null,
          referenceId: null,
          artifactId: null,
          artifactFingerprint: current.assignedTaskSnapshot.fingerprint,
        });
      } else if (!busy) {
        nextDialogue = appendNarratorMessage(nextDialogue, {
          surface: "skeleton",
          speaker: "author",
          templateId: "layout_selected",
          summary: `Selected Layout: ${displayedLayoutReference.title}`,
          promptRevisionId: null,
          referenceId: displayedLayoutReference.id,
          artifactId: null,
          artifactFingerprint: createNarratorArtifactFingerprint(displayedLayoutReference.id),
        });
      }
      return appendStudyEvent({
        ...current,
        guidedDialogue: {
          ...nextDialogue,
          currentSteps: { ...nextDialogue.currentSteps, skeleton: step },
          seenStepIds: [...nextDialogue.seenStepIds, stepId],
        },
      }, {
        stage: "skeleton",
        type: "narrator_step_seen",
        targetIds: displayedLayoutReference ? [displayedLayoutReference.id] : [],
        result: step,
        metadata: { surface: "skeleton", scriptVersion: current.guidedDialogue.version },
      });
    });
  }, [busy, displayedLayoutReference, setState]);

  function updateSkeletonNarrator(choiceId: string, status: string) {
    setState((current) => appendStudyEvent({
      ...current,
      guidedDialogue: {
        ...current.guidedDialogue,
        currentSteps: {
          ...current.guidedDialogue.currentSteps,
          skeleton: choiceId === "show_generate" ? "ready" : displayedLayoutReference ? "prompt" : "layout",
        },
        seenStepIds: Array.from(new Set([...current.guidedDialogue.seenStepIds, `skeleton:${displayedLayoutReference ? "prompt" : "layout"}`])),
      },
      status,
    }, {
      stage: "skeleton",
      type: "narrator_choice_selected",
      targetIds: displayedLayoutReference ? [displayedLayoutReference.id] : [],
      result: choiceId,
      metadata: { surface: "skeleton", scriptVersion: current.guidedDialogue.version },
    }));
  }

  function toggleSkeletonNarrator() {
    setState((current) => appendStudyEvent({
      ...current,
      guidedDialogue: {
        ...current.guidedDialogue,
        collapsed: {
          ...current.guidedDialogue.collapsed,
          skeleton: !current.guidedDialogue.collapsed.skeleton,
        },
      },
    }, {
      stage: "skeleton",
      type: current.guidedDialogue.collapsed.skeleton ? "narrator_opened" : "narrator_collapsed",
      targetIds: [],
      result: "skeleton",
    }));
  }

  function updateSkeletonWorkingPrompt(value: string) {
    setState((current) => ({
      ...current,
      guidedDialogue: {
        ...current.guidedDialogue,
        skeletonPromptDraft: value,
      },
    }));
  }

  function sendSkeletonWorkingPrompt() {
    setState((current) => {
      const value = current.guidedDialogue.skeletonPromptDraft.trim();
      if (!value) return current;
      const prepared = {
        ...current,
        prompt: value,
        generationBrief: value,
        promptUpdatedAt: new Date().toISOString(),
      };
      const committed = commitWorkingPromptRevision(prepared, "narrator_send");
      return {
        ...committed,
        guidedDialogue: appendNarratorMessage(committed.guidedDialogue, {
          surface: "skeleton",
          speaker: "author",
          templateId: "skeleton_working_prompt_updated",
          summary: `Updated Working Prompt: ${value}`,
          promptRevisionId: committed.currentPromptRevisionId,
          referenceId: displayedLayoutReference?.id ?? null,
          artifactId: selectedSkeleton?.id ?? null,
          artifactFingerprint: createNarratorArtifactFingerprint({ prompt: value }),
        }),
        status: "Working Prompt updated for the next Skeleton generation.",
      };
    });
  }

  function restoreAssignedTaskPrompt() {
    setState((current) => {
      const value = current.assignedTaskSnapshot.brief;
      const prepared = {
        ...current,
        prompt: value,
        generationBrief: value,
        promptUpdatedAt: new Date().toISOString(),
        guidedDialogue: {
          ...current.guidedDialogue,
          skeletonPromptDraft: value,
        },
      };
      return commitWorkingPromptRevision(prepared, "narrator_send");
    });
  }

  useEffect(() => {
    setSelectedIntentIds(layoutIntents.map((intent) => intent.id));
  }, [layoutIntents]);

  useEffect(() => {
    const targetId = state.reviewFocusTargetIds?.[0];
    if (targetId) setFocusedStructureTargetId(targetId);
  }, [state.reviewFocusTargetIds]);

  function focusStructureTarget(targetId: string | null) {
    setFocusedStructureTargetId(targetId);
  }

  function selectLayoutForGeneration(reference: ReferenceItem) {
    const latestSkeleton = latestSkeletonForReference(diagramSkeletonCandidates, reference.id);
    setReferenceChooserOpen(false);
    setLayoutPreviewReference(null);

    if (latestSkeleton) {
      handleSelectSkeletonCandidate(latestSkeleton);
      return;
    }

    setState((current) => {
      const activeCanvas =
        current.creativeCanvases.find((document) => document.id === current.activeCreativeCanvasId)?.canvas ??
        current.creativeCanvas;
      const nextCanvas = fillLayoutTemplateSlot(activeCanvas, reference.id);
      return {
        ...current,
        layoutReferenceId: reference.id,
        referenceUsage: {
          ...current.referenceUsage,
          [reference.id]: {
            ...current.referenceUsage[reference.id],
            layout: true,
          },
        },
        ...updateActiveCreativeCanvasState(current, nextCanvas),
        status: "Layout reference selected. Generate its first Skeleton to continue.",
      };
    });
    handleGenerateSkeleton(reference);
  }

  function handleSelectSkeletonCandidate(candidate: DiagramSkeletonCandidate) {
    const parsedPlan = candidate.xml ? parseDrawioXmlToDiagramPlan(candidate.xml) : null;
    setState((current) => {
      const activeCanvas =
        current.creativeCanvases.find((document) => document.id === current.activeCreativeCanvasId)?.canvas ??
        current.creativeCanvas;
      const canvasWithReference = candidate.referenceId
        ? fillLayoutTemplateSlot(activeCanvas, candidate.referenceId)
        : activeCanvas;
      const nextCanvas = fillSkeletonTemplateSlot(canvasWithReference, candidate.id, candidate.referenceId);
      return {
        ...current,
        ...(candidate.referenceId
          ? {
              layoutReferenceId: candidate.referenceId,
              referenceUsage: {
                ...current.referenceUsage,
                [candidate.referenceId]: {
                  ...current.referenceUsage[candidate.referenceId],
                  layout: true,
                },
              },
            }
          : {}),
        selectedDiagramSkeletonId: candidate.id,
        diagramSkeletonXml: candidate.xml ?? null,
        diagramSkeletonPlan: parsedPlan ?? candidate.diagramPlan ?? null,
        diagramSkeletonMermaid: candidate.mermaid ?? null,
        nodeIconBindings: current.skeletonStyleApplications[candidate.id]?.nodeIconBindings ?? {},
        skeletonConfirmedAt: null,
        ...updateActiveCreativeCanvasState(current, nextCanvas),
        status: "Layout and Skeleton selected.",
      };
    });
  }

  function handleSkeletonXmlChange(xml: string) {
    const parsedPlan = parseDrawioXmlToDiagramPlan(xml);
    setState((current) => {
      const candidateId = current.selectedDiagramSkeletonId;
      const application = candidateId ? current.skeletonStyleApplications[candidateId] : null;
      const currentBindings = application?.nodeIconBindings ?? current.nodeIconBindings;
      const nodeIconBindings = pruneNodeIconBindingsForPlan(currentBindings, parsedPlan);
      return {
        ...current,
        diagramSkeletonXml: xml,
        diagramSkeletonPlan: parsedPlan ?? current.diagramSkeletonPlan,
        diagramSkeletonCandidates: current.diagramSkeletonCandidates.map((candidate) =>
          candidate.id === candidateId
            ? {
                ...candidate,
                xml,
                diagramPlan: parsedPlan ?? candidate.diagramPlan ?? current.diagramSkeletonPlan,
                title: candidate.title.endsWith(" (edited)") ? candidate.title : `${candidate.title} (edited)`,
              }
            : candidate,
        ),
        nodeIconBindings,
        skeletonStyleApplications: candidateId && application
          ? {
              ...current.skeletonStyleApplications,
              [candidateId]: { ...application, nodeIconBindings },
            }
          : current.skeletonStyleApplications,
        guidedDialogue: current.guidedDialogue.decisions.skeleton
          ? {
              ...current.guidedDialogue,
              decisions: {
                ...current.guidedDialogue.decisions,
                skeleton: { ...current.guidedDialogue.decisions.skeleton, status: "stale" },
              },
            }
          : current.guidedDialogue,
        skeletonConfirmedAt: null,
        status: "Layout skeleton edited in draw.io. Review the updated layout before saving a checkpoint.",
      };
    });
  }

  function confirmSkeleton() {
    if (!selectedSkeleton) return;
    const now = new Date().toISOString();
    setState((current) => {
      const decision = {
        id: `narrator-skeleton-${Date.now()}`,
        surface: "skeleton" as const,
        stepId: "checkpoint",
        choiceId: "save_checkpoint",
        summary: `${selectedSkeleton.title}: ${selectedSkeletonPlan?.nodes.length ?? 0} nodes and ${selectedSkeletonPlan?.edges.length ?? 0} user-authored relations.`,
        promptRevisionId: current.currentPromptRevisionId,
        layoutReferenceId: selectedSkeleton.referenceId ?? current.layoutReferenceId,
        skeletonId: selectedSkeleton.id,
        styleReferenceId: null,
        styleKitId: null,
        analysisStatus: null,
        artifactFingerprint: createNarratorArtifactFingerprint({
          prompt: current.prompt,
          layoutReferenceId: selectedSkeleton.referenceId ?? current.layoutReferenceId,
          skeletonId: selectedSkeleton.id,
          skeletonXml: selectedSkeleton.xml,
        }),
        status: "current" as const,
        createdAt: now,
      };
      const confirmed = appendStudyEvent(
        {
          ...current,
          skeletonConfirmedAt: now,
          skeletonCheckpointPlan: selectedSkeletonPlan,
          guidedDialogue: {
            ...current.guidedDialogue,
            currentSteps: { ...current.guidedDialogue.currentSteps, skeleton: "checkpoint" },
            completedStepIds: Array.from(new Set([...current.guidedDialogue.completedStepIds, "skeleton:checkpoint"])),
            decisions: { ...current.guidedDialogue.decisions, skeleton: decision },
          },
          completedStudyStages: Array.from(new Set([...current.completedStudyStages, "skeleton" as const])),
          status: "Skeleton checkpoint saved. Continue to composition.",
        },
        {
          stage: "skeleton",
          type: "skeleton_confirmed",
          targetIds: [selectedSkeleton.id],
          result: "confirmed",
        },
      );
      const pinned = appendStudyEvent(confirmed, {
        stage: "skeleton",
        type: "narrator_decision_pinned",
        targetIds: [decision.id, selectedSkeleton.id],
        result: "checkpoint",
        metadata: { surface: "skeleton" },
      });
      return transitionStudyStage(pinned, "compose", { status: pinned.status });
    });
  }

  function handleGenerateSkeleton(referenceOverride?: ReferenceItem) {
    const skeletonReference = referenceOverride ?? displayedLayoutReference;
    if (!skeletonReference) {
      setState((current) => ({ ...current, status: "Choose a layout reference before generating a skeleton." }));
      return;
    }
    const taskBrief = guidedDialogue.skeletonPromptDraft.trim() || prompt.trim();
    if (!taskBrief) {
      setState((current) => ({ ...current, status: "Add an original prompt before generating a skeleton." }));
      return;
    }
    setPromptConfirmation({ reference: skeletonReference, value: taskBrief });
  }

  async function runGenerateSkeleton(
    skeletonReference: ReferenceItem,
    taskBrief: string,
  ) {
    setGenerationError(null);
    setLayoutPreviewReference(null);
    setReferenceChooserOpen(false);
    setSkeletonEditorOpen(false);
    setState((current) => {
      const prepared = {
        ...current,
        prompt: taskBrief,
        generationBrief: taskBrief,
        promptUpdatedAt: new Date().toISOString(),
      };
      const committed = commitWorkingPromptRevision(prepared, "skeleton_generation");
      const activeCanvas =
        committed.creativeCanvases.find((document) => document.id === committed.activeCreativeCanvasId)?.canvas ??
        committed.creativeCanvas;
      const nextCanvas = fillLayoutTemplateSlot(activeCanvas, skeletonReference.id);
      return appendStudyEvent({
        ...committed,
        layoutSkeletonGenerationInProgress: true,
        layoutReferenceId: skeletonReference.id,
        referenceUsage: {
          ...committed.referenceUsage,
          [skeletonReference.id]: {
            ...committed.referenceUsage[skeletonReference.id],
            layout: true,
          },
        },
        canvasGenerationReferenceIds: committed.canvasGenerationReferenceIds.includes(skeletonReference.id)
          ? committed.canvasGenerationReferenceIds
          : [...committed.canvasGenerationReferenceIds, skeletonReference.id],
        ...updateActiveCreativeCanvasState(committed, nextCanvas),
        guidedDialogue: appendNarratorMessage({
          ...committed.guidedDialogue,
          currentSteps: { ...committed.guidedDialogue.currentSteps, skeleton: "generating" },
          seenStepIds: Array.from(new Set([...committed.guidedDialogue.seenStepIds, "skeleton:prompt"])),
        }, {
          surface: "skeleton",
          speaker: "status",
          templateId: "skeleton_generating",
          summary: `Generating an editable Skeleton from ${skeletonReference.title}…`,
          promptRevisionId: committed.currentPromptRevisionId,
          referenceId: skeletonReference.id,
          artifactId: null,
          artifactFingerprint: createNarratorArtifactFingerprint({ referenceId: skeletonReference.id, prompt: committed.prompt }),
        }),
        status: `Generating skeleton from "${skeletonReference.title}"...`,
      }, {
        stage: "skeleton",
        type: "skeleton_generation_started",
        targetIds: [skeletonReference.id],
        result: "skeleton_generation",
        metadata: { layoutReferenceId: skeletonReference.id },
      });
    });

    try {
      const imageDataUrl =
        skeletonReference.imageDataUrl ??
        (skeletonReference.thumbnailUrl ? await imageUrlToDataUrl(skeletonReference.thumbnailUrl) : null);
      const intentBrief =
        selectedIntentBriefs.length > 0
          ? `Layout intent: ${selectedIntentBriefs.join("; ")}.`
          : "Layout intent: follow the selected layout reference image directly.";
      const skeleton = await generateDiagramSkeleton({
        prompt: `${taskBrief}\n\n${intentBrief}`,
        references: [{ ...skeletonReference, imageDataUrl }],
      });
      const candidateId = `skeleton-${Date.now()}`;
      const candidate: DiagramSkeletonCandidate = {
        id: candidateId,
        title: skeleton.title || `Skeleton ${diagramSkeletonCandidates.length + 1}`,
        referenceId: skeletonReference.id,
        referenceTitle: skeletonReference.title,
        createdAt: new Date().toISOString(),
        source: skeleton.source ?? "model",
        initialXml: skeleton.xml ?? null,
        xml: skeleton.xml ?? null,
        mermaid: skeleton.mermaid ?? null,
        diagramPlan: skeleton.diagramPlan ?? null,
      };
      setState((current) => {
        const activeCanvas =
          current.creativeCanvases.find((document) => document.id === current.activeCreativeCanvasId)?.canvas ??
          current.creativeCanvas;
        const nextCanvas = fillSkeletonTemplateSlot(activeCanvas, candidateId, skeletonReference.id);
        const diagramPlan = skeleton.xml
          ? parseDrawioXmlToDiagramPlan(skeleton.xml) ?? skeleton.diagramPlan ?? null
          : skeleton.diagramPlan ?? null;
        const nodeCount = diagramPlan?.nodes.length ?? 0;
        const relationCount = diagramPlan?.edges.length ?? 0;
        return {
          ...current,
          diagramSkeletonXml: skeleton.xml ?? null,
          diagramSkeletonPlan: skeleton.diagramPlan ?? null,
          diagramSkeletonMermaid: skeleton.mermaid ?? null,
          diagramSkeletonCandidates: [...current.diagramSkeletonCandidates, candidate],
          selectedDiagramSkeletonId: candidateId,
          nodeIconBindings: {},
          layoutSkeletonGenerationInProgress: false,
          skeletonConfirmedAt: null,
          ...updateActiveCreativeCanvasState(current, nextCanvas),
          guidedDialogue: appendNarratorMessage({
            ...current.guidedDialogue,
            currentSteps: { ...current.guidedDialogue.currentSteps, skeleton: "generated" },
            detailViews: { ...current.guidedDialogue.detailViews, skeleton: "preview" },
          }, {
            surface: "skeleton",
            speaker: "assistant",
            templateId: "skeleton_generated",
            summary: `The Skeleton is ready with ${nodeCount} node${nodeCount === 1 ? "" : "s"} and ${relationCount} relation${relationCount === 1 ? "" : "s"}. Review it before saving a checkpoint.`,
            promptRevisionId: current.currentPromptRevisionId,
            referenceId: skeletonReference.id,
            artifactId: candidateId,
            artifactFingerprint: createNarratorArtifactFingerprint({ candidateId, xml: skeleton.xml }),
            tone: "success",
          }),
          status: `Layout skeleton ready from "${skeletonReference.title}".`,
        };
      });
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      setGenerationError({ referenceId: skeletonReference.id, message });
      setState((current) => ({
        ...current,
        layoutSkeletonGenerationInProgress: false,
        guidedDialogue: appendNarratorMessage(current.guidedDialogue, {
          surface: "skeleton",
          speaker: "status",
          templateId: "skeleton_generation_failed",
          summary: `Skeleton generation failed: ${message}`,
          promptRevisionId: current.currentPromptRevisionId,
          referenceId: skeletonReference.id,
          artifactId: null,
          artifactFingerprint: createNarratorArtifactFingerprint({ referenceId: skeletonReference.id, prompt: current.prompt }),
          tone: "error",
        }),
        status: `Layout skeleton draft failed: ${message}`,
      }));
    }
  }

  function confirmPromptAndGenerate() {
    if (!promptConfirmation?.value.trim()) return;
    const { reference, value } = promptConfirmation;
    setPromptConfirmation(null);
    void runGenerateSkeleton(reference, value.trim());
  }

  const promptConfirmationDialog = promptConfirmation ? (
    <SkeletonPromptConfirmDialog
      referenceTitle={promptConfirmation.reference.title}
      value={promptConfirmation.value}
      onChange={(value) => setPromptConfirmation((current) => current ? { ...current, value } : current)}
      onCancel={() => setPromptConfirmation(null)}
      onConfirm={confirmPromptAndGenerate}
    />
  ) : null;

  useEffect(() => {
    if (!embedded || !onRegisterStageAction) return;
    if (!selectedReference) {
      onRegisterStageAction(null);
      return;
    }
    const referenceSkeletons = diagramSkeletonCandidates.filter(
      (candidate) => candidate.referenceId === selectedReference.id,
    );
    const activeSkeleton =
      referenceSkeletons.find((candidate) => candidate.id === selectedDiagramSkeletonId) ??
      latestSkeletonForReference(referenceSkeletons, selectedReference.id) ??
      null;
    const generatingThis = generatingReferenceId === selectedReference.id;
    const skeletonCheckpointSaved = Boolean(
      activeSkeleton &&
      guidedDialogue.decisions.skeleton?.status === "current" &&
      guidedDialogue.decisions.skeleton.skeletonId === activeSkeleton.id,
    );

    if (activeSkeleton && canEditSkeleton) {
      if (skeletonCheckpointSaved && onContinueToStyleRef.current) {
        onRegisterStageAction({
          metaTitle: selectedReference.title,
          meta: `${referenceSkeletons.length} Skeleton${referenceSkeletons.length === 1 ? "" : "s"} ready · checkpoint saved`,
          primaryLabel: continueToStepLabel("style"),
          onPrimary: () => onContinueToStyleRef.current?.(),
          secondaryLabel: "Edit skeleton",
          onSecondary: () => onEditSkeletonRef.current?.(activeSkeleton),
          disabled: busy,
          loading: generatingThis,
        });
        return;
      }
      onRegisterStageAction({
        metaTitle: selectedReference.title,
        meta: `${referenceSkeletons.length} Skeleton${referenceSkeletons.length === 1 ? "" : "s"} ready`,
        primaryLabel: "Edit skeleton",
        onPrimary: () => onEditSkeletonRef.current?.(activeSkeleton),
        disabled: busy,
        loading: generatingThis,
      });
      return;
    }

    onRegisterStageAction({
      metaTitle: selectedReference.title,
      meta: "Review the Prompt, then generate a layout from this reference",
      primaryLabel: generatingThis ? "Generating…" : "Generate Skeleton",
      onPrimary: () => {
        void handleGenerateSkeleton();
      },
      disabled: busy || !(guidedDialogue.skeletonPromptDraft.trim() || prompt.trim()),
      loading: generatingThis,
      guideAnchor: "skeleton-generate-action",
    });
    // handleGenerateSkeleton identity changes each render; register a stable wrapper instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    busy,
    diagramSkeletonCandidates,
    canEditSkeleton,
    embedded,
    generatingReferenceId,
    guidedDialogue.skeletonPromptDraft,
    onRegisterStageAction,
    prompt,
    selectedDiagramSkeletonId,
    selectedReference,
  ]);

  // Clear the registration only on unmount. Registering null inside the effect
  // above would toggle the parent's action signature ("" -> action) on every
  // dependency change and could re-render the parent in a loop.
  useEffect(() => {
    if (!embedded || !onRegisterStageAction) return;
    return () => onRegisterStageAction(null);
  }, [embedded, onRegisterStageAction]);

  if (embedded) {
    return (
      <>
      <div className={`page ${styles.embeddedLayoutPage}`}>
        <div className={`page-inner ${styles.embeddedLayoutInner}`}>
          <div className="layout-grid layout-grid-externalize is-embedded">
            <section className="layout-canvas">
              {/* The stage toolbar already names this step, so the header is
                  reduced to the counts the gallery below cannot show. */}
              <header className={styles.galleryHeader}>
                <span>
                  {layoutCandidates.length} reference{layoutCandidates.length === 1 ? "" : "s"} · {diagramSkeletonCandidates.length} Skeleton{diagramSkeletonCandidates.length === 1 ? "" : "s"}
                </span>
              </header>

              <div ref={embeddedGalleryScrollRef} className={styles.embeddedGalleryScroll}>
                {orderedLayoutCandidates.length ? (
                  <div className={styles.referenceGallery}>
                    {orderedLayoutCandidates.map((reference, referenceIndex) => {
                      const referenceSkeletons = diagramSkeletonCandidates
                        .filter((candidate) => candidate.referenceId === reference.id)
                        .slice()
                        .reverse();
                      const selected = reference.id === selectedReference?.id;
                      const previewing = reference.id === layoutPreviewReference?.id && !selected;
                      const generatingThis = generatingReferenceId === reference.id;
                      const referenceImage = reference.imageDataUrl?.trim() || reference.thumbnailUrl?.trim() || null;
                      return (
                        <article
                          key={reference.id}
                          ref={(node) => {
                            embeddedReferenceCardRefs.current[reference.id] = node;
                          }}
                          className={`${styles.referenceGroup} ${selected ? styles.referenceGroupSelected : ""} ${previewing ? styles.referenceGroupPreviewing : ""}`}
                        >
                          <div className={styles.referenceOverview}>
                            <button
                              type="button"
                              className={styles.referenceImageButton}
                              onClick={() => setLayoutPreviewReference(reference)}
                              aria-label={`Preview ${reference.title}`}
                            >
                              {referenceImage ? <img src={referenceImage} alt="" /> : <span>Layout {referenceIndex + 1}</span>}
                            </button>
                            <div className={styles.referenceDetails}>
                              <div className={styles.referenceMeta}>
                                <span>Layout {String(referenceIndex + 1).padStart(2, "0")}</span>
                                {selected ? <b>Current source</b> : null}
                              </div>
                              <h3>{reference.title}</h3>
                              <p>{reference.structuralAnalysis || reference.similarityReason}</p>
                              <small>{referenceSkeletons.length} generated alternative{referenceSkeletons.length === 1 ? "" : "s"}</small>
                            </div>
                            <div className={styles.referenceActions}>
                              <button
                                type="button"
                                className={`btn ${selected ? styles.referenceSelectButtonSelected : "btn-primary"}`}
                                data-guide-anchor={referenceIndex === 0 ? "skeleton-primary-action" : undefined}
                                onClick={() => selectLayoutForGeneration(reference)}
                                disabled={busy}
                                aria-pressed={selected}
                              >
                                {selected ? "Selected for generation ✓" : "Select for generation"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => void handleGenerateSkeleton(reference)}
                                disabled={busy || !(guidedDialogue.skeletonPromptDraft.trim() || prompt.trim())}
                                title="Review the Prompt, then generate a Skeleton from this Layout"
                              >
                                {generatingThis
                                  ? <><span className="ui-spinner" aria-hidden="true" />Generating…</>
                                  : referenceSkeletons.length
                                    ? "+ Generate another"
                                    : "Generate Skeleton"}
                              </button>
                            </div>
                          </div>

                          {generationError?.referenceId === reference.id ? (
                            <p className={styles.generationError} role="alert">
                              <strong>Skeleton generation failed.</strong> {generationError.message}
                            </p>
                          ) : null}

                          {referenceSkeletons.length ? (
                            <div className={styles.skeletonGallery} aria-label={`Skeletons generated from ${reference.title}`}>
                              {referenceSkeletons.map((candidate, candidateIndex) => {
                                const candidatePlan = candidate.xml
                                  ? parseDrawioXmlToDiagramPlan(candidate.xml) ?? candidate.diagramPlan ?? null
                                  : candidate.diagramPlan ?? null;
                                const active = candidate.id === selectedDiagramSkeletonId;
                                return (
                                  <article
                                    key={candidate.id}
                                    className={`${styles.skeletonCard} ${active ? styles.skeletonCardActive : ""}`}
                                  >
                                    <button
                                      type="button"
                                      className={styles.skeletonPreviewButton}
                                      onClick={() => handleSelectSkeletonCandidate(candidate)}
                                      aria-label={`Preview ${candidate.title}`}
                                    >
                                      {candidatePlan ? (
                                        <LayoutPngPreview plan={candidatePlan} compact customIconReferences={state.customIconReferences} />
                                      ) : candidate.mermaid ? (
                                        <MermaidDiagramPreview source={candidate.mermaid} compact />
                                      ) : (
                                        <span>draw.io</span>
                                      )}
                                    </button>
                                    <div className={styles.skeletonCardCopy}>
                                      <span>Alternative {referenceSkeletons.length - candidateIndex}</span>
                                      <strong>{candidate.title}</strong>
                                      <small>{new Date(candidate.createdAt).toLocaleString()}</small>
                                    </div>
                                    <div className={styles.skeletonCardActions}>
                                      {/* With one skeleton there is nothing to choose between, so the
                                          button only appears once alternatives exist. */}
                                      {diagramSkeletonCandidates.length > 1 ? (
                                        <button
                                          type="button"
                                          className={`btn btn-sm ${active ? styles.skeletonSelectButtonActive : "btn-primary"}`}
                                          onClick={() => handleSelectSkeletonCandidate(candidate)}
                                          disabled={active}
                                          aria-pressed={active}
                                          title="Make this the Skeleton the rest of the flow uses"
                                        >
                                          {active ? "Selected ✓" : "Select skeleton"}
                                        </button>
                                      ) : null}
                                      <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => {
                                          handleSelectSkeletonCandidate(candidate);
                                          onEditSkeleton?.(candidate);
                                        }}
                                      >
                                        Edit in Skeleton →
                                      </button>
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          ) : (
                            <div className={styles.noSkeletons}>No Skeleton generated from this Layout yet.</div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <section className={styles.galleryEmpty}>
                    <strong>No Layout references yet</strong>
                    <p>Open Retrieval and add one or more references to the Layout pocket.</p>
                  </section>
                )}
              </div>
            </section>

          </div>
        </div>
      </div>
      {promptConfirmationDialog}
      </>
    );
  }

  return (
    <>
    <div className="page">
      <div className="page-inner">
        <div
          className={`layout-grid layout-grid-externalize ${
            !embedded && selectedReference && !showReferenceChooser ? styles.referenceCollapsedGrid : ""
          } ${embedded ? "is-embedded" : ""}`}
        >
          {/* LEFT — reference picker */}
          {!embedded ? <section
            className={`layout-picker ${
              selectedReference && !showReferenceChooser ? styles.referenceCollapsedPicker : ""
            }`}
          >
            {selectedReference && !showReferenceChooser ? (
              <button
                type="button"
                className={styles.referenceSummaryButton}
                onClick={() => setReferenceChooserOpen(true)}
                aria-label={`Change layout reference. Current reference: ${selectedReference.title}`}
              >
                <span className={styles.referenceSummaryLabel}>Layout</span>
                {selectedReference.thumbnailUrl ? (
                  <img src={selectedReference.thumbnailUrl} alt="" />
                ) : (
                  <LayoutActionIcon type="layout" />
                )}
                <strong>Change</strong>
              </button>
            ) : (
              <>
                <div className="layout-picker-head">
                  <div className="min-w-0">
                    <h2 className="h-section">Layout reference</h2>
                    <span className="mono muted">choose one pocket picture</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setReferenceChooserOpen(false)}
                    disabled={!selectedReference}
                  >
                    Collapse
                  </button>
                </div>

                <div className="layout-ref-list scroll-y">
              {orderedLayoutCandidates.length === 0 ? (
                <div className="results-list-empty">
                  <p>No layout references yet.</p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      setState((current) => transitionStudyStage(current, "references", {
                        status: "Pick a layout reference, then come back to generate the skeleton.",
                      }))
                    }
                  >
                    Open reference search →
                  </button>
                </div>
              ) : (
                orderedLayoutCandidates.map((reference, index) => {
                  const selected = reference.id === selectedReference?.id;
                  return (
                    <article
                      key={reference.id}
                      className={`layout-ref-card ${selected ? "is-selected" : ""}`}
                      onClick={() => setLayoutPreviewReference(reference)}
                    >
                      <div className="layout-ref-thumb">
                        <span className="paper-card-fignum">
                          Ref. {String(index + 1).padStart(2, "0")}
                        </span>
                        {reference.thumbnailUrl ? <img src={reference.thumbnailUrl} alt="" /> : null}
                        {selected ? <span className="layout-ref-badge">Selected</span> : null}
                      </div>
                      <div className="layout-ref-body">
                        <h3>{reference.title}</h3>
                        <p>{reference.structuralAnalysis}</p>
                      </div>
                      <div className="layout-ref-actions">
                        <button
                          type="button"
                          className="reference-action-btn reference-action-btn-layout"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleGenerateSkeleton(reference);
                          }}
                          disabled={busy || prompt.trim().length === 0}
                          title={prompt.trim().length === 0 ? "Add an original prompt first" : "Generate skeleton"}
                        >
                          <LayoutActionIcon type="skeleton" />
                          <span>{busy ? "Working" : "Skeleton"}</span>
                        </button>
                        <button
                          type="button"
                          className={`reference-action-btn reference-action-btn-layout ${
                            selected ? "is-active" : ""
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            selectLayoutForGeneration(reference);
                          }}
                          disabled={busy}
                          title={selected ? "Re-select this layout and its latest Skeleton" : "Select this layout for generation"}
                        >
                          <LayoutActionIcon type="layout" />
                          <span>{selected ? "Selected" : "Select"}</span>
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
                </div>
              </>
            )}
          </section> : null}

          {/* CENTER - direct skeleton generation and inspection */}
          <section className="layout-canvas">
            <div className="layout-canvas-head">
              <div className="min-w-0">
                <h2 className="h-section">Skeleton</h2>
                <span className="mono muted">
                  {layoutPreviewReference
                    ? `ready to generate from "${layoutPreviewReference.title}"`
                    : selectedReference
                      ? `using "${selectedReference.title}"`
                      : "choose a layout reference, then generate"}
                </span>
              </div>
              <span
                className="studio-artifact-status"
                data-state={busy ? "busy" : selectedSkeleton ? "ready" : "idle"}
                aria-live="polite"
              >
                {busy ? <><span className="ui-spinner" aria-hidden="true" />Generating…</> : selectedSkeleton ? "Editable artifact ready" : "Waiting for a layout reference"}
              </span>
            </div>

            <section className={styles.layoutGenerationBar} aria-label="Selected Layout and Skeleton generation">
              {displayedLayoutReference ? (
                <>
                  <div className={styles.layoutGenerationReference}>
                    {displayedLayoutReference.thumbnailUrl ? (
                      <img src={displayedLayoutReference.thumbnailUrl} alt="" />
                    ) : (
                      <span aria-hidden="true"><LayoutActionIcon type="layout" /></span>
                    )}
                    <span>
                      <small>Primary Layout</small>
                      <strong>{displayedLayoutReference.title}</strong>
                    </span>
                  </div>
                  <div className={styles.layoutGenerationActions}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      data-guide-anchor="skeleton-primary-action"
                      onClick={() => void handleGenerateSkeleton()}
                      disabled={busy || !prompt.trim()}
                      title="Generate an editable Skeleton"
                    >
                      {busy ? <><span className="ui-spinner" aria-hidden="true" />Generating…</> : "Generate Skeleton"}
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.layoutGenerationEmpty}>
                  <LayoutActionIcon type="layout" />
                  <span><strong>Select one Layout reference</strong><small>Choose it from the Layout pocket on the left.</small></span>
                </div>
              )}
            </section>

            <div className="layout-canvas-stage layout-canvas-stage-compact">
              <div className="layout-skeleton-workbench layout-skeleton-workbench-direct">
                  <div className="layout-canvas-subhead">
                    <div className="min-w-0">
                      <span className="label-text">Skeleton preview</span>
                      <p>
                        {selectedSkeleton
                          ? `Generated from "${selectedSkeleton.referenceTitle}" · select a node to pair an icon`
                          : "generated skeletons will appear here"}
                      </p>
                    </div>
                    {selectedSkeleton?.xml ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          if (embedded && onEditSkeleton) {
                            onEditSkeleton(selectedSkeleton);
                            return;
                          }
                          setSkeletonEditorOpen((open) => !open);
                        }}
                        aria-expanded={embedded && onEditSkeleton ? undefined : skeletonEditorOpen}
                      >
                        {embedded && onEditSkeleton
                          ? "Open Skeleton"
                          : skeletonEditorOpen
                            ? "Close editor"
                            : "Edit skeleton"}
                      </button>
                    ) : null}
                  </div>

                  {skeletonEditorOpen && selectedSkeleton?.xml ? (
                    <div className="layout-inline-skeleton-editor">
                      <DrawioEmbed
                        xml={selectedSkeleton.xml}
                        height={560}
                        onChange={handleSkeletonXmlChange}
                      />
                      <p>
                        Changes update this skeleton and the layout check. Module and relation confirmations remain author decisions.
                      </p>
                    </div>
                  ) : busy ? (
                    <div className="layout-canvas-empty layout-loading-panel">
                      <span className="layout-loading-spinner" aria-hidden="true" />
                      <p>Generating the skeleton...</p>
                    </div>
                  ) : selectedSkeletonPlan ? (
                    <div className="layout-skeleton-preview">
                      <LayoutPngPreview
                        plan={selectedSkeletonPlan}
                        compact
                        focusedTargetIds={focusedPreviewTargetIds}
                        iconBindings={previewIconBindings}
                        customIconReferences={state.customIconReferences}
                        onFocusTarget={focusStructureTarget}
                      />
                    </div>
                  ) : selectedSkeleton?.mermaid ? (
                    <div className="layout-skeleton-preview">
                      <MermaidDiagramPreview source={selectedSkeleton.mermaid} compact />
                    </div>
                  ) : selectedSkeleton ? (
                    <div className="layout-canvas-empty">
                      <p>The skeleton is ready. Open the editor to inspect or revise its layout.</p>
                    </div>
                  ) : (
                    <div className="layout-canvas-empty">
                      <p>Choose a layout reference on the left, then generate a skeleton. Select a node to pair an icon.</p>
                    </div>
                  )}

                  {diagramSkeletonCandidates.length > 0 ? (
                    <details className={`layout-skeleton-rail ${styles.disclosure}`}>
                      <summary className="layout-skeleton-rail-head">
                        <span>
                          <span className="label-text">Recent skeletons</span>
                          <small className={styles.disclosureHint}>Switch or compare earlier drafts</small>
                        </span>
                        <span className="badge">{diagramSkeletonCandidates.length}</span>
                      </summary>
                      <div className="layout-skeleton-options">
                        {diagramSkeletonCandidates.slice().reverse().map((candidate, index) => {
                          const active = candidate.id === selectedDiagramSkeletonId;
                          const candidatePlan = candidate.xml
                            ? parseDrawioXmlToDiagramPlan(candidate.xml) ?? candidate.diagramPlan ?? null
                            : candidate.diagramPlan ?? null;
                          return (
                            <button
                              key={candidate.id}
                              type="button"
                              className={`layout-skeleton-option ${active ? "is-selected" : ""}`}
                              onClick={() => handleSelectSkeletonCandidate(candidate)}
                            >
                              <span className="layout-skeleton-option-preview">
                                {candidatePlan ? (
                                  <LayoutPngPreview
                                    plan={candidatePlan}
                                    compact
                                    customIconReferences={state.customIconReferences}
                                  />
                                ) : candidate.mermaid ? (
                                  <MermaidDiagramPreview source={candidate.mermaid} compact />
                                ) : (
                                  <span className="layout-skeleton-option-empty">draw.io</span>
                                )}
                              </span>
                              <span className="layout-skeleton-option-copy">
                                <strong>Skeleton {diagramSkeletonCandidates.length - index}</strong>
                                <span>{candidate.referenceTitle}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </details>
                  ) : null}
                  {selectedSkeleton ? (
                    <section className="skeleton-audit-panel">
                      {skeletonDiffCount > 0 ? (
                        <details className="skeleton-diff-summary">
                          <summary>{skeletonDiffCount} structural change{skeletonDiffCount === 1 ? "" : "s"} since checkpoint</summary>
                          <div>
                            {skeletonDiff.added.length ? <span>Added: {skeletonDiff.added.join(", ")}</span> : null}
                            {skeletonDiff.removed.length ? <span>Removed: {skeletonDiff.removed.join(", ")}</span> : null}
                            {skeletonDiff.renamed.length ? <span>Renamed: {skeletonDiff.renamed.join(", ")}</span> : null}
                            {skeletonDiff.moved.length ? <span>Moved: {skeletonDiff.moved.join(", ")}</span> : null}
                            {skeletonDiff.connectionsAdded.length ? <span>{skeletonDiff.connectionsAdded.length} connection(s) added</span> : null}
                            {skeletonDiff.connectionsRemoved.length ? <span>{skeletonDiff.connectionsRemoved.length} connection(s) removed</span> : null}
                            {skeletonDiff.connectionsChanged.length ? <span>{skeletonDiff.connectionsChanged.length} connection(s) reconnected or relabeled</span> : null}
                          </div>
                        </details>
                      ) : null}
                      <button type="button" className="btn btn-primary" onClick={confirmSkeleton}>
                        Save skeleton checkpoint →
                      </button>
                    </section>
                  ) : null}
              </div>
            </div>
          </section>

          {embedded ? (
            <aside className="layout-narrator-inspector" aria-label="Skeleton Narrator">
              <GuidedConversationPanel
                eyebrow="Skeleton conversation"
                title={displayedLayoutReference ? "Build the editable layout" : "Start with a Layout"}
                messages={guidedDialogue.messages.skeleton}
                collapsed={guidedDialogue.collapsed.skeleton}
                onToggle={toggleSkeletonNarrator}
                composer={{
                  value: guidedDialogue.skeletonPromptDraft,
                  onChange: updateSkeletonWorkingPrompt,
                  onSend: sendSkeletonWorkingPrompt,
                  inputDisabled: busy,
                  disabled:
                    busy ||
                    !guidedDialogue.skeletonPromptDraft.trim() ||
                    guidedDialogue.skeletonPromptDraft.trim() === prompt.trim(),
                  label: "Working Prompt",
                  meta: "Controls the next Skeleton",
                  placeholder: "Describe the layout you want to generate or change…",
                  hint: guidedDialogue.skeletonPromptDraft.trim() === prompt.trim()
                    ? "This prompt is active for the next Skeleton · Enter to send, Shift+Enter for newline"
                    : "Update the prompt before generating a new Skeleton · Enter to send",
                  sendLabel: "Update prompt",
                  onRestore: restoreAssignedTaskPrompt,
                  restoreLabel: "Restore assigned task",
                }}
                actions={busy ? undefined : !displayedLayoutReference ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      updateSkeletonNarrator("open_layout_pocket", "Choose a Primary Layout from the left pocket.");
                      document.querySelector<HTMLElement>('[data-guide-anchor="reference-drawer"]')?.focus();
                    }}
                  >
                    Open Layout pocket
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={!prompt.trim() || busy}
                      onClick={() => void handleGenerateSkeleton()}
                    >
                      {busy ? <><span className="ui-spinner" aria-hidden="true" />Generating…</> : "Generate Skeleton"}
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateSkeletonNarrator("change_layout", "Choose another Layout in the left pocket.")}>Change Layout</button>
                  </>
                )}
              />
            </aside>
          ) : null}

          {!embedded ? <aside className="layout-structure-inspector" aria-label="Scientific layout inspector">
            {selectedSkeleton ? (
              <>
                <div className="externalize-icon-panel">
                  <ScientificStructurePanel
                    focusedModuleId={focusedModuleId}
                    onFocusModule={focusStructureTarget}
                    diagramPlan={selectedSkeletonPlan}
                    skeletonId={selectedSkeleton.id}
                  />
                </div>
              </>
            ) : (
              <div className="externalize-icon-placeholder">
                <span className="label-text">Icon pairing</span>
                <strong>Generate a skeleton first</strong>
                <p>After generation, select a skeleton node and click an icon to bind it.</p>
              </div>
            )}
          </aside> : null}
        </div>
      </div>
    </div>
    {promptConfirmationDialog}
    </>
  );
}
