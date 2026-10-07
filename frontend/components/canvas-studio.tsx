"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { analyzeStyleReference, generateVariants, vectorizeImage } from "../lib/api";
import { resolveApiAssetUrl } from "../lib/api-assets";
import { segmentShortTitle, splitImageGenerationPrompt } from "../lib/image-prompt-sections";
import {
  figureFontReferences,
  figurePaletteReferences,
  scientificIconReferences,
} from "../lib/scientific-assets";
import { extractCuratedPaletteFromImageRegion, inferIconReferenceId } from "../lib/style-ingredients";
import { createStyleKitFingerprint, type StyleKit, type StyleKitPalette } from "../lib/style-kit";
import { appendFigureHistoryEntries } from "../lib/figure-history";
import type {
  CustomIconReference,
  FigureVariant,
  ReferenceItem,
  ReferenceRegion,
  StyleFontCandidate,
} from "../lib/types";
import {
  removeCustomIconFromWorkspaceState,
  workspaceIconContentHash,
} from "../lib/workspace-icon-assets";
import {
  appendNarratorMessage,
  appendStudyEvent,
  createNarratorArtifactFingerprint,
  transitionStudyStage,
  updateActiveCreativeCanvasState,
  useWorkspaceState,
  type CreativeCanvasState,
  type WorkspaceState,
} from "../lib/workspace-state";
import { DrawioEmbed } from "./drawio-embed";
import { MermaidDiagramPreview } from "./mermaid-diagram-preview";
import {
  SamIconExtractor,
  type SamIconExtractionResult,
  type SamIconExtractionStatus,
} from "./sam-icon-extractor";
import type { StagePrimaryActionRegistration } from "../lib/stage-primary-action";
import { continueToStepLabel } from "../lib/idea-spark-flow";
import disclosureStyles from "./progressive-disclosure.module.css";
import galleryStyles from "./layout-studio.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const STYLE_FONT_CHOICE_LIMIT = 3;
const STYLE_FONT_CATALOG_FINGERPRINT = "font-catalog-v2-50";
const STYLE_PALETTE_EXTRACTION_VERSION = "role-v2";
const UNSAVED_EXTRACTED_ICONS_WARNING =
  "You have icon changes that have not been saved. Choose Cancel to return and click Done, or OK to close without saving them.";

type StyleIconDraftItem = SamIconExtractionResult & {
  id: string;
  selected: boolean;
  existingIconId: string | null;
};

type StyleIconDraft = {
  referenceId: string;
  items: StyleIconDraftItem[];
};

function styleKitPaletteKey(palette: StyleKitPalette) {
  return [palette.kind, palette.id, palette.sourceReferenceId ?? "", palette.sourceRegionId ?? ""].join("::");
}

function renderStylePaletteSwatches(colors: string[]) {
  return (
    <span className="style-palette-swatches" aria-label={colors.join(", ")}>
      {colors.slice(0, 5).map((color) => <i key={color} style={{ background: color }} />)}
    </span>
  );
}

function updateStyleKitDraft(
  kit: StyleKit,
  patch: Partial<Omit<StyleKit, "id" | "fingerprint">>,
  updatedAt = new Date().toISOString(),
): StyleKit {
  const next = {
    ...kit,
    ...patch,
    updatedAt,
    confirmedAt: null,
  };
  return { ...next, fingerprint: createStyleKitFingerprint(next) };
}

function withStyleKitItemEvent(
  state: WorkspaceState,
  action: "selected" | "replaced" | "removed",
  itemKind: "source" | "icon" | "region" | "font" | "palette",
  targetIds: string[],
  previousId: string | null = null,
) {
  return appendStudyEvent(state, {
    stage: "references",
    type: `style_kit_item_${action}`,
    targetIds,
    result: action,
    metadata: {
      itemKind,
      previousId,
    },
  });
}

