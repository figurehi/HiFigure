"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  startVariantGenerationJob,
  type VariantGenerationPayload,
} from "../lib/api";
import {
  upsertPendingModifyJob,
  useModifyJobReconciler,
  type PendingModifyJob,
} from "../lib/modify-jobs";
import { sortRevisionVariantsByHistory } from "../lib/figure-history";
import { figureFontReferences, figurePaletteReferences } from "../lib/scientific-assets";
import type { FigureVariant, ReferenceItem } from "../lib/types";
import {
  clearRefineSession,
  compactAnnotationSnapshot,
  createArtifactFingerprint,
  createEmptyRefineSession,
  deriveFigureBounds,
  deriveMaskTargets,
  maskTargetsToModifyRegions,
  readRefineSession,
  writeRefineSession,
  type EvolveRefineSession,
  type RefineEditTarget,
} from "../lib/evolve-artifact";
import type { TLEditorSnapshot } from "tldraw";
import {
  useWorkspaceState,
  type CreativeCanvasState,
  type StyleKitPalette,
} from "../lib/workspace-state";
import { imageUrlToDataUrl } from "../lib/annotation-flatten";
import {
  AnnotationCanvas,
  type AnnotationCanvasHandle,
  type AnnotationStyleCue,
} from "./annotation-canvas";

const FONT_PRESETS = figureFontReferences;
const PALETTE_PRESETS = figurePaletteReferences;

type EditPaletteOption = StyleKitPalette & { label: string };

function paletteOption(palette: StyleKitPalette, index: number): EditPaletteOption {
  const preset = PALETTE_PRESETS.find((candidate) => candidate.id === palette.id);
  return {
    ...palette,
    label: preset?.label ?? `Collected palette ${index + 1}`,
  };
}

function removeOutputVariantFromCanvas(
  canvas: CreativeCanvasState,
  variantId: string,
): CreativeCanvasState {
  const items = canvas.items.filter(
    (item) => !(item.type === "output" && item.variantId === variantId),
  );
  const itemIds = new Set(items.map((item) => item.id));
  return {
    ...canvas,
    items,
    selectedItemId:
      canvas.selectedItemId && itemIds.has(canvas.selectedItemId)
        ? canvas.selectedItemId
        : null,
    selectedItemIds: canvas.selectedItemIds.filter((id) => itemIds.has(id)),
  };
}

function variantImageUrl(variant: FigureVariant | null | undefined) {
  return variant?.previewImageDataUrl ?? variant?.previewImageUrl ?? null;
}

type SvgEditorStudioProps = {
  /** Removes the standalone page introduction when the editor is hosted in a workspace. */
  embedded?: boolean;
  /** Uses the same low-density chrome without changing any editor capability. */
  compact?: boolean;
  /** Opens the Journey tree hosted by the dashboard for version jumping. */
  onOpenJourney?: () => void;
};

