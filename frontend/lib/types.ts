import type { FigureFontReferenceId, ScientificIconReferenceId } from "./scientific-assets";

export type RetrievalDomain =
  | "idea_overview"
  | "structure_overview"
  | "style_overview";

export type SearchGoal = "idea" | "structure" | "style";

/**
 * include = preserve CONTENT shown in this region
 * exclude = AVOID this content (legacy)
 * modify  = prioritize LOCAL edits roughly matching this rectangle on the reference
 * style   = match palette / line weight / typography only — do NOT depict
 */
export type RegionIntent = "include" | "exclude" | "style" | "modify";

export type ReferenceRegion = {
  id: string;
  referenceId: string;
  intent?: RegionIntent;
  /** Normalized 0–1, relative to displayed image bounds */
  x: number;
  y: number;
  w: number;
  h: number;
  label: string | null;
  paletteEnabled?: boolean;
  iconEnabled?: boolean;
  fontEnabled?: boolean;
  extractedColors?: string[];
  suggestedIconId?: ScientificIconReferenceId;
  suggestedFontId?: FigureFontReferenceId;
  ingredientAnalysisStatus?: "local" | "analyzing" | "llm" | "fallback" | "error";
  matchedPresetIconId?: ScientificIconReferenceId;
  detectedIcon?: DetectedIconCandidate | null;
  selectedIconSource?: "preset" | "detected";
  customIconId?: string;
};

export type DetectedIconCandidate = {
  label: string;
  tags: string[];
  description: string;
  cropDataUrl: string;
  /** IndexedDB key used when the crop payload is omitted from localStorage. */
  cropStorageKey?: string | null;
  bbox?: { x: number; y: number; w: number; h: number } | null;
  matchedPresetIconId?: ScientificIconReferenceId | null;
  confidence?: number | null;
  source?: "image-crop" | string | null;
};

export type CustomIconReference = {
  id: string;
  label: string;
  tags: string[];
  description: string;
  cropDataUrl: string;
  /** IndexedDB key used when the crop payload is omitted from localStorage. */
  cropStorageKey?: string | null;
  sourceReferenceId: string;
  sourceRegionId: string;
  /** Explicit frontend-only classification. Older workspaces are normalized from the stable id prefix. */
  kind?: "icon" | "style-crop";
  /** Stable content fingerprint used to invalidate review when a crop is replaced under the same id. */
  contentHash?: string;
  createdAt?: string;
  /** The automatic source candidate was replaced by an explicit re-analysis. */
  stale?: boolean;
};

export type StyleFontCandidate = {
  id: FigureFontReferenceId;
  label?: string | null;
  description?: string | null;
  confidence?: number | null;
  reason?: string | null;
};

export type StylePatternCandidate = {
  id:
    | "pattern-rounded-modules"
    | "pattern-dashed-groups"
    | "pattern-loop-flow"
    | "pattern-callout-strip"
    | "pattern-icon-label-pairs";
  label?: string | null;
  description?: string | null;
  confidence?: number | null;
  reason?: string | null;
};

export type ReferenceItem = {
  id: string;
  title: string;
  sourcePaper: string;
  venue: string;
  year: number;
  imageType: string;
  subject: string;
  styleTags: string[];
  similarityReason: string;
  /** Short label or emoji when no image is set */
  thumbnail: string;
  /** Optional cover image for cards and boards */
  thumbnailUrl?: string | null;
  /** Ephemeral image payload sent only when generating from local references */
  imageDataUrl?: string | null;
  structuralAnalysis: string;
};

export type DiagramNode = {
  id: string;
  label: string;
  role?: string;
  shape?: string | null;
  groupId?: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  semanticId?: string | null;
  confirmed?: boolean;
  storyRole?: "input" | "transformation" | "contribution" | "decision" | "output" | "helper" | string;
  importanceTier?: "primary" | "secondary" | "annotation" | string;
  componentStatus?: "standard" | "proposed" | "trainable" | "frozen" | "training_only" | "inference_only" | string;
  visualUnit?: "input" | "module" | "signal" | "score" | "decision" | "outcome" | "annotation" | string;
  visualRole?: "input" | "standard_component" | "tensor_transform" | "decision" | "proposed" | "output" | "annotation" | "panel" | string;
  branchId?: string | null;
  labelLevel?: "key_module" | "body" | "annotation" | string;
  fontSize?: number;
  paperFontSize?: number;
  predictedLabelLines?: number;
  portDemand?: number;
  routingClearance?: number;
};