async function imageUrlToDataUrl(url: string): Promise<string | null> {
  if (url.startsWith("data:image/")) {
    return url;
  }
  try {
    // Avoid empty bodies: cross-origin fetch + 304 can yield an empty blob in some browsers.
    const response = await fetch(url, { mode: "cors", cache: "no-store" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function imageElementFromDataUrl(dataUrl: string | null): Promise<HTMLImageElement | null> {
  if (!dataUrl) return null;
  return await new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

async function hydrateReferenceImages(references: ReferenceItem[]): Promise<ReferenceItem[]> {
  return Promise.all(
    references.map(async (reference) => {
      if (!reference.thumbnailUrl) return reference;
      const imageDataUrl = await imageUrlToDataUrl(reference.thumbnailUrl);
      return imageDataUrl ? { ...reference, imageDataUrl } : reference;
    }),
  );
}

function maxCanvasZ(canvas: CreativeCanvasState) {
  return canvas.items.reduce((max, item) => Math.max(max, item.z), 0);
}

function fillStyleTemplateSlot(canvas: CreativeCanvasState, referenceId: string): CreativeCanvasState {
  const existingSelected = canvas.items.find(
    (item) =>
      item.type === "reference" &&
      item.role === "style" &&
      item.referenceId === referenceId &&
      !item.deletedAt,
  );
  if (existingSelected) {
    return { ...canvas, selectedItemId: existingSelected.id };
  }

  const styleSlot = canvas.items.find(
    (item) =>
      !item.deletedAt &&
      ((item.type === "template" && item.templateKind === "style") ||
        (item.type === "reference" && item.role === "style")),
  );
  const target = styleSlot ?? {
    id: `canvas-ref-style-${referenceId}-${Date.now()}`,
    x: 72,
    y: 356,
    w: 360,
    h: 300,
    z: maxCanvasZ(canvas) + 1,
  };
  const nextItem = {
    ...target,
    type: "reference" as const,
    role: "style" as const,
    referenceId,
    templateKind: undefined,
    templateTitle: undefined,
    templateHint: undefined,
    w: Math.max(target.w, 360),
    h: Math.max(target.h, 300),
  };
  const items = styleSlot
    ? canvas.items.map((item) => (item.id === styleSlot.id ? nextItem : item))
    : [...canvas.items, nextItem];
  return {
    ...canvas,
    items,
    selectedItemId: nextItem.id,
  };
}

function fignumLetter(i: number) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return letters[i] ?? `${i + 1}`;
}

function patternClassName(patternId: string) {
  if (patternId.includes("dashed")) return "is-pattern-dashed";
  if (patternId.includes("loop")) return "is-pattern-loop";
  if (patternId.includes("callout")) return "is-pattern-callout";
  if (patternId.includes("icon-label")) return "is-pattern-icon-label";
  return "is-pattern-rounded";
}

const PROMPT_FULL_TAB_ID = "__full__";

function ImageGenerationPromptModules({ promptText }: { promptText: string }) {
  const sections = useMemo(
    () => splitImageGenerationPrompt(promptText),
    [promptText],
  );

  const [activeId, setActiveId] = useState<string>(
    () => splitImageGenerationPrompt(promptText)[0]?.id ?? PROMPT_FULL_TAB_ID,
  );

  const showFullTab = sections.length > 1;

  useEffect(() => {
    const next = splitImageGenerationPrompt(promptText);
    const showFull = next.length > 1;
    const firstId = next[0]?.id ?? PROMPT_FULL_TAB_ID;
    setActiveId((prev) => {
      if (!showFull && prev === PROMPT_FULL_TAB_ID) return firstId;
      if (next.some((s) => s.id === prev)) return prev;
      return firstId;
    });
  }, [promptText]);

  async function copyAll() {
    try {
      await navigator.clipboard?.writeText(promptText);
    } catch {
      // ignore
    }
  }

  async function copyVisible() {
    const text =
      activeId === PROMPT_FULL_TAB_ID
        ? promptText
        : (sections.find((s) => s.id === activeId)?.body ?? "");
    if (!text) return;
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      // ignore
    }
  }

  const activeSection = sections.find((s) => s.id === activeId);
  const readingTitle =
    activeId === PROMPT_FULL_TAB_ID
      ? "Full prompt (all sections)"
      : (activeSection?.label ?? "Section");
  const readingBody =
    activeId === PROMPT_FULL_TAB_ID ? promptText : (activeSection?.body ?? "").trimEnd();

  if (sections.length === 1 && sections[0]?.label === "Full prompt") {
    const chunk = sections[0]!;
    return (
      <div className="prompt-pane">
        <div className="prompt-pane-toolbar">
          <span className="prompt-pane-toolbar-title">Image generation prompt</span>
          <div className="prompt-pane-toolbar-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyAll()}>
              Copy all
            </button>
          </div>
        </div>
        <div className="prompt-reading" role="document">
          <div className="prompt-reading-head">Full prompt</div>
          <pre className="prompt-reading-body">{chunk.body.trimEnd()}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="prompt-pane">
      <div className="prompt-pane-toolbar">
        <span className="prompt-pane-toolbar-title">Image generation prompt</span>
        <div className="prompt-pane-toolbar-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyVisible()}>
            Copy section
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyAll()}>
            Copy all
          </button>
        </div>
      </div>
      <div className="prompt-tab-bar" role="tablist" aria-label="Prompt sections">
        {sections.map((sec) => (
          <button
            key={sec.id}
            type="button"
            role="tab"
            aria-selected={activeId === sec.id}
            className={`prompt-tab ${activeId === sec.id ? "is-active" : ""}`}
            onClick={() => setActiveId(sec.id)}
          >
            {segmentShortTitle(sec.label)}
          </button>
        ))}
        {showFullTab ? (
          <button
            type="button"
            role="tab"
            aria-selected={activeId === PROMPT_FULL_TAB_ID}
            className={`prompt-tab ${activeId === PROMPT_FULL_TAB_ID ? "is-active" : ""}`}
            onClick={() => setActiveId(PROMPT_FULL_TAB_ID)}
          >
            Full
          </button>
        ) : null}
      </div>
      <div className="prompt-reading" role="tabpanel">
        <div className="prompt-reading-head">{readingTitle}</div>
        <pre className="prompt-reading-body">{readingBody}</pre>
      </div>
    </div>
  );
}

export function CanvasStudio({
  embedded = false,
  onContinueToIcons,
  onRegisterStageAction,
  previewRequest,
}: {
  embedded?: boolean;
  onContinueToIcons?: () => void;
  onRegisterStageAction?: (action: StagePrimaryActionRegistration | null) => void;
  previewRequest?: { referenceId: string; nonce: number } | null;
} = {}) {
  const router = useRouter();
  const { state, setState } = useWorkspaceState();
  const [loading, setLoading] = useState(false);
  /** Bumped when outputs are cleared or replaced so variant cards remount (fixes stale img previews). */
  const [outputEpoch, setOutputEpoch] = useState(0);
  const [vectorizingId, setVectorizingId] = useState<string | null>(null);
  const [brokenPreviewIds, setBrokenPreviewIds] = useState<Set<string>>(() => new Set());
  const [stylePreviewReference, setStylePreviewReference] = useState<ReferenceItem | null>(null);
  const embeddedGalleryScrollRef = useRef<HTMLDivElement | null>(null);
  const embeddedStyleCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const [styleDetailOpen, setStyleDetailOpen] = useState(false);
  const [hasUnsavedExtractedIcons, setHasUnsavedExtractedIcons] = useState(false);
  const [styleReferenceImageDataUrls, setStyleReferenceImageDataUrls] = useState<Record<string, string>>({});
  const [styleExtractedPalettes, setStyleExtractedPalettes] = useState<Record<string, string[]>>({});
  const [stylePaletteLoadingReferenceId, setStylePaletteLoadingReferenceId] = useState<string | null>(null);
  const [styleFontAnalysisReferenceId, setStyleFontAnalysisReferenceId] = useState<string | null>(null);
  const [styleIconDraft, setStyleIconDraft] = useState<StyleIconDraft | null>(null);
  const [styleIconExtractionStatus, setStyleIconExtractionStatus] = useState<SamIconExtractionStatus | null>(null);
  const autoFontReadRef = useRef<Set<string>>(new Set());
  const styleNarratorSeenRef = useRef<Set<string>>(new Set());
  const styleDefaultAppearanceRef = useRef<Set<string>>(new Set());
  const {
    board,
    variants,
    prompt,
    selectedVariantId,
    referenceRegions,
    canvasFocusReferenceId,
    referenceUsage,
    diagramSkeletonXml,
    diagramSkeletonMermaid,
    customIconReferences,
    guidedDialogue,
    styleAnalysisStates,
    styleVisualAnalyses,
  } = state;

  const styleCandidates = useMemo(() => {
    const tagged = board.filter((item) => referenceUsage[item.id]?.style);
    return tagged.length > 0 ? tagged : board;
  }, [board, referenceUsage]);

  // Keep this visit stable. Remounting the stage captures the latest selection
  // and promotes it only when the author comes back to Style.
  const [canvasFocusReferenceIdOnEntry] = useState(canvasFocusReferenceId);
  const orderedStyleCandidates = useMemo(() => {
    const firstId = canvasFocusReferenceId;
    const pinnedId = firstId === canvasFocusReferenceIdOnEntry ? firstId : canvasFocusReferenceIdOnEntry;
    if (!pinnedId) return styleCandidates;
    const first = styleCandidates.find((reference) => reference.id === pinnedId);
    if (!first) return styleCandidates;
    return [first, ...styleCandidates.filter((reference) => reference.id !== pinnedId)];
  }, [canvasFocusReferenceId, canvasFocusReferenceIdOnEntry, styleCandidates]);

  const activeReference = useMemo(() => {
    const preferred = styleCandidates.find((b) => b.id === canvasFocusReferenceId);
    const savedPrimary = styleCandidates.find((b) => b.id === state.activeStyleKit.sourceReferenceId);
    return preferred ?? savedPrimary ?? null;
  }, [canvasFocusReferenceId, state.activeStyleKit.sourceReferenceId, styleCandidates]);

  const displayedStyleReference = stylePreviewReference ?? activeReference;
  useEffect(() => {
    if (!previewRequest) return;
    const reference = board.find((item) => item.id === previewRequest.referenceId) ?? null;
    if (!reference) return;
    setStylePreviewReference(reference);
    requestAnimationFrame(() => {
      embeddedStyleCardRefs.current[reference.id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [board, previewRequest?.nonce, previewRequest?.referenceId]);
  const cachedStyleImageDataUrl = displayedStyleReference
    ? styleReferenceImageDataUrls[displayedStyleReference.id] ?? null
    : null;
  const resolvedThumbnailUrl = displayedStyleReference?.thumbnailUrl
    ? resolveApiAssetUrl(displayedStyleReference.thumbnailUrl, API_BASE)
    : null;
  const imageUrl = displayedStyleReference
    ? displayedStyleReference.imageDataUrl ?? cachedStyleImageDataUrl ?? resolvedThumbnailUrl ?? null
    : null;
  const hasLayoutSkeleton = Boolean(diagramSkeletonXml || diagramSkeletonMermaid);
  const displayedStyleRegions = useMemo(() => {
    if (!displayedStyleReference) return [];
    return referenceRegions
      .filter((region) => region.referenceId === displayedStyleReference.id && region.intent === "style");
  }, [displayedStyleReference, referenceRegions]);
  const extractedIconRegions = displayedStyleRegions.filter(
    (region) => region.id.startsWith("style-region-icon-") && region.detectedIcon?.cropDataUrl,
  );
  const activeStyleKit = state.activeStyleKit;
  const activeKitPalettes = activeStyleKit.palettes.length
    ? activeStyleKit.palettes
    : activeStyleKit.palette ? [activeStyleKit.palette] : [];
  const storedActiveKitFontIds = activeStyleKit.fontIds.length
    ? activeStyleKit.fontIds
    : activeStyleKit.fontId ? [activeStyleKit.fontId] : [];
  const installedFontIds = new Set<string>(figureFontReferences.map((font) => font.id));
  const activeKitFontIds = storedActiveKitFontIds.filter((fontId) => installedFontIds.has(fontId));
  const savedStyleIconDraftItems = useMemo((): StyleIconDraftItem[] => {
    if (!displayedStyleReference) return [];
    return customIconReferences
      .filter((icon) => icon.sourceReferenceId === displayedStyleReference.id && Boolean(icon.cropDataUrl))
      .map((icon) => {
        const region = referenceRegions.find((candidate) => candidate.id === icon.sourceRegionId);
        return {
          id: `saved-${icon.id}`,
          existingIconId: icon.id,
          selected: activeStyleKit.iconIds.includes(icon.id),
          cropDataUrl: icon.cropDataUrl,
          label: icon.label,
          confidence: region?.detectedIcon?.confidence ?? null,
          bbox: region
            ? { x: region.x, y: region.y, w: region.w, h: region.h }
            : { x: 0, y: 0, w: 1, h: 1 },
        };
      });
  }, [activeStyleKit.iconIds, customIconReferences, displayedStyleReference, referenceRegions]);
  const styleIconDraftItems = styleIconDraft && styleIconDraft.referenceId === displayedStyleReference?.id
    ? styleIconDraft.items
    : savedStyleIconDraftItems;
  const selectedStyleIconCount = styleIconDraftItems.filter((icon) => icon.selected).length;
  const extractedImagePalette: StyleKitPalette | null = displayedStyleReference && styleExtractedPalettes[displayedStyleReference.id]
    ? {
        kind: "region",
        id: `whole-image-${STYLE_PALETTE_EXTRACTION_VERSION}-${displayedStyleReference.id}`,
        colors: styleExtractedPalettes[displayedStyleReference.id],
        sourceReferenceId: displayedStyleReference.id,
      }
    : null;
  const savedStyleVisualAnalysis = displayedStyleReference
    ? styleVisualAnalyses[displayedStyleReference.id] ?? null
    : null;
  const displayedStyleAnalysis = displayedStyleReference
    ? styleAnalysisStates[displayedStyleReference.id] ?? null
    : null;
  const suggestedStyleFonts = savedStyleVisualAnalysis?.fonts ?? [];
  const suggestedStyleFontIds = new Set(suggestedStyleFonts.map((font) => font.id));
  const rankedStyleFonts = suggestedStyleFonts.flatMap((candidate) => {
    const font = figureFontReferences.find((reference) => reference.id === candidate.id);
    return font ? [{
      ...font,
      suggested: true,
      reason: candidate.reason ?? null,
    }] : [];
  });
  const fallbackStyleFonts = figureFontReferences
    .filter((font) => !suggestedStyleFontIds.has(font.id))
    .map((font) => ({ ...font, suggested: false, reason: null as string | null }));
  // The cards always reflect the current image analysis. Existing selections
  // never pin or reorder these three recommendations.
  const styleFontChoices = [...rankedStyleFonts, ...fallbackStyleFonts].slice(0, STYLE_FONT_CHOICE_LIMIT);
  const styleAppearanceReady = activeKitPalettes.length > 0 && activeKitFontIds.length > 0;
  useEffect(() => {
    if (!displayedStyleReference) return;
    const referenceId = displayedStyleReference.id;
    const firstFont = styleFontChoices[0] ?? null;
    const fontAnalysisReady = displayedStyleAnalysis?.status === "completed" || displayedStyleAnalysis?.status === "failed";
    const fontKey = `font:${referenceId}`;
    const paletteKey = `palette:${referenceId}`;
    const initializeFont = Boolean(firstFont && fontAnalysisReady && !styleDefaultAppearanceRef.current.has(fontKey));
    const initializePalette = Boolean(extractedImagePalette && !styleDefaultAppearanceRef.current.has(paletteKey));
    if (!initializeFont && !initializePalette) return;
    if (initializeFont) styleDefaultAppearanceRef.current.add(fontKey);
    if (initializePalette) styleDefaultAppearanceRef.current.add(paletteKey);

    setState((current) => {
      const storedFontIds = current.activeStyleKit.fontIds.length
        ? current.activeStyleKit.fontIds
        : current.activeStyleKit.fontId ? [current.activeStyleKit.fontId] : [];
      const currentFontIds = storedFontIds.filter((id) => figureFontReferences.some((font) => font.id === id));
      const currentPalettes = current.activeStyleKit.palettes.length
        ? current.activeStyleKit.palettes
        : current.activeStyleKit.palette ? [current.activeStyleKit.palette] : [];
      const shouldSelectFont = initializeFont && firstFont && currentFontIds.length === 0;
      const shouldSelectPalette = initializePalette && extractedImagePalette && currentPalettes.length === 0;
      if (!shouldSelectFont && !shouldSelectPalette) return current;

      const fontIds = shouldSelectFont ? [firstFont.id] : currentFontIds;
      const palettes = shouldSelectPalette ? [extractedImagePalette] : currentPalettes;
      const fontSources = shouldSelectFont
        ? { ...current.activeStyleKit.fontSources, [firstFont.id]: { sourceReferenceId: referenceId } }
        : current.activeStyleKit.fontSources;
      return {
        ...current,
        activeStyleKit: updateStyleKitDraft(current.activeStyleKit, {
          fontIds,
          fontId: fontIds[0] ?? null,
          fontSources,
          palettes,
          palette: palettes[0] ?? null,
          sourceReferenceIds: Array.from(new Set([...current.activeStyleKit.sourceReferenceIds, referenceId])),
        }),
      };
    });
  }, [displayedStyleAnalysis?.status, displayedStyleReference, extractedImagePalette, setState, styleFontChoices]);

  useEffect(() => {
    const stepId = `style:${displayedStyleReference?.id ?? "no_reference"}:icon_extraction`;
    if (styleNarratorSeenRef.current.has(stepId)) return;
    styleNarratorSeenRef.current.add(stepId);
    setState((current) => {
      if (current.guidedDialogue.seenStepIds.includes(stepId)) return current;
      let nextDialogue = current.guidedDialogue;
      if (!displayedStyleReference) {
        nextDialogue = appendNarratorMessage(nextDialogue, {
          surface: "style",
          speaker: "assistant",
          templateId: "choose_style_reference",
          summary: "Select a Style reference from the left pocket. I’ll keep the image in the main workspace and wait for your next choice.",
          promptRevisionId: current.currentPromptRevisionId,
          referenceId: null,
          artifactId: null,
          artifactFingerprint: null,
        });
      } else {
        nextDialogue = appendNarratorMessage(nextDialogue, {
          surface: "style",
          speaker: "author",
          templateId: "style_reference_selected",
          summary: `Selected Style: ${displayedStyleReference.title}`,
          promptRevisionId: current.currentPromptRevisionId,
          referenceId: displayedStyleReference.id,
          artifactId: null,
          artifactFingerprint: createNarratorArtifactFingerprint(displayedStyleReference.id),
        });
        nextDialogue = appendNarratorMessage(nextDialogue, {
          surface: "style",
          speaker: "assistant",
          templateId: "style_local_extraction_hint",
          summary: "Click icons directly on the image to extract them locally, then save the icons you want to use in Match.",
          promptRevisionId: current.currentPromptRevisionId,
          referenceId: displayedStyleReference.id,
          artifactId: null,
          artifactFingerprint: createNarratorArtifactFingerprint(displayedStyleReference.id),
        });
      }
      return appendStudyEvent({
        ...current,
        guidedDialogue: {
          ...nextDialogue,
          currentSteps: { ...nextDialogue.currentSteps, style: "not_requested" },
          seenStepIds: [...nextDialogue.seenStepIds, stepId],
        },
      }, {
        stage: "references",
        type: "narrator_step_seen",
        targetIds: displayedStyleReference ? [displayedStyleReference.id] : [],
        result: "icon_extraction",
        metadata: { surface: "style", scriptVersion: current.guidedDialogue.version },
      });
    });
  }, [displayedStyleReference, setState]);

  useEffect(() => {
    setState((s) => {
      const next = s.referenceRegions
        .filter((r) => (r.intent ?? "include") !== "include")
        .filter((r) => r.intent !== "exclude");
      if (JSON.stringify(next) === JSON.stringify(s.referenceRegions)) return s;
      return {
        ...s,
        referenceRegions: next,
        status: "Style page uses style regions only; local modify marks live in Editor.",
      };
    });
  }, [setState]);

  useEffect(() => {
    if (!displayedStyleReference?.thumbnailUrl || displayedStyleReference.imageDataUrl || cachedStyleImageDataUrl) {
      return;
    }
    let cancelled = false;
    const sourceUrl = resolveApiAssetUrl(displayedStyleReference.thumbnailUrl, API_BASE);
    if (!sourceUrl) return;
    void imageUrlToDataUrl(sourceUrl).then((dataUrl) => {
      if (cancelled || !dataUrl) return;
      setStyleReferenceImageDataUrls((current) =>
        current[displayedStyleReference.id]
          ? current
          : { ...current, [displayedStyleReference.id]: dataUrl },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [cachedStyleImageDataUrl, displayedStyleReference]);

  useEffect(() => {
    const reference = displayedStyleReference;
    if (!reference || !imageUrl || styleExtractedPalettes[reference.id]) return;
    let cancelled = false;
    setStylePaletteLoadingReferenceId(reference.id);
    void (async () => {
      const dataUrl = imageUrl.startsWith("data:image/") ? imageUrl : await imageUrlToDataUrl(imageUrl);
      const image = await imageElementFromDataUrl(dataUrl);
      if (cancelled || !image) return;
      const fallback = figurePaletteReferences.find((palette) => palette.id === "categorical")?.colors ?? [];
      const colors = extractCuratedPaletteFromImageRegion(
        image,
        { x: 0, y: 0, w: 1, h: 1 },
        fallback,
        4,
      );
      if (cancelled) return;
      setStyleExtractedPalettes((current) => current[reference.id]
        ? current
        : { ...current, [reference.id]: colors });
      const refreshedPalette: StyleKitPalette = {
        kind: "region",
        id: `whole-image-${STYLE_PALETTE_EXTRACTION_VERSION}-${reference.id}`,
        colors,
        sourceReferenceId: reference.id,
      };
      setState((current) => {
        const currentPalettes = current.activeStyleKit.palettes.length
          ? current.activeStyleKit.palettes
          : current.activeStyleKit.palette ? [current.activeStyleKit.palette] : [];
        const previousIndex = currentPalettes.findIndex((palette) => (
          palette.kind === "region" &&
          palette.sourceReferenceId === reference.id &&
          palette.id.startsWith("whole-image-")
        ));
        if (previousIndex < 0) return current;
        const previous = currentPalettes[previousIndex];
        if (previous.id === refreshedPalette.id && previous.colors.join(",") === colors.join(",")) return current;
        const palettes = currentPalettes.map((palette, index) => index === previousIndex ? refreshedPalette : palette);
        const refreshMatchedPalette = current.matchedStylePalette
          ? styleKitPaletteKey(current.matchedStylePalette) === styleKitPaletteKey(previous)
          : false;
        const activeStyleKit = updateStyleKitDraft(current.activeStyleKit, {
          palettes,
          palette: palettes[0] ?? null,
        });
        return appendStudyEvent({
          ...current,
          activeStyleKit,
          matchedStylePalette: refreshMatchedPalette ? refreshedPalette : current.matchedStylePalette,
          status: "Refreshed the selected image palette from the source pixels.",
        }, {
          stage: "references",
          type: "style_palette_reextracted",
          targetIds: [reference.id, refreshedPalette.id],
          result: STYLE_PALETTE_EXTRACTION_VERSION,
          metadata: { previousPaletteId: previous.id, colorCount: colors.length },
        });
      });
    })().finally(() => {
      if (!cancelled) {
        setStylePaletteLoadingReferenceId((current) => current === reference.id ? null : current);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [displayedStyleReference, imageUrl, styleExtractedPalettes]);

  async function resolveStyleImageDataUrl(reference: ReferenceItem): Promise<string | null> {
    if (reference.imageDataUrl) return reference.imageDataUrl;
    const cached = styleReferenceImageDataUrls[reference.id];
    if (cached) return cached;
    const sourceUrl = reference.thumbnailUrl ? resolveApiAssetUrl(reference.thumbnailUrl, API_BASE) : null;
    return sourceUrl ? await imageUrlToDataUrl(sourceUrl) : null;
  }

  async function analyzeStyleFontsFromImage(userRequested = true) {
    const reference = displayedStyleReference;
    if (!reference || styleFontAnalysisReferenceId) return;
    const referenceId = reference.id;
    const requestedAt = new Date().toISOString();
    setStyleFontAnalysisReferenceId(referenceId);
    setState((current) => ({
      ...current,
      styleAnalysisStates: {
        ...current.styleAnalysisStates,
        [referenceId]: {
          ...(current.styleAnalysisStates[referenceId] ?? {
            referenceId,
            status: "not_requested" as const,
            requestedAt: null,
            completedAt: null,
            resultFingerprint: null,
            iconCount: 0,
            fontCount: 0,
            patternCount: 0,
            errorReason: null,
            userRequested: false,
          }),
          status: "analyzing" as const,
          requestedAt,
          completedAt: null,
          resultFingerprint: null,
          fontCount: 0,
          catalogFingerprint: STYLE_FONT_CATALOG_FINGERPRINT,
          errorReason: null,
          userRequested,
        },
      },
      status: `Matching the image typography against ${figureFontReferences.length} installed fonts…`,
    }));

    try {
      const imageDataUrl = await resolveStyleImageDataUrl(reference);
      if (!imageDataUrl) throw new Error("The reference image could not be loaded for font matching.");
      const analysis = await analyzeStyleReference({
        imageDataUrl,
        fontOptions: figureFontReferences.map((font) => ({
          id: font.id,
          label: font.label,
          tone: font.tone,
          description: font.description,
        })),
        referenceTitle: reference.title,
      });
      const fonts: StyleFontCandidate[] = analysis.fonts.slice(0, 3).flatMap((candidate) => {
        const font = figureFontReferences.find((option) => option.id === candidate.id);
        return font ? [{
          id: font.id,
          label: font.label,
          description: font.description,
          confidence: candidate.confidence ?? null,
          reason: candidate.reason ?? null,
        }] : [];
      });
      setState((current) => appendStudyEvent({
        ...current,
        styleVisualAnalyses: {
          ...current.styleVisualAnalyses,
          [referenceId]: {
            fonts,
            patterns: current.styleVisualAnalyses[referenceId]?.patterns ?? [],
          },
        },
        styleAnalysisStates: {
          ...current.styleAnalysisStates,
          [referenceId]: {
            ...(current.styleAnalysisStates[referenceId] ?? {
              referenceId,
              iconCount: 0,
              patternCount: 0,
            }),
            referenceId,
            status: "completed" as const,
            requestedAt,
            completedAt: new Date().toISOString(),
            resultFingerprint: createNarratorArtifactFingerprint({ referenceId, fonts }),
            fontCount: fonts.length,
            catalogFingerprint: STYLE_FONT_CATALOG_FINGERPRINT,
            errorReason: null,
            userRequested,
          },
        },
        status: fonts.length
          ? `Found ${fonts.length} closest font matches from ${figureFontReferences.length} installed families.`
          : "The lettering was too small to match; three fallback fonts are shown.",
      }, {
        stage: "references",
        type: "style_font_analysis_completed",
        targetIds: [referenceId, ...fonts.map((font) => font.id)],
        result: fonts.length ? "completed" : "empty",
        metadata: {
          fontIds: fonts.map((font) => font.id).join(","),
          catalogSize: figureFontReferences.length,
          userRequested,
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Style font matching failed.";
      setState((current) => appendStudyEvent({
        ...current,
        styleAnalysisStates: {
          ...current.styleAnalysisStates,
          [referenceId]: {
            ...(current.styleAnalysisStates[referenceId] ?? {
              referenceId,
              iconCount: 0,
              patternCount: 0,
            }),
            referenceId,
            status: "failed" as const,
            requestedAt,
            completedAt: new Date().toISOString(),
            resultFingerprint: null,
            fontCount: 0,
            catalogFingerprint: STYLE_FONT_CATALOG_FINGERPRINT,
            errorReason: message,
            userRequested,
          },
        },
        status: `Could not match the typography: ${message}`,
      }, {
        stage: "references",
        type: "style_font_analysis_failed",
        targetIds: [referenceId],
        result: "failed",
        metadata: { reason: message, catalogSize: figureFontReferences.length, userRequested },
      }));
    } finally {
      setStyleFontAnalysisReferenceId(null);
    }
  }

  useEffect(() => {
    const reference = displayedStyleReference;
    if (!reference || !(styleDetailOpen || !embedded)) return;
    const cachedForCurrentCatalog = Boolean(
      styleVisualAnalyses[reference.id] &&
      styleAnalysisStates[reference.id]?.catalogFingerprint === STYLE_FONT_CATALOG_FINGERPRINT,
    );
    if (cachedForCurrentCatalog || autoFontReadRef.current.has(reference.id)) return;
    if (styleFontAnalysisReferenceId) return;
    autoFontReadRef.current.add(reference.id);
    void analyzeStyleFontsFromImage(false);
    // The ref makes this one automatic read per Style image; Retry is explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedStyleReference, embedded, styleAnalysisStates, styleDetailOpen, styleFontAnalysisReferenceId, styleVisualAnalyses]);

  async function handleGenerate() {
    if (!activeReference) return;
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setState((current) => ({
        ...current,
        status: "Type a prompt before generating — the backend rejects empty briefs.",
      }));
      return;
    }
    if (!hasLayoutSkeleton) {
      setState((current) => ({
        ...current,
        status: "Generate a layout skeleton first — Style uses its confirmed layout as an elastic scaffold.",
      }));
      return;
    }
    setLoading(true);
    setState((current) => ({
      ...current,
      variants: [],
      selectedVariantId: null,
      status: "Generating new figures (previous batch cleared)…",
    }));

    try {
      const regionsForGenerate = referenceRegions.filter(
        (r) => r.intent === "style" && r.referenceId === activeReference.id,
      );
      const referencesWithImages = await hydrateReferenceImages([activeReference]);
      const generated = await generateVariants({
        prompt: trimmedPrompt,
        referenceIds: [activeReference.id],
        selectedReferenceId: activeReference.id,
        references: referencesWithImages,
        referenceRegions: regionsForGenerate,
        diagramSkeletonXml: diagramSkeletonXml ?? diagramSkeletonMermaid ?? "",
      });
      setOutputEpoch((e) => e + 1);
      setState((current) => {
        const figureHistory = appendFigureHistoryEntries(current, generated, {
          sourceStage: "compose",
          sourceType: "generate",
        });
        return {
          ...current,
          variants: generated,
          selectedVariantId: generated[0]?.id ?? null,
          figureHistory,
          status:
            generated.length === 1
              ? "Generated 1 figure."
              : `Generated ${generated.length} figures.`,
        };
      });
    } catch (error) {
      console.error(error);
      setState((current) => ({
        ...current,
        status: "Generation failed — check the API connection.",
      }));
    } finally {
      setLoading(false);
    }
  }

  async function vectorizeVariant(variant: FigureVariant): Promise<boolean> {
    const imageDataUrl = variant.previewImageDataUrl ?? null;
    const imageUrlBlob = variant.previewImageUrl ?? null;

    if (!imageDataUrl && !imageUrlBlob) {
      setState((current) => ({ ...current, status: "No PNG preview available to vectorize." }));
      return false;
    }

    setVectorizingId(variant.id);
    setState((current) => ({
      ...current,
      status: `Vectorizing ${variant.title} with Vectorizer.AI...`,
    }));

    try {
      const result = await vectorizeImage({ imageDataUrl, imageUrl: imageUrlBlob });
      setState((current) => ({
        ...current,
        variants: current.variants.map((item) =>
          item.id === variant.id ? { ...item, svg: result.svg } : item,
        ),
        selectedVariantId: variant.id,
        status: `${variant.title} converted to editable SVG.`,
      }));
      return true;
    } catch (error) {
      console.error(error);
      setState((current) => ({ ...current, status: "PNG → SVG conversion failed." }));
      return false;
    } finally {
      setVectorizingId(null);
    }
  }

  function handleOpenInEditor(variant: FigureVariant) {
    void vectorizeVariant(variant).then((ok) => {
      if (ok) router.push("/editor");
    });
  }

  function saveVariantToPocket(variant: FigureVariant) {
    const thumbnailUrl = variant.previewImageDataUrl ?? variant.previewImageUrl ?? null;
    if (!thumbnailUrl) {
      setState((current) => ({ ...current, status: "No generated image available to save." }));
      return;
    }

    const reference: ReferenceItem = {
      id: `generated-${variant.id}`,
      title: variant.title,
      sourcePaper: "HiFigure output",
      venue: "Generated",
      year: new Date().getFullYear(),
      imageType: "generated figure",
      subject: prompt,
      styleTags: [variant.layoutStrategy],
      similarityReason: variant.description,
      thumbnail: "OUT",
      thumbnailUrl,
      structuralAnalysis: `Generated from the shared prompt using ${variant.layoutStrategy}.`,
    };

    setState((current) => {
      const upsert = (items: ReferenceItem[]) =>
        items.some((item) => item.id === reference.id)
          ? items.map((item) => (item.id === reference.id ? reference : item))
          : [...items, reference];

      return {
        ...current,
        references: upsert(current.references),
        board: upsert(current.board),
        layoutReferenceId: current.layoutReferenceId ?? reference.id,
        canvasGenerationReferenceIds: current.canvasGenerationReferenceIds.includes(reference.id)
          ? current.canvasGenerationReferenceIds
          : [...current.canvasGenerationReferenceIds, reference.id],
        canvasFocusReferenceId: reference.id,
        status: `${variant.title} saved to pocket.`,
      };
    });
  }

  function toggleStyleReference(reference: ReferenceItem, keepSelected = false) {
    setStylePreviewReference(null);
    setState((current) => {
      const selected = current.canvasFocusReferenceId === reference.id && !keepSelected;
      const activeCanvas =
        current.creativeCanvases.find((document) => document.id === current.activeCreativeCanvasId)?.canvas ??
        current.creativeCanvas;
      const nextCanvas = selected
        ? activeCanvas
        : fillStyleTemplateSlot(activeCanvas, reference.id);
      const previousId = current.activeStyleKit.sourceReferenceId;
      const next = {
        ...current,
        canvasFocusReferenceId: selected ? null : reference.id,
        activeStyleKit: updateStyleKitDraft(current.activeStyleKit, {
          sourceReferenceId: selected ? null : reference.id,
          sourceReferenceIds: selected
            ? current.activeStyleKit.sourceReferenceIds.filter((id) => id !== reference.id)
            : Array.from(new Set([...current.activeStyleKit.sourceReferenceIds, reference.id])),
        }),
        referenceUsage: selected
          ? current.referenceUsage
          : {
              ...current.referenceUsage,
              [reference.id]: {
                ...current.referenceUsage[reference.id],
                style: true,
              },
            },
        canvasGenerationReferenceIds:
          selected || current.canvasGenerationReferenceIds.includes(reference.id)
            ? current.canvasGenerationReferenceIds
            : [...current.canvasGenerationReferenceIds, reference.id],
        guidedDialogue: {
          ...current.guidedDialogue,
          currentSteps: { ...current.guidedDialogue.currentSteps, style: selected ? "reference" : "icon_extraction" },
          decisions: current.guidedDialogue.decisions.style
            ? {
                ...current.guidedDialogue.decisions,
                style: { ...current.guidedDialogue.decisions.style, status: "stale" as const },
              }
            : current.guidedDialogue.decisions,
        },
        ...(selected
          ? {}
          : updateActiveCreativeCanvasState(current, nextCanvas)),
        status: selected ? "Style reference selection cleared." : "Style reference selected.",
      };
      const tracked = withStyleKitItemEvent(
        next,
        selected ? "removed" : previousId && previousId !== reference.id ? "replaced" : "selected",
        "source",
        [reference.id],
        previousId,
      );
      const referenceTracked = selected
        ? tracked
        : appendStudyEvent(tracked, {
            stage: "references",
            type: "style_reference_selected",
            targetIds: [reference.id],
            result: previousId && previousId !== reference.id ? "replaced" : "selected",
            metadata: { sourceSurface: "style_workspace", previousId },
          });
      const staleTracked = current.guidedDialogue.decisions.style?.status === "current"
        ? appendStudyEvent(referenceTracked, {
            stage: "references",
            type: "narrator_decision_stale",
            targetIds: [current.guidedDialogue.decisions.style.id, reference.id],
            result: "style_reference_changed",
            metadata: { surface: "style" },
          })
        : referenceTracked;
      return appendStudyEvent(staleTracked, {
        stage: "references",
        type: "narrator_choice_selected",
        targetIds: [reference.id],
        result: selected ? "change_style" : "style_reference_selected",
        metadata: { surface: "style", previousId },
      });
    });
  }

  function toggleStyleKitFont(fontId: string) {
    const now = new Date().toISOString();
    setState((current) => {
      const storedFontIds = current.activeStyleKit.fontIds.length
        ? current.activeStyleKit.fontIds
        : current.activeStyleKit.fontId ? [current.activeStyleKit.fontId] : [];
      const currentFontIds = storedFontIds.filter((id) => figureFontReferences.some((font) => font.id === id));
      const selected = currentFontIds.includes(fontId);
      const replacedFontId = !selected && currentFontIds.length >= STYLE_FONT_CHOICE_LIMIT
        ? currentFontIds[0] ?? null
        : null;
      const fontIds = selected
        ? currentFontIds.filter((id) => id !== fontId)
        : replacedFontId
          ? [...currentFontIds.slice(1), fontId]
          : [...currentFontIds, fontId];
      const changedFont = figureFontReferences.find((font) => font.id === fontId) ?? null;
      const replacedFont = replacedFontId
        ? figureFontReferences.find((font) => font.id === replacedFontId) ?? null
        : null;
      const fontSources = { ...current.activeStyleKit.fontSources };
      if (selected) {
        delete fontSources[fontId];
      } else {
        if (replacedFontId) delete fontSources[replacedFontId];
        if (displayedStyleReference) {
          fontSources[fontId] = { sourceReferenceId: displayedStyleReference.id };
        }
      }
      return withStyleKitItemEvent({
        ...current,
        fontReferenceId:
          (selected && current.fontReferenceId === fontId) || current.fontReferenceId === replacedFontId
            ? null
            : current.fontReferenceId,
        activeStyleKit: updateStyleKitDraft(current.activeStyleKit, {
          fontIds,
          fontId: fontIds[0] ?? null,
          fontSources,
          sourceReferenceIds: !selected && displayedStyleReference
            ? Array.from(new Set([...current.activeStyleKit.sourceReferenceIds, displayedStyleReference.id]))
            : current.activeStyleKit.sourceReferenceIds,
        }, now),
        status: selected
          ? `${changedFont?.label ?? "Font"} removed; ${fontIds.length} font${fontIds.length === 1 ? "" : "s"} remain selected for Match.`
          : replacedFontId
            ? `${changedFont?.label ?? "Font"} replaced ${replacedFont?.label ?? "the earliest selection"}; 3 fonts remain selected for Match.`
          : `${changedFont?.label ?? "Font"} saved; ${fontIds.length} font${fontIds.length === 1 ? "" : "s"} selected for optional matching in Match.`,
      }, selected ? "removed" : replacedFontId ? "replaced" : "selected", "font", [fontId], replacedFontId);
    });
  }

  function toggleStyleKitPalette(palette: StyleKitPalette) {
    const now = new Date().toISOString();
    setState((current) => {
      const currentPalettes = current.activeStyleKit.palettes.length
        ? current.activeStyleKit.palettes
        : current.activeStyleKit.palette ? [current.activeStyleKit.palette] : [];
      const key = styleKitPaletteKey(palette);
      const selected = currentPalettes.some((candidate) => styleKitPaletteKey(candidate) === key);
      const palettes = selected
        ? currentPalettes.filter((candidate) => styleKitPaletteKey(candidate) !== key)
        : [...currentPalettes, { ...palette, colors: palette.colors.slice(0, 5) }];
      const primaryPalette = palettes[0] ?? null;
      const removingMatchedRegion = selected && current.matchedStylePalette
        ? styleKitPaletteKey(current.matchedStylePalette) === key
        : false;
      const removingMatchedPreset = selected && palette.kind === "preset" && current.paletteReferenceId === palette.id;
      return withStyleKitItemEvent({
        ...current,
        paletteReferenceId: removingMatchedPreset ? null : current.paletteReferenceId,
        matchedStylePalette: removingMatchedRegion ? null : current.matchedStylePalette,
        activeStyleKit: updateStyleKitDraft(current.activeStyleKit, {
          palettes,
          palette: primaryPalette,
          sourceReferenceIds: !selected && palette.sourceReferenceId
            ? Array.from(new Set([...current.activeStyleKit.sourceReferenceIds, palette.sourceReferenceId]))
            : current.activeStyleKit.sourceReferenceIds,
        }, now),
        status: selected
          ? `Palette removed; ${palettes.length} color choice${palettes.length === 1 ? "" : "s"} remain selected for Match.`
          : `Palette saved; ${palettes.length} color choice${palettes.length === 1 ? "" : "s"} selected for optional matching in Match.`,
      }, selected ? "removed" : "selected", "palette", [palette.id]);
    });
  }

  function confirmStyleKit() {
    if (!styleAppearanceReady) {
      setState((current) => ({
        ...current,
        status: "Select at least one color palette and one font before continuing.",
      }));
      return;
    }
    setState((current) => {
      const now = new Date().toISOString();
      const primaryStyleReferenceId = current.canvasFocusReferenceId ?? current.activeStyleKit.sourceReferenceId;
      const prepared = {
        ...current.activeStyleKit,
        sourceReferenceId: primaryStyleReferenceId,
        sourceReferenceIds: primaryStyleReferenceId
          ? Array.from(new Set([...current.activeStyleKit.sourceReferenceIds, primaryStyleReferenceId]))
          : current.activeStyleKit.sourceReferenceIds,
        updatedAt: now,
        confirmedAt: now,
        fingerprint: current.activeStyleKit.fingerprint,
      };
      const fingerprint = createStyleKitFingerprint(prepared);
      const matchedFontId = current.fontReferenceId && prepared.fontIds.includes(current.fontReferenceId)
        ? current.fontReferenceId
        : null;
      const matchedPresetPaletteId = current.paletteReferenceId && prepared.palettes.some(
        (palette) => palette.kind === "preset" && palette.id === current.paletteReferenceId,
      )
        ? current.paletteReferenceId
        : null;
      const matchedRegionPalette = current.matchedStylePalette
        ? prepared.palettes.find((palette) => styleKitPaletteKey(palette) === styleKitPaletteKey(current.matchedStylePalette!)) ?? null
        : null;
      const decision = {
        id: `narrator-style-${Date.now()}`,
        surface: "style" as const,
        stepId: "style:checkpoint",
        choiceId: "confirm_style_collection",
        summary: `${prepared.sourceReferenceId ? "Primary Style selected" : "No Primary Style"}; ${prepared.iconIds.length} Icon, ${prepared.fontIds.length} font, and ${prepared.palettes.length} palette selection(s).`,
        promptRevisionId: current.currentPromptRevisionId,
        layoutReferenceId: current.layoutReferenceId,
        skeletonId: current.selectedDiagramSkeletonId,
        styleReferenceId: prepared.sourceReferenceId,
        styleKitId: prepared.id,
        analysisStatus: "not_requested" as const,
        artifactFingerprint: createNarratorArtifactFingerprint({
          styleReferenceId: prepared.sourceReferenceId,
          styleKitFingerprint: fingerprint,
        }),
        status: "current" as const,
        createdAt: now,
      };
      const next = appendStudyEvent({
        ...current,
        activeStyleKit: { ...prepared, fingerprint },
        fontReferenceId: matchedFontId,
        paletteReferenceId: matchedPresetPaletteId,
        matchedStylePalette: matchedRegionPalette?.kind === "region" ? matchedRegionPalette : null,
        guidedDialogue: appendNarratorMessage(appendNarratorMessage({
          ...current.guidedDialogue,
          currentSteps: { ...current.guidedDialogue.currentSteps, style: "checkpoint" },
          completedStepIds: Array.from(new Set([...current.guidedDialogue.completedStepIds, "style:checkpoint"])),
          decisions: { ...current.guidedDialogue.decisions, style: decision },
        }, {
          surface: "style",
          speaker: "author",
          templateId: "style_collection_confirmed",
          summary: "Confirm this Style collection.",
          promptRevisionId: current.currentPromptRevisionId,
          referenceId: prepared.sourceReferenceId,
          artifactId: prepared.id,
          artifactFingerprint: fingerprint,
        }), {
          surface: "style",
          speaker: "assistant",
          templateId: "style_checkpoint_saved",
          summary: "Style collection confirmed. Icons, fonts, and colors can be matched next.",
          promptRevisionId: current.currentPromptRevisionId,
          referenceId: prepared.sourceReferenceId,
          artifactId: prepared.id,
          artifactFingerprint: fingerprint,
          tone: "success",
        }),
        status: "Style collection confirmed. Open Match to confirm the visual choices before generation.",
      }, {
        stage: "references",
        type: "style_kit_confirmed",
        targetIds: [
          ...prepared.sourceReferenceIds,
          ...prepared.regionIds,
          ...prepared.iconIds,
          ...prepared.fontIds,
          ...prepared.palettes.map((palette) => palette.id),
        ],
        result: fingerprint,
        metadata: {
          iconCount: prepared.iconIds.length,
          fontCount: prepared.fontIds.length,
          paletteCount: prepared.palettes.length,
          patternCount: prepared.patternIds.length,
          analysisStatus: "not_requested",
        },
      });
      return appendStudyEvent(next, {
        stage: "references",
        type: "narrator_decision_pinned",
        targetIds: [decision.id, ...prepared.sourceReferenceIds],
        result: decision.choiceId,
        metadata: {
          surface: "style",
          analysisStatus: decision.analysisStatus,
          scriptVersion: current.guidedDialogue.version,
        },
      });
    });
    onContinueToIcons?.();
  }

  useEffect(() => {
    if (!embedded || !onRegisterStageAction) return;
    onRegisterStageAction({
      meta: styleAppearanceReady
        ? `${activeStyleKit.iconIds.length} Icons · ${activeKitFontIds.length} fonts · ${activeKitPalettes.length} palettes`
        : "Select at least 1 color and 1 font to continue",
      primaryLabel: continueToStepLabel("icons"),
      onPrimary: () => confirmStyleKit(),
      disabled: !styleAppearanceReady,
      guideAnchor: "style-set-action",
    });
    // confirmStyleKit identity changes each render; register a stable wrapper instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeStyleKit.iconIds.length,
    activeKitFontIds.length,
    activeKitPalettes.length,
    embedded,
    onRegisterStageAction,
    styleAppearanceReady,
  ]);

  // Clear the registration only on unmount so effect re-runs with an unchanged
  // action signature never toggle the parent's registration through null.
  useEffect(() => {
    if (!embedded || !onRegisterStageAction) return;
    return () => onRegisterStageAction(null);
  }, [embedded, onRegisterStageAction]);

  function handleStyleCandidateClick(reference: ReferenceItem) {
    setStylePreviewReference(reference);
  }

  function selectEmbeddedStyle(reference: ReferenceItem) {
    if (canvasFocusReferenceId !== reference.id) toggleStyleReference(reference, true);
  }

  function createStyleIconDraft(referenceId: string): StyleIconDraft {
    const items = customIconReferences
      .filter((icon) => icon.sourceReferenceId === referenceId && Boolean(icon.cropDataUrl))
      .map((icon): StyleIconDraftItem => {
        const region = referenceRegions.find((candidate) => candidate.id === icon.sourceRegionId);
        return {
          id: `saved-${icon.id}`,
          existingIconId: icon.id,
          selected: activeStyleKit.iconIds.includes(icon.id),
          cropDataUrl: icon.cropDataUrl,
          label: icon.label,
          confidence: region?.detectedIcon?.confidence ?? null,
          bbox: region
            ? { x: region.x, y: region.y, w: region.w, h: region.h }
            : { x: 0, y: 0, w: 1, h: 1 },
        };
      });
    return { referenceId, items };
  }

  function openStyleDetail(reference: ReferenceItem) {
    setStylePreviewReference(reference);
    setStyleIconDraft(createStyleIconDraft(reference.id));
    setStyleIconExtractionStatus(null);
    setHasUnsavedExtractedIcons(false);
    setStyleDetailOpen(true);
  }

  function requestStyleDetailClose() {
    if (hasUnsavedExtractedIcons && !window.confirm(UNSAVED_EXTRACTED_ICONS_WARNING)) {
      return;
    }
    setHasUnsavedExtractedIcons(false);
    setStyleIconDraft(null);
    setStyleDetailOpen(false);
  }

  function handleEmbeddedStyleCardClick(reference: ReferenceItem) {
    openStyleDetail(reference);
  }

  function handleEmbeddedStyleUseClick(reference: ReferenceItem, event: MouseEvent) {
    event.stopPropagation();
    selectEmbeddedStyle(reference);
  }

  function handleEmbeddedStyleExtractClick(reference: ReferenceItem, event: MouseEvent) {
    event.stopPropagation();
    openStyleDetail(reference);
  }

  function addStyleIconCandidate(result: SamIconExtractionResult) {
    if (!displayedStyleReference) return;
    const referenceId = displayedStyleReference.id;
    const item: StyleIconDraftItem = {
      ...result,
      id: `draft-icon-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      selected: true,
      existingIconId: null,
    };
    setStyleIconDraft((current) => ({
      referenceId,
      items: [...(current?.referenceId === referenceId ? current.items : savedStyleIconDraftItems), item],
    }));
    setHasUnsavedExtractedIcons(true);
  }

  function toggleStyleIconCandidate(id: string) {
    if (!displayedStyleReference) return;
    const referenceId = displayedStyleReference.id;
    setStyleIconDraft((current) => ({
      referenceId,
      items: (current?.referenceId === referenceId ? current.items : savedStyleIconDraftItems).map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item,
      ),
    }));
    setHasUnsavedExtractedIcons(true);
  }

  function deleteStyleIconCandidate(id: string) {
    if (!displayedStyleReference) return;
    const referenceId = displayedStyleReference.id;
    setStyleIconDraft((current) => ({
      referenceId,
      items: (current?.referenceId === referenceId ? current.items : savedStyleIconDraftItems).filter(
        (item) => item.id !== id,
      ),
    }));
    setHasUnsavedExtractedIcons(true);
  }

  function commitStyleIconDraft() {
    if (!displayedStyleReference) return;
    const reference = displayedStyleReference;
    const items = styleIconDraftItems;
    const selectedItems = items.filter((item) => item.selected);
    const retainedExistingIds = new Set(items.flatMap((item) => item.existingIconId ? [item.existingIconId] : []));
    const selectedExistingIds = new Set(selectedItems.flatMap((item) => item.existingIconId ? [item.existingIconId] : []));
    setState((current) => {
      const existingForReference = current.customIconReferences.filter(
        (icon) => icon.sourceReferenceId === reference.id,
      );
      const scopedIconIds = new Set(existingForReference.map((icon) => icon.id));
      const scopedRegionIds = new Set(
        existingForReference.flatMap((icon) => icon.sourceRegionId ? [icon.sourceRegionId] : []),
      );
      const removedIcons = existingForReference.filter((icon) => !retainedExistingIds.has(icon.id));
      const removedRegionIds = new Set(removedIcons.flatMap((icon) => icon.sourceRegionId ? [icon.sourceRegionId] : []));
      let next = removedIcons.reduce(
        (working, icon) => removeCustomIconFromWorkspaceState(working, icon.id),
        current,
      );
      if (removedRegionIds.size) {
        next = {
          ...next,
          referenceRegions: next.referenceRegions.filter((region) => !removedRegionIds.has(region.id)),
          activeStyleKit: updateStyleKitDraft(next.activeStyleKit, {
            regionIds: next.activeStyleKit.regionIds.filter((regionId) => !removedRegionIds.has(regionId)),
          }),
        };
      }

      const selectedIconIds = new Set(selectedExistingIds);
      const selectedRegionIds = new Set(
        existingForReference.flatMap((icon) =>
          selectedExistingIds.has(icon.id) && icon.sourceRegionId ? [icon.sourceRegionId] : [],
        ),
      );
      const newItems = items.filter((item) => !item.existingIconId);
      newItems.forEach((item, index) => {
        const createdAt = new Date().toISOString();
        const label = item.label || `Extracted icon ${retainedExistingIds.size + index + 1}`;
        const stamp = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
        const regionId = `style-region-icon-sam-${stamp}`;
        const customIconId = `custom-icon-${regionId}`;
        const localIconId = inferIconReferenceId(reference, {
          id: regionId,
          referenceId: reference.id,
          intent: "style",
          ...item.bbox,
          label,
        });
        const tags = ["SAM2 extraction", "local mask", "extracted from style", localIconId];
        const region: ReferenceRegion = {
          id: regionId,
          referenceId: reference.id,
          intent: "style",
          ...item.bbox,
          label,
          iconEnabled: item.selected,
          suggestedIconId: localIconId,
          matchedPresetIconId: localIconId,
          ingredientAnalysisStatus: "local",
          selectedIconSource: "detected",
          customIconId,
          detectedIcon: {
            label,
            tags,
            description: "Transparent icon extracted locally with an interactive SAM2 mask.",
            cropDataUrl: item.cropDataUrl,
            bbox: item.bbox,
            matchedPresetIconId: localIconId,
            confidence: item.confidence,
            source: "image-crop",
          },
        };
        const customIcon: CustomIconReference = {
          id: customIconId,
          label,
          tags,
          description: "Transparent icon extracted locally from the selected style reference with SAM2.",
          cropDataUrl: item.cropDataUrl,
          sourceReferenceId: reference.id,
          sourceRegionId: regionId,
          kind: "icon",
          contentHash: workspaceIconContentHash(item.cropDataUrl),
          createdAt,
        };
        scopedIconIds.add(customIconId);
        scopedRegionIds.add(regionId);
        if (item.selected) {
          selectedIconIds.add(customIconId);
          selectedRegionIds.add(regionId);
        }
        next = appendStudyEvent({
          ...next,
          referenceRegions: [...next.referenceRegions, region],
          customIconReferences: [...next.customIconReferences, customIcon],
        }, {
          stage: "references",
          type: "custom_icon_extracted",
          targetIds: [customIconId, regionId, reference.id],
          result: item.selected ? "saved_selected" : "saved_unselected",
          metadata: { method: "sam2_local", confidence: item.confidence, selected: item.selected },
        });
      });

      const iconReferenceIds = Array.from(new Set([
        ...next.iconReferenceIds.filter((iconId) => !scopedIconIds.has(iconId)),
        ...selectedIconIds,
      ]));
      const nextIconReferenceId = next.iconReferenceId && !scopedIconIds.has(next.iconReferenceId)
        ? next.iconReferenceId
        : iconReferenceIds[0] ?? "robot";
      next = {
        ...next,
        referenceRegions: next.referenceRegions.map((region) =>
          region.customIconId && scopedIconIds.has(region.customIconId)
            ? { ...region, iconEnabled: selectedIconIds.has(region.customIconId) }
            : region,
        ),
        iconReferenceIds,
        iconReferenceId: nextIconReferenceId,
        activeStyleKit: updateStyleKitDraft(next.activeStyleKit, {
          iconIds: Array.from(new Set([
            ...next.activeStyleKit.iconIds.filter((iconId) => !scopedIconIds.has(iconId)),
            ...selectedIconIds,
          ])),
          regionIds: Array.from(new Set([
            ...next.activeStyleKit.regionIds.filter((regionId) => !scopedRegionIds.has(regionId)),
            ...selectedRegionIds,
          ])),
        }),
      };

      const unselectedCount = items.length - selectedItems.length;
      return appendStudyEvent({
        ...next,
        status: `Saved ${items.length} extracted icon${items.length === 1 ? "" : "s"}; ${selectedItems.length} selected for Match.`,
      }, {
        stage: "references",
        type: "style_icon_selection_confirmed",
        targetIds: [reference.id, ...selectedExistingIds],
        result: "confirmed",
        metadata: {
          keptCount: selectedItems.length,
          candidateCount: items.length,
          unselectedCount,
          removedCount: removedIcons.length,
        },
      });
    });
    setStyleIconDraft(null);
    setHasUnsavedExtractedIcons(false);
  }

  /** Each gallery card shows only the icons extracted from its own image. */
  function renderReferenceExtraction(referenceId: string) {
    const icons = customIconReferences.filter((icon) => icon.sourceReferenceId === referenceId);

    return (
      <div className="style-extracted-strip" aria-label="Extracted from this image">
        <div className="style-extracted-strip-head">
          <strong>Extracted from this image</strong>
          <span className="mono muted">{icons.length} icons</span>
        </div>
        {icons.length ? (
          <div className="style-extracted-strip-groups">
            <div className="style-extracted-group" aria-label="Extracted icons">
              <span className="style-extracted-group-label">Icons</span>
              <div className="style-extracted-icons">
                {icons.map((icon) => (
                  <figure key={icon.id} title={icon.label}>
                    {icon.cropDataUrl
                      ? <img src={icon.cropDataUrl} alt="" />
                      : <span aria-hidden="true">·</span>}
                    <figcaption>{icon.label}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="style-extracted-empty">
            Nothing extracted yet — open Extract icons and click an icon in this image.
          </p>
        )}
      </div>
    );
  }

  function renderStyleDetailPanel() {
    if (!displayedStyleReference) return null;
    return (
      <div className={`style-reference-stage is-${guidedDialogue.detailViews.style}`}>
        <div className="style-source-column" data-guide-anchor="style-extract-canvas">
          {imageUrl ? (
            <SamIconExtractor
              inline
              preload
              showStatus={false}
              imageSrc={imageUrl}
              sourceTitle={displayedStyleReference.title}
              onExtract={addStyleIconCandidate}
              onStatusChange={setStyleIconExtractionStatus}
            />
          ) : (
            <div className="style-reference-preview style-region-canvas" />
          )}
        </div>
        <div className="style-ingredients-panel">
          <section className="style-extract-section" aria-label="Icon choices">
            <header className="style-kit-choice-head">
              <div>
                <div className="style-icon-choice-title">
                  {styleIconExtractionStatus ? (
                    <span
                      className={`style-icon-inline-status${styleIconExtractionStatus.busy ? " is-busy" : ""}${styleIconExtractionStatus.error ? " is-error" : ""}`}
                      title={`${styleIconExtractionStatus.error ?? styleIconExtractionStatus.message}${styleIconExtractionStatus.device ? ` · ${styleIconExtractionStatus.device === "webgpu" ? "WebGPU" : "CPU/WASM"}` : ""}`}
                    >
                      <i aria-hidden="true" />
                      {styleIconExtractionStatus.error ? "Error" : styleIconExtractionStatus.busy ? "Loading" : "Ready"}
                    </span>
                  ) : null}
                  <strong>Icons from the image</strong>
                </div>
                <span>Click the image to add candidates. Select icons for Match, or delete only the ones you do not want to keep.</span>
              </div>
              <span className="badge">{selectedStyleIconCount} / {styleIconDraftItems.length}</span>
            </header>

            {styleIconDraftItems.length ? (
              <div className="sam-icon-extractor-review-grid" aria-label="Extracted icon candidates">
                {styleIconDraftItems.map((icon) => (
                  <div key={icon.id} className={`sam-icon-extractor-review-item${icon.selected ? " is-selected" : ""}`}>
                    <label className="sam-icon-extractor-review-choice">
                      <input
                        type="checkbox"
                        checked={icon.selected}
                        onChange={() => toggleStyleIconCandidate(icon.id)}
                        aria-label={`${icon.selected ? "Remove" : "Add"} ${icon.label} ${icon.selected ? "from" : "to"} Match`}
                      />
                      <img src={icon.cropDataUrl} alt="" title={icon.label} />
                      <span>{icon.confidence === null ? icon.label : `${Math.round(icon.confidence * 100)}%`}</span>
                    </label>
                    <button
                      type="button"
                      className="sam-icon-extractor-review-delete"
                      onClick={() => deleteStyleIconCandidate(icon.id)}
                      aria-label={`Delete ${icon.label}`}
                      title="Delete extracted icon"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : <p className="dashboard-empty">No extracted icons yet — click an icon on the left image.</p>}
          </section>

          <section className="style-extract-section" aria-label="Palette choices">
            <header className="style-kit-choice-head">
              <div>
                <strong>Colors</strong>
                <span>Required · select one or more palettes for Match.</span>
              </div>
              <span className="badge">{activeKitPalettes.length} selected</span>
            </header>
            <div className="style-kit-palette-grid">
              {extractedImagePalette ? (
                <button
                  type="button"
                  className={activeKitPalettes.some((palette) => styleKitPaletteKey(palette) === styleKitPaletteKey(extractedImagePalette)) ? "is-selected" : ""}
                  aria-pressed={activeKitPalettes.some((palette) => styleKitPaletteKey(palette) === styleKitPaletteKey(extractedImagePalette))}
                  onClick={() => toggleStyleKitPalette(extractedImagePalette)}
                >
                  <strong>Curated from this image</strong>
                  <small>
                    {activeKitPalettes.some((palette) => styleKitPaletteKey(palette) === styleKitPaletteKey(extractedImagePalette))
                      ? "Selected · 4 distinct colors"
                      : "4 distinct colors · background and duplicate shades removed"}
                  </small>
                  {renderStylePaletteSwatches(extractedImagePalette.colors)}
                </button>
              ) : stylePaletteLoadingReferenceId === displayedStyleReference.id ? (
                <p className="style-kit-extraction-status" role="status">Extracting a compact palette…</p>
              ) : null}
              {figurePaletteReferences.map((palette) => {
                const choice: StyleKitPalette = {
                  kind: "preset",
                  id: palette.id,
                  colors: palette.colors.slice(0, 5),
                  sourceReferenceId: displayedStyleReference.id,
                };
                const selected = activeKitPalettes.some(
                  (candidate) => styleKitPaletteKey(candidate) === styleKitPaletteKey(choice),
                );
                return (
                  <button
                    key={palette.id}
                    type="button"
                    className={selected ? "is-selected" : ""}
                    aria-pressed={selected}
                    onClick={() => toggleStyleKitPalette(choice)}
                  >
                    <strong>{palette.label}</strong>
                    <small>{selected ? `Selected · ${palette.tone}` : palette.tone}</small>
                    {renderStylePaletteSwatches(choice.colors)}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="style-extract-section" aria-label="Font choices">
            <header className="style-kit-choice-head">
              <div>
                <strong>Fonts</strong>
                <span>Required · select up to 3 current closest matches.</span>
              </div>
              <div className="style-kit-choice-actions">
                {displayedStyleAnalysis?.status === "failed" ? (
                  <button
                    type="button"
                    className="style-kit-analyze"
                    disabled={Boolean(styleFontAnalysisReferenceId)}
                    onClick={() => void analyzeStyleFontsFromImage(true)}
                  >
                    Retry
                  </button>
                ) : null}
                <span className="badge">{activeKitFontIds.length} / {STYLE_FONT_CHOICE_LIMIT}</span>
              </div>
            </header>
            <div className="style-kit-font-grid">
              {styleFontChoices.map((font) => {
                const selected = activeKitFontIds.includes(font.id);
                return (
                  <button
                    key={font.id}
                    type="button"
                    className={`${selected ? "is-selected" : ""}${font.suggested ? " is-suggested" : ""}`.trim()}
                    aria-pressed={selected}
                    onClick={() => toggleStyleKitFont(font.id)}
                  >
                    <div className="style-kit-font-preview">
                      <span style={{ fontFamily: font.cssFamily }}>Aa</span>
                      <strong>{font.label}</strong>
                    </div>
                    <small>
                      {selected
                        ? "Selected · click to remove"
                        : activeKitFontIds.length >= STYLE_FONT_CHOICE_LIMIT
                          ? "Click to replace earliest selection"
                          : "Click to select"}
                    </small>
                  </button>
                );
              })}
            </div>
          </section>

        </div>
      </div>
    );
  }

  useEffect(() => {
    if (!styleDetailOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (hasUnsavedExtractedIcons && !window.confirm(UNSAVED_EXTRACTED_ICONS_WARNING)) {
        return;
      }
      setHasUnsavedExtractedIcons(false);
      setStyleIconDraft(null);
      setStyleDetailOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasUnsavedExtractedIcons, styleDetailOpen]);

  useEffect(() => {
    if (!styleDetailOpen || !hasUnsavedExtractedIcons) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedExtractedIcons, styleDetailOpen]);

  return (
    <>
    <div className="page style-studio-page">
      <div className="page-inner style-studio-inner">
        <div className={`style-workflow-grid ${embedded ? "is-embedded" : ""}`}>
          {!embedded ? <details
            className={`style-picker style-source-strip ${disclosureStyles.sourceChooser}`}
            open={!activeReference || undefined}
          >
            <summary>
              <span className={disclosureStyles.sourceSummaryCopy}>
                <span className="label-text">Overall style source</span>
                <strong>{activeReference?.title ?? "Choose a reference"}</strong>
                <span>
                  {activeReference
                    ? "Primary source selected · open to replace"
                    : "Choose one source before collecting style details"}
                </span>
              </span>
              <span className="badge">{orderedStyleCandidates.length}</span>
            </summary>

            <div className={`layout-ref-list style-source-list ${disclosureStyles.sourceList}`}>
              {orderedStyleCandidates.length === 0 ? (
                <div className="results-list-empty">
                  <p>No style references yet.</p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      setState((current) => transitionStudyStage(current, "references", {
                        status: "Tag a reference with the Style role, then come back to compose.",
                      }))
                    }
                  >
                    Open reference search →
                  </button>
                </div>
              ) : (
                orderedStyleCandidates.map((item, index) => {
                  const selected = canvasFocusReferenceId === item.id;
                  return (
                    <article
                      key={item.id}
                      className={`layout-ref-card ${selected ? "is-selected" : ""}`}
                      onClick={() => handleStyleCandidateClick(item)}
                    >
                      <div className="layout-ref-thumb">
                        <span className="paper-card-fignum">Style {fignumLetter(index)}</span>
                        {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" /> : null}
                        {selected ? <span className="layout-ref-badge">Selected</span> : null}
                      </div>
                      <div className="layout-ref-body style-source-copy">
                        <h3>{item.title}</h3>
                        <p>{item.styleTags.slice(0, 3).join(" · ") || item.imageType}</p>
                      </div>
                      <div className="layout-ref-actions">
                        <button
                          type="button"
                          className={`btn btn-sm ${selected ? galleryStyles.referenceSelectButtonSelected : "btn-primary"}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleStyleReference(item);
                          }}
                          aria-pressed={selected}
                          title={selected ? "Clear selected style" : "Use this style"}
                        >
                          {selected ? "Selected for generation ✓" : "Select for generation"}
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </details> : null}

          <section className="style-stage">
            {/* Embedded Style is titled by the stage toolbar, and every card
                carries its own Use/Extract pair, so it needs no head here. */}
            {!embedded ? (
              <div className="layout-canvas-head">
                <div className="min-w-0">
                  <h2 className="h-section">Choose style references</h2>
                  <span className="mono muted">
                    {stylePreviewReference
                      ? `previewing "${stylePreviewReference.title}"`
                      : activeReference
                        ? `from "${activeReference.title}"`
                        : "choose a source above"}
                  </span>
                </div>
                {displayedStyleReference ? (
                  <button
                    type="button"
                    className={`btn ${canvasFocusReferenceId === displayedStyleReference.id ? galleryStyles.referenceSelectButtonSelected : "btn-primary"}`}
                    onClick={() => toggleStyleReference(displayedStyleReference)}
                    aria-pressed={canvasFocusReferenceId === displayedStyleReference.id}
                    title={canvasFocusReferenceId === displayedStyleReference.id
                      ? "Clear this Style reference"
                      : "Confirm this image as the Style reference"}
                  >
                    {canvasFocusReferenceId === displayedStyleReference.id ? "Selected for generation ✓" : "Select for generation"}
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="style-stage-body">
              {embedded ? (
                <>
                  {orderedStyleCandidates.length > 0 ? (
                    <div ref={embeddedGalleryScrollRef} className={`${galleryStyles.embeddedGalleryScroll} style-gallery-scroll`}>
                      <div className={galleryStyles.referenceGallery}>
                        {orderedStyleCandidates.map((item, index) => {
                          const selected = canvasFocusReferenceId === item.id;
                          const previewing = stylePreviewReference?.id === item.id && !selected;
                          const referenceImage = item.imageDataUrl?.trim() || item.thumbnailUrl?.trim() || null;
                          return (
                            <article
                              key={item.id}
                              ref={(node) => {
                                embeddedStyleCardRefs.current[item.id] = node;
                              }}
                              className={`${galleryStyles.referenceGroup} ${selected ? galleryStyles.referenceGroupSelected : ""} ${previewing ? galleryStyles.referenceGroupPreviewing : ""}`}
                            >
                              <div className={galleryStyles.referenceOverview}>
                                <button
                                  type="button"
                                  className={galleryStyles.referenceImageButton}
                                  onClick={() => handleEmbeddedStyleCardClick(item)}
                                  aria-label={`Preview style ${item.title}`}
                                >
                                  {referenceImage ? <img src={referenceImage} alt="" /> : <span>Style {fignumLetter(index)}</span>}
                                </button>
                                <div className={galleryStyles.referenceDetails}>
                                  <div className={galleryStyles.referenceMeta}>
                                    <span>Style {fignumLetter(index)}</span>
                                    {selected ? <b>Current source</b> : null}
                                  </div>
                                  <h3>{item.title}</h3>
                                  <p>{item.styleTags.slice(0, 3).join(" · ") || item.imageType}</p>
                                </div>
                                <div className={galleryStyles.referenceActions}>
                                  <button
                                    type="button"
                                    className={`btn ${selected ? galleryStyles.referenceSelectButtonSelected : "btn-primary"}`}
                                    onClick={(event) => handleEmbeddedStyleUseClick(item, event)}
                                    disabled={selected}
                                    aria-pressed={selected}
                                    title="Set this reference as the overall style source"
                                  >
                                    {selected ? "Selected for generation ✓" : "Select for generation"}
                                  </button>
                                  <button
                                    type="button"
                                    className={`btn btn-sm ${selected ? "btn-primary" : "btn-secondary"}`}
                                    onClick={(event) => handleEmbeddedStyleExtractClick(item, event)}
                                    title="Open icon, color, and font choices"
                                  >
                                    Extract from Style →
                                  </button>
                                </div>
                              </div>
                              {renderReferenceExtraction(item.id)}
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="layout-canvas-empty">
                      <p>Add references with the Style role in the References step, then select one style image here.</p>
                    </div>
                  )}
                </>
              ) : displayedStyleReference ? (
                renderStyleDetailPanel()
              ) : (
                <div className="layout-canvas-empty">
                  <p>Add references with the Style role in the References step, then select one style image here.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
    {embedded && styleDetailOpen && displayedStyleReference && typeof document !== "undefined" ? createPortal(
      <div
        className="style-detail-overlay"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) requestStyleDetailClose();
        }}
      >
        <section
          className="style-detail-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={`Extract style details from ${displayedStyleReference.title}`}
        >
          <header className="style-detail-dialog-head">
            <div>
              <span className="label-text">Extract from Style</span>
              <h2>{displayedStyleReference.title}</h2>
              <p>Extract reusable icons, then multi-select the color palettes and fonts you want to carry into Match.</p>
            </div>
          </header>
          <div className="style-detail-dialog-body">
            {renderStyleDetailPanel()}
          </div>
          <footer className="style-detail-dialog-foot">
            <span className="style-detail-selection-count" aria-live="polite">
              {selectedStyleIconCount} icon{selectedStyleIconCount === 1 ? "" : "s"} · {activeKitPalettes.length} color choice{activeKitPalettes.length === 1 ? "" : "s"} · {activeKitFontIds.length} font{activeKitFontIds.length === 1 ? "" : "s"} selected
            </span>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!styleAppearanceReady}
              onClick={() => {
                commitStyleIconDraft();
                setStyleDetailOpen(false);
              }}
            >
              Done
            </button>
          </footer>
        </section>
      </div>,
      document.body,
    ) : null}
    </>
  );
}