export function SvgEditorStudio({
  embedded = false,
  compact = false,
  onOpenJourney,
}: SvgEditorStudioProps = {}) {
  const { state, setState } = useWorkspaceState();
  const {
    variants,
    selectedVariantId,
    prompt,
    diagramSkeletonXml,
    diagramSkeletonMermaid,
  } = state;
  const [startingModify, setStartingModify] = useState(false);
  const pendingModifyJobList = useModifyJobReconciler();
  const modifying = startingModify || pendingModifyJobList.length > 0;
  const [modifyError, setModifyError] = useState<string | null>(null);
  const [canvasSnapshotsByVariantId, setCanvasSnapshotsByVariantId] = useState<
    Record<string, TLEditorSnapshot>
  >({});
  const [canvasMarkupByVariantId, setCanvasMarkupByVariantId] = useState<Record<string, boolean>>({});
  const [canvasResetByVariantId, setCanvasResetByVariantId] = useState<Record<string, number>>({});
  const [refineSessionsByVariantId, setRefineSessionsByVariantId] = useState<
    Record<string, EvolveRefineSession>
  >({});
  const [refineHydratedVariantId, setRefineHydratedVariantId] = useState<string | null>(null);
  const [modifyInstructions, setModifyInstructions] = useState("");
  /** Shared highlight between the canvas markup and its note on the right. */
  const [activeMarkupId, setActiveMarkupId] = useState<string | null>(null);
  const [focusShapeId, setFocusShapeId] = useState<string | null>(null);
  const annotationCanvasRef = useRef<AnnotationCanvasHandle | null>(null);
  const liveVariants = useMemo(
    () => variants.filter((variant) => !variant.deletedAt),
    [variants],
  );

  const selectedVariant: FigureVariant | null = useMemo(
    () => liveVariants.find((variant) => variant.id === selectedVariantId) ?? liveVariants[0] ?? null,
    [liveVariants, selectedVariantId],
  );
  const participantId = state.studyProfile?.userId ?? null;
  const artifactFingerprint = useMemo(
    () =>
      createArtifactFingerprint({
        diagramSkeletonPlan: state.diagramSkeletonPlan,
        diagramSkeletonXml: state.diagramSkeletonXml,
        diagramSkeletonMermaid: state.diagramSkeletonMermaid,
        selectedDiagramSkeletonId: state.selectedDiagramSkeletonId,
        selectedVariantId: state.selectedVariantId,
        variants: state.variants,
        nodeIconBindings: state.nodeIconBindings,
        customIconReferences: state.customIconReferences,
      }),
    [
      state.diagramSkeletonMermaid,
      state.diagramSkeletonPlan,
      state.diagramSkeletonXml,
      state.customIconReferences,
      state.nodeIconBindings,
      state.selectedDiagramSkeletonId,
      state.selectedVariantId,
      state.variants,
    ],
  );
  const readOnly = state.studySessionStatus === "finished";
  const compactLayout = embedded || compact;

  const selectedVariantImageUrl = variantImageUrl(selectedVariant);
  const activeRevisionSourceId = selectedVariant?.sourceVariantId ?? selectedVariant?.id ?? null;
  const revisionSourceVariant = activeRevisionSourceId
    ? liveVariants.find((variant) => variant.id === activeRevisionSourceId) ?? selectedVariant
    : selectedVariant;
  const revisionVariants = useMemo(
    () => activeRevisionSourceId
      ? sortRevisionVariantsByHistory(
          liveVariants.filter((variant) => variant.sourceVariantId === activeRevisionSourceId),
          state.figureHistory,
        )
      : [],
    [activeRevisionSourceId, liveVariants, state.figureHistory],
  );
  // Edit keeps its own explicit appearance controls; it no longer depends on
  // font/color extraction or Match selections.
  const editFontPresets = FONT_PRESETS;
  const editPaletteOptions = useMemo(
    () => PALETTE_PRESETS.map((palette, index) => paletteOption({
      kind: "preset",
      id: palette.id,
      colors: [...palette.colors],
    }, index)),
    [],
  );
  const currentCanvasSnapshot = selectedVariant
    ? canvasSnapshotsByVariantId[selectedVariant.id] ?? null
    : null;
  const currentCanvasResetVersion = selectedVariant
    ? canvasResetByVariantId[selectedVariant.id] ?? 0
    : 0;
  const hasCanvasMarkup = selectedVariant
    ? canvasMarkupByVariantId[selectedVariant.id] ?? false
    : false;
  const currentRefineSession = selectedVariant
    ? refineSessionsByVariantId[selectedVariant.id] ?? null
    : null;
  const hasAppearanceInstruction = Boolean(
    currentRefineSession?.globalAppearance.fontId ||
      currentRefineSession?.globalAppearance.paletteId ||
      currentRefineSession?.editTargets.some((target) => target.fontId || target.paletteId),
  );
  const hasModifySignal = hasCanvasMarkup || modifyInstructions.trim().length > 0 || hasAppearanceInstruction;
  const protectedEditTargets =
    currentRefineSession?.editTargets.filter((target) => target.status === "protected") ?? [];
  const maskTargets = currentRefineSession?.editTargets ?? [];
  const markupCount = maskTargets.length;
  const annotationStyleCues = useMemo<AnnotationStyleCue[]>(() => {
    if (!currentRefineSession) return [];
    const targetCues = currentRefineSession.editTargets
      .filter((target) => target.fontId || target.paletteId)
      .map((target) => {
        const font = editFontPresets.find((candidate) => candidate.id === target.fontId);
        const palette = editPaletteOptions.find((candidate) => candidate.id === target.paletteId);
        return {
          id: target.id,
          name: target.name,
          bounds: target.bounds,
          scope: target.scope,
          fontLabel: font?.label ?? null,
          fontFamily: font?.cssFamily ?? null,
          paletteLabel: palette?.label ?? null,
          paletteColors: palette?.colors ?? [],
        } satisfies AnnotationStyleCue;
      });
    const global = currentRefineSession.globalAppearance;
    if (!global.fontId && !global.paletteId) return targetCues;
    const font = editFontPresets.find((candidate) => candidate.id === global.fontId);
    const palette = editPaletteOptions.find((candidate) => candidate.id === global.paletteId);
    return [
      {
        id: "global-appearance",
        name: "Whole figure",
        bounds: currentRefineSession.figureBounds ?? { x: 0, y: 0, w: 1, h: 1 },
        scope: "global",
        fontLabel: font?.label ?? null,
        fontFamily: font?.cssFamily ?? null,
        paletteLabel: palette?.label ?? null,
        paletteColors: palette?.colors ?? [],
      },
      ...targetCues,
    ];
  }, [currentRefineSession, editFontPresets, editPaletteOptions]);

  const persistRefineSession = useCallback(
    (
      variantId: string,
      update: (session: EvolveRefineSession) => EvolveRefineSession,
    ) => {
      setRefineSessionsByVariantId((current) => {
        const base =
          current[variantId] ??
          readRefineSession(state.studySessionId, participantId, variantId) ??
          createEmptyRefineSession(variantId, artifactFingerprint);
        const next = { ...update(base), updatedAt: new Date().toISOString() };
        writeRefineSession(state.studySessionId, participantId, next);
        return { ...current, [variantId]: next };
      });
    },
    [artifactFingerprint, participantId, state.studySessionId],
  );

  useEffect(() => {
    if (!selectedVariant) {
      setModifyInstructions("");
      setRefineHydratedVariantId(null);
      return;
    }
    const restored =
      readRefineSession(state.studySessionId, participantId, selectedVariant.id) ??
      createEmptyRefineSession(selectedVariant.id, artifactFingerprint);
    setRefineSessionsByVariantId((current) => ({
      ...current,
      [selectedVariant.id]: restored,
    }));
    if (selectedVariant.sourceVariantId) {
      const sourceSession = readRefineSession(
        state.studySessionId,
        participantId,
        selectedVariant.sourceVariantId,
      );
      if (sourceSession) {
        setRefineSessionsByVariantId((current) => ({
          ...current,
          [selectedVariant.sourceVariantId as string]: sourceSession,
        }));
      }
    }
    setModifyInstructions(restored.instructions);
    if (restored.annotationSnapshot) {
      setCanvasSnapshotsByVariantId((current) => ({
        ...current,
        [selectedVariant.id]: restored.annotationSnapshot as TLEditorSnapshot,
      }));
    }
    setCanvasMarkupByVariantId((current) => ({
      ...current,
      [selectedVariant.id]: restored.hasMarkup,
    }));
    setRefineHydratedVariantId(selectedVariant.id);
  }, [artifactFingerprint, participantId, selectedVariant, state.studySessionId]);

  async function handleApplyModify() {
    if (!selectedVariant || !selectedVariantImageUrl || readOnly) return;
    if (!hasModifySignal) {
      setModifyError("Draw at least one annotation or add instructions before regenerating.");
      return;
    }
    if (protectedEditTargets.length > 0) {
      setModifyError(
        "A protected mask is still on the annotation canvas. Unprotect it or remove that mask before generating so validated content is not included accidentally.",
      );
      return;
    }

    setModifyError(null);
    setStartingModify(true);
    setState((current) => ({
      ...current,
      status: `Generating clean revision for ${selectedVariant.title}...`,
    }));

    const liveSnapshot = annotationCanvasRef.current?.getSnapshot() ?? currentCanvasSnapshot;
    const figureBounds = deriveFigureBounds(liveSnapshot) ?? currentRefineSession?.figureBounds ?? null;
    const liveMaskTargets = deriveMaskTargets(liveSnapshot, maskTargets);
    const instructionBlock = modifyInstructions.trim();
    const unexplainedMask = liveMaskTargets.find((target, index) => {
      const defaultName = `Edit target ${index + 1}`;
      const hasNamedRequest = Boolean(target.name.trim() && target.name.trim() !== defaultName);
      return !target.description.trim() && !hasNamedRequest && !target.fontId && !target.paletteId;
    });
    if (unexplainedMask && !instructionBlock) {
      setModifyError("Describe what should change inside every mask before applying the edit.");
      setStartingModify(false);
      setState((current) => ({
        ...current,
        status: "Add an instruction for each masked edit target.",
      }));
      return;
    }
    // Every masked edit needs the aligned, numbered control image. Previously
    // ordinary text-only masks skipped it and fell through to the generic fresh
    // generation prompt, which made local revisions look like redraws.
    const usesAnnotationControl = liveMaskTargets.length > 0 || hasAppearanceInstruction;
    const annotationControlImageDataUrl = usesAnnotationControl
      ? (await annotationCanvasRef.current?.exportToPngDataUrl()) ?? null
      : null;
    if (usesAnnotationControl && !annotationControlImageDataUrl) {
      setModifyError("Could not build the annotated control image. Try again.");
      setStartingModify(false);
      setState((current) => ({
        ...current,
        status: "Failed to flatten annotations onto the figure.",
      }));
      return;
    }
    const maskRegions = maskTargetsToModifyRegions(liveMaskTargets, figureBounds, selectedVariant.id);
    const maskNotes = liveMaskTargets
      .map((target, index) => {
        const detail = [target.name.trim(), target.description.trim()].filter(Boolean).join(": ");
        const region = maskRegions.find((candidate) => candidate.id === target.id);
        const location = region
          ? `x=${(region.x * 100).toFixed(1)}%, y=${(region.y * 100).toFixed(1)}%, w=${(region.w * 100).toFixed(1)}%, h=${(region.h * 100).toFixed(1)}%`
          : "location unavailable";
        return detail ? `Mask #${index + 1} (${location}): ${detail}` : null;
      })
      .filter((line): line is string => Boolean(line));
    const editMaskImageDataUrl = liveMaskTargets.length > 0
      ? (await annotationCanvasRef.current?.exportEditMaskDataUrl()) ?? null
      : null;
    const sourceImageDataUrl =
      (await annotationCanvasRef.current?.exportFigureSourceDataUrl()) ??
      (await imageUrlToDataUrl(selectedVariantImageUrl)) ??
      selectedVariant.previewImageDataUrl ??
      null;
    const modifyPrompt = [
      "Generate a clean revised scientific figure from the user's masked edit request.",
      "Treat every numbered semi-transparent violet mask as an editable area and apply only that mask's matching note inside it.",
      editMaskImageDataUrl || maskRegions.length
        ? "A strict pixel mask is enforced separately: pixels outside the violet mask rectangles must stay identical to the source figure."
        : null,
      "If a mask note asks to remove, erase, or delete an identifier, icon, label, badge, symbol, or mark, remove it completely and inpaint the area from the immediately surrounding background color, gradient, pattern, or texture. Leave no ghost, outline, placeholder, white patch, blur, replacement glyph, or invented content.",
      "Remove every mask overlay and guide mark from the final output.",
      "Preserve unmasked areas: overall layout, colors, typography, arrows, and labels must stay stable.",
      "",
      "Original figure brief:",
      prompt.trim() || selectedVariant.description,
      maskNotes.length ? "" : null,
      maskNotes.length ? "Mask notes:" : null,
      maskNotes.length ? maskNotes.join("\n") : null,
      instructionBlock ? "" : null,
      instructionBlock ? "Additional user instructions:" : null,
      instructionBlock || null,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");

    const sourceReference: ReferenceItem = {
      id: selectedVariant.id,
      title: selectedVariant.title,
      sourcePaper: "Generated figure",
      venue: "HiFigure",
      year: new Date().getFullYear(),
      imageType: "generated figure",
      subject: prompt,
      styleTags: [selectedVariant.layoutStrategy],
      similarityReason: selectedVariant.description,
      thumbnail: "GEN",
      thumbnailUrl: sourceImageDataUrl ?? selectedVariant.previewImageUrl ?? selectedVariant.previewImageDataUrl ?? null,
      imageDataUrl: sourceImageDataUrl,
      structuralAnalysis: selectedVariant.description,
    };
    const skeletonSource = diagramSkeletonXml ?? diagramSkeletonMermaid;
    if (!skeletonSource) {
      setStartingModify(false);
      setState((current) => ({
        ...current,
        status: "This revision needs the Skeleton used to generate the figure.",
      }));
      return;
    }

    const payload: VariantGenerationPayload = {
      prompt: modifyPrompt,
      referenceIds: [selectedVariant.id],
      selectedReferenceId: selectedVariant.id,
      compositionMode: "locked_refine",
      baseReferenceId: selectedVariant.id,
      references: [sourceReference],
      referenceRegions: maskRegions,
      diagramSkeletonXml: skeletonSource,
      annotationControlImageDataUrl,
      editMaskImageDataUrl,
    };

    try {
      const started = await startVariantGenerationJob(payload);
      const pending: PendingModifyJob = {
        jobId: started.jobId,
        sourceVariantId: selectedVariant.id,
        sourceTitle: selectedVariant.title,
        revisionSourceVariantId: selectedVariant.sourceVariantId ?? selectedVariant.id,
        createdAt: Date.now(),
        userId: state.studyProfile?.userId ?? null,
        studySessionId: state.studySessionId,
      };
      upsertPendingModifyJob(pending);
      persistRefineSession(selectedVariant.id, (session) => ({
        ...session,
        instructions: modifyInstructions,
        status: "revision-requested",
      }));
      setState((current) => ({
        ...current,
        status: `Started background revision job for ${selectedVariant.title}. You can close this page; generation will continue on the backend.`,
      }));
      // The workspace-level reconciler owns the busy state from here,
      // including after Done or a full page reload.
      setStartingModify(false);
    } catch (error) {
      console.error(error);
      setModifyError("Could not start background revision job. Check the backend connection and try again.");
      setState((current) => ({
        ...current,
        status: "Could not start annotated revision job.",
      }));
      setStartingModify(false);
    }
  }

  const handleCanvasSnapshotChange = useCallback(
    (snapshot: TLEditorSnapshot) => {
      if (!selectedVariant || readOnly) return;
      setCanvasSnapshotsByVariantId((prev) => ({
        ...prev,
        [selectedVariant.id]: snapshot,
      }));
      persistRefineSession(selectedVariant.id, (session) => ({
        ...session,
        figureBounds: deriveFigureBounds(snapshot) ?? session.figureBounds ?? null,
        annotationSnapshot: compactAnnotationSnapshot(snapshot),
        editTargets: deriveMaskTargets(snapshot, session.editTargets),
      }));
    },
    [persistRefineSession, readOnly, selectedVariant],
  );

  const handleCanvasMarkupChange = useCallback(
    (hasMarkup: boolean) => {
      if (!selectedVariant || readOnly) return;
      setCanvasMarkupByVariantId((prev) => ({
        ...prev,
        [selectedVariant.id]: hasMarkup,
      }));
      persistRefineSession(selectedVariant.id, (session) => ({
        ...session,
        hasMarkup,
      }));
    },
    [persistRefineSession, readOnly, selectedVariant],
  );

  function handleModifyInstructionsChange(value: string) {
    if (!selectedVariant || readOnly) return;
    setModifyInstructions(value);
    persistRefineSession(selectedVariant.id, (session) => ({
      ...session,
      instructions: value,
    }));
  }

  const handleSelectMarkup = useCallback((shapeId: string | null) => {
    setActiveMarkupId(shapeId);
    setFocusShapeId(null);
  }, []);

  /** Clicking a note pulls the matching shape into the canvas selection. */
  function focusMarkup(shapeId: string) {
    setActiveMarkupId(shapeId);
    setFocusShapeId(shapeId);
  }

  /** Removing a note removes the mark it describes, in one click. */
  function removeMarkup(shapeId: string) {
    if (!selectedVariant || readOnly) return;
    annotationCanvasRef.current?.deleteMarkup(shapeId);
    if (activeMarkupId === shapeId) setActiveMarkupId(null);
    if (focusShapeId === shapeId) setFocusShapeId(null);
  }

  /** Each mask carries its own wording, typed beside the canvas it sits on. */
  function handleEditTargetTextChange(
    targetId: string,
    patch: Partial<Pick<RefineEditTarget, "name" | "description">>,
  ) {
    if (!selectedVariant || readOnly) return;
    persistRefineSession(selectedVariant.id, (session) => ({
      ...session,
      editTargets: session.editTargets.map((target) =>
        target.id === targetId ? { ...target, ...patch } : target,
      ),
    }));
  }

  function handleClearAnnotationCanvas() {
    if (!selectedVariant || readOnly) return;
    clearRefineSession(state.studySessionId, participantId, selectedVariant.id);
    setCanvasSnapshotsByVariantId((prev) => {
      const next = { ...prev };
      delete next[selectedVariant.id];
      return next;
    });
    setCanvasMarkupByVariantId((prev) => ({ ...prev, [selectedVariant.id]: false }));
    setRefineSessionsByVariantId((current) => ({
      ...current,
      [selectedVariant.id]: createEmptyRefineSession(selectedVariant.id, artifactFingerprint),
    }));
    setModifyInstructions("");
    setCanvasResetByVariantId((prev) => ({
      ...prev,
      [selectedVariant.id]: (prev[selectedVariant.id] ?? 0) + 1,
    }));
    setState((current) => ({
      ...current,
      status: `Cleared annotations for ${selectedVariant.title}.`,
    }));
  }

  function handleDeleteRevisionVariant(variantId: string) {
    if (readOnly) return;
    clearRefineSession(state.studySessionId, participantId, variantId);
    setCanvasSnapshotsByVariantId((prev) => {
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
    setCanvasMarkupByVariantId((prev) => {
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
    setCanvasResetByVariantId((prev) => {
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
    setState((current) => {
      const deleted = current.variants.find((variant) => variant.id === variantId);
      if (!deleted || deleted.deletedAt || !deleted.sourceVariantId) return current;

      const deletedAt = new Date().toISOString();
      const variants = current.variants.map((variant) =>
        variant.id === variantId ? { ...variant, deletedAt } : variant,
      );
      const remainingVariants = variants.filter((variant) => !variant.deletedAt);
      const fallbackVariantId =
        deleted.sourceVariantId && remainingVariants.some((variant) => variant.id === deleted.sourceVariantId)
          ? deleted.sourceVariantId
          : remainingVariants[0]?.id ?? null;
      const deletedNode = current.ideaHistory.nodes.find((node) => node.variantId === variantId) ?? null;
      const fallbackNodeId = fallbackVariantId
        ? current.ideaHistory.nodes.find((node) => node.variantId === fallbackVariantId)?.id ?? null
        : null;
      const nextCreativeCanvas = removeOutputVariantFromCanvas(current.creativeCanvas, variantId);
      const nextUndoStack = [...(current.creativeCanvasUndoStack ?? []), current.creativeCanvas].slice(-80);

      return {
        ...current,
        variants,
        selectedVariantId:
          current.selectedVariantId === variantId ? fallbackVariantId : current.selectedVariantId,
        ideaHistory: {
          ...current.ideaHistory,
          nodes: current.ideaHistory.nodes.map((node) =>
            node.variantId === variantId
              ? { ...node, status: "archived", deletedAt }
              : node,
          ),
          activeNodeId:
            deletedNode && current.ideaHistory.activeNodeId === deletedNode.id
              ? fallbackNodeId ?? current.ideaHistory.activeRootId
              : current.ideaHistory.activeNodeId,
          previewNodeId:
            deletedNode && current.ideaHistory.previewNodeId === deletedNode.id
              ? fallbackNodeId ?? current.ideaHistory.activeRootId
              : current.ideaHistory.previewNodeId,
        },
        creativeCanvas: nextCreativeCanvas,
        creativeCanvasUndoStack: nextUndoStack,
        creativeCanvases: current.creativeCanvases.map((document) => {
          const nextCanvas = removeOutputVariantFromCanvas(document.canvas, variantId);
          const changed = nextCanvas.items.length !== document.canvas.items.length;
          return changed
            ? {
                ...document,
                canvas: nextCanvas,
                undoStack:
                  document.id === current.activeCreativeCanvasId
                    ? nextUndoStack
                    : [...document.undoStack, document.canvas].slice(-80),
                updatedAt: new Date().toISOString(),
              }
            : document;
        }),
        status: `Deleted ${deleted.title} from Edit and Canvas; kept it in History.`,
      };
    });
  }

  return (
    <div className="page" style={compactLayout ? { minHeight: 0 } : undefined}>
      <div
        className="page-inner"
        style={
          compactLayout
            ? { width: "100%", maxWidth: "none", padding: 0, gap: 12 }
            : undefined
        }
      >
        {!compactLayout ? (
          <section className="workbench-hero">
          <div className="workbench-hero-lead">
            <h1 className="h-display">
              Tweak the figure <em className="serif-italic">in-place</em>, no external tool.
            </h1>
            <p className="muted" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55 }}>
              Use Modify to draw annotations on a generated figure — arrows,
              circles, pen strokes, and notes — then ask the model for a clean revision.
            </p>
          </div>
          <div className="workbench-hero-meta">
            <span>
              <strong>{variants.length}</strong>{" "}
              {variants.length === 1 ? "figure" : "figures"}
            </span>
          </div>
          </section>
        ) : null}

        {readOnly ? (
          <section className="study-entry-panel" style={{ marginBottom: 16 }}>
            <strong>Study finished — editor is read-only.</strong>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              {onOpenJourney ? (
                <>Use the action bar below to open History, or ask the facilitator to reopen the study before editing.</>
              ) : (
                <>Return to <Link href="/">History</Link> to browse earlier versions, or ask the facilitator to reopen the study before editing.</>
              )}
            </p>
          </section>
        ) : null}

        <div
          className="editor-split"
          aria-disabled={readOnly}
          style={readOnly ? { pointerEvents: "none", opacity: 0.76 } : undefined}
        >
          <section className="editor-stage">
            <div className="editor-stage-body">
              {!selectedVariant ? (
                <p className="editor-empty">
                  Pick a candidate on the Candidate stage and choose “Edit selected” to start modifying it here.
                </p>
              ) : selectedVariantImageUrl && refineHydratedVariantId === selectedVariant.id ? (
                <div className="editor-modify-workspace">
                  <div className="editor-modify-canvas">
                    <AnnotationCanvas
                      ref={annotationCanvasRef}
                      imageUrl={selectedVariantImageUrl}
                      variantId={`${selectedVariant.id}-${currentCanvasResetVersion}`}
                      snapshot={currentCanvasSnapshot}
                      onSnapshotChange={handleCanvasSnapshotChange}
                      onMarkupChange={handleCanvasMarkupChange}
                      styleCues={annotationStyleCues}
                      figureBounds={currentRefineSession?.figureBounds ?? null}
                      onSelectMarkup={handleSelectMarkup}
                      focusShapeId={focusShapeId}
                    />
                    {modifyError ? <p className="editor-error">{modifyError}</p> : null}
                  </div>
                  {/* Every mask and arrow on the canvas gets its wording here,
                      so the instruction sits next to the mark it applies to. */}
                  <aside className="editor-notes-rail" aria-label="Annotation notes">
                    <header className="editor-results-head">
                      <strong>Notes</strong>
                      <span>{markupCount === 1 ? "1 mark" : `${markupCount} marks`}</span>
                    </header>
                    <div className="editor-notes-body">
                      <label className="editor-note-block">
                        <span className="editor-note-label">Whole figure</span>
                        <textarea
                          className="textarea editor-note-input"
                          rows={3}
                          value={modifyInstructions}
                          placeholder="Instructions that apply to the entire figure…"
                          onChange={(event) => handleModifyInstructionsChange(event.target.value)}
                        />
                      </label>
                      {maskTargets.map((target, index) => (
                        <div
                          key={target.id}
                          className={`editor-note-block is-mask ${
                            activeMarkupId === target.id ? "is-active" : ""
                          }`}
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            if ((event.target as HTMLElement).closest("input, textarea, button")) return;
                            focusMarkup(target.id);
                          }}
                          onFocus={(event) => {
                            if (event.target === event.currentTarget) focusMarkup(target.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") focusMarkup(target.id);
                          }}
                        >
                          <span className="editor-note-label">
                            <b className="editor-note-index is-mask">{index + 1}</b>
                            <input
                              className="input editor-note-name"
                              value={target.name}
                              aria-label={`Name for mask ${index + 1}`}
                              placeholder={`Edit target ${index + 1}`}
                              onChange={(event) =>
                                handleEditTargetTextChange(target.id, { name: event.target.value })
                              }
                            />
                            <button
                              type="button"
                              className="editor-note-remove"
                              aria-label={`Delete mask ${index + 1}`}
                              title="Delete this mask"
                              onClick={(event) => {
                                event.stopPropagation();
                                removeMarkup(target.id);
                              }}
                            >
                              ×
                            </button>
                          </span>
                          <textarea
                            className="textarea editor-note-input"
                            rows={3}
                            value={target.description}
                            aria-label={`Instruction for mask ${index + 1}`}
                            placeholder="What should change inside this mask?"
                            onChange={(event) =>
                              handleEditTargetTextChange(target.id, { description: event.target.value })
                            }
                          />
                        </div>
                      ))}
                      {markupCount === 0 ? (
                        <p className="editor-note-empty">
                          Draw a violet mask on the figure to add an edit note here.
                        </p>
                      ) : null}
                    </div>
                    {/* The notes are what these actions act on, so they close
                        the rail instead of sitting above the canvas. */}
                    <div className="editor-modify-actions is-notes-footer">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={handleClearAnnotationCanvas}
                        disabled={!hasCanvasMarkup && !currentCanvasSnapshot}
                      >
                        Clear markup
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => void handleApplyModify()}
                        disabled={
                          readOnly ||
                          modifying ||
                          !hasModifySignal ||
                          protectedEditTargets.length > 0
                        }
                      >
                        {modifying ? <><span className="ui-spinner" aria-hidden="true" />Applying…</> : "Apply edits"}
                      </button>
                    </div>
                  </aside>
                </div>
              ) : (
                <p className="editor-empty">
                  This variant has no PNG preview to modify. Generate a raster output on Style first.
                </p>
              )}

              {selectedVariant && selectedVariantImageUrl ? (
                <section className="editor-results-strip" aria-label="Revisions from this edit">
                  <header className="editor-results-head">
                    <strong>Results</strong>
                    <span>
                      {revisionVariants.length === 1
                        ? "1 revision"
                        : `${revisionVariants.length} revisions`}
                    </span>
                  </header>
                  <div className="editor-revision-board" aria-label="Revision board">
                    {revisionSourceVariant ? (
                      <button
                        type="button"
                        className={`editor-revision-card ${
                          selectedVariant?.id === revisionSourceVariant.id ? "is-active" : ""
                        }`}
                        onClick={() =>
                          setState((current) => ({
                            ...current,
                            selectedVariantId: revisionSourceVariant.id,
                            status: `Loaded ${revisionSourceVariant.title} into the editor.`,
                          }))
                        }
                      >
                        <span className="editor-revision-label">Original</span>
                        <span className="editor-revision-thumb">
                          {variantImageUrl(revisionSourceVariant) ? (
                            <img src={variantImageUrl(revisionSourceVariant) || undefined} alt="" />
                          ) : null}
                        </span>
                        <span className="editor-revision-title">{revisionSourceVariant.title}</span>
                      </button>
                    ) : null}
                    {revisionVariants.map((variant, index) => (
                      <article
                        key={variant.id}
                        className={`editor-revision-card ${
                          selectedVariant?.id === variant.id ? "is-active" : ""
                        }`}
                      >
                        <span className="editor-revision-label">Revision {index + 1}</span>
                        <button
                          type="button"
                          className="editor-revision-card-main"
                          onClick={() =>
                            setState((current) => ({
                              ...current,
                              selectedVariantId: variant.id,
                              status: `Loaded ${variant.title} into the editor.`,
                            }))
                          }
                        >
                          <span className="editor-revision-thumb">
                            {variantImageUrl(variant) ? (
                              <img src={variantImageUrl(variant) || undefined} alt="" />
                            ) : null}
                          </span>
                          <span className="editor-revision-title">{variant.title}</span>
                        </button>
                        <button
                          type="button"
                          className="editor-revision-delete"
                          onClick={() => handleDeleteRevisionVariant(variant.id)}
                        >
                          Delete
                        </button>
                      </article>
                    ))}
                    <div className="editor-revision-holder">
                      <span className="editor-revision-label">Next revision</span>
                      <span className="editor-revision-holder-box">
                        {modifying ? <><span className="ui-spinner" aria-hidden="true" />Generating…</> : hasModifySignal ? "Ready" : "Add mask"}
                      </span>
                      <small className="muted">Use Generate above when the markup is ready.</small>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