export type DiagramEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  kind?: string;
  lineStyle?: "solid" | "dashed";
  sourcePort?: "north" | "south" | "east" | "west";
  targetPort?: "north" | "south" | "east" | "west";
  points?: Array<{ x: number; y: number }>;
  routingStyle?: "bundled" | "gateway-bundled" | string;
  semanticId?: string | null;
  confirmed?: boolean;
};

export type ReviewIssue = {
  id: string;
  category: "scientific" | "visual";
  severity: "blocking" | "warning" | "info";
  message: string;
  targetIds: string[];
  suggestedAction: string;
  acknowledged?: boolean;
};

export type DiagramPlan = {
  title: string;
  narrative?: string;
  width: number;
  height: number;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  hierarchicalLayoutApplied?: boolean;
  hierarchicalPanels?: Array<{
    panelId: string;
    direction: string;
    requestedDirection?: string;
    layers: string[][];
    storyRoles?: string[];
    branchIds?: string[];
    contributionModuleIds?: string[];
    importanceWeight?: number;
  }>;
  compositionContract?: Record<string, string | number | boolean>;
  routingReadiness?: {
    edgeCount: number;
    routedEdgeCount: number;
    bundledEdgeCount: number;
    feedbackEdgeCount: number;
    maximumTurnCount: number;
    portHotspots: string[];
    issueCount: number;
    issues: string[];
  };
  layoutValidationPassed?: boolean;
  style?: {
    background?: string;
    accent?: string;
    secondary?: string;
    text?: string;
    typography?: string;
  };
};

export type StyleSummary = {
  layoutPreference: string;
  palette: string;
  componentStyle: string;
  arrowStyle: string;
  notes: string[];
};

export type FigureVariant = {
  id: string;
  title: string;
  description: string;
  layoutStrategy: string;
  sourceVariantId?: string | null;
  /** Edit revisions stay available as History tombstones after removal. */
  deletedAt?: string | null;
  previewImageUrl?: string | null;
  previewImageDataUrl?: string | null;
  draftPreviewImageUrl?: string | null;
  draftPreviewImageDataUrl?: string | null;
  svg: string;
  generationPrompt?: string | null;
  draftGenerationPrompt?: string | null;
  diagramPlan?: DiagramPlan | null;
};

/** One applied skeleton refinement; xmlBefore restores the skeleton to the state before it ran. */
export type SkeletonRegionRevision = {
  id: string;
  createdAt: string;
  instruction: string;
  targetLabel: string;
  scope?: "module" | "whole" | "arrow";
  xmlBefore: string;
};

export type DiagramSkeletonCandidate = {
  id: string;
  title: string;
  referenceId: string | null;
  referenceTitle: string;
  createdAt: string;
  source?: string | null;
  /** Immutable first generated version, retained even when edit revisions are rolled back. */
  initialXml?: string | null;
  xml?: string | null;
  mermaid?: string | null;
  diagramPlan?: DiagramPlan | null;
  revisions?: SkeletonRegionRevision[];
};

export type VectorizeImageResponse = {
  svg: string;
};

/** Layout skeleton draft returned from prompt + one layout reference. */
export type DiagramSkeletonResponse = {
  type?: "drawio" | "mermaid";
  xml?: string | null;
  mermaid?: string | null;
  title: string;
  source?: string;
  generation?: "skeleton_generation";
  layoutPreviewDataUrl?: string | null;
  diagramPlan?: DiagramPlan | null;
};

export type SearchResponse = {
  references: ReferenceItem[];
  styleSummary: StyleSummary;
  limit: number;
  offset: number;
  hasMore: boolean;
};
