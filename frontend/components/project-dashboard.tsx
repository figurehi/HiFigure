"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type DragEvent, type MouseEvent, type PointerEvent, type ReactNode, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import type { TLEditorSnapshot } from "tldraw";
import {
  generateDiagramSkeleton,
  generateVariants,
  refineDiagramSkeletonRegion,
  type VariantGenerationProgress,
} from "../lib/api";
import { appendFigureHistoryEntries, compareIdsForModifyHistory } from "../lib/figure-history";
import { resolveCandidatePreviewVariantId } from "../lib/candidate-preview-selection";
import { useModifyJobReconciler } from "../lib/modify-jobs";
import {
  createFirstGenerationManifest,
  firstGenerationSkeletonChanged,
  resolveFirstGenerationNodeIconBindings,
  resolveFirstGenerationReadiness,
  type FirstGenerationManifest,
} from "../lib/first-generation-manifest";
import { createDemoWorkspaceState } from "../lib/demo-seed";
import { svgPreviewDataUrl } from "../lib/evolve-artifact";
import { clearDrawioConnections, diagramPlanToDrawioXml, parseDrawioXmlToDiagramPlan, removeDrawioConnection } from "../lib/diagram-xml";
import { scrollGuideAnchorIntoView } from "../lib/guide-dom";
import {
  registrationToBarProps,
  stagePrimaryActionSignature,
  type StagePrimaryActionRegistration,
} from "../lib/stage-primary-action";
import { continueToStepLabel } from "../lib/idea-spark-flow";
import {
  figureFontReferences,
  figurePaletteReferences,
  scientificIconDataUrl,
  scientificIconReferences,
  scientificIconSvg,
  type FigureFontReferenceId,
} from "../lib/scientific-assets";
import {
  buildStyleAppearanceGenerationLines,
  createMatchedStyleAppearanceFingerprint,
} from "../lib/style-generation";
import {
  createSkeletonStyleApplication,
  createSkeletonStyleReferenceSet,
  normalizeSkeletonStyleApplications,
  normalizeStyleKit,
  pruneNodeColorBindingsForPlan,
  pruneNodeFontBindingsForPlan,
  pruneNodeIconBindingsForPlan,
} from "../lib/style-kit";
import { studyPhaseForStage, type StudyPhase } from "../lib/study-phase";
import {
  customIconKind,
  normalizeCustomIconReferences,
  removeCustomIconFromWorkspaceState,
  workspaceIconDataUrl,
} from "../lib/workspace-icon-assets";
import type {
  CustomIconReference,
  DiagramPlan,
  DiagramSkeletonCandidate,
  FigureVariant,
  ReferenceItem,
  SkeletonRegionRevision,
} from "../lib/types";
import {
  createDefaultIntentGraph,
  createInitialCreativeCanvasTemplate,
  type CreativeCanvasConfirmSnapshot,
  type CreativeCanvasDocument,
  type CreativeCanvasAssetKind,
  type CreativeCanvasItem,
  type CreativeCanvasReferenceRole,
  type CreativeCanvasTemplateKind,
  type IntentGraphEdge,
  type IntentGraphNode,
  type IntentGraphNodeType,
  appendNarratorMessage,
  appendStudyEvent,
  commitWorkingPromptRevision,
  createNarratorArtifactFingerprint,
  createPromptFingerprint,
  markNarratorMessagesStale,
  promptArtifactIsStale,
  reconcileIdeaHistory,
  removeVariantFromWorkspaceState,
  restoreIdeaHistoryNode,
  transitionStudyStage,
  updateActiveCreativeCanvasState,
  useWorkspaceState,
  type IdeaHistoryNode,
  type IdeaSnapshot,
  type IdeaSparkStepId,
} from "../lib/workspace-state";
import { StageActionBar, type StageActionBarProps } from "./stage-action-bar";
import { CanvasStudio } from "./canvas-studio";
import { CandidateStudio } from "./candidate-studio";
import { AnnotationCanvas, type AnnotationCanvasHandle } from "./annotation-canvas";
import { DrawioEmbed } from "./drawio-embed";
import {
  IdeaSparkNavigator,
  type IdeaSparkGenerationStatus,
} from "./idea-history-view";
import { FigureWorkbench } from "./figure-workbench";
import { LayoutStudio } from "./layout-studio";
import { LayoutPngPreview } from "./layout-png-preview";
import { MermaidDiagramPreview } from "./mermaid-diagram-preview";
import { ScientificStructurePanel } from "./scientific-structure-panel";
import { SkeletonPromptConfirmDialog } from "./skeleton-prompt-confirm-dialog";
import { JourneyTree } from "./journey-tree";
import { StyleKitSummary } from "./style-kit-summary";
import { SvgEditorStudio } from "./svg-editor-studio";
import dashboardSheetStyles from "./project-dashboard-workspace-sheet.module.css";

type DashboardStageId = "content" | "layout" | "style" | "icons" | "candidate" | "review";
type PocketRole = "layout" | "style";
type DrawerTab = PocketRole | "crops" | "icons" | "fonts" | "palettes";
type DrawerDragPayload =
  | { type: "reference"; referenceId: string; role: CreativeCanvasReferenceRole }
  | { type: "asset"; assetKind: CreativeCanvasAssetKind; assetId: string };
type GraphPortDirection = "input" | "output";
type PendingConnection = { nodeId: string; port: string; direction: GraphPortDirection } | null;
type GraphContextMenu =
  | { kind: "canvas"; x: number; y: number; canvasX: number; canvasY: number }
  | { kind: "node"; x: number; y: number; nodeId: string }
  | { kind: "edge"; x: number; y: number; edgeId: string }
  | null;
type CreativeCanvasContextMenu = {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
} | null;

type CanvasCompositionMode = "guided" | "locked_refine";

function dashboardStageForIdeaSparkStep(step: IdeaSparkStepId): DashboardStageId {
  if (step === "prompt" || step === "retrieval") return "content";
  if (step === "skeleton") return "layout";
  if (step === "edit") return "candidate";
  return step;
}

function ideaSparkStepFromHistoryNode(
  node: IdeaHistoryNode | undefined,
  snapshotSurface: IdeaSnapshot["studioSurface"] | undefined,
): IdeaSparkStepId {
  if (node?.kind === "edit" || snapshotSurface === "edit" || node?.kind === "candidate" || snapshotSurface === "candidate") {
    return "candidate";
  }
  if (node?.kind === "skeleton" || snapshotSurface === "skeleton") return "layout";
  if (snapshotSurface === "content") return "prompt";
  if (snapshotSurface === "layout") return "layout";
  if (snapshotSurface === "style") return "style";
  if (snapshotSurface === "icons") return "icons";
  if (snapshotSurface === "review") return "review";
  if (node?.kind === "root") return "prompt";
  return "prompt";
}

function ideaSparkStepForDashboardStage(
  stage: DashboardStageId,
  currentStep: IdeaSparkStepId,
): IdeaSparkStepId {
  if (stage !== "content") return stage;
  return currentStep === "retrieval" ? "retrieval" : "prompt";
}
type CanvasGenerationDraft = {
  items: CreativeCanvasItem[];
  baseOutputItem: CreativeCanvasItem | null;
  skeletonItem: CreativeCanvasItem | null;
  selectedStyleItem: CreativeCanvasItem | null;
  selectedStyleReference: ReferenceItem | null;
  skeletonCandidate: DiagramSkeletonCandidate | null;
  skeletonPlan: DiagramPlan | null;
  compositionMode: CanvasCompositionMode;
  referencesForGenerate: ReferenceItem[];
  orderedReferences: ReferenceItem[];
  baseReference: ReferenceItem | null;
  selectedReferenceId: string | null;
  promptText: string;
  selectedIconIds: string[];
  selectedFontIds: string[];
  selectedPaletteIds: string[];
  selectedFonts: (typeof figureFontReferences)[number][];
  selectedPalettes: (typeof figurePaletteReferences)[number][];
  selectedPaletteCues: string[];
};
type ConfirmSelectionItem = {
  id: string;
  item: CreativeCanvasItem;
  title: string;
  meta: string;
  imageUrl: string | null;
  colors: string[];
  tokens: string[];
};
type ConfirmCanvasPlacement = {
  selection: ConfirmSelectionItem;
  x: number;
  y: number;
  matchedNodeId: string | null;
};
type SelectionConfirmPosition = { itemId: string; x: number; y: number };
type SelectionConfirmSize = { itemId: string; w: number; h: number };
type SelectionConfirmArrow = { id: string; fromItemId: string; toNodeId: string; note: string };
type SelectionConfirmNote = { id: string; x: number; y: number; text: string };
type SelectionConfirmTool = "move" | "arrow" | "note";
type SelectionConfirmMode = "generated-image" | "skeleton-binding" | "reference-board";
type SelectionConfirmBindingKind = "icon" | "font" | "palette" | "reference" | "output";
type SelectionConfirmIconPlacement = "beside" | "replace";
type SelectionConfirmBinding = {
  id: string;
  referenceItemId: string;
  referenceTitle: string;
  targetNodeId: string;
  targetNodeLabel: string;
  kind: SelectionConfirmBindingKind;
  iconPlacement?: SelectionConfirmIconPlacement;
  note: string;
  x: number;
  y: number;
  source: "arrow" | "snap" | "move" | "mapping";
};

type FirstGenerationBundle = {
  draft: CanvasGenerationDraft;
  manifest: FirstGenerationManifest;
  automaticBindings: SelectionConfirmBinding[];
};
type GenerationConfirmation = {
  prompt: string;
};

const canvasTemplateMeta: Record<
  CreativeCanvasTemplateKind,
  { label: string; title: string; description: string }
> = {
  layout: {
    label: "Layout",
    title: "Layout reference slot",
    description: "Use this area for the figure whose spatial organization should guide the skeleton.",
  },
  style: {
    label: "Style",
    title: "Style reference slot",
    description: "Use this area for color, icon, typography, and visual rhythm references.",
  },
  skeleton: {
    label: "Skeleton",
    title: "Skeleton planning slot",
    description: "Generated or edited diagram layout belongs here before image generation.",
  },
  output: {
    label: "Output",
    title: "Generated figure slot",
    description: "The first generated result appears here, and edit/regenerate trails can extend rightward.",
  },
};

type GraphPortDefinition = {
  id: string;
  label: string;
  direction: GraphPortDirection;
};

type GraphNodeDefinition = {
  type: IntentGraphNodeType;
  title: string;
  description: string;
  inputs: GraphPortDefinition[];
  outputs: GraphPortDefinition[];
};

const graphNodeDefinitions: Record<IntentGraphNodeType, GraphNodeDefinition> = {
  prompt: {
    type: "prompt",
    title: "Prompt",
    description: "Text intent that describes the figure content.",
    inputs: [],
    outputs: [{ id: "prompt", label: "prompt", direction: "output" }],
  },
  referenceSearch: {
    type: "referenceSearch",
    title: "Reference Search",
    description: "Search and collect layout/style reference images.",
    inputs: [{ id: "prompt", label: "prompt", direction: "input" }],
    outputs: [{ id: "references", label: "references", direction: "output" }],
  },
  layoutReference: {
    type: "layoutReference",
    title: "Layout Reference",
    description: "Selected reference used for spatial organization.",
    inputs: [{ id: "references", label: "references", direction: "input" }],
    outputs: [{ id: "reference", label: "layout ref", direction: "output" }],
  },
  styleReference: {
    type: "styleReference",
    title: "Style Reference",
    description: "Selected reference used for visual language.",
    inputs: [{ id: "references", label: "references", direction: "input" }],
    outputs: [{ id: "reference", label: "style ref", direction: "output" }],
  },
  iconReference: {
    type: "iconReference",
    title: "Icon Reference",
    description: "Frontend symbol reference used for scientific icons and visual vocabulary.",
    inputs: [],
    outputs: [{ id: "reference", label: "icon ref", direction: "output" }],
  },
  fontReference: {
    type: "fontReference",
    title: "Font Reference",
    description: "Publication-safe typography reference for figure labels and annotations.",
    inputs: [],
    outputs: [{ id: "reference", label: "font ref", direction: "output" }],
  },
  skeletonGenerator: {
    type: "skeletonGenerator",
    title: "Skeleton Generator",
    description: "Creates the editable draw.io layout skeleton.",
    inputs: [
      { id: "prompt", label: "prompt", direction: "input" },
      { id: "layoutReference", label: "layout ref", direction: "input" },
    ],
    outputs: [{ id: "skeleton", label: "skeleton", direction: "output" }],
  },
  figureGenerator: {
    type: "figureGenerator",
    title: "Figure Generator",
    description: "Combines prompt, skeleton, and style into variants.",
    inputs: [
      { id: "prompt", label: "prompt", direction: "input" },
      { id: "skeleton", label: "skeleton", direction: "input" },
      { id: "styleReference", label: "style ref", direction: "input" },
      { id: "iconReference", label: "icon ref", direction: "input" },
      { id: "fontReference", label: "font ref", direction: "input" },
    ],
    outputs: [{ id: "variants", label: "variants", direction: "output" }],
  },
  output: {
    type: "output",
    title: "Output / Edit",
    description: "Select, edit, and export generated figures.",
    inputs: [{ id: "variants", label: "variants", direction: "input" }],
    outputs: [],
  },
};

const allowedGraphConnections = new Set([
  "prompt:prompt->skeletonGenerator:prompt",
  "prompt:prompt->figureGenerator:prompt",
  "referenceSearch:references->layoutReference:references",
  "referenceSearch:references->styleReference:references",
  "layoutReference:reference->skeletonGenerator:layoutReference",
  "skeletonGenerator:skeleton->figureGenerator:skeleton",
  "styleReference:reference->figureGenerator:styleReference",
  "iconReference:reference->figureGenerator:iconReference",
  "fontReference:reference->figureGenerator:fontReference",
  "figureGenerator:variants->output:variants",
]);

const graphPaletteTypes: IntentGraphNodeType[] = [
  "prompt",
  "referenceSearch",
  "layoutReference",
  "styleReference",
  "iconReference",
  "fontReference",
  "skeletonGenerator",
  "figureGenerator",
  "output",
];

const nodeWidth = 220;
const nodeHeight = 196;
const canvasWidth = 1620;
const canvasHeight = 760;
const creativeCanvasMinWidth = 1500;
const creativeCanvasRightPadding = 420;
const creativeCanvasMinHeight = 920;
const creativeCanvasBottomPadding = 360;
const nodeHeaderHeight = 42;
const nodeBodyPadding = 8;
const portRowHeight = 20;

function createInitialCanvasTemplateWithUniqueIds(index: number): CreativeCanvasItem[] {
  const prefix = `canvas-${index}`;
  return createInitialCreativeCanvasTemplate().map((item) => ({
    ...item,
    id: item.id.replace("canvas", prefix),
  }));
}

function getPocketFilterTags(item: ReferenceItem) {
  const tags = [item.imageType, ...item.styleTags].filter(Boolean);
  return Array.from(new Set(tags));
}

function makeCanvasItemId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

function normalizeCanvasIconAssetId(id: string | null | undefined) {
  return id?.startsWith("hichart-custom-icon-") ? id.slice("hichart-custom-icon-".length) : id;
}

function isStyleCropReference(icon: CustomIconReference | null | undefined) {
  return icon ? customIconKind(icon) === "style-crop" : false;
}

function scientificIconReferenceItem(
  icon: (typeof scientificIconReferences)[number],
  similarityReason = "Selected icon asset for semantic glyph guidance.",
): ReferenceItem {
  const imageDataUrl = scientificIconDataUrl(icon.id);
  return {
    id: `hichart-icon-${icon.id}`,
    title: `${icon.label} icon reference`,
    sourcePaper: "HiChart asset library",
    venue: "Canvas icon asset",
    year: new Date().getFullYear(),
    imageType: "scientific icon reference",
    subject: icon.description,
    styleTags: ["icon", icon.role, icon.id],
    similarityReason,
    thumbnail: icon.label.slice(0, 3).toUpperCase(),
    thumbnailUrl: imageDataUrl,
    imageDataUrl,
    structuralAnalysis: icon.description,
  };
}

function canvasIconAssetMatches(sourceId: string | null | undefined, targetId: string | null | undefined) {
  if (!sourceId || !targetId) return false;
  return sourceId === targetId || normalizeCanvasIconAssetId(sourceId) === normalizeCanvasIconAssetId(targetId);
}

function canvasItemTilt(id: string) {
  const sum = Array.from(id).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return ((sum % 7) - 3) * 0.45;
}

function canvasItemShape(id: string) {
  const sum = Array.from(id).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return sum % 3;
}

function fontPocketPreview(fontId: string) {
  if (fontId === "code" || fontId === "denseMono") return { primary: "x1 -> f(x)", secondary: "token_042", weight: 700, size: 19 };
  if (["serif", "annotation", "caption", "callout", "equation"].includes(fontId)) {
    return { primary: "Evidence Flow", secondary: "alpha + beta", weight: 650, size: 21 };
  }
  if (fontId === "title" || fontId === "poster" || fontId === "slide") return { primary: "METHOD", secondary: "Large figure title", weight: 900, size: 23 };
  if (fontId === "axis" || fontId === "legend" || fontId === "panel") return { primary: "A  B  C", secondary: "small labels", weight: 850, size: 22 };
  return { primary: "Input -> Model", secondary: "module label", weight: 760, size: 20 };
}

function getNodeStatusLabel(node: IntentGraphNode, ready: boolean) {
  if (node.status === "running") return "running";
  if (node.status === "error") return "error";
  return ready ? "ready" : "idle";
}

function getNodePortAnchor(node: IntentGraphNode, portId: string, side: GraphPortDirection) {
  const definition = graphNodeDefinitions[node.type];
  const ports = side === "input" ? definition.inputs : definition.outputs;
  const index = Math.max(0, ports.findIndex((port) => port.id === portId));
  const baseY =
    side === "input"
      ? node.y + nodeHeaderHeight + nodeBodyPadding
      : node.y + Math.max(nodeHeight - nodeBodyPadding - portRowHeight * ports.length, nodeHeaderHeight + nodeBodyPadding);
  return {
    x: node.x + (side === "output" ? nodeWidth : 0),
    y: baseY + index * portRowHeight + portRowHeight / 2,
  };
}

function getPortKey(nodeId: string, portId: string, direction: GraphPortDirection) {
  return `${nodeId}:${direction}:${portId}`;
}

async function imageUrlToDataUrl(url: string): Promise<string | null> {
  if (url.startsWith("data:image/svg+xml")) {
    return await svgDataUrlToPngDataUrl(url);
  }
  if (url.startsWith("data:image/")) {
    return url;
  }
  try {
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

function isPublicHttpImageUrl(url: string | null | undefined) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) return false;
    if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

async function svgDataUrlToPngDataUrl(svgDataUrl: string, size = 512): Promise<string | null> {
  try {
    const image = new Image();
    image.decoding = "async";
    image.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("SVG icon could not be rasterized."));
      image.src = svgDataUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(image, 0, 0, size, size);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function escapeSvgText(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapSvgLines(text: string, maxChars = 18) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function decodeDrawioText(text: string) {
  if (typeof document === "undefined") return text;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

function stripDrawioLabel(text: string) {
  return decodeDrawioText(text)
    .replace(/<\s*br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDrawioStyle(style: string) {
  const map = new Map<string, string>();
  style.split(";").forEach((part) => {
    if (!part) return;
    const [key, ...rest] = part.split("=");
    if (!key) return;
    map.set(key, rest.length ? rest.join("=") : "1");
  });
  return map;
}

function drawioColor(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  if (value === "none") return "none";
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return value;
  return fallback;
}

function drawioNumber(value: string | undefined, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function drawioXmlToConfirmSvg(xml: string | null | undefined, fallbackPlan: DiagramPlan, width: number, height: number) {
  if (!xml || typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return null;
  const model = doc.querySelector("mxGraphModel");
  const root = model?.querySelector("root");
  if (!model || !root) return null;

  const pageWidth = Number(model.getAttribute("pageWidth")) || fallbackPlan.width || width;
  const pageHeight = Number(model.getAttribute("pageHeight")) || fallbackPlan.height || height;
  const cells = Array.from(root.querySelectorAll("mxCell"));
  const cellById = new Map(cells.map((cell) => [cell.getAttribute("id") ?? "", cell] as const));
  const childParentIds = new Set(
    cells
      .map((cell) => cell.getAttribute("parent"))
      .filter((parent): parent is string => Boolean(parent && parent !== "0" && parent !== "1")),
  );
  const geomCache = new Map<string, { x: number; y: number; w: number; h: number }>();

  const geometryForCell = (cell: Element): { x: number; y: number; w: number; h: number } => {
    const id = cell.getAttribute("id") ?? "";
    const cached = geomCache.get(id);
    if (cached) return cached;
    const geometry = cell.querySelector("mxGeometry");
    const parentId = cell.getAttribute("parent");
    const parent = parentId && parentId !== "0" && parentId !== "1" ? cellById.get(parentId) : null;
    const parentGeometry = parent?.getAttribute("vertex") === "1" ? geometryForCell(parent) : { x: 0, y: 0, w: 0, h: 0 };
    const rect = {
      x: parentGeometry.x + drawioNumber(geometry?.getAttribute("x") ?? undefined, 0),
      y: parentGeometry.y + drawioNumber(geometry?.getAttribute("y") ?? undefined, 0),
      w: drawioNumber(geometry?.getAttribute("width") ?? undefined, 120),
      h: drawioNumber(geometry?.getAttribute("height") ?? undefined, 56),
    };
    geomCache.set(id, rect);
    return rect;
  };

  const vertexCells = cells.filter((cell) => {
    const id = cell.getAttribute("id");
    return id && id !== "0" && id !== "1" && cell.getAttribute("vertex") === "1";
  });
  const edgeCells = cells.filter((cell) => cell.getAttribute("edge") === "1");
  const groups = vertexCells.filter((cell) => {
    const style = cell.getAttribute("style") ?? "";
    return childParentIds.has(cell.getAttribute("id") ?? "") || style.includes("container=1") || style.includes("fillOpacity=35");
  });
  const ordinaryVertices = vertexCells.filter((cell) => !groups.includes(cell));
  const vertexRects = vertexCells.map((cell) => geometryForCell(cell));
  const viewPadding = 48;
  const contentMinX = vertexRects.length ? Math.min(...vertexRects.map((rect) => rect.x)) : 0;
  const contentMinY = vertexRects.length ? Math.min(...vertexRects.map((rect) => rect.y)) : 0;
  const contentMaxX = vertexRects.length ? Math.max(...vertexRects.map((rect) => rect.x + rect.w)) : pageWidth;
  const contentMaxY = vertexRects.length ? Math.max(...vertexRects.map((rect) => rect.y + rect.h)) : pageHeight;
  const viewX = contentMinX - viewPadding;
  const viewY = contentMinY - viewPadding;
  const viewWidth = Math.max(1, contentMaxX - contentMinX + viewPadding * 2);
  const viewHeight = Math.max(1, contentMaxY - contentMinY + viewPadding * 2);

  const renderText = (label: string, rect: { x: number; y: number; w: number; h: number }, style: Map<string, string>, group: boolean) => {
    if (!label) return "";
    const fontSize = drawioNumber(style.get("fontSize"), group ? 14 : 12);
    const fontColor = drawioColor(style.get("fontColor"), "#1f2933");
    const fontStyle = Number(style.get("fontStyle") ?? "0");
    const fontWeight = (fontStyle & 1) === 1 || group ? 700 : 500;
    const fontStyleCss = (fontStyle & 2) === 2 ? "italic" : "normal";
    const align = style.get("align") === "left" ? "start" : style.get("align") === "right" ? "end" : "middle";
    const x =
      align === "start"
        ? rect.x + drawioNumber(style.get("spacingLeft"), group ? 10 : 8)
        : align === "end"
          ? rect.x + rect.w - drawioNumber(style.get("spacingRight"), 8)
          : rect.x + rect.w / 2;
    const verticalTop = group || style.get("verticalAlign") === "top";
    const lines = wrapSvgLines(label, group ? Math.max(18, Math.floor(rect.w / 8)) : Math.max(10, Math.floor(rect.w / 9)));
    const lineHeight = fontSize + 3;
    const y = verticalTop
      ? rect.y + drawioNumber(style.get("spacingTop"), group ? 18 : 12)
      : rect.y + rect.h / 2 - ((lines.length - 1) * lineHeight) / 2;
    return lines
      .map((line, index) =>
        `<text x="${x}" y="${y + index * lineHeight}" text-anchor="${align}" dominant-baseline="${verticalTop ? "hanging" : "middle"}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-style="${fontStyleCss}" font-weight="${fontWeight}" fill="${fontColor}">${escapeSvgText(line)}</text>`,
      )
      .join("");
  };

  const renderVertex = (cell: Element, group: boolean) => {
    const rect = geometryForCell(cell);
    const style = parseDrawioStyle(cell.getAttribute("style") ?? "");
    const label = stripDrawioLabel(cell.getAttribute("value") ?? "");
    if (style.has("text") || (cell.getAttribute("style") ?? "").startsWith("text;")) {
      return `<g>${renderText(label, rect, style, false)}</g>`;
    }
    const fill = drawioColor(style.get("fillColor"), group ? "#ffffff" : "#f8fafc");
    const stroke = drawioColor(style.get("strokeColor"), group ? "#7a808a" : "#8b97a8");
    const strokeWidth = drawioNumber(style.get("strokeWidth"), group ? 1.6 : 1.2);
    const fillOpacity = drawioNumber(style.get("fillOpacity"), 100) / 100;
    const rounded = style.get("rounded") !== "0";
    const isEllipse = (cell.getAttribute("style") ?? "").includes("ellipse");
    const dash = style.get("dashed") === "1" || group ? ' stroke-dasharray="7 5"' : "";
    const shape = isEllipse
      ? `<ellipse cx="${rect.x + rect.w / 2}" cy="${rect.y + rect.h / 2}" rx="${rect.w / 2}" ry="${rect.h / 2}" fill="${fill}" fill-opacity="${fill === "none" ? 0 : fillOpacity}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}/>`
      : `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" rx="${rounded ? Math.min(14, Math.max(5, rect.h * 0.16)) : 0}" fill="${fill}" fill-opacity="${fill === "none" ? 0 : fillOpacity}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}/>`;
    return `<g>${shape}${renderText(label, rect, style, group)}</g>`;
  };

  const renderEdge = (cell: Element) => {
    const source = cellById.get(cell.getAttribute("source") ?? "");
    const target = cellById.get(cell.getAttribute("target") ?? "");
    if (!source || !target) return "";
    const sourceRect = geometryForCell(source);
    const targetRect = geometryForCell(target);
    const style = parseDrawioStyle(cell.getAttribute("style") ?? "");
    const stroke = drawioColor(style.get("strokeColor"), "#5b6f8f");
    const strokeWidth = drawioNumber(style.get("strokeWidth"), 1.5);
    const dashed = style.get("dashed") === "1" ? ' stroke-dasharray="6 5"' : "";
    const sx = sourceRect.x + sourceRect.w / 2;
    const sy = sourceRect.y + sourceRect.h / 2;
    const tx = targetRect.x + targetRect.w / 2;
    const ty = targetRect.y + targetRect.h / 2;
    const midX = (sx + tx) / 2;
    return `<path d="M ${sx} ${sy} L ${midX} ${sy} L ${midX} ${ty} L ${tx} ${ty}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"${dashed} marker-end="url(#drawio-confirm-arrow)"/>`;
  };

  const gridSize = Number(model.getAttribute("gridSize")) || 10;
  const content = [
    ...groups.map((cell) => renderVertex(cell, true)),
    ...edgeCells.map(renderEdge),
    ...ordinaryVertices.map((cell) => renderVertex(cell, false)),
  ].join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewX} ${viewY} ${viewWidth} ${viewHeight}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Draw.io skeleton preview">
    <defs>
      <pattern id="drawio-confirm-grid" width="${gridSize}" height="${gridSize}" patternUnits="userSpaceOnUse"><path d="M ${gridSize} 0 L 0 0 0 ${gridSize}" fill="none" stroke="#eef1f5" stroke-width="0.8"/></pattern>
      <marker id="drawio-confirm-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#5b6f8f"/></marker>
    </defs>
    <rect x="${viewX}" y="${viewY}" width="${viewWidth}" height="${viewHeight}" fill="#ffffff"/>
    <rect x="${viewX}" y="${viewY}" width="${viewWidth}" height="${viewHeight}" fill="url(#drawio-confirm-grid)"/>
    ${content}
  </svg>`;
}

async function svgMarkupToPngDataUrl(svg: string, width: number, height: number): Promise<string | null> {
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Control board could not be rasterized."));
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

async function hydrateReferenceImages(references: ReferenceItem[]): Promise<ReferenceItem[]> {
  return Promise.all(
    references.map(async (reference) => {
      if (!reference.thumbnailUrl) return reference;
      if (isPublicHttpImageUrl(reference.thumbnailUrl)) {
        return { ...reference, imageDataUrl: null };
      }
      const imageDataUrl = await imageUrlToDataUrl(reference.thumbnailUrl);
      return imageDataUrl ? { ...reference, imageDataUrl } : reference;
    }),
  );
}

function createBlankDrawioXml() {
  return `<mxfile host="app.diagrams.net"><diagram id="blank-layout" name="Page-1"><mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="900" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`;
}

function InspectorActions({
  primary,
  secondary,
  danger,
}: {
  primary?: ReactNode;
  secondary?: ReactNode;
  danger?: ReactNode;
}) {
  return (
    <div className="creative-inspector-actions">
      {primary ? <div className="creative-inspector-primary">{primary}</div> : null}
      {secondary ? <div className="creative-inspector-secondary">{secondary}</div> : null}
      {danger ? <div className="creative-inspector-danger">{danger}</div> : null}
    </div>
  );
}

function ReferenceConfirmBoard({
  placements,
  width,
  height,
  tool,
  activeItemId,
  positions,
  sizes,
  notes,
  setActiveItemId,
  setPositions,
  setSizes,
  setNotes,
}: {
  placements: ConfirmCanvasPlacement[];
  width: number;
  height: number;
  tool: SelectionConfirmTool;
  activeItemId: string | null;
  positions: SelectionConfirmPosition[];
  sizes: SelectionConfirmSize[];
  notes: SelectionConfirmNote[];
  setActiveItemId: Dispatch<SetStateAction<string | null>>;
  setPositions: Dispatch<SetStateAction<SelectionConfirmPosition[]>>;
  setSizes: Dispatch<SetStateAction<SelectionConfirmSize[]>>;
  setNotes: Dispatch<SetStateAction<SelectionConfirmNote[]>>;
}) {
  const [dragging, setDragging] = useState<{ itemId: string; dx: number; dy: number } | null>(null);
  const [resizing, setResizing] = useState<{ itemId: string; startX: number; startY: number; startW: number; startH: number } | null>(null);
  const positionById = new Map(positions.map((position) => [position.itemId, position] as const));
  const sizeById = new Map(sizes.map((size) => [size.itemId, size] as const));
  const placementById = new Map(placements.map((placement) => [placement.selection.id, placement] as const));

  const defaultCardSize = (placement: ConfirmCanvasPlacement) => ({
    w: placement.selection.item.assetKind === "palette" ? 148 : placement.selection.imageUrl ? 136 : 152,
    h: placement.selection.imageUrl ? 112 : 82,
  });
  const cardSize = (placement: ConfirmCanvasPlacement) => sizeById.get(placement.selection.id) ?? defaultCardSize(placement);
  const placementPosition = (placement: ConfirmCanvasPlacement) =>
    positionById.get(placement.selection.id) ?? { itemId: placement.selection.id, x: placement.x, y: placement.y };
  const updatePosition = (itemId: string, x: number, y: number) => {
    setPositions((current) => [...current.filter((position) => position.itemId !== itemId), { itemId, x: Math.round(x), y: Math.round(y) }]);
  };
  const updateSize = (itemId: string, w: number, h: number) => {
    setSizes((current) => [...current.filter((size) => size.itemId !== itemId), { itemId, w: Math.round(w), h: Math.round(h) }]);
  };
  const addNote = (x: number, y: number) => {
    setNotes((current) => [...current, { id: `note-${Date.now()}`, x: Math.round(x), y: Math.round(y), text: "" }]);
  };
  const updateNote = (noteId: string, text: string) => {
    setNotes((current) => current.map((note) => (note.id === noteId ? { ...note, text } : note)));
  };
  const removeNote = (noteId: string) => {
    setNotes((current) => current.filter((note) => note.id !== noteId));
  };

  const onCanvasPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (resizing) {
      const placement = placementById.get(resizing.itemId);
      if (!placement) return;
      const position = placementPosition(placement);
      const minSize = placement.selection.item.assetKind === "icon" ? 54 : 82;
      const maxW = Math.min(280, width - position.x - 12);
      const maxH = Math.min(240, height - position.y - 12);
      const nextW = Math.min(maxW, Math.max(minSize, resizing.startW + event.clientX - resizing.startX));
      const nextH = Math.min(maxH, Math.max(minSize, resizing.startH + event.clientY - resizing.startY));
      if (placement.selection.item.assetKind === "icon") {
        const side = Math.min(maxW, maxH, Math.max(minSize, Math.max(nextW, nextH)));
        updateSize(resizing.itemId, side, side);
      } else {
        updateSize(resizing.itemId, nextW, nextH);
      }
      return;
    }
    if (!dragging) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = placementById.get(dragging.itemId);
    if (!placement) return;
    const size = cardSize(placement);
    const x = Math.min(width - size.w - 12, Math.max(12, event.clientX - rect.left - dragging.dx));
    const y = Math.min(height - size.h - 12, Math.max(12, event.clientY - rect.top - dragging.dy));
    updatePosition(dragging.itemId, x, y);
  };
  const onCanvasPointerUp = () => {
    setDragging(null);
    setResizing(null);
  };

  return (
    <div
      className={`selection-confirm-canvas selection-confirm-reference-board selection-confirm-canvas-tool-${tool}`}
      style={{ width, height }}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={onCanvasPointerUp}
      onPointerLeave={onCanvasPointerUp}
      onClick={(event) => {
        if (tool !== "note") return;
        const target = event.target as Element | null;
        if (target?.closest?.(".selection-confirm-ref-card, .selection-confirm-note")) return;
        const rect = event.currentTarget.getBoundingClientRect();
        addNote(event.clientX - rect.left, event.clientY - rect.top);
      }}
    >
      <div className="selection-confirm-reference-board-grid" aria-hidden="true" />
      <div className="selection-confirm-card-layer">
        {placements.map((placement) => {
          const position = placementPosition(placement);
          const size = cardSize(placement);
          const active = activeItemId === placement.selection.id;
          const resizable = placement.selection.item.type === "asset" && placement.selection.item.assetKind === "icon";
          const visualOnlyIcon = placement.selection.item.type === "asset" && placement.selection.item.assetKind === "icon";
          return (
            <button
              key={placement.selection.id}
              type="button"
              className={`selection-confirm-ref-card ${active ? "is-active" : ""} is-${placement.selection.item.assetKind ?? placement.selection.item.type}`}
              style={{ left: position.x, top: position.y, width: size.w, height: size.h }}
              onPointerDown={(event) => {
                event.stopPropagation();
                setActiveItemId(placement.selection.id);
                const rect = event.currentTarget.getBoundingClientRect();
                setDragging({ itemId: placement.selection.id, dx: event.clientX - rect.left, dy: event.clientY - rect.top });
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
            >
              {placement.selection.imageUrl ? <img src={placement.selection.imageUrl} alt="" /> : null}
              {placement.selection.colors.length > 0 ? (
                <span className="selection-confirm-card-palette">
                  {placement.selection.colors.map((color) => (
                    <i key={color} style={{ background: color }} />
                  ))}
                </span>
              ) : null}
              {!placement.selection.imageUrl && placement.selection.colors.length === 0 ? (
                <span className="selection-confirm-card-title">{placement.selection.title}</span>
              ) : null}
              {!visualOnlyIcon ? <small>{placement.selection.item.assetKind ?? placement.selection.item.type}</small> : null}
              {resizable ? (
                <span
                  className="selection-confirm-card-resize"
                  title="Resize icon"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    setActiveItemId(placement.selection.id);
                    setResizing({
                      itemId: placement.selection.id,
                      startX: event.clientX,
                      startY: event.clientY,
                      startW: size.w,
                      startH: size.h,
                    });
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="selection-confirm-note-layer">
        {notes.map((note) => (
          <div
            key={note.id}
            className="selection-confirm-note"
            style={{ left: note.x, top: note.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <textarea
              value={note.text}
              placeholder="Type note..."
              onChange={(event) => updateNote(note.id, event.target.value)}
              autoFocus={!note.text}
            />
            <button type="button" onClick={() => removeNote(note.id)} aria-label="Remove note">
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SelectionConfirmCanvas({
  plan,
  skeletonSvgMarkup,
  placements,
  width,
  height,
  tool,
  activeItemId,
  pendingArrowItemId,
  positions,
  sizes,
  arrows,
  notes,
  setTool,
  setActiveItemId,
  setPendingArrowItemId,
  setPositions,
  setSizes,
  setArrows,
  setNotes,
}: {
  plan: DiagramPlan;
  skeletonSvgMarkup: string | null;
  placements: ConfirmCanvasPlacement[];
  width: number;
  height: number;
  tool: SelectionConfirmTool;
  activeItemId: string | null;
  pendingArrowItemId: string | null;
  positions: SelectionConfirmPosition[];
  sizes: SelectionConfirmSize[];
  arrows: SelectionConfirmArrow[];
  notes: SelectionConfirmNote[];
  setTool: Dispatch<SetStateAction<SelectionConfirmTool>>;
  setActiveItemId: Dispatch<SetStateAction<string | null>>;
  setPendingArrowItemId: Dispatch<SetStateAction<string | null>>;
  setPositions: Dispatch<SetStateAction<SelectionConfirmPosition[]>>;
  setSizes: Dispatch<SetStateAction<SelectionConfirmSize[]>>;
  setArrows: Dispatch<SetStateAction<SelectionConfirmArrow[]>>;
  setNotes: Dispatch<SetStateAction<SelectionConfirmNote[]>>;
}) {
  const [dragging, setDragging] = useState<{ itemId: string; dx: number; dy: number } | null>(null);
  const [resizing, setResizing] = useState<{ itemId: string; startX: number; startY: number; startW: number; startH: number } | null>(null);
  const [arrowPointer, setArrowPointer] = useState<{ x: number; y: number } | null>(null);
  const scale = width / Math.max(1, plan.width);
  const positionById = new Map(positions.map((position) => [position.itemId, position] as const));
  const sizeById = new Map(sizes.map((size) => [size.itemId, size] as const));
  const placementById = new Map(placements.map((placement) => [placement.selection.id, placement] as const));
  const nodeById = new Map(plan.nodes.map((node) => [node.id, node] as const));

  const placementPosition = (placement: ConfirmCanvasPlacement) =>
    positionById.get(placement.selection.id) ?? { itemId: placement.selection.id, x: placement.x, y: placement.y };
  const defaultCardSize = (placement: ConfirmCanvasPlacement) => ({
    w: placement.selection.item.assetKind === "palette" ? 132 : placement.selection.imageUrl ? 110 : 126,
    h: placement.selection.imageUrl ? 94 : 68,
  });
  const cardSize = (placement: ConfirmCanvasPlacement) => sizeById.get(placement.selection.id) ?? defaultCardSize(placement);
  const updatePosition = (itemId: string, x: number, y: number) => {
    setPositions((current) => {
      const next = current.filter((position) => position.itemId !== itemId);
      next.push({ itemId, x: Math.round(x), y: Math.round(y) });
      return next;
    });
  };
  const updateSize = (itemId: string, w: number, h: number) => {
    setSizes((current) => {
      const next = current.filter((size) => size.itemId !== itemId);
      next.push({ itemId, w: Math.round(w), h: Math.round(h) });
      return next;
    });
  };
  const addArrow = (fromItemId: string, toNodeId: string) => {
    setArrows((current) => {
      const withoutSame = current.filter((arrow) => !(arrow.fromItemId === fromItemId && arrow.toNodeId === toNodeId));
      return [...withoutSame, { id: `arrow-${Date.now()}`, fromItemId, toNodeId, note: "" }];
    });
    setPendingArrowItemId(null);
    setArrowPointer(null);
    setActiveItemId(fromItemId);
    setTool("move");
  };
  const addNote = (x: number, y: number) => {
    setNotes((current) => [...current, { id: `note-${Date.now()}`, x: Math.round(x), y: Math.round(y), text: "" }]);
  };

  const onCanvasPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (tool === "arrow" && pendingArrowItemId) {
      setArrowPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    }
    if (resizing) {
      const placement = placementById.get(resizing.itemId);
      if (!placement) return;
      const position = placementPosition(placement);
      const minSize = placement.selection.item.assetKind === "icon" ? 54 : 72;
      const maxW = Math.min(260, width - position.x - 12);
      const maxH = Math.min(240, height - position.y - 12);
      const nextW = Math.min(maxW, Math.max(minSize, resizing.startW + event.clientX - resizing.startX));
      const nextH = Math.min(maxH, Math.max(minSize, resizing.startH + event.clientY - resizing.startY));
      if (placement.selection.item.assetKind === "icon") {
        const side = Math.min(maxW, maxH, Math.max(minSize, Math.max(nextW, nextH)));
        updateSize(resizing.itemId, side, side);
      } else {
        updateSize(resizing.itemId, nextW, nextH);
      }
      return;
    }
    if (!dragging) return;
    const placement = placementById.get(dragging.itemId);
    if (!placement) return;
    const size = cardSize(placement);
    const x = Math.min(width - size.w - 12, Math.max(12, event.clientX - rect.left - dragging.dx));
    const y = Math.min(height - size.h - 12, Math.max(12, event.clientY - rect.top - dragging.dy));
    updatePosition(dragging.itemId, x, y);
  };
  const onCanvasPointerUp = () => {
    setDragging(null);
    setResizing(null);
  };
  const updateArrowNote = (arrowId: string, note: string) => {
    setArrows((current) => current.map((arrow) => (arrow.id === arrowId ? { ...arrow, note } : arrow)));
  };
  const removeArrow = (arrowId: string) => {
    setArrows((current) => current.filter((arrow) => arrow.id !== arrowId));
  };
  const updateNote = (noteId: string, text: string) => {
    setNotes((current) => current.map((note) => (note.id === noteId ? { ...note, text } : note)));
  };
  const removeNote = (noteId: string) => {
    setNotes((current) => current.filter((note) => note.id !== noteId));
  };

  return (
    <div
      className={`selection-confirm-canvas selection-confirm-canvas-tool-${tool}`}
      style={{ width, height }}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={onCanvasPointerUp}
      onPointerLeave={onCanvasPointerUp}
      onClick={(event) => {
        if (tool !== "note") return;
        const target = event.target as Element | null;
        if (target?.closest?.(".selection-confirm-ref-card, .selection-confirm-note, .selection-confirm-arrow-note-card")) return;
        const rect = event.currentTarget.getBoundingClientRect();
        addNote(event.clientX - rect.left, event.clientY - rect.top);
      }}
    >
      {skeletonSvgMarkup ? (
        <div
          className="selection-confirm-drawio-layer"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: skeletonSvgMarkup }}
        />
      ) : null}
      <svg
        className={`selection-confirm-skeleton-layer ${skeletonSvgMarkup ? "has-drawio-background" : ""}`}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <marker id="selection-confirm-arrowhead" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
            <path d="M0,0 L9,4.5 L0,9 z" fill="#2f6fdd" />
          </marker>
        </defs>
        {plan.edges.map((edge, index) => {
          const from = nodeById.get(edge.from);
          const to = nodeById.get(edge.to);
          if (!from || !to) return null;
          return (
            <line
              key={`${edge.id}-${edge.from}-${edge.to}-${index}`}
              x1={(from.x + from.w / 2) * scale}
              y1={(from.y + from.h / 2) * scale}
              x2={(to.x + to.w / 2) * scale}
              y2={(to.y + to.h / 2) * scale}
              className="selection-confirm-skeleton-edge"
              markerEnd="url(#selection-confirm-arrowhead)"
            />
          );
        })}
        {plan.nodes.map((node) => {
          const group = node.role === "group" || node.shape === "group";
          const lines = wrapSvgLines(node.label, group ? 22 : 15);
          const lineHeight = group ? 17 : 15;
          const textY = (node.y + node.h / 2) * scale - ((lines.length - 1) * lineHeight) / 2;
          return (
            <g key={node.id}>
              <rect
                x={node.x * scale}
                y={node.y * scale}
                width={Math.max(1, node.w * scale)}
                height={Math.max(1, node.h * scale)}
                rx={group ? 10 : 6}
                className={group ? "selection-confirm-skeleton-group" : "selection-confirm-skeleton-node"}
                onClick={(event) => {
                  event.stopPropagation();
                  if (tool === "arrow" && pendingArrowItemId) addArrow(pendingArrowItemId, node.id);
                }}
              />
              {lines.map((line, index) => (
                <text
                  key={`${node.id}-${index}`}
                  x={(node.x + node.w / 2) * scale}
                  y={textY + index * lineHeight}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="selection-confirm-skeleton-label"
                >
                  {line}
                </text>
              ))}
            </g>
          );
        })}
        {arrows.map((arrow) => {
          const placement = placementById.get(arrow.fromItemId);
          const node = nodeById.get(arrow.toNodeId);
          if (!placement || !node) return null;
          const position = placementPosition(placement);
          const size = cardSize(placement);
          const x1 = position.x + size.w;
          const y1 = position.y + size.h / 2;
          const x2 = node.x * scale;
          const y2 = (node.y + node.h / 2) * scale;
          return (
            <g key={arrow.id}>
              <path
                d={`M ${x1} ${y1} C ${x1 + 52} ${y1}, ${x2 - 52} ${y2}, ${x2} ${y2}`}
                className="selection-confirm-binding-arrow"
                markerEnd="url(#selection-confirm-arrowhead)"
              />
              {arrow.note ? (
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} className="selection-confirm-arrow-note">
                  {arrow.note}
                </text>
              ) : null}
            </g>
          );
        })}
        {pendingArrowItemId && arrowPointer ? (() => {
          const placement = placementById.get(pendingArrowItemId);
          if (!placement) return null;
          const position = placementPosition(placement);
          const size = cardSize(placement);
          const x1 = position.x + size.w;
          const y1 = position.y + size.h / 2;
          return (
            <path
              d={`M ${x1} ${y1} C ${x1 + 52} ${y1}, ${arrowPointer.x - 52} ${arrowPointer.y}, ${arrowPointer.x} ${arrowPointer.y}`}
              className="selection-confirm-binding-arrow is-preview"
              markerEnd="url(#selection-confirm-arrowhead)"
            />
          );
        })() : null}
      </svg>

      <div className="selection-confirm-card-layer">
        {placements.map((placement) => {
          const position = placementPosition(placement);
          const size = cardSize(placement);
          const active = activeItemId === placement.selection.id || pendingArrowItemId === placement.selection.id;
          const inferredNode =
            plan.nodes
              .map((node) => ({
                node,
                distance: Math.hypot((node.x + node.w / 2) * scale - (position.x + size.w / 2), (node.y + node.h / 2) * scale - (position.y + size.h / 2)),
              }))
              .sort((a, b) => a.distance - b.distance)[0] ?? null;
          const inferredLabel = inferredNode && inferredNode.distance <= 220 ? inferredNode.node.label || inferredNode.node.id : null;
          const resizable = placement.selection.item.type === "asset" && placement.selection.item.assetKind === "icon";
          const visualOnlyIcon = placement.selection.item.type === "asset" && placement.selection.item.assetKind === "icon";
          return (
            <button
              key={placement.selection.id}
              type="button"
              className={`selection-confirm-ref-card ${active ? "is-active" : ""} is-${placement.selection.item.assetKind ?? placement.selection.item.type}`}
              style={{ left: position.x, top: position.y, width: size.w, height: size.h }}
              onPointerDown={(event) => {
                event.stopPropagation();
                setActiveItemId(placement.selection.id);
                if (tool === "arrow") {
                  const canvasRect = event.currentTarget.closest(".selection-confirm-canvas")?.getBoundingClientRect();
                  setPendingArrowItemId(placement.selection.id);
                  if (canvasRect) setArrowPointer({ x: event.clientX - canvasRect.left, y: event.clientY - canvasRect.top });
                  return;
                }
                const rect = event.currentTarget.getBoundingClientRect();
                setDragging({ itemId: placement.selection.id, dx: event.clientX - rect.left, dy: event.clientY - rect.top });
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
            >
              {placement.selection.imageUrl ? <img src={placement.selection.imageUrl} alt="" /> : null}
              {placement.selection.colors.length > 0 ? (
                <span className="selection-confirm-card-palette">
                  {placement.selection.colors.map((color) => (
                    <i key={color} style={{ background: color }} />
                  ))}
                </span>
              ) : null}
              {!placement.selection.imageUrl && placement.selection.colors.length === 0 ? (
                <span className="selection-confirm-card-title">{placement.selection.title}</span>
              ) : null}
              {!visualOnlyIcon ? <small>{placement.selection.item.assetKind ?? placement.selection.item.type}</small> : null}
              {!visualOnlyIcon && inferredLabel ? <em>→ {inferredLabel}</em> : null}
              {resizable ? (
                <span
                  className="selection-confirm-card-resize"
                  title="Resize icon"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    setActiveItemId(placement.selection.id);
                    setResizing({
                      itemId: placement.selection.id,
                      startX: event.clientX,
                      startY: event.clientY,
                      startW: size.w,
                      startH: size.h,
                    });
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="selection-confirm-note-layer">
        {arrows.map((arrow) => {
          const placement = placementById.get(arrow.fromItemId);
          const node = nodeById.get(arrow.toNodeId);
          if (!placement || !node) return null;
          const position = placementPosition(placement);
          const size = cardSize(placement);
          const x1 = position.x + size.w;
          const y1 = position.y + size.h / 2;
          const x2 = node.x * scale;
          const y2 = (node.y + node.h / 2) * scale;
          return (
            <div
              key={`${arrow.id}-note`}
              className="selection-confirm-arrow-note-card"
              style={{ left: (x1 + x2) / 2, top: (y1 + y2) / 2 }}
              onClick={(event) => event.stopPropagation()}
            >
              <span>arrow note</span>
              <input
                value={arrow.note}
                placeholder="optional"
                onChange={(event) => updateArrowNote(arrow.id, event.target.value)}
              />
              <button type="button" onClick={() => removeArrow(arrow.id)} aria-label="Remove arrow">
                ×
              </button>
            </div>
          );
        })}
        {notes.map((note) => (
          <div
            key={note.id}
            className="selection-confirm-note"
            style={{ left: note.x, top: note.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <textarea
              value={note.text}
              placeholder="Type note..."
              onChange={(event) => updateNote(note.id, event.target.value)}
              autoFocus={!note.text}
            />
            <button type="button" onClick={() => removeNote(note.id)} aria-label="Remove note">
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function variantToReferenceItem(variant: FigureVariant, prompt: string, stage: "draft" | "final" = "final"): ReferenceItem {
  const src = variantPreviewSrc(variant, stage);
  return {
    id: `generated-reference-${stage}-${variant.id}`,
    title: `${variant.title}${stage === "draft" ? " draft" : ""} as reference`,
    sourcePaper: "Generated figure",
    venue: "HiChart canvas",
    year: new Date().getFullYear(),
    imageType: "generated figure reference",
    subject: prompt,
    styleTags: ["generated", variant.layoutStrategy].filter(Boolean),
    similarityReason:
      "Generated output selected on the canvas; use its pixels as the next-round visual reference while the chosen skeleton controls layout.",
    thumbnail: "GEN",
    thumbnailUrl: src,
    imageDataUrl: src?.startsWith("data:image/") ? src : null,
    structuralAnalysis: variant.description,
  };
}

function variantPreviewSrc(variant: FigureVariant, stage: "draft" | "final" = "final") {
  if (stage === "draft") {
    return variant.draftPreviewImageDataUrl ?? variant.draftPreviewImageUrl ?? variant.previewImageDataUrl ?? variant.previewImageUrl ?? null;
  }
  return variant.previewImageDataUrl ?? variant.previewImageUrl ?? null;
}

function confirmPlanBounds(plan: DiagramPlan, padding = 48) {
  const edgePoints = plan.edges.flatMap((edge) => edge.points ?? []);
  if (plan.nodes.length === 0 && edgePoints.length === 0) {
    return { minX: 0, minY: 0, width: Math.max(1, plan.width), height: Math.max(1, plan.height), padding };
  }
  const minX = Math.min(...plan.nodes.map((node) => node.x), ...edgePoints.map((point) => point.x));
  const minY = Math.min(...plan.nodes.map((node) => node.y), ...edgePoints.map((point) => point.y));
  const maxX = Math.max(...plan.nodes.map((node) => node.x + node.w), ...edgePoints.map((point) => point.x));
  const maxY = Math.max(...plan.nodes.map((node) => node.y + node.h), ...edgePoints.map((point) => point.y));
  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2),
    padding,
  };
}

function normalizeConfirmPlan(plan: DiagramPlan, padding = 48): DiagramPlan {
  const bounds = confirmPlanBounds(plan, padding);
  return {
    ...plan,
    width: bounds.width,
    height: bounds.height,
    nodes: plan.nodes.map((node) => ({
      ...node,
      x: node.x - bounds.minX + padding,
      y: node.y - bounds.minY + padding,
    })),
    edges: plan.edges.map((edge) => ({
      ...edge,
      points: edge.points?.map((point) => ({
        x: point.x - bounds.minX + padding,
        y: point.y - bounds.minY + padding,
      })),
    })),
  };
}

function isConfirmOnlyCanvasItemId(id: string) {
  return id.startsWith("confirm-search-icon-");
}

function confirmSearchCanvasIconItemId(iconId: string) {
  return `canvas-confirm-search-icon-${iconId}`;
}

export type ProjectDashboardPhaseFocusRequest = {
  phase: StudyPhase;
  nonce: number;
};

export type ProjectDashboardFigureFocusRequest = {
  nodeId: string;
  nonce: number;
};

export function ProjectDashboard({
  phaseFocusRequest = null,
  figureFocusRequest = null,
  toolbarAccessory = null,
}: {
  phaseFocusRequest?: ProjectDashboardPhaseFocusRequest | null;
  figureFocusRequest?: ProjectDashboardFigureFocusRequest | null;
  toolbarAccessory?: ReactNode;
} = {}) {
  const { state, setState } = useWorkspaceState();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const selectionConfirmCanvasShellRef = useRef<HTMLElement | null>(null);
  const pendingDragUndoItemIdRef = useRef<string | null>(null);
  const childStageActionRef = useRef<StagePrimaryActionRegistration | null>(null);
  const childStageActionSigRef = useRef("");
  const [childStageActionTick, setChildStageActionTick] = useState(0);
  const registerChildStageAction = useCallback((action: StagePrimaryActionRegistration | null) => {
    childStageActionRef.current = action;
    const nextSignature = stagePrimaryActionSignature(action);
    if (nextSignature === childStageActionSigRef.current) return;
    childStageActionSigRef.current = nextSignature;
    setChildStageActionTick((tick) => tick + 1);
  }, []);
  const [generating, setGenerating] = useState(false);
  const [variantGenerationProgress, setVariantGenerationProgress] = useState<VariantGenerationProgress | null>(null);
  const [generatingSkeleton, setGeneratingSkeleton] = useState(false);
  const [skeletonPromptConfirmation, setSkeletonPromptConfirmation] = useState<{
    referenceTitle: string;
    value: string;
  } | null>(null);
  const skeletonPromptResolverRef = useRef<((value: GenerationConfirmation | null) => void) | null>(null);
  const [candidatePromptConfirmation, setCandidatePromptConfirmation] = useState<{
    referenceTitle: string;
    value: string;
  } | null>(null);
  const candidatePromptResolverRef = useRef<((value: GenerationConfirmation | null) => void) | null>(null);
  const pendingModifyJobList = useModifyJobReconciler();
  const handleVariantGenerationProgress = useCallback((progress: VariantGenerationProgress) => {
    setVariantGenerationProgress(progress);
    setState((current) => ({ ...current, status: progress.label }));
  }, [setState]);

  function requestSkeletonPromptConfirmation(initialValue: string, referenceTitle: string) {
    skeletonPromptResolverRef.current?.(null);
    return new Promise<GenerationConfirmation | null>((resolve) => {
      skeletonPromptResolverRef.current = resolve;
      setSkeletonPromptConfirmation({ referenceTitle, value: initialValue });
    });
  }

  function closeSkeletonPromptConfirmation(result: GenerationConfirmation | null) {
    if (result) {
      setState((current) => commitWorkingPromptRevision({
        ...current,
        prompt: result.prompt,
        generationBrief: result.prompt,
        promptUpdatedAt: new Date().toISOString(),
      }, "skeleton_generation"));
    }
    const resolve = skeletonPromptResolverRef.current;
    skeletonPromptResolverRef.current = null;
    setSkeletonPromptConfirmation(null);
    resolve?.(result);
  }

  function requestCandidatePromptConfirmation(initialValue: string, referenceTitle: string) {
    candidatePromptResolverRef.current?.(null);
    return new Promise<GenerationConfirmation | null>((resolve) => {
      candidatePromptResolverRef.current = resolve;
      setCandidatePromptConfirmation({ referenceTitle, value: initialValue });
    });
  }

  function closeCandidatePromptConfirmation(result: GenerationConfirmation | null) {
    if (result) {
      setState((current) => commitWorkingPromptRevision({
        ...current,
        prompt: result.prompt,
        generationBrief: result.prompt,
        promptUpdatedAt: new Date().toISOString(),
      }, "first_generation"));
    }
    const resolve = candidatePromptResolverRef.current;
    candidatePromptResolverRef.current = null;
    setCandidatePromptConfirmation(null);
    resolve?.(result);
  }

  useEffect(() => () => {
    skeletonPromptResolverRef.current?.(null);
    skeletonPromptResolverRef.current = null;
    candidatePromptResolverRef.current?.(null);
    candidatePromptResolverRef.current = null;
  }, []);
  const [activeStage, setActiveStage] = useState<DashboardStageId | null>(() =>
    dashboardStageForIdeaSparkStep(state.activeStudioStep),
  );
  const [candidateMode, setCandidateMode] = useState<"preview" | "edit">(() =>
    state.activeStudyStage === "refine" ? "edit" : "preview",
  );
  const [candidatePreviewVariantId, setCandidatePreviewVariantId] = useState<string | null>(
    () => state.selectedVariantId,
  );
  const candidateOutputIds = useMemo(
    () => state.variants.filter((variant) => !variant.deletedAt).map((variant) => variant.id),
    [state.variants],
  );
  const previousCandidateOutputIdsRef = useRef<ReadonlySet<string>>(new Set(candidateOutputIds));
  useEffect(() => {
    const previousVariantIds = previousCandidateOutputIdsRef.current;
    setCandidatePreviewVariantId((currentPreviewVariantId) =>
      resolveCandidatePreviewVariantId({
        variants: state.variants,
        currentPreviewVariantId,
        workspaceSelectedVariantId: state.selectedVariantId,
        previousVariantIds,
      }),
    );
    previousCandidateOutputIdsRef.current = new Set(candidateOutputIds);
  }, [candidateOutputIds, state.selectedVariantId, state.variants]);
  const openVariantInEdit = useCallback((variantId: string) => {
    setCandidatePreviewVariantId(variantId);
    setState((current) => transitionStudyStage({
      ...current,
      activeStudioStep: "candidate",
      selectedVariantId: variantId,
      status: "Opened the selected Candidate in Edit.",
    }, "refine"));
    setActiveStage("candidate");
    setCandidateMode("edit");
  }, [setState]);
  const selectCandidatePreview = useCallback((variantId: string) => {
    setCandidatePreviewVariantId(variantId);
    setState((current) => ({
      ...current,
      activeStudioStep: "candidate",
      selectedVariantId: variantId,
      status: "Selected a Candidate or Edit result for inspection.",
    }));
    setActiveStage("candidate");
    setCandidateMode("preview");
  }, [setState]);
  const closeCandidateEditor = useCallback(() => {
    setCandidatePreviewVariantId(state.selectedVariantId);
    setCandidateMode("preview");
  }, [state.selectedVariantId]);
  const handleEditSkeletonFromLayout = useCallback(
    (candidate: DiagramSkeletonCandidate) => {
      setState((current) => ({
        ...current,
        activeStudioStep: "layout",
        selectedDiagramSkeletonId: candidate.id,
        diagramSkeletonXml: candidate.xml ?? current.diagramSkeletonXml,
        diagramSkeletonPlan: candidate.diagramPlan ?? current.diagramSkeletonPlan,
        guidedDialogue: {
          ...current.guidedDialogue,
          detailViews: { ...current.guidedDialogue.detailViews, skeleton: "preview" },
        },
      }));
      setSkeletonEditorOpen(true);
    },
    [setState],
  );
  const [skeletonEditorOpen, setSkeletonEditorOpen] = useState(false);
  const [skeletonManagerOpen, setSkeletonManagerOpen] = useState(false);
  const [drawioOpen, setDrawioOpen] = useState(false);
  const [matchDrawioOpen, setMatchDrawioOpen] = useState(false);
  const [controlPreviewItemId, setControlPreviewItemId] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("layout");
  const [pocketRole, setPocketRole] = useState<PocketRole>("layout");
  const [studioSourceCategoriesOpen, setStudioSourceCategoriesOpen] = useState<Record<"layout" | "style", boolean>>({
    layout: true,
    style: true,
  });
  const [pocketTagFilter, setPocketTagFilter] = useState("all");
  const [pocketSearch, setPocketSearch] = useState("");
  const [assetFilter, setAssetFilter] = useState("all");
  const [drawerIconLimit, setDrawerIconLimit] = useState(80);
  const [focusedStructureTargetId, setFocusedStructureTargetId] = useState<string | null>(null);
  const [selectedSkeletonTargetIds, setSelectedSkeletonTargetIds] = useState<string[]>([]);
  const [regionRegenPrompt, setRegionRegenPrompt] = useState("");
  const [regionRegenBusy, setRegionRegenBusy] = useState(false);
  const [regionRegenError, setRegionRegenError] = useState<string | null>(null);
  const [viewedSkeletonRevisionId, setViewedSkeletonRevisionId] = useState<string | null>(null);
  const [clearedSkeletonConnections, setClearedSkeletonConnections] = useState<{
    candidateId: string;
    previousXml: string;
    clearedXml: string;
    removedCount: number;
  } | null>(null);
  const [pocketManagerOpen, setPocketManagerOpen] = useState(false);
  const [pocketPreviewReference, setPocketPreviewReference] = useState<ReferenceItem | null>(null);
  const [pocketZoomReference, setPocketZoomReference] = useState<ReferenceItem | null>(null);
  useEffect(() => {
    if (!pocketZoomReference) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setPocketZoomReference(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pocketZoomReference]);
  /** Candidate rail thumbnails are too small to judge; this is how you read one. */
  const [railZoom, setRailZoom] = useState<{ caption: string; note: string; body: ReactNode } | null>(null);
  useEffect(() => {
    if (!railZoom) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setRailZoom(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [railZoom]);
  useEffect(() => {
    if (!skeletonEditorOpen) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setSkeletonEditorOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [skeletonEditorOpen]);
  const [retrievalPocketFocus, setRetrievalPocketFocus] = useState<{
    referenceId: string;
    role: PocketRole;
    nonce: number;
  } | null>(null);
  const [studioSourcePreviewRequest, setStudioSourcePreviewRequest] = useState<{
    referenceId: string;
    role: PocketRole;
    nonce: number;
  } | null>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [draggingCanvasItemId, setDraggingCanvasItemId] = useState<string | null>(null);
  const [resizingCanvasItemId, setResizingCanvasItemId] = useState<string | null>(null);
  const [drawerDragPayload, setDrawerDragPayload] = useState<DrawerDragPayload | null>(null);
  const [canvasDropLabel, setCanvasDropLabel] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hoveredCanvasItemId, setHoveredCanvasItemId] = useState<string | null>(null);
  const [selectionConfirmOpen, setSelectionConfirmOpen] = useState(false);
  const [selectionConfirmExcludedIds, setSelectionConfirmExcludedIds] = useState<string[]>([]);
  const [selectionConfirmPrompt, setSelectionConfirmPrompt] = useState("");
  const [selectionConfirmPromptDirty, setSelectionConfirmPromptDirty] = useState(false);
  const [selectionConfirmPositions, setSelectionConfirmPositions] = useState<SelectionConfirmPosition[]>([]);
  const [selectionConfirmSizes, setSelectionConfirmSizes] = useState<SelectionConfirmSize[]>([]);
  const [selectionConfirmArrows, setSelectionConfirmArrows] = useState<SelectionConfirmArrow[]>([]);
  const [selectionConfirmNotes, setSelectionConfirmNotes] = useState<SelectionConfirmNote[]>([]);
  const [selectionConfirmSkeletonId, setSelectionConfirmSkeletonId] = useState<string | null>(null);
  const [selectionConfirmStyleReferenceId, setSelectionConfirmStyleReferenceId] = useState<string | null>(null);
  const [selectionConfirmTool, setSelectionConfirmTool] = useState<SelectionConfirmTool>("move");
  const [selectionConfirmActiveItemId, setSelectionConfirmActiveItemId] = useState<string | null>(null);
  const [selectionConfirmPendingArrowItemId, setSelectionConfirmPendingArrowItemId] = useState<string | null>(null);
  const [selectionConfirmControlPreview, setSelectionConfirmControlPreview] = useState<string | null>(null);
  const [selectionConfirmAddedIconIds, setSelectionConfirmAddedIconIds] = useState<string[]>([]);
  const [selectionConfirmAdvancedOpen, setSelectionConfirmAdvancedOpen] = useState(false);
  const [selectionConfirmCanvasWidth, setSelectionConfirmCanvasWidth] = useState(1040);
  const [selectionConfirmControlItemId, setSelectionConfirmControlItemId] = useState<string | null>(null);
  const selectionConfirmAnnotationRef = useRef<AnnotationCanvasHandle | null>(null);
  const [selectionConfirmAnnotationSnapshotsByCanvasId, setSelectionConfirmAnnotationSnapshotsByCanvasId] =
    useState<Record<string, TLEditorSnapshot>>({});
  const [selectionConfirmAnnotationMarkupByCanvasId, setSelectionConfirmAnnotationMarkupByCanvasId] =
    useState<Record<string, boolean>>({});
  const [selectionConfirmAnnotationResetByCanvasId, setSelectionConfirmAnnotationResetByCanvasId] =
    useState<Record<string, number>>({});
  const [graphContextMenu, setGraphContextMenu] = useState<GraphContextMenu>(null);
  const [creativeCanvasContextMenu, setCreativeCanvasContextMenu] = useState<CreativeCanvasContextMenu>(null);
  const [graphMessage, setGraphMessage] = useState<string | null>(null);
  const [portAnchors, setPortAnchors] = useState<Record<string, { x: number; y: number }>>({});
  const {
    prompt,
    generationBrief,
    intentGraph,
    creativeCanvas,
    creativeCanvases,
    activeCreativeCanvasId,
    studyProfile,
    board,
    referenceUsage,
    layoutReferenceId,
    canvasFocusReferenceId,
    iconReferenceIds,
    iconReferenceId,
    fontReferenceId,
    paletteReferenceId,
    diagramSkeletonXml,
    diagramSkeletonPlan,
    diagramSkeletonMermaid,
    diagramSkeletonCandidates,
    selectedDiagramSkeletonId,
    variants,
    selectedVariantId,
    referenceRegions,
    customIconReferences,
    activeStyleKit,
    skeletonStyleApplications,
    workspaceView,
  } = state;
  const effectiveGenerationBrief = prompt.trim() || (generationBrief ?? "").trim();
  const assignedTask = state.assignedTaskSnapshot;
  const ideaReconcileSignature = useMemo(() => [
    state.ideaHistory.nodes.map((node) => `${node.kind}:${node.skeletonId ?? node.variantId ?? node.id}`).join("|"),
    diagramSkeletonCandidates.map((candidate) => candidate.id).join("|"),
    state.figureHistory.map((entry) => `${entry.variantId}:${entry.sourceVariantId ?? ""}`).join("|"),
    variants.map((variant) => `${variant.id}:${variant.deletedAt ?? ""}`).join("|"),
  ].join("::"), [diagramSkeletonCandidates, state.figureHistory, state.ideaHistory.nodes, variants]);
  const skeletonStyleReferenceSet = useMemo(
    () => createSkeletonStyleReferenceSet(activeStyleKit),
    [activeStyleKit],
  );

  useEffect(() => {
    setState((current) => reconcileIdeaHistory(current));
  }, [ideaReconcileSignature, setState]);

  useEffect(() => {
    if (!activeStage) return;
    const activeStudioStep = ideaSparkStepForDashboardStage(activeStage, state.activeStudioStep);
    if (activeStudioStep === state.activeStudioStep && state.ideaHistory.homeOpen === false) return;
    setState((current) => ({
      ...current,
      activeStudioStep,
      ideaHistory: { ...current.ideaHistory, homeOpen: false },
    }));
  }, [activeStage, setState, state.activeStudioStep, state.ideaHistory.homeOpen]);

  function changeWorkspaceView(nextView: "studio" | "advanced-board") {
    if (nextView === "advanced-board") setActiveStage(null);
    else setActiveStage(dashboardStageForIdeaSparkStep(state.activeStudioStep));
    setState((current) => appendStudyEvent({
      ...current,
      workspaceView: nextView,
      status: nextView === "studio" ? "Returned to the structured Studio." : "Opened Advanced Board.",
    }, {
      stage: current.activeStudyStage,
      type: nextView === "studio" ? "advanced_board_closed" : "advanced_board_opened",
      targetIds: [current.activeCreativeCanvasId],
      result: nextView,
    }));
  }

  useEffect(() => {
    if (!activeStage || workspaceView !== "advanced-board") return;
    setState((current) => appendStudyEvent({
      ...current,
      workspaceView: "studio",
      status: `Opened ${activeStage} in the structured Studio.`,
    }, {
      stage: current.activeStudyStage,
      type: "advanced_board_closed",
      targetIds: [current.activeCreativeCanvasId],
      result: "studio_tool_opened",
    }));
  }, [activeStage, setState, workspaceView]);

  const layoutReference = useMemo(
    () => board.find((item) => item.id === layoutReferenceId) ?? null,
    [board, layoutReferenceId],
  );
  const styleReference = useMemo(
    () => board.find((item) => item.id === canvasFocusReferenceId) ??
      board.find((item) => item.id === activeStyleKit.sourceReferenceId) ??
      null,
    [activeStyleKit.sourceReferenceId, board, canvasFocusReferenceId],
  );
  const sourceOrderStage = workspaceView === "studio"
    ? activeStage ?? dashboardStageForIdeaSparkStep(state.activeStudioStep)
    : null;
  // The source rail follows the same visit-scoped ordering as the center
  // gallery: selection does not move a card until the stage is entered again.
  const sourceOrderEntryRef = useRef<{
    stage: DashboardStageId | null;
    layoutReferenceId: string | null;
    canvasFocusReferenceId: string | null;
  }>({
    stage: null,
    layoutReferenceId: null,
    canvasFocusReferenceId: null,
  });
  if (sourceOrderEntryRef.current.stage !== sourceOrderStage) {
    sourceOrderEntryRef.current = {
      stage: sourceOrderStage,
      layoutReferenceId: sourceOrderStage === "layout"
        ? layoutReferenceId
        : sourceOrderEntryRef.current.layoutReferenceId,
      canvasFocusReferenceId: sourceOrderStage === "style"
        ? canvasFocusReferenceId
        : sourceOrderEntryRef.current.canvasFocusReferenceId,
    };
  }
  const layoutReferenceIdForOrder = sourceOrderStage === "layout"
    ? sourceOrderEntryRef.current.layoutReferenceId
    : layoutReferenceId;
  const canvasFocusReferenceIdForOrder = sourceOrderStage === "style"
    ? sourceOrderEntryRef.current.canvasFocusReferenceId
    : canvasFocusReferenceId;
  const studioSelectedLayoutReferences = useMemo(() => {
    const layoutReferenceId = layoutReferenceIdForOrder;
    const selectedIds = new Set(board
      .filter((item) => referenceUsage[item.id]?.layout)
      .map((item) => item.id));
    if (layoutReferenceId) selectedIds.add(layoutReferenceId);
    const references = board.filter((item) => selectedIds.has(item.id));
    if (!layoutReferenceId) return references;
    const selected = references.find((item) => item.id === layoutReferenceId);
    return selected
      ? [selected, ...references.filter((item) => item.id !== layoutReferenceId)]
      : references;
  }, [board, layoutReferenceIdForOrder, referenceUsage]);
  const studioSelectedStyleReferences = useMemo(() => {
    const canvasFocusReferenceId = canvasFocusReferenceIdForOrder;
    const selectedIds = new Set(board
      .filter((item) => referenceUsage[item.id]?.style)
      .map((item) => item.id));
    if (canvasFocusReferenceId) selectedIds.add(canvasFocusReferenceId);
    if (activeStyleKit.sourceReferenceId) selectedIds.add(activeStyleKit.sourceReferenceId);
    const references = board.filter((item) => selectedIds.has(item.id));
    if (!canvasFocusReferenceId) return references;
    const selected = references.find((item) => item.id === canvasFocusReferenceId);
    return selected
      ? [selected, ...references.filter((item) => item.id !== canvasFocusReferenceId)]
      : references;
  }, [activeStyleKit.sourceReferenceId, board, canvasFocusReferenceIdForOrder, referenceUsage]);
  const selectedIconAssetIds = useMemo(() => {
    const ids: Array<string | null | undefined> = iconReferenceIds?.length ? iconReferenceIds : [iconReferenceId];
    return Array.from(new Set(ids.flatMap((id) => (id ? [id] : []))));
  }, [iconReferenceId, iconReferenceIds]);
  const selectedIconAssetIdSet = useMemo(
    () => new Set<string>(selectedIconAssetIds),
    [selectedIconAssetIds],
  );
  const selectedIconReferenceIds = useMemo(() => {
    const known = selectedIconAssetIds.filter((id) => scientificIconReferences.some((item) => item.id === id));
    return Array.from(new Set(known.length ? known : [scientificIconReferences[0].id]));
  }, [selectedIconAssetIds]);
  const iconReferences = useMemo(
    () =>
      selectedIconReferenceIds
        .map((id) => scientificIconReferences.find((item) => item.id === id))
        .filter((item): item is (typeof scientificIconReferences)[number] => Boolean(item)),
    [selectedIconReferenceIds],
  );
  const iconReference = iconReferences[0] ?? scientificIconReferences[0];
  const fontReference = useMemo(
    () => figureFontReferences.find((item) => item.id === fontReferenceId) ?? null,
    [fontReferenceId],
  );
  const paletteReference = useMemo(
    () => figurePaletteReferences.find((item) => item.id === paletteReferenceId) ?? null,
    [paletteReferenceId],
  );
  const selectedVariant = useMemo(
    () =>
      variants.find((item) => item.id === selectedVariantId && !item.deletedAt) ??
      variants.find((item) => !item.deletedAt) ??
      null,
    [variants, selectedVariantId],
  );
  const liveSkeletonPlan = useMemo(
    () => (diagramSkeletonXml ? parseDrawioXmlToDiagramPlan(diagramSkeletonXml) : null),
    [diagramSkeletonXml],
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
  const previewSkeletonPlan = selectedSkeleton ? selectedSkeletonPlan ?? liveSkeletonPlan ?? diagramSkeletonPlan : null;
  const selectedSkeletonStyleApplication = selectedSkeleton
    ? skeletonStyleApplications[selectedSkeleton.id]?.appliedAt
      ? skeletonStyleApplications[selectedSkeleton.id]
      : null
    : null;
  const selectedSkeletonStyleIsStale = Boolean(
    selectedSkeletonStyleApplication &&
    selectedSkeletonStyleApplication.styleKitFingerprint !== skeletonStyleReferenceSet.fingerprint,
  );
  const styleMarks = styleReference
    ? referenceRegions.filter((region) => region.referenceId === styleReference.id && region.intent === "style")
    : [];
  const hasLayoutSkeleton = Boolean(selectedSkeleton);
  const pocketItems = useMemo(
    () => board.filter((item) => referenceUsage[item.id]?.[pocketRole]),
    [board, pocketRole, referenceUsage],
  );
  const pocketTags = useMemo(() => {
    const tags = new Set<string>();
    for (const item of pocketItems) {
      for (const tag of getPocketFilterTags(item).slice(0, 6)) tags.add(tag);
    }
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [pocketItems, pocketRole]);
  const filteredPocketItems = useMemo(
    () => {
      const query = pocketSearch.trim().toLowerCase();
      return pocketItems.filter((item) => {
        const tagMatch = pocketTagFilter === "all" || getPocketFilterTags(item).includes(pocketTagFilter);
        const text = `${item.title} ${item.imageType} ${item.subject} ${item.styleTags.join(" ")}`.toLowerCase();
        return tagMatch && (!query || text.includes(query));
      });
    },
    [pocketItems, pocketSearch, pocketTagFilter],
  );
  const iconRoles = useMemo(
    () =>
      Array.from(
        new Set([
          ...scientificIconReferences.map((item) => item.role),
          ...customIconReferences.flatMap((item) => item.tags.map((tag) => tag.toLowerCase())),
        ]),
      ).sort(),
    [customIconReferences],
  );
  const fontTones = useMemo(
    () => Array.from(new Set(figureFontReferences.map((item) => item.tone))).sort(),
    [],
  );
  const paletteTones = useMemo(
    () => Array.from(new Set(figurePaletteReferences.map((item) => item.tone))).sort(),
    [],
  );
  const filteredIcons = useMemo(() => {
    const query = pocketSearch.trim().toLowerCase();
    return scientificIconReferences.filter((asset) => {
      const filterMatch = assetFilter === "all" || asset.role === assetFilter;
      const text = `${asset.label} ${asset.role} ${asset.category} ${asset.description} ${asset.keywords.join(" ")} ${asset.aliases.join(" ")}`.toLowerCase();
      return filterMatch && (!query || text.includes(query));
    });
  }, [assetFilter, pocketSearch]);
  const visibleDrawerIcons = useMemo(
    () => filteredIcons.slice(0, drawerIconLimit),
    [drawerIconLimit, filteredIcons],
  );
  const drawerTabCount = (tab: DrawerTab) =>
    tab === "layout" || tab === "style"
      ? board.filter((item) => referenceUsage[item.id]?.[tab]).length
      : tab === "crops"
        ? customIconReferences.filter(isStyleCropReference).length
        : tab === "icons"
          ? scientificIconReferences.length + customIconReferences.filter((asset) => !isStyleCropReference(asset)).length
          : tab === "fonts"
            ? figureFontReferences.length
            : figurePaletteReferences.length;
  const drawerTabLabel = (tab: DrawerTab) =>
    tab === "layout"
      ? "Layout"
      : tab === "style"
        ? "Style"
        : tab === "crops"
          ? "Crops"
          : tab === "icons"
            ? "Icons"
            : tab === "palettes"
              ? "Palettes"
              : "Fonts";
  const selectDrawerTab = (tab: DrawerTab) => {
    setDrawerTab(tab);
    if (tab === "layout" || tab === "style") setPocketRole(tab);
    setPocketTagFilter("all");
    setAssetFilter("all");
  };

  useEffect(() => {
    setDrawerIconLimit(80);
  }, [assetFilter, drawerTab, pocketSearch]);
  const filteredCustomIcons = useMemo(() => {
    const query = pocketSearch.trim().toLowerCase();
    return customIconReferences.filter((asset) => {
      const text = `${asset.label} ${asset.description} ${asset.tags.join(" ")}`.toLowerCase();
      const filterMatch =
        assetFilter === "all" ||
        asset.tags.some((tag) => tag.toLowerCase() === assetFilter.toLowerCase());
      return filterMatch && (!query || text.includes(query));
    });
  }, [assetFilter, customIconReferences, pocketSearch]);
  const filteredStyleCrops = useMemo(() => {
    const query = pocketSearch.trim().toLowerCase();
    return customIconReferences.filter((asset) => {
      const text = `${asset.label} ${asset.description} ${asset.tags.join(" ")}`.toLowerCase();
      return isStyleCropReference(asset) && (!query || text.includes(query));
    });
  }, [customIconReferences, pocketSearch]);
  const filteredFonts = useMemo(() => {
    const query = pocketSearch.trim().toLowerCase();
    return figureFontReferences.filter((font) => {
      const filterMatch = assetFilter === "all" || font.tone === assetFilter;
      const text = `${font.label} ${font.tone} ${font.description}`.toLowerCase();
      return filterMatch && (!query || text.includes(query));
    });
  }, [assetFilter, pocketSearch]);
  const filteredPalettes = useMemo(() => {
    const query = pocketSearch.trim().toLowerCase();
    return figurePaletteReferences.filter((palette) => {
      const filterMatch = assetFilter === "all" || palette.tone === assetFilter;
      const text = `${palette.label} ${palette.tone} ${palette.description} ${palette.colors.join(" ")}`.toLowerCase();
      return filterMatch && (!query || text.includes(query));
    });
  }, [assetFilter, pocketSearch]);
  const activePocketPreview =
    pocketPreviewReference && filteredPocketItems.some((item) => item.id === pocketPreviewReference.id)
      ? pocketPreviewReference
      : filteredPocketItems[0] ?? null;
  const graph = intentGraph ?? createDefaultIntentGraph();
  const emptyCreativeCanvas = useMemo(
    () => ({ drawerCollapsed: false, items: [], selectedItemId: null, selectedItemIds: [] }),
    [],
  );
  const canvasDocuments = useMemo<CreativeCanvasDocument[]>(() => {
    if (creativeCanvases?.length) return creativeCanvases;
    return [
      {
        id: activeCreativeCanvasId || "creative-canvas-1",
        title: "Canvas 1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        canvas: creativeCanvas ?? emptyCreativeCanvas,
        undoStack: state.creativeCanvasUndoStack ?? [],
      },
    ];
  }, [activeCreativeCanvasId, creativeCanvas, creativeCanvases, emptyCreativeCanvas, state.creativeCanvasUndoStack]);
  const activeCanvasDocument = useMemo(
    () => canvasDocuments.find((document) => document.id === activeCreativeCanvasId) ?? canvasDocuments[0] ?? null,
    [activeCreativeCanvasId, canvasDocuments],
  );
  const canvasState = activeCanvasDocument?.canvas ?? creativeCanvas ?? emptyCreativeCanvas;
  const activeCanvasUndoStack = activeCanvasDocument?.undoStack ?? state.creativeCanvasUndoStack ?? [];
  const activeCanvasConfirmKey = activeCanvasDocument?.id ?? activeCreativeCanvasId ?? "creative-canvas-1";

  useEffect(() => {
    const seen = new Set<string>();
    let changed = false;
    const nextItems = canvasState.items.map((item) => {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        return item;
      }
      changed = true;
      const id = makeCanvasItemId(item.id);
      seen.add(id);
      return { ...item, id };
    });
    if (!changed) return;
    setState((current) => {
      const repairedCanvas = {
        ...(current.creativeCanvas ?? emptyCreativeCanvas),
        items: nextItems,
        selectedItemId: nextItems.some((item) => item.id === canvasState.selectedItemId)
          ? canvasState.selectedItemId
          : nextItems[nextItems.length - 1]?.id ?? null,
        selectedItemIds: (current.creativeCanvas?.selectedItemIds ?? []).filter((id) =>
          nextItems.some((item) => item.id === id),
        ),
      };
      const activeId = current.activeCreativeCanvasId || activeCanvasDocument?.id;
      return {
        ...current,
        creativeCanvas: repairedCanvas,
        creativeCanvases: (current.creativeCanvases ?? []).map((document) =>
          document.id === activeId ? { ...document, canvas: repairedCanvas } : document,
        ),
        status: "Repaired duplicate canvas item ids.",
      };
    });
  }, [activeCanvasDocument?.id, canvasState.items, canvasState.selectedItemId, emptyCreativeCanvas, setState]);

  const visibleCanvasItems = useMemo(
    () => canvasState.items.filter((item) => !item.deletedAt),
    [canvasState.items],
  );
  const visibleOutputVariantIds = useMemo(
    () =>
      new Set(
        visibleCanvasItems
          .filter((item) => item.type === "output" && item.variantId)
          .map((item) => item.variantId as string),
      ),
    [visibleCanvasItems],
  );
  const visibleOutputVariants = useMemo(
    () => variants.filter((variant) => visibleOutputVariantIds.has(variant.id)),
    [variants, visibleOutputVariantIds],
  );

  const creativeCanvasDynamicWidth = useMemo(
    () =>
      Math.max(
        creativeCanvasMinWidth,
        ...visibleCanvasItems.map((item) => item.x + item.w + creativeCanvasRightPadding),
      ),
    [visibleCanvasItems],
  );
  const creativeCanvasDynamicHeight = useMemo(
    () =>
      Math.max(
        creativeCanvasMinHeight,
        ...visibleCanvasItems.map((item) => item.y + item.h + creativeCanvasBottomPadding),
      ),
    [visibleCanvasItems],
  );

  const selectedCanvasItem =
    visibleCanvasItems.find((item) => item.id === canvasState.selectedItemId) ?? null;
  const selectedCanvasItemIds = canvasState.selectedItemIds ?? [];
  const selectedCanvasItemIdSet = useMemo(
    () => new Set(selectedCanvasItemIds),
    [selectedCanvasItemIds],
  );
  const selectedCompositionItems = useMemo(
    () => selectedCanvasItemIds
      .map((id) => visibleCanvasItems.find((item) => item.id === id) ?? null)
      .filter((item): item is CreativeCanvasItem => Boolean(item) && !item?.protected),
    [selectedCanvasItemIds, visibleCanvasItems],
  );
  const selectionConfirmExcludedIdSet = useMemo(
    () => new Set(selectionConfirmExcludedIds),
    [selectionConfirmExcludedIds],
  );
  const selectedCanvasReference =
    selectedCanvasItem?.referenceId
      ? board.find((item) => item.id === selectedCanvasItem.referenceId) ?? null
      : null;
  const selectedCanvasSkeleton =
    selectedCanvasItem?.skeletonId
      ? diagramSkeletonCandidates.find((candidate) => candidate.id === selectedCanvasItem.skeletonId) ?? null
      : null;
  // The explicit Layout/Skeleton selection is the workflow source of truth.
  // Canvas selection is only a fallback for older workspaces without one.
  const workflowSkeleton = selectedSkeleton ?? selectedCanvasSkeleton ?? diagramSkeletonCandidates.at(-1) ?? null;
  const selectedCanvasSkeletonPlan = useMemo(
    () =>
      selectedCanvasSkeleton?.xml
        ? parseDrawioXmlToDiagramPlan(selectedCanvasSkeleton.xml) ?? selectedCanvasSkeleton.diagramPlan ?? null
        : selectedCanvasSkeleton?.diagramPlan ?? null,
    [selectedCanvasSkeleton],
  );
  const selectedCanvasSkeletonStyleApplication = selectedCanvasSkeleton
    ? skeletonStyleApplications[selectedCanvasSkeleton.id]?.appliedAt
      ? skeletonStyleApplications[selectedCanvasSkeleton.id]
      : null
    : null;
  const selectedCanvasSkeletonStyleIsStale = Boolean(
    selectedCanvasSkeletonStyleApplication &&
    selectedCanvasSkeletonStyleApplication.styleKitFingerprint !== skeletonStyleReferenceSet.fingerprint,
  );
  const inlineSkeletonEditing = Boolean(
    drawioOpen &&
    selectedCanvasItem?.type === "skeleton" &&
    selectedCanvasSkeleton?.xml,
  );
  const focusedStructurePreviewIds = focusedStructureTargetId ? [focusedStructureTargetId] : [];
  const selectedStructureModuleId = selectedCanvasSkeletonPlan?.nodes.some(
    (node) => node.id === focusedStructureTargetId,
  )
    ? focusedStructureTargetId
    : null;
  const selectedCanvasPreviewIconBindings = useMemo(() => {
    const scopedBindings = selectedCanvasSkeleton
      ? skeletonStyleApplications[selectedCanvasSkeleton.id]?.nodeIconBindings ??
        (selectedDiagramSkeletonId === selectedCanvasSkeleton.id ? state.nodeIconBindings : {})
      : state.nodeIconBindings;
    return { ...scopedBindings };
  }, [
    selectedCanvasSkeleton,
    selectedDiagramSkeletonId,
    skeletonStyleApplications,
    state.nodeIconBindings,
  ]);
  const selectedCanvasVariant =
    selectedCanvasItem?.variantId
      ? variants.find((variant) => variant.id === selectedCanvasItem.variantId) ?? null
      : null;
  const selectedCanvasIcon =
    selectedCanvasItem?.type === "asset" && selectedCanvasItem.assetKind === "icon"
      ? scientificIconReferences.find((asset) => asset.id === selectedCanvasItem.assetId) ?? null
      : null;
  const selectedCanvasCustomIcon =
    selectedCanvasItem?.type === "asset" && selectedCanvasItem.assetKind === "icon"
      ? customIconReferences.find((asset) => asset.id === selectedCanvasItem.assetId) ?? null
      : null;
  const selectedCanvasFont =
    selectedCanvasItem?.type === "asset" && selectedCanvasItem.assetKind === "font"
      ? figureFontReferences.find((font) => font.id === selectedCanvasItem.assetId) ?? null
      : null;
  const selectedCanvasPalette =
    selectedCanvasItem?.type === "asset" && selectedCanvasItem.assetKind === "palette"
      ? figurePaletteReferences.find((palette) => palette.id === selectedCanvasItem.assetId) ?? null
      : null;
  const selectedGraphNode = graph.nodes.find((node) => node.id === graph.selectedNodeId) ?? graph.nodes[0] ?? null;
  const graphNodeById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node] as const)),
    [graph.nodes],
  );

  useEffect(() => {
    if (selectedCanvasItem?.type !== "template") return;
    const kind = selectedCanvasItem.templateKind;
    if (kind !== "layout" && kind !== "style") return;
    const reference = kind === "layout" ? layoutReference : styleReference;
    if (!reference) return;
    placeReferenceOnCanvas(reference, kind, { x: selectedCanvasItem.x, y: selectedCanvasItem.y });
  }, [
    selectedCanvasItem?.id,
    selectedCanvasItem?.type,
    selectedCanvasItem?.templateKind,
    layoutReference?.id,
    styleReference?.id,
  ]);

  useEffect(() => {
    if (!selectionConfirmOpen || selectionConfirmPromptDirty) return;
    const draft = buildCanvasGenerationDraft(selectionConfirmExcludedIdSet);
    if (draft) setSelectionConfirmPrompt(draft.promptText);
  }, [
    selectionConfirmOpen,
    selectionConfirmPromptDirty,
    selectionConfirmExcludedIdSet,
    selectionConfirmSkeletonId,
    selectionConfirmStyleReferenceId,
    selectionConfirmAddedIconIds,
    selectedCompositionItems,
    prompt,
    generationBrief,
    layoutReference?.id,
    styleReference?.id,
    customIconReferences,
    diagramSkeletonCandidates,
  ]);

  useEffect(() => {
    if (!selectionConfirmOpen) return;
    const draft = buildCanvasGenerationDraft(selectionConfirmExcludedIdSet);
    if (!draft) return;
    const baseVariant = draft.baseOutputItem?.variantId
      ? variants.find((variant) => variant.id === draft.baseOutputItem?.variantId) ?? null
      : null;
    const baseImageUrl = baseVariant && draft.baseOutputItem
      ? variantPreviewSrc(baseVariant, draft.baseOutputItem.outputStage ?? "final")
      : null;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (baseImageUrl) {
        void selectionConfirmAnnotationRef.current?.exportToPngDataUrl().then((image) => {
          if (!cancelled) setSelectionConfirmControlPreview(image ?? null);
        });
      } else {
        void buildSelectionConfirmControlImageDataUrl(draft).then((image) => {
          if (!cancelled) setSelectionConfirmControlPreview(image);
        });
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    selectionConfirmOpen,
    selectionConfirmExcludedIdSet,
    selectionConfirmPositions,
    selectionConfirmSizes,
    selectionConfirmArrows,
    selectionConfirmNotes,
    selectionConfirmAnnotationSnapshotsByCanvasId,
    selectionConfirmAnnotationMarkupByCanvasId,
    selectionConfirmSkeletonId,
    selectionConfirmStyleReferenceId,
    selectionConfirmAddedIconIds,
    selectedCompositionItems,
    variants,
    diagramSkeletonCandidates,
  ]);

  useEffect(() => {
    if (!selectionConfirmOpen) return;
    const element = selectionConfirmCanvasShellRef.current;
    if (!element) return;
    const updateWidth = () => {
      setSelectionConfirmCanvasWidth(Math.max(760, Math.floor(element.clientWidth - 2)));
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, [selectionConfirmOpen]);

  useEffect(() => {
    if (!selectionConfirmOpen) return;
    setSelectionConfirmOpen(false);
    setSelectionConfirmControlItemId(null);
    setSelectionConfirmControlPreview(null);
  }, [activeCanvasConfirmKey]);

  useEffect(() => {
    if (!selectionConfirmOpen || !selectionConfirmControlItemId) return;
    const draft = buildCanvasGenerationDraft(selectionConfirmExcludedIdSet);
    if (!draft) return;
    const snapshot = buildSelectionConfirmSnapshot(draft, selectionConfirmPrompt || draft.promptText);
    upsertSelectionConfirmControlItem(
      selectionConfirmControlItemId,
      draft,
      snapshot,
      selectionConfirmControlPreview,
      { trackUndo: false },
    );
  }, [
    selectionConfirmOpen,
    selectionConfirmControlItemId,
    selectionConfirmExcludedIdSet,
    selectionConfirmPrompt,
    selectionConfirmPositions,
    selectionConfirmSizes,
    selectionConfirmArrows,
    selectionConfirmNotes,
    selectionConfirmSkeletonId,
    selectionConfirmStyleReferenceId,
    selectionConfirmAddedIconIds,
    selectionConfirmAdvancedOpen,
    selectionConfirmControlPreview,
    selectedCompositionItems,
    diagramSkeletonCandidates,
  ]);

  useEffect(() => {
    function measurePorts() {
      if (!canvasRef.current) return;
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const scaleX = canvasRect.width > 0 ? canvasWidth / canvasRect.width : 1;
      const scaleY = canvasRect.height > 0 ? canvasHeight / canvasRect.height : 1;
      const nextAnchors: Record<string, { x: number; y: number }> = {};
      canvasRef.current.querySelectorAll<HTMLElement>("[data-port-key]").forEach((element) => {
        const key = element.dataset.portKey;
        if (!key) return;
        const dot = element.querySelector<HTMLElement>(".intent-port-dot");
        const rect = (dot ?? element).getBoundingClientRect();
        nextAnchors[key] = {
          x: (rect.left - canvasRect.left + rect.width / 2) * scaleX,
          y: (rect.top - canvasRect.top + rect.height / 2) * scaleY,
        };
      });
      setPortAnchors(nextAnchors);
    }
    let frame = window.requestAnimationFrame(measurePorts);
    const requestMeasure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measurePorts);
    };
    const observer = new ResizeObserver(requestMeasure);
    if (canvasRef.current) {
      observer.observe(canvasRef.current);
      canvasRef.current.querySelectorAll<HTMLElement>("[data-port-key]").forEach((element) => {
        observer.observe(element);
      });
      canvasRef.current.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
        image.addEventListener("load", requestMeasure);
      });
    }
    window.addEventListener("resize", requestMeasure);
    window.visualViewport?.addEventListener("resize", requestMeasure);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", requestMeasure);
      window.visualViewport?.removeEventListener("resize", requestMeasure);
      canvasRef.current?.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
        image.removeEventListener("load", requestMeasure);
      });
    };
  }, [graph.nodes, graph.edges, layoutReferenceId, canvasFocusReferenceId, selectedIconReferenceIds, fontReferenceId, selectedVariantId, board.length, visibleOutputVariants.length]);

  function updateGraph(updater: (graph: ReturnType<typeof createDefaultIntentGraph>) => ReturnType<typeof createDefaultIntentGraph>) {
    setState((current) => ({
      ...current,
      intentGraph: updater(current.intentGraph ?? createDefaultIntentGraph()),
    }));
  }

  function canvasSnapshotKey(canvas: typeof canvasState) {
    return JSON.stringify(canvas);
  }

  function activeCanvasDocumentForState(current: typeof state) {
    const fallbackCanvas = current.creativeCanvas ?? emptyCreativeCanvas;
    const now = new Date().toISOString();
    const documents =
      current.creativeCanvases?.length
        ? current.creativeCanvases
        : [
            {
              id: current.activeCreativeCanvasId || "creative-canvas-1",
              title: "Canvas 1",
              createdAt: now,
              updatedAt: now,
              canvas: fallbackCanvas,
              undoStack: current.creativeCanvasUndoStack ?? [],
            },
          ];
    const activeId = current.activeCreativeCanvasId || documents[0].id;
    const activeDocument = documents.find((document) => document.id === activeId) ?? documents[0];
    return { documents, activeId: activeDocument.id, activeDocument };
  }

  function updateActiveCanvasDocument(
    current: typeof state,
    nextCanvas: typeof canvasState,
    nextUndoStack: typeof state.creativeCanvasUndoStack,
  ) {
    const { documents, activeId } = activeCanvasDocumentForState(current);
    const updatedAt = new Date().toISOString();
    const nextDocuments = documents.map((document) =>
      document.id === activeId
        ? { ...document, canvas: nextCanvas, undoStack: nextUndoStack, updatedAt }
        : document,
    );
    return {
      creativeCanvas: nextCanvas,
      creativeCanvasUndoStack: nextUndoStack,
      creativeCanvases: nextDocuments,
      activeCreativeCanvasId: activeId,
    };
  }

  function updateCreativeCanvas(
    updater: (canvas: typeof canvasState) => typeof canvasState,
    options: { trackUndo?: boolean } = {},
  ) {
    setState((current) => ({
      ...current,
      ...(() => {
        const { activeDocument } = activeCanvasDocumentForState(current);
        const previous = activeDocument.canvas ?? current.creativeCanvas ?? emptyCreativeCanvas;
        const next = updater(previous);
        const changed = canvasSnapshotKey(previous) !== canvasSnapshotKey(next);
        const shouldTrack = options.trackUndo ?? true;
        const undoStack =
          changed && shouldTrack
            ? [...(activeDocument.undoStack ?? current.creativeCanvasUndoStack ?? []), previous].slice(-80)
            : activeDocument.undoStack ?? current.creativeCanvasUndoStack ?? [];
        return updateActiveCanvasDocument(current, next, undoStack);
      })(),
    }));
  }

  function pushCreativeCanvasUndoSnapshot() {
    setState((current) => {
      const { activeDocument } = activeCanvasDocumentForState(current);
      const canvas = activeDocument.canvas ?? current.creativeCanvas ?? emptyCreativeCanvas;
      const undoStack = [...(activeDocument.undoStack ?? current.creativeCanvasUndoStack ?? []), canvas].slice(-80);
      return {
        ...current,
        ...updateActiveCanvasDocument(current, canvas, undoStack),
      };
    });
  }

  function prepareCanvasDragUndo(itemId: string) {
    pendingDragUndoItemIdRef.current = itemId;
  }

  function clearPendingCanvasDragUndo() {
    pendingDragUndoItemIdRef.current = null;
  }

  function undoCreativeCanvasStep() {
    setState((current) => {
      const { activeDocument } = activeCanvasDocumentForState(current);
      const stack = activeDocument.undoStack ?? current.creativeCanvasUndoStack ?? [];
      const previous = stack.at(-1);
      if (!previous) return { ...current, status: "No canvas step to undo." };
      return {
        ...current,
        ...updateActiveCanvasDocument(current, previous, stack.slice(0, -1)),
        status: "Undid the last canvas step.",
      };
    });
  }

  function saveWorkspaceVersion() {
    const suggested = `Version ${state.workspaceVersions.length + 1}`;
    const name = window.prompt("Name this workspace version", suggested)?.trim();
    if (!name) return;
    const version = {
      id: `workspace-version-${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
      canvas: canvasState,
      skeletonXml: state.diagramSkeletonXml,
      skeletonPlan: state.diagramSkeletonPlan,
      selectedSkeletonId: state.selectedDiagramSkeletonId,
      skeletonCheckpointPlan: state.skeletonCheckpointPlan,
      nodeIconBindings: state.nodeIconBindings,
      customIconReferences: state.customIconReferences,
      referenceRegions: state.referenceRegions,
      board: state.board,
      referenceUsage: state.referenceUsage,
      canvasFocusReferenceId: state.canvasFocusReferenceId,
      fontReferenceId: state.fontReferenceId,
      paletteReferenceId: state.paletteReferenceId,
      styleVisualAnalyses: state.styleVisualAnalyses,
      styleAnalysisStates: state.styleAnalysisStates,
      guidedDialogue: state.guidedDialogue,
      recentIconIds: state.recentIconIds,
      iconReferenceIds: state.iconReferenceIds,
      iconReferenceId: state.iconReferenceId,
      activeStyleKit: state.activeStyleKit,
      skeletonStyleApplications: state.skeletonStyleApplications,
      assignedTaskSnapshot: state.assignedTaskSnapshot,
      prompt: state.prompt,
      promptUpdatedAt: state.promptUpdatedAt,
      promptRevisions: state.promptRevisions,
      currentPromptRevisionId: state.currentPromptRevisionId,
      diagramSkeletonPromptRevisionId: state.diagramSkeletonPromptRevisionId,
      diagramSkeletonPromptFingerprint: state.diagramSkeletonPromptFingerprint,
      candidateGenerationSnapshots: state.candidateGenerationSnapshots,
    };
    setState((current) => ({
      ...current,
      workspaceVersions: [...current.workspaceVersions, version],
      activeWorkspaceVersionId: version.id,
      status: `Saved ${name}.`,
    }));
  }

  function restoreWorkspaceVersion(versionId: string) {
    setState((current) => {
      const version = current.workspaceVersions.find((entry) => entry.id === versionId);
      if (!version) return current;
      const safety = {
        id: `workspace-version-${Date.now()}`,
        name: "Before restore",
        createdAt: new Date().toISOString(),
        canvas: current.creativeCanvas,
        skeletonXml: current.diagramSkeletonXml,
        skeletonPlan: current.diagramSkeletonPlan,
        selectedSkeletonId: current.selectedDiagramSkeletonId,
        skeletonCheckpointPlan: current.skeletonCheckpointPlan,
        nodeIconBindings: current.nodeIconBindings,
        customIconReferences: current.customIconReferences,
        referenceRegions: current.referenceRegions,
        board: current.board,
        referenceUsage: current.referenceUsage,
        canvasFocusReferenceId: current.canvasFocusReferenceId,
        fontReferenceId: current.fontReferenceId,
        paletteReferenceId: current.paletteReferenceId,
        styleVisualAnalyses: current.styleVisualAnalyses,
        styleAnalysisStates: current.styleAnalysisStates,
        guidedDialogue: current.guidedDialogue,
        recentIconIds: current.recentIconIds,
        iconReferenceIds: current.iconReferenceIds,
        iconReferenceId: current.iconReferenceId,
        activeStyleKit: current.activeStyleKit,
        skeletonStyleApplications: current.skeletonStyleApplications,
        assignedTaskSnapshot: current.assignedTaskSnapshot,
        prompt: current.prompt,
        promptUpdatedAt: current.promptUpdatedAt,
        promptRevisions: current.promptRevisions,
        currentPromptRevisionId: current.currentPromptRevisionId,
        diagramSkeletonPromptRevisionId: current.diagramSkeletonPromptRevisionId,
        diagramSkeletonPromptFingerprint: current.diagramSkeletonPromptFingerprint,
        candidateGenerationSnapshots: current.candidateGenerationSnapshots,
      };
      const restoredCustomIcons = normalizeCustomIconReferences(
        version.customIconReferences ?? current.customIconReferences,
      );
      const restoredBoard = version.board ?? current.board;
      const restoredRegions = version.referenceRegions ?? current.referenceRegions;
      const validIconIds = new Set([
        ...scientificIconReferences.map((icon) => icon.id),
        ...restoredCustomIcons.map((icon) => icon.id),
      ]);
      const restoredBindings = Object.fromEntries(
        Object.entries(version.nodeIconBindings ?? current.nodeIconBindings).filter(([, iconId]) => validIconIds.has(iconId)),
      );
      const restoredIconReferenceIds = (version.iconReferenceIds ?? current.iconReferenceIds).filter((id) => validIconIds.has(id));
      const restoredStyleKit = normalizeStyleKit(version.activeStyleKit ?? current.activeStyleKit, {
        validReferenceIds: restoredBoard.map((reference) => reference.id),
        validRegionIds: restoredRegions.map((region) => region.id),
        validIconIds,
        validFontIds: figureFontReferences.map((font) => font.id),
        validPaletteIds: figurePaletteReferences.map((palette) => palette.id),
      });
      const restoredStyleApplications = normalizeSkeletonStyleApplications(
        version.skeletonStyleApplications ?? current.skeletonStyleApplications,
        {
          validSkeletonIds: current.diagramSkeletonCandidates.map((candidate) => candidate.id),
          validIconIds,
        },
      );
      const restoredSelectedSkeletonId = "selectedSkeletonId" in version
        ? version.selectedSkeletonId ?? null
        : current.selectedDiagramSkeletonId;
      const scopedRestoredBindings = restoredSelectedSkeletonId
        ? restoredStyleApplications[restoredSelectedSkeletonId]?.nodeIconBindings ?? restoredBindings
        : restoredBindings;
      return {
        ...current,
        ...updateActiveCanvasDocument(current, version.canvas, [...current.creativeCanvasUndoStack, current.creativeCanvas].slice(-80)),
        diagramSkeletonXml: version.skeletonXml,
        diagramSkeletonPlan: "skeletonPlan" in version ? version.skeletonPlan ?? null : current.diagramSkeletonPlan,
        selectedDiagramSkeletonId: restoredSelectedSkeletonId,
        skeletonCheckpointPlan: "skeletonCheckpointPlan" in version
          ? version.skeletonCheckpointPlan ?? null
          : current.skeletonCheckpointPlan,
        nodeIconBindings: scopedRestoredBindings,
        customIconReferences: restoredCustomIcons,
        board: restoredBoard,
        referenceUsage: version.referenceUsage ?? current.referenceUsage,
        canvasFocusReferenceId: "canvasFocusReferenceId" in version
          ? version.canvasFocusReferenceId ?? null
          : current.canvasFocusReferenceId,
        fontReferenceId: "fontReferenceId" in version
          ? version.fontReferenceId ?? null
          : current.fontReferenceId,
        paletteReferenceId: "paletteReferenceId" in version
          ? version.paletteReferenceId ?? null
          : current.paletteReferenceId,
        styleVisualAnalyses: version.styleVisualAnalyses ?? current.styleVisualAnalyses,
        styleAnalysisStates: version.styleAnalysisStates ?? current.styleAnalysisStates,
        guidedDialogue: version.guidedDialogue ?? current.guidedDialogue,
        referenceRegions: restoredRegions,
        recentIconIds: (version.recentIconIds ?? current.recentIconIds).filter((id) => validIconIds.has(id)),
        iconReferenceIds: restoredIconReferenceIds,
        iconReferenceId:
          (version.iconReferenceId && validIconIds.has(version.iconReferenceId) ? version.iconReferenceId : null) ??
          restoredIconReferenceIds[0] ??
          "robot",
        activeStyleKit: restoredStyleKit,
        skeletonStyleApplications: restoredStyleApplications,
        assignedTaskSnapshot: version.assignedTaskSnapshot ?? current.assignedTaskSnapshot,
        prompt: version.prompt ?? current.prompt,
        generationBrief: version.prompt ?? current.generationBrief,
        promptUpdatedAt: version.promptUpdatedAt ?? current.promptUpdatedAt,
        promptRevisions: version.promptRevisions ?? current.promptRevisions,
        currentPromptRevisionId: "currentPromptRevisionId" in version
          ? version.currentPromptRevisionId ?? null
          : current.currentPromptRevisionId,
        diagramSkeletonPromptRevisionId: "diagramSkeletonPromptRevisionId" in version
          ? version.diagramSkeletonPromptRevisionId ?? null
          : current.diagramSkeletonPromptRevisionId,
        diagramSkeletonPromptFingerprint: "diagramSkeletonPromptFingerprint" in version
          ? version.diagramSkeletonPromptFingerprint ?? null
          : current.diagramSkeletonPromptFingerprint,
        candidateGenerationSnapshots: version.candidateGenerationSnapshots ?? current.candidateGenerationSnapshots,
        reviewResult: [],
        workspaceVersions: [...current.workspaceVersions, safety],
        activeWorkspaceVersionId: version.id,
        status: `Restored ${version.name}; the previous state was saved.`,
      };
    });
  }

  function toggleCanvasItemLock(itemId: string) {
    updateCreativeCanvas((canvas) => ({
      ...canvas,
      items: canvas.items.map((item) => item.id === itemId ? { ...item, locked: !item.locked } : item),
    }));
  }

  function toggleSelectedItemLock() {
    if (!selectedCanvasItem) return;
    toggleCanvasItemLock(selectedCanvasItem.id);
  }

  function toggleCanvasItemProtection(itemId: string) {
    updateCreativeCanvas((canvas) => {
      const target = canvas.items.find((item) => item.id === itemId);
      if (!target) return canvas;
      const nextProtected = !target.protected;
      return {
        ...canvas,
        selectedItemIds: nextProtected
          ? canvas.selectedItemIds.filter((id) => id !== itemId)
          : canvas.selectedItemIds,
        items: canvas.items.map((item) =>
          item.id === itemId ? { ...item, protected: nextProtected } : item,
        ),
      };
    });
    setState((current) => ({
      ...current,
      reviewResult: [],
      status: selectedCanvasItem?.protected
        ? "Content protection removed. Run Review again after further edits."
        : "Content marked as author-validated and excluded from ordinary refinement.",
    }));
  }

  function createCreativeCanvasBoard() {
    setState((current) => {
      const { documents } = activeCanvasDocumentForState(current);
      const now = new Date().toISOString();
      const nextIndex = documents.length + 1;
      const nextCanvas = {
        drawerCollapsed: current.creativeCanvas?.drawerCollapsed ?? false,
        items: createInitialCanvasTemplateWithUniqueIds(nextIndex),
        selectedItemId: `canvas-${nextIndex}-template-layout`,
        selectedItemIds: [],
        templateInitialized: true,
      };
      const nextDocument = {
        id: `creative-canvas-${Date.now()}`,
        title: `Canvas ${nextIndex}`,
        createdAt: now,
        updatedAt: now,
        canvas: nextCanvas,
        undoStack: [],
      };
      return {
        ...current,
        activeCreativeCanvasId: nextDocument.id,
        creativeCanvases: [...documents, nextDocument],
        creativeCanvas: nextCanvas,
        creativeCanvasUndoStack: [],
        status: `${nextDocument.title} created.`,
      };
    });
  }

  function switchCreativeCanvasBoard(canvasId: string) {
    setState((current) => {
      const { documents } = activeCanvasDocumentForState(current);
      const nextDocument = documents.find((document) => document.id === canvasId);
      if (!nextDocument) return current;
      return {
        ...current,
        activeCreativeCanvasId: nextDocument.id,
        creativeCanvases: documents,
        creativeCanvas: nextDocument.canvas,
        creativeCanvasUndoStack: nextDocument.undoStack ?? [],
        status: `${nextDocument.title} selected.`,
      };
    });
  }

  function deleteCreativeCanvasBoard(canvasId: string) {
    setState((current) => {
      const { documents, activeId } = activeCanvasDocumentForState(current);
      if (documents.length <= 1) return { ...current, status: "Keep at least one canvas." };
      const nextDocuments = documents.filter((document) => document.id !== canvasId);
      const nextDocument =
        activeId === canvasId
          ? nextDocuments[Math.max(0, documents.findIndex((document) => document.id === canvasId) - 1)] ?? nextDocuments[0]
          : documents.find((document) => document.id === activeId) ?? nextDocuments[0];
      return {
        ...current,
        activeCreativeCanvasId: nextDocument.id,
        creativeCanvases: nextDocuments,
        creativeCanvas: nextDocument.canvas,
        creativeCanvasUndoStack: nextDocument.undoStack ?? [],
        status: `${documents.find((document) => document.id === canvasId)?.title ?? "Canvas"} removed.`,
      };
    });
  }

  function maxCanvasZ(items: CreativeCanvasItem[]) {
    return items.reduce((max, item) => Math.max(max, item.z), 0);
  }

  function arrangeCreativeCanvas() {
    updateCreativeCanvas((canvas) => {
      const activeItems = canvas.items.filter((item) => !item.deletedAt);
      if (activeItems.length === 0) return canvas;

      const layoutTemplates = activeItems.filter((item) => item.type === "template" && (item.templateKind ?? "layout") === "layout");
      const styleTemplates = activeItems.filter((item) => item.type === "template" && item.templateKind === "style");
      const skeletonTemplates = activeItems.filter((item) => item.type === "template" && item.templateKind === "skeleton");
      const outputTemplates = activeItems.filter((item) => item.type === "template" && item.templateKind === "output");
      const layoutRefs = activeItems.filter((item) => item.type === "reference" && item.role === "layout");
      const styleRefs = activeItems.filter((item) => item.type === "reference" && item.role === "style");
      const skeletons = activeItems.filter((item) => item.type === "skeleton");
      const assets = activeItems.filter((item) => item.type === "asset");
      const controls = activeItems.filter((item) => item.type === "control");
      const outputs = activeItems.filter((item) => item.type === "output");

      const variantSourceById = new Map(
        variants
          .filter((variant) => variant.sourceVariantId)
          .map((variant) => [variant.id, variant.sourceVariantId as string] as const),
      );
      const outputGroups = new Map<
        string,
        { id: string; items: CreativeCanvasItem[]; sourceVariantId: string | null; firstY: number }
      >();
      outputs.forEach((item) => {
        const groupId = item.variantId ?? item.id;
        const existing = outputGroups.get(groupId);
        const candidateSource =
          item.sourceVariantId && item.sourceVariantId !== item.variantId
            ? item.sourceVariantId
            : item.variantId
              ? variantSourceById.get(item.variantId) ?? null
              : null;
        if (existing) {
          existing.items.push(item);
          existing.firstY = Math.min(existing.firstY, item.y);
          if (!existing.sourceVariantId && candidateSource) existing.sourceVariantId = candidateSource;
        } else {
          outputGroups.set(groupId, {
            id: groupId,
            items: [item],
            sourceVariantId: candidateSource,
            firstY: item.y,
          });
        }
      });
      const depthByGroupId = new Map<string, number>();
      const outputGroupDepth = (
        group: { id: string; sourceVariantId: string | null },
        seen = new Set<string>(),
      ): number => {
        const cached = depthByGroupId.get(group.id);
        if (cached !== undefined) return cached;
        if (seen.has(group.id)) return 0;
        seen.add(group.id);
        if (!group.sourceVariantId) {
          depthByGroupId.set(group.id, 0);
          return 0;
        }
        const sourceGroup = outputGroups.get(group.sourceVariantId);
        const depth = sourceGroup ? outputGroupDepth(sourceGroup, seen) + 1 : 1;
        depthByGroupId.set(group.id, depth);
        return depth;
      };
      const sortedOutputGroups = Array.from(outputGroups.values()).sort((a, b) => {
        const aDepth = outputGroupDepth(a);
        const bDepth = outputGroupDepth(b);
        if (aDepth !== bDepth) return aDepth - bDepth;
        const aSource = a.sourceVariantId ?? "";
        const bSource = b.sourceVariantId ?? "";
        if (aSource !== bSource) return aSource.localeCompare(bSource);
        return a.firstY - b.firstY;
      });

      let z = 1;
      const positioned = new Map<string, CreativeCanvasItem>();
      const put = (item: CreativeCanvasItem, x: number, y: number, w = item.w, h = item.h) => {
        if (item.locked) {
          positioned.set(item.id, item);
          z = Math.max(z, item.z + 1);
          return;
        }
        positioned.set(item.id, {
          ...item,
          x,
          y,
          w,
          h,
          z: z++,
        });
      };

      const layoutColumnItems = [...layoutTemplates, ...layoutRefs].sort((a, b) => a.y - b.y);
      const styleColumnItems = [...styleTemplates, ...styleRefs].sort((a, b) => a.y - b.y);
      const skeletonColumnItems = [...skeletonTemplates, ...skeletons].sort((a, b) => a.y - b.y);

      layoutColumnItems.forEach((item, index) => {
        put(item, 72, 96 + index * 360, Math.max(390, Math.min(item.w, 430)), Math.max(260, Math.min(item.h, 300)));
      });
      styleColumnItems.forEach((item, index) => {
        put(item, 600, 96 + index * 360, Math.max(340, Math.min(item.w, 390)), Math.max(260, Math.min(item.h, 300)));
      });
      const styleColumnBottom = styleColumnItems.reduce(
        (bottom, item, index) =>
          Math.max(bottom, 96 + index * 360 + Math.max(260, Math.min(item.h, 300))),
        96,
      );
      const assetBaseY = Math.max(456, styleColumnBottom + 52);
      assets.forEach((item, index) => {
        const row = Math.floor(index / 2);
        const col = index % 2;
        const width = item.assetKind === "font" ? 230 : 190;
        const height = item.assetKind === "font" ? 150 : 158;
        put(item, 600 + col * 242, assetBaseY + row * 208, width, height);
      });
      skeletonColumnItems.forEach((item, index) => {
        put(item, 1060, 132 + index * 452, Math.max(500, Math.min(item.w, 560)), Math.max(330, Math.min(item.h, 390)));
      });
      const arrangedSourceRight = Array.from(positioned.values()).reduce(
        (right, item) => Math.max(right, item.x + item.w),
        0,
      );
      const controlBaseX = Math.max(620, arrangedSourceRight + 76);
      controls.forEach((item, index) => {
        put(item, controlBaseX, 128 + index * 360, Math.max(396, Math.min(item.w, 432)), Math.max(264, Math.min(item.h, 300)));
      });
      const outputBaseX = controls.length > 0 ? controlBaseX + 492 : controlBaseX;
      const outputNextYByDepth = new Map<number, number>();
      let outputTemplateNextY = 128;
      outputTemplates
        .sort((a, b) => a.y - b.y)
        .forEach((item) => {
          const width = Math.max(396, Math.min(item.w, 432));
          const height = Math.max(264, Math.min(item.h, 300));
          put(item, outputBaseX, outputTemplateNextY, width, height);
          outputTemplateNextY += height + 38;
        });
      if (outputTemplates.length > 0) {
        outputNextYByDepth.set(0, outputTemplateNextY + 34);
      }
      sortedOutputGroups.forEach((group) => {
        const generation = outputGroupDepth(group);
        const x = outputBaseX + generation * 492;
        const y = outputNextYByDepth.get(generation) ?? 128;
        const orderedGroupItems = [...group.items].sort((a, b) => {
          const aStage = a.outputStage === "draft" ? 0 : 1;
          const bStage = b.outputStage === "draft" ? 0 : 1;
          return aStage - bStage || a.y - b.y;
        });
        let itemY = y;
        orderedGroupItems.forEach((item) => {
          const width = Math.max(396, Math.min(item.w, 432));
          const height = Math.max(264, Math.min(item.h, 300));
          put(item, x, itemY, width, height);
          itemY += height + 38;
        });
        outputNextYByDepth.set(generation, itemY + 72);
      });

      const arrangedItems = canvas.items.map((item) => positioned.get(item.id) ?? item);
      return {
        ...canvas,
        items: arrangedItems,
        selectedItemId: canvas.selectedItemId && arrangedItems.some((item) => item.id === canvas.selectedItemId && !item.deletedAt)
          ? canvas.selectedItemId
          : arrangedItems.find((item) => !item.deletedAt)?.id ?? null,
      };
    });
    setState((current) => ({ ...current, status: "Canvas arranged into a relaxed workflow." }));
  }

  function selectCanvasItem(itemId: string | null) {
    setCreativeCanvasContextMenu(null);
    updateCreativeCanvas((canvas) => ({ ...canvas, selectedItemId: itemId }), { trackUndo: false });
  }

  function focusDashboardPhase(phase: StudyPhase) {
    if (phase === "envision") {
      setActiveStage("content");
      setDrawerTab("layout");
      setPocketRole("layout");
      setPocketTagFilter("all");
      updateCreativeCanvas((canvas) => ({ ...canvas, drawerCollapsed: false }), { trackUndo: false });
      window.requestAnimationFrame(() => {
        scrollGuideAnchorIntoView("reference-drawer");
      });
      return;
    }

    if (phase === "externalize") {
      const target =
        visibleCanvasItems.find(
          (item) => item.type === "skeleton" && item.skeletonId === selectedDiagramSkeletonId,
        ) ??
        visibleCanvasItems.find((item) => item.type === "skeleton") ??
        visibleCanvasItems.find((item) => item.type === "template" && item.templateKind === "skeleton") ??
        null;
      if (target) selectCanvasItem(target.id);
      setActiveStage("layout");
      setFocusedStructureTargetId(selectedSkeletonPlan?.nodes[0]?.id ?? null);
      window.requestAnimationFrame(() => {
        scrollGuideAnchorIntoView("skeleton-card");
      });
      return;
    }

    // History is part of Evolve too: when the study stage already points at
    // review, keep that focus instead of stealing it back to the Edit view.
    if (state.activeStudyStage === "review") {
      setActiveStage("review");
      window.requestAnimationFrame(() => {
        scrollGuideAnchorIntoView("history-tree");
      });
      return;
    }

    const target =
      visibleCanvasItems.find(
        (item) => item.type === "output" && item.variantId === selectedVariantId,
      ) ??
      [...visibleCanvasItems].reverse().find((item) => item.type === "output") ??
      visibleCanvasItems.find((item) => item.type === "template" && item.templateKind === "output") ??
      null;
    if (target) {
      selectCanvasItem(target.id);
      if (target.variantId) {
        setState((current) => ({ ...current, selectedVariantId: target.variantId ?? current.selectedVariantId }));
      }
    }
    if (selectedVariantId) {
      openVariantInEdit(selectedVariantId);
    } else {
      setActiveStage("style");
    }
    window.requestAnimationFrame(() => {
      scrollGuideAnchorIntoView("output-card");
    });
  }

  useEffect(() => {
    if (!phaseFocusRequest) return;
    focusDashboardPhase(phaseFocusRequest.phase);
    // Phase focus is deliberately keyed to the navigation request/stage only. Canvas edits
    // within a phase must not repeatedly steal the participant's current selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseFocusRequest?.nonce, phaseFocusRequest?.phase]);

  useEffect(() => {
    if (phaseFocusRequest) return;
    focusDashboardPhase(studyPhaseForStage(state.activeStudyStage));
    // Compatibility path for callers that have not adopted phaseFocusRequest yet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeStudyStage, Boolean(phaseFocusRequest)]);

  function toggleCanvasCompositionItem(itemId: string) {
    updateCreativeCanvas((canvas) => {
      if (canvas.items.find((item) => item.id === itemId)?.protected) return canvas;
      const currentIds = canvas.selectedItemIds ?? [];
      const nextIds = currentIds.includes(itemId)
        ? currentIds.filter((id) => id !== itemId)
        : [...currentIds, itemId];
      return { ...canvas, selectedItemIds: nextIds };
    });
  }

  function clearCanvasCompositionSelection() {
    updateCreativeCanvas((canvas) => ({ ...canvas, selectedItemIds: [] }));
  }

  function addReferenceToCanvas(
    reference: ReferenceItem,
    role: CreativeCanvasReferenceRole,
    position = { x: 260, y: 180 },
  ) {
    updateCreativeCanvas((canvas) => {
      const id = makeCanvasItemId(`canvas-ref-${role}-${reference.id}`);
      const offset = canvas.items.length % 4;
      const width = role === "layout" ? 430 + offset * 16 : 360 + offset * 16;
      const height = role === "layout" ? 292 + offset * 12 : 300 + offset * 12;
      const next: CreativeCanvasItem = {
        id,
        type: "reference",
        role,
        referenceId: reference.id,
        x: Math.max(0, position.x),
        y: Math.max(0, position.y),
        w: width,
        h: height,
        z: maxCanvasZ(canvas.items) + 1,
      };
      return { ...canvas, items: [...canvas.items, next], selectedItemId: id };
    });
    setState((current) => {
      const now = new Date().toISOString();
      const next = {
        ...current,
        referenceUsage: {
          ...current.referenceUsage,
          [reference.id]: { ...current.referenceUsage[reference.id], [role]: true },
        },
        layoutReferenceId: role === "layout" ? reference.id : current.layoutReferenceId,
        canvasFocusReferenceId: role === "style" ? reference.id : current.canvasFocusReferenceId,
        activeStyleKit: role === "style"
          ? normalizeStyleKit({
              ...current.activeStyleKit,
              sourceReferenceId: reference.id,
              sourceReferenceIds: Array.from(new Set([...current.activeStyleKit.sourceReferenceIds, reference.id])),
              updatedAt: now,
              confirmedAt: null,
            }, { now })
          : current.activeStyleKit,
        status: `Placed "${reference.title}" on canvas.`,
      };
      return role === "style"
        ? appendStudyEvent(next, {
            stage: "references",
            type: "style_reference_selected",
            targetIds: [reference.id],
            result: "selected",
            metadata: { sourceSurface: "canvas", previousId: current.canvasFocusReferenceId },
          })
        : next;
    });
  }

  function placeReferenceOnCanvas(
    reference: ReferenceItem,
    role: CreativeCanvasReferenceRole,
    position = { x: 260, y: 180 },
  ) {
    const selectedSlot =
      selectedCanvasItem?.type === "template" && selectedCanvasItem.templateKind === role
        ? selectedCanvasItem
        : null;
    if (!selectedSlot) {
      addReferenceToCanvas(reference, role, position);
      return;
    }
    updateCreativeCanvas((canvas) => ({
      ...canvas,
      items: canvas.items.map((item) =>
        item.id === selectedSlot.id
          ? {
              id: item.id,
              type: "reference",
              role,
              referenceId: reference.id,
              x: item.x,
              y: item.y,
              w: item.w,
              h: item.h,
              z: item.z,
            }
          : item,
      ),
      selectedItemId: selectedSlot.id,
    }));
    setState((current) => {
      const now = new Date().toISOString();
      const next = {
        ...current,
        referenceUsage: {
          ...current.referenceUsage,
          [reference.id]: {
            ...current.referenceUsage[reference.id],
            [role]: true,
          },
        },
        layoutReferenceId: role === "layout" ? reference.id : current.layoutReferenceId,
        canvasFocusReferenceId: role === "style" ? reference.id : current.canvasFocusReferenceId,
        activeStyleKit: role === "style"
          ? normalizeStyleKit({
              ...current.activeStyleKit,
              sourceReferenceId: reference.id,
              sourceReferenceIds: Array.from(new Set([...current.activeStyleKit.sourceReferenceIds, reference.id])),
              updatedAt: now,
              confirmedAt: null,
            }, { now })
          : current.activeStyleKit,
        status: `Filled ${role} slot with "${reference.title}".`,
      };
      return role === "style"
        ? appendStudyEvent(next, {
            stage: "references",
            type: "style_reference_selected",
            targetIds: [reference.id],
            result: "selected",
            metadata: { sourceSurface: "canvas_slot", previousId: current.canvasFocusReferenceId },
          })
        : next;
    });
  }

  function addBlankTemplateToCanvas(
    templateKind: CreativeCanvasTemplateKind,
    position = { x: 260, y: 180 },
  ) {
    const meta = canvasTemplateMeta[templateKind];
    updateCreativeCanvas((canvas) => {
      const offset = canvas.items.filter((item) => !item.deletedAt && item.type === "template").length % 4;
      const sizeByKind: Record<CreativeCanvasTemplateKind, { w: number; h: number }> = {
        layout: { w: 390, h: 260 },
        style: { w: 350, h: 260 },
        skeleton: { w: 500, h: 330 },
        output: { w: 396, h: 264 },
      };
      const size = sizeByKind[templateKind];
      const id = makeCanvasItemId(`canvas-template-${templateKind}`);
      const next: CreativeCanvasItem = {
        id,
        type: "template",
        templateKind,
        templateTitle: meta.title,
        templateHint: meta.description,
        x: Math.max(0, position.x - size.w / 2 + offset * 18),
        y: Math.max(0, position.y - 40 + offset * 18),
        w: size.w,
        h: size.h,
        z: maxCanvasZ(canvas.items) + 1,
      };
      return { ...canvas, items: [...canvas.items, next], selectedItemId: id };
    });
    setCreativeCanvasContextMenu(null);
    setState((current) => ({ ...current, status: `Added blank ${meta.label.toLowerCase()} card.` }));
  }

  function addAssetToCanvas(
    assetKind: CreativeCanvasAssetKind,
    assetId: string,
    position = { x: 320, y: 220 },
    options: { label?: string; colors?: string[]; sourceRegionId?: string } = {},
  ) {
    updateCreativeCanvas((canvas) => {
      const id = makeCanvasItemId(`canvas-asset-${assetKind}-${assetId}`);
      const offset = canvas.items.length % 4;
      const width = assetKind === "font" ? 230 + offset * 8 : 190 + offset * 8;
      const height = assetKind === "font" ? 150 + offset * 6 : 158 + offset * 6;
      const next: CreativeCanvasItem = {
        id,
        type: "asset",
        assetKind,
        assetId,
        assetLabel: options.label,
        assetColors: options.colors,
        sourceRegionId: options.sourceRegionId,
        x: Math.max(0, position.x),
        y: Math.max(0, position.y),
        w: width,
        h: height,
        z: maxCanvasZ(canvas.items) + 1,
      };
      return { ...canvas, items: [...canvas.items, next], selectedItemId: id };
    });
    setState((current) => ({ ...current, status: `Placed ${assetKind} reference on canvas.` }));
  }

  function removeConfirmSearchIconFromCanvas(iconId: string) {
    const itemId = confirmSearchCanvasIconItemId(iconId);
    updateCreativeCanvas((canvas) => ({
      ...canvas,
      items: canvas.items.filter((item) => item.id !== itemId),
      selectedItemId: canvas.selectedItemId === itemId ? null : canvas.selectedItemId,
      selectedItemIds: (canvas.selectedItemIds ?? []).filter((id) => id !== itemId),
    }));
  }

  function addSkeletonToCanvas(skeletonId: string, sourceItem?: CreativeCanvasItem | null) {
    updateCreativeCanvas((canvas) => {
      const width = 590;
      const height = 390;
      const defaultId = `canvas-skeleton-${skeletonId}`;
      const existingSkeleton = canvas.items.find((item) => item.id === defaultId && !item.deletedAt);
      const skeletonSlot =
        existingSkeleton ??
        canvas.items.find(
          (item) =>
            !item.deletedAt &&
            ((item.type === "template" && item.templateKind === "skeleton") || item.type === "skeleton"),
        );
      const id = skeletonSlot?.type === "template" ? skeletonSlot.id : defaultId;
      const withoutExisting = canvas.items.filter(
        (item) => item.id !== id && (!skeletonSlot || item.id !== skeletonSlot.id),
      );
      const source = sourceItem
        ? canvas.items.find((item) => item.id === sourceItem.id) ?? sourceItem
        : canvas.items.find((item) => item.type === "reference" && item.role === "layout" && item.referenceId === layoutReferenceId);
      const iconSource =
        canvas.items.find(
          (item) =>
            item.type === "asset" &&
            item.assetKind === "icon" &&
            item.assetId &&
            selectedIconAssetIdSet.has(item.assetId),
        ) ?? canvas.items.find((item) => item.type === "asset" && item.assetKind === "icon");
      const next: CreativeCanvasItem = {
        id,
        type: "skeleton",
        skeletonId,
        sourceReferenceId: source?.referenceId,
        sourceIconReferenceId: iconSource?.assetId,
        x: Math.max(0, skeletonSlot?.x ?? (source?.x ?? 260) + (source?.w ?? 300) + 46),
        y: Math.max(0, skeletonSlot?.y ?? source?.y ?? 170),
        w: skeletonSlot?.w ?? width,
        h: skeletonSlot?.h ?? height,
        z: maxCanvasZ(withoutExisting) + 1,
      };
      return { ...canvas, items: [...withoutExisting, next], selectedItemId: id };
    });
  }

  function iconAssetTitle(assetId: string) {
    return (
      customIconReferences.find((icon) => icon.id === assetId)?.label ??
      scientificIconReferences.find((icon) => icon.id === assetId)?.label ??
      "Icon reference"
    );
  }

  function selectCustomIconReference(asset: CustomIconReference) {
    setState((current) => {
      const currentIds = current.iconReferenceIds?.length ? current.iconReferenceIds : [current.iconReferenceId];
      const nextIds = Array.from(new Set([...currentIds.filter(Boolean), asset.id]));
      return appendStudyEvent({
        ...current,
        iconReferenceIds: nextIds,
        iconReferenceId: nextIds[0],
        status: `${asset.label} is available in the Icon library and Skeleton text-to-icon mapping.`,
      }, {
        stage: "skeleton",
        type: "custom_icon_selected",
        targetIds: [asset.id, asset.sourceRegionId],
        result: "selected",
        metadata: {
          iconSource: "custom-crop",
          sourceReferenceId: asset.sourceReferenceId,
          sourceRegionId: asset.sourceRegionId,
        },
      });
    });
  }

  function deleteCustomIconReference(asset: CustomIconReference) {
    const bindingCount = Object.values(state.nodeIconBindings).filter((id) => id === asset.id).length;
    const canvasCount = canvasDocuments.reduce(
      (count, document) => count + document.canvas.items.filter(
        (item) => item.type === "asset" && item.assetKind === "icon" && item.assetId === asset.id,
      ).length,
      0,
    );
    if (
      (bindingCount > 0 || canvasCount > 0) &&
      !window.confirm(
        `Remove "${asset.label}"? This will clear ${bindingCount} Skeleton binding${bindingCount === 1 ? "" : "s"} and ${canvasCount} canvas use${canvasCount === 1 ? "" : "s"}. Named versions remain recoverable.`,
      )
    ) return;
    setState((current) => appendStudyEvent(
      removeCustomIconFromWorkspaceState(
        current,
        asset.id,
        `Removed "${asset.label}" and cleared its live Skeleton and canvas dependencies.`,
      ),
      {
        stage: "skeleton",
        type: "custom_icon_removed",
        targetIds: [asset.id, asset.sourceRegionId],
        result: "removed",
        metadata: {
          bindingCount,
          canvasCount,
          sourceReferenceId: asset.sourceReferenceId,
          sourceRegionId: asset.sourceRegionId,
        },
      },
    ));
  }

  function linkIconToSkeletonCandidate(skeletonId: string, iconAssetId: string) {
    updateCreativeCanvas((canvas) => {
      const skeletonCanvasId = `canvas-skeleton-${skeletonId}`;
      const width = 590;
      const height = 390;
      const existingSkeleton = canvas.items.find((item) => item.id === skeletonCanvasId && !item.deletedAt);
      const skeletonSlot =
        existingSkeleton ??
        canvas.items.find(
          (item) =>
            !item.deletedAt &&
            ((item.type === "template" && item.templateKind === "skeleton") || item.type === "skeleton"),
        );
      const source = canvas.items.find((item) => item.type === "reference" && item.role === "layout" && item.referenceId === layoutReferenceId);
      const skeletonBase: CreativeCanvasItem = {
        ...(skeletonSlot ?? {
          id: skeletonCanvasId,
          type: "skeleton" as const,
          x: Math.max(0, (source?.x ?? 260) + (source?.w ?? 300) + 46),
          y: Math.max(0, source?.y ?? 170),
          w: width,
          h: height,
          z: maxCanvasZ(canvas.items) + 1,
        }),
        id: skeletonCanvasId,
        type: "skeleton",
        skeletonId,
        sourceReferenceId: source?.referenceId ?? skeletonSlot?.sourceReferenceId,
        sourceIconReferenceId: iconAssetId,
        sourceIconReferenceIds: Array.from(new Set([...(skeletonSlot?.sourceIconReferenceIds ?? []), skeletonSlot?.sourceIconReferenceId, iconAssetId].filter(Boolean) as string[])),
        w: skeletonSlot?.w ?? width,
        h: skeletonSlot?.h ?? height,
      };
      const existingIcon = canvas.items.find(
        (item) => item.type === "asset" && item.assetKind === "icon" && item.assetId === iconAssetId && !item.deletedAt,
      );
      const iconItem: CreativeCanvasItem = existingIcon ?? {
        id: makeCanvasItemId(`canvas-asset-icon-${iconAssetId}`),
        type: "asset",
        assetKind: "icon",
        assetId: iconAssetId,
        assetLabel: iconAssetTitle(iconAssetId),
        x: Math.max(0, skeletonBase.x + skeletonBase.w + 24),
        y: Math.max(0, skeletonBase.y + 28),
        w: 190,
        h: 158,
        z: maxCanvasZ(canvas.items) + 2,
      };
      const nextItems = canvas.items
        .filter((item) => item.id !== skeletonCanvasId && item.id !== skeletonSlot?.id && item.id !== iconItem.id)
        .concat([{ ...skeletonBase, z: maxCanvasZ(canvas.items) + 1 }, iconItem]);
      return {
        ...canvas,
        items: nextItems,
        selectedItemId: skeletonCanvasId,
        selectedItemIds: Array.from(new Set([skeletonCanvasId, iconItem.id])),
      };
    });
    setState((current) => ({
      ...current,
      selectedDiagramSkeletonId: skeletonId,
      status: `Linked "${iconAssetTitle(iconAssetId)}" to the corresponding skeleton.`,
    }));
  }

  function handleSkeletonCandidateDrop(candidateId: string, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDrawerDragPayload(null);
    const raw = event.dataTransfer.getData("application/x-hichart-reference");
    if (!raw) return;
    let payload: Partial<DrawerDragPayload>;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (payload.type !== "asset" || payload.assetKind !== "icon" || !payload.assetId) {
      setState((current) => ({ ...current, status: "Drop an icon asset onto a skeleton to bind it." }));
      return;
    }
    linkIconToSkeletonCandidate(candidateId, payload.assetId);
  }

  function addOutputToCanvas(
    variantId: string,
    sourceItem?: CreativeCanvasItem | null,
    sourceStyleReferenceId?: string | null,
    sourceSkeletonId?: string | null,
    sourceIconReferenceId?: string | null,
    sourceFontReferenceId?: string | null,
    sourcePaletteReferenceId?: string | null,
    sourceIconReferenceIds?: string[],
    draftVariantIds?: string[],
    sourceCanvasItemIds?: string[],
    controlImageDataUrl?: string | null,
    controlTitle?: string,
    controlSnapshot?: CreativeCanvasConfirmSnapshot | null,
  ) {
    addOutputsToCanvas(
      [variantId],
      sourceItem,
      sourceStyleReferenceId,
      sourceSkeletonId,
      sourceIconReferenceId,
      sourceFontReferenceId,
      sourcePaletteReferenceId,
      sourceIconReferenceIds,
      draftVariantIds,
      sourceCanvasItemIds,
      controlImageDataUrl,
      controlTitle,
      controlSnapshot,
    );
  }

  function addOutputsToCanvas(
    variantIds: string[],
    sourceItem?: CreativeCanvasItem | null,
    sourceStyleReferenceId?: string | null,
    sourceSkeletonId?: string | null,
    sourceIconReferenceId?: string | null,
    sourceFontReferenceId?: string | null,
    sourcePaletteReferenceId?: string | null,
    sourceIconReferenceIds?: string[],
    draftVariantIds?: string[],
    sourceCanvasItemIds?: string[],
    controlImageDataUrl?: string | null,
    controlTitle?: string,
    controlSnapshot?: CreativeCanvasConfirmSnapshot | null,
  ) {
    const ids = Array.from(new Set(variantIds.filter(Boolean)));
    if (ids.length === 0) return;
    updateCreativeCanvas((canvas) => {
      const draftIdSet = new Set(draftVariantIds ?? []);
      const controlId = controlImageDataUrl ? `canvas-control-${ids[0]}` : null;
      const outputIds = new Set(
        ids.flatMap((variantId) => [
          `canvas-output-${variantId}`,
          ...(draftIdSet.has(variantId) ? [`canvas-output-draft-${variantId}`] : []),
          ...(controlId ? [controlId] : []),
        ]),
      );
      const width = 470;
      const height = 320;
      const outputSlot = canvas.items.find(
        (item) => !item.deletedAt && item.type === "template" && item.templateKind === "output",
      );
      const withoutExisting = canvas.items.filter(
        (item) => !outputIds.has(item.id) && (!outputSlot || item.id !== outputSlot.id),
      );
      const source =
        (sourceItem ? canvas.items.find((item) => item.id === sourceItem.id) ?? sourceItem : null) ??
        canvas.items.find((item) => item.type === "skeleton" && item.skeletonId === selectedDiagramSkeletonId) ??
        canvas.items.find((item) => item.type === "reference" && item.role === "style" && item.referenceId === canvasFocusReferenceId);
      const sourceBaseX = Math.max(0, (source?.x ?? 610) + (source?.w ?? 430) + 48);
      const rightmostOutputX = canvas.items
        .filter((item) => item.type === "output" && !item.deletedAt)
        .reduce((max, item) => Math.max(max, item.x + item.w + 56), 0);
      const slotX = outputSlot?.x;
      const slotY = outputSlot?.y;
      const baseX = slotX ?? Math.max(sourceBaseX, rightmostOutputX);
      const baseY = slotY ?? Math.max(0, (source?.y ?? 180) - Math.max(0, ids.length - 1) * 44);
      let z = maxCanvasZ(withoutExisting);
      const controlItem: CreativeCanvasItem | null =
        controlId && controlImageDataUrl
          ? {
              id: controlId,
              type: "control",
              controlImageDataUrl,
              controlImageStorageKey: `creative-canvas:${controlId}:image`,
              controlTitle: controlTitle ?? "Confirm selected elements",
              controlSnapshot: controlSnapshot ?? null,
              sourceReferenceId: source?.type === "reference" ? source.referenceId : source?.sourceReferenceId,
              sourceSkeletonId:
                source?.type === "skeleton" ? source.skeletonId : sourceSkeletonId ?? selectedDiagramSkeletonId ?? undefined,
              sourceStyleReferenceId: sourceStyleReferenceId ?? canvasFocusReferenceId ?? undefined,
              sourceIconReferenceId: sourceIconReferenceId ?? undefined,
              sourceIconReferenceIds: sourceIconReferenceIds?.length ? sourceIconReferenceIds : undefined,
              sourceFontReferenceId: sourceFontReferenceId ?? fontReferenceId ?? undefined,
              sourcePaletteReferenceId: sourcePaletteReferenceId ?? paletteReferenceId ?? undefined,
              sourceCanvasItemIds,
              x: slotX !== undefined ? Math.max(0, slotX - width - 48) : baseX,
              y: baseY,
              w: width,
              h: height,
              z: ++z,
            }
          : null;
      const iconSourceIds = Array.from(
        new Set(
          [
            ...(sourceIconReferenceIds ?? []),
            sourceIconReferenceId,
            !sourceIconReferenceIds?.length && !sourceIconReferenceId ? selectedIconReferenceIds[0] : undefined,
          ].filter((id): id is string => Boolean(id)),
        ),
      );
      const outputs: CreativeCanvasItem[] = ids.flatMap((variantId, index) => {
        const id = slotX !== undefined && index === 0 && outputSlot ? outputSlot.id : `canvas-output-${variantId}`;
        const hasDraft = draftIdSet.has(variantId);
        const hasControl = Boolean(controlItem);
        const y = Math.max(0, baseY + index * 92);
        const finalX = slotX !== undefined && index === 0 ? slotX : hasDraft || hasControl ? baseX + width + 48 : baseX;
        const finalY = slotY !== undefined && index === 0 ? slotY : y;
        const finalW = slotX !== undefined && index === 0 ? Math.max(outputSlot?.w ?? width, width) : width;
        const finalH = slotY !== undefined && index === 0 ? Math.max(outputSlot?.h ?? height, height) : height;
        const draftItem: CreativeCanvasItem | null = hasDraft
          ? {
              id: `canvas-output-draft-${variantId}`,
              type: "output",
              variantId,
              outputStage: "draft",
              sourceReferenceId: source?.type === "reference" ? source.referenceId : source?.sourceReferenceId,
              sourceSkeletonId:
                source?.type === "skeleton" ? source.skeletonId : sourceSkeletonId ?? selectedDiagramSkeletonId ?? undefined,
              sourceStyleReferenceId: sourceStyleReferenceId ?? canvasFocusReferenceId ?? undefined,
              x: slotX !== undefined && index === 0 ? Math.max(0, (source?.x ?? 610) + (source?.w ?? 430) + 48) : baseX,
              y,
              w: width,
              h: height,
              z: ++z,
            }
          : null;
        const finalItem: CreativeCanvasItem = {
          id,
          type: "output",
          variantId,
          outputStage: "final",
          sourceVariantId: hasDraft ? variantId : source?.type === "output" ? source.variantId : undefined,
          sourceReferenceId: hasDraft ? undefined : source?.type === "reference" ? source.referenceId : source?.sourceReferenceId,
          sourceSkeletonId:
            hasDraft ? undefined : source?.type === "skeleton" ? source.skeletonId : sourceSkeletonId ?? selectedDiagramSkeletonId ?? undefined,
          sourceStyleReferenceId: hasDraft ? undefined : sourceStyleReferenceId ?? canvasFocusReferenceId ?? undefined,
          sourceIconReferenceId: iconSourceIds[0] ?? undefined,
          sourceIconReferenceIds: iconSourceIds,
          sourceFontReferenceId: sourceFontReferenceId ?? fontReferenceId ?? undefined,
          sourcePaletteReferenceId: sourcePaletteReferenceId ?? paletteReferenceId ?? undefined,
          sourceCanvasItemIds: Array.from(new Set([...(sourceCanvasItemIds ?? []), ...(controlItem ? [controlItem.id] : [])])),
          x: finalX,
          y: finalY,
          w: finalW,
          h: finalH,
          z: ++z,
        };
        return draftItem ? [draftItem, finalItem] : [finalItem];
      });
      return { ...canvas, items: [...withoutExisting, ...(controlItem ? [controlItem] : []), ...outputs], selectedItemId: outputs.at(-1)?.id ?? null };
    });
  }

  function moveCanvasItem(itemId: string, dx: number, dy: number) {
    if (canvasState.items.find((item) => item.id === itemId)?.locked) return;
    if (pendingDragUndoItemIdRef.current === itemId) {
      pendingDragUndoItemIdRef.current = null;
      pushCreativeCanvasUndoSnapshot();
    }
    updateCreativeCanvas((canvas) => ({
      ...canvas,
      items: canvas.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              x: Math.max(0, item.x + dx),
              y: Math.max(0, item.y + dy),
            }
          : item,
      ),
    }), { trackUndo: false });
  }

  function resizeCanvasItem(itemId: string, dw: number, dh: number) {
    if (canvasState.items.find((item) => item.id === itemId)?.locked) return;
    if (pendingDragUndoItemIdRef.current === itemId) {
      pendingDragUndoItemIdRef.current = null;
      pushCreativeCanvasUndoSnapshot();
    }
    updateCreativeCanvas((canvas) => ({
      ...canvas,
      items: canvas.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              w: Math.max(96, item.w + dw),
              h: Math.max(72, item.h + dh),
            }
          : item,
      ),
    }), { trackUndo: false });
  }

  function deleteCanvasItem(itemId: string) {
    if (canvasState.items.find((item) => item.id === itemId)?.locked) {
      setState((current) => ({ ...current, status: "Unlock this canvas item before removing it." }));
      return;
    }
    updateCreativeCanvas((canvas) => ({
      ...canvas,
      items: canvas.items.flatMap((item) => {
        if (item.id !== itemId) return [item];
        if (item.type === "output") return [{ ...item, deletedAt: new Date().toISOString() }];
        return [];
      }),
      selectedItemId: canvas.selectedItemId === itemId ? null : canvas.selectedItemId,
      selectedItemIds: (canvas.selectedItemIds ?? []).filter((id) => id !== itemId),
    }));
    setState((current) => ({ ...current, status: "Removed canvas item." }));
  }

  function bringCanvasItemForward(itemId: string, options: { trackUndo?: boolean } = {}) {
    if (canvasState.items.find((item) => item.id === itemId)?.locked) return;
    updateCreativeCanvas((canvas) => ({
      ...canvas,
      items: canvas.items.map((item) =>
        item.id === itemId ? { ...item, z: maxCanvasZ(canvas.items) + 1 } : item,
      ),
      selectedItemId: itemId,
    }), { trackUndo: options.trackUndo ?? false });
  }

  function duplicateCanvasItem(itemId: string) {
    updateCreativeCanvas((canvas) => {
      const source = canvas.items.find((item) => item.id === itemId);
      if (!source) return canvas;
      const id = makeCanvasItemId(`${source.id}-copy`);
      const next: CreativeCanvasItem = {
        ...source,
        id,
        locked: false,
        protected: false,
        x: Math.max(0, source.x + 34),
        y: Math.max(0, source.y + 34),
        z: maxCanvasZ(canvas.items) + 1,
      };
      return { ...canvas, items: [...canvas.items, next], selectedItemId: id };
    });
    setState((current) => ({ ...current, status: "Duplicated canvas item." }));
  }

  function handlePocketDragStart(reference: ReferenceItem, role: CreativeCanvasReferenceRole, event: DragEvent) {
    const payload: DrawerDragPayload = { type: "reference", referenceId: reference.id, role };
    event.dataTransfer.setData("application/x-hichart-reference", JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "copy";
    setDrawerDragPayload(payload);
  }

  function handleAssetDragStart(assetKind: CreativeCanvasAssetKind, assetId: string, event: DragEvent) {
    const payload: DrawerDragPayload = { type: "asset", assetKind, assetId };
    event.dataTransfer.setData("application/x-hichart-reference", JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "copy";
    setDrawerDragPayload(payload);
  }

  function handlePocketDragEnd() {
    setDrawerDragPayload(null);
    setCanvasDropLabel(null);
  }

  function handleCanvasDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setCanvasDropLabel(null);
    setDrawerDragPayload(null);
    const raw = event.dataTransfer.getData("application/x-hichart-reference");
    if (!raw) return;
    let payload: Partial<DrawerDragPayload>;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const position = {
      x: event.clientX - rect.left - 125,
      y: event.clientY - rect.top - 80,
    };
    if (payload.type === "reference") {
      if (!payload.referenceId || (payload.role !== "layout" && payload.role !== "style")) return;
      const reference = board.find((item) => item.id === payload.referenceId);
      if (!reference) return;
      placeReferenceOnCanvas(reference, payload.role, position);
      return;
    }
    if (payload.type === "asset") {
      if (
        !payload.assetId ||
        (payload.assetKind !== "icon" && payload.assetKind !== "font" && payload.assetKind !== "palette")
      ) {
        return;
      }
      addAssetToCanvas(payload.assetKind, payload.assetId, position);
    }
  }

  function useCanvasReferenceAs(
    role: CreativeCanvasReferenceRole,
    reference: ReferenceItem,
    sourceSurface = "canvas_inspector",
  ) {
    // Template slots only exist on the Advanced Board; in Studio a stale board
    // selection must not turn a source click into a canvas drop.
    if (
      workspaceView === "advanced-board" &&
      selectedCanvasItem?.type === "template" &&
      selectedCanvasItem.templateKind === role
    ) {
      placeReferenceOnCanvas(reference, role, { x: selectedCanvasItem.x, y: selectedCanvasItem.y });
      return;
    }
    setState((current) => {
      const now = new Date().toISOString();
      const next = {
        ...current,
        referenceUsage: {
          ...current.referenceUsage,
          [reference.id]: {
            ...current.referenceUsage[reference.id],
            [role]: true,
          },
        },
        layoutReferenceId: role === "layout" ? reference.id : current.layoutReferenceId,
        canvasFocusReferenceId: role === "style" ? reference.id : current.canvasFocusReferenceId,
        activeStyleKit: role === "style"
          ? normalizeStyleKit({
              ...current.activeStyleKit,
              sourceReferenceId: reference.id,
              sourceReferenceIds: Array.from(new Set([...current.activeStyleKit.sourceReferenceIds, reference.id])),
              updatedAt: now,
              confirmedAt: null,
            }, { now })
          : current.activeStyleKit,
        guidedDialogue: role === "style"
          ? {
              ...current.guidedDialogue,
              currentSteps: { ...current.guidedDialogue.currentSteps, style: "analysis_choice" },
              decisions: current.guidedDialogue.decisions.style
                ? {
                    ...current.guidedDialogue.decisions,
                    style: { ...current.guidedDialogue.decisions.style, status: "stale" as const },
                  }
                : current.guidedDialogue.decisions,
            }
          : current.guidedDialogue,
        status: `Selected "${reference.title}" as ${role} reference.`,
      };
      const selected = appendStudyEvent(next, {
        stage: "references",
        type: role === "style" ? "style_reference_selected" : "layout_reference_selected",
        targetIds: [reference.id],
        result: "selected",
        metadata: {
          sourceSurface,
          previousId: role === "style" ? current.canvasFocusReferenceId : current.layoutReferenceId,
        },
      });
      return role === "style" && current.guidedDialogue.decisions.style?.status === "current"
        ? appendStudyEvent(selected, {
            stage: "references",
            type: "narrator_decision_stale",
            targetIds: [current.guidedDialogue.decisions.style.id, reference.id],
            result: "style_reference_changed",
            metadata: { surface: "style" },
          })
        : selected;
    });
  }

  function clearCanvasReferenceSelection(role: CreativeCanvasReferenceRole, reference: ReferenceItem) {
    setState((current) => {
      const now = new Date().toISOString();
      const activeStyleKit = role === "style" && current.activeStyleKit.sourceReferenceIds.includes(reference.id)
        ? normalizeStyleKit({
            ...current.activeStyleKit,
            sourceReferenceId: current.activeStyleKit.sourceReferenceId === reference.id
              ? null
              : current.activeStyleKit.sourceReferenceId,
            sourceReferenceIds: current.activeStyleKit.sourceReferenceIds.filter((id) => id !== reference.id),
            updatedAt: now,
            confirmedAt: null,
          }, { now })
        : current.activeStyleKit;
      const next = {
        ...current,
      referenceUsage: {
        ...current.referenceUsage,
        [reference.id]: {
          ...current.referenceUsage[reference.id],
          [role]: false,
        },
      },
      layoutReferenceId: role === "layout" && current.layoutReferenceId === reference.id ? null : current.layoutReferenceId,
      canvasFocusReferenceId: role === "style" && current.canvasFocusReferenceId === reference.id ? null : current.canvasFocusReferenceId,
      activeStyleKit,
      status: `Cleared "${reference.title}" as ${role} reference.`,
      };
      return role === "style"
        ? appendStudyEvent(next, {
            stage: "references",
            type: "style_kit_item_removed",
            targetIds: [reference.id],
            result: "removed",
            metadata: { itemKind: "source" },
          })
        : next;
    });
  }

  function useCanvasSkeleton(candidate: DiagramSkeletonCandidate) {
    handleSelectSkeletonCandidate(candidate);
  }

  function applyActiveStyleKitToSkeleton(candidate: DiagramSkeletonCandidate) {
    const appliedAt = new Date().toISOString();
    setState((current) => {
      const previousBindings =
        current.skeletonStyleApplications[candidate.id]?.nodeIconBindings ??
        (current.selectedDiagramSkeletonId === candidate.id ? current.nodeIconBindings : {});
      const previousFontBindings =
        current.skeletonStyleApplications[candidate.id]?.nodeFontBindings ??
        (current.selectedDiagramSkeletonId === candidate.id ? current.nodeFontBindings : {});
      const previousColorBindings =
        current.skeletonStyleApplications[candidate.id]?.nodeColorBindings ??
        (current.selectedDiagramSkeletonId === candidate.id ? current.nodeColorBindings : {});
      const application = createSkeletonStyleApplication(
        candidate.id,
        current.activeStyleKit,
        previousBindings,
        appliedAt,
        previousFontBindings,
        previousColorBindings,
      );
      const styleReferenceId = application.styleKitSnapshot.sourceReferenceId;
      const sourceReferenceIds = styleReferenceId
        ? current.canvasGenerationReferenceIds.includes(styleReferenceId)
          ? current.canvasGenerationReferenceIds
          : [...current.canvasGenerationReferenceIds, styleReferenceId]
        : current.canvasGenerationReferenceIds;
      const next = {
        ...current,
        selectedDiagramSkeletonId: candidate.id,
        skeletonStyleApplications: {
          ...current.skeletonStyleApplications,
          [candidate.id]: application,
        },
        nodeIconBindings: application.nodeIconBindings,
        canvasFocusReferenceId: styleReferenceId ?? current.canvasFocusReferenceId,
        iconReferenceIds: application.styleKitSnapshot.iconIds,
        iconReferenceId: application.styleKitSnapshot.iconIds[0] ?? current.iconReferenceId,
        referenceUsage: styleReferenceId
          ? {
              ...current.referenceUsage,
              [styleReferenceId]: { ...current.referenceUsage[styleReferenceId], style: true },
            }
          : current.referenceUsage,
        canvasGenerationReferenceIds: sourceReferenceIds,
        status: `Applied the broad style reference set to "${candidate.title}". Choose icons per node; edit palette and text later in Edit.`,
      };
      return appendStudyEvent(next, {
        stage: "skeleton",
        type: "style_kit_applied",
        targetIds: [candidate.id, ...current.activeStyleKit.iconIds],
        result: application.styleKitFingerprint,
        metadata: {
          sourceReferenceId: current.activeStyleKit.sourceReferenceId,
          iconCount: current.activeStyleKit.iconIds.length,
        },
      });
    });
  }

  function clearActiveStyleKitSource() {
    setState((current) => {
      const now = new Date().toISOString();
      const activeStyleKit = normalizeStyleKit({
        ...current.activeStyleKit,
        sourceReferenceId: null,
        sourceReferenceIds: [],
        updatedAt: now,
        confirmedAt: null,
      }, { now });
      return appendStudyEvent({
        ...current,
        activeStyleKit,
        canvasFocusReferenceId: null,
        status: "Cleared the broad style reference. Saved icons and motifs remain available.",
      }, {
        stage: "references",
        type: "style_kit_item_removed",
        targetIds: [],
        result: "source",
        metadata: { itemKind: "source" },
      });
    });
  }

  function clearActiveStyleKitVisualVocabulary() {
    setState((current) => {
      const targetIds = Array.from(new Set([
        ...current.activeStyleKit.iconIds,
        ...current.activeStyleKit.patternIds,
        ...current.activeStyleKit.regionIds,
      ]));
      if (!targetIds.length) return current;
      const now = new Date().toISOString();
      const activeStyleKit = normalizeStyleKit({
        ...current.activeStyleKit,
        iconIds: [],
        patternIds: [],
        regionIds: [],
        updatedAt: now,
        confirmedAt: null,
      }, { now });
      return appendStudyEvent({
        ...current,
        activeStyleKit,
        iconReferenceIds: [],
        iconReferenceId: scientificIconReferences[0].id,
        status: "Removed icons, motifs, and selected areas from the current style reference set.",
      }, {
        stage: "references",
        type: "style_kit_item_removed",
        targetIds,
        result: "removed",
        metadata: { itemKind: "visual_vocabulary" },
      });
    });
  }

  function clearCanvasSkeleton(candidate: DiagramSkeletonCandidate) {
    setState((current) => ({
      ...current,
      selectedDiagramSkeletonId: current.selectedDiagramSkeletonId === candidate.id ? null : current.selectedDiagramSkeletonId,
      status: `Cleared "${candidate.title}" as selected skeleton.`,
    }));
  }

  function toggleIconReference(asset: (typeof scientificIconReferences)[number]) {
    setState((current) => {
      const currentIds = current.iconReferenceIds?.length ? current.iconReferenceIds : [current.iconReferenceId];
      const selected = currentIds.includes(asset.id);
      const nextIds = selected
        ? currentIds.filter((id) => id !== asset.id)
        : [...currentIds, asset.id];
      const normalizedIds = nextIds.length ? nextIds : [asset.id];
      return {
        ...current,
        iconReferenceIds: normalizedIds,
        iconReferenceId: normalizedIds[0],
        status: selected
          ? `${asset.label} removed from icon references.`
          : `${asset.label} added as icon reference.`,
      };
    });
  }

  function useCanvasAsset(item: CreativeCanvasItem) {
    if (item.type !== "asset" || !item.assetKind || !item.assetId) return;
    if (item.assetKind === "icon") {
      const asset = scientificIconReferences.find((entry) => entry.id === item.assetId);
      const customIcon = customIconReferences.find((entry) => entry.id === item.assetId);
      if (!asset && customIcon) {
        const customStyleCrop = isStyleCropReference(customIcon);
        setState((current) => {
          const currentIds = current.iconReferenceIds?.length ? current.iconReferenceIds : [current.iconReferenceId];
          const nextIds = Array.from(new Set([...currentIds.filter(Boolean), customIcon.id]));
          return {
            ...current,
            iconReferenceIds: nextIds,
            status: `${customIcon.label} added as ${customStyleCrop ? "style crop" : "detected icon"} reference.`,
          };
        });
        return;
      }
      if (!asset) return;
      setState((current) => ({
        ...current,
        iconReferenceIds: Array.from(new Set([...(current.iconReferenceIds ?? [current.iconReferenceId]), asset.id])),
        iconReferenceId: asset.id,
        status: `${asset.label} added as icon reference.`,
      }));
    }
    if (item.assetKind === "font") {
      const font = figureFontReferences.find((entry) => entry.id === item.assetId);
      if (!font) return;
      setState((current) => ({
        ...current,
        fontReferenceId: font.id,
        status: `${font.label} selected as typography reference.`,
      }));
    }
    if (item.assetKind === "palette") {
      const palette = figurePaletteReferences.find((entry) => entry.id === item.assetId);
      if (!palette) {
        setState((current) => ({
          ...current,
          status: `${item.assetLabel ?? "Region palette"} selected as palette reference.`,
        }));
        return;
      }
      setState((current) => ({
        ...current,
        paletteReferenceId: palette.id,
        status: `${palette.label} selected as palette reference.`,
      }));
    }
    if (item.assetKind === "pattern") {
      setState((current) => ({
        ...current,
        status: `${item.assetLabel ?? "Style pattern"} selected as a visual pattern reference.`,
      }));
    }
  }

  function clearCanvasAsset(item: CreativeCanvasItem) {
    if (item.type !== "asset" || !item.assetKind || !item.assetId) return;
    if (item.assetKind === "icon") {
      const customIcon = customIconReferences.find((entry) => entry.id === item.assetId);
      const customStyleCrop = isStyleCropReference(customIcon);
      setState((current) => {
        const currentIds = current.iconReferenceIds?.length ? current.iconReferenceIds : [current.iconReferenceId];
        const nextIds = currentIds.filter((id) => id !== item.assetId);
        const fallback = nextIds[0] ?? scientificIconReferences[0].id;
        return {
          ...current,
          iconReferenceIds: nextIds.length ? nextIds : [fallback],
          iconReferenceId: fallback,
          status: customIcon
            ? `${customIcon.label} cleared as ${customStyleCrop ? "style crop" : "icon"} reference.`
            : "Icon reference cleared.",
        };
      });
    }
    if (item.assetKind === "font") {
      setState((current) => ({
        ...current,
        fontReferenceId: current.fontReferenceId === item.assetId ? null : current.fontReferenceId,
        status: "Typography reference cleared.",
      }));
    }
    if (item.assetKind === "palette") {
      setState((current) => ({
        ...current,
        paletteReferenceId: current.paletteReferenceId === item.assetId ? null : current.paletteReferenceId,
        status: "Palette reference cleared.",
      }));
    }
  }

  function clearCanvasOutput(variant: FigureVariant) {
    setState((current) => ({
      ...current,
      selectedVariantId: current.selectedVariantId === variant.id ? null : current.selectedVariantId,
      status: `Cleared "${variant.title}" as selected output.`,
    }));
  }

  function renderCreativeItemFooter(title: string, action?: ReactNode) {
    return (
      <div className="creative-item-footer">
        <p>{title}</p>
        {action}
      </div>
    );
  }

  function renderCanvasCompositionCheckbox(item: CreativeCanvasItem) {
    if (item.type === "template") return null;
    const checked = selectedCanvasItemIdSet.has(item.id);
    const isProtected = Boolean(item.protected);
    return (
      <label
        className={`creative-compose-check ${checked ? "is-checked" : ""} ${isProtected ? "is-protected" : ""}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={isProtected}
          onChange={() => toggleCanvasCompositionItem(item.id)}
          aria-label={isProtected ? "Protected from ordinary refinement" : checked ? "Remove from generation use selection" : "Use in generation"}
        />
        <span>{isProtected ? "Protected" : checked ? "Using" : "Use"}</span>
      </label>
    );
  }

  function addStyleIngredientsToCanvas(sourceItem: CreativeCanvasItem, reference: ReferenceItem) {
    const regions = referenceRegions
      .filter((region) => region.referenceId === reference.id && region.intent === "style");
    if (regions.length === 0) {
      setState((current) => ({ ...current, status: "Mark style regions before adding ingredients." }));
      return;
    }
    let added = 0;
    for (const [index, region] of regions.entries()) {
      const x = sourceItem.x + sourceItem.w + 34 + (index % 2) * 216;
      const y = sourceItem.y + index * 88;
      if (region.iconEnabled && region.suggestedIconId) {
        const customIcon =
          region.selectedIconSource === "detected" && region.customIconId
            ? customIconReferences.find((item) => item.id === region.customIconId)
            : null;
        addAssetToCanvas(
          "icon",
          customIcon?.id ?? region.suggestedIconId,
          { x, y: y + 44 },
          {
            label: customIcon?.label,
            sourceRegionId: region.id,
          },
        );
        added += 1;
      }
      if (region.fontEnabled && region.suggestedFontId) {
        addAssetToCanvas(
          "font",
          region.suggestedFontId,
          { x, y: y + 88 },
          { sourceRegionId: region.id },
        );
        added += 1;
      }
    }
    setState((current) => ({
      ...current,
      status: added > 0 ? `Added ${added} style ingredients to canvas.` : "No enabled style ingredients to add.",
    }));
  }

  function handleOpenCanvasItemPreview(item: CreativeCanvasItem) {
    if (item.type === "template") {
      const kind = item.templateKind ?? "layout";
      if (kind === "layout") {
        setDrawerTab("layout");
        setPocketRole("layout");
        updateCreativeCanvas((canvas) => ({ ...canvas, drawerCollapsed: false }), { trackUndo: false });
        openLayoutReferenceStage();
        return;
      }
      if (kind === "style") {
        setDrawerTab("style");
        setPocketRole("style");
        updateCreativeCanvas((canvas) => ({ ...canvas, drawerCollapsed: false }), { trackUndo: false });
        setActiveStage("style");
        setState((current) => ({ ...current, status: "Opened style editor." }));
        return;
      }
      if (kind === "skeleton") {
        setSkeletonManagerOpen(true);
        setState((current) => ({ ...current, status: "Opened skeleton manager." }));
        return;
      }
      void handleGenerateComposition();
      return;
    }
    if (item.type === "reference") {
      const reference = item.referenceId ? board.find((entry) => entry.id === item.referenceId) : null;
      if (!reference) return;
      if (item.role === "style") {
        useCanvasReferenceAs("style", reference);
        setActiveStage("style");
        setState((current) => ({ ...current, status: `Opened style editor for "${reference.title}".` }));
        return;
      }
      if (item.role === "layout") {
        useCanvasReferenceAs("layout", reference);
        openLayoutReferenceStage();
        setState((current) => ({
          ...current,
          status: `Opened layout workspace for "${reference.title}".`,
        }));
        return;
      }
      setPocketPreviewReference(reference);
      return;
    }
    if (item.type === "skeleton") {
      const candidate = item.skeletonId
        ? diagramSkeletonCandidates.find((entry) => entry.id === item.skeletonId)
        : null;
      if (candidate) {
        useCanvasSkeleton(candidate);
        if (candidate.xml) {
          setDrawioOpen(true);
        } else {
          setSkeletonManagerOpen(true);
        }
      }
      return;
    }
    if (item.type === "control") {
      restoreSelectionConfirmFromControl(item);
      return;
    }
    const variant = item.variantId ? variants.find((entry) => entry.id === item.variantId) : null;
    if (variant) {
      openVariantInEdit(variant.id);
    }
  }

  function clearHoveredCanvasItem(itemId: string) {
    setHoveredCanvasItemId((current) => (current === itemId ? null : current));
  }

  function renderCreativeItemToolbar(item: CreativeCanvasItem) {
    const reference = item.referenceId ? board.find((entry) => entry.id === item.referenceId) : null;
    const skeleton = item.skeletonId
      ? diagramSkeletonCandidates.find((entry) => entry.id === item.skeletonId)
      : null;
    const variant = item.variantId ? variants.find((entry) => entry.id === item.variantId) : null;
    const toolbarCustomIcon =
      item.type === "asset" && item.assetKind === "icon" && item.assetId
        ? customIconReferences.find((entry) => entry.id === item.assetId) ?? null
        : null;
    return (
      <div
        className="creative-item-toolbar"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {item.locked ? <span className="creative-item-guard-badge">Pinned</span> : null}
        {item.protected ? <span className="creative-item-guard-badge is-protected">Protected</span> : null}
        <button
          type="button"
          className="creative-item-open"
          onClick={() => {
            selectCanvasItem(item.id);
            handleOpenCanvasItemPreview(item);
          }}
        >
          Open
        </button>
        <details className="creative-item-more">
          <summary aria-label="More item actions" title="More item actions">•••</summary>
          <div className="creative-item-more-menu">
        <button type="button" onClick={() => {
          selectCanvasItem(item.id);
          toggleCanvasItemLock(item.id);
        }} title={item.locked ? "Allow this item to move" : "Pin placement and prevent deletion"}>
          {item.locked ? "Unpin" : "Pin"}
        </button>
        <button type="button" onClick={() => {
          selectCanvasItem(item.id);
          toggleCanvasItemProtection(item.id);
        }} title={item.protected ? "Allow this content in local refinement" : "Exclude author-validated content from ordinary refinement"}>
          {item.protected ? "Unprotect" : "Protect"}
        </button>
        {item.type === "reference" && reference && item.role === "layout" ? (
          <>
            <button type="button" onClick={() => useCanvasReferenceAs("layout", reference)}>
              Use layout
            </button>
            <button type="button" onClick={() => void handleGenerateSkeletonFromMain(reference, item)} disabled={generatingSkeleton}>
              Skeleton
            </button>
          </>
        ) : null}
        {item.type === "reference" && reference && item.role === "style" ? (
          <>
            <button type="button" onClick={() => useCanvasReferenceAs("style", reference)}>
              Use style
            </button>
          </>
        ) : null}
        {item.type === "skeleton" && skeleton ? (
          <>
            <button type="button" onClick={() => useCanvasSkeleton(skeleton)}>
              Use
            </button>
            <button
              type="button"
              onClick={() => {
                useCanvasSkeleton(skeleton);
                setDrawioOpen(true);
              }}
              disabled={!skeleton.xml}
            >
              Edit
            </button>
          </>
        ) : null}
        {item.type === "output" && variant ? (
          <>
            <button
              type="button"
              onClick={() => void handleGenerateFromMain(variantToReferenceItem(variant, prompt, item.outputStage ?? "final"), item)}
              disabled={generating}
            >
              Generate
            </button>
            <button
              type="button"
              onClick={() => openVariantInEdit(variant.id)}
            >
              Edit
            </button>
          </>
        ) : null}
        {item.type === "asset" ? (
          <button type="button" onClick={() => useCanvasAsset(item)}>
            {item.assetKind === "icon"
              ? isStyleCropReference(toolbarCustomIcon)
                ? "Use crop"
                : "Use icon"
              : item.assetKind === "font"
                ? "Use font"
                : "Use palette"}
          </button>
        ) : null}
        <button type="button" onClick={() => bringCanvasItemForward(item.id, { trackUndo: true })} title="Bring forward">
          Front
        </button>
        <button type="button" onClick={() => duplicateCanvasItem(item.id)} title="Duplicate">
          Copy
        </button>
        <button type="button" onClick={() => deleteCanvasItem(item.id)} title="Remove">
          Remove
        </button>
          </div>
        </details>
      </div>
    );
  }

  function renderCreativeProvenanceLines() {
    if (!state.showProvenance && selectedCanvasItem?.type !== "output") return null;
    type ProvenanceTone = "layout" | "style" | "output" | "asset" | "edit";
    type ProvenanceLine = {
      id: string;
      from: CreativeCanvasItem;
      to: CreativeCanvasItem;
      tone: ProvenanceTone;
      primary: boolean;
    };
    const lineByKey = new Map<string, ProvenanceLine>();
    const pushLine = (
      from: CreativeCanvasItem | undefined,
      to: CreativeCanvasItem,
      tone: ProvenanceTone,
      primary: boolean,
      idSuffix = "",
    ) => {
      if (!from || from.id === to.id) return;
      const key = `${from.id}->${to.id}-${tone}${idSuffix}`;
      const existing = lineByKey.get(key);
      if (existing) {
        existing.primary ||= primary;
        return;
      }
      lineByKey.set(key, {
        id: key,
        from,
        to,
        tone,
        primary,
      });
    };

    for (const item of visibleCanvasItems) {
      if (item.type === "skeleton" && item.sourceReferenceId) {
        const from = visibleCanvasItems.find(
          (source) => source.type === "reference" && source.referenceId === item.sourceReferenceId,
        );
        pushLine(from, item, "layout", true);
      }
      if (item.type === "skeleton" && item.sourceIconReferenceId) {
        const from = visibleCanvasItems.find(
          (source) =>
            source.type === "asset" &&
            source.assetKind === "icon" &&
            canvasIconAssetMatches(source.assetId, item.sourceIconReferenceId),
        );
        pushLine(from, item, "asset", false, "-skeleton-icon");
      }
      if (item.type === "output") {
        for (const sourceId of item.sourceCanvasItemIds ?? []) {
          const from = visibleCanvasItems.find((source) => source.id === sourceId);
          if (from) {
            const tone =
              from.type === "asset"
                ? "asset"
                : from.type === "skeleton"
                  ? "output"
                  : from.type === "output" || from.type === "control"
                    ? "edit"
                    : from.role === "style"
                      ? "style"
                      : "layout";
            pushLine(from, item, tone, false, "-composition");
          }
        }
        if (item.sourceVariantId) {
          const from =
            visibleCanvasItems.find(
              (source) =>
                source.type === "output" &&
                source.variantId === item.sourceVariantId &&
                source.outputStage === "draft",
            ) ??
            visibleCanvasItems.find(
              (source) =>
                source.type === "output" &&
                source.variantId === item.sourceVariantId &&
                source.id !== item.id,
            );
          pushLine(from, item, "edit", true);
        }
        if (item.sourceSkeletonId) {
          const from = visibleCanvasItems.find(
            (source) => source.type === "skeleton" && source.skeletonId === item.sourceSkeletonId,
          );
          pushLine(from, item, "output", true);
        }
        if (item.sourceReferenceId) {
          const from = visibleCanvasItems.find(
            (source) => source.type === "reference" && source.referenceId === item.sourceReferenceId,
          );
          pushLine(from, item, "layout", true);
        }
        if (item.sourceStyleReferenceId) {
          const from = visibleCanvasItems.find(
            (source) => source.type === "reference" && source.referenceId === item.sourceStyleReferenceId,
          );
          pushLine(from, item, "style", true);
        }
        const iconSourceIds = Array.from(
          new Set([...(item.sourceIconReferenceIds ?? []), item.sourceIconReferenceId].filter(Boolean)),
        );
        for (const assetId of iconSourceIds) {
          if (!assetId) continue;
          const from = visibleCanvasItems.find(
            (source) =>
              source.type === "asset" &&
              source.assetKind === "icon" &&
              canvasIconAssetMatches(source.assetId, assetId),
          );
          pushLine(from, item, "asset", false, `-${assetId}`);
        }
        for (const [assetKind, assetId] of [
          ["font", item.sourceFontReferenceId],
          ["palette", item.sourcePaletteReferenceId],
        ] as const) {
          if (!assetId) continue;
          const from = visibleCanvasItems.find(
            (source) => source.type === "asset" && source.assetKind === assetKind && source.assetId === assetId,
          );
          pushLine(from, item, "asset", false, `-${assetKind}`);
        }
      }
    }
    const activeLineItemIds = new Set(
      [selectedCanvasItem?.id, hoveredCanvasItemId].filter((itemId): itemId is string => Boolean(itemId)),
    );
    const lines = Array.from(lineByKey.values()).filter(
      (line) =>
        line.primary ||
        activeLineItemIds.has(line.from.id) ||
        activeLineItemIds.has(line.to.id),
    );
    if (lines.length === 0) return null;
    const targetLineCounts = new Map<string, number>();
    lines.forEach((line) => {
      targetLineCounts.set(line.to.id, (targetLineCounts.get(line.to.id) ?? 0) + 1);
    });
    const targetLineIndexes = new Map<string, number>();
    return (
      <svg className="creative-provenance" width={creativeCanvasDynamicWidth} height={creativeCanvasDynamicHeight} aria-hidden="true">
        {lines.map(({ id, from, to, tone, primary }) => {
          const forward = to.x >= from.x;
          const x1 = forward ? from.x + from.w : from.x;
          const x2 = forward ? to.x : to.x + to.w;
          const laneIndex = targetLineIndexes.get(to.id) ?? 0;
          targetLineIndexes.set(to.id, laneIndex + 1);
          const laneCount = targetLineCounts.get(to.id) ?? 1;
          const laneOffset = (laneIndex - (laneCount - 1) / 2) * 18;
          const y1 = from.y + from.h / 2 + laneOffset;
          const y2 = to.y + to.h / 2 + laneOffset;
          const horizontalDistance = Math.abs(x2 - x1);
          const curve = Math.max(72, Math.min(220, horizontalDistance * 0.42));
          const c1x = forward ? x1 + curve : x1 - curve;
          const c2x = forward ? x2 - curve : x2 + curve;
          const active = activeLineItemIds.has(from.id) || activeLineItemIds.has(to.id);
          return (
            <path
              key={id}
              className={`creative-provenance-line is-${tone} ${primary ? "is-primary" : "is-secondary"} ${active ? "is-active" : ""}`}
              d={`M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`}
            />
          );
        })}
      </svg>
    );
  }

  function getGraphNodeReady(type: IntentGraphNodeType) {
    if (type === "prompt") return effectiveGenerationBrief.length > 0;
    if (type === "referenceSearch") return board.length > 0;
    if (type === "layoutReference") return Boolean(layoutReference);
    if (type === "styleReference") return Boolean(styleReference);
    if (type === "iconReference") return Boolean(iconReference);
    if (type === "fontReference") return Boolean(fontReference);
    if (type === "skeletonGenerator") return Boolean(selectedSkeleton);
    if (type === "figureGenerator") return visibleOutputVariants.length > 0;
    return Boolean(selectedVariant);
  }

  function selectGraphNode(nodeId: string) {
    setSelectedEdgeId(null);
    updateGraph((current) => ({ ...current, selectedNodeId: nodeId }));
  }

  function addGraphNode(type: IntentGraphNodeType, position?: { x: number; y: number }) {
    const definition = graphNodeDefinitions[type];
    const count = graph.nodes.filter((node) => node.type === type).length;
    const id = `${type}-${Date.now()}`;
    const x = position
      ? Math.max(0, Math.min(canvasWidth - nodeWidth, position.x))
      : 120 + ((graph.nodes.length * 36) % 360);
    const y = position
      ? Math.max(0, Math.min(canvasHeight - nodeHeight, position.y))
      : 120 + ((graph.nodes.length * 54) % 420);
    updateGraph((current) => ({
      ...current,
      selectedNodeId: id,
      nodes: [
        ...current.nodes,
        {
          id,
          type,
          title: count === 0 ? definition.title : `${definition.title} ${count + 1}`,
          x,
          y,
          status: "idle",
        },
      ],
    }));
    setGraphContextMenu(null);
    setGraphMessage(`Added ${definition.title} node.`);
  }

  function deleteGraphNode(nodeId: string) {
    updateGraph((current) => {
      const nextNodes = current.nodes.filter((node) => node.id !== nodeId);
      return {
        ...current,
        nodes: nextNodes,
        edges: current.edges.filter((edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId),
        selectedNodeId: current.selectedNodeId === nodeId ? nextNodes[0]?.id ?? null : current.selectedNodeId,
      };
    });
    setPendingConnection(null);
    setSelectedEdgeId(null);
    setGraphMessage("Node removed from graph.");
  }

  function moveGraphNode(nodeId: string, dx: number, dy: number) {
    updateGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              x: Math.max(0, Math.min(canvasWidth - nodeWidth, node.x + dx)),
              y: Math.max(0, Math.min(canvasHeight - nodeHeight, node.y + dy)),
            }
          : node,
      ),
    }));
  }

  function handleGraphPortClick(nodeId: string, port: string, direction: GraphPortDirection) {
    const node = graphNodeById.get(nodeId);
    if (!node) return;
    if (!pendingConnection) {
      setPendingConnection({ nodeId, port, direction });
      setGraphMessage(`${direction === "output" ? "Output" : "Input"} pin selected: ${node.title}.${port}`);
      return;
    }
    if (pendingConnection.nodeId === nodeId && pendingConnection.port === port) {
      setPendingConnection(null);
      setGraphMessage("Connection canceled.");
      return;
    }
    if (pendingConnection.direction === direction) {
      setPendingConnection({ nodeId, port, direction });
      setGraphMessage("Choose a pin on the opposite side.");
      return;
    }
    const from = pendingConnection.direction === "output" ? pendingConnection : { nodeId, port, direction };
    const to = pendingConnection.direction === "input" ? pendingConnection : { nodeId, port, direction };
    const fromNode = graphNodeById.get(from.nodeId);
    const toNode = graphNodeById.get(to.nodeId);
    if (!fromNode || !toNode) return;
    const key = `${fromNode.type}:${from.port}->${toNode.type}:${to.port}`;
    if (!allowedGraphConnections.has(key)) {
      setPendingConnection(null);
      setGraphMessage(`Cannot connect ${fromNode.title}.${from.port} to ${toNode.title}.${to.port}.`);
      return;
    }
    updateGraph((current) => {
      const nextEdges = current.edges.filter(
        (edge) => !(edge.toNodeId === to.nodeId && edge.toPort === to.port),
      );
      const exists = nextEdges.some(
        (edge) =>
          edge.fromNodeId === from.nodeId &&
          edge.fromPort === from.port &&
          edge.toNodeId === to.nodeId &&
          edge.toPort === to.port,
      );
      return {
        ...current,
        edges: exists
          ? nextEdges
          : [
              ...nextEdges,
              {
                id: `edge-${Date.now()}`,
                fromNodeId: from.nodeId,
                fromPort: from.port,
                toNodeId: to.nodeId,
                toPort: to.port,
              },
            ],
      };
    });
    setPendingConnection(null);
    setGraphMessage(`Connected ${fromNode.title}.${from.port} to ${toNode.title}.${to.port}.`);
  }

  function deleteGraphEdge(edgeId: string) {
    updateGraph((current) => ({
      ...current,
      edges: current.edges.filter((edge) => edge.id !== edgeId),
    }));
    setSelectedEdgeId((current) => (current === edgeId ? null : current));
    setGraphContextMenu(null);
    setGraphMessage("Connection removed.");
  }

  useEffect(() => {
    function handleDeleteSelection(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        const target = event.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }
        event.preventDefault();
        undoCreativeCanvasStep();
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (selectedCanvasItem) {
        event.preventDefault();
        deleteCanvasItem(selectedCanvasItem.id);
        return;
      }
      if (selectedEdgeId) {
        event.preventDefault();
        deleteGraphEdge(selectedEdgeId);
        return;
      }
    }
    window.addEventListener("keydown", handleDeleteSelection);
    return () => window.removeEventListener("keydown", handleDeleteSelection);
  }, [selectedCanvasItem, selectedEdgeId]);

  useEffect(() => {
    function closeContextMenu(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setGraphContextMenu(null);
        setCreativeCanvasContextMenu(null);
        setPendingConnection(null);
      }
    }
    window.addEventListener("keydown", closeContextMenu);
    return () => window.removeEventListener("keydown", closeContextMenu);
  }, []);

  function openCanvasContextMenu(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setGraphContextMenu({
      kind: "canvas",
      x: event.clientX,
      y: event.clientY,
      canvasX: event.clientX - rect.left,
      canvasY: event.clientY - rect.top,
    });
    setSelectedEdgeId(null);
  }

  function openCreativeCanvasContextMenu(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".creative-item")) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setCreativeCanvasContextMenu({
      x: event.clientX,
      y: event.clientY,
      canvasX: event.clientX - rect.left,
      canvasY: event.clientY - rect.top,
    });
    updateCreativeCanvas((canvas) => ({ ...canvas, selectedItemId: null }), { trackUndo: false });
  }

  function openNodeContextMenu(event: MouseEvent, nodeId: string) {
    event.preventDefault();
    event.stopPropagation();
    selectGraphNode(nodeId);
    setGraphContextMenu({ kind: "node", x: event.clientX, y: event.clientY, nodeId });
  }

  function openEdgeContextMenu(event: MouseEvent, edgeId: string) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedEdgeId(edgeId);
    updateGraph((current) => ({ ...current, selectedNodeId: null }));
    setGraphContextMenu({ kind: "edge", x: event.clientX, y: event.clientY, edgeId });
  }

  function hasGraphInput(nodeType: IntentGraphNodeType, port: string) {
    const nodeIds = graph.nodes.filter((node) => node.type === nodeType).map((node) => node.id);
    return graph.edges.some((edge) => nodeIds.includes(edge.toNodeId) && edge.toPort === port);
  }

  function removeFromDashboardPocket(item: ReferenceItem, role: PocketRole) {
    setState((current) => {
      const currentUsage = current.referenceUsage[item.id] ?? {};
      const nextUsageForItem = {
        ...currentUsage,
        [role]: false,
      };
      const dependencyCount =
        current.referenceRegions.filter((region) => region.referenceId === item.id).length +
        current.diagramSkeletonCandidates.filter((candidate) => candidate.referenceId === item.id).length +
        current.creativeCanvas.items.filter((canvasItem) =>
          canvasItem.referenceId === item.id ||
          canvasItem.sourceReferenceId === item.id ||
          canvasItem.sourceStyleReferenceId === item.id,
        ).length;
      const keepInBoard = Boolean(nextUsageForItem.layout || nextUsageForItem.style) || dependencyCount > 0;
      const nextReferenceUsage = { ...current.referenceUsage };
      if (keepInBoard) {
        nextReferenceUsage[item.id] = nextUsageForItem;
      } else {
        delete nextReferenceUsage[item.id];
      }
      const now = new Date().toISOString();
      const removingStyleSource = role === "style" && (
        current.activeStyleKit.sourceReferenceId === item.id ||
        current.activeStyleKit.sourceReferenceIds.includes(item.id)
      );
      return {
        ...current,
        board: keepInBoard
          ? current.board
          : current.board.filter((entry) => entry.id !== item.id),
        referenceUsage: nextReferenceUsage,
        layoutReferenceId:
          role === "layout" && current.layoutReferenceId === item.id
            ? null
            : current.layoutReferenceId,
        canvasFocusReferenceId:
          role === "style" && current.canvasFocusReferenceId === item.id
            ? null
            : current.canvasFocusReferenceId,
        activeStyleKit: removingStyleSource
          ? normalizeStyleKit({
              ...current.activeStyleKit,
              sourceReferenceId: current.activeStyleKit.sourceReferenceId === item.id
                ? null
                : current.activeStyleKit.sourceReferenceId,
              sourceReferenceIds: current.activeStyleKit.sourceReferenceIds.filter((id) => id !== item.id),
              updatedAt: now,
              confirmedAt: null,
            }, { now })
          : current.activeStyleKit,
        canvasGenerationReferenceIds: keepInBoard
          ? current.canvasGenerationReferenceIds
          : current.canvasGenerationReferenceIds.filter((id) => id !== item.id),
        referenceRegions: keepInBoard
          ? current.referenceRegions
          : current.referenceRegions.filter((region) => region.referenceId !== item.id),
        status: dependencyCount > 0 && !nextUsageForItem.layout && !nextUsageForItem.style
          ? `Removed the ${role} role. "${item.title}" remains as a provenance source for ${dependencyCount} linked item(s).`
          : `Removed "${item.title}" from the ${role} pocket.`,
      };
    });
    setRetrievalPocketFocus((current) =>
      current?.referenceId === item.id && current.role === role ? null : current,
    );
  }

  function handleSkeletonXmlChange(
    candidateId: string,
    xml: string,
    status = "Layout skeleton edited in draw.io.",
  ) {
    setViewedSkeletonRevisionId(null);
    const parsedPlan = parseDrawioXmlToDiagramPlan(xml);
    setState((current) => {
      const editingActiveCandidate = current.selectedDiagramSkeletonId === candidateId;
      const application = current.skeletonStyleApplications[candidateId] ?? null;
      const currentBindings = application?.nodeIconBindings ?? (editingActiveCandidate ? current.nodeIconBindings : {});
      const nodeIconBindings = pruneNodeIconBindingsForPlan(currentBindings, parsedPlan);
      const nodeFontBindings = pruneNodeFontBindingsForPlan(
        application?.nodeFontBindings ?? (editingActiveCandidate ? current.nodeFontBindings : {}),
        parsedPlan,
      ) as Record<string, FigureFontReferenceId>;
      const nodeColorBindings = pruneNodeColorBindingsForPlan(
        application?.nodeColorBindings ?? (editingActiveCandidate ? current.nodeColorBindings : {}),
        parsedPlan,
      );
      const shouldLogStale = Boolean(
        editingActiveCandidate && current.guidedDialogue.decisions.skeleton?.status === "current",
      );
      const next = {
        ...current,
        diagramSkeletonXml: editingActiveCandidate ? xml : current.diagramSkeletonXml,
        diagramSkeletonPlan: editingActiveCandidate
          ? parsedPlan ?? current.diagramSkeletonPlan
          : current.diagramSkeletonPlan,
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
        nodeIconBindings: editingActiveCandidate ? nodeIconBindings : current.nodeIconBindings,
        nodeFontBindings: editingActiveCandidate ? nodeFontBindings : current.nodeFontBindings,
        nodeColorBindings: editingActiveCandidate ? nodeColorBindings : current.nodeColorBindings,
        skeletonStyleApplications: application
          ? {
              ...current.skeletonStyleApplications,
              [candidateId]: { ...application, nodeIconBindings, nodeFontBindings, nodeColorBindings },
            }
          : current.skeletonStyleApplications,
        skeletonConfirmedAt: editingActiveCandidate ? null : current.skeletonConfirmedAt,
        guidedDialogue: editingActiveCandidate
          ? markNarratorMessagesStale(current.guidedDialogue.decisions.skeleton
            ? {
                ...current.guidedDialogue,
                decisions: {
                  ...current.guidedDialogue.decisions,
                  skeleton: { ...current.guidedDialogue.decisions.skeleton, status: "stale" as const },
                },
              }
            : current.guidedDialogue, "skeleton", (message) => message.artifactId === candidateId)
          : current.guidedDialogue,
        status,
      };
      return shouldLogStale && current.guidedDialogue.decisions.skeleton
        ? appendStudyEvent(next, {
            stage: "skeleton",
            type: "narrator_decision_stale",
            targetIds: [current.guidedDialogue.decisions.skeleton.id, candidateId],
            result: "skeleton_edited",
            metadata: { surface: "skeleton" },
          })
        : next;
    });
  }

  function clearSkeletonConnections(candidate: DiagramSkeletonCandidate | null) {
    if (!candidate?.xml) return;
    const cleared = clearDrawioConnections(candidate.xml);
    if (cleared.removedCount === 0) {
      setState((current) => ({ ...current, status: "This Skeleton has no arrows to clear." }));
      return;
    }
    setClearedSkeletonConnections({
      candidateId: candidate.id,
      previousXml: candidate.xml,
      clearedXml: cleared.xml,
      removedCount: cleared.removedCount,
    });
    handleSkeletonXmlChange(
      candidate.id,
      cleared.xml,
      `Cleared ${cleared.removedCount} arrow${cleared.removedCount === 1 ? "" : "s"} from the Skeleton.`,
    );
  }

  function undoClearSkeletonConnections(candidate: DiagramSkeletonCandidate | null) {
    const snapshot = clearedSkeletonConnections;
    if (!candidate?.xml || !snapshot || snapshot.candidateId !== candidate.id) return;
    if (candidate.xml !== snapshot.clearedXml) {
      setClearedSkeletonConnections(null);
      setState((current) => ({
        ...current,
        status: "Undo Clear is no longer available because the Skeleton changed afterward.",
      }));
      return;
    }
    handleSkeletonXmlChange(
      candidate.id,
      snapshot.previousXml,
      `Restored ${snapshot.removedCount} cleared arrow${snapshot.removedCount === 1 ? "" : "s"}.`,
    );
    setClearedSkeletonConnections(null);
  }

  function openLayoutReferenceStage() {
    setActiveStage("layout");
    setState((current) => ({
      ...current,
      status: "Opened layout reference picker.",
    }));
  }

  function handleSelectSkeletonCandidate(candidate: DiagramSkeletonCandidate) {
    const parsedPlan = candidate.xml ? parseDrawioXmlToDiagramPlan(candidate.xml) : null;
    setState((current) => {
      const scopedBindings = current.skeletonStyleApplications[candidate.id]?.nodeIconBindings ?? {};
      return {
        ...current,
        selectedDiagramSkeletonId: candidate.id,
        diagramSkeletonXml: candidate.xml ?? null,
        diagramSkeletonPlan: parsedPlan ?? candidate.diagramPlan ?? null,
        diagramSkeletonMermaid: candidate.mermaid ?? null,
        nodeIconBindings: scopedBindings,
        status: `Selected "${candidate.title}" as the corresponding skeleton.`,
      };
    });
    addSkeletonToCanvas(candidate.id);
    setFocusedStructureTargetId((parsedPlan ?? candidate.diagramPlan)?.nodes[0]?.id ?? null);
  }

  function openInlineSkeletonStudio(candidate: DiagramSkeletonCandidate) {
    if (!candidate.xml) return;
    const parsedPlan = parseDrawioXmlToDiagramPlan(candidate.xml);
    setState((current) => ({
      ...current,
      selectedDiagramSkeletonId: candidate.id,
      diagramSkeletonXml: candidate.xml ?? null,
      diagramSkeletonPlan: parsedPlan ?? candidate.diagramPlan ?? current.diagramSkeletonPlan,
      diagramSkeletonMermaid: candidate.mermaid ?? null,
      nodeIconBindings: current.skeletonStyleApplications[candidate.id]?.nodeIconBindings ?? {},
      guidedDialogue: {
        ...current.guidedDialogue,
        detailViews: { ...current.guidedDialogue.detailViews, skeleton: "preview" },
      },
      status: `Editing "${candidate.title}" with text and icon mapping beside draw.io.`,
    }));
    setFocusedStructureTargetId(
      parsedPlan?.nodes[0]?.id ??
      null,
    );
    setDrawioOpen(true);
    setActiveStage("layout");
    setSkeletonEditorOpen(true);
  }

  function focusNodeIconMapping() {
    const candidate = workflowSkeleton;
    if (!candidate) {
      setState((current) => ({
        ...current,
        status: "Generate or select a Skeleton before mapping text to Icons.",
      }));
      setActiveStage("layout");
      return;
    }
    const parsedPlan = candidate.xml
      ? parseDrawioXmlToDiagramPlan(candidate.xml) ?? candidate.diagramPlan ?? null
      : candidate.diagramPlan ?? null;
    setState((current) => ({
      ...current,
      selectedDiagramSkeletonId: candidate.id,
      diagramSkeletonXml: candidate.xml ?? current.diagramSkeletonXml,
      diagramSkeletonPlan: parsedPlan ?? current.diagramSkeletonPlan,
      diagramSkeletonMermaid: candidate.mermaid ?? current.diagramSkeletonMermaid,
      nodeIconBindings: current.skeletonStyleApplications[candidate.id]?.nodeIconBindings ?? current.nodeIconBindings,
      status: "Match Style icons to Skeleton nodes. Suggestions are ranked from node content.",
    }));
    setFocusedStructureTargetId(parsedPlan?.nodes[0]?.id ?? null);
    setActiveStage("icons");
  }

  function handleDeleteSkeletonCandidate(candidateId: string) {
    setState((current) => {
      const deleted = current.diagramSkeletonCandidates.find((candidate) => candidate.id === candidateId);
      const nextCandidates = current.diagramSkeletonCandidates.filter((candidate) => candidate.id !== candidateId);
      if (current.selectedDiagramSkeletonId !== candidateId) {
        return {
          ...current,
          diagramSkeletonCandidates: nextCandidates,
          status: deleted ? `Deleted "${deleted.title}".` : "Deleted skeleton page.",
        };
      }

      const nextSelected = nextCandidates.at(-1) ?? null;
      const parsedPlan = nextSelected?.xml ? parseDrawioXmlToDiagramPlan(nextSelected.xml) : null;
      return {
        ...current,
        diagramSkeletonCandidates: nextCandidates,
        selectedDiagramSkeletonId: nextSelected?.id ?? null,
        diagramSkeletonXml: nextSelected?.xml ?? null,
        diagramSkeletonPlan: nextSelected ? parsedPlan ?? nextSelected.diagramPlan ?? null : null,
        diagramSkeletonMermaid: nextSelected?.mermaid ?? null,
        status: nextSelected
          ? `Deleted "${deleted?.title ?? "skeleton page"}"; selected "${nextSelected.title}".`
          : "Deleted the last skeleton page.",
      };
    });
  }

  function handleCreateBlankSkeleton() {
    const candidateId = `blank-skeleton-${Date.now()}`;
    const xml = createBlankDrawioXml();
    const candidate: DiagramSkeletonCandidate = {
      id: candidateId,
      title: `Blank draw.io layout ${diagramSkeletonCandidates.length + 1}`,
      referenceId: layoutReference?.id ?? null,
      referenceTitle: layoutReference?.title ?? "Blank layout",
      createdAt: new Date().toISOString(),
      source: "blank-drawio",
      initialXml: xml,
      xml,
      mermaid: null,
      diagramPlan: null,
    };
    setState((current) => ({
      ...current,
      diagramSkeletonXml: xml,
      diagramSkeletonPlan: null,
      diagramSkeletonMermaid: null,
      diagramSkeletonCandidates: [...current.diagramSkeletonCandidates, candidate],
      selectedDiagramSkeletonId: candidateId,
      nodeIconBindings: {},
      status: "Blank draw.io skeleton created. Draw your layout and save it here.",
    }));
    setFocusedStructureTargetId(null);
    setSkeletonManagerOpen(false);
    addSkeletonToCanvas(candidateId);
    setDrawioOpen(true);
  }

  async function handleGenerateSkeletonFromMain(referenceOverride?: ReferenceItem, sourceItem?: CreativeCanvasItem | null) {
    const skeletonReference = referenceOverride ?? layoutReference;
    if (!skeletonReference) {
      setState((current) => ({
        ...current,
        status: "Choose a layout reference before generating a skeleton.",
      }));
      setDrawerTab("layout");
      setPocketRole("layout");
      setPocketTagFilter("all");
      updateCreativeCanvas((canvas) => ({ ...canvas, drawerCollapsed: false }), { trackUndo: false });
      return;
    }
    const trimmedPrompt = effectiveGenerationBrief;
    if (!trimmedPrompt) {
      setState((current) => ({
        ...current,
        status: "Add an original prompt before generating a skeleton.",
      }));
      return;
    }
    const confirmation = await requestSkeletonPromptConfirmation(trimmedPrompt, skeletonReference.title);
    if (!confirmation) return;

    setGeneratingSkeleton(true);
    setState((current) => ({
      ...current,
      layoutReferenceId: skeletonReference.id,
      referenceUsage: {
        ...current.referenceUsage,
        [skeletonReference.id]: {
          ...current.referenceUsage[skeletonReference.id],
          layout: true,
        },
      },
      status: `Generating skeleton from "${skeletonReference.title}"...`,
    }));

    try {
      const imageDataUrl =
        skeletonReference.imageDataUrl ??
        (skeletonReference.thumbnailUrl ? await imageUrlToDataUrl(skeletonReference.thumbnailUrl) : null);
      const skeleton = await generateDiagramSkeleton({
        prompt: confirmation.prompt,
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

      setState((current) => ({
        ...current,
        diagramSkeletonXml: skeleton.xml ?? null,
        diagramSkeletonPlan: skeleton.diagramPlan ?? null,
        diagramSkeletonMermaid: skeleton.mermaid ?? null,
        diagramSkeletonCandidates: [...current.diagramSkeletonCandidates, candidate],
        selectedDiagramSkeletonId: candidateId,
        nodeIconBindings: {},
        status:
          skeleton.source === "mermaid-no-image" || skeleton.source === "mermaid-no-image-plan-fallback"
            ? "Layout skeleton ready from prompt + reference brief. Image request failed upstream, so no pixels were used."
            : `Skeleton generation ready from "${skeletonReference.title}".`,
      }));
      addSkeletonToCanvas(candidateId, sourceItem);
      setFocusedStructureTargetId(skeleton.diagramPlan?.nodes[0]?.id ?? null);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      setState((current) => ({ ...current, status: `Layout skeleton draft failed: ${message}` }));
    } finally {
      setGeneratingSkeleton(false);
    }
  }


  function buildCanvasGenerationDraft(
    excludedItemIds = new Set<string>(),
    skeletonCandidateIdOverride?: string | null,
    selectedItemsOverride?: CreativeCanvasItem[],
    workingPromptOverride?: string,
  ): CanvasGenerationDraft | null {
    const originalSearchPrompt = (workingPromptOverride ?? prompt).trim();
    const baseBrief = originalSearchPrompt || (generationBrief ?? "").trim();
    if (!baseBrief) return null;

    const selectedItems = (selectedItemsOverride ?? selectedCompositionItems)
      .filter((item) => !excludedItemIds.has(item.id));
    const selectedSkeletonItem = [...selectedItems].reverse().find((item) => item.type === "skeleton" && item.skeletonId) ?? null;
    const selectedSkeletonCandidateId =
      selectedSkeletonItem?.skeletonId ?? skeletonCandidateIdOverride ?? selectionConfirmSkeletonId;
    const hasSkeletonForDraft = Boolean(
      selectedSkeletonCandidateId &&
        diagramSkeletonCandidates.some((candidate) => candidate.id === selectedSkeletonCandidateId),
    );
    const effectiveSelectedItems = selectedItems;
    const expandedItemsById = new Map(effectiveSelectedItems.map((item) => [item.id, item] as const));
    for (const iconId of selectedItemsOverride ? [] : selectionConfirmAddedIconIds) {
      const virtualId = `confirm-search-icon-${iconId}`;
      if (excludedItemIds.has(virtualId)) continue;
      if ([...expandedItemsById.values()].some((entry) => entry.type === "asset" && entry.assetKind === "icon" && entry.assetId === iconId)) continue;
      expandedItemsById.set(virtualId, {
        id: virtualId,
        type: "asset",
        assetKind: "icon",
        assetId: iconId,
        assetLabel: iconAssetTitle(iconId),
        x: 0,
        y: 0,
        w: 128,
        h: 128,
        z: 100,
      });
    }
    const selectedStyleReferenceIds = new Set(
      effectiveSelectedItems
        .filter((item) => item.type === "reference" && item.role === "style" && item.referenceId)
        .map((item) => item.referenceId as string),
    );
    const selectedStyleReferenceIdFromItems =
      [...effectiveSelectedItems].reverse().find((item) => item.type === "reference" && item.role === "style" && item.referenceId)?.referenceId ??
      null;
    const explicitStyleReferenceId =
      selectionConfirmStyleReferenceId && selectedStyleReferenceIds.has(selectionConfirmStyleReferenceId)
        ? selectionConfirmStyleReferenceId
        : selectedStyleReferenceIdFromItems;
    const items = Array.from(expandedItemsById.values());
    const outputItems = items.filter((item) => item.type === "output" && item.variantId);
    const baseOutputItem = outputItems.at(-1) ?? null;
    const skeletonItem = selectedSkeletonItem;
    const skeletonCandidateId = selectedSkeletonCandidateId;
    const skeletonCandidate = skeletonCandidateId
      ? diagramSkeletonCandidates.find((candidate) => candidate.id === skeletonCandidateId) ?? null
      : null;
    const skeletonPlan = skeletonCandidate
      ? (skeletonCandidate.xml ? parseDrawioXmlToDiagramPlan(skeletonCandidate.xml) : null) ?? skeletonCandidate.diagramPlan ?? null
      : null;
    const selectedStyleItem = explicitStyleReferenceId
      ? items.find((item) => item.type === "reference" && item.role === "style" && item.referenceId === explicitStyleReferenceId) ?? null
      : null;
    const selectedStyleReference = explicitStyleReferenceId
      ? board.find((entry) => entry.id === explicitStyleReferenceId) ?? null
      : selectedStyleItem?.referenceId
        ? board.find((entry) => entry.id === selectedStyleItem.referenceId) ?? null
      : null;
    const lockedRefine = Boolean(baseOutputItem);
    if (!lockedRefine && (!skeletonCandidate || !selectedStyleReference)) return null;
    const guided = !lockedRefine;
    const compositionMode: CanvasCompositionMode = lockedRefine ? "locked_refine" : "guided";

    const referenceById = new Map<string, ReferenceItem>();
    const addReference = (reference: ReferenceItem | null | undefined) => {
      if (!reference) return;
      referenceById.set(reference.id, reference);
    };

    const selectedIconIds: string[] = [];
    const selectedIconLabels: string[] = [];
    const selectedStyleCropLabels: string[] = [];
    const selectedFontIds: string[] = [];
    const selectedPaletteIds: string[] = [];
    const selectedPaletteCues: string[] = [];

    for (const item of items) {
      if (item.type === "reference" && item.referenceId) {
        addReference(board.find((entry) => entry.id === item.referenceId));
      }
      if (item.type === "output" && item.variantId) {
        const variant = variants.find((entry) => entry.id === item.variantId);
        if (variant) addReference(variantToReferenceItem(variant, baseBrief, item.outputStage ?? "final"));
      }
      if (item.type === "asset" && item.assetKind === "icon" && item.assetId) {
        selectedIconIds.push(item.assetId);
        const customIcon = customIconReferences.find((entry) => entry.id === item.assetId);
        const presetIcon = scientificIconReferences.find((entry) => entry.id === item.assetId);
        if (customIcon) {
          const customStyleCrop = isStyleCropReference(customIcon);
          if (customStyleCrop) {
            selectedStyleCropLabels.push(customIcon.label);
          } else {
            selectedIconLabels.push(customIcon.label);
          }
          addReference({
            id: `hichart-custom-icon-${customIcon.id}`,
            title: customStyleCrop
              ? `${customIcon.label} style crop reference`
              : `${customIcon.label} detected icon reference`,
            sourcePaper: "HiChart workspace extraction",
            venue: "Extracted from style",
            year: new Date().getFullYear(),
            imageType: customStyleCrop ? "local style crop" : "detected scientific icon crop",
            subject: customIcon.description,
            styleTags: customStyleCrop
              ? ["style crop", "local visual reference", "extracted from style", ...customIcon.tags]
              : ["icon", "detected", "extracted from style", ...customIcon.tags],
            similarityReason: customStyleCrop
              ? "Canvas-selected style crop for local visual composition guidance."
              : "Canvas-selected detected icon crop for free composition.",
            thumbnail: customIcon.label.slice(0, 3).toUpperCase(),
            thumbnailUrl: customIcon.cropDataUrl,
            imageDataUrl: customIcon.cropDataUrl,
            structuralAnalysis: customIcon.description,
          });
        } else if (presetIcon) {
          selectedIconLabels.push(presetIcon.label);
          addReference(scientificIconReferenceItem(presetIcon, "Canvas-selected icon asset for semantic glyph guidance."));
        }
      }
      if (item.type === "asset" && item.assetKind === "font" && item.assetId) {
        selectedFontIds.push(item.assetId);
      }
      if (item.type === "asset" && item.assetKind === "palette" && item.assetId) {
        selectedPaletteIds.push(item.assetId);
        if (item.assetColors?.length) selectedPaletteCues.push(`${item.assetLabel ?? "Canvas palette"}: ${item.assetColors.join(", ")}`);
      }
    }
    addReference(selectedStyleReference);

    const referencesForGenerate = Array.from(referenceById.values());
    const baseVariant = baseOutputItem?.variantId ? variants.find((entry) => entry.id === baseOutputItem.variantId) ?? null : null;
    const baseReference = baseVariant ? variantToReferenceItem(baseVariant, baseBrief, baseOutputItem?.outputStage ?? "final") : null;
    const selectedReferenceId = guided
      ? selectedStyleReference?.id ?? null
      : baseReference?.id ?? referencesForGenerate[0]?.id ?? null;
    const orderedReferences = [
      ...(baseReference ? [baseReference] : []),
      ...referencesForGenerate.filter((reference) => reference.id !== baseReference?.id),
    ];

    const selectedFonts = selectedFontIds
      .map((id) => figureFontReferences.find((font) => font.id === id))
      .filter((font): font is (typeof figureFontReferences)[number] => Boolean(font));
    const selectedPalettes = selectedPaletteIds
      .map((id) => figurePaletteReferences.find((palette) => palette.id === id))
      .filter((palette): palette is (typeof figurePaletteReferences)[number] => Boolean(palette));
    const promptText = buildReferenceAwareGenerationBrief({
      originalSearchPrompt,
      baseBrief,
      compositionMode,
      skeletonCandidate,
      layoutReference:
        hasSkeletonForDraft
          ? null
          : items
              .map((item) =>
                item.type === "reference" && item.role === "layout" && item.referenceId
                  ? board.find((entry) => entry.id === item.referenceId) ?? null
                  : null,
              )
              .find((reference): reference is ReferenceItem => Boolean(reference)) ?? null,
      selectedStyleReference,
      baseReference,
      selectedIconLabels,
      selectedStyleCropLabels,
      selectedFonts: selectedFonts.map((font) => `${font.label} (${font.tone})`),
      selectedPalettes: selectedPalettes.map((palette) => `${palette.label}: ${palette.colors.join(", ")}`),
      selectedPaletteCues,
    });

    return {
      items,
      baseOutputItem,
      skeletonItem,
      selectedStyleItem,
      selectedStyleReference,
      skeletonCandidate,
      skeletonPlan,
      compositionMode,
      referencesForGenerate,
      orderedReferences,
      baseReference,
      selectedReferenceId,
      promptText,
      selectedIconIds,
      selectedFontIds,
      selectedPaletteIds,
      selectedFonts,
      selectedPalettes,
      selectedPaletteCues,
    };
  }

  function buildFirstGenerationBundle(workingPromptOverride?: string): FirstGenerationBundle | null {
    // Must match the skeleton the rail and staleness check read, or every run
    // is reported stale the moment it lands.
    const skeleton = workflowSkeleton;
    const primaryStyle = styleReference;
    const workingPrompt = (workingPromptOverride ?? effectiveGenerationBrief).trim();
    const readiness = resolveFirstGenerationReadiness({
      workingPrompt,
      skeletonId: skeleton?.id,
      styleReferenceId: primaryStyle?.id,
    });
    if (!readiness.canGenerate || !skeleton || !primaryStyle) return null;

    const plan = skeleton.xml
      ? parseDrawioXmlToDiagramPlan(skeleton.xml) ?? skeleton.diagramPlan ?? null
      : skeleton.diagramPlan ?? null;
    const scopedNodeIconBindings =
      skeletonStyleApplications[skeleton.id]?.nodeIconBindings ??
      (selectedDiagramSkeletonId === skeleton.id ? state.nodeIconBindings : {});
    const promptState = state as typeof state & {
      currentPromptRevisionId?: string | null;
      promptRevisions?: Array<{ id: string; fingerprint: string; text: string }>;
    };
    const currentPromptRevision = promptState.promptRevisions?.find(
      (revision) => revision.id === promptState.currentPromptRevisionId,
    );
    const matchingPromptRevision = currentPromptRevision?.text === workingPrompt
      ? currentPromptRevision
      : null;
    const manifest = createFirstGenerationManifest({
      workingPrompt,
      promptRevisionId: matchingPromptRevision?.id ?? null,
      promptFingerprint: matchingPromptRevision?.fingerprint ?? createPromptFingerprint(workingPrompt),
      skeletonId: skeleton.id,
      skeletonXml: skeleton.xml ?? skeleton.mermaid ?? null,
      styleReferenceId: primaryStyle.id,
      plan,
      nodeIconBindings: scopedNodeIconBindings,
      matchAppearanceFingerprint: createMatchedStyleAppearanceFingerprint({
        fontId: state.fontReferenceId,
        paletteId: state.paletteReferenceId,
        extractedPalette: state.matchedStylePalette,
      }),
      styleKitFingerprint: activeStyleKit.fingerprint,
    });

    const skeletonItem =
      canvasState.items.find(
        (item) => !item.deletedAt && item.type === "skeleton" && item.skeletonId === skeleton.id,
      ) ?? {
        id: `first-generation-skeleton-${skeleton.id}`,
        type: "skeleton" as const,
        skeletonId: skeleton.id,
        x: 0,
        y: 0,
        w: 420,
        h: 320,
        z: 1,
      };
    const styleItem =
      canvasState.items.find(
        (item) =>
          !item.deletedAt &&
          item.type === "reference" &&
          item.role === "style" &&
          item.referenceId === primaryStyle.id,
      ) ?? {
        id: `first-generation-style-${primaryStyle.id}`,
        type: "reference" as const,
        role: "style" as const,
        referenceId: primaryStyle.id,
        x: 0,
        y: 0,
        w: 300,
        h: 220,
        z: 2,
      };
    const iconItems: CreativeCanvasItem[] = manifest.nodeIconBindings.map((binding, index) => ({
      id: `first-generation-icon-${index + 1}-${binding.targetNodeId}`,
      type: "asset",
      assetKind: "icon",
      assetId: binding.iconId,
      assetLabel: iconAssetTitle(binding.iconId),
      sourceSkeletonId: skeleton.id,
      x: 0,
      y: 0,
      w: 128,
      h: 112,
      z: 3 + index,
    }));
    const draft = buildCanvasGenerationDraft(
      new Set<string>(),
      skeleton.id,
      [skeletonItem, styleItem, ...iconItems],
      workingPrompt,
    );
    if (!draft) return null;

    const selectedStyleFont = figureFontReferences.find((entry) => entry.id === state.fontReferenceId) ?? null;
    const selectedStylePalette = figurePaletteReferences.find((entry) => entry.id === state.paletteReferenceId) ?? null;
    const appearanceLines = buildStyleAppearanceGenerationLines({
      font: selectedStyleFont,
      palette: selectedStylePalette,
      extractedPalette: state.matchedStylePalette,
    });
    if (appearanceLines.length) {
      draft.promptText = [draft.promptText, ...appearanceLines].filter(Boolean).join("\n\n");
    }

    const automaticBindings = manifest.nodeIconBindings.map((binding, index) => ({
      id: `node-icon-mapping-${binding.targetNodeId}-${index + 1}`,
      referenceItemId: iconItems[index].id,
      referenceTitle: iconAssetTitle(binding.iconId),
      targetNodeId: binding.targetNodeId,
      targetNodeLabel: binding.targetNodeLabel,
      kind: "icon" as const,
      iconPlacement: "beside" as const,
      note: "",
      x: plan?.nodes.find((node) => node.id === binding.targetNodeId)?.x ?? 0,
      y: plan?.nodes.find((node) => node.id === binding.targetNodeId)?.y ?? 0,
      source: "mapping" as const,
    }));
    return { draft, manifest, automaticBindings };
  }

  function openFirstGenerationSummary() {
    const bundle = buildFirstGenerationBundle();
    if (bundle) {
      setState((current) => ({
        ...commitWorkingPromptRevision(current, "first_generation"),
        activeStudioStep: "candidate",
        status: "Review the current first-generation inputs.",
      }));
    } else {
      setState((current) => ({
        ...current,
        activeStudioStep: "candidate",
        status: "Review the missing first-generation inputs below.",
      }));
    }
    setActiveStage("candidate");
  }

  async function generateFirstFigure() {
    const initialBundle = buildFirstGenerationBundle();
    if (!initialBundle) {
      openFirstGenerationSummary();
      return;
    }
    const confirmation = await requestCandidatePromptConfirmation(
      initialBundle.manifest.workingPrompt,
      `${initialBundle.draft.skeletonCandidate?.title ?? "the selected Skeleton"} and ${initialBundle.draft.selectedStyleReference?.title ?? "the selected Style"}`,
    );
    if (!confirmation) return;
    const bundle = buildFirstGenerationBundle(confirmation.prompt);
    if (!bundle) return;
    await executeCanvasGenerationDraft(bundle.draft, bundle.draft.promptText, {
      automaticBindings: bundle.automaticBindings,
      firstGenerationManifest: bundle.manifest,
    });
  }

  function defaultSelectionConfirmSkeletonId() {
    return (
      [...selectedCompositionItems]
        .reverse()
        .find((item) => item.type === "skeleton" && item.skeletonId && !item.deletedAt)?.skeletonId ?? null
    );
  }

  function selectionConfirmBindingKind(item: CreativeCanvasItem): SelectionConfirmBindingKind {
    if (item.type === "asset" && item.assetKind === "icon") return "icon";
    if (item.type === "asset" && item.assetKind === "font") return "font";
    if (item.type === "asset" && item.assetKind === "palette") return "palette";
    if (item.type === "output") return "output";
    return "reference";
  }

  function nearestSelectionConfirmNode(
    plan: DiagramPlan,
    scale: number,
    x: number,
    y: number,
  ) {
    let best: { node: DiagramPlan["nodes"][number]; distance: number } | null = null;
    for (const node of plan.nodes) {
      const cx = (node.x + node.w / 2) * scale;
      const cy = (node.y + node.h / 2) * scale;
      const distance = Math.hypot(cx - x, cy - y);
      if (!best || distance < best.distance) best = { node, distance };
    }
    return best;
  }

  function buildSelectionConfirmBindings(draft: CanvasGenerationDraft | null): SelectionConfirmBinding[] {
    if (!draft?.skeletonPlan) return [];
    const plan = normalizeConfirmPlan(draft.skeletonPlan);
    const scale = Math.max(760, Math.min(1240, selectionConfirmCanvasWidth)) / Math.max(1, plan.width);
    const itemById = new Map(draft.items.map((item) => [item.id, item] as const));
    const selectionById = new Map(draft.items.map((item) => [item.id, describeConfirmSelectionItem(item)] as const));
    const nodeById = new Map(plan.nodes.map((node) => [node.id, node] as const));
    const positionById = new Map(selectionConfirmPositions.map((position) => [position.itemId, position] as const));
    const sizeById = new Map(selectionConfirmSizes.map((size) => [size.itemId, size] as const));
    const bindings = new Map<string, SelectionConfirmBinding>();
    const inferIconPlacement = (
      itemId: string,
      node: DiagramPlan["nodes"][number],
      fallback: SelectionConfirmIconPlacement = "beside",
    ): SelectionConfirmIconPlacement => {
      const position = positionById.get(itemId);
      const size = sizeById.get(itemId) ?? { itemId, w: 120, h: 56 };
      if (!position) return fallback;
      const cardCenterX = position.x + size.w / 2;
      const cardCenterY = position.y + size.h / 2;
      const nodeX = node.x * scale;
      const nodeY = node.y * scale;
      const nodeW = node.w * scale;
      const nodeH = node.h * scale;
      const centerX = nodeX + nodeW / 2;
      const centerY = nodeY + nodeH / 2;
      const insideNode =
        cardCenterX >= nodeX - 12 &&
        cardCenterX <= nodeX + nodeW + 12 &&
        cardCenterY >= nodeY - 12 &&
        cardCenterY <= nodeY + nodeH + 12;
      const nearNodeCenter = Math.hypot(cardCenterX - centerX, cardCenterY - centerY) <= Math.max(46, Math.min(nodeW, nodeH) * 0.6);
      return insideNode || nearNodeCenter ? "replace" : fallback;
    };

    for (const arrow of selectionConfirmArrows) {
      const item = itemById.get(arrow.fromItemId);
      const selection = selectionById.get(arrow.fromItemId);
      const node = nodeById.get(arrow.toNodeId);
      if (!item || !selection || !node) continue;
      const kind = selectionConfirmBindingKind(item);
      bindings.set(`${arrow.fromItemId}->${arrow.toNodeId}`, {
        id: `${arrow.fromItemId}->${arrow.toNodeId}`,
        referenceItemId: arrow.fromItemId,
        referenceTitle: selection.title,
        targetNodeId: node.id,
        targetNodeLabel: node.label || node.id,
        kind,
        iconPlacement: kind === "icon" ? inferIconPlacement(arrow.fromItemId, node) : undefined,
        note: arrow.note,
        x: node.x + node.w,
        y: node.y,
        source: "arrow",
      });
    }

    for (const position of selectionConfirmPositions) {
      const item = itemById.get(position.itemId);
      const selection = selectionById.get(position.itemId);
      if (!item || !selection || item.type === "skeleton") continue;
      const size = sizeById.get(position.itemId) ?? { itemId: position.itemId, w: 120, h: 56 };
      const nearest = nearestSelectionConfirmNode(plan, scale, position.x + size.w / 2, position.y + size.h / 2);
      if (!nearest || nearest.distance > 220) continue;
      const key = `${position.itemId}->${nearest.node.id}`;
      if (bindings.has(key)) continue;
      const kind = selectionConfirmBindingKind(item);
      bindings.set(key, {
        id: key,
        referenceItemId: position.itemId,
        referenceTitle: selection.title,
        targetNodeId: nearest.node.id,
        targetNodeLabel: nearest.node.label || nearest.node.id,
        kind,
        iconPlacement: kind === "icon" ? inferIconPlacement(position.itemId, nearest.node) : undefined,
        note: "",
        x: nearest.node.x + nearest.node.w,
        y: nearest.node.y,
        source: "snap",
      });
    }

    return Array.from(bindings.values());
  }

  function selectionBindingsPrompt(bindings: SelectionConfirmBinding[]) {
    if (bindings.length === 0) return "";
    const lines = bindings.map((binding) => {
      const relation =
        binding.kind === "icon"
          ? binding.iconPlacement === "replace"
            ? `For node "${binding.targetNodeLabel}", redraw the inner glyph from "${binding.referenceTitle}" as the primary visual; keep the node text as a small caption if needed. Discard the source tile, frame, crop, and label.`
            : `For node "${binding.targetNodeLabel}", redraw the inner glyph from "${binding.referenceTitle}" inside or beside the label. Discard the source tile, frame, crop, and label.`
          : binding.kind === "font"
            ? `Apply font reference "${binding.referenceTitle}" to text/label treatment for skeleton node "${binding.targetNodeLabel}".`
            : binding.kind === "palette"
              ? `Apply palette reference "${binding.referenceTitle}" to the visual styling around skeleton node/group "${binding.targetNodeLabel}".`
              : `Use reference "${binding.referenceTitle}" as local guidance for skeleton node "${binding.targetNodeLabel}".`;
      return binding.note ? `${relation} User note: ${binding.note}` : relation;
    });
    return [
      "LOCAL MATCH BINDINGS — PARTIAL OVERRIDES, NOT A COMPLETE MODULE OR ICON LIST.",
      "Apply each binding only to its named target. Unlisted modules are still required, but they must use content-appropriate scientific representations rather than inheriting icons or becoming repeated icon-plus-label cards.",
      ...lines.map((line, index) => `${index + 1}. ${line}`),
    ].join("\n");
  }

  function buildReferenceAwareGenerationBrief(args: {
    originalSearchPrompt: string;
    baseBrief: string;
    compositionMode: CanvasCompositionMode;
    skeletonCandidate: DiagramSkeletonCandidate | null;
    layoutReference: ReferenceItem | null;
    selectedStyleReference: ReferenceItem | null;
    baseReference: ReferenceItem | null;
    selectedIconLabels: string[];
    selectedStyleCropLabels: string[];
    selectedFonts: string[];
    selectedPalettes: string[];
    selectedPaletteCues: string[];
  }) {
    const lines: string[] = [];
    const originalPrompt = (args.originalSearchPrompt || args.baseBrief).trim();
    if (originalPrompt) {
      lines.push(`Original reference-search goal:\n${originalPrompt}`);
    }

    if (args.compositionMode === "locked_refine" && args.baseReference) {
      lines.push("Base: refine the provided base image while preserving its existing content and reading order.");
    }

    if (args.selectedIconLabels.length > 0) {
      lines.push(`Icons: redraw native glyphs for ${args.selectedIconLabels.join(", ")}.`);
    }

    lines.push("Output: polished standalone diagram; no UI chrome, reference cards, annotation arrows, crop boxes, or screenshot frame.");

    return lines.join("\n");
  }

  function selectionConfirmAnnotationPrompt(draft: CanvasGenerationDraft | null) {
    if (!draft) return "";
    const itemTitleById = new Map(
      draft.items.map((item) => {
        const selection = describeConfirmSelectionItem(item);
        return [item.id, selection.title] as const;
      }),
    );
    const nodeLabelById = new Map(draft.skeletonPlan?.nodes.map((node) => [node.id, node.label || node.id] as const) ?? []);
    const parts: string[] = [];
    const hasLocalAnnotations =
      selectionConfirmPositions.length > 0 ||
      selectionConfirmSizes.length > 0 ||
      selectionConfirmArrows.length > 0 ||
      selectionConfirmNotes.some((note) => note.text.trim());
    if (hasLocalAnnotations) {
      parts.push("Use the following annotations as local guidance only; do not draw the control board.");
    }
    if (selectionConfirmPositions.length > 0) {
      parts.push(
        `User confirm-canvas placements: ${selectionConfirmPositions
          .map((position) => `${itemTitleById.get(position.itemId) ?? position.itemId} placed around canvas coordinate (${Math.round(position.x)}, ${Math.round(position.y)})`)
          .join("; ")}.`,
      );
    }
    if (selectionConfirmSizes.length > 0) {
      parts.push(
        `User confirm-canvas sizing: ${selectionConfirmSizes
          .map((size) => `${itemTitleById.get(size.itemId) ?? size.itemId} resized to approximately ${Math.round(size.w)}×${Math.round(size.h)} canvas units`)
          .join("; ")}.`,
      );
    }
    if (selectionConfirmArrows.length > 0) {
      parts.push(
        `User arrow annotations: ${selectionConfirmArrows
          .map((arrow) => `${itemTitleById.get(arrow.fromItemId) ?? arrow.fromItemId} points to "${nodeLabelById.get(arrow.toNodeId) ?? arrow.toNodeId}"${arrow.note.trim() ? ` with note "${arrow.note.trim()}"` : ""}`)
          .join("; ")}.`,
      );
    }
    const textNotes = selectionConfirmNotes.filter((note) => note.text.trim());
    if (textNotes.length > 0) {
      parts.push(
        `User text annotations: ${textNotes
          .map((note) => `"${note.text.trim()}" near canvas coordinate (${Math.round(note.x)}, ${Math.round(note.y)})`)
          .join("; ")}.`,
      );
    }
    return parts.join("\n\n");
  }

  function selectionConfirmHasControlSignal(draft: CanvasGenerationDraft, bindings: SelectionConfirmBinding[]) {
    const hasReferenceBindingItem = draft.items.some(
      (item) =>
        (item.type === "asset" && ["icon", "font", "palette"].includes(item.assetKind ?? "")) ||
        item.type === "output" ||
        (item.type === "reference" && item.role !== "style"),
    );
    const hasNotes = selectionConfirmNotes.some((note) => note.text.trim());
    return Boolean(
      hasReferenceBindingItem ||
      bindings.length > 0 ||
      selectionConfirmPositions.length > 0 ||
      selectionConfirmSizes.length > 0 ||
      selectionConfirmArrows.length > 0 ||
      hasNotes,
    );
  }

  function buildSelectionConfirmSnapshot(draft: CanvasGenerationDraft, promptText: string): CreativeCanvasConfirmSnapshot {
    const baseVariant = draft.baseOutputItem?.variantId
      ? variants.find((variant) => variant.id === draft.baseOutputItem?.variantId) ?? null
      : null;
    const baseImageUrl = baseVariant && draft.baseOutputItem
      ? variantPreviewSrc(baseVariant, draft.baseOutputItem.outputStage ?? "final")
      : null;
    const confirmMode: SelectionConfirmMode = baseImageUrl
      ? "generated-image"
      : draft.skeletonPlan
        ? "skeleton-binding"
        : "reference-board";
    return {
      prompt: promptText,
      selectedCanvasItemIds: selectedCanvasItemIds.filter((id) => visibleCanvasItems.some((item) => item.id === id && !item.deletedAt)),
      excludedIds: selectionConfirmExcludedIds,
      positions: selectionConfirmPositions,
      sizes: selectionConfirmSizes,
      arrows: selectionConfirmArrows,
      notes: selectionConfirmNotes,
      skeletonId: draft.skeletonCandidate?.id ?? selectionConfirmSkeletonId,
      styleReferenceId: draft.selectedStyleReference?.id ?? selectionConfirmStyleReferenceId,
      addedIconIds: selectionConfirmAddedIconIds,
      advancedOpen: selectionConfirmAdvancedOpen,
      confirmMode,
      annotationSnapshot:
        confirmMode === "generated-image"
          ? selectionConfirmAnnotationRef.current?.getSnapshot() ?? selectionConfirmAnnotationSnapshotsByCanvasId[activeCanvasConfirmKey] ?? null
          : null,
    };
  }

  function upsertSelectionConfirmControlItem(
    controlId: string,
    draft: CanvasGenerationDraft,
    snapshot: CreativeCanvasConfirmSnapshot,
    controlImageDataUrl: string | null,
    options: { trackUndo?: boolean } = {},
  ) {
    updateCreativeCanvas((canvas) => {
      const existing = canvas.items.find((item) => item.id === controlId);
      const source =
        draft.baseOutputItem ??
        draft.skeletonItem ??
        draft.selectedStyleItem ??
        draft.items.find((item) => canvas.items.some((canvasItem) => canvasItem.id === item.id)) ??
        null;
      const width = existing?.w ?? 470;
      const height = existing?.h ?? 320;
      const x = existing?.x ?? Math.max(0, (source?.x ?? 520) + (source?.w ?? 420) + 48);
      const y = existing?.y ?? Math.max(0, source?.y ?? 180);
      const nextControl: CreativeCanvasItem = {
        ...(existing ?? {
          id: controlId,
          type: "control" as const,
          x,
          y,
          w: width,
          h: height,
          z: maxCanvasZ(canvas.items) + 1,
        }),
        controlImageDataUrl: controlImageDataUrl ?? existing?.controlImageDataUrl ?? null,
        controlImageStorageKey: `creative-canvas:${controlId}:image`,
        controlTitle: "Confirm selected elements",
        controlSnapshot: snapshot,
        sourceReferenceId: source?.type === "reference" ? source.referenceId : source?.sourceReferenceId,
        sourceSkeletonId:
          draft.skeletonCandidate?.id ??
          (source?.type === "skeleton" ? source.skeletonId : source?.sourceSkeletonId) ??
          undefined,
        sourceStyleReferenceId: draft.selectedStyleReference?.id ?? source?.sourceStyleReferenceId ?? undefined,
        sourceIconReferenceId: draft.selectedIconIds[0] ?? source?.sourceIconReferenceId ?? undefined,
        sourceIconReferenceIds: draft.selectedIconIds.length ? draft.selectedIconIds : source?.sourceIconReferenceIds,
        sourceFontReferenceId: draft.selectedFontIds[0] ?? source?.sourceFontReferenceId ?? undefined,
        sourcePaletteReferenceId: draft.selectedPaletteIds[0] ?? source?.sourcePaletteReferenceId ?? undefined,
        sourceCanvasItemIds: draft.items.map((item) => item.id).filter((id) => !isConfirmOnlyCanvasItemId(id)),
      };
      const nextImageDataUrl = controlImageDataUrl ?? existing?.controlImageDataUrl ?? null;
      if (
        existing &&
        existing.controlImageDataUrl === nextImageDataUrl &&
        JSON.stringify(existing.controlSnapshot ?? null) === JSON.stringify(snapshot) &&
        JSON.stringify(existing.sourceCanvasItemIds ?? []) === JSON.stringify(nextControl.sourceCanvasItemIds ?? [])
      ) {
        return canvas;
      }
      const nextItems = existing
        ? canvas.items.map((item) => (item.id === controlId ? nextControl : item))
        : [...canvas.items, nextControl];
      return {
        ...canvas,
        items: nextItems,
        selectedItemId: controlId,
      };
    }, options);
  }

  function restoreSelectionConfirmFromControl(item: CreativeCanvasItem) {
    const snapshot = item.controlSnapshot;
    if (!snapshot) {
      setControlPreviewItemId(item.id);
      return;
    }
    const availableItemIds = new Set(visibleCanvasItems.map((entry) => entry.id));
    const selectedIds = (snapshot.selectedCanvasItemIds ?? []).filter((id) => availableItemIds.has(id));
    updateCreativeCanvas(
      (canvas) => ({
        ...canvas,
        selectedItemId: item.id,
        selectedItemIds: selectedIds,
      }),
      { trackUndo: false },
    );
    setSkeletonManagerOpen(false);
    setDrawioOpen(false);
    setControlPreviewItemId(null);
    setSelectionConfirmExcludedIds(snapshot.excludedIds ?? []);
    setSelectionConfirmPrompt(snapshot.prompt ?? "");
    setSelectionConfirmPromptDirty(true);
    setSelectionConfirmPositions(snapshot.positions ?? []);
    setSelectionConfirmSizes(snapshot.sizes ?? []);
    setSelectionConfirmArrows(snapshot.arrows ?? []);
    setSelectionConfirmNotes(snapshot.notes ?? []);
    setSelectionConfirmSkeletonId(snapshot.skeletonId ?? null);
    setSelectionConfirmStyleReferenceId(snapshot.styleReferenceId ?? item.sourceStyleReferenceId ?? null);
    setSelectionConfirmTool("move");
    setSelectionConfirmActiveItemId(null);
    setSelectionConfirmPendingArrowItemId(null);
    setSelectionConfirmControlPreview(item.controlImageDataUrl ?? null);
    setSelectionConfirmControlItemId(item.id);
    setSelectionConfirmAddedIconIds(snapshot.addedIconIds ?? []);
    setSelectionConfirmAdvancedOpen(snapshot.advancedOpen ?? false);
    if (snapshot.confirmMode === "generated-image" && snapshot.annotationSnapshot) {
      setSelectionConfirmAnnotationSnapshotsByCanvasId((current) => ({
        ...current,
        [activeCanvasConfirmKey]: snapshot.annotationSnapshot as TLEditorSnapshot,
      }));
      setSelectionConfirmAnnotationMarkupByCanvasId((current) => ({
        ...current,
        [activeCanvasConfirmKey]: true,
      }));
      setSelectionConfirmAnnotationResetByCanvasId((current) => ({
        ...current,
        [activeCanvasConfirmKey]: (current[activeCanvasConfirmKey] ?? 0) + 1,
      }));
    }
    setSelectionConfirmOpen(true);
    setState((current) => ({
      ...current,
      status: selectedIds.length > 0
        ? "Restored the confirm selection state from Confirm Control."
        : "Restored Confirm Control annotations; some original canvas items are no longer available.",
    }));
  }

  async function executeCanvasGenerationDraft(
    draft: CanvasGenerationDraft,
    promptText: string,
    options: {
      automaticBindings?: SelectionConfirmBinding[];
      firstGenerationManifest?: FirstGenerationManifest;
    } = {},
  ) {
    const guided = draft.compositionMode === "guided";
    const layoutReferenceForGeneration = guided
      ? board.find(
          (reference) => reference.id === (draft.skeletonCandidate?.referenceId ?? layoutReferenceId),
        ) ?? null
      : null;
    const generationReferences = [
      ...(layoutReferenceForGeneration ? [layoutReferenceForGeneration] : []),
      ...draft.orderedReferences.filter(
        (reference) => reference.id !== layoutReferenceForGeneration?.id,
      ),
    ];
    const referencesWithImages = await hydrateReferenceImages(generationReferences);
    const simpleFirstGeneration = Boolean(options.firstGenerationManifest);
    const bindings = options.automaticBindings ?? buildSelectionConfirmBindings(draft);
    const baseVariant = draft.baseOutputItem?.variantId
      ? variants.find((variant) => variant.id === draft.baseOutputItem?.variantId) ?? null
      : null;
    const baseImageUrl = baseVariant && draft.baseOutputItem
      ? variantPreviewSrc(baseVariant, draft.baseOutputItem.outputStage ?? "final")
      : null;
    const confirmMode: SelectionConfirmMode = baseImageUrl
      ? "generated-image"
      : draft.skeletonPlan
        ? "skeleton-binding"
        : "reference-board";
    const hasReferenceBoardControl =
      !simpleFirstGeneration &&
      confirmMode === "reference-board" &&
      selectionConfirmHasControlSignal(draft, bindings);
    const bindingPrompt = selectionBindingsPrompt(bindings);
    const separateMatchInstructions = guided && Boolean(draft.skeletonPlan);
    const annotationPrompt = simpleFirstGeneration ? "" : selectionConfirmAnnotationPrompt(draft);
    const modePrompt =
      simpleFirstGeneration
        ? ""
        : confirmMode === "generated-image"
        ? "Generated-image confirm: use the annotated generated image as an edit control. Masks mark editable areas; arrows, highlights, and notes describe the requested changes. Preserve unmarked areas and remove every annotation artifact in the final output."
        : confirmMode === "reference-board"
          ? "Reference-board confirm: use the arranged selected references and notes as composition guidance only. Do not draw the board, cards, UI labels, or note boxes."
          : "";
    const finalPrompt = [
      promptText,
      modePrompt,
      annotationPrompt,
      separateMatchInstructions ? "" : bindingPrompt,
    ].filter((part) => part.trim()).join("\n\n");
    const skeletonXml =
      draft.skeletonCandidate?.xml ??
      draft.skeletonCandidate?.mermaid ??
      diagramSkeletonXml ??
      diagramSkeletonMermaid;
    if (!skeletonXml) {
      setState((current) => ({ ...current, status: "Select or generate a Skeleton before image generation." }));
      return;
    }
    const annotationControlImageDataUrl =
      simpleFirstGeneration
        ? null
        : confirmMode === "generated-image"
        ? (await selectionConfirmAnnotationRef.current?.exportToPngDataUrl()) ?? null
        : hasReferenceBoardControl
          ? await buildSelectionConfirmControlImageDataUrl(draft)
          : null;
    const controlSnapshot = buildSelectionConfirmSnapshot(draft, promptText);
    setVariantGenerationProgress(null);
    setGenerating(true);
    setState((current) => ({
      ...current,
      status: `Generating from ${draft.items.length || 0} selected canvas item${draft.items.length === 1 ? "" : "s"}...`,
    }));
    try {
      const generated = await generateVariants({
        prompt: finalPrompt,
        referenceIds: referencesWithImages.map((reference) => reference.id),
        selectedReferenceId: draft.selectedReferenceId,
        layoutReferenceId: layoutReferenceForGeneration?.id ?? null,
        baseReferenceId: draft.baseReference?.id ?? draft.selectedReferenceId,
        compositionMode: draft.compositionMode,
        references: referencesWithImages,
        referenceRegions: !simpleFirstGeneration && guided && draft.selectedStyleReference
          ? referenceRegions.filter((region) => region.referenceId === draft.selectedStyleReference?.id && region.intent === "style")
          : [],
        diagramSkeletonXml: skeletonXml,
        annotationControlImageDataUrl,
        matchInstructions: separateMatchInstructions ? bindingPrompt || null : null,
      }, handleVariantGenerationProgress);
      const generationRunId = Date.now();
      const generatedForCanvas = generated.map((variant, index) => ({
        ...variant,
        id: `generate-${generationRunId}-${index + 1}-${variant.id}`,
      }));
      setState((current) => {
        const figureHistory = appendFigureHistoryEntries(current, generatedForCanvas, {
          sourceStage: current.activeStudyStage === "refine" ? "refine" : "compose",
          sourceType: "generate",
        });
        const manifest = options.firstGenerationManifest;
        const generatedSnapshots = manifest
          ? Object.fromEntries(generatedForCanvas.map((variant) => [variant.id, {
              variantId: variant.id,
              createdAt: new Date().toISOString(),
              promptRevisionId: manifest.promptRevisionId,
              promptFingerprint: manifest.promptFingerprint,
              workingPrompt: manifest.workingPrompt,
              skeletonId: manifest.skeletonId,
              skeletonXml: manifest.skeletonXml,
              styleReferenceId: manifest.styleReferenceId,
              nodeIconBindings: Object.fromEntries(
                manifest.nodeIconBindings.map((binding) => [binding.targetNodeId, binding.iconId]),
              ),
              matchAppearanceFingerprint: manifest.matchAppearanceFingerprint,
              styleKitFingerprint: manifest.styleKitFingerprint,
              authorDecisionSnapshot: Object.values(current.guidedDialogue.decisions)
                .filter((decision): decision is NonNullable<typeof decision> => Boolean(decision))
                .map((decision) => ({ ...decision })),
            }]))
          : {};
        const next = {
          ...current,
          variants: [...generatedForCanvas, ...current.variants],
          selectedVariantId: generatedForCanvas[0]?.id ?? current.selectedVariantId,
          figureHistory,
          candidateGenerationSnapshots: {
            ...current.candidateGenerationSnapshots,
            ...generatedSnapshots,
          },
          status: simpleFirstGeneration
            ? "Generated the first figure from the current Prompt, Skeleton, Style reference, and optional Match choices."
            : generatedForCanvas.length === 1
              ? "Generated 1 figure from canvas selection."
              : `Generated ${generatedForCanvas.length} figures from canvas selection.`,
        };
        return simpleFirstGeneration
          ? appendStudyEvent(next, {
              stage: "compose",
              type: "first_generation_generated",
              targetIds: generatedForCanvas.map((variant) => variant.id),
              result: generatedForCanvas.length ? "generated" : "empty",
              metadata: {
                promptRevisionId: manifest?.promptRevisionId ?? null,
                skeletonId: manifest?.skeletonId ?? null,
                styleReferenceId: manifest?.styleReferenceId ?? null,
                boundIconCount: manifest?.boundIconIds.length ?? 0,
              },
            })
          : next;
      });
      if (generatedForCanvas.length > 0) {
        if (selectionConfirmControlItemId) {
          upsertSelectionConfirmControlItem(
            selectionConfirmControlItemId,
            draft,
            controlSnapshot,
            annotationControlImageDataUrl,
            { trackUndo: false },
          );
        }
        addOutputsToCanvas(
          generatedForCanvas.map((variant) => variant.id),
          selectionConfirmControlItemId
            ? visibleCanvasItems.find((item) => item.id === selectionConfirmControlItemId) ?? draft.baseOutputItem ?? draft.skeletonItem ?? draft.selectedStyleItem ?? draft.items.at(-1) ?? null
            : draft.baseOutputItem ?? draft.skeletonItem ?? draft.selectedStyleItem ?? draft.items.at(-1) ?? null,
          draft.selectedStyleReference?.id,
          draft.skeletonCandidate?.id,
          draft.selectedIconIds[0],
          simpleFirstGeneration ? undefined : draft.selectedFontIds[0],
          simpleFirstGeneration ? undefined : draft.selectedPaletteIds[0],
          draft.selectedIconIds,
          [],
          Array.from(
            new Set([
              ...draft.items.map((item) => item.id).filter((id) => !isConfirmOnlyCanvasItemId(id)),
              ...(selectionConfirmControlItemId ? [selectionConfirmControlItemId] : []),
            ]),
          ),
          selectionConfirmControlItemId ? null : annotationControlImageDataUrl,
          "Confirm selected elements",
          selectionConfirmControlItemId ? null : controlSnapshot,
        );
      }
      setSelectionConfirmOpen(false);
      setSelectionConfirmExcludedIds([]);
      setSelectionConfirmPromptDirty(false);
      setSelectionConfirmPositions([]);
      setSelectionConfirmSizes([]);
      setSelectionConfirmArrows([]);
      setSelectionConfirmNotes([]);
      setSelectionConfirmSkeletonId(null);
      setSelectionConfirmStyleReferenceId(null);
      setSelectionConfirmTool("move");
      setSelectionConfirmActiveItemId(null);
      setSelectionConfirmPendingArrowItemId(null);
      setSelectionConfirmControlPreview(null);
      setSelectionConfirmControlItemId(null);
      if (generatedForCanvas.length > 0) setActiveStage("candidate");
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      setState((current) => ({ ...current, status: `Generation failed: ${message}` }));
    } finally {
      setGenerating(false);
      setVariantGenerationProgress(null);
    }
  }

  function openSelectionConfirm(draftOverride?: CanvasGenerationDraft) {
    if (!draftOverride && selectedCompositionItems.length === 0) {
      setState((current) => ({
        ...current,
        status: "Select one or more canvas elements before opening Confirm.",
      }));
      return;
    }
    const defaultSkeletonId = draftOverride?.skeletonCandidate?.id ?? defaultSelectionConfirmSkeletonId();
    const draft = draftOverride ?? buildCanvasGenerationDraft(new Set<string>(), defaultSkeletonId);
    if (!draft) {
      setState((current) => ({ ...current, status: "Add an original prompt before generating." }));
      return;
    }
    const controlId = `canvas-control-selection-${Date.now()}`;
    setSelectionConfirmExcludedIds([]);
    setSelectionConfirmPrompt(draft.promptText);
    setSelectionConfirmPromptDirty(false);
    setSelectionConfirmPositions([]);
    setSelectionConfirmSizes([]);
    setSelectionConfirmArrows([]);
    setSelectionConfirmNotes([]);
    setSelectionConfirmSkeletonId(defaultSkeletonId);
    const defaultStyleReferenceId =
      [...draft.items].reverse().find((item) => item.type === "reference" && item.role === "style" && item.referenceId)?.referenceId ??
      null;
    setSelectionConfirmStyleReferenceId(defaultStyleReferenceId);
    const initialSnapshot: CreativeCanvasConfirmSnapshot = {
      prompt: draft.promptText,
      selectedCanvasItemIds: selectedCanvasItemIds.filter((id) => visibleCanvasItems.some((item) => item.id === id && !item.deletedAt)),
      excludedIds: [],
      positions: [],
      sizes: [],
      arrows: [],
      notes: [],
      skeletonId: draft.skeletonCandidate?.id ?? defaultSkeletonId,
      styleReferenceId: defaultStyleReferenceId,
      addedIconIds: [],
      advancedOpen: false,
    };
    setSelectionConfirmControlItemId(controlId);
    upsertSelectionConfirmControlItem(controlId, draft, initialSnapshot, null, { trackUndo: true });
    setSelectionConfirmTool("move");
    setSelectionConfirmActiveItemId(null);
    setSelectionConfirmPendingArrowItemId(null);
    setSelectionConfirmControlPreview(null);
    setSelectionConfirmAddedIconIds([]);
    setSelectionConfirmAdvancedOpen(false);
    setSelectionConfirmAnnotationSnapshotsByCanvasId((current) => {
      const next = { ...current };
      delete next[activeCanvasConfirmKey];
      return next;
    });
    setSelectionConfirmAnnotationMarkupByCanvasId((current) => ({ ...current, [activeCanvasConfirmKey]: false }));
    setSelectionConfirmAnnotationResetByCanvasId((current) => ({
      ...current,
      [activeCanvasConfirmKey]: (current[activeCanvasConfirmKey] ?? 0) + 1,
    }));
    setSelectionConfirmOpen(true);
    setState((current) => ({ ...current, status: "Review selected canvas elements before generation." }));
  }

  async function handleGenerateComposition() {
    openSelectionConfirm();
  }

  function selectionConfirmLayoutReference(draft: CanvasGenerationDraft | null) {
    const layoutItem = [...(draft?.items ?? [])].reverse().find(
      (item) => item.type === "reference" && item.role === "layout" && item.referenceId,
    );
    return layoutItem?.referenceId
      ? board.find((entry) => entry.id === layoutItem.referenceId) ?? null
      : null;
  }

  async function generateSkeletonForSelectionConfirm(draft: CanvasGenerationDraft | null) {
    const trimmedPrompt = effectiveGenerationBrief;
    const skeletonReference = selectionConfirmLayoutReference(draft);
    if (!trimmedPrompt) {
      setState((current) => ({ ...current, status: "Add an original prompt before generating a skeleton." }));
      return;
    }
    if (!skeletonReference) {
      setState((current) => ({ ...current, status: "Add a layout reference before generating a skeleton." }));
      return;
    }
    const confirmation = await requestSkeletonPromptConfirmation(trimmedPrompt, skeletonReference.title);
    if (!confirmation) return;
    setGeneratingSkeleton(true);
    setState((current) => ({ ...current, status: `Generating skeleton from "${skeletonReference.title}" for confirm canvas...` }));
    try {
      const imageDataUrl =
        skeletonReference.imageDataUrl ??
        (skeletonReference.thumbnailUrl ? await imageUrlToDataUrl(skeletonReference.thumbnailUrl) : null);
      const skeleton = await generateDiagramSkeleton({
        prompt: confirmation.prompt,
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
      setState((current) => ({
        ...current,
        diagramSkeletonXml: skeleton.xml ?? null,
        diagramSkeletonPlan: skeleton.diagramPlan ?? null,
        diagramSkeletonMermaid: skeleton.mermaid ?? null,
        diagramSkeletonCandidates: [...current.diagramSkeletonCandidates, candidate],
        selectedDiagramSkeletonId: candidateId,
        nodeIconBindings: {},
        status: `Skeleton ready from "${skeletonReference.title}". Continue binding references in the confirm canvas.`,
      }));
      setSelectionConfirmSkeletonId(candidateId);
      const layoutSourceItem =
        canvasState.items.find(
          (item) => item.type === "reference" && item.role === "layout" && item.referenceId === skeletonReference.id,
        ) ?? null;
      addSkeletonToCanvas(candidateId, layoutSourceItem);
      if (!selectionConfirmPromptDirty) {
        const nextDraft = buildCanvasGenerationDraft(selectionConfirmExcludedIdSet, candidateId);
        if (nextDraft) setSelectionConfirmPrompt(nextDraft.promptText);
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      setState((current) => ({ ...current, status: `Layout skeleton draft failed: ${message}` }));
    } finally {
      setGeneratingSkeleton(false);
    }
  }

  function confirmSelectionTokens(text: string) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2);
  }

  function describeConfirmSelectionItem(item: CreativeCanvasItem): ConfirmSelectionItem {
    if (item.type === "asset" && item.assetKind === "icon" && item.assetId) {
      const customIcon = customIconReferences.find((entry) => entry.id === item.assetId);
      const presetIcon = scientificIconReferences.find((entry) => entry.id === item.assetId);
      const customStyleCrop = isStyleCropReference(customIcon);
      const title = customIcon?.label ?? presetIcon?.label ?? item.assetLabel ?? (customStyleCrop ? "Style crop" : "Icon reference");
      const meta = customIcon?.description ?? presetIcon?.description ?? (customStyleCrop ? "Local style crop asset" : "Icon asset");
      const imageUrl = customIcon?.cropDataUrl ?? (presetIcon ? scientificIconDataUrl(presetIcon.id) : null);
      return {
        id: item.id,
        item,
        title,
        meta,
        imageUrl,
        colors: [],
        tokens: confirmSelectionTokens([title, meta, customIcon?.tags.join(" "), presetIcon?.role, customStyleCrop ? "style crop visual motif" : ""].filter(Boolean).join(" ")),
      };
    }
    if (item.type === "asset" && item.assetKind === "font" && item.assetId) {
      const font = figureFontReferences.find((entry) => entry.id === item.assetId);
      const title = font?.label ?? item.assetLabel ?? "Font reference";
      const meta = font ? `${font.tone}: ${font.description}` : "Typography asset";
      return {
        id: item.id,
        item,
        title,
        meta,
        imageUrl: null,
        colors: [],
        tokens: confirmSelectionTokens(`${title} ${meta} text label title annotation typography font`),
      };
    }
    if (item.type === "asset" && item.assetKind === "palette" && item.assetId) {
      const palette = figurePaletteReferences.find((entry) => entry.id === item.assetId);
      const title = palette?.label ?? item.assetLabel ?? "Palette reference";
      const colors = item.assetColors?.length ? item.assetColors : palette?.colors ?? [];
      return {
        id: item.id,
        item,
        title,
        meta: palette ? `${palette.tone}: ${palette.description}` : "Color palette asset",
        imageUrl: null,
        colors,
        tokens: confirmSelectionTokens(`${title} color palette style theme`),
      };
    }
    if (item.type === "reference" && item.referenceId) {
      const reference = board.find((entry) => entry.id === item.referenceId);
      const title = reference?.title ?? `${item.role ?? "Reference"} reference`;
      return {
        id: item.id,
        item,
        title,
        meta: reference?.subject ?? reference?.imageType ?? "Canvas reference",
        imageUrl: reference?.thumbnailUrl ?? reference?.imageDataUrl ?? null,
        colors: [],
        tokens: confirmSelectionTokens(`${title} ${reference?.subject ?? ""} ${reference?.styleTags.join(" ") ?? ""}`),
      };
    }
    if (item.type === "output" && item.variantId) {
      const variant = variants.find((entry) => entry.id === item.variantId);
      const title = variant?.title ?? "Generated output";
      return {
        id: item.id,
        item,
        title,
        meta: item.outputStage === "draft" ? "Output draft" : "Final output",
        imageUrl: variant ? variantPreviewSrc(variant, item.outputStage ?? "final") : null,
        colors: [],
        tokens: confirmSelectionTokens(`${title} ${variant?.description ?? ""}`),
      };
    }
    if (item.type === "skeleton") {
      const candidate = item.skeletonId
        ? diagramSkeletonCandidates.find((entry) => entry.id === item.skeletonId)
        : null;
      return {
        id: item.id,
        item,
        title: candidate?.title ?? "Layout skeleton",
        meta: candidate?.referenceTitle ?? "Skeleton layout",
        imageUrl: null,
        colors: [],
        tokens: confirmSelectionTokens(`${candidate?.title ?? ""} skeleton layout`),
      };
    }
    return {
      id: item.id,
      item,
      title: item.templateTitle ?? "Canvas item",
      meta: item.type,
      imageUrl: null,
      colors: [],
      tokens: confirmSelectionTokens(item.templateHint ?? item.type),
    };
  }

  function scoreConfirmNodeMatch(selection: ConfirmSelectionItem, nodeLabel: string) {
    const nodeTokens = new Set(confirmSelectionTokens(nodeLabel));
    if (nodeTokens.size === 0) return 0;
    return selection.tokens.reduce((score, token) => score + (nodeTokens.has(token) ? 3 : nodeLabel.toLowerCase().includes(token) ? 1 : 0), 0);
  }

  function buildConfirmCanvasPlacements(draft: CanvasGenerationDraft | null, preferredWidth = 1040) {
    const selections = (draft?.items ?? [])
      .filter((item) => item.type !== "template")
      .map((item) => describeConfirmSelectionItem(item));
    const floatingSelections = selections.filter((selection) => selection.item.type !== "skeleton");
    const rawPlan = draft?.skeletonPlan ?? null;
    if (!rawPlan) {
      const canvasWidth = Math.max(760, Math.min(1240, Math.round(preferredWidth)));
      const canvasHeight = 520;
      const placements = floatingSelections.map((selection, index) => {
        const cardW = selection.item.assetKind === "palette" ? 132 : selection.imageUrl ? 128 : 144;
        const cardH = selection.imageUrl ? 110 : 78;
        const col = index % 4;
        const row = Math.floor(index / 4);
        const savedPosition = selectionConfirmPositions.find((position) => position.itemId === selection.id);
        return {
          selection,
          x: savedPosition
            ? Math.min(canvasWidth - cardW - 12, Math.max(12, savedPosition.x))
            : 32 + col * 164,
          y: savedPosition
            ? Math.min(canvasHeight - cardH - 12, Math.max(12, savedPosition.y))
            : 34 + row * 134,
          matchedNodeId: null,
        };
      });
      return {
        selections,
        placements,
        unmatched: floatingSelections,
        plan: null,
        scale: 1,
        width: canvasWidth,
        height: canvasHeight,
      };
    }
    const plan = normalizeConfirmPlan(rawPlan);

    const canvasWidth = Math.max(760, Math.min(1240, Math.round(preferredWidth)));
    const canvasHeight = Math.max(500, Math.round((plan.height / Math.max(1, plan.width)) * canvasWidth));
    const scale = canvasWidth / Math.max(1, plan.width);
    const usedSlots = new Map<string, number>();
    const placements: ConfirmCanvasPlacement[] = [];
    const unmatched: ConfirmSelectionItem[] = [];
    floatingSelections.forEach((selection, index) => {
      let bestNode = plan.nodes[0] ?? null;
      let bestScore = -1;
      for (const node of plan.nodes) {
        const boostedLabel =
          selection.item.assetKind === "font"
            ? `${node.label} label title text annotation`
            : selection.item.assetKind === "palette"
              ? `${node.label} style color palette`
              : node.label;
        const score = scoreConfirmNodeMatch(selection, boostedLabel);
        if (score > bestScore) {
          bestNode = node;
          bestScore = score;
        }
      }
      const cardW = selection.item.assetKind === "palette" ? 132 : 118;
      const savedPosition = selectionConfirmPositions.find((position) => position.itemId === selection.id);
      if (!bestNode || bestScore <= 0) {
        const unmatchedSlot = unmatched.length;
        const x = savedPosition
          ? Math.min(canvasWidth - cardW - 12, Math.max(12, savedPosition.x))
          : Math.min(canvasWidth - cardW - 12, Math.max(12, canvasWidth - cardW - 18));
        const y = savedPosition
          ? Math.min(canvasHeight - 74, Math.max(12, savedPosition.y))
          : Math.min(canvasHeight - 74, Math.max(12, 28 + unmatchedSlot * 86));
        placements.push({ selection, x, y, matchedNodeId: null });
        unmatched.push(selection);
        return;
      }
      const slot = usedSlots.get(bestNode.id) ?? 0;
      usedSlots.set(bestNode.id, slot + 1);
      const x = savedPosition
        ? Math.min(canvasWidth - cardW - 12, Math.max(12, savedPosition.x))
        : Math.min(canvasWidth - cardW - 12, Math.max(12, (bestNode.x + bestNode.w + 12) * scale));
      const y = savedPosition
        ? Math.min(canvasHeight - 74, Math.max(12, savedPosition.y))
        : Math.min(canvasHeight - 74, Math.max(12, (bestNode.y + slot * 76 - 8) * scale));
      placements.push({ selection, x, y, matchedNodeId: bestNode.id });
      if (index > plan.nodes.length * 2 && bestScore <= 0) unmatched.push(selection);
    });
    return { selections, placements, unmatched, plan, scale, width: canvasWidth, height: canvasHeight };
  }

  async function selectionImageForControl(selection: ConfirmSelectionItem) {
    if (!selection.imageUrl) return null;
    if (selection.imageUrl.startsWith("data:image/")) return selection.imageUrl;
    return imageUrlToDataUrl(selection.imageUrl);
  }

  async function buildSelectionConfirmControlImageDataUrl(draft: CanvasGenerationDraft | null) {
    const canvas = buildConfirmCanvasPlacements(draft);
    const { plan, width, height, scale, placements } = canvas;
    const nodeById = new Map(plan?.nodes.map((node) => [node.id, node] as const) ?? []);
    const placementById = new Map(placements.map((placement) => [placement.selection.id, placement] as const));
    const positionById = new Map(selectionConfirmPositions.map((position) => [position.itemId, position] as const));
    const sizeById = new Map(selectionConfirmSizes.map((size) => [size.itemId, size] as const));
    const imageById = new Map<string, string>();
    for (const placement of placements) {
      const image = await selectionImageForControl(placement.selection);
      if (image) imageById.set(placement.selection.id, image);
    }
    const defaultCardSize = (placement: ConfirmCanvasPlacement) => ({
      w: placement.selection.item.assetKind === "palette" ? 132 : placement.selection.imageUrl ? 110 : 126,
      h: placement.selection.imageUrl ? 94 : 68,
    });
    const cardSize = (placement: ConfirmCanvasPlacement) => sizeById.get(placement.selection.id) ?? defaultCardSize(placement);
    const cardPosition = (placement: ConfirmCanvasPlacement) =>
      positionById.get(placement.selection.id) ?? { itemId: placement.selection.id, x: placement.x, y: placement.y };
    const skeletonEdges = (plan?.edges ?? []).map((edge) => {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      if (!from || !to) return "";
      return `<line x1="${(from.x + from.w / 2) * scale}" y1="${(from.y + from.h / 2) * scale}" x2="${(to.x + to.w / 2) * scale}" y2="${(to.y + to.h / 2) * scale}" stroke="#8a8f98" stroke-width="1.8" marker-end="url(#arrow)"/>`;
    }).join("");
    const skeletonNodes = (plan?.nodes ?? []).map((node) => {
      const group = node.role === "group" || node.shape === "group";
      const labelLines = wrapSvgLines(node.label, group ? 22 : 15);
      const lineHeight = group ? 17 : 15;
      const textY = (node.y + node.h / 2) * scale - ((labelLines.length - 1) * lineHeight) / 2;
      const text = labelLines.map((line, index) =>
        `<text x="${(node.x + node.w / 2) * scale}" y="${textY + index * lineHeight}" text-anchor="middle" dominant-baseline="middle" font-size="${group ? 14 : 12}" font-weight="700" fill="#24272d">${escapeSvgText(line)}</text>`
      ).join("");
      return `<rect x="${node.x * scale}" y="${node.y * scale}" width="${node.w * scale}" height="${node.h * scale}" rx="${group ? 10 : 6}" fill="#ffffff" fill-opacity="${group ? "0.34" : "0.08"}" stroke="${group ? "#9aa0aa" : "#aeb3bd"}" stroke-width="${group ? 1.2 : 1}" ${group ? 'stroke-dasharray="7 5"' : ""}/>${text}`;
    }).join("");
    const cards = placements.map((placement) => {
      const position = cardPosition(placement);
      const size = cardSize(placement);
      const kind = placement.selection.item.assetKind ?? placement.selection.item.type;
      const title = escapeSvgText(placement.selection.title);
      const image = imageById.get(placement.selection.id);
      const isIcon = placement.selection.item.type === "asset" && placement.selection.item.assetKind === "icon";
      if (isIcon && image) {
        const iconSize = Math.max(28, Math.min(size.w, size.h) - 12);
        const x = position.x + (size.w - iconSize) / 2;
        const y = position.y + (size.h - iconSize) / 2;
        return `<g><image href="${escapeSvgText(image)}" x="${x}" y="${y}" width="${iconSize}" height="${iconSize}" preserveAspectRatio="xMidYMid meet"/><title>${title}</title></g>`;
      }
      const palette = placement.selection.colors.length
        ? placement.selection.colors.map((color, index) =>
          `<rect x="${position.x + 8 + index * ((size.w - 16) / placement.selection.colors.length)}" y="${position.y + 22}" width="${(size.w - 16) / placement.selection.colors.length}" height="26" fill="${escapeSvgText(color)}"/>`
        ).join("")
        : "";
      const imageEl = image
        ? `<image href="${escapeSvgText(image)}" x="${position.x + 8}" y="${position.y + 8}" width="${size.w - 16}" height="${size.h - 26}" preserveAspectRatio="xMidYMid meet"/>`
        : "";
      const textEl = !image && !palette
        ? wrapSvgLines(placement.selection.title, 16).map((line, index) =>
          `<text x="${position.x + size.w / 2}" y="${position.y + 25 + index * 14}" text-anchor="middle" font-size="12" font-weight="700" fill="#24272d">${escapeSvgText(line)}</text>`
        ).join("")
        : "";
      return `<g><rect x="${position.x}" y="${position.y}" width="${size.w}" height="${size.h}" rx="8" fill="#ffffff" fill-opacity="0.72" stroke="#a8adb7" stroke-width="1"/><text x="${position.x + 8}" y="${position.y + size.h - 8}" font-size="10" font-weight="700" fill="#626873">${escapeSvgText(kind)}</text>${imageEl}${palette}${textEl}<title>${title}</title></g>`;
    }).join("");
    const bindingArrows = selectionConfirmArrows.map((arrow) => {
      const placement = placementById.get(arrow.fromItemId);
      const node = nodeById.get(arrow.toNodeId);
      if (!placement || !node) return "";
      const position = cardPosition(placement);
      const size = cardSize(placement);
      const x1 = position.x + size.w;
      const y1 = position.y + size.h / 2;
      const x2 = node.x * scale;
      const y2 = (node.y + node.h / 2) * scale;
      const note = arrow.note ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}" font-size="12" font-weight="700" fill="#555b65">${escapeSvgText(arrow.note)}</text>` : "";
      return `<path d="M ${x1} ${y1} C ${x1 + 52} ${y1}, ${x2 - 52} ${y2}, ${x2} ${y2}" fill="none" stroke="#555b65" stroke-width="2.2" stroke-dasharray="7 5" marker-end="url(#orangeArrow)"/>${note}`;
    }).join("");
    const notes = selectionConfirmNotes.filter((note) => note.text.trim()).map((note) =>
      `<g><rect x="${note.x}" y="${note.y}" width="170" height="44" rx="7" fill="#ffffff" fill-opacity="0.82" stroke="#a8adb7"/><text x="${note.x + 10}" y="${note.y + 18}" font-size="12" font-weight="700" fill="#555b65">${escapeSvgText(note.text.trim().slice(0, 48))}</text></g>`
    ).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="#eef0f4" stroke-width="1"/></pattern>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#8a8f98"/></marker>
        <marker id="orangeArrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#555b65"/></marker>
      </defs>
      <rect width="100%" height="100%" fill="#fff"/>
      <rect width="100%" height="100%" fill="url(#grid)"/>
      <g>${skeletonEdges}${skeletonNodes}${cards}${bindingArrows}${notes}</g>
    </svg>`;
    return svgMarkupToPngDataUrl(svg, width, height);
  }

  async function handleGenerateFromMain(styleOverride?: ReferenceItem, sourceItem?: CreativeCanvasItem | null) {
    if (!styleOverride && !sourceItem) {
      openFirstGenerationSummary();
      return;
    }
    const selectedStyleCanvasReference =
      selectedCanvasItem?.type === "reference" && selectedCanvasItem.role === "style" ? selectedCanvasReference : null;
    const selectedOutputReference =
      selectedCanvasItem?.type === "output" && selectedCanvasVariant
        ? variantToReferenceItem(selectedCanvasVariant, prompt, selectedCanvasItem.outputStage ?? "final")
        : null;
    const generationStyleReference = styleOverride ?? selectedStyleCanvasReference ?? selectedOutputReference ?? styleReference;
    const selectedOutputSourceSkeleton =
      selectedCanvasItem?.type === "output" && selectedCanvasItem.sourceSkeletonId
        ? diagramSkeletonCandidates.find((candidate) => candidate.id === selectedCanvasItem.sourceSkeletonId) ?? null
        : null;
    let generationSkeleton = selectedSkeleton ?? selectedCanvasSkeleton ?? selectedOutputSourceSkeleton;
    const generationSourceItem = sourceItem ?? selectedCanvasItem;
    if (!generationStyleReference) {
      setState((current) => ({
        ...current,
        status: "Choose a style reference before generating figures.",
      }));
      return;
    }
    let trimmedPrompt = effectiveGenerationBrief;
    if (!trimmedPrompt) {
      setState((current) => ({
        ...current,
        status: "Add an original prompt before generating.",
      }));
      return;
    }
    if (!generationSkeleton && layoutReference) {
      const confirmation = await requestSkeletonPromptConfirmation(trimmedPrompt, layoutReference.title);
      if (!confirmation) return;
      trimmedPrompt = confirmation.prompt;
      setGeneratingSkeleton(true);
      setState((current) => ({
        ...current,
        layoutReferenceId: layoutReference.id,
        referenceUsage: {
          ...current.referenceUsage,
          [layoutReference.id]: {
            ...current.referenceUsage[layoutReference.id],
            layout: true,
          },
        },
        status: `Generating skeleton from "${layoutReference.title}" before figure generation...`,
      }));
      try {
        const imageDataUrl =
          layoutReference.imageDataUrl ??
          (layoutReference.thumbnailUrl ? await imageUrlToDataUrl(layoutReference.thumbnailUrl) : null);
        const skeleton = await generateDiagramSkeleton({
          prompt: trimmedPrompt,
          references: [{ ...layoutReference, imageDataUrl }],
        });
        const candidateId = `skeleton-${Date.now()}`;
        const candidate: DiagramSkeletonCandidate = {
          id: candidateId,
          title: skeleton.title || `Skeleton ${diagramSkeletonCandidates.length + 1}`,
          referenceId: layoutReference.id,
          referenceTitle: layoutReference.title,
          createdAt: new Date().toISOString(),
          source: skeleton.source ?? "model",
          initialXml: skeleton.xml ?? null,
          xml: skeleton.xml ?? null,
          mermaid: skeleton.mermaid ?? null,
          diagramPlan: skeleton.diagramPlan ?? null,
        };
        generationSkeleton = candidate;
        setState((current) => ({
          ...current,
          diagramSkeletonXml: skeleton.xml ?? null,
          diagramSkeletonPlan: skeleton.diagramPlan ?? null,
          diagramSkeletonMermaid: skeleton.mermaid ?? null,
          diagramSkeletonCandidates: [...current.diagramSkeletonCandidates, candidate],
          selectedDiagramSkeletonId: candidateId,
          nodeIconBindings: {},
          status: `Layout skeleton ready from "${layoutReference.title}". Continuing figure generation...`,
        }));
        const layoutSourceItem =
          canvasState.items.find(
            (item) => item.type === "reference" && item.role === "layout" && item.referenceId === layoutReference.id,
          ) ?? null;
        addSkeletonToCanvas(candidateId, layoutSourceItem);
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : "Unknown error";
        setState((current) => ({ ...current, status: `Layout skeleton draft failed: ${message}` }));
        setGeneratingSkeleton(false);
        return;
      } finally {
        setGeneratingSkeleton(false);
      }
    }
    if (!generationSkeleton) {
      setState((current) => ({
        ...current,
        status: "Add or generate a layout reference/skeleton before generating figures.",
      }));
      return;
    }

    setVariantGenerationProgress(null);
    setGenerating(true);
    setState((current) => ({
      ...current,
      canvasFocusReferenceId: generationStyleReference.id,
      referenceUsage: {
        ...current.referenceUsage,
        [generationStyleReference.id]: {
          ...current.referenceUsage[generationStyleReference.id],
          style: true,
        },
      },
      selectedDiagramSkeletonId: generationSkeleton.id,
      diagramSkeletonXml: generationSkeleton.xml ?? null,
      diagramSkeletonPlan:
        (generationSkeleton.xml ? parseDrawioXmlToDiagramPlan(generationSkeleton.xml) : null) ??
        generationSkeleton.diagramPlan ??
        null,
      diagramSkeletonMermaid: generationSkeleton.mermaid ?? null,
      status: "Generating figures...",
    }));

    try {
      const regionsForGenerate = referenceRegions.filter(
        (region) => region.referenceId === generationStyleReference.id && region.intent === "style",
      );
      const ingredientRegions = regionsForGenerate;
      const hasRegionIngredients = ingredientRegions.length > 0;
      const iconReferenceConnected = !hasRegionIngredients && hasGraphInput("figureGenerator", "iconReference");
      const fontReferenceConnected = !hasRegionIngredients && Boolean(fontReference) && hasGraphInput("figureGenerator", "fontReference");
      const generationPromptParts = [trimmedPrompt];
      const canvasIconAssetIds = Array.from(
        new Set(
          canvasState.items
            .filter((item) => item.type === "asset" && item.assetKind === "icon" && item.assetId)
            .map((item) => item.assetId as string),
        ),
      );
      const customIconIds = Array.from(
        new Set([
          ...ingredientRegions
            .filter((region) => region.iconEnabled && region.selectedIconSource === "detected" && region.customIconId)
            .map((region) => region.customIconId as string),
          ...canvasIconAssetIds.filter((id) => selectedIconAssetIdSet.has(id) && customIconReferences.some((icon) => icon.id === id)),
        ]),
      );
      const enabledCustomIcons = customIconIds
        .map((id) => customIconReferences.find((icon) => icon.id === id))
        .filter((icon): icon is CustomIconReference => Boolean(icon));
      const customIconReferenceItems: ReferenceItem[] = enabledCustomIcons.map((customIcon) => ({
        id: `hichart-custom-icon-${customIcon.id}`,
        title: isStyleCropReference(customIcon)
          ? `${customIcon.label} style crop reference`
          : `${customIcon.label} detected icon reference`,
        sourcePaper: "HiChart workspace extraction",
        venue: "Extracted from style",
        year: new Date().getFullYear(),
        imageType: isStyleCropReference(customIcon) ? "local style crop" : "detected scientific icon crop",
        subject: customIcon.description,
        styleTags: isStyleCropReference(customIcon)
          ? ["style crop", "local visual reference", "extracted from style", ...customIcon.tags]
          : ["icon", "detected", "extracted from style", ...customIcon.tags],
        similarityReason:
          isStyleCropReference(customIcon)
            ? "User-selected style crop from a marked style region; use as local visual guidance for motif, stroke, texture, typography, or small pictorial detail."
            : "User-selected icon crop from a marked style region; use as a symbol/style reference without copying surrounding content.",
        thumbnail: customIcon.label.slice(0, 3).toUpperCase(),
        thumbnailUrl: customIcon.cropDataUrl,
        imageDataUrl: customIcon.cropDataUrl,
        structuralAnalysis: customIcon.description,
      }));
      const canvasPresetIconIds = canvasIconAssetIds.filter((id) =>
        scientificIconReferences.some((icon) => icon.id === id),
      );
      const enabledCanvasPresetIcons = canvasPresetIconIds
        .map((id) => scientificIconReferences.find((icon) => icon.id === id))
        .filter((icon): icon is (typeof scientificIconReferences)[number] => Boolean(icon));
      const enabledRegionIcons = Array.from(
        new Set(
          ingredientRegions
            .filter((region) => region.iconEnabled && region.selectedIconSource !== "detected")
            .map((region) => region.suggestedIconId)
            .filter(Boolean),
        ),
      );
      const presetIconReferenceItems = Array.from(
        new Set([
          ...(iconReferenceConnected ? iconReferences.map((icon) => icon.id) : []),
          ...enabledCanvasPresetIcons.map((icon) => icon.id),
          ...(enabledRegionIcons as string[]),
        ]),
      )
        .map((id) => scientificIconReferences.find((icon) => icon.id === id))
        .filter((icon): icon is (typeof scientificIconReferences)[number] => Boolean(icon))
        .map((icon) => scientificIconReferenceItem(icon));
      const generationReferences = [
        ...(layoutReference ? [layoutReference] : []),
        generationStyleReference,
        ...customIconReferenceItems,
        ...presetIconReferenceItems,
      ];
      const referencesWithImages = await hydrateReferenceImages(generationReferences);
      if (iconReferenceConnected) {
        generationPromptParts.push(
          `Icon image references: selected icon pictures are attached as visual symbol references. Use them when a skeleton element clearly matches the meaning; adapt their stroke, scale, and colors to the selected style reference, but keep layout and overall style governed by the skeleton and style reference: ${iconReferences
            .map((icon) => `${icon.label} (${icon.role})`)
            .join(", ")}.`,
        );
      }
      if (enabledCanvasPresetIcons.length > 0) {
        generationPromptParts.push(
          `Canvas icon image references: the user placed these icon pictures on the reference canvas: ${enabledCanvasPresetIcons
            .map((icon) => `${icon.label} (${icon.role})`)
            .join(", ")}. Use them for matching skeleton elements while preserving layout/style priority.`,
        );
      }
      if (enabledRegionIcons.length > 0) {
        const labels = enabledRegionIcons
          .map((id) => scientificIconReferences.find((item) => item.id === id)?.label ?? id)
          .join(", ");
        generationPromptParts.push(
          `Icon treatment from marked style regions: use visual symbol treatments similar to ${labels}. Adapt them to the selected style reference without copying content.`,
        );
      }
      if (enabledCustomIcons.length > 0) {
        generationPromptParts.push(
          `Detected icon reference image(s): use these user-extracted icon crops as visual symbol/style references: ${enabledCustomIcons
            .map((icon) => icon.label)
            .join(", ")}. Adapt them to the selected figure style and do not copy surrounding source content.`,
        );
      }
      if (fontReferenceConnected && fontReference) {
        generationPromptParts.push(
          `Font reference: use ${fontReference.label} as the typography intent for labels and annotations. Tone: ${fontReference.tone}. ${fontReference.description}`,
        );
      }
      if (!hasRegionIngredients && paletteReference) {
        generationPromptParts.push(
          `Palette reference: use ${paletteReference.label} as the color intent. Tone: ${paletteReference.tone}. Colors: ${paletteReference.colors.join(", ")}. ${paletteReference.description}`,
        );
      }
      const generated = await generateVariants({
        prompt: generationPromptParts.join("\n\n"),
        referenceIds: referencesWithImages.map((reference) => reference.id),
        selectedReferenceId: generationStyleReference.id,
        layoutReferenceId: layoutReference?.id ?? null,
        references: referencesWithImages,
        referenceRegions: regionsForGenerate,
        diagramSkeletonXml: generationSkeleton.xml ?? generationSkeleton.mermaid ?? diagramSkeletonXml ?? diagramSkeletonMermaid ?? "",
      }, handleVariantGenerationProgress);
      const generationRunId = Date.now();
      const generatedForCanvas = generated.map((variant, index) => ({
        ...variant,
        id: `generate-${generationRunId}-${index + 1}-${variant.id}`,
      }));
      setState((current) => {
        const figureHistory = appendFigureHistoryEntries(current, generatedForCanvas, {
          sourceStage: "compose",
          sourceType: "generate",
        });
        return {
          ...current,
          variants: [...generatedForCanvas, ...current.variants],
          selectedVariantId: generatedForCanvas[0]?.id ?? current.selectedVariantId,
          figureHistory,
          status:
            generatedForCanvas.length === 1
              ? "Generated 1 figure."
              : `Generated ${generatedForCanvas.length} figures.`,
        };
      });
      if (generatedForCanvas.length > 0) {
        const outputIconReferenceIds = Array.from(
          new Set(
            [
              ...enabledCustomIcons.map((icon) => icon.id),
              ...enabledCanvasPresetIcons.map((icon) => icon.id),
              ...(enabledRegionIcons as string[]),
              ...(!hasRegionIngredients ? selectedIconReferenceIds : []),
            ].filter(Boolean),
          ),
        );
        addOutputsToCanvas(
          generatedForCanvas.map((variant) => variant.id),
          generationSourceItem,
          generationStyleReference.id,
          generationSkeleton.id,
          outputIconReferenceIds[0],
          !hasRegionIngredients ? fontReference?.id : undefined,
          !hasRegionIngredients ? paletteReference?.id : undefined,
          outputIconReferenceIds,
          generatedForCanvas
            .filter((variant) => variant.draftPreviewImageDataUrl || variant.draftPreviewImageUrl)
            .map((variant) => variant.id),
        );
      }
    } catch (error) {
      console.warn("Layout skeleton generation failed", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      setState((current) => ({
        ...current,
        status: `Generation failed: ${message}`,
      }));
    } finally {
      setGenerating(false);
      setVariantGenerationProgress(null);
    }
  }

  async function handleRunGraph() {
    let trimmedPrompt = effectiveGenerationBrief;
    let runtimeSkeletonXml = selectedSkeleton?.xml ?? selectedSkeleton?.mermaid ?? null;
    const figureNode = graph.nodes.find((node) => node.type === "figureGenerator");
    const outputNode = graph.nodes.find((node) => node.type === "output");
    const skeletonNode = graph.nodes.find((node) => node.type === "skeletonGenerator");
    if (!figureNode && !outputNode) {
      setGraphMessage("Add a Figure Generator or Output node before running.");
      return;
    }
    if (!trimmedPrompt || !hasGraphInput("figureGenerator", "prompt")) {
      setGraphMessage("Run Graph needs Prompt.prompt connected to Figure Generator.prompt.");
      setState((current) => ({ ...current, status: "Graph missing prompt input." }));
      return;
    }
    if (!styleReference || !hasGraphInput("figureGenerator", "styleReference")) {
      setGraphMessage("Run Graph needs Style Reference.reference connected to Figure Generator.styleReference.");
      setState((current) => ({ ...current, status: "Graph missing style reference input." }));
      return;
    }
    if (!selectedSkeleton) {
      if (
        !layoutReference ||
        !hasGraphInput("skeletonGenerator", "prompt") ||
        !hasGraphInput("skeletonGenerator", "layoutReference")
      ) {
        setGraphMessage("Skeleton Generator needs Prompt.prompt and Layout Reference.reference connected.");
        setState((current) => ({ ...current, status: "Graph missing skeleton inputs." }));
        return;
      }
      const confirmation = await requestSkeletonPromptConfirmation(trimmedPrompt, layoutReference.title);
      if (!confirmation) return;
      trimmedPrompt = confirmation.prompt;
      setGeneratingSkeleton(true);
      updateGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.type === "skeletonGenerator" ? { ...node, status: "running" } : node,
        ),
      }));
      try {
        const imageDataUrl =
          layoutReference.imageDataUrl ??
          (layoutReference.thumbnailUrl ? await imageUrlToDataUrl(layoutReference.thumbnailUrl) : null);
        const skeleton = await generateDiagramSkeleton({
          prompt: trimmedPrompt,
          references: [{ ...layoutReference, imageDataUrl }],
        });
        runtimeSkeletonXml = skeleton.xml ?? skeleton.mermaid ?? runtimeSkeletonXml;
        const candidateId = `skeleton-${Date.now()}`;
        const candidate: DiagramSkeletonCandidate = {
          id: candidateId,
          title: skeleton.title || `Skeleton ${diagramSkeletonCandidates.length + 1}`,
          referenceId: layoutReference.id,
          referenceTitle: layoutReference.title,
          createdAt: new Date().toISOString(),
          source: skeleton.source ?? "model",
          initialXml: skeleton.xml ?? null,
          xml: skeleton.xml ?? null,
          mermaid: skeleton.mermaid ?? null,
          diagramPlan: skeleton.diagramPlan ?? null,
        };
        setState((current) => ({
          ...current,
          diagramSkeletonXml: skeleton.xml ?? null,
          diagramSkeletonPlan: skeleton.diagramPlan ?? null,
          diagramSkeletonMermaid: skeleton.mermaid ?? null,
          diagramSkeletonCandidates: [...current.diagramSkeletonCandidates, candidate],
          selectedDiagramSkeletonId: candidateId,
          nodeIconBindings: {},
          status: `Graph skeleton ready from "${layoutReference.title}".`,
          intentGraph: {
            ...(current.intentGraph ?? createDefaultIntentGraph()),
            nodes: (current.intentGraph ?? createDefaultIntentGraph()).nodes.map((node) =>
              node.type === "skeletonGenerator" ? { ...node, status: "ready" } : node,
            ),
          },
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        updateGraph((current) => ({
          ...current,
          nodes: current.nodes.map((node) =>
            node.type === "skeletonGenerator" ? { ...node, status: "error" } : node,
          ),
        }));
        setState((current) => ({ ...current, status: `Graph skeleton failed: ${message}` }));
        setGraphMessage(`Skeleton generation failed: ${message}`);
        setGeneratingSkeleton(false);
        return;
      } finally {
        setGeneratingSkeleton(false);
      }
    }
    if (!hasGraphInput("figureGenerator", "skeleton")) {
      setGraphMessage("Run Graph needs Skeleton Generator.skeleton connected to Figure Generator.skeleton.");
      setState((current) => ({ ...current, status: "Graph missing skeleton connection." }));
      return;
    }
    if (!runtimeSkeletonXml) {
      setGraphMessage("Run Graph needs a generated Skeleton before Figure Generator can run.");
      setState((current) => ({ ...current, status: "Graph is missing generated Skeleton data." }));
      return;
    }

    setVariantGenerationProgress(null);
    setGenerating(true);
    updateGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.type === "figureGenerator" ? { ...node, status: "running" } : node,
      ),
    }));
    setState((current) => ({
      ...current,
      status: "Running graph...",
    }));
    try {
      const graphReferences = [
        ...(layoutReference ? [layoutReference] : []),
        styleReference,
      ];
      const referencesWithImages = await hydrateReferenceImages(graphReferences);
      const generated = await generateVariants({
        prompt: trimmedPrompt,
        referenceIds: referencesWithImages.map((reference) => reference.id),
        selectedReferenceId: styleReference.id,
        layoutReferenceId: layoutReference?.id ?? null,
        references: referencesWithImages,
        referenceRegions: styleMarks,
        diagramSkeletonXml: runtimeSkeletonXml,
      }, handleVariantGenerationProgress);
      const generationRunId = Date.now();
      const generatedForCanvas = generated.map((variant, index) => ({
        ...variant,
        id: `graph-${generationRunId}-${index + 1}-${variant.id}`,
      }));
      setState((current) => {
        const figureHistory = appendFigureHistoryEntries(current, generatedForCanvas, {
          sourceStage: "compose",
          sourceType: "generate",
        });
        return {
          ...current,
          variants: [...generatedForCanvas, ...current.variants],
          selectedVariantId: generatedForCanvas[0]?.id ?? current.selectedVariantId,
          figureHistory,
          status:
            generatedForCanvas.length === 1
              ? "Graph generated 1 figure."
              : `Graph generated ${generatedForCanvas.length} figures.`,
          intentGraph: {
            ...(current.intentGraph ?? createDefaultIntentGraph()),
            nodes: (current.intentGraph ?? createDefaultIntentGraph()).nodes.map((node) =>
              node.type === "figureGenerator" || node.type === "output" ? { ...node, status: "ready" } : node,
            ),
          },
        };
      });
      if (generatedForCanvas.length > 0) {
        const generationSource =
          canvasState.items.find((item) => item.type === "skeleton" && item.skeletonId === selectedDiagramSkeletonId) ??
          canvasState.items.find((item) => item.type === "reference" && item.role === "style" && item.referenceId === styleReference.id) ??
          null;
        addOutputsToCanvas(
          generatedForCanvas.map((variant) => variant.id),
          generationSource,
          styleReference.id,
          selectedDiagramSkeletonId,
          selectedIconReferenceIds[0],
          fontReference?.id,
          paletteReference?.id,
          selectedIconReferenceIds,
          generatedForCanvas
            .filter((variant) => variant.draftPreviewImageDataUrl || variant.draftPreviewImageUrl)
            .map((variant) => variant.id),
        );
      }
      setGraphMessage("Graph run complete.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      updateGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.type === "figureGenerator" ? { ...node, status: "error" } : node,
        ),
      }));
      setState((current) => ({ ...current, status: `Graph generation failed: ${message}` }));
      setGraphMessage(`Figure generation failed: ${message}`);
    } finally {
      setGenerating(false);
      setVariantGenerationProgress(null);
    }
  }

  const stageIconBindingCount = Object.keys(
    pruneNodeIconBindingsForPlan(
      selectedSkeleton
        ? skeletonStyleApplications[selectedSkeleton.id]?.nodeIconBindings ?? state.nodeIconBindings
        : state.nodeIconBindings,
      selectedSkeletonPlan,
    ),
  ).length;

  const stages: Array<{
    id: DashboardStageId;
    label: string;
    value: string;
    ready: boolean;
  }> = [
    {
      id: "content",
      label: state.activeStudioStep === "retrieval" ? "Retrieval" : "Prompt",
      value: board.length > 0 ? `${board.length} references` : "not started",
      ready: effectiveGenerationBrief.length > 0 && board.length > 0,
    },
    {
      id: "layout",
      label: "Layout",
      value: selectedSkeleton ? "skeleton selected" : "needs skeleton",
      ready: Boolean(selectedSkeleton),
    },
    {
      id: "style",
      label: "Style",
      value: styleReference ? "reference selected" : "needs reference",
      ready: Boolean(styleReference),
    },
    {
      id: "icons",
      label: "Match",
      value: selectedSkeleton
        ? `${stageIconBindingCount} icons`
        : "needs skeleton",
      ready: Boolean(selectedSkeleton && stageIconBindingCount),
    },
    {
      id: "candidate",
      label: "Candidate",
      value: selectedVariant ? "figure selected" : "needs output",
      ready: Boolean(selectedVariant),
    },
  ];

  const studioStage: DashboardStageId = activeStage ?? dashboardStageForIdeaSparkStep(state.activeStudioStep);
  const activeIdeaSparkStep = ideaSparkStepForDashboardStage(studioStage, state.activeStudioStep);

  useEffect(() => {
    if (studioStage === "layout" || studioStage === "style") return;
    if (!childStageActionRef.current && !childStageActionSigRef.current) return;
    childStageActionRef.current = null;
    childStageActionSigRef.current = "";
    setChildStageActionTick((tick) => tick + 1);
  }, [studioStage, activeIdeaSparkStep]);
  const showBothStudioSourceCategories =
    studioStage === "content" && (activeIdeaSparkStep === "prompt" || activeIdeaSparkStep === "retrieval");
  const studioSourceGroups = studioStage === "layout"
    ? [{ role: "layout" as const, label: "Layout Pocket", references: studioSelectedLayoutReferences, selectedId: layoutReferenceId }]
    : studioStage === "style"
      ? [{ role: "style" as const, label: "Style Pocket", references: studioSelectedStyleReferences, selectedId: canvasFocusReferenceId }]
      : [
          { role: "layout" as const, label: "Layout Pocket", references: studioSelectedLayoutReferences, selectedId: layoutReferenceId },
          { role: "style" as const, label: "Style Pocket", references: studioSelectedStyleReferences, selectedId: canvasFocusReferenceId },
        ];
  const activeStageLabel =
    studioStage === "review" ? "History" : stages.find((stage) => stage.id === studioStage)?.label ?? "Studio";

  useEffect(() => {
    if (workspaceView !== "studio" || (studioStage !== "layout" && studioStage !== "style")) return;
    const sourceRole = studioStage === "layout" ? "layout" : "style";
    setPocketRole(sourceRole);
    setDrawerTab(sourceRole);
    updateCreativeCanvas((canvas) => canvas.drawerCollapsed
      ? { ...canvas, drawerCollapsed: false }
      : canvas, { trackUndo: false });
    // Skeleton and Style should each reveal the matching source pocket first.
    // Canvas mutations must not retrigger this focus step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioStage, workspaceView]);

  function handleRestoreIdea(nodeId: string, options?: { remainOnHistory?: boolean }) {
    const node = state.ideaHistory.nodes.find((item) => item.id === nodeId);
    if (node?.deletedAt) return;
    const snapshot = node ? state.ideaHistory.snapshots[node.snapshotId] : null;
    const snapshotSurface = snapshot?.studioSurface;
    const restoreEditMode = node?.kind === "edit" || snapshotSurface === "edit";
    const inferredStep = ideaSparkStepFromHistoryNode(node, snapshotSurface);
    const stayOnHistory = options?.remainOnHistory === true;
    setState((current) => {
      const restored = restoreIdeaHistoryNode(current, nodeId);
      return {
        ...restored,
        activeStudioStep: stayOnHistory ? "review" : inferredStep,
        ideaHistory: { ...restored.ideaHistory, homeOpen: false },
      };
    });
    // Stay put when restoring from History: jumping away unmounts the tree in
    // the same tick as tldraw / portal teardown and React 19 then crashes on
    // removeChild. The workspace is already rolled back either way.
    if (stayOnHistory) {
      setCandidateMode("preview");
      setActiveStage("review");
      return;
    }
    setActiveStage(dashboardStageForIdeaSparkStep(inferredStep));
    setCandidateMode(restoreEditMode ? "edit" : "preview");
  }

  useEffect(() => {
    if (!figureFocusRequest) return;
    if (figureFocusRequest.nodeId === "__new__") {
      setActiveStage(dashboardStageForIdeaSparkStep(state.activeStudioStep));
      return;
    }
    handleRestoreIdea(figureFocusRequest.nodeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [figureFocusRequest?.nonce, figureFocusRequest?.nodeId]);

  function openIdeaSparkStep(step: IdeaSparkStepId) {
    setState((current) => appendStudyEvent({
      ...current,
      activeStudioStep: step,
      ideaHistory: { ...current.ideaHistory, homeOpen: false },
    }, {
      stage: current.activeStudyStage,
      type: "idea_spark_step_opened",
      targetIds: current.ideaHistory.activeNodeId ? [current.ideaHistory.activeNodeId] : [],
      result: step,
      metadata: { rootId: current.ideaHistory.activeRootId },
    }));
    if (step === "prompt" || step === "retrieval") {
      setActiveStage("content");
      return;
    }
    if (step === "layout") {
      setActiveStage("layout");
      return;
    }
    if (step === "skeleton") {
      setActiveStage("layout");
      if (selectedSkeleton) setSkeletonEditorOpen(true);
      return;
    }
    if (step === "style") {
      setActiveStage("style");
      return;
    }
    if (step === "icons") {
      focusNodeIconMapping();
      return;
    }
    if (step === "candidate") {
      setState((current) => {
        const selectedOutput = current.selectedVariantId
          ? current.variants.find(
              (variant) => variant.id === current.selectedVariantId && !variant.deletedAt,
            ) ?? null
          : null;
        if (selectedOutput) return current;
        const currentCandidate = [...current.ideaHistory.nodes]
          .reverse()
          .find((node) =>
            node.rootId === current.ideaHistory.activeRootId &&
            node.kind === "candidate" &&
            node.variantId &&
            !node.deletedAt,
          );
        return currentCandidate?.variantId
          ? { ...current, selectedVariantId: currentCandidate.variantId }
          : current;
      });
      setActiveStage("candidate");
      setCandidateMode("preview");
      return;
    }
    if (step === "edit") {
      const currentResult = [...state.ideaHistory.nodes]
        .reverse()
        .find((node) =>
          node.rootId === state.ideaHistory.activeRootId &&
          (node.kind === "edit" || node.kind === "candidate") &&
          node.variantId &&
          !node.deletedAt,
        );
      const target = currentResult?.variantId
        ? variants.find((variant) => variant.id === currentResult.variantId && !variant.deletedAt) ?? null
        : null;
      if (!target) {
        setActiveStage("candidate");
        setCandidateMode("preview");
        return;
      }
      openVariantInEdit(target.id);
      return;
    }
    if (selectedVariant) openReviewWorkspace();
    else setActiveStage("candidate");
  }
  const currentSkeletonBindings = pruneNodeIconBindingsForPlan(
    selectedSkeleton
      ? skeletonStyleApplications[selectedSkeleton.id]?.nodeIconBindings ?? state.nodeIconBindings
      : state.nodeIconBindings,
    selectedSkeletonPlan,
  );
  const currentSkeletonBindingCount = Object.keys(currentSkeletonBindings).length;
  const matchPreviewFontFamily = fontReference?.cssFamily;
  const matchPreviewPaletteColors = state.matchedStylePalette?.colors.length
    ? state.matchedStylePalette.colors
    : paletteReference?.colors ?? [];

  const firstGenerationSkeleton = workflowSkeleton;
  const firstGenerationPlan = firstGenerationSkeleton?.xml
    ? parseDrawioXmlToDiagramPlan(firstGenerationSkeleton.xml) ?? firstGenerationSkeleton.diagramPlan ?? null
    : firstGenerationSkeleton?.diagramPlan ?? null;
  const firstGenerationBindings = firstGenerationSkeleton
    ? skeletonStyleApplications[firstGenerationSkeleton.id]?.nodeIconBindings ??
      (selectedDiagramSkeletonId === firstGenerationSkeleton.id ? state.nodeIconBindings : {})
    : state.nodeIconBindings;
  const resolvedFirstGenerationBindings = resolveFirstGenerationNodeIconBindings({
    plan: firstGenerationPlan,
    nodeIconBindings: firstGenerationBindings,
  });
  const resolvedBindingRecord = Object.fromEntries(
    resolvedFirstGenerationBindings.map((binding) => [binding.targetNodeId, binding.iconId]),
  );
  const generationReadiness = resolveFirstGenerationReadiness({
    workingPrompt: effectiveGenerationBrief,
    skeletonId: firstGenerationSkeleton?.id,
    styleReferenceId: styleReference?.id,
  });
  const activeRootNodes = state.ideaHistory.nodes.filter(
    (node) => node.rootId === state.ideaHistory.activeRootId,
  );
  const latestCandidateNode = [...activeRootNodes].reverse().find((node) => node.kind === "candidate") ?? null;
  const candidateDisplayVariantId = candidatePreviewVariantId && variants.some(
    (variant) => variant.id === candidatePreviewVariantId && !variant.deletedAt,
  )
    ? candidatePreviewVariantId
    : selectedVariantId;
  const activeVariant = candidateDisplayVariantId
    ? variants.find((variant) => variant.id === candidateDisplayVariantId) ?? null
    : null;
  const candidateVariantId = activeVariant?.sourceVariantId ?? activeVariant?.id ?? latestCandidateNode?.variantId ?? null;
  const candidateVariant = candidateVariantId
    ? variants.find((variant) => variant.id === candidateVariantId) ?? null
    : null;
  const candidateInputSnapshot = candidateVariantId
    ? state.candidateGenerationSnapshots[candidateVariantId] ?? null
    : null;
  const candidateSnapshotSkeletonPlan = candidateInputSnapshot?.skeletonXml
    ? parseDrawioXmlToDiagramPlan(candidateInputSnapshot.skeletonXml)
    : null;
  const sortedBindingEntries = (bindings: Record<string, string>) =>
    Object.entries(bindings).sort(([left], [right]) => left.localeCompare(right));
  const bindingsDiffer = (left: Record<string, string>, right: Record<string, string>) =>
    JSON.stringify(sortedBindingEntries(left)) !== JSON.stringify(sortedBindingEntries(right));
  const currentMatchAppearanceFingerprint = createMatchedStyleAppearanceFingerprint({
    fontId: state.fontReferenceId,
    paletteId: state.paletteReferenceId,
    extractedPalette: state.matchedStylePalette,
  });
  const candidateChangedSteps = {
    prompt: Boolean(
      !generating &&
      candidateInputSnapshot &&
      candidateInputSnapshot.promptFingerprint !== createPromptFingerprint(effectiveGenerationBrief),
    ),
    skeleton: Boolean(
      !generating && candidateInputSnapshot && firstGenerationSkeletonChanged({
        snapshotId: candidateInputSnapshot.skeletonId,
        snapshotSource: candidateInputSnapshot.skeletonXml,
        snapshotPlan: candidateSnapshotSkeletonPlan,
        currentId: firstGenerationSkeleton?.id ?? null,
        currentSource: firstGenerationSkeleton?.xml ?? firstGenerationSkeleton?.mermaid ?? null,
        currentPlan: firstGenerationPlan,
      }),
    ),
    style: Boolean(
      !generating &&
      candidateInputSnapshot && (
        candidateInputSnapshot.styleReferenceId !== (styleReference?.id ?? null) ||
        (candidateInputSnapshot.styleKitFingerprint &&
          candidateInputSnapshot.styleKitFingerprint !== activeStyleKit.fingerprint)
      ),
    ),
    icons: Boolean(
      !generating &&
      candidateInputSnapshot &&
      (
        bindingsDiffer(candidateInputSnapshot.nodeIconBindings, resolvedBindingRecord) ||
        candidateInputSnapshot.matchAppearanceFingerprint !== currentMatchAppearanceFingerprint
      ),
    ),
  };
  const candidateStaleReasons = [
    candidateChangedSteps.prompt ? "Prompt" : null,
    candidateChangedSteps.skeleton ? "Skeleton" : null,
    candidateChangedSteps.style ? "Style" : null,
    candidateChangedSteps.icons ? "Match" : null,
  ].filter((reason): reason is string => Boolean(reason));
  const candidateInputsAreStale = candidateStaleReasons.length > 0;
  const currentPromptRevisionIndex = state.promptRevisions.findIndex(
    (revision) => revision.id === state.currentPromptRevisionId,
  );
  const currentPromptRevision = currentPromptRevisionIndex >= 0
    ? state.promptRevisions[currentPromptRevisionIndex]
    : null;
  const ideaSparkGenerationStatus: IdeaSparkGenerationStatus = {
    canGenerate: generationReadiness.canGenerate,
    missing: generationReadiness.missing,
    running: {
      layout: generatingSkeleton || state.layoutSkeletonGenerationInProgress,
      style: false,
      candidate: generating || pendingModifyJobList.length > 0,
    },
    prompt: {
      ready: generationReadiness.promptReady,
      preview: effectiveGenerationBrief,
      revisionLabel: !generationReadiness.promptReady
        ? "Required before generation"
        : currentPromptRevision?.text === effectiveGenerationBrief
          ? `Saved revision ${currentPromptRevisionIndex + 1}`
          : "Current unsaved draft",
    },
    layout: {
      ready: Boolean(layoutReference),
      referenceId: layoutReference?.id ?? null,
      title: layoutReference?.title ?? "No Layout selected",
    },
    skeleton: {
      ready: generationReadiness.skeletonReady,
      stale: promptArtifactIsStale(state, "skeleton"),
      id: firstGenerationSkeleton?.id ?? null,
      title: firstGenerationSkeleton?.title ?? "No Skeleton selected",
      nodeCount: firstGenerationPlan?.nodes.length ?? 0,
      relationCount: firstGenerationPlan?.edges.length ?? 0,
    },
    style: {
      ready: generationReadiness.styleReady,
      referenceId: styleReference?.id ?? null,
      title: styleReference?.title ?? "No Style selected",
    },
    icons: { count: resolvedFirstGenerationBindings.length },
    candidate: {
      id: candidateVariant?.id ?? null,
      title: candidateVariant?.title ?? "No Candidate generated",
      count: activeRootNodes.filter((node) => node.kind === "candidate").length,
      stale: candidateInputsAreStale,
    },
    editCount: activeRootNodes.filter((node) => node.kind === "edit").length,
    reviewCount: state.reviewResult.length,
  };

  function openReviewWorkspace() {
    setActiveStage("review");
    setState((current) => transitionStudyStage({
      ...current,
      activeStudioStep: "review",
    }, "review", {
      status: "Opened History.",
    }));
  }

  const graphEdges = graph.edges
    .map((edge) => {
      const fromNode = graphNodeById.get(edge.fromNodeId);
      const toNode = graphNodeById.get(edge.toNodeId);
      if (!fromNode || !toNode) return null;
      const from =
        portAnchors[getPortKey(fromNode.id, edge.fromPort, "output")] ??
        getNodePortAnchor(fromNode, edge.fromPort, "output");
      const to =
        portAnchors[getPortKey(toNode.id, edge.toPort, "input")] ??
        getNodePortAnchor(toNode, edge.toPort, "input");
      const c1 = from.x + Math.max(80, (to.x - from.x) * 0.45);
      const c2 = to.x - Math.max(80, (to.x - from.x) * 0.45);
      return {
        edge,
        fromNode,
        toNode,
        path: `M ${from.x} ${from.y} C ${c1} ${from.y}, ${c2} ${to.y}, ${to.x} ${to.y}`,
        mid: {
          x: (from.x + to.x) / 2,
          y: (from.y + to.y) / 2,
        },
      };
    })
    .filter(Boolean) as Array<{
      edge: IntentGraphEdge;
      fromNode: IntentGraphNode;
      toNode: IntentGraphNode;
      path: string;
      mid: { x: number; y: number };
    }>;
  const selectedGraphEdge = graphEdges.find(({ edge }) => edge.id === selectedEdgeId) ?? null;

  function renderGraphPorts(node: IntentGraphNode, direction: GraphPortDirection) {
    const definition = graphNodeDefinitions[node.type];
    const ports = direction === "input" ? definition.inputs : definition.outputs;
    return (
      <div className={`intent-node-ports intent-node-ports-${direction}`}>
        {ports.map((port) => {
          const pending =
            pendingConnection?.nodeId === node.id &&
            pendingConnection.port === port.id &&
            pendingConnection.direction === direction;
          return (
            <button
              key={port.id}
              type="button"
              data-port-key={getPortKey(node.id, port.id, direction)}
              className={`intent-port intent-port-${direction} ${pending ? "is-pending" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                handleGraphPortClick(node.id, port.id, direction);
              }}
              title={`${node.title}.${port.id}`}
            >
              {direction === "input" ? <span className="intent-port-dot" /> : null}
              <span>{port.label}</span>
              {direction === "output" ? <span className="intent-port-dot" /> : null}
            </button>
          );
        })}
      </div>
    );
  }

  function renderGraphNodeSummary(node: IntentGraphNode) {
    if (node.type === "prompt") return effectiveGenerationBrief ? `${effectiveGenerationBrief.slice(0, 120)}...` : "No generation brief yet.";
    if (node.type === "referenceSearch") return `${board.length} references in workspace.`;
    if (node.type === "layoutReference") return layoutReference?.title ?? "No layout reference selected.";
    if (node.type === "styleReference") return styleReference?.title ?? "No style reference selected.";
    if (node.type === "iconReference") return `${iconReference.label}: ${iconReference.description}`;
    if (node.type === "fontReference") {
      return fontReference ? `${fontReference.label}: ${fontReference.tone}` : "No font reference selected.";
    }
    if (node.type === "skeletonGenerator") return selectedSkeleton?.title ?? "No skeleton generated.";
    if (node.type === "figureGenerator") {
      if (visibleOutputVariants.length > 0) {
        return `${visibleOutputVariants.length} active output${visibleOutputVariants.length === 1 ? "" : "s"} ready.`;
      }
      return "No active canvas outputs yet.";
    }
    return selectedVariant?.title ?? "No output selected.";
  }

  function renderGraphNodePreview(node: IntentGraphNode) {
    if (node.type === "referenceSearch") {
      const previews = board.slice(0, 3).filter((item) => item.thumbnailUrl);
      if (previews.length === 0) return null;
      return (
        <div className="intent-node-preview-strip">
          {previews.map((item) => (
            <img key={item.id} src={item.thumbnailUrl || undefined} alt="" />
          ))}
        </div>
      );
    }
    if (node.type === "layoutReference" && layoutReference?.thumbnailUrl) {
      return <img className="intent-node-preview" src={layoutReference.thumbnailUrl} alt="" />;
    }
    if (node.type === "styleReference" && styleReference?.thumbnailUrl) {
      return <img className="intent-node-preview" src={styleReference.thumbnailUrl} alt="" />;
    }
    if (node.type === "iconReference") {
      return (
        <img
          className="intent-node-preview intent-node-icon-preview"
          src={scientificIconDataUrl(iconReference.id)}
          alt=""
        />
      );
    }
    if (node.type === "fontReference") {
      if (!fontReference) return null;
      return (
        <div className="intent-node-font-preview" style={{ fontFamily: fontReference.cssFamily }}>
          <strong>Aa</strong>
          <span>{fontReference.label}</span>
        </div>
      );
    }
    if (node.type === "output" && selectedVariant) {
      const src = selectedVariant.previewImageDataUrl ?? selectedVariant.previewImageUrl ?? null;
      return src ? <img className="intent-node-preview" src={src} alt="" /> : null;
    }
    return null;
  }

  function renderGraphDetails() {
    if (selectedGraphEdge) {
      return (
        <>
          <div className="intent-details-head">
            <div>
              <span className="label-text">Connection</span>
              <h2>Selected edge</h2>
            </div>
          </div>
          <p className="intent-details-copy">
            {selectedGraphEdge.fromNode.title}.{selectedGraphEdge.edge.fromPort} → {selectedGraphEdge.toNode.title}.
            {selectedGraphEdge.edge.toPort}
          </p>
          <div className="intent-details-section">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => deleteGraphEdge(selectedGraphEdge.edge.id)}
            >
              Delete connection
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setSelectedEdgeId(null)}
            >
              Deselect
            </button>
          </div>
        </>
      );
    }
    if (!selectedGraphNode) return <p className="dashboard-empty">Select a node to edit details.</p>;
    const definition = graphNodeDefinitions[selectedGraphNode.type];
    return (
      <>
        <div className="intent-details-head">
          <div>
            <span className="label-text">Details</span>
            <h2>{selectedGraphNode.title}</h2>
          </div>
          <span className={`intent-node-state is-${getNodeStatusLabel(selectedGraphNode, getGraphNodeReady(selectedGraphNode.type))}`}>
            {getNodeStatusLabel(selectedGraphNode, getGraphNodeReady(selectedGraphNode.type))}
          </span>
        </div>
        <p className="intent-details-copy">{definition.description}</p>
        {selectedGraphNode.type === "prompt" ? (
          <div className="intent-details-section">
            <div className="dashboard-assigned-task-compact">
              <span className="label-text">Prompt · read only</span>
              <strong>{assignedTask.title}</strong>
              <p>{assignedTask.brief}</p>
            </div>
            <em className="intent-details-helper">
              Retrieval, Skeleton, and first generation use this assigned task brief.
            </em>
          </div>
        ) : null}
        {selectedGraphNode.type === "referenceSearch" ? (
          <div className="intent-details-section">
            <div className="dashboard-pocket-summary">
              {(["layout", "style"] as const).map((role) => {
                const count = board.filter((item) => referenceUsage[item.id]?.[role]).length;
                return (
                  <button
                    key={role}
                    type="button"
                    className="dashboard-pocket-summary-card"
                    onClick={() => {
                      setPocketRole(role);
                      setPocketTagFilter("all");
                      setPocketManagerOpen(true);
                    }}
                  >
                    <span>{role[0].toUpperCase() + role.slice(1)}</span>
                    <strong>{count}</strong>
                  </button>
                );
              })}
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setActiveStage("content")}>
              Open Reference Search
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPocketManagerOpen(true)}>
              Manage pocket
            </button>
          </div>
        ) : null}
        {selectedGraphNode.type === "layoutReference" ? (
          <div className="intent-details-section">
            {layoutReference?.thumbnailUrl ? <img className="intent-details-preview" src={layoutReference.thumbnailUrl} alt="" /> : null}
            <p className="intent-details-copy">{layoutReference?.title ?? "No layout reference selected."}</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={openLayoutReferenceStage}>
              Open Layout
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setPocketRole("layout");
                setPocketTagFilter("all");
                setPocketManagerOpen(true);
              }}
            >
              Manage layout pocket
            </button>
          </div>
        ) : null}
        {selectedGraphNode.type === "styleReference" ? (
          <div className="intent-details-section">
            {styleReference?.thumbnailUrl ? <img className="intent-details-preview" src={styleReference.thumbnailUrl} alt="" /> : null}
            <p className="intent-details-copy">{styleReference?.title ?? "No style reference selected."}</p>
            <div className="intent-requirements">
              <span className={styleReference ? "is-ok" : ""}>Style reference</span>
              <span className={styleMarks.length > 0 ? "is-ok" : ""}>{styleMarks.length} marks</span>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setActiveStage("style")}>
              Open Style
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setPocketRole("style");
                setPocketTagFilter("all");
                setPocketManagerOpen(true);
              }}
            >
              Manage style pocket
            </button>
          </div>
        ) : null}
        {selectedGraphNode.type === "iconReference" ? (
          <div className="intent-details-section">
            <div className="intent-details-icon-stack">
              {iconReferences.slice(0, 8).map((asset) => (
                <img
                  key={asset.id}
                  className="intent-details-preview intent-details-icon-preview"
                  src={scientificIconDataUrl(asset.id)}
                  alt=""
                />
              ))}
            </div>
            <p className="intent-details-copy">
              {iconReferences.length === 1
                ? iconReference.description
                : `${iconReferences.length} icon references selected: ${iconReferences
                    .map((asset) => asset.label)
                    .join(", ")}.`}
            </p>
            <div className="icon-reference-grid">
              {scientificIconReferences.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  className={selectedIconReferenceIds.includes(asset.id) ? "is-selected" : ""}
                  onClick={() => toggleIconReference(asset)}
                >
                  <img src={scientificIconDataUrl(asset.id)} alt="" />
                  <span>{asset.label}</span>
                </button>
              ))}
            </div>
            <div className="intent-requirements">
              <span className="is-ok">Project-authored</span>
              <span className={hasGraphInput("figureGenerator", "iconReference") ? "is-ok" : ""}>
                Connected to generation
              </span>
            </div>
            <Link href="/assets" className="btn btn-primary btn-sm">
              Open Asset Library
            </Link>
          </div>
        ) : null}
        {selectedGraphNode.type === "fontReference" ? (
          <div className="intent-details-section">
            {fontReference ? (
              <>
                <div className="font-reference-preview" style={{ fontFamily: fontReference.cssFamily }}>
                  <strong>Dynamic Multimodal Retrieval</strong>
                  <span>Input → Planner → Evidence → Answer</span>
                </div>
                <p className="intent-details-copy">{fontReference.description}</p>
              </>
            ) : (
              <p className="intent-details-copy">No font is selected; generation will follow the Style reference.</p>
            )}
            <div className="font-reference-grid">
              {figureFontReferences.map((font) => (
                <button
                  key={font.id}
                  type="button"
                  className={font.id === fontReference?.id ? "is-selected" : ""}
                  style={{ fontFamily: font.cssFamily }}
                  onClick={() =>
                    setState((current) => ({
                      ...current,
                      fontReferenceId: font.id,
                      status: `${font.label} selected as font reference.`,
                    }))
                  }
                >
                  <strong>Aa</strong>
                  <span>{font.label}</span>
                </button>
              ))}
            </div>
            <div className="intent-requirements">
              <span className="is-ok">OFL fonts</span>
              <span className={hasGraphInput("figureGenerator", "fontReference") ? "is-ok" : ""}>
                Connected to generation
              </span>
            </div>
            <Link href="/assets" className="btn btn-primary btn-sm">
              Open Asset Library
            </Link>
          </div>
        ) : null}
        {selectedGraphNode.type === "skeletonGenerator" ? (
          <div className="intent-details-section">
            <div className="intent-requirements">
              <span className={hasGraphInput("skeletonGenerator", "prompt") && effectiveGenerationBrief ? "is-ok" : ""}>Prompt</span>
              <span className={hasGraphInput("skeletonGenerator", "layoutReference") && layoutReference ? "is-ok" : ""}>Layout</span>
              <span className={selectedSkeleton ? "is-ok" : ""}>Skeleton</span>
            </div>
            {previewSkeletonPlan ? (
              <LayoutPngPreview plan={previewSkeletonPlan} compact customIconReferences={customIconReferences} />
            ) : selectedSkeleton?.mermaid ? (
              <MermaidDiagramPreview source={selectedSkeleton.mermaid} compact />
            ) : (
              <p className="dashboard-empty">No skeleton generated yet.</p>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void handleGenerateSkeletonFromMain()}
              disabled={generatingSkeleton || !layoutReference || effectiveGenerationBrief.length === 0}
            >
              {generatingSkeleton ? "Generating skeleton..." : "Generate skeleton"}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleCreateBlankSkeleton}>
              Start blank draw.io
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setSkeletonManagerOpen(true)}>
              Open Skeleton Manager
            </button>
          </div>
        ) : null}
        {selectedGraphNode.type === "figureGenerator" ? (
          <div className="intent-details-section">
            <div className="intent-requirements">
              <span className={hasGraphInput("figureGenerator", "prompt") && effectiveGenerationBrief ? "is-ok" : ""}>Prompt</span>
              <span className={hasGraphInput("figureGenerator", "skeleton") && selectedSkeleton ? "is-ok" : ""}>Skeleton</span>
              <span className={hasGraphInput("figureGenerator", "styleReference") && styleReference ? "is-ok" : ""}>Style</span>
              <span className={hasGraphInput("figureGenerator", "iconReference") ? "is-ok" : ""}>Icon</span>
              <span className={hasGraphInput("figureGenerator", "fontReference") ? "is-ok" : ""}>Font</span>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void handleRunGraph()}
              disabled={generating || generatingSkeleton}
            >
              {generating || generatingSkeleton ? "Running..." : "Run Graph"}
            </button>
          </div>
        ) : null}
        {selectedGraphNode.type === "output" ? (
          <div className="intent-details-section">
            {visibleOutputVariants.length === 0 ? (
              <p className="dashboard-empty">No active canvas outputs.</p>
            ) : (
              <div className="dashboard-output-grid">
                {visibleOutputVariants.slice(0, 6).map((variant) => {
                  const src = variant.previewImageDataUrl ?? variant.previewImageUrl ?? null;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      className={`dashboard-output-card ${selectedVariant?.id === variant.id ? "is-selected" : ""}`}
                      onClick={() => selectCandidatePreview(variant.id)}
                    >
                      {src ? <img src={src} alt={variant.title} /> : null}
                      <strong>{variant.title}</strong>
                      <span>{variant.layoutStrategy}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
              if (selectedVariant?.id) openVariantInEdit(selectedVariant.id);
            }}>
              Edit selected figure
            </button>
          </div>
        ) : null}
        <div className="intent-details-section">
          <span className="label-text">Connections</span>
          <div className="intent-edge-list">
            {graphEdges.length === 0 ? (
              <p className="dashboard-empty">No connections yet.</p>
            ) : (
              graphEdges.map(({ edge, fromNode, toNode }) => (
                <button key={edge.id} type="button" onClick={() => deleteGraphEdge(edge.id)}>
                  <span>{fromNode.title}.{edge.fromPort}</span>
                  <strong>→</strong>
                  <span>{toNode.title}.{edge.toPort}</span>
                </button>
              ))
            )}
          </div>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => deleteGraphNode(selectedGraphNode.id)}>
          Delete node
        </button>
      </>
    );
  }

  const pocketManagerContent = (
    <>
      <div className="dashboard-pocket-tabs" aria-label="Pocket type">
        {(["layout", "style"] as const).map((role) => {
          const count = board.filter((item) => referenceUsage[item.id]?.[role]).length;
          return (
            <button
              key={role}
              type="button"
              className={`dashboard-pocket-tab ${pocketRole === role ? "is-active" : ""}`}
              onClick={() => {
                setPocketRole(role);
                setPocketTagFilter("all");
              }}
            >
              <span>{role[0].toUpperCase() + role.slice(1)}</span>
              <strong>{count}</strong>
            </button>
          );
        })}
      </div>
      {pocketTags.length > 0 ? (
        <div className="dashboard-pocket-filters" aria-label="Pocket tag filters">
          <button
            type="button"
            className={`dashboard-pocket-filter ${pocketTagFilter === "all" ? "is-active" : ""}`}
            onClick={() => setPocketTagFilter("all")}
          >
            All
          </button>
          {pocketTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`dashboard-pocket-filter ${pocketTagFilter === tag ? "is-active" : ""}`}
              onClick={() => setPocketTagFilter(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}
      {pocketItems.length === 0 ? (
        <p className="dashboard-empty">No {pocketRole} references in pocket yet.</p>
      ) : filteredPocketItems.length === 0 ? (
        <p className="dashboard-empty">No {pocketRole} references match this tag.</p>
      ) : (
        <div className="dashboard-pocket-browser">
          {activePocketPreview ? (
            <div className="dashboard-pocket-preview">
              <div className="dashboard-pocket-preview-image">
                {activePocketPreview.thumbnailUrl ? <img src={activePocketPreview.thumbnailUrl} alt="" /> : null}
              </div>
              <div className="dashboard-pocket-preview-meta">
                <h3>{activePocketPreview.title}</h3>
                <div className="dashboard-pocket-preview-tags">
                  {getPocketFilterTags(activePocketPreview).slice(0, 6).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          <div className="dashboard-pocket-list">
            {filteredPocketItems.map((item) => {
              const selected = activePocketPreview?.id === item.id;
              return (
                <div key={item.id} className={`dashboard-pocket-item ${selected ? "is-previewing" : ""}`}>
                  <button
                    type="button"
                    className="dashboard-pocket-thumb"
                    onClick={() => setPocketPreviewReference(item)}
                    title={item.title}
                  >
                    {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" /> : null}
                  </button>
                  <div className="dashboard-pocket-item-body">
                    <button
                      type="button"
                      className="dashboard-pocket-title"
                      onClick={() => setPocketPreviewReference(item)}
                      title={item.title}
                    >
                      {item.title}
                    </button>
                    <div className="dashboard-pocket-tags">
                      <span>{item.imageType}</span>
                      {item.styleTags.slice(0, 2).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="dashboard-pocket-remove"
                    onClick={() => removeFromDashboardPocket(item, pocketRole)}
                    aria-label={`Remove ${item.title} from ${pocketRole} pocket`}
                    title={`Remove from ${pocketRole} pocket`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
  const selectionConfirmDraft = selectionConfirmOpen
    ? buildCanvasGenerationDraft(selectionConfirmExcludedIdSet)
    : null;
  const firstGenerationBundle = buildFirstGenerationBundle();
  const confirmSkeletonDecision = state.guidedDialogue.decisions.skeleton ?? null;
  const confirmSkeletonFingerprint = createNarratorArtifactFingerprint({
    prompt: createPromptFingerprint(prompt),
    layoutReferenceId: selectedSkeleton?.referenceId ?? layoutReferenceId,
    skeletonId: selectedSkeleton?.id ?? null,
    skeletonXml: selectedSkeleton?.xml ?? null,
  });
  const confirmSkeletonDecisionStale = Boolean(
    confirmSkeletonDecision && (
      confirmSkeletonDecision.status === "stale" ||
      confirmSkeletonDecision.artifactFingerprint !== confirmSkeletonFingerprint
    ),
  );
  const confirmStyleDecision = state.guidedDialogue.decisions.style ?? null;
  const confirmStyleFingerprint = createNarratorArtifactFingerprint({
    styleReferenceId: styleReference?.id ?? null,
    styleKitFingerprint: activeStyleKit.fingerprint,
  });
  const confirmStyleDecisionStale = Boolean(
    confirmStyleDecision && (
      confirmStyleDecision.status === "stale" ||
      confirmStyleDecision.artifactFingerprint !== confirmStyleFingerprint
    ),
  );
  const railPromptPreview = (firstGenerationBundle?.manifest.workingPrompt ?? effectiveGenerationBrief).trim();
  const railLayoutTitle = layoutReference?.title
    ?? firstGenerationBundle?.draft.skeletonCandidate?.referenceTitle
    ?? "No layout selected";
  const railSkeletonTitle = firstGenerationBundle?.draft.skeletonCandidate?.title
    ?? firstGenerationSkeleton?.title
    ?? "No skeleton selected";
  // One plan drives both the thumbnail and the node count, so the picture can
  // never disagree with the caption underneath it.
  const railSkeletonSourcePlan = firstGenerationBundle?.draft.skeletonPlan ?? firstGenerationPlan ?? null;
  const railSkeletonPlan = railSkeletonSourcePlan ? normalizeConfirmPlan(railSkeletonSourcePlan, 28) : null;
  const railSkeletonMermaid = firstGenerationBundle?.draft.skeletonCandidate?.mermaid
    ?? firstGenerationSkeleton?.mermaid
    ?? null;
  const railSkeletonNodeCount = railSkeletonPlan?.nodes.length ?? 0;
  const railStyleReference = firstGenerationBundle?.draft.selectedStyleReference ?? styleReference ?? null;
  const railStyleTitle = railStyleReference?.title ?? "No style selected";
  const railIconBindings = firstGenerationBundle?.manifest.nodeIconBindings
    ?? resolvedFirstGenerationBindings;
  const railIconCount = railIconBindings.length;
  const railNodeLabels = new Map((railSkeletonPlan?.nodes ?? []).map((node) => [node.id, node.label] as const));
  const railFont = fontReference;
  const railPalette = state.matchedStylePalette ?? (paletteReference
    ? { kind: "preset" as const, id: paletteReference.id, colors: paletteReference.colors }
    : null);
  const railMatchSummary = [
    railIconCount ? `${railIconCount} icons` : null,
    railFont?.label ?? null,
    railPalette?.colors.length ? `${railPalette.colors.length} colors` : null,
  ].filter(Boolean).join(" · ") || "Optional · nothing matched";
  const railPromptMissing = generationReadiness.missing.includes("prompt");
  const railSkeletonMissing = generationReadiness.missing.includes("skeleton");
  const railStyleMissing = generationReadiness.missing.includes("style");

  const railRowClass = (missing: boolean, changed: boolean) => [
    dashboardSheetStyles.railRow,
    missing ? dashboardSheetStyles.railRowMissing : "",
    changed ? dashboardSheetStyles.railRowChanged : "",
  ].filter(Boolean).join(" ");
  const railChangedTag = <span className={dashboardSheetStyles.railChangedTag}>Changed</span>;
  const candidateOutputRuns = variants.filter((variant) => !variant.deletedAt);
  const candidateRuns = candidateOutputRuns.filter((variant) => !variant.sourceVariantId);
  // The Edit dialog can be closed while its revision is still generating, so
  // the Candidate page carries the wait instead.
  const selectedOutputRun = candidateOutputRuns.find((variant) => variant.id === candidateDisplayVariantId) ?? null;
  const shownCandidateId = selectedOutputRun?.sourceVariantId ?? selectedOutputRun?.id ?? null;
  const shownCandidate =
    candidateRuns.find((variant) => variant.id === shownCandidateId) ?? candidateRuns[0] ?? null;
  const pendingRevisionJob = pendingModifyJobList[0] ?? null;
  const pendingRevision = pendingRevisionJob
    ? {
        title: pendingRevisionJob.sourceTitle,
        isSelected: pendingRevisionJob.sourceVariantId === selectedOutputRun?.id,
      }
    : null;
  const pendingCandidateRunCount = (generating ? 1 : 0) + pendingModifyJobList.length;
  const candidateSelectionRail = (
    <aside className={dashboardSheetStyles.selectionRail} aria-label="Generation inputs">
      <header className={dashboardSheetStyles.railHeader}>
        <span className="label-text">Inputs</span>
        <strong>Selection</strong>
      </header>
      {/* Clicking a row enlarges it for reading; only "Change" leaves the page. */}
      <div className={dashboardSheetStyles.railRows}>
        <div className={railRowClass(railPromptMissing, candidateChangedSteps.prompt)}>
          <div
            role="button"
            tabIndex={0}
            className={dashboardSheetStyles.railPeek}
            onClick={() => setRailZoom({
              caption: "Prompt",
              note: railPromptMissing ? "Missing · required" : "Working revision",
              body: (
                <p className={dashboardSheetStyles.railZoomText}>
                  {railPromptPreview || "No prompt written yet."}
                </p>
              ),
            })}
          >
            <span
              className={`${dashboardSheetStyles.railThumb} ${railPromptMissing ? "" : dashboardSheetStyles.railThumbText}`}
              aria-hidden="true"
            >
              {railPromptMissing ? "P" : railPromptPreview.slice(0, 180) || "Working revision"}
            </span>
            <span className={dashboardSheetStyles.railCopy}>
              <strong>Prompt{candidateChangedSteps.prompt ? railChangedTag : null}</strong>
              <small>{railPromptMissing ? "Missing · required" : "Working revision"}</small>
            </span>
          </div>
          <button
            type="button"
            className={dashboardSheetStyles.railAction}
            onClick={() => openIdeaSparkStep("prompt")}
          >
            {railPromptMissing ? "Open →" : "Change →"}
          </button>
        </div>
        <div className={dashboardSheetStyles.railRow}>
          <div
            role="button"
            tabIndex={0}
            className={dashboardSheetStyles.railPeek}
            onClick={() => setRailZoom({
              caption: "Layout",
              note: railLayoutTitle,
              body: layoutReference?.imageDataUrl || layoutReference?.thumbnailUrl ? (
                <img src={layoutReference.imageDataUrl || layoutReference.thumbnailUrl || undefined} alt={railLayoutTitle} />
              ) : (
                <p className={dashboardSheetStyles.railZoomText}>No layout reference selected.</p>
              ),
            })}
          >
            <span className={dashboardSheetStyles.railThumb} aria-hidden="true">
              {layoutReference?.thumbnailUrl ? <img src={layoutReference.thumbnailUrl} alt="" /> : "L"}
            </span>
            <span className={dashboardSheetStyles.railCopy}>
              <strong>Layout</strong>
              <small>{railLayoutTitle}</small>
            </span>
          </div>
          <button
            type="button"
            className={dashboardSheetStyles.railAction}
            onClick={() => openIdeaSparkStep("layout")}
          >
            Change →
          </button>
        </div>
        <div className={railRowClass(railSkeletonMissing, candidateChangedSteps.skeleton)}>
          <div
            role="button"
            tabIndex={0}
            className={dashboardSheetStyles.railPeek}
            onClick={() => setRailZoom({
              caption: "Skeleton",
              note: railSkeletonMissing
                ? "Missing · required"
                : `${railSkeletonTitle} · ${railSkeletonNodeCount} nodes`,
              body: railSkeletonPlan ? (
                <LayoutPngPreview plan={railSkeletonPlan} customIconReferences={customIconReferences} />
              ) : railSkeletonMermaid ? (
                <MermaidDiagramPreview source={railSkeletonMermaid} />
              ) : (
                <p className={dashboardSheetStyles.railZoomText}>No skeleton selected.</p>
              ),
            })}
          >
            <span
              className={`${dashboardSheetStyles.railThumb} ${
                railSkeletonPlan || railSkeletonMermaid
                  ? dashboardSheetStyles.railThumbPlan
                  : dashboardSheetStyles.railThumbGlyph
              }`}
              aria-hidden="true"
            >
              {railSkeletonPlan ? (
                <LayoutPngPreview plan={railSkeletonPlan} compact customIconReferences={customIconReferences} />
              ) : railSkeletonMermaid ? (
                <MermaidDiagramPreview source={railSkeletonMermaid} compact />
              ) : (
                <svg viewBox="0 0 40 30" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <rect x="1" y="1" width="12" height="8" rx="1.5" />
                  <rect x="27" y="1" width="12" height="8" rx="1.5" />
                  <rect x="14" y="21" width="12" height="8" rx="1.5" />
                  <path d="M7 9v6h13m13-6v6H20m0 0v6" />
                </svg>
              )}
            </span>
            <span className={dashboardSheetStyles.railCopy}>
              <strong>Skeleton{candidateChangedSteps.skeleton ? railChangedTag : null}</strong>
              <small>{railSkeletonMissing ? "Missing · required" : `${railSkeletonTitle} · ${railSkeletonNodeCount} nodes`}</small>
            </span>
          </div>
          <button
            type="button"
            className={dashboardSheetStyles.railAction}
            onClick={() => openIdeaSparkStep("skeleton")}
          >
            {railSkeletonMissing ? "Open →" : "Change →"}
          </button>
        </div>
        <div className={railRowClass(railStyleMissing, candidateChangedSteps.style)}>
          <div
            role="button"
            tabIndex={0}
            className={dashboardSheetStyles.railPeek}
            onClick={() => setRailZoom({
              caption: "Style",
              note: railStyleMissing ? "Missing · required" : railStyleTitle,
              body: railStyleReference?.imageDataUrl || railStyleReference?.thumbnailUrl ? (
                <img src={railStyleReference.imageDataUrl || railStyleReference.thumbnailUrl || undefined} alt={railStyleTitle} />
              ) : (
                <p className={dashboardSheetStyles.railZoomText}>No style reference selected.</p>
              ),
            })}
          >
            <span className={dashboardSheetStyles.railThumb} aria-hidden="true">
              {railStyleReference?.thumbnailUrl ? <img src={railStyleReference.thumbnailUrl} alt="" /> : "St"}
            </span>
            <span className={dashboardSheetStyles.railCopy}>
              <strong>Style{candidateChangedSteps.style ? railChangedTag : null}</strong>
              <small>{railStyleMissing ? "Missing · required" : railStyleTitle}</small>
            </span>
          </div>
          <button
            type="button"
            className={dashboardSheetStyles.railAction}
            onClick={() => openIdeaSparkStep("style")}
          >
            {railStyleMissing ? "Open →" : "Change →"}
          </button>
        </div>
        <div className={railRowClass(false, candidateChangedSteps.icons)}>
          <div
            role="button"
            tabIndex={0}
            className={dashboardSheetStyles.railPeek}
            onClick={() => setRailZoom({
              caption: "Match",
              note: railMatchSummary,
              body: (
                <div className={dashboardSheetStyles.railZoomMatch}>
                  <section>
                    <span className="label-text">Node–Icon</span>
                    {railIconCount ? (
                      <ul className={dashboardSheetStyles.railZoomIcons}>
                        {railIconBindings.map((binding) => {
                          const iconSrc = workspaceIconDataUrl(binding.iconId, customIconReferences);
                          return (
                            <li key={`${binding.targetNodeId}-${binding.iconId}`}>
                              {iconSrc ? <img src={iconSrc} alt="" /> : <i>?</i>}
                              <span>{railNodeLabels.get(binding.targetNodeId) ?? binding.targetNodeId}</span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className={dashboardSheetStyles.railZoomText}>No icon bound to a node yet.</p>
                    )}
                  </section>
                  <section>
                    <span className="label-text">Figure font · optional</span>
                    {railFont ? (
                      <ul className={dashboardSheetStyles.railZoomFonts}>
                        <li>
                          <strong style={{ fontFamily: railFont.cssFamily }}>Aa</strong>
                          <span>{railFont.label}</span>
                        </li>
                      </ul>
                    ) : (
                      <p className={dashboardSheetStyles.railZoomText}>No font confirmed in Match.</p>
                    )}
                  </section>
                  <section>
                    <span className="label-text">Figure colors · optional</span>
                    {railPalette?.colors.length ? (
                      <ul className={dashboardSheetStyles.railZoomPalettes}>
                        <li>
                          <span className={dashboardSheetStyles.railZoomSwatches}>
                            {railPalette.colors.map((color) => (
                              <i key={color} style={{ backgroundColor: color }} />
                            ))}
                          </span>
                          <span>{railPalette.colors.length} colors</span>
                        </li>
                      </ul>
                    ) : (
                      <p className={dashboardSheetStyles.railZoomText}>No colors confirmed in Match.</p>
                    )}
                  </section>
                </div>
              ),
            })}
          >
            <span className={dashboardSheetStyles.railThumbMatch} aria-hidden="true">
              <span className={dashboardSheetStyles.railThumbMatchIcons}>
                {railIconBindings.slice(0, 5).map((binding) => {
                  const iconSrc = workspaceIconDataUrl(binding.iconId, customIconReferences);
                  return iconSrc ? (
                    <img key={`${binding.targetNodeId}-${binding.iconId}`} src={iconSrc} alt="" />
                  ) : (
                    <i key={`${binding.targetNodeId}-${binding.iconId}`}>?</i>
                  );
                })}
                {railIconCount > 5 ? <b>+{railIconCount - 5}</b> : null}
              </span>
            </span>
            <span className={dashboardSheetStyles.railCopy}>
              <strong>Match{candidateChangedSteps.icons ? railChangedTag : null}</strong>
              <small>{railMatchSummary}</small>
            </span>
          </div>
          <button
            type="button"
            className={dashboardSheetStyles.railAction}
            onClick={() => openIdeaSparkStep("icons")}
          >
            Change →
          </button>
        </div>
      </div>
    </aside>
  );

  function deleteCandidateRun(variant: FigureVariant) {
    const derived = new Set<string>();
    const pending = [variant.id];
    while (pending.length) {
      const current = pending.pop()!;
      for (const item of variants) {
        if (item.sourceVariantId !== current || derived.has(item.id)) continue;
        derived.add(item.id);
        pending.push(item.id);
      }
    }
    if (
      !window.confirm(
        derived.size
          ? `Delete "${variant.title}"? Its ${derived.size} edit${derived.size === 1 ? "" : "s"} are removed with it.`
          : `Delete "${variant.title}"? This run is removed from the workspace and History.`,
      )
    ) return;
    setState((current) => appendStudyEvent(
      removeVariantFromWorkspaceState(current, variant.id, `Deleted ${variant.title}.`),
      {
        stage: "compose",
        type: "candidate_deleted",
        targetIds: [variant.id, ...derived],
        result: "removed",
        metadata: { derivedEditCount: derived.size },
      },
    ));
  }

  const candidateRunsRail = (
    <aside className={dashboardSheetStyles.runsRail} aria-label="Generated Candidates">
      <header className={dashboardSheetStyles.runsHead}>
        <strong>
          Runs
          {pendingCandidateRunCount > 0 ? <span className="ui-spinner" aria-hidden="true" /> : null}
        </strong>
        <span>
          {candidateOutputRuns.length}
          {pendingCandidateRunCount > 0 ? ` + ${pendingCandidateRunCount} running` : ""}
        </span>
      </header>
      <div className={dashboardSheetStyles.runsList}>
        {generating ? (
          <article className={dashboardSheetStyles.runPending} role="status" aria-label="Candidate generation running">
            <div className={dashboardSheetStyles.runPendingPreview}>
              {variantGenerationProgress?.previewImageDataUrl || variantGenerationProgress?.previewImageUrl ? (
                <>
                  <img
                    key={`generation-progress-${variantGenerationProgress.version}`}
                    src={variantGenerationProgress.previewImageDataUrl ?? variantGenerationProgress.previewImageUrl ?? ""}
                    alt=""
                  />
                  {variantGenerationProgress.phase === "refining" ? (
                    <span className={dashboardSheetStyles.runPendingBadge}>Refining</span>
                  ) : null}
                </>
              ) : <span className="ui-spinner" aria-hidden="true" />}
            </div>
            <small title={variantGenerationProgress?.label}>{variantGenerationProgress?.label ?? "Generating Candidate…"}</small>
          </article>
        ) : null}
        {pendingModifyJobList.map((job) => (
          <article
            key={job.jobId}
            className={dashboardSheetStyles.runPending}
            role="status"
            aria-label={`Edit revision for ${job.sourceTitle} is running`}
          >
            <div className={dashboardSheetStyles.runPendingPreview}>
              <span className="ui-spinner" aria-hidden="true" />
            </div>
            <small title={job.sourceTitle}>Applying Edit · {job.sourceTitle}</small>
          </article>
        ))}
        {candidateOutputRuns.map((variant) => {
          const active = variant.id === candidateDisplayVariantId;
          const preview = variant.previewImageDataUrl ?? variant.previewImageUrl ?? svgPreviewDataUrl(variant.svg);
          const candidateIndex = candidateRuns.findIndex((candidate) => candidate.id === variant.id);
          return (
            <article
              key={variant.id}
              className={`${dashboardSheetStyles.runCard} ${active ? dashboardSheetStyles.runActive : ""}`}
            >
              <button
                type="button"
                className={dashboardSheetStyles.runSelect}
                aria-pressed={active}
                title={variant.title}
                onClick={() => selectCandidatePreview(variant.id)}
              >
                {preview ? <img src={preview} alt="" /> : <i aria-hidden="true">No preview</i>}
              </button>
              <div className={dashboardSheetStyles.runTools}>
                {!variant.sourceVariantId ? (
                  <button
                    type="button"
                    className={dashboardSheetStyles.runDelete}
                    onClick={() => deleteCandidateRun(variant)}
                    title={`Delete ${variant.title}`}
                    aria-label={`Delete ${variant.title}`}
                  >
                    ×
                  </button>
                ) : null}
                <button
                  type="button"
                  className={dashboardSheetStyles.runEdit}
                  onClick={() => openVariantInEdit(variant.id)}
                >
                  Edit
                </button>
              </div>
              <span className={dashboardSheetStyles.runIndex}>
                {variant.sourceVariantId
                  ? "Edit result"
                  : candidateIndex === 0
                    ? "Latest Candidate"
                    : `Candidate ${candidateRuns.length - candidateIndex}`}
              </span>
            </article>
          );
        })}
      </div>
    </aside>
  );

  const selectionConfirmCanvas = buildConfirmCanvasPlacements(selectionConfirmDraft, selectionConfirmCanvasWidth);
  const selectionConfirmSkeletonSvg = useMemo(() => {
    if (!selectionConfirmCanvas.plan) return null;
    const skeletonXml =
      selectionConfirmDraft?.skeletonCandidate?.xml ??
      (selectionConfirmCanvas.plan ? diagramPlanToDrawioXml(selectionConfirmCanvas.plan) : null);
    return drawioXmlToConfirmSvg(
      skeletonXml,
      selectionConfirmCanvas.plan,
      selectionConfirmCanvas.width,
      selectionConfirmCanvas.height,
    );
  }, [
    selectionConfirmDraft?.skeletonCandidate?.xml,
    selectionConfirmCanvas.height,
    selectionConfirmCanvas.plan,
    selectionConfirmCanvas.width,
  ]);
  const selectionConfirmPlacementById = new Map(
    selectionConfirmCanvas.placements.map((placement) => [placement.selection.id, placement] as const),
  );
  const selectionConfirmNodeById = new Map(
    selectionConfirmCanvas.plan?.nodes.map((node) => [node.id, node] as const) ?? [],
  );
  const selectionConfirmBindings = buildSelectionConfirmBindings(selectionConfirmDraft);
  const selectionConfirmLayout = selectionConfirmLayoutReference(selectionConfirmDraft);
  const selectionConfirmStyleOptions = Array.from(
    new Map(
      (selectionConfirmDraft?.items ?? [])
        .filter((item) => item.type === "reference" && item.role === "style" && item.referenceId)
        .map((item) => {
          const reference = board.find((entry) => entry.id === item.referenceId);
          return reference ? [reference.id, { item, reference }] as const : null;
        })
        .filter((entry): entry is readonly [string, { item: CreativeCanvasItem; reference: ReferenceItem }] => Boolean(entry)),
    ).values(),
  );
  const selectionConfirmStyleOptionIds = new Set(selectionConfirmStyleOptions.map(({ reference }) => reference.id));
  const activeSelectionConfirmStyle =
    (selectionConfirmDraft?.selectedStyleReference ?? null) ||
    (selectionConfirmStyleReferenceId && selectionConfirmStyleOptionIds.has(selectionConfirmStyleReferenceId)
      ? board.find((entry) => entry.id === selectionConfirmStyleReferenceId) ?? null
      : null);
  const selectionConfirmBaseVariant =
    selectionConfirmDraft?.baseOutputItem?.variantId
      ? variants.find((variant) => variant.id === selectionConfirmDraft.baseOutputItem?.variantId) ?? null
      : null;
  const selectionConfirmBaseImageUrl =
    selectionConfirmBaseVariant && selectionConfirmDraft?.baseOutputItem
      ? variantPreviewSrc(selectionConfirmBaseVariant, selectionConfirmDraft.baseOutputItem.outputStage ?? "final")
      : null;
  const selectionConfirmMode: SelectionConfirmMode =
    selectionConfirmBaseImageUrl
      ? "generated-image"
      : selectionConfirmCanvas.plan
        ? "skeleton-binding"
        : "reference-board";
  const selectionConfirmPaletteFontSelections = selectionConfirmCanvas.selections.filter(
    (selection) =>
      selection.item.type === "asset" &&
      (selection.item.assetKind === "palette" || selection.item.assetKind === "font"),
  );
  const selectionConfirmAnnotationSnapshot =
    selectionConfirmAnnotationSnapshotsByCanvasId[activeCanvasConfirmKey] ?? null;
  const selectionConfirmAnnotationResetVersion =
    selectionConfirmAnnotationResetByCanvasId[activeCanvasConfirmKey] ?? 0;
  const selectionConfirmModal =
    selectionConfirmOpen && portalReady
      ? createPortal(
          <div
            className="selection-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm generation selection"
            onClick={() => setSelectionConfirmOpen(false)}
          >
            <div className="selection-confirm-panel" onClick={(event) => event.stopPropagation()}>
              <div className="dashboard-workflow-modal-head">
                <div>
                  <span className="label-text">Generate selection</span>
                  <h2 className="h-section">Advanced Confirm Canvas</h2>
                </div>
                <div className="selection-confirm-head-actions">
                  <span className="selection-confirm-tool-hint">
                    {selectionConfirmMode === "generated-image"
                      ? "Mask the areas to revise. Selected references stay in the side panel as guidance."
                      : selectionConfirmMode === "reference-board"
                        ? "Arrange selected references and add notes. The board is sent as guidance only."
                        : "Drag cards near labels, draw arrows, or add notes. The control board is sent as guidance only."}
                  </span>
                  <span className="creative-compose-count">{selectionConfirmDraft?.items.length ?? 0} selected</span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelectionConfirmOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={generating || !selectionConfirmDraft || selectionConfirmPrompt.trim().length === 0}
                    onClick={() => {
                      if (!selectionConfirmDraft) return;
                      void executeCanvasGenerationDraft(selectionConfirmDraft, selectionConfirmPrompt.trim());
                    }}
                  >
                    {generating ? <><span className="ui-spinner" aria-hidden="true" />Generating…</> : "Generate"}
                  </button>
                </div>
              </div>

              <div className="selection-confirm-body">
                <div className="selection-confirm-main">
                  <section ref={selectionConfirmCanvasShellRef} className="selection-confirm-canvas-shell">
                    {selectionConfirmMode === "generated-image" && selectionConfirmBaseImageUrl ? (
                      <div className="selection-confirm-generated-canvas">
                        <AnnotationCanvas
                          ref={selectionConfirmAnnotationRef}
                          imageUrl={selectionConfirmBaseImageUrl}
                          variantId={`${activeCanvasConfirmKey}-${selectionConfirmBaseVariant?.id ?? "output"}-${selectionConfirmAnnotationResetVersion}`}
                          snapshot={selectionConfirmAnnotationSnapshot}
                          onSnapshotChange={(snapshot) =>
                            setSelectionConfirmAnnotationSnapshotsByCanvasId((current) => ({
                              ...current,
                              [activeCanvasConfirmKey]: snapshot,
                            }))
                          }
                          onMarkupChange={(hasMarkup) =>
                            setSelectionConfirmAnnotationMarkupByCanvasId((current) => ({
                              ...current,
                              [activeCanvasConfirmKey]: hasMarkup,
                            }))
                          }
                        />
                      </div>
                    ) : selectionConfirmMode === "skeleton-binding" && selectionConfirmCanvas.plan ? (
                      <>
                        <div className="selection-confirm-toolbar">
                          {(["move", "arrow", "note"] as const).map((tool) => (
                            <button
                              key={tool}
                              type="button"
                              className={`btn btn-secondary btn-sm ${selectionConfirmTool === tool ? "is-active" : ""}`}
                              onClick={() => {
                                setSelectionConfirmTool(tool);
                                if (tool !== "arrow") setSelectionConfirmPendingArrowItemId(null);
                              }}
                            >
                              {tool === "move" ? "Move" : tool === "arrow" ? "Arrow" : "Note"}
                            </button>
                          ))}
                          {selectionConfirmPendingArrowItemId ? (
                            <span className="selection-confirm-tool-status">Click a skeleton node to finish the arrow.</span>
                          ) : selectionConfirmTool === "arrow" ? (
                            <span className="selection-confirm-tool-status">Click a reference card, then click a skeleton node.</span>
                          ) : selectionConfirmTool === "note" ? (
                            <span className="selection-confirm-tool-status">Click blank canvas to place an editable note.</span>
                          ) : null}
                        </div>
                        <SelectionConfirmCanvas
                          key={`${selectionConfirmDraft?.skeletonCandidate?.id ?? "no-skeleton"}-${selectionConfirmCanvas.placements.map((placement) => placement.selection.id).join("-")}`}
                          plan={selectionConfirmCanvas.plan}
                          skeletonSvgMarkup={selectionConfirmSkeletonSvg}
                          placements={selectionConfirmCanvas.placements}
                          width={selectionConfirmCanvas.width}
                          height={selectionConfirmCanvas.height}
                          tool={selectionConfirmTool}
                          activeItemId={selectionConfirmActiveItemId}
                          pendingArrowItemId={selectionConfirmPendingArrowItemId}
                          positions={selectionConfirmPositions}
                          sizes={selectionConfirmSizes}
                          arrows={selectionConfirmArrows}
                          notes={selectionConfirmNotes}
                          setTool={setSelectionConfirmTool}
                          setActiveItemId={setSelectionConfirmActiveItemId}
                          setPendingArrowItemId={setSelectionConfirmPendingArrowItemId}
                          setPositions={setSelectionConfirmPositions}
                          setSizes={setSelectionConfirmSizes}
                          setArrows={setSelectionConfirmArrows}
                          setNotes={setSelectionConfirmNotes}
                        />
                      </>
                    ) : (
                      <>
                        <div className="selection-confirm-toolbar">
                          {(["move", "note"] as const).map((tool) => (
                            <button
                              key={tool}
                              type="button"
                              className={`btn btn-secondary btn-sm ${selectionConfirmTool === tool ? "is-active" : ""}`}
                              onClick={() => {
                                setSelectionConfirmTool(tool);
                                setSelectionConfirmPendingArrowItemId(null);
                              }}
                            >
                              {tool === "move" ? "Move" : "Note"}
                            </button>
                          ))}
                          {selectionConfirmTool === "note" ? (
                            <span className="selection-confirm-tool-status">Click blank canvas to place an editable note.</span>
                          ) : (
                            <span className="selection-confirm-tool-status">Arrange references to clarify the composition.</span>
                          )}
                        </div>
                        <ReferenceConfirmBoard
                          placements={selectionConfirmCanvas.placements}
                          width={selectionConfirmCanvas.width}
                          height={selectionConfirmCanvas.height}
                          tool={selectionConfirmTool}
                          activeItemId={selectionConfirmActiveItemId}
                          positions={selectionConfirmPositions}
                          sizes={selectionConfirmSizes}
                          notes={selectionConfirmNotes}
                          setActiveItemId={setSelectionConfirmActiveItemId}
                          setPositions={setSelectionConfirmPositions}
                          setSizes={setSelectionConfirmSizes}
                          setNotes={setSelectionConfirmNotes}
                        />
                      </>
                    )}
                  </section>

                  {selectionConfirmPaletteFontSelections.length > 0 ? (
                    <section className="selection-confirm-cue-strip" aria-label="Selected palette and font cues">
                      <span className="label-text">Palette / Font cues</span>
                      <div className="selection-confirm-cue-list">
                        {selectionConfirmPaletteFontSelections.map((selection) => {
                          const font =
                            selection.item.assetKind === "font" && selection.item.assetId
                              ? figureFontReferences.find((entry) => entry.id === selection.item.assetId) ?? null
                              : null;
                          return (
                            <article
                              key={selection.id}
                              className={`selection-confirm-cue-card is-${selection.item.assetKind ?? "asset"}`}
                            >
                              {selection.colors.length > 0 ? (
                                <span className="selection-confirm-cue-palette">
                                  {selection.colors.map((color) => (
                                    <i key={color} style={{ background: color }} />
                                  ))}
                                </span>
                              ) : null}
                              {font ? (
                                <span
                                  className="selection-confirm-cue-font"
                                  style={{ fontFamily: font.cssFamily }}
                                >
                                  Aa
                                </span>
                              ) : null}
                              <span>
                                <strong>{selection.title}</strong>
                                <em>{selection.meta}</em>
                              </span>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}

                </div>

                <aside className="selection-confirm-side">
                  <div className="selection-confirm-section">
                    <span className="label-text">Composition mode</span>
                    <strong>
                      {selectionConfirmMode === "generated-image"
                        ? "generated-image refine"
                        : selectionConfirmMode === "reference-board"
                          ? "free reference board"
                          : selectionConfirmDraft?.compositionMode ?? "needs skeleton"}
                    </strong>
                    <span className="muted">
                      {selectionConfirmMode === "generated-image"
                        ? `Base image: ${selectionConfirmBaseVariant?.title ?? "selected generated output"}. Use annotations on the image plus selected references as guidance.`
                        : selectionConfirmMode === "reference-board"
                          ? "No generated output or skeleton is selected. Arrange references and notes for free composition."
                          : selectionConfirmDraft?.skeletonCandidate
                            ? `Skeleton: ${selectionConfirmDraft.skeletonCandidate.title}. Icons are optional; skeleton + style can generate directly.`
                            : selectionConfirmLayout
                              ? `No skeleton yet. Use "${selectionConfirmLayout.title}" to create one in this modal.`
                              : "No skeleton or layout reference in this selection."}
                    </span>
                    {selectionConfirmMode === "skeleton-binding" && !selectionConfirmDraft?.skeletonCandidate && selectionConfirmLayout ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={generatingSkeleton}
                        onClick={() => void generateSkeletonForSelectionConfirm(selectionConfirmDraft)}
                      >
                        {generatingSkeleton ? "Generating skeleton..." : "Generate skeleton from selected layout"}
                      </button>
                    ) : null}
                  </div>
                  {selectionConfirmStyleOptions.length > 0 ? (
                  <div className="selection-confirm-section">
                    <span className="label-text">Style reference</span>
                    {activeSelectionConfirmStyle ? (
                      <div className="selection-confirm-style-active">
                        {activeSelectionConfirmStyle.thumbnailUrl ? <img src={activeSelectionConfirmStyle.thumbnailUrl} alt="" /> : null}
                        <div>
                          <strong>{activeSelectionConfirmStyle.title}</strong>
                          <span>{activeSelectionConfirmStyle.subject ?? activeSelectionConfirmStyle.imageType}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="dashboard-empty">No style selected. Double-click a style below.</p>
                    )}
                    <div className="selection-confirm-style-grid">
                      {selectionConfirmStyleOptions.map(({ reference }) => {
                        const active = activeSelectionConfirmStyle?.id === reference.id;
                        return (
                          <button
                            key={reference.id}
                            type="button"
                            className={`selection-confirm-style-option ${active ? "is-active" : ""}`}
                            title="Double-click to use this style for this generation"
                            onDoubleClick={() => {
                              setSelectionConfirmStyleReferenceId(reference.id);
                              setSelectionConfirmPromptDirty(false);
                              setState((current) => ({ ...current, status: `Using "${reference.title}" as the style for this generation.` }));
                            }}
                          >
                            {reference.thumbnailUrl ? <img src={reference.thumbnailUrl} alt="" /> : null}
                            <span>{reference.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  ) : null}
                  <div className="selection-confirm-section">
                    <span className="label-text">Selected elements</span>
                    <div className="selection-confirm-list">
                      {selectionConfirmCanvas.selections.length === 0 ? (
                        <p className="dashboard-empty">No canvas elements selected for this generation.</p>
                      ) : (
                        selectionConfirmCanvas.selections.map((selection) => (
                          <article key={selection.id} className="selection-confirm-row">
                            <div className="selection-confirm-row-media">
                              {selection.imageUrl ? <img src={selection.imageUrl} alt="" /> : null}
                              {selection.colors.length > 0 ? (
                                <div className="selection-confirm-mini-palette">
                                  {selection.colors.map((color) => (
                                    <span key={color} style={{ background: color }} />
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            <div>
                              <strong>{selection.title}</strong>
                              <span>{selection.meta}</span>
                            </div>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                const addedIconId = selection.id.startsWith("confirm-search-icon-")
                                  ? selection.id.slice("confirm-search-icon-".length)
                                  : selection.id.startsWith("canvas-confirm-search-icon-")
                                    ? selection.item.assetId ?? null
                                  : null;
                                if (addedIconId) {
                                  setSelectionConfirmAddedIconIds((current) => current.filter((id) => id !== addedIconId));
                                  removeConfirmSearchIconFromCanvas(addedIconId);
                                }
                                const nextExcludedIds = Array.from(new Set([...selectionConfirmExcludedIds, selection.id]));
                                setSelectionConfirmExcludedIds(nextExcludedIds);
                                if (!selectionConfirmPromptDirty) {
                                  const nextDraft = buildCanvasGenerationDraft(new Set(nextExcludedIds));
                                  setSelectionConfirmPrompt(nextDraft?.promptText ?? "");
                                }
                              }}
                            >
                              Remove
                            </button>
                          </article>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="selection-confirm-section selection-confirm-advanced">
                    <button
                      type="button"
                      className="selection-confirm-advanced-toggle"
                      onClick={() => setSelectionConfirmAdvancedOpen((open) => !open)}
                      aria-expanded={selectionConfirmAdvancedOpen}
                    >
                      <span>
                        <strong>Advanced generation details</strong>
                        <em>Prompt, control screenshot, bindings</em>
                      </span>
                      <b>{selectionConfirmAdvancedOpen ? "Hide" : "Show"}</b>
                    </button>
                    {selectionConfirmAdvancedOpen ? (
                      <div className="selection-confirm-advanced-body">
                        <label className="selection-confirm-prompt">
                          <span className="label-text">Final prompt</span>
                          <textarea
                            value={selectionConfirmPrompt}
                            onChange={(event) => {
                              setSelectionConfirmPrompt(event.target.value);
                              setSelectionConfirmPromptDirty(true);
                            }}
                          />
                        </label>
                        <div>
                          <span className="label-text">Control screenshot</span>
                          <div className="selection-confirm-control-preview">
                            {selectionConfirmControlPreview ? (
                              <img src={selectionConfirmControlPreview} alt="Confirm control board preview" />
                            ) : (
                              <span>Preview appears after a skeleton is available.</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <span className="label-text">Reference bindings</span>
                          <div className="selection-confirm-annotation-summary">
                            <span>{selectionConfirmPositions.length} moved</span>
                            <span>{selectionConfirmSizes.length} resized</span>
                            <span>{selectionConfirmArrows.length} arrows</span>
                            <span>{selectionConfirmBindings.length} bindings</span>
                          </div>
                          {selectionConfirmBindings.length > 0 ? (
                            <div className="selection-confirm-binding-list">
                              {selectionConfirmBindings.map((binding) => (
                                <div key={binding.id} className="selection-confirm-binding-row">
                                  <strong>{binding.referenceTitle}</strong>
                                  <span>{binding.kind} → {binding.targetNodeLabel}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="muted">Move cards near labels or draw arrows to bind references to skeleton nodes.</span>
                          )}
                        </div>
                        {selectionConfirmNotes.length > 0 ? (
                          <span className="muted">{selectionConfirmNotes.length} free note{selectionConfirmNotes.length === 1 ? "" : "s"} will also be appended to the prompt.</span>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={selectionConfirmPositions.length + selectionConfirmSizes.length + selectionConfirmArrows.length + selectionConfirmNotes.length === 0}
                          onClick={() => {
                            setSelectionConfirmPositions([]);
                            setSelectionConfirmSizes([]);
                            setSelectionConfirmArrows([]);
                            setSelectionConfirmNotes([]);
                            setSelectionConfirmActiveItemId(null);
                            setSelectionConfirmPendingArrowItemId(null);
                            setSelectionConfirmControlPreview(null);
                          }}
                        >
                          Clear annotations
                        </button>
                      </div>
                    ) : null}
                  </div>
                </aside>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;
  // A new Idea Spark root deliberately has no active Skeleton even though
  // older branches remain available for restore.
  const studioSkeleton = selectedSkeleton ?? null;
  // Memoized so child components can use the plan (and objects derived from it)
  // as effect dependencies without re-firing on every dashboard render.
  const studioSkeletonPlan = useMemo(
    () => studioSkeleton?.xml
      ? parseDrawioXmlToDiagramPlan(studioSkeleton.xml) ?? studioSkeleton.diagramPlan ?? null
      : studioSkeleton?.diagramPlan ?? null,
    [studioSkeleton?.xml, studioSkeleton?.diagramPlan],
  );
  useEffect(() => {
    setSelectedSkeletonTargetIds([]);
    setRegionRegenPrompt("");
    setRegionRegenError(null);
    setViewedSkeletonRevisionId(null);
  }, [studioSkeleton?.id]);
  const studioSkeletonRevisions = studioSkeleton?.revisions ?? [];
  const studioSkeletonInitialXml = studioSkeleton?.initialXml ?? studioSkeletonRevisions[0]?.xmlBefore ?? studioSkeleton?.xml ?? null;
  const viewingOriginalSkeleton = viewedSkeletonRevisionId === "__original__";
  const viewedSkeletonRevisionIndex = viewedSkeletonRevisionId && !viewingOriginalSkeleton
    ? studioSkeletonRevisions.findIndex((revision) => revision.id === viewedSkeletonRevisionId)
    : -1;
  const viewedSkeletonRevisionNumber = viewedSkeletonRevisionIndex >= 0
    ? viewedSkeletonRevisionIndex + 1
    : null;
  const viewedSkeletonXml = viewingOriginalSkeleton
    ? studioSkeletonInitialXml
    : viewedSkeletonRevisionIndex >= 0
      ? studioSkeletonRevisions[viewedSkeletonRevisionIndex + 1]?.xmlBefore ?? studioSkeleton?.xml ?? null
      : null;
  const viewedSkeletonPlan = useMemo(
    () => viewedSkeletonXml ? parseDrawioXmlToDiagramPlan(viewedSkeletonXml) : null,
    [viewedSkeletonXml],
  );
  const displayedStudioSkeletonPlan = viewedSkeletonPlan ?? studioSkeletonPlan;
  const selectedSkeletonTargetIdSet = new Set(selectedSkeletonTargetIds);
  const regionRegenTargetNodes = studioSkeletonPlan?.nodes.filter(
    (node) => selectedSkeletonTargetIdSet.has(node.id) || Boolean(node.semanticId && selectedSkeletonTargetIdSet.has(node.semanticId)),
  ) ?? [];
  const regionRegenTargetEdges = studioSkeletonPlan?.edges.filter(
    (edge) => selectedSkeletonTargetIdSet.has(edge.id) || Boolean(edge.semanticId && selectedSkeletonTargetIdSet.has(edge.semanticId)),
  ) ?? [];
  const allSkeletonTargetIds = studioSkeletonPlan
    ? Array.from(new Set([
        ...studioSkeletonPlan.nodes.map((node) => node.semanticId ?? node.id),
        ...studioSkeletonPlan.edges.map((edge) => edge.semanticId ?? edge.id),
      ]))
    : [];
  const wholeSkeletonRegen = allSkeletonTargetIds.length > 0 &&
    regionRegenTargetNodes.length + regionRegenTargetEdges.length === allSkeletonTargetIds.length;
  const selectedSkeletonEdgesOnly = regionRegenTargetEdges.length > 0 && regionRegenTargetNodes.length === 0;
  const skeletonRegenTargetReady = wholeSkeletonRegen || regionRegenTargetNodes.length > 0;
  const regionRegenTargetLabel = wholeSkeletonRegen
    ? "All selected items"
    : regionRegenTargetNodes.length === 1
      ? regionRegenTargetNodes[0].label || regionRegenTargetNodes[0].id
      : `${regionRegenTargetNodes.length} selected modules`;
  const regionRegenTargetEdgeLabels = regionRegenTargetEdges.map((edge) =>
    `${studioSkeletonPlan?.nodes.find((node) => node.id === edge.from)?.label || edge.from} → ${studioSkeletonPlan?.nodes.find((node) => node.id === edge.to)?.label || edge.to}`,
  );
  const regionRegenTargetEdgeLabel = regionRegenTargetEdgeLabels.length === 1
    ? regionRegenTargetEdgeLabels[0]
    : `${regionRegenTargetEdgeLabels.length} selected arrows`;

  function toggleSkeletonNodeSelection(targetId: string) {
    if (!studioSkeletonPlan || regionRegenBusy) return;
    const nodeIds = new Set(studioSkeletonPlan.nodes.flatMap((node) => [node.id, node.semanticId].filter(Boolean) as string[]));
    setSelectedSkeletonTargetIds((current) => {
      const moduleSelection = current.filter((id) => nodeIds.has(id));
      return moduleSelection.includes(targetId)
        ? moduleSelection.filter((id) => id !== targetId)
        : [...moduleSelection, targetId];
    });
    setRegionRegenError(null);
  }

  function toggleSkeletonEdgeSelection(targetId: string) {
    if (!studioSkeletonPlan || regionRegenBusy) return;
    const edgeIds = new Set(studioSkeletonPlan.edges.flatMap((edge) => [edge.id, edge.semanticId].filter(Boolean) as string[]));
    setSelectedSkeletonTargetIds((current) => {
      const arrowSelection = current.filter((id) => edgeIds.has(id));
      return arrowSelection.includes(targetId)
        ? arrowSelection.filter((id) => id !== targetId)
        : [...arrowSelection, targetId];
    });
    setRegionRegenError(null);
  }

  function handleDeleteSelectedSkeletonEdges() {
    if (!studioSkeleton?.xml || regionRegenTargetEdges.length === 0 || regionRegenBusy) return;
    const candidateId = studioSkeleton.id;
    const xmlBefore = studioSkeleton.xml;
    let nextXml = xmlBefore;
    let removedCount = 0;
    regionRegenTargetEdges.forEach((edge) => {
      const removed = removeDrawioConnection(nextXml, edge.id);
      nextXml = removed.xml;
      removedCount += removed.removedCount;
    });
    if (removedCount === 0) {
      setRegionRegenError("The selected arrows could not be found in the current Draw.io skeleton.");
      return;
    }
    const instruction = regionRegenTargetEdges.length === 1 ? "Delete selected arrow" : "Delete selected arrows";
    const revision: SkeletonRegionRevision = {
      id: `edge-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
      instruction,
      targetLabel: regionRegenTargetEdgeLabel,
      scope: "arrow",
      xmlBefore,
    };
    setRegionRegenError(null);
    setClearedSkeletonConnections(null);
    handleSkeletonXmlChange(candidateId, nextXml, `Deleted ${removedCount} selected arrow${removedCount === 1 ? "" : "s"}.`);
    setState((current) => appendStudyEvent({
      ...current,
      diagramSkeletonCandidates: current.diagramSkeletonCandidates.map((candidate) =>
        candidate.id === candidateId
          ? {
              ...candidate,
              initialXml: candidate.initialXml ?? xmlBefore,
              revisions: [...(candidate.revisions ?? []), revision].slice(-20),
            }
          : candidate,
      ),
      guidedDialogue: appendNarratorMessage(current.guidedDialogue, {
        surface: "skeleton",
        speaker: "status",
        templateId: "skeleton_arrow_deleted",
        summary: `Deleted ${removedCount} complete selected arrow${removedCount === 1 ? "" : "s"}, including connector lines.`,
        promptRevisionId: current.currentPromptRevisionId,
        referenceId: null,
        artifactId: candidateId,
        artifactFingerprint: createNarratorArtifactFingerprint({ id: candidateId, xml: nextXml }),
        tone: "success",
      }),
      status: `Deleted ${removedCount} selected arrow${removedCount === 1 ? "" : "s"}.`,
    }, {
      stage: "skeleton",
      type: "skeleton_arrow_deleted",
      targetIds: [...regionRegenTargetEdges.map((edge) => edge.id), candidateId],
      result: "success",
      metadata: { targetLabel: regionRegenTargetEdgeLabel, removedCount },
    }));
    setSelectedSkeletonTargetIds([]);
  }

  async function handleRegionRegenerate() {
    if (!studioSkeleton || !studioSkeletonPlan || !skeletonRegenTargetReady) return;
    const instruction = regionRegenPrompt.trim();
    if (!instruction || regionRegenBusy) return;
    const candidateId = studioSkeleton.id;
    const targetLabel = regionRegenTargetLabel;
    const eventTargetIds = wholeSkeletonRegen
      ? [candidateId]
      : [...regionRegenTargetNodes.map((node) => node.id), candidateId];
    const xmlBefore = studioSkeleton.xml ?? "";
    setRegionRegenBusy(true);
    setRegionRegenError(null);
    try {
      const refined = await refineDiagramSkeletonRegion({
        prompt: instruction,
        diagramPlan: studioSkeletonPlan,
        targetIds: wholeSkeletonRegen ? [] : regionRegenTargetNodes.map((node) => node.id),
        scope: wholeSkeletonRegen ? "whole" : "region",
        brief: effectiveGenerationBrief,
        xml: xmlBefore,
      });
      if (!refined.xml) throw new Error("The refinement returned no diagram XML.");
      handleSkeletonXmlChange(candidateId, refined.xml);
      const revision: SkeletonRegionRevision = {
        id: `region-${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
        instruction,
        targetLabel,
        scope: wholeSkeletonRegen ? "whole" : "module",
        xmlBefore,
      };
      setState((current) => appendStudyEvent(appendStudyEvent({
        ...current,
        diagramSkeletonCandidates: current.diagramSkeletonCandidates.map((candidate) =>
          candidate.id === candidateId
            ? {
                ...candidate,
                initialXml: candidate.initialXml ?? xmlBefore,
                revisions: [...(candidate.revisions ?? []), revision].slice(-20),
              }
            : candidate,
        ),
        guidedDialogue: appendNarratorMessage(appendNarratorMessage(current.guidedDialogue, {
          surface: "skeleton",
          speaker: "author",
          templateId: wholeSkeletonRegen ? "skeleton_global_instruction" : "skeleton_region_instruction",
          summary: `${wholeSkeletonRegen ? "Update" : "Regenerate"} “${targetLabel}”: ${instruction}`,
          promptRevisionId: current.currentPromptRevisionId,
          referenceId: null,
          artifactId: candidateId,
          artifactFingerprint: createNarratorArtifactFingerprint({ id: candidateId, xml: refined.xml }),
        }), {
          surface: "skeleton",
          speaker: "assistant",
          templateId: wholeSkeletonRegen ? "skeleton_global_regenerated" : "skeleton_region_regenerated",
          summary: wholeSkeletonRegen
            ? "Updated the whole skeleton, including arrows and layout. Roll back anytime from Edit history."
            : `Regenerated “${targetLabel}” only; unselected modules are untouched. Roll back anytime from Edit history.`,
          promptRevisionId: current.currentPromptRevisionId,
          referenceId: null,
          artifactId: candidateId,
          artifactFingerprint: createNarratorArtifactFingerprint({ id: candidateId, xml: refined.xml }),
          tone: "success",
        }),
        status: wholeSkeletonRegen
          ? "Updated the whole skeleton."
          : `Regenerated “${targetLabel}”.`,
      }, {
        stage: "skeleton",
        type: wholeSkeletonRegen ? "skeleton_global_regenerated" : "skeleton_region_regenerated",
        targetIds: eventTargetIds,
        result: "success",
        metadata: { instruction, targetLabel, scope: wholeSkeletonRegen ? "whole" : "region" },
      }), {
        stage: "skeleton",
        type: wholeSkeletonRegen ? "skeleton_global_instruction" : "skeleton_region_instruction",
        targetIds: eventTargetIds,
        result: instruction,
        metadata: { targetLabel, scope: wholeSkeletonRegen ? "whole" : "region" },
      }));
      setRegionRegenPrompt("");
      setSelectedSkeletonTargetIds([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Skeleton refinement failed.";
      setRegionRegenError(message);
      setState((current) => appendStudyEvent({
        ...current,
        guidedDialogue: appendNarratorMessage(current.guidedDialogue, {
          surface: "skeleton",
          speaker: "assistant",
          templateId: wholeSkeletonRegen ? "skeleton_global_failed" : "skeleton_region_failed",
          summary: `Could not update “${targetLabel}”: ${message}`,
          promptRevisionId: current.currentPromptRevisionId,
          referenceId: null,
          artifactId: candidateId,
          artifactFingerprint: null,
          tone: "error",
        }),
        status: `Could not update “${targetLabel}”: ${message}`,
      }, {
        stage: "skeleton",
        type: wholeSkeletonRegen ? "skeleton_global_failed" : "skeleton_region_failed",
        targetIds: eventTargetIds,
        result: message,
        metadata: { instruction, targetLabel, scope: wholeSkeletonRegen ? "whole" : "region" },
      }));
    } finally {
      setRegionRegenBusy(false);
    }
  }

  function handleRegionRevert(revisionId: string) {
    if (!studioSkeleton || regionRegenBusy) return;
    const candidateId = studioSkeleton.id;
    const revisions = studioSkeleton.revisions ?? [];
    const index = revisions.findIndex((revision) => revision.id === revisionId);
    if (index < 0) return;
    const revision = revisions[index];
    const parsedPlan = revision.xmlBefore ? parseDrawioXmlToDiagramPlan(revision.xmlBefore) : null;
    setRegionRegenError(null);
    setState((current) => {
      const editingActiveCandidate = current.selectedDiagramSkeletonId === candidateId;
      const next = {
        ...current,
        diagramSkeletonXml: editingActiveCandidate ? revision.xmlBefore : current.diagramSkeletonXml,
        diagramSkeletonPlan: editingActiveCandidate
          ? parsedPlan ?? current.diagramSkeletonPlan
          : current.diagramSkeletonPlan,
        diagramSkeletonCandidates: current.diagramSkeletonCandidates.map((candidate) =>
          candidate.id === candidateId
            ? {
                ...candidate,
                xml: revision.xmlBefore,
                diagramPlan: parsedPlan ?? candidate.diagramPlan,
                initialXml: candidate.initialXml ?? revisions[0]?.xmlBefore ?? revision.xmlBefore,
                revisions: (candidate.revisions ?? []).slice(0, index),
              }
            : candidate,
        ),
        skeletonConfirmedAt: editingActiveCandidate ? null : current.skeletonConfirmedAt,
        guidedDialogue: appendNarratorMessage(current.guidedDialogue, {
          surface: "skeleton",
          speaker: "status",
          templateId: "skeleton_region_reverted",
          summary: `Rolled back to before “${revision.targetLabel}: ${revision.instruction}”.`,
          promptRevisionId: current.currentPromptRevisionId,
          referenceId: null,
          artifactId: candidateId,
          artifactFingerprint: createNarratorArtifactFingerprint({ id: candidateId, xml: revision.xmlBefore }),
        }),
        status: `Rolled back a ${revision.scope === "whole" ? "whole-skeleton edit" : revision.scope === "arrow" ? "deleted arrow" : "module edit"}.`,
      };
      return appendStudyEvent(next, {
        stage: "skeleton",
        type: "skeleton_region_reverted",
        targetIds: [candidateId, revision.id],
        result: revision.targetLabel,
        metadata: { instruction: revision.instruction, scope: revision.scope ?? "module" },
      });
    });
    setSelectedSkeletonTargetIds([]);
    setViewedSkeletonRevisionId(null);
  }

  function handleSkeletonRevisionView(revisionId: string) {
    setViewedSkeletonRevisionId((current) => current === revisionId ? null : revisionId);
    setSelectedSkeletonTargetIds([]);
    setRegionRegenError(null);
    openSkeletonConversationView("preview");
  }

  function handleOriginalSkeletonView() {
    setViewedSkeletonRevisionId((current) => current === "__original__" ? null : "__original__");
    setSelectedSkeletonTargetIds([]);
    setRegionRegenError(null);
    openSkeletonConversationView("preview");
  }

  const studioSkeletonApplication = studioSkeleton
    ? skeletonStyleApplications[studioSkeleton.id]?.appliedAt
      ? skeletonStyleApplications[studioSkeleton.id]
      : null
    : null;
  const studioSkeletonStyleIsStale = Boolean(
    studioSkeletonApplication &&
    studioSkeletonApplication.styleKitFingerprint !== skeletonStyleReferenceSet.fingerprint,
  );
  const studioStructureWarningCount = 0;

  function toggleDashboardNarrator(surface: "skeleton" | "style") {
    setState((current) => appendStudyEvent({
      ...current,
      guidedDialogue: {
        ...current.guidedDialogue,
        collapsed: {
          ...current.guidedDialogue.collapsed,
          [surface]: !current.guidedDialogue.collapsed[surface],
        },
      },
    }, {
      stage: surface === "skeleton" ? "skeleton" : "references",
      type: current.guidedDialogue.collapsed[surface] ? "narrator_opened" : "narrator_collapsed",
      targetIds: [],
      result: surface,
    }));
  }

  function openSkeletonConversationView(view: "preview" | "drawio") {
    if (!studioSkeleton) return;
    if (view === "drawio") setViewedSkeletonRevisionId(null);
    setState((current) => appendStudyEvent({
      ...current,
      guidedDialogue: {
        ...current.guidedDialogue,
        detailViews: { ...current.guidedDialogue.detailViews, skeleton: view },
      },
    }, {
      stage: "skeleton",
      type: "narrator_choice_selected",
      targetIds: [studioSkeleton.id],
      result: `open_${view}`,
      metadata: { surface: "skeleton" },
    }));
  }

  function saveStudioSkeletonCheckpoint() {
    if (!studioSkeleton) return;
    const now = new Date().toISOString();
    setState((current) => {
      const decision = {
        id: `narrator-skeleton-${Date.now()}`,
        surface: "skeleton" as const,
        stepId: "checkpoint",
        choiceId: "save_checkpoint",
        summary: `${studioSkeleton.title}: ${studioSkeletonPlan?.nodes.length ?? 0} nodes, ${studioSkeletonPlan?.edges.length ?? 0} relations, ${studioStructureWarningCount} item(s) requiring author review.`,
        promptRevisionId: current.currentPromptRevisionId,
        layoutReferenceId: studioSkeleton.referenceId ?? current.layoutReferenceId,
        skeletonId: studioSkeleton.id,
        styleReferenceId: null,
        styleKitId: null,
        analysisStatus: null,
        artifactFingerprint: createNarratorArtifactFingerprint({
          prompt: createPromptFingerprint(current.prompt),
          layoutReferenceId: studioSkeleton.referenceId ?? current.layoutReferenceId,
          skeletonId: studioSkeleton.id,
          skeletonXml: studioSkeleton.xml,
        }),
        status: "current" as const,
        createdAt: now,
      };
      const next = {
        ...current,
        skeletonConfirmedAt: now,
        skeletonCheckpointPlan: studioSkeletonPlan,
        guidedDialogue: appendNarratorMessage({
          ...current.guidedDialogue,
          currentSteps: { ...current.guidedDialogue.currentSteps, skeleton: "checkpoint" },
          completedStepIds: Array.from(new Set([...current.guidedDialogue.completedStepIds, "skeleton:checkpoint"])),
          decisions: { ...current.guidedDialogue.decisions, skeleton: decision },
        }, {
          surface: "skeleton",
          speaker: "assistant",
          templateId: "skeleton_checkpoint_saved",
          summary: studioStructureWarningCount
            ? `Checkpoint saved with ${studioStructureWarningCount} item(s) still requiring author review.`
            : "Skeleton checkpoint saved. You can continue to Style or keep editing.",
          promptRevisionId: current.currentPromptRevisionId,
          referenceId: studioSkeleton.referenceId ?? current.layoutReferenceId,
          artifactId: studioSkeleton.id,
          artifactFingerprint: decision.artifactFingerprint,
          tone: studioStructureWarningCount ? "warning" : "success",
        }),
        status: studioStructureWarningCount
          ? "Skeleton checkpoint saved with items that still require author review."
          : "Skeleton checkpoint saved. Continue to Style.",
      };
      return appendStudyEvent(appendStudyEvent(next, {
        stage: "skeleton",
        type: "skeleton_confirmed",
        targetIds: [studioSkeleton.id],
        result: studioStructureWarningCount ? "confirmed_with_warnings" : "confirmed",
        metadata: {
          warningCount: studioStructureWarningCount,
        },
      }), {
        stage: "skeleton",
        type: "narrator_decision_pinned",
        targetIds: [decision.id, studioSkeleton.id],
        result: "checkpoint",
        metadata: { surface: "skeleton", promptRevisionId: current.currentPromptRevisionId },
      });
    });
  }

  const currentSkeletonCheckpointSaved = Boolean(
    studioSkeleton &&
    state.guidedDialogue.decisions.skeleton?.status === "current" &&
    state.guidedDialogue.decisions.skeleton.skeletonId === studioSkeleton.id,
  );

  const stagePrimaryAction = useMemo((): StageActionBarProps | null => {
    if (workspaceView !== "studio") return null;

    if (studioStage === "content" && activeIdeaSparkStep === "prompt") {
      return {
        metaTitle: "Prompt",
        meta: "Review the assigned task, then continue to reference search",
        primaryLabel: continueToStepLabel("retrieval"),
        onPrimary: () => openIdeaSparkStep("retrieval"),
      };
    }

    if (studioStage === "content" && activeIdeaSparkStep === "retrieval") {
      const layoutReady = board.some((item) => referenceUsage[item.id]?.layout);
      return {
        metaTitle: `${board.length} reference${board.length === 1 ? "" : "s"} saved`,
        meta: layoutReady ? "Layout ready · Style can be selected later" : "You can start with a blank Skeleton",
        primaryLabel: continueToStepLabel("layout"),
        onPrimary: () => setActiveStage("layout"),
      };
    }

    if ((studioStage === "layout" || studioStage === "style") && childStageActionRef.current) {
      return registrationToBarProps(childStageActionRef.current);
    }

    if (studioStage === "icons") {
      const appearanceSummary = [
        fontReference ? "font matched" : null,
        matchPreviewPaletteColors.length ? "colors matched" : null,
      ].filter(Boolean).join(" · ");
      return {
        metaTitle: "Match",
        meta: `${currentSkeletonBindingCount} icon${currentSkeletonBindingCount === 1 ? "" : "s"} mapped${appearanceSummary ? ` · ${appearanceSummary}` : " · font/color optional"} · generate on the Candidate page`,
        // Navigation only: the run is started from Candidate, where its
        // progress and result are visible.
        primaryLabel: continueToStepLabel("candidate"),
        onPrimary: () => openIdeaSparkStep("candidate"),
      };
    }

    if (studioStage === "candidate") {
      const candidateVariant =
        variants.find((variant) => variant.id === selectedVariantId && !variant.sourceVariantId) ??
        variants.find((variant) => !variant.sourceVariantId) ??
        null;
      // Edit / generate sit on the figure once one exists, so the sticky bar
      // only remains for the empty "generate the first Candidate" state.
      if (candidateVariant) return null;
      return {
        metaTitle: "Candidate",
        meta: "Confirm inputs on the left, then generate · you can return to Retrieval for more references",
        primaryLabel: generating ? "Generating…" : "Generate Candidate",
        onPrimary: () => void generateFirstFigure(),
        disabled: !firstGenerationBundle || generating,
        loading: generating,
        guideAnchor: "candidate-generate-action",
      };
    }

    return null;
  }, [
    activeIdeaSparkStep,
    board,
    childStageActionTick,
    currentSkeletonBindingCount,
    firstGenerationBundle,
    fontReference,
    generating,
    matchPreviewPaletteColors.length,
    openIdeaSparkStep,
    referenceUsage,
    selectedVariantId,
    setActiveStage,
    studioStage,
    studyProfile?.userId,
    variants,
    workspaceView,
  ]);

  const skeletonEditorPanel = studioSkeleton?.xml ? (
    <div className="inline-skeleton-studio-grid">
      <section className="inline-drawio-pane">
        <header>
          <div>
            <strong>{viewingOriginalSkeleton
              ? "Original generated version"
              : viewedSkeletonRevisionNumber
              ? `History #${viewedSkeletonRevisionNumber}`
              : state.guidedDialogue.detailViews.skeleton === "drawio"
                ? "Edit skeleton"
                : "Skeleton preview"}</strong>
            <small>{viewingOriginalSkeleton
              ? "Viewing the first generated Skeleton. Click View again to return to the current version."
              : viewedSkeletonRevisionNumber
              ? "Viewing this edit. Click View again to return to the current skeleton."
              : state.guidedDialogue.detailViews.skeleton === "drawio"
                ? "Move, rename, reconnect, or add nodes in Draw.io"
                : "Click to select multiple modules or arrows; select all for an overall change"}</small>
          </div>
          <div className="inline-drawio-pane-controls">
            {state.guidedDialogue.detailViews.skeleton === "drawio" ? (
              <>
                <span className="badge">Auto-save</span>
                <button
                  type="button"
                  className="btn btn-secondary drawio-toggle-btn"
                  onClick={() => openSkeletonConversationView("preview")}
                >
                  Back to preview
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary drawio-toggle-btn"
                onClick={() => openSkeletonConversationView("drawio")}
              >
                Edit in Draw.io
              </button>
            )}
          </div>
        </header>
        {state.guidedDialogue.detailViews.skeleton !== "drawio" && displayedStudioSkeletonPlan ? (
          <div className={dashboardSheetStyles.iconMatchSkeletonPreview}>
            <LayoutPngPreview
              plan={displayedStudioSkeletonPlan}
              fit
              focusedTargetIds={viewedSkeletonRevisionId ? [] : selectedSkeletonTargetIds}
              customIconReferences={customIconReferences}
              onFocusTarget={viewedSkeletonRevisionId ? undefined : toggleSkeletonNodeSelection}
              onFocusEdge={viewedSkeletonRevisionId ? undefined : toggleSkeletonEdgeSelection}
            />
          </div>
        ) : (
          <DrawioEmbed
            xml={studioSkeleton.xml}
            height={720}
            onChange={(xml) => {
              setSelectedSkeletonTargetIds([]);
              handleSkeletonXmlChange(studioSkeleton.id, xml);
            }}
          />
        )}
      </section>
      <section className="inline-icon-mapping-pane skeleton-controls-panel" data-guide-anchor="skeleton-inspector">
        <header className="skeleton-controls-head">
          <span className="label-text">Skeleton refinement</span>
          <h2>Change selected items</h2>
          <div className="skeleton-clear-actions">
            <button
              type="button"
              className="btn btn-danger btn-sm skeleton-clear-arrows-btn"
              onClick={() => {
                setSelectedSkeletonTargetIds([]);
                clearSkeletonConnections(studioSkeleton);
              }}
              disabled={Boolean(viewedSkeletonRevisionId) || (studioSkeletonPlan?.edges.length ?? 0) === 0}
              title={(studioSkeletonPlan?.edges.length ?? 0) > 0
                ? `Remove all ${studioSkeletonPlan?.edges.length} arrows from this Skeleton`
                : "This Skeleton has no arrows"}
            >
              Clear all arrows
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm skeleton-undo-clear-btn"
              onClick={() => undoClearSkeletonConnections(studioSkeleton)}
              disabled={
                Boolean(viewedSkeletonRevisionId) ||
                !clearedSkeletonConnections ||
                clearedSkeletonConnections.candidateId !== studioSkeleton.id ||
                clearedSkeletonConnections.clearedXml !== studioSkeleton.xml
              }
              title="Restore the arrows removed by the most recent Clear"
              aria-label="Undo the most recent Clear all arrows action"
            >
              <span aria-hidden="true">↶</span> Undo clear
            </button>
          </div>
        </header>
        <div className="skeleton-region-panel" data-guide-anchor="skeleton-region-regen">
          <div className={`skeleton-region-step ${selectedSkeletonTargetIds.length > 0 ? "is-ready" : "is-waiting"}`}>
            <span className="skeleton-region-step-index" aria-hidden="true">1</span>
            <div className="skeleton-region-step-body">
              <div className="skeleton-region-step-heading">
                <strong>{wholeSkeletonRegen ? "All items selected" : selectedSkeletonEdgesOnly ? "Arrows selected" : regionRegenTargetNodes.length > 0 ? "Modules selected" : "Click modules or arrows on the left"}</strong>
                <div className="skeleton-region-step-actions" aria-label="Skeleton item selection">
                  <button
                    type="button"
                    className="btn btn-sm skeleton-action-positive"
                    onClick={() => {
                      setSelectedSkeletonTargetIds(allSkeletonTargetIds);
                      setRegionRegenError(null);
                    }}
                    disabled={Boolean(viewedSkeletonRevisionId) || regionRegenBusy || allSkeletonTargetIds.length === 0 || wholeSkeletonRegen}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => setSelectedSkeletonTargetIds([])}
                    disabled={Boolean(viewedSkeletonRevisionId) || regionRegenBusy || selectedSkeletonTargetIds.length === 0}
                  >
                    Clear
                  </button>
                </div>
              </div>
              {wholeSkeletonRegen ? (
                <div className="skeleton-region-selected is-whole">
                  <span>Will update</span>
                  <b>All modules and arrows</b>
                </div>
              ) : selectedSkeletonEdgesOnly ? (
                <>
                  <div className="skeleton-region-selected is-arrow">
                    <span>Selected</span>
                    <b>{regionRegenTargetEdgeLabel}</b>
                  </div>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleDeleteSelectedSkeletonEdges}
                    disabled={Boolean(viewedSkeletonRevisionId) || regionRegenBusy}
                  >
                    Delete selected arrow{regionRegenTargetEdges.length === 1 ? "" : "s"}
                  </button>
                </>
              ) : regionRegenTargetNodes.length > 0 ? (
                <div className="skeleton-region-selected">
                  <span>Will rewrite</span>
                  <b>{regionRegenTargetNodes.map((node) => node.label || node.id).join(", ")}</b>
                </div>
              ) : null}
              {selectedSkeletonTargetIds.length === 0 && state.guidedDialogue.detailViews.skeleton !== "preview" ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => openSkeletonConversationView("preview")}
                >
                  Open preview
                </button>
              ) : null}
            </div>
          </div>
          {!selectedSkeletonEdgesOnly || wholeSkeletonRegen ? <div className={`skeleton-region-step ${skeletonRegenTargetReady ? "is-waiting" : ""}`}>
            <span className="skeleton-region-step-index" aria-hidden="true">2</span>
            <div className="skeleton-region-step-body">
              <label htmlFor="skeleton-region-instruction"><strong>Describe what should change</strong></label>
              <textarea
                id="skeleton-region-instruction"
                className="skeleton-region-instruction-input"
                value={regionRegenPrompt}
                onChange={(event) => setRegionRegenPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleRegionRegenerate();
                  }
                }}
                disabled={Boolean(viewedSkeletonRevisionId) || regionRegenBusy || !skeletonRegenTargetReady}
                placeholder={wholeSkeletonRegen
                  ? "e.g. Reverse the arrows between Input and Encoder, and make all feedback arrows dashed"
                  : regionRegenTargetNodes.length === 1
                    ? `e.g. Split “${regionRegenTargetNodes[0].label || regionRegenTargetNodes[0].id}” into two steps`
                    : regionRegenTargetNodes.length > 1
                      ? "e.g. Align these modules and simplify their labels"
                      : "Select one or more modules first"}
                rows={4}
              />
              <button
                type="button"
                className="btn btn-primary skeleton-region-submit"
                onClick={() => void handleRegionRegenerate()}
                disabled={Boolean(viewedSkeletonRevisionId) || regionRegenBusy || !skeletonRegenTargetReady || !regionRegenPrompt.trim()}
              >
                {regionRegenBusy ? "Updating…" : "Update selected items"}
              </button>
            </div>
          </div> : null}
          {studioSkeletonInitialXml ? (
            <details className="skeleton-region-history" open>
              <summary>Version history ({studioSkeletonRevisions.length + 1})</summary>
              <ol>
                {studioSkeletonRevisions.map((revision, index) => ({ revision, index })).reverse().map(({ revision, index }) => {
                  const isViewing = viewedSkeletonRevisionId === revision.id;
                  return <li key={revision.id} className={isViewing ? "is-viewing" : undefined}>
                    <span className="skeleton-region-history-index" aria-label={`Edit ${index + 1}`}>{index + 1}</span>
                    <div className="skeleton-region-history-copy">
                      <strong>{revision.targetLabel}</strong>
                      <p>{revision.instruction}</p>
                    </div>
                    <div className="skeleton-region-history-actions">
                      <button
                        type="button"
                        className={`btn btn-sm skeleton-action-positive ${isViewing ? "is-active" : ""}`}
                        onClick={() => handleSkeletonRevisionView(revision.id)}
                        aria-pressed={isViewing}
                        title={isViewing ? "Return to the current skeleton" : `View edit ${index + 1}`}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleRegionRevert(revision.id)}
                        disabled={regionRegenBusy}
                      >
                        Roll back
                      </button>
                    </div>
                  </li>;
                })}
                <li className={viewingOriginalSkeleton ? "is-viewing" : undefined}>
                  <span className="skeleton-region-history-index" aria-label="Original version">0</span>
                  <div className="skeleton-region-history-copy">
                    <strong>Original generated version</strong>
                    <p>First generated Skeleton · always retained</p>
                  </div>
                  <div className="skeleton-region-history-actions">
                    <button
                      type="button"
                      className={`btn btn-sm skeleton-action-positive ${viewingOriginalSkeleton ? "is-active" : ""}`}
                      onClick={handleOriginalSkeletonView}
                      aria-pressed={viewingOriginalSkeleton}
                      title={viewingOriginalSkeleton ? "Return to the current skeleton" : "View the original generated Skeleton"}
                    >
                      View
                    </button>
                  </div>
                </li>
              </ol>
            </details>
          ) : null}
          {regionRegenError ? (
            <p className="skeleton-region-error" role="alert">{regionRegenError}</p>
          ) : state.status ? (
            <p className="skeleton-region-status" aria-live="polite">{state.status}</p>
          ) : null}
        </div>
      </section>
    </div>
  ) : null;

  const skeletonEditorModal = skeletonEditorOpen && skeletonEditorPanel && portalReady && typeof document !== "undefined"
    ? createPortal(
      <div
        className="style-detail-overlay skeleton-editor-overlay"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSkeletonEditorOpen(false);
        }}
      >
        <section
          className="style-detail-dialog skeleton-editor-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={`Edit skeleton ${studioSkeleton?.title ?? ""}`}
        >
          <header className="style-detail-dialog-head">
            <div>
              <span className="label-text">Edit skeleton</span>
              <h2>Rewrite one part of the layout</h2>
              <p>Click a module on the left, describe the change, then regenerate. Everything else stays.</p>
            </div>
          </header>
          <div className="style-detail-dialog-body">
            {skeletonEditorPanel}
          </div>
          <footer className="style-detail-dialog-foot">
            {currentSkeletonCheckpointSaved ? (
              <>
                <button type="button" className="btn btn-secondary" onClick={() => setSkeletonEditorOpen(false)}>
                  Done
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setSkeletonEditorOpen(false);
                    setActiveStage("style");
                  }}
                >
                  {continueToStepLabel("style")}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-secondary" onClick={() => setSkeletonEditorOpen(false)}>
                  Close
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={saveStudioSkeletonCheckpoint}
                  disabled={!studioSkeleton}
                >
                  Save checkpoint
                </button>
              </>
            )}
          </footer>
        </section>
      </div>,
      document.body,
    )
    : null;

  const candidateEditorModal = candidateMode === "edit" && portalReady && typeof document !== "undefined"
    ? createPortal(
      <div
        className="style-detail-overlay"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeCandidateEditor();
        }}
      >
        <section
          className="style-detail-dialog candidate-edit-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={`Edit candidate ${selectedVariant?.title ?? ""}`}
        >
          <header className="style-detail-dialog-head">
            <div>
              <h2>Edit</h2>
            </div>
          </header>
          <div className="style-detail-dialog-body candidate-edit-dialog-body" data-guide-anchor="edit-workspace">
            <SvgEditorStudio embedded compact onOpenJourney={() => {
              closeCandidateEditor();
              openReviewWorkspace();
            }} />
          </div>
          <footer className="style-detail-dialog-foot">
            <button type="button" className="btn btn-primary" onClick={closeCandidateEditor}>
              Done
            </button>
          </footer>
        </section>
      </div>,
      document.body,
    )
    : null;

  const iconMatchingWorkspace = studioSkeleton?.xml ? (
    <section className="inline-skeleton-studio studio-icon-match-workspace" aria-label="Icon, font, and color matching">
      {/* Both panes below state their own instruction, and Style is one click
          away in the navigator, so this stage opens straight on the diagram. */}
      <div className="inline-skeleton-studio-grid">
        <section className="inline-drawio-pane">
          <header>
            <div>
              <strong>{studioSkeleton.title}</strong>
            </div>
            <div className="inline-drawio-pane-controls">
              <span className="badge">{currentSkeletonBindingCount} mapped</span>
              {matchDrawioOpen ? (
                <>
                  <span className="badge">Auto-save</span>
                  <button
                    type="button"
                    className="btn btn-secondary drawio-toggle-btn"
                    onClick={() => setMatchDrawioOpen(false)}
                  >
                    Back to preview
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary drawio-toggle-btn"
                  onClick={() => setMatchDrawioOpen(true)}
                  disabled={!studioSkeleton.xml}
                >
                  Edit in Draw.io
                </button>
              )}
            </div>
          </header>
          {matchDrawioOpen && studioSkeleton.xml ? (
            <DrawioEmbed
              xml={studioSkeleton.xml}
              height={720}
              onChange={(xml) => handleSkeletonXmlChange(studioSkeleton.id, xml)}
            />
          ) : studioSkeletonPlan ? (
            <div className={dashboardSheetStyles.iconMatchSkeletonPreview}>
              <LayoutPngPreview
                plan={studioSkeletonPlan}
                fit
                focusedTargetIds={focusedStructureTargetId ? [focusedStructureTargetId] : []}
                iconBindings={currentSkeletonBindings}
                customIconReferences={customIconReferences}
                fontFamily={matchPreviewFontFamily}
                paletteColors={matchPreviewPaletteColors}
                onFocusTarget={setFocusedStructureTargetId}
              />
            </div>
          ) : (
            <div className="layout-canvas-empty"><p>Open Skeleton to inspect its layout before matching.</p></div>
          )}
        </section>
        <section className="inline-icon-mapping-pane" data-guide-anchor="icon-binding">
          <ScientificStructurePanel
            focusedModuleId={focusedStructureTargetId}
            onFocusModule={setFocusedStructureTargetId}
            diagramPlan={studioSkeletonPlan}
            skeletonId={studioSkeleton.id}
            presentation="mapping"
          />
        </section>
      </div>
    </section>
  ) : (
    <section className={dashboardSheetStyles.iconMatchEmpty}>
      <h2>Generate a Skeleton first</h2>
      <p>Icon, font, and color matching need Skeleton node content.</p>
      <button type="button" className="btn btn-primary" onClick={() => setActiveStage("layout")}>Open Skeleton</button>
    </section>
  );

  // A Pocket image click is only a preview. Layout and Style expose an explicit
  // Select button on the right, which is the sole action that changes the source
  // used for later generation.
  function studioStageOwnsSourceRole(role: PocketRole) {
    return (studioStage === "layout" && role === "layout") ||
      (studioStage === "style" && role === "style");
  }

  // Pocket clicks are visit-scoped previews. Once the user leaves Layout or
  // Style, discard that preview so returning to the page restores the durable
  // "Select for generation" source to the first position.
  useEffect(() => {
    if (!studioSourcePreviewRequest) return;
    if (studioStageOwnsSourceRole(studioSourcePreviewRequest.role)) return;
    setStudioSourcePreviewRequest(null);
  }, [studioSourcePreviewRequest, studioStage]);

  function openStudioSource(item: ReferenceItem, role: PocketRole) {
    setStudioSourceCategoriesOpen((current) => ({ ...current, [role]: true }));
    if (studioStageOwnsSourceRole(role)) {
      setStudioSourcePreviewRequest((current) => ({
        referenceId: item.id,
        role,
        nonce: (current?.nonce ?? 0) + 1,
      }));
      return;
    }
    if (activeStage !== "content") setActiveStage("content");
    if (activeIdeaSparkStep !== "retrieval") openIdeaSparkStep("retrieval");
    setRetrievalPocketFocus((current) => ({
      referenceId: item.id,
      role,
      nonce: (current?.nonce ?? 0) + 1,
    }));
  }

  function syncRetrievalPocketAction(
    item: ReferenceItem,
    role: PocketRole,
    action: "add" | "remove",
  ) {
    setStudioSourceCategoriesOpen((current) => ({ ...current, [role]: true }));
    setDrawerTab(role);
    setPocketRole(role);
    updateCreativeCanvas((canvas) => canvas.drawerCollapsed
      ? { ...canvas, drawerCollapsed: false }
      : canvas, { trackUndo: false });
    // Right Retrieval list -> left pocket: highlight the entry that just changed.
    setRetrievalPocketFocus((current) => {
      if (action === "remove") {
        return current?.referenceId === item.id && current.role === role ? null : current;
      }
      return { referenceId: item.id, role, nonce: (current?.nonce ?? 0) + 1 };
    });
  }

  const workflowWorkspace = workspaceView === "studio" ? (
    <section
      className={dashboardSheetStyles.workspaceCenter}
      aria-label={`${activeStageLabel} workspace`}
    >
      <div className={dashboardSheetStyles.workspaceCenterBody}>
        {studioStage === "content" ? (
          <FigureWorkbench
            studyMode={Boolean(studyProfile?.userId)}
            focus={activeIdeaSparkStep === "retrieval" ? "retrieval" : "prompt"}
            pocketFocusRequest={activeIdeaSparkStep === "retrieval" ? retrievalPocketFocus : null}
            onPocketAction={syncRetrievalPocketAction}
            onEnterCanvas={() => setActiveStage("layout")}
          />
        ) : null}
        {studioStage === "layout" ? (
          <LayoutStudio
            embedded
            previewRequest={studioSourcePreviewRequest?.role === "layout" ? studioSourcePreviewRequest : null}
            onEditSkeleton={handleEditSkeletonFromLayout}
            onContinueToStyle={() => setActiveStage("style")}
            onRegisterStageAction={registerChildStageAction}
          />
        ) : null}
        {studioStage === "style" ? (
          <CanvasStudio
            embedded
            previewRequest={studioSourcePreviewRequest?.role === "style" ? studioSourcePreviewRequest : null}
            onContinueToIcons={focusNodeIconMapping}
            onRegisterStageAction={registerChildStageAction}
          />
        ) : null}
        {studioStage === "icons" ? iconMatchingWorkspace : null}
        {studioStage === "candidate" ? (
          <div className={dashboardSheetStyles.candidateConsole}>
            <div
              className={dashboardSheetStyles.consoleMain}
              data-has-runs="true"
            >
              {candidateSelectionRail}
              <div className={dashboardSheetStyles.candidateGallery}>
                <div className={dashboardSheetStyles.candidateStage}>
                  <CandidateStudio
                    variants={variants}
                    selectedVariantId={candidateDisplayVariantId}
                    generating={generating}
                    generationProgress={variantGenerationProgress}
                    stale={candidateInputsAreStale}
                    staleReasons={candidateStaleReasons}
                    canRegenerate={Boolean(firstGenerationBundle)}
                    onRegenerate={() => void generateFirstFigure()}
                    onContinueRetrieval={() => openIdeaSparkStep("retrieval")}
                    onEdit={() => {
                      const targetId = candidateDisplayVariantId ?? candidateRuns[0]?.id;
                      if (targetId) openVariantInEdit(targetId);
                    }}
                    pendingRevision={pendingRevision}
                  />
                </div>
              </div>
              {candidateRunsRail}
            </div>
          </div>
        ) : null}
        {studioStage === "review" ? (
          <div className={dashboardSheetStyles.journeyWorkspace} aria-label="History" data-guide-anchor="history-tree">
            <JourneyTree onRestore={(nodeId) => handleRestoreIdea(nodeId, { remainOnHistory: true })} />
          </div>
        ) : null}
      </div>
      {stagePrimaryAction ? <StageActionBar {...stagePrimaryAction} /> : null}
    </section>
  ) : null;
  const showStudioSources = workspaceView !== "studio" || studioStage === "content" || studioStage === "layout" || studioStage === "style";
  const pocketManagerModal =
    pocketManagerOpen && portalReady
      ? createPortal(
          <div
            className="dashboard-pocket-manager"
            role="dialog"
            aria-modal="true"
            aria-label="Pocket manager"
            onClick={() => setPocketManagerOpen(false)}
          >
            <div className="dashboard-pocket-manager-panel" onClick={(event) => event.stopPropagation()}>
              <div className="dashboard-workflow-modal-head">
                <div>
                  <span className="label-text">Pocket</span>
                  <h2 className="h-section">Pocket references</h2>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setPocketManagerOpen(false)}
                >
                  Done
                </button>
              </div>
              <div className="dashboard-pocket-manager-body">
                {pocketManagerContent}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;
  const candidateRailZoomModal =
    railZoom && portalReady
      ? createPortal(
          <div
            className="pocket-zoom-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={`Enlarged ${railZoom.caption}`}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setRailZoom(null);
            }}
          >
            <section className={dashboardSheetStyles.railZoomPanel}>
              <header className={dashboardSheetStyles.railZoomHead}>
                <span className="label-text">{railZoom.caption}</span>
                <strong>{railZoom.note}</strong>
              </header>
              <div className={dashboardSheetStyles.railZoomBody}>{railZoom.body}</div>
            </section>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRailZoom(null)}>
              Close
            </button>
          </div>,
          document.body,
        )
      : null;
  const pocketZoomModal =
    pocketZoomReference && portalReady
      ? createPortal(
          <div
            className="pocket-zoom-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={`Enlarged preview of ${pocketZoomReference.title}`}
            onClick={() => setPocketZoomReference(null)}
          >
            <figure className="pocket-zoom-figure" onClick={(event) => event.stopPropagation()}>
              {pocketZoomReference.imageDataUrl || pocketZoomReference.thumbnailUrl ? (
                <img
                  src={pocketZoomReference.imageDataUrl || pocketZoomReference.thumbnailUrl || undefined}
                  alt={pocketZoomReference.title}
                />
              ) : null}
              <figcaption>{pocketZoomReference.title}</figcaption>
            </figure>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setPocketZoomReference(null)}
            >
              Close
            </button>
          </div>,
          document.body,
        )
      : null;
  const skeletonManagerModal =
    skeletonManagerOpen && portalReady
      ? createPortal(
          <div
            className="dashboard-skeleton-manager"
            role="dialog"
            aria-modal="true"
            aria-label="Corresponding skeleton manager"
            onClick={() => setSkeletonManagerOpen(false)}
          >
            <div className="dashboard-skeleton-manager-panel" onClick={(event) => event.stopPropagation()}>
              <div className="dashboard-workflow-modal-head">
                <div>
                  <span className="label-text">Corresponding skeleton</span>
                  <h2 className="h-section">Choose or create a draw.io layout</h2>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSkeletonManagerOpen(false)}
                >
                  Done
                </button>
              </div>

              <div className="dashboard-skeleton-create-grid">
                <button
                  type="button"
                  className="dashboard-skeleton-create-card"
                  data-guide-anchor={!layoutReference ? "skeleton-primary-action" : undefined}
                  onClick={handleCreateBlankSkeleton}
                >
                  <span className="label-text">Manual layout</span>
                  <strong>Start from blank draw.io</strong>
                  <span>Open an empty canvas and draw the layout skeleton yourself.</span>
                </button>
                <div className="dashboard-skeleton-create-card dashboard-skeleton-generate-card">
                  <span className="label-text">Skeleton generation</span>
                  <strong>
                    {generatingSkeleton ? "Generating from chosen reference..." : "Generate from chosen layout reference"}
                  </strong>
                  <span>
                    Adapt the selected reference layout to the original prompt as an editable skeleton.
                  </span>
                  <span>Full module layout without generated connections.</span>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm dashboard-skeleton-generate-action"
                    data-guide-anchor={layoutReference ? "skeleton-primary-action" : undefined}
                    onClick={() => void handleGenerateSkeletonFromMain()}
                    disabled={generatingSkeleton || !layoutReference || prompt.trim().length === 0}
                    title={
                      !layoutReference
                        ? "Choose a layout reference first"
                        : prompt.trim().length === 0
                          ? "Add an original prompt first"
                          : undefined
                    }
                  >
                    {generatingSkeleton ? <><span className="ui-spinner" aria-hidden="true" />Generating…</> : "Generate candidate"}
                  </button>
                </div>
              </div>

              <div className="dashboard-skeleton-library-head">
                <div>
                  <span className="label-text">Saved skeleton pages</span>
                  <h3>{diagramSkeletonCandidates.length} candidates</h3>
                </div>
              </div>
              <div className="dashboard-skeleton-library">
                {diagramSkeletonCandidates.length === 0 ? (
                  <p className="dashboard-empty">No skeleton candidates yet. Create one above.</p>
                ) : (
                  diagramSkeletonCandidates.map((candidate) => {
                    const candidatePlan = candidate.xml
                      ? parseDrawioXmlToDiagramPlan(candidate.xml) ?? candidate.diagramPlan ?? null
                      : candidate.diagramPlan ?? null;
                    const isSelected = candidate.id === selectedDiagramSkeletonId;
                    const skeletonCanvasItem = canvasState.items.find(
                      (item) => item.type === "skeleton" && item.skeletonId === candidate.id && !item.deletedAt,
                    );
                    const linkedIconIds = Array.from(
                      new Set([...(skeletonCanvasItem?.sourceIconReferenceIds ?? []), skeletonCanvasItem?.sourceIconReferenceId].filter(Boolean) as string[]),
                    );
                    return (
                      <article
                        key={candidate.id}
                        className={`dashboard-skeleton-candidate ${isSelected ? "is-selected" : ""} ${drawerDragPayload?.type === "asset" && drawerDragPayload.assetKind === "icon" ? "is-icon-drop-target" : ""}`}
                        onDragOver={(event) => {
                          if (drawerDragPayload?.type !== "asset" || drawerDragPayload.assetKind !== "icon") return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "copy";
                        }}
                        onDrop={(event) => handleSkeletonCandidateDrop(candidate.id, event)}
                      >
                        <div className="dashboard-skeleton-candidate-preview">
                          {candidatePlan ? (
                            <LayoutPngPreview plan={candidatePlan} compact customIconReferences={customIconReferences} />
                          ) : candidate.mermaid ? (
                            <MermaidDiagramPreview source={candidate.mermaid} compact />
                          ) : (
                            <p className="dashboard-empty">Blank draw.io page</p>
                          )}
                        </div>
                        <div className="dashboard-skeleton-candidate-copy">
                          <span className="mono muted">{candidate.source ?? "draw.io"}</span>
                          <strong>{candidate.title}</strong>
                          <span>{candidate.referenceTitle}</span>
                          {linkedIconIds.length > 0 ? (
                            <div className="dashboard-skeleton-linked-icons">
                              {linkedIconIds.slice(0, 4).map((iconId) => {
                                const customIcon = customIconReferences.find((icon) => icon.id === iconId);
                                const presetIcon = scientificIconReferences.find((icon) => icon.id === iconId);
                                const src = customIcon?.cropDataUrl ?? (presetIcon ? scientificIconDataUrl(presetIcon.id) : null);
                                return (
                                  <span key={iconId} title={iconAssetTitle(iconId)}>
                                    {src ? <img src={src} alt="" /> : null}
                                  </span>
                                );
                              })}
                              <strong>{linkedIconIds.length} icon{linkedIconIds.length === 1 ? "" : "s"} linked</strong>
                            </div>
                          ) : (
                            <span className="dashboard-skeleton-drop-copy">
                              Select this skeleton to pair icons by clicking. Drag-and-drop remains available for advanced canvas composition.
                            </span>
                          )}
                        </div>
                        <div className="dashboard-skeleton-candidate-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleSelectSkeletonCandidate(candidate)}
                          >
                            {isSelected ? "Selected" : "Use skeleton"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              handleSelectSkeletonCandidate(candidate);
                              setSkeletonManagerOpen(false);
                              setDrawioOpen(true);
                            }}
                            disabled={!candidate.xml}
                          >
                            Edit draw.io
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm dashboard-skeleton-delete"
                            onClick={() => handleDeleteSkeletonCandidate(candidate.id)}
                            aria-label={`Delete ${candidate.title}`}
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;
  const controlPreviewItem = controlPreviewItemId
    ? visibleCanvasItems.find((item) => item.id === controlPreviewItemId && item.type === "control") ?? null
    : null;
  const controlPreviewModal =
    controlPreviewItem && portalReady
      ? createPortal(
          <div
            className="control-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm control preview"
            onClick={() => setControlPreviewItemId(null)}
          >
            <div className="control-preview-panel" onClick={(event) => event.stopPropagation()}>
              <div className="dashboard-workflow-modal-head">
                <div>
                  <span className="label-text">Confirm control</span>
                  <h2 className="h-section">{controlPreviewItem.controlTitle ?? "Confirm selected elements"}</h2>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setControlPreviewItemId(null)}>
                  Close
                </button>
              </div>
              <div className="control-preview-image">
                {controlPreviewItem.controlImageDataUrl ? (
                  <img src={controlPreviewItem.controlImageDataUrl} alt="Confirm control board" />
                ) : (
                  <p className="dashboard-empty">This confirm control has no screenshot preview.</p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (candidateMode !== "edit") return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeCandidateEditor();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [candidateMode, closeCandidateEditor]);

  function renderCanvasResizeHandle(item: CreativeCanvasItem) {
    if (selectedCanvasItem?.id !== item.id || item.locked) return null;
    return (
      <span
        className="creative-item-resize"
        role="presentation"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          prepareCanvasDragUndo(item.id);
          setDraggingCanvasItemId(null);
          setResizingCanvasItemId(item.id);
          selectCanvasItem(item.id);
          bringCanvasItemForward(item.id);
        }}
        onPointerMove={(event) => {
          if (resizingCanvasItemId !== item.id) return;
          event.preventDefault();
          event.stopPropagation();
          resizeCanvasItem(item.id, event.movementX, event.movementY);
        }}
        onPointerUp={(event) => {
          if (resizingCanvasItemId !== item.id) return;
          event.preventDefault();
          event.stopPropagation();
          setResizingCanvasItemId(null);
          clearPendingCanvasDragUndo();
        }}
        onPointerCancel={(event) => {
          if (resizingCanvasItemId !== item.id) return;
          event.preventDefault();
          event.stopPropagation();
          setResizingCanvasItemId(null);
          clearPendingCanvasDragUndo();
        }}
      />
    );
  }

  function renderCreativeCanvasItem(item: CreativeCanvasItem) {
    const selected = selectedCanvasItem?.id === item.id;
    if (item.type === "template") {
      const kind = item.templateKind ?? "layout";
      const meta = canvasTemplateMeta[kind];
      const templateGenerating = kind === "output" && generating;
      const templateProgressPreview = templateGenerating
        ? variantGenerationProgress?.previewImageDataUrl ?? variantGenerationProgress?.previewImageUrl ?? null
        : null;
      return (
        <article
          key={item.id}
          data-canvas-item-id={item.id}
          data-guide-anchor={kind === "skeleton" ? "skeleton-card" : kind === "output" ? "output-card" : undefined}
          className={`creative-item creative-template creative-template-${kind} ${selected ? "is-selected" : ""} ${templateGenerating ? "is-generating" : ""}`}
          style={{ left: item.x, top: item.y, width: item.w, height: item.h, zIndex: item.z }}
          onPointerMove={(event) => {
            if (draggingCanvasItemId !== item.id) return;
            moveCanvasItem(item.id, event.movementX, event.movementY);
          }}
          onPointerUp={() => {
            setDraggingCanvasItemId(null);
            clearPendingCanvasDragUndo();
          }}
          onPointerCancel={() => {
            setDraggingCanvasItemId(null);
            clearPendingCanvasDragUndo();
          }}
          onClick={(event) => {
            event.stopPropagation();
            selectCanvasItem(item.id);
            bringCanvasItemForward(item.id);
          }}
          onDoubleClick={() => handleOpenCanvasItemPreview(item)}
          onMouseEnter={() => setHoveredCanvasItemId(item.id)}
          onMouseLeave={() => clearHoveredCanvasItem(item.id)}
        >
          {renderCreativeItemToolbar(item)}
          {renderCanvasResizeHandle(item)}
          {renderCanvasCompositionCheckbox(item)}
          <header
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              prepareCanvasDragUndo(item.id);
              setDraggingCanvasItemId(item.id);
              selectCanvasItem(item.id);
              bringCanvasItemForward(item.id);
            }}
          >
            <span>{meta.label}</span>
          </header>
          <div className="creative-template-body">
            {templateProgressPreview ? (
              <div className="creative-template-live-preview">
                <img
                  key={`canvas-generation-progress-${variantGenerationProgress?.version ?? 0}`}
                  src={templateProgressPreview}
                  alt=""
                />
                {variantGenerationProgress?.phase === "refining" ? (
                  <span className="creative-template-live-status">
                    <span className="ui-spinner" aria-hidden="true" />
                    Draft locked · refining
                  </span>
                ) : null}
              </div>
            ) : templateGenerating ? <span className="creative-template-spinner" aria-hidden="true" /> : null}
            <strong>{templateGenerating ? variantGenerationProgress?.label ?? "Generating figure..." : item.templateTitle ?? meta.title}</strong>
            <span>{templateGenerating
              ? variantGenerationProgress
                ? `Step ${variantGenerationProgress.passIndex} of ${variantGenerationProgress.passCount}`
                : "The result will fill this slot automatically."
              : item.templateHint ?? meta.description}</span>
          </div>
        </article>
      );
    }

    if (item.type === "reference") {
      const reference = item.referenceId ? board.find((entry) => entry.id === item.referenceId) : null;
      if (!reference) return null;
      const active =
        (item.role === "layout" && layoutReferenceId === reference.id) ||
        (item.role === "style" && canvasFocusReferenceId === reference.id);
      const tilt = canvasItemTilt(item.id);
      const shape = canvasItemShape(item.id);
      return (
        <article
          key={item.id}
          data-canvas-item-id={item.id}
          data-guide-anchor="reference-card"
          className={`creative-item creative-reference creative-shape-${shape} ${selected ? "is-selected" : ""} ${active ? "is-active" : ""} ${selectedCanvasItemIdSet.has(item.id) ? "is-composition-selected" : ""}`}
          style={{ left: item.x, top: item.y, width: item.w, height: item.h, zIndex: item.z, transform: `rotate(${tilt}deg)` }}
          onPointerMove={(event) => {
            if (draggingCanvasItemId !== item.id) return;
            moveCanvasItem(item.id, event.movementX, event.movementY);
          }}
          onPointerUp={() => {
            setDraggingCanvasItemId(null);
            clearPendingCanvasDragUndo();
          }}
          onPointerCancel={() => {
            setDraggingCanvasItemId(null);
            clearPendingCanvasDragUndo();
          }}
          onClick={(event) => {
            event.stopPropagation();
            selectCanvasItem(item.id);
            bringCanvasItemForward(item.id);
          }}
          onDoubleClick={() => handleOpenCanvasItemPreview(item)}
          onMouseEnter={() => setHoveredCanvasItemId(item.id)}
          onMouseLeave={() => clearHoveredCanvasItem(item.id)}
        >
          {renderCreativeItemToolbar(item)}
          {renderCanvasResizeHandle(item)}
          {renderCanvasCompositionCheckbox(item)}
          <header
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              prepareCanvasDragUndo(item.id);
              setDraggingCanvasItemId(item.id);
              selectCanvasItem(item.id);
              bringCanvasItemForward(item.id);
            }}
          >
            <span>{item.role === "layout" ? "Layout reference" : "Style reference"}</span>
          </header>
          <div className="creative-item-image">
            {reference.thumbnailUrl ? <img src={reference.thumbnailUrl} alt="" draggable={false} /> : null}
          </div>
          {renderCreativeItemFooter(reference.title)}
        </article>
      );
    }

    if (item.type === "asset") {
      const icon = item.assetKind === "icon"
        ? scientificIconReferences.find((entry) => entry.id === item.assetId)
        : null;
      const customIcon = item.assetKind === "icon"
        ? customIconReferences.find((entry) => entry.id === item.assetId)
        : null;
      const font = item.assetKind === "font"
        ? figureFontReferences.find((entry) => entry.id === item.assetId)
        : null;
      const palette = item.assetKind === "palette"
        ? figurePaletteReferences.find((entry) => entry.id === item.assetId)
        : null;
      const active =
        (item.assetKind === "icon" && Boolean(item.assetId && selectedIconAssetIdSet.has(item.assetId))) ||
        (item.assetKind === "font" && fontReferenceId === item.assetId) ||
        (item.assetKind === "palette" && paletteReferenceId === item.assetId);
      if (!icon && !customIcon && !font && !palette && item.assetKind !== "palette" && item.assetKind !== "pattern") return null;
      const tilt = canvasItemTilt(item.id);
      const shape = canvasItemShape(item.id);
      const title = item.assetLabel ?? customIcon?.label ?? icon?.label ?? font?.label ?? palette?.label ?? "Asset";
      const customStyleCrop = isStyleCropReference(customIcon);
      const kindLabel =
        item.assetKind === "icon"
          ? customStyleCrop
            ? "Style crop"
            : "Icon reference"
          : item.assetKind === "font"
            ? "Font reference"
            : item.assetKind === "pattern"
              ? "Pattern reference"
              : "Palette reference";
      return (
        <article
          key={item.id}
          className={`creative-item creative-asset creative-asset-${item.assetKind} creative-shape-${shape} ${selected ? "is-selected" : ""} ${active ? "is-active" : ""} ${selectedCanvasItemIdSet.has(item.id) ? "is-composition-selected" : ""}`}
          style={{ left: item.x, top: item.y, width: item.w, height: item.h, zIndex: item.z, transform: `rotate(${tilt}deg)` }}
          onPointerMove={(event) => {
            if (draggingCanvasItemId !== item.id) return;
            moveCanvasItem(item.id, event.movementX, event.movementY);
          }}
          onPointerUp={() => {
            setDraggingCanvasItemId(null);
            clearPendingCanvasDragUndo();
          }}
          onPointerCancel={() => {
            setDraggingCanvasItemId(null);
            clearPendingCanvasDragUndo();
          }}
          onClick={(event) => {
            event.stopPropagation();
            selectCanvasItem(item.id);
            bringCanvasItemForward(item.id);
          }}
          onDoubleClick={() => selectCanvasItem(item.id)}
          onMouseEnter={() => setHoveredCanvasItemId(item.id)}
          onMouseLeave={() => clearHoveredCanvasItem(item.id)}
        >
          {renderCreativeItemToolbar(item)}
          {renderCanvasResizeHandle(item)}
          {renderCanvasCompositionCheckbox(item)}
          <header
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              prepareCanvasDragUndo(item.id);
              setDraggingCanvasItemId(item.id);
              selectCanvasItem(item.id);
              bringCanvasItemForward(item.id);
            }}
          >
            <span>{kindLabel}</span>
          </header>
          <div className="creative-item-asset">
            {icon ? <img src={scientificIconDataUrl(icon.id)} alt="" draggable={false} /> : null}
            {customIcon?.cropDataUrl ? <img src={customIcon.cropDataUrl} alt="" draggable={false} /> : null}
            {font ? (
              <div className="creative-font-sample" style={{ fontFamily: font.cssFamily }}>
                <strong>Multimodal Retrieval</strong>
                <span>Input - Planner - Evidence - Answer</span>
              </div>
            ) : null}
            {palette ? (
              <div className="creative-palette-sample">
                {(item.assetColors?.length ? item.assetColors : palette.colors).map((color) => (
                  <span key={color} style={{ background: color }} />
                ))}
              </div>
            ) : null}
            {!palette && item.assetKind === "palette" ? (
              <div className="creative-palette-sample">
                {(item.assetColors?.length ? item.assetColors : figurePaletteReferences[0].colors).map((color) => (
                  <span key={color} style={{ background: color }} />
                ))}
              </div>
            ) : null}
            {item.assetKind === "pattern" ? (
              <div className="creative-pattern-sample">
                <strong>{item.assetLabel ?? "Style pattern"}</strong>
                <span>{item.assetId?.replace(/^pattern-/, "").replaceAll("-", " ") ?? "visual motif"}</span>
              </div>
            ) : null}
          </div>
          {renderCreativeItemFooter(title)}
          {customIcon ? <span className="creative-custom-icon-badge">{customStyleCrop ? "Style crop" : "Extracted from style"}</span> : null}
        </article>
      );
    }

    if (item.type === "skeleton") {
      const candidate = item.skeletonId
        ? diagramSkeletonCandidates.find((entry) => entry.id === item.skeletonId)
        : null;
      if (!candidate) return null;
      const tilt = canvasItemTilt(item.id);
      const shape = canvasItemShape(item.id);
      const candidatePlan = candidate.xml
        ? parseDrawioXmlToDiagramPlan(candidate.xml) ?? candidate.diagramPlan ?? null
        : candidate.diagramPlan ?? null;
      const active = selectedDiagramSkeletonId === candidate.id;
      return (
        <article
          key={item.id}
          data-canvas-item-id={item.id}
          data-guide-anchor="skeleton-card"
          className={`creative-item creative-skeleton creative-shape-${shape} ${selected ? "is-selected" : ""} ${active ? "is-active" : ""} ${selectedCanvasItemIdSet.has(item.id) ? "is-composition-selected" : ""}`}
          style={{ left: item.x, top: item.y, width: item.w, height: item.h, zIndex: item.z, transform: `rotate(${tilt}deg)` }}
          onPointerMove={(event) => {
            if (draggingCanvasItemId !== item.id) return;
            moveCanvasItem(item.id, event.movementX, event.movementY);
          }}
          onPointerUp={() => {
            setDraggingCanvasItemId(null);
            clearPendingCanvasDragUndo();
          }}
          onPointerCancel={() => {
            setDraggingCanvasItemId(null);
            clearPendingCanvasDragUndo();
          }}
          onClick={(event) => {
            event.stopPropagation();
            selectCanvasItem(item.id);
            bringCanvasItemForward(item.id);
            openInlineSkeletonStudio(candidate);
          }}
          onDoubleClick={() => handleOpenCanvasItemPreview(item)}
          onMouseEnter={() => setHoveredCanvasItemId(item.id)}
          onMouseLeave={() => clearHoveredCanvasItem(item.id)}
        >
          {renderCreativeItemToolbar(item)}
          {renderCanvasResizeHandle(item)}
          {renderCanvasCompositionCheckbox(item)}
          <header
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              prepareCanvasDragUndo(item.id);
              setDraggingCanvasItemId(item.id);
              selectCanvasItem(item.id);
              bringCanvasItemForward(item.id);
            }}
          >
            <span>Skeleton</span>
            {item.sourceIconReferenceId ? <strong>icon linked</strong> : null}
          </header>
          <div className="creative-item-skeleton">
            {candidatePlan ? (
              <LayoutPngPreview
                plan={candidatePlan}
                compact
                focusedTargetIds={selected ? focusedStructurePreviewIds : []}
                iconBindings={selected
                  ? selectedCanvasPreviewIconBindings
                  : skeletonStyleApplications[candidate.id]?.nodeIconBindings ?? {}}
                customIconReferences={customIconReferences}
                onFocusTarget={selected ? setFocusedStructureTargetId : undefined}
              />
            ) : candidate.mermaid ? (
              <MermaidDiagramPreview source={candidate.mermaid} compact />
            ) : (
              <p className="dashboard-empty">Blank draw.io page</p>
            )}
          </div>
          {renderCreativeItemFooter(candidate.title)}
        </article>
      );
    }

    if (item.type === "control") {
      const tilt = canvasItemTilt(item.id);
      const shape = canvasItemShape(item.id);
      return (
        <article
          key={item.id}
          className={`creative-item creative-control creative-shape-${shape} ${selected ? "is-selected" : ""} ${selectedCanvasItemIdSet.has(item.id) ? "is-composition-selected" : ""}`}
          style={{ left: item.x, top: item.y, width: item.w, height: item.h, zIndex: item.z, transform: `rotate(${tilt}deg)` }}
          onPointerMove={(event) => {
            if (draggingCanvasItemId !== item.id) return;
            moveCanvasItem(item.id, event.movementX, event.movementY);
          }}
          onPointerUp={() => {
            setDraggingCanvasItemId(null);
            clearPendingCanvasDragUndo();
          }}
          onPointerCancel={() => {
            setDraggingCanvasItemId(null);
            clearPendingCanvasDragUndo();
          }}
          onClick={(event) => {
            event.stopPropagation();
            selectCanvasItem(item.id);
            bringCanvasItemForward(item.id);
          }}
          onDoubleClickCapture={(event) => {
            event.preventDefault();
            event.stopPropagation();
            selectCanvasItem(item.id);
            bringCanvasItemForward(item.id);
            handleOpenCanvasItemPreview(item);
          }}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            selectCanvasItem(item.id);
            bringCanvasItemForward(item.id);
            handleOpenCanvasItemPreview(item);
          }}
          onMouseEnter={() => setHoveredCanvasItemId(item.id)}
          onMouseLeave={() => clearHoveredCanvasItem(item.id)}
        >
          {renderCreativeItemToolbar(item)}
          {renderCanvasResizeHandle(item)}
          {renderCanvasCompositionCheckbox(item)}
          <header
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              prepareCanvasDragUndo(item.id);
              setDraggingCanvasItemId(item.id);
              selectCanvasItem(item.id);
              bringCanvasItemForward(item.id);
            }}
          >
            <span>Confirm Control</span>
            <strong>edited state</strong>
          </header>
          <div className="creative-item-image creative-item-control-image">
            {item.controlImageDataUrl ? (
              <img src={item.controlImageDataUrl} alt="" draggable={false} />
            ) : (
              <div className="creative-control-saved-state">
                <strong>Saved confirm state</strong>
                <span>Double-click to reopen bindings</span>
              </div>
            )}
          </div>
          {renderCreativeItemFooter(item.controlTitle ?? "Confirm selected elements")}
        </article>
      );
    }

    const variant = item.variantId ? variants.find((entry) => entry.id === item.variantId) : null;
    if (!variant) return null;
    const tilt = canvasItemTilt(item.id);
    const shape = canvasItemShape(item.id);
    const outputStage = item.outputStage ?? "final";
    const src = variantPreviewSrc(variant, outputStage);
    const outputTitle = outputStage === "draft" ? "Style/Layout Draft" : "Final Output";
    const hasSiblingOutputStage = visibleCanvasItems.some(
      (source) => source.id !== item.id && source.type === "output" && source.variantId === variant.id,
    );
    const active = selectedVariantId === variant.id && (!hasSiblingOutputStage || canvasState.selectedItemId === item.id);
    return (
      <article
        key={item.id}
        data-canvas-item-id={item.id}
        data-guide-anchor="output-card"
        className={`creative-item creative-output creative-shape-${shape} ${selected ? "is-selected" : ""} ${active ? "is-active" : ""} ${selectedCanvasItemIdSet.has(item.id) ? "is-composition-selected" : ""}`}
        style={{ left: item.x, top: item.y, width: item.w, height: item.h, zIndex: item.z, transform: `rotate(${tilt}deg)` }}
        onPointerMove={(event) => {
          if (draggingCanvasItemId !== item.id) return;
          moveCanvasItem(item.id, event.movementX, event.movementY);
        }}
        onPointerUp={() => {
          setDraggingCanvasItemId(null);
          clearPendingCanvasDragUndo();
        }}
        onPointerCancel={() => {
          setDraggingCanvasItemId(null);
          clearPendingCanvasDragUndo();
        }}
        onClick={(event) => {
          event.stopPropagation();
          selectCanvasItem(item.id);
          bringCanvasItemForward(item.id);
          setState((current) => ({ ...current, selectedVariantId: variant.id }));
        }}
        onDoubleClick={() => handleOpenCanvasItemPreview(item)}
        onMouseEnter={() => setHoveredCanvasItemId(item.id)}
        onMouseLeave={() => clearHoveredCanvasItem(item.id)}
      >
        {renderCreativeItemToolbar(item)}
        {renderCanvasResizeHandle(item)}
        {renderCanvasCompositionCheckbox(item)}
        <header
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            prepareCanvasDragUndo(item.id);
            setDraggingCanvasItemId(item.id);
            selectCanvasItem(item.id);
            bringCanvasItemForward(item.id);
          }}
        >
          <span>{outputTitle}</span>
          {item.sourceVariantId ? <strong>derived</strong> : null}
        </header>
        <div className="creative-item-image">
          {src ? <img src={src} alt="" draggable={false} /> : null}
        </div>
        {renderCreativeItemFooter(outputStage === "draft" ? `${variant.title} draft` : variant.title)}
      </article>
    );
  }

  function renderCreativeInspector() {
    if (!selectedCanvasItem) {
      return (
        <>
          <div className="creative-inspector-head">
            <span className="label-text">Inspector</span>
            <h2>Canvas actions</h2>
          </div>
          <p className="intent-details-copy">
            Drag layout or style references from the drawer onto the canvas, then select an item to configure it.
          </p>
          <InspectorActions
            primary={
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setActiveStage("content")}>
                Reference search
              </button>
            }
            secondary={
              <>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSkeletonManagerOpen(true)}>
                  Skeletons
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setState(createDemoWorkspaceState())}>
                  New participant
                </button>
              </>
            }
          />
        </>
      );
    }

    if (selectedCanvasItem.type === "template") {
      const kind = selectedCanvasItem.templateKind ?? "layout";
      const meta = canvasTemplateMeta[kind];
      const templateAction =
        kind === "layout" ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setDrawerTab("layout");
              setPocketRole("layout");
              updateCreativeCanvas((canvas) => ({ ...canvas, drawerCollapsed: false }), { trackUndo: false });
            }}
          >
            Show layout pocket
          </button>
        ) : kind === "style" ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setDrawerTab("style");
              setPocketRole("style");
              updateCreativeCanvas((canvas) => ({ ...canvas, drawerCollapsed: false }), { trackUndo: false });
            }}
          >
            Show style pocket
          </button>
        ) : kind === "skeleton" ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            data-guide-anchor="skeleton-primary-action"
            onClick={() => setSkeletonManagerOpen(true)}
          >
            Open Skeleton Manager
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleGenerateFromMain()}
            disabled={generating}
          >
            {generating ? <><span className="ui-spinner" aria-hidden="true" />Generating…</> : "Generate figure"}
          </button>
        );
      return (
        <>
          <div className="creative-inspector-head">
            <span className="label-text">Initial template</span>
            <h2>{selectedCanvasItem.templateTitle ?? meta.title}</h2>
          </div>
          <p className="intent-details-copy">
            {selectedCanvasItem.templateHint ?? meta.description}
          </p>
          <p className="intent-details-copy">
            This card is still empty. Choose a matching {meta.label.toLowerCase()} item to fill this exact slot.
          </p>
          <div className="intent-requirements">
            <span className="is-ok">Study scaffold</span>
            <span>{meta.label}</span>
          </div>
          <InspectorActions
            primary={templateAction}
            secondary={
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setActiveStage("content")}>
                Reference search
              </button>
            }
            danger={
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteCanvasItem(selectedCanvasItem.id)}>
                Remove
              </button>
            }
          />
        </>
      );
    }

    if (selectedCanvasItem.type === "reference" && selectedCanvasReference) {
      const role = selectedCanvasItem.role ?? "layout";
      return (
        <>
          <div className="creative-inspector-head">
            <span className="label-text">{role} reference</span>
            <h2>{selectedCanvasReference.title}</h2>
          </div>
          {selectedCanvasReference.thumbnailUrl ? (
            <img className="intent-details-preview" src={selectedCanvasReference.thumbnailUrl} alt="" />
          ) : null}
          <p className="intent-details-copy">{selectedCanvasReference.similarityReason}</p>
          <InspectorActions
            primary={
              role === "layout" ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  data-guide-anchor="skeleton-primary-action"
                  onClick={() => void handleGenerateSkeletonFromMain(selectedCanvasReference)}
                  disabled={generatingSkeleton}
                >
                  {generatingSkeleton ? "Generating skeleton..." : "Generate skeleton"}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => useCanvasReferenceAs("style", selectedCanvasReference)}
                >
                  Use style
                </button>
              )
            }
            secondary={
              <>
                {role === "layout" ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => useCanvasReferenceAs("layout", selectedCanvasReference)}
                  >
                    Use layout
                  </button>
                ) : null}
                {role === "layout" ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={openLayoutReferenceStage}>
                    Layout picker
                  </button>
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setActiveStage("style")}>
                    Style editor
                  </button>
                )}
              </>
            }
            danger={
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteCanvasItem(selectedCanvasItem.id)}>
                Remove
              </button>
            }
          />
        </>
      );
    }

    if (selectedCanvasItem.type === "asset") {
      const title =
        selectedCanvasItem.assetLabel ??
        selectedCanvasCustomIcon?.label ??
        selectedCanvasIcon?.label ??
        selectedCanvasFont?.label ??
        selectedCanvasPalette?.label ??
        "Asset";
      const selectedPaletteColors =
        selectedCanvasItem.assetKind === "palette"
          ? selectedCanvasItem.assetColors?.length
            ? selectedCanvasItem.assetColors
            : selectedCanvasPalette?.colors ?? figurePaletteReferences[0].colors
          : [];
      const selectedCustomStyleCrop = isStyleCropReference(selectedCanvasCustomIcon);
      return (
        <>
          <div className="creative-inspector-head">
            <span className="label-text">
              {selectedCanvasItem.assetKind === "icon" && selectedCustomStyleCrop
                ? "style crop"
                : `${selectedCanvasItem.assetKind} reference`}
            </span>
            <h2>{title}</h2>
          </div>
          {selectedCanvasIcon ? (
            <>
              <div className="creative-inspector-asset-preview">
                <img src={scientificIconDataUrl(selectedCanvasIcon.id)} alt="" />
              </div>
              <p className="intent-details-copy">{selectedCanvasIcon.description}</p>
              <div className="intent-requirements">
                <span className="is-ok">
                  {selectedCanvasIcon.source === "hichart"
                    ? "Project-authored SVG"
                    : `${selectedCanvasIcon.source} SVG`}
                </span>
                <span>{selectedCanvasIcon.license}</span>
                <span className={selectedIconReferenceIds.includes(selectedCanvasIcon.id) ? "is-ok" : ""}>
                  {selectedIconReferenceIds.includes(selectedCanvasIcon.id) ? "Selected" : selectedCanvasIcon.role}
                </span>
              </div>
            </>
          ) : null}
          {selectedCanvasCustomIcon?.cropDataUrl ? (
            <>
              <div className="creative-inspector-asset-preview creative-inspector-custom-icon">
                <img src={selectedCanvasCustomIcon.cropDataUrl} alt="" />
              </div>
              <p className="intent-details-copy">{selectedCanvasCustomIcon.description}</p>
              <div className="intent-requirements">
                <span className="is-ok">{selectedCustomStyleCrop ? "Style crop" : "Extracted from style"}</span>
                {selectedCanvasCustomIcon.tags.slice(0, 3).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </>
          ) : null}
          {selectedCanvasFont ? (
            <>
              <div className="font-reference-preview" style={{ fontFamily: selectedCanvasFont.cssFamily }}>
                <strong>Multimodal Retrieval Framework</strong>
                <span>Question - Image - Evidence - Answer</span>
              </div>
              <p className="intent-details-copy">{selectedCanvasFont.description}</p>
              <div className="intent-requirements">
                <span className="is-ok">SIL OFL stack</span>
                <span className={fontReferenceId === selectedCanvasFont.id ? "is-ok" : ""}>
                  {fontReferenceId === selectedCanvasFont.id ? "Selected" : selectedCanvasFont.tone}
                </span>
              </div>
            </>
          ) : null}
          {selectedCanvasItem.assetKind === "palette" ? (
            <>
              <div className="creative-inspector-palette">
                {selectedPaletteColors.map((color) => (
                  <span key={color} style={{ background: color }} title={color} />
                ))}
              </div>
              <p className="intent-details-copy">
                {selectedCanvasPalette?.description ?? "Palette extracted from a marked style region."}
              </p>
              <div className="intent-requirements">
                <span className="is-ok">Publication palette</span>
                <span className={selectedCanvasPalette && paletteReferenceId === selectedCanvasPalette.id ? "is-ok" : ""}>
                  {selectedCanvasPalette && paletteReferenceId === selectedCanvasPalette.id
                    ? "Selected"
                    : selectedCanvasPalette?.tone ?? "region crop"}
                </span>
              </div>
            </>
          ) : null}
          {selectedCanvasItem.assetKind === "pattern" ? (
            <>
              <div className="creative-pattern-sample creative-inspector-pattern">
                <strong>{selectedCanvasItem.assetLabel ?? "Style pattern"}</strong>
                <span>{selectedCanvasItem.assetId?.replace(/^pattern-/, "").replaceAll("-", " ") ?? "visual motif"}</span>
              </div>
              <p className="intent-details-copy">
                Pattern references capture recurring visual layout such as rounded panels, dashed groups, loop arrows, and callout rhythm.
              </p>
              <div className="intent-requirements">
                <span className="is-ok">Extracted from style</span>
                <span>visual motif</span>
              </div>
            </>
          ) : null}
          <InspectorActions
            primary={
              <button type="button" className="btn btn-primary btn-sm" onClick={() => useCanvasAsset(selectedCanvasItem)}>
                {selectedCanvasItem.assetKind === "icon"
                  ? selectedCustomStyleCrop
                    ? "Use crop"
                    : "Use icon"
                  : selectedCanvasItem.assetKind === "font"
                    ? "Use typography"
                    : selectedCanvasItem.assetKind === "pattern"
                      ? "Use pattern"
                    : "Use palette"}
              </button>
            }
            danger={
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteCanvasItem(selectedCanvasItem.id)}>
                Remove
              </button>
            }
          />
        </>
      );
    }

    if (selectedCanvasItem.type === "skeleton" && selectedCanvasSkeleton) {
      return (
        <>
          <div className="creative-inspector-head">
            <div>
              <span className="label-text">Skeleton</span>
              <h2>{selectedCanvasSkeleton.title}</h2>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => openInlineSkeletonStudio(selectedCanvasSkeleton)}
              disabled={!selectedCanvasSkeleton.xml}
            >
              Open Studio
            </button>
          </div>
          <StyleKitSummary
            kit={selectedCanvasSkeletonStyleApplication?.styleKitSnapshot ?? skeletonStyleReferenceSet}
            references={board}
            customIcons={customIconReferences}
            compact
            showAppearance={false}
            title="Skeleton style references"
            stale={selectedCanvasSkeletonStyleIsStale}
            applyLabel={selectedCanvasSkeletonStyleApplication
              ? selectedCanvasSkeletonStyleIsStale
                ? "Update this Skeleton"
                : "Reapply references"
              : "Apply to this Skeleton"}
            onApply={() => applyActiveStyleKitToSkeleton(selectedCanvasSkeleton)}
            onEdit={() => setActiveStage("style")}
          />
          <div
            className={dashboardSheetStyles.skeletonStructureInspector}
            data-guide-anchor="skeleton-inspector"
          >
            <div data-guide-anchor="icon-binding">
              <ScientificStructurePanel
                focusedModuleId={selectedStructureModuleId}
                onFocusModule={setFocusedStructureTargetId}
                diagramPlan={selectedCanvasSkeletonPlan}
                skeletonId={selectedCanvasSkeleton.id}
                presentation="mapping"
              />
            </div>
          </div>
          <InspectorActions
            primary={
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void handleGenerateFromMain()}
                disabled={generating}
              >
                {generating ? <><span className="ui-spinner" aria-hidden="true" />Generating…</> : "Review first generation"}
              </button>
            }
            secondary={
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => useCanvasSkeleton(selectedCanvasSkeleton)}>
                Use skeleton
              </button>
            }
            danger={
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteCanvasItem(selectedCanvasItem.id)}>
                Remove
              </button>
            }
          />
        </>
      );
    }

    if (selectedCanvasItem.type === "control") {
      return (
        <>
          <div className="creative-inspector-head">
            <span className="label-text">Confirm control</span>
            <h2>{selectedCanvasItem.controlTitle ?? "Confirm selected elements"}</h2>
          </div>
          <p className="intent-details-copy">
            This is the edited reference-binding state from the confirm page. It is kept as a visual checkpoint between the selected elements and the final output.
          </p>
          <InspectorActions
            primary={
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!selectedCanvasItem.controlSnapshot && !selectedCanvasItem.controlImageDataUrl}
                onClick={() => restoreSelectionConfirmFromControl(selectedCanvasItem)}
              >
                {selectedCanvasItem.controlSnapshot ? "Reopen selection" : "Open preview"}
              </button>
            }
            danger={
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteCanvasItem(selectedCanvasItem.id)}>
                Remove
              </button>
            }
          />
        </>
      );
    }

    if (selectedCanvasItem.type === "output" && selectedCanvasVariant) {
      const sourceSummary = [
        selectedCanvasItem.sourceReferenceId ? "Layout" : null,
        selectedCanvasItem.sourceStyleReferenceId ? "Style" : null,
        selectedCanvasItem.sourceSkeletonId ? "Skeleton" : null,
        selectedCanvasItem.sourceIconReferenceId ? "Icon" : null,
        selectedCanvasItem.sourceFontReferenceId ? "Font" : null,
        selectedCanvasItem.sourcePaletteReferenceId ? "Palette" : null,
      ].filter(Boolean);
      return (
        <>
          <div className="creative-inspector-head">
            <span className="label-text">Output</span>
            <h2>{selectedCanvasVariant.title}</h2>
          </div>
          <p className="intent-details-copy">{selectedCanvasVariant.description}</p>
          {sourceSummary.length > 0 ? (
            <div className="intent-requirements">
              {sourceSummary.map((label) => (
                <span key={label} className="is-ok">{label}</span>
              ))}
            </div>
          ) : null}
          <InspectorActions
            primary={
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() =>
                  void handleGenerateFromMain(
                    variantToReferenceItem(selectedCanvasVariant, prompt, selectedCanvasItem.outputStage ?? "final"),
                    selectedCanvasItem,
                  )
                }
                disabled={generating}
              >
                {generating ? <><span className="ui-spinner" aria-hidden="true" />Generating…</> : "Generate from figure"}
              </button>
            }
            secondary={
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  openVariantInEdit(selectedCanvasVariant.id);
                }}
              >
                Edit figure
              </button>
            }
            danger={
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteCanvasItem(selectedCanvasItem.id)}>
                Remove
              </button>
            }
          />
        </>
      );
    }

    return <p className="dashboard-empty">Selected canvas item is missing its source.</p>;
  }

  return (
    <div className="page dashboard-page">
      <div className="page-inner dashboard-inner">
        <section
          className={`creative-shell ${workspaceView === "studio" ? "is-studio" : "is-advanced-board"} ${canvasState.drawerCollapsed ? "is-drawer-collapsed" : ""} ${selectedCanvasItem?.type === "skeleton" ? "is-skeleton-selected" : ""} ${!selectedCanvasItem ? "is-inspector-hidden" : ""} ${inlineSkeletonEditing ? "is-inline-skeleton-editing" : ""} ${workspaceView === "studio" ? "is-primary-workspace" : ""} ${!showStudioSources ? dashboardSheetStyles.focusedWorkspaceShell : ""}`}
          aria-label={workspaceView === "studio" ? "HiFigure Studio" : "Advanced Board"}
        >
          <aside className="creative-drawer" data-guide-anchor="reference-drawer">
            <div className="creative-drawer-head">
              {!canvasState.drawerCollapsed ? (
                <div>
                  {workspaceView === "studio" ? (
                    <h2 className="h-section">Pocket</h2>
                  ) : (
                    <>
                      <span className="label-text">Advanced Board</span>
                      <h2 className="h-section">Asset drawer</h2>
                    </>
                  )}
                </div>
              ) : null}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  updateCreativeCanvas((canvas) => ({
                    ...canvas,
                    drawerCollapsed: !canvas.drawerCollapsed,
                  }))
                }
                title={canvasState.drawerCollapsed ? "Expand drawer" : "Collapse drawer"}
              >
                {canvasState.drawerCollapsed ? "›" : "‹"}
              </button>
            </div>
            {canvasState.drawerCollapsed ? (
              <div className="creative-drawer-mini">
                <button
                  type="button"
                  onClick={() => {
                    updateCreativeCanvas((canvas) => ({ ...canvas, drawerCollapsed: false }), { trackUndo: false });
                  }}
                  title="Open reference and asset library"
                >
                  Library
                </button>
              </div>
            ) : workspaceView === "studio" ? (
              <div className={dashboardSheetStyles.studioSourceList}>
                {studioSourceGroups.map(({ role, label, references, selectedId }) => {
                  const sourceGrid = (
                    <div className={dashboardSheetStyles.studioSourceGrid}>
                      {references.map((item) => {
                        const skeletonUsesLayout = role === "layout" && selectedSkeleton?.referenceId === item.id;
                        const syncsWithStage = studioStageOwnsSourceRole(role);
                        const alreadySelected = item.id === selectedId;
                        const isPreviewing =
                          studioSourcePreviewRequest?.role === role &&
                          studioSourcePreviewRequest.referenceId === item.id;
                        const openHint = syncsWithStage
                          ? alreadySelected
                            ? `${item.title} — current ${role} reference`
                            : `Preview ${item.title} in the ${role} workspace`
                          : `Show ${item.title} in Retrieval`;
                        return (
                          <div
                            key={`${role}-${item.id}`}
                            className={dashboardSheetStyles.studioSourceCard}
                          >
                            <button
                              type="button"
                              className={`${dashboardSheetStyles.studioSourcePreview} ${item.id === selectedId ? dashboardSheetStyles.isSelected : ""} ${
                                skeletonUsesLayout ? dashboardSheetStyles.skeletonLayoutInUse : ""
                              } ${
                                isPreviewing ? dashboardSheetStyles.isPreviewing : ""
                              } ${
                                retrievalPocketFocus?.referenceId === item.id && retrievalPocketFocus.role === role
                                  ? dashboardSheetStyles.isRetrievalFocused
                                  : ""
                              }`}
                              onClick={() => openStudioSource(item, role)}
                              aria-label={`${openHint}${skeletonUsesLayout ? "; currently used by Skeleton" : ""}`}
                              title={skeletonUsesLayout ? `${item.title} — currently used by Skeleton` : openHint}
                            >
                              {item.imageDataUrl || item.thumbnailUrl ? (
                                <img src={item.imageDataUrl || item.thumbnailUrl || undefined} alt="" />
                              ) : <span className={dashboardSheetStyles.studioSourceGlyph} aria-hidden="true" />}
                              {skeletonUsesLayout ? (
                                <span className={dashboardSheetStyles.skeletonLayoutBadge} aria-hidden="true">
                                  <svg viewBox="0 0 16 16">
                                    <path d="m3.5 8.2 2.7 2.7 6.3-6.2" />
                                  </svg>
                                </span>
                              ) : null}
                            </button>
                            <button
                              type="button"
                              className="pocket-zoom-btn"
                              onClick={() => setPocketZoomReference(item)}
                              aria-label={`Enlarge ${item.title}`}
                              title="View enlarged"
                            >
                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                                <circle cx="11" cy="11" r="7" />
                                <path d="m20 20-3.5-3.5" />
                                <path d="M11 8v6M8 11h6" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className={dashboardSheetStyles.studioSourceRemove}
                              onClick={() => removeFromDashboardPocket(item, role)}
                              aria-label={`Remove ${item.title} from ${role} pocket`}
                              title={`Remove from ${role} pocket`}
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                  const sourceLabel = (
                    <span className={dashboardSheetStyles.studioSourceLabel}>
                      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                        {role === "layout" ? (
                          <>
                            <rect x="7" y="2.75" width="6" height="4.25" rx="1" />
                            <rect x="2.5" y="13" width="6" height="4.25" rx="1" />
                            <rect x="11.5" y="13" width="6" height="4.25" rx="1" />
                            <path d="M10 7v3.25M5.5 13v-2.75h9V13" />
                          </>
                        ) : (
                          <>
                            <path d="M10 2.75a7.25 7.25 0 1 0 0 14.5h1.15a1.7 1.7 0 0 0 1.2-2.9l-.25-.25a1.35 1.35 0 0 1 .95-2.3h1.2A3 3 0 0 0 17.25 9 7.25 7.25 0 0 0 10 2.75Z" />
                            <circle cx="6.4" cy="8.1" r=".85" />
                            <circle cx="8.7" cy="5.9" r=".85" />
                            <circle cx="12" cy="6.1" r=".85" />
                          </>
                        )}
                      </svg>
                      <span className="label-text">{label}</span>
                    </span>
                  );
                  const categoryProps = {
                    className: dashboardSheetStyles.studioSourceCategory,
                    "data-source-role": role,
                    "data-guide-anchor": role === "style" ? "style-source-list" : undefined,
                  };
                  return showBothStudioSourceCategories ? (
                    <details
                      key={role}
                      {...categoryProps}
                      open={studioSourceCategoriesOpen[role]}
                      onToggle={(event) => {
                        const open = (event.currentTarget as HTMLDetailsElement).open;
                        setStudioSourceCategoriesOpen((current) => ({ ...current, [role]: open }));
                      }}
                    >
                      <summary>{sourceLabel}</summary>
                      {sourceGrid}
                    </details>
                  ) : (
                    <section key={role} {...categoryProps}>
                      {sourceLabel}
                      {sourceGrid}
                    </section>
                  );
                })}
              </div>
            ) : (
              <>
                <div className="dashboard-pocket-tabs" aria-label="Pocket type">
                  {(["layout", "style"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={`dashboard-pocket-tab ${drawerTab === tab ? "is-active" : ""}`}
                      onClick={() => selectDrawerTab(tab)}
                    >
                      <span>{drawerTabLabel(tab)}</span>
                      <strong>{drawerTabCount(tab)}</strong>
                    </button>
                  ))}
                </div>
                <input
                  className="creative-pocket-search"
                  value={pocketSearch}
                  onChange={(event) => setPocketSearch(event.target.value)}
                  placeholder="Search pocket references..."
                />
                {(drawerTab === "layout" || drawerTab === "style") && pocketTags.length > 0 ? (
                  <div className="dashboard-pocket-filters" aria-label="Pocket tag filters">
                    <button
                      type="button"
                      className={`dashboard-pocket-filter ${pocketTagFilter === "all" ? "is-active" : ""}`}
                      onClick={() => setPocketTagFilter("all")}
                    >
                      All
                    </button>
                    {pocketTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={`dashboard-pocket-filter ${pocketTagFilter === tag ? "is-active" : ""}`}
                        onClick={() => setPocketTagFilter(tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                ) : null}
                {drawerTab === "icons" ? (
                  <div className="dashboard-pocket-filters" aria-label="Icon role filters">
                    <button
                      type="button"
                      className={`dashboard-pocket-filter ${assetFilter === "all" ? "is-active" : ""}`}
                      onClick={() => setAssetFilter("all")}
                    >
                      All
                    </button>
                    {iconRoles.map((role) => (
                      <button
                        key={role}
                        type="button"
                        className={`dashboard-pocket-filter ${assetFilter === role ? "is-active" : ""}`}
                        onClick={() => setAssetFilter(role)}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                ) : null}
                {drawerTab === "fonts" ? (
                  <div className="dashboard-pocket-filters" aria-label="Font tone filters">
                    <button
                      type="button"
                      className={`dashboard-pocket-filter ${assetFilter === "all" ? "is-active" : ""}`}
                      onClick={() => setAssetFilter("all")}
                    >
                      All
                    </button>
                    {fontTones.map((tone) => (
                      <button
                        key={tone}
                        type="button"
                        className={`dashboard-pocket-filter ${assetFilter === tone ? "is-active" : ""}`}
                        onClick={() => setAssetFilter(tone)}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>
                ) : null}
                {drawerTab === "palettes" ? (
                  <div className="dashboard-pocket-filters" aria-label="Palette tone filters">
                    <button
                      type="button"
                      className={`dashboard-pocket-filter ${assetFilter === "all" ? "is-active" : ""}`}
                      onClick={() => setAssetFilter("all")}
                    >
                      All
                    </button>
                    {paletteTones.map((tone) => (
                      <button
                        key={tone}
                        type="button"
                        className={`dashboard-pocket-filter ${assetFilter === tone ? "is-active" : ""}`}
                        onClick={() => setAssetFilter(tone)}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="creative-pocket-list">
                  {(drawerTab === "layout" || drawerTab === "style") && filteredPocketItems.length === 0 ? (
                    <p className="dashboard-empty">No {pocketRole} references match.</p>
                  ) : null}
                  {drawerTab === "layout" || drawerTab === "style" ? (
                    filteredPocketItems.map((item) => (
                      <article
                        key={item.id}
                        className={`creative-pocket-card ${drawerDragPayload?.type === "reference" && drawerDragPayload.role === pocketRole ? "is-dragging" : ""}`}
                        draggable
                        onDragStart={(event) => handlePocketDragStart(item, pocketRole, event)}
                        onDragEnd={handlePocketDragEnd}
                        onClick={() => {
                          if (selectedCanvasItem?.type === "template" && selectedCanvasItem.templateKind === pocketRole) {
                            placeReferenceOnCanvas(item, pocketRole);
                          } else {
                            setPocketPreviewReference(item);
                          }
                        }}
                      >
                        <div>
                          {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" draggable={false} /> : null}
                        </div>
                        <strong>{item.title}</strong>
                        <span>{pocketRole} · drag to canvas</span>
                        <button
                          type="button"
                          className="creative-pocket-delete creative-pocket-reference-delete"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeFromDashboardPocket(item, pocketRole);
                          }}
                          aria-label={`Remove ${item.title} from ${pocketRole} pocket`}
                          title={`Remove from ${pocketRole} pocket`}
                        >
                          Remove from {pocketRole === "layout" ? "Layout" : "Style"} pocket
                        </button>
                      </article>
                    ))
                  ) : null}
                  {drawerTab === "crops" ? (
                    filteredStyleCrops.length > 0 ? (
                      filteredStyleCrops.map((asset) => (
                        <article
                          key={asset.id}
                          className={`creative-pocket-card creative-pocket-asset creative-pocket-custom-icon ${selectedIconAssetIdSet.has(asset.id) ? "is-active" : ""} ${drawerDragPayload?.type === "asset" && drawerDragPayload.assetId === asset.id ? "is-dragging" : ""}`}
                          draggable
                          onDragStart={(event) => handleAssetDragStart("icon", asset.id, event)}
                          onDragEnd={handlePocketDragEnd}
                          onClick={() => selectCustomIconReference(asset)}
                        >
                          <div className="creative-pocket-icon">
                            {asset.cropDataUrl ? <img src={asset.cropDataUrl} alt="" draggable={false} /> : null}
                          </div>
                          <strong>{asset.label}</strong>
                          <span>Style crop · optional advanced canvas asset</span>
                          <button
                            type="button"
                            className="creative-pocket-delete"
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteCustomIconReference(asset);
                            }}
                          >
                            Delete
                          </button>
                        </article>
                      ))
                    ) : (
                      <p className="dashboard-empty">No style crops saved yet.</p>
                    )
                  ) : null}
                  {drawerTab === "icons" ? (
                    <>
                      {filteredCustomIcons.map((asset) => {
                        return (
                        <article
                          key={asset.id}
                          className={`creative-pocket-card creative-pocket-asset creative-pocket-custom-icon ${selectedIconAssetIdSet.has(asset.id) ? "is-active" : ""} ${drawerDragPayload?.type === "asset" && drawerDragPayload.assetId === asset.id ? "is-dragging" : ""}`}
                          draggable
                          onDragStart={(event) => handleAssetDragStart("icon", asset.id, event)}
                          onDragEnd={handlePocketDragEnd}
                          onClick={() => selectCustomIconReference(asset)}
                        >
                          <div className="creative-pocket-icon">
                            {asset.cropDataUrl ? <img src={asset.cropDataUrl} alt="" draggable={false} /> : null}
                          </div>
                          <strong>{asset.label}</strong>
                          <span>{customIconKind(asset) === "style-crop" ? "Style crop" : "Custom icon"} · click to use in Skeleton</span>
                          <button
                            type="button"
                            className="creative-pocket-delete"
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteCustomIconReference(asset);
                            }}
                          >
                            Delete
                          </button>
                        </article>
                        );
                      })}
                      {visibleDrawerIcons.map((asset) => (
                        <article
                          key={asset.id}
                          className={`creative-pocket-card creative-pocket-asset ${selectedIconAssetIdSet.has(asset.id) ? "is-active" : ""} ${drawerDragPayload?.type === "asset" && drawerDragPayload.assetKind === "icon" ? "is-dragging" : ""}`}
                          draggable
                          onDragStart={(event) => handleAssetDragStart("icon", asset.id, event)}
                          onDragEnd={handlePocketDragEnd}
                          onClick={() => toggleIconReference(asset)}
                        >
                          <div className="creative-pocket-icon">
                            <img src={scientificIconDataUrl(asset.id)} alt="" draggable={false} />
                          </div>
                          <strong>{asset.label}</strong>
                          <span>Click to use · advanced drag</span>
                        </article>
                      ))}
                      {visibleDrawerIcons.length < filteredIcons.length ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm creative-pocket-show-more"
                          onClick={() => setDrawerIconLimit((current) => Math.min(current + 80, filteredIcons.length))}
                        >
                          Show more icons ({filteredIcons.length - visibleDrawerIcons.length} remaining)
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {drawerTab === "fonts" ? (
                    filteredFonts.map((font) => {
                      const preview = fontPocketPreview(font.id);
                      return (
                        <article
                          key={font.id}
                          className={`creative-pocket-card creative-pocket-asset ${drawerDragPayload?.type === "asset" && drawerDragPayload.assetKind === "font" ? "is-dragging" : ""}`}
                          draggable
                          onDragStart={(event) => handleAssetDragStart("font", font.id, event)}
                          onDragEnd={handlePocketDragEnd}
                        >
                          <div className="creative-pocket-font" style={{ fontFamily: font.cssFamily }}>
                            <strong style={{ fontWeight: preview.weight, fontSize: preview.size }}>{preview.primary}</strong>
                            <span>{preview.secondary}</span>
                          </div>
                          <strong>{font.label}</strong>
                          <span>{font.tone} · drag to canvas</span>
                        </article>
                      );
                    })
                  ) : null}
                  {drawerTab === "palettes" ? (
                    filteredPalettes.map((palette) => (
                      <article
                        key={palette.id}
                        className={`creative-pocket-card creative-pocket-asset ${drawerDragPayload?.type === "asset" && drawerDragPayload.assetKind === "palette" ? "is-dragging" : ""}`}
                        draggable
                        onDragStart={(event) => handleAssetDragStart("palette", palette.id, event)}
                        onDragEnd={handlePocketDragEnd}
                      >
                        <div className="creative-pocket-palette">
                          {palette.colors.map((color) => (
                            <span key={color} style={{ background: color }} />
                          ))}
                        </div>
                        <strong>{palette.label}</strong>
                        <span>{palette.tone} · drag to canvas</span>
                      </article>
                    ))
                  ) : null}
                </div>
              </>
            )}
          </aside>

          <main className={`creative-canvas-panel ${workspaceView === "studio" ? dashboardSheetStyles.withIdeaRail : ""}`}>
            <header className={`creative-toolbar ${workspaceView === "studio" ? dashboardSheetStyles.studioToolbar : ""}`}>
              <div className={dashboardSheetStyles.compactHeaderTitle}>
                <h1>{workspaceView === "studio" ? activeStageLabel : "Advanced Board"}</h1>
              </div>
              <div className={dashboardSheetStyles.compactHeaderActions}>
                {toolbarAccessory}
                {workspaceView === "advanced-board" ? <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={undoCreativeCanvasStep}
                  disabled={activeCanvasUndoStack.length === 0}
                  title="Undo last canvas step"
                >
                  Undo
                </button> : null}
                {state.reviewResult.length ? (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={openReviewWorkspace}>
                    {state.reviewResult.length} issue{state.reviewResult.length === 1 ? "" : "s"}
                  </button>
                ) : null}
              </div>
            </header>
            {workspaceView === "studio" ? (
              <IdeaSparkNavigator
                activeStep={activeIdeaSparkStep}
                generation={ideaSparkGenerationStatus}
                onOpenStep={openIdeaSparkStep}
              />
            ) : null}
            {workflowWorkspace}
            {workspaceView === "advanced-board" ? (
            <div
              className={dashboardSheetStyles.canvasWorkspaceLayer}
            >
            {inlineSkeletonEditing && selectedCanvasSkeleton?.xml ? (
              <section className="inline-skeleton-studio" aria-label="Skeleton editing and icon mapping">
                <header className="inline-skeleton-studio-head">
                  <div>
                    <span className="label-text">Skeleton Studio</span>
                    <h2>{selectedCanvasSkeleton.title}</h2>
                    <p>Draw.io edits and text–icon choices stay visible together. Changes are saved automatically.</p>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDrawioOpen(false)}>
                    Back to canvas
                  </button>
                </header>
                <div className="inline-skeleton-studio-grid">
                  <section className="inline-drawio-pane">
                    <header>
                      <div><strong>Edit skeleton</strong><small>Move, rename, reconnect, or add nodes in Draw.io</small></div>
                      <span className="badge">Auto-save</span>
                    </header>
                    <DrawioEmbed
                      xml={selectedCanvasSkeleton.xml}
                      height={720}
                      onChange={(xml) => handleSkeletonXmlChange(selectedCanvasSkeleton.id, xml)}
                    />
                  </section>
                  <section className="inline-icon-mapping-pane" data-guide-anchor="icon-binding">
                    <StyleKitSummary
                      kit={selectedCanvasSkeletonStyleApplication?.styleKitSnapshot ?? skeletonStyleReferenceSet}
                      references={board}
                      customIcons={customIconReferences}
                      compact
                      showAppearance={false}
                      title="Skeleton style references"
                      stale={selectedCanvasSkeletonStyleIsStale}
                      applyLabel={selectedCanvasSkeletonStyleApplication
                        ? selectedCanvasSkeletonStyleIsStale
                          ? "Update this Skeleton"
                          : "Reapply references"
                        : "Apply to this Skeleton"}
                      onApply={() => applyActiveStyleKitToSkeleton(selectedCanvasSkeleton)}
                      onEdit={() => setActiveStage("style")}
                    />
                    <ScientificStructurePanel
                      focusedModuleId={focusedStructureTargetId}
                      onFocusModule={setFocusedStructureTargetId}
                      diagramPlan={selectedCanvasSkeletonPlan}
                      skeletonId={selectedCanvasSkeleton.id}
                      presentation="mapping"
                    />
                  </section>
                </div>
              </section>
            ) : (
            <div className="creative-canvas-scroll">
              <div
                className="creative-canvas"
                data-guide-anchor="canvas"
                style={{ width: creativeCanvasDynamicWidth, height: creativeCanvasDynamicHeight }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                  if (drawerDragPayload) {
                    setCanvasDropLabel(
                      drawerDragPayload.type === "reference"
                        ? `${drawerDragPayload.role} reference`
                        : `${drawerDragPayload.assetKind} reference`,
                    );
                  }
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCanvasDropLabel(null);
                }}
                onDrop={handleCanvasDrop}
                onContextMenu={openCreativeCanvasContextMenu}
                onClick={() => {
                  selectCanvasItem(null);
                  setCreativeCanvasContextMenu(null);
                }}
              >
                {creativeCanvasContextMenu ? (
                  <div
                    className="intent-context-menu creative-canvas-context-menu"
                    style={{ left: creativeCanvasContextMenu.x, top: creativeCanvasContextMenu.y }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <span className="label-text">New blank card</span>
                    <button
                      type="button"
                      onClick={() => addBlankTemplateToCanvas("layout", {
                        x: creativeCanvasContextMenu.canvasX,
                        y: creativeCanvasContextMenu.canvasY,
                      })}
                    >
                      <span>Layout reference</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => addBlankTemplateToCanvas("style", {
                        x: creativeCanvasContextMenu.canvasX,
                        y: creativeCanvasContextMenu.canvasY,
                      })}
                    >
                      <span>Style reference</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => addBlankTemplateToCanvas("skeleton", {
                        x: creativeCanvasContextMenu.canvasX,
                        y: creativeCanvasContextMenu.canvasY,
                      })}
                    >
                      <span>Skeleton</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => addBlankTemplateToCanvas("output", {
                        x: creativeCanvasContextMenu.canvasX,
                        y: creativeCanvasContextMenu.canvasY,
                      })}
                    >
                      <span>Output</span>
                    </button>
                  </div>
                ) : null}
                {canvasDropLabel ? (
                  <div className="creative-drop-hint">
                    Drop as {canvasDropLabel}
                  </div>
                ) : null}
                {visibleCanvasItems.length === 0 ? (
                  <div className="creative-canvas-empty">
                    <strong>Drag references here</strong>
                    <span>Pull references or assets from the drawer, then choose Use on cards to generate.</span>
                  </div>
                ) : null}
                {renderCreativeProvenanceLines()}
                {visibleCanvasItems.map((item) => renderCreativeCanvasItem(item))}
              </div>
            </div>
            )}
            </div>
            ) : null}
          </main>
          {workspaceView === "advanced-board" && !inlineSkeletonEditing && selectedCanvasItem ? <aside className="creative-inspector" data-guide-anchor="inspector">
            <section className="selected-item-inspector">
              {renderCreativeInspector()}
            </section>
          </aside> : null}
        </section>
      </div>
      {selectionConfirmModal}
      {pocketManagerModal}
      {pocketZoomModal}
      {candidateRailZoomModal}
      {skeletonEditorModal}
      {candidateEditorModal}
      {skeletonManagerModal}
      {controlPreviewModal}
      {candidatePromptConfirmation ? (
        <SkeletonPromptConfirmDialog
          generationLabel="Candidate"
          referenceTitle={candidatePromptConfirmation.referenceTitle}
          value={candidatePromptConfirmation.value}
          onChange={(value) => setCandidatePromptConfirmation((current) => current ? { ...current, value } : current)}
          onCancel={() => closeCandidatePromptConfirmation(null)}
          onConfirm={() => {
            const value = candidatePromptConfirmation.value.trim();
            if (value) closeCandidatePromptConfirmation({
              prompt: value,
            });
          }}
        />
      ) : null}
      {skeletonPromptConfirmation ? (
        <SkeletonPromptConfirmDialog
          referenceTitle={skeletonPromptConfirmation.referenceTitle}
          value={skeletonPromptConfirmation.value}
          onChange={(value) => setSkeletonPromptConfirmation((current) => current ? { ...current, value } : current)}
          onCancel={() => closeSkeletonPromptConfirmation(null)}
          onConfirm={() => {
            const value = skeletonPromptConfirmation.value.trim();
            if (value) closeSkeletonPromptConfirmation({
              prompt: value,
            });
          }}
        />
      ) : null}
    </div>
  );
}
