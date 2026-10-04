"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { createElement } from "react";
import { fetchStudyRecovery, type StudyRecoveryArtifact } from "./api";
import {
  resolveFigureVariantAssetUrls,
  resolveReferenceAssetUrls,
} from "./api-assets";
import { imageUrlToDataUrl } from "./annotation-flatten";
import { createDemoWorkspaceStateHydrated } from "./demo-seed";
import type {
  CustomIconReference,
  DiagramPlan,
  DiagramSkeletonCandidate,
  FigureVariant,
  ReferenceItem,
  ReferenceRegion,
  ReviewIssue,
  SearchGoal,
  StyleFontCandidate,
  StylePatternCandidate,
} from "./types";
import {
  studyPhaseForStage,
  type StudyPhase,
  type StudyStage,
} from "./study-phase";
export {
  defaultStudyStageForPhase,
  normalizeStudyPhase,
  studyPhaseForStage,
  type StudyPhase,
  type StudyStage,
} from "./study-phase";
import {
  figureFontReferences,
  figurePaletteReferences,
  isScientificIconReferenceId,
  scientificIconReferences,
  type FigureFontReferenceId,
  type FigurePaletteReferenceId,
  type ScientificIconReferenceId,
} from "./scientific-assets";
import { SCIENTIFIC_ICON_CATALOG_VERSION } from "./icon-catalog-meta";
import {
  createEmptyStyleKit,
  createLegacyStyleKit,
  createSkeletonStyleApplication,
  normalizeSkeletonStyleApplications,
  normalizeStyleKit,
  styleKitHasSelections,
  type SkeletonStyleApplication,
  type StyleKit,
  type StyleKitPalette,
} from "./style-kit";
export {
  EMPTY_STYLE_KIT,
  createEmptyStyleKit,
  createLegacyStyleKit,
  createSkeletonStyleApplication,
  createStyleKitFingerprint,
  nodeColorBindingsForSkeleton,
  nodeFontBindingsForSkeleton,
  nodeIconBindingsForSkeleton,
  normalizeSkeletonStyleApplications,
  normalizeStyleKit,
  styleKitHasSelections,
  type SkeletonStyleApplication,
  type StyleKit,
  type StyleKitPalette,
} from "./style-kit";
/*
 * Keep custom-icon migration local to the state layer. Importing the richer
 * workspace icon view-model here would re-enter WorkspaceState during seed
 * initialization in Node-based tests.
 */
function customIconContentHash(value: string | null | undefined) {
  if (!value) return "empty";
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${value.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

function normalizedCustomIconKind(icon: CustomIconReference): "icon" | "style-crop" {
  if (icon.kind === "icon" || icon.kind === "style-crop") return icon.kind;
  if (icon.id.startsWith("custom-icon-")) return "icon";
  if (icon.id.startsWith("custom-screenshot-")) return "style-crop";
  return icon.tags.some((tag) => /style crop|crop from style/i.test(tag)) ? "style-crop" : "icon";
}

function normalizeStoredCustomIconReferences(icons: CustomIconReference[] | null | undefined) {
  return (icons ?? []).map((icon) => ({
    ...icon,
    kind: normalizedCustomIconKind(icon),
    contentHash: icon.contentHash || customIconContentHash(icon.cropDataUrl),
  }));
}

function isKnownStoredIconId(iconId: string, customIcons: CustomIconReference[]) {
  return isScientificIconReferenceId(iconId) || customIcons.some((icon) => icon.id === iconId);
}

export type ReferenceRole = "layout" | "style" | "icon" | "font" | "palette";

export type ReferenceUsage = {
  layout?: boolean;
  style?: boolean;
  flow?: boolean;
  grouping?: boolean;
  palette?: boolean;
  /** Legacy alias kept for saved workspaces; UI uses the "font" role label. */
  typography?: boolean;
  icon?: boolean;
};

export const REFERENCE_ROLES: ReferenceRole[] = ["layout", "style", "icon", "font", "palette"];

export function referenceRoleUsageKey(role: ReferenceRole): keyof ReferenceUsage {
  return role === "font" ? "typography" : role;
}

export function hasReferenceRole(usage: ReferenceUsage | undefined, role: ReferenceRole): boolean {
  if (!usage) return false;
  return Boolean(usage[referenceRoleUsageKey(role)]);
}

export function countReferencesWithRole(
  board: ReferenceItem[],
  referenceUsage: Record<string, ReferenceUsage>,
  role: ReferenceRole,
): number {
  return board.filter((item) => hasReferenceRole(referenceUsage[item.id], role)).length;
}

export function referenceHasAnyRole(usage: ReferenceUsage | undefined): boolean {
  if (!usage) return false;
  return REFERENCE_ROLES.some((role) => hasReferenceRole(usage, role));
}

export type FigureHistoryEntry = {
  id: string;
  variantId: string;
  title: string;
  previewImageUrl?: string | null;
  previewImageStorageKey?: string | null;
  sourceStage: StudyStage;
  sourceType: "generate" | "refine" | "modify";
  sourceVariantId?: string | null;
  createdAt: string;
};

export type WorkflowMode = "freeform" | "refine";
export type WorkspaceView = "studio" | "advanced-board";
export function normalizeWorkspaceView(value: unknown): WorkspaceView {
  return value === "advanced-board" ? "advanced-board" : "studio";
}
export type StudySessionStatus = "setup" | "active" | "finished";
export type StudyEvent = {
  id: string;
  sessionId: string;
  elapsedMs: number;
  stage: StudyStage;
  type: string;
  targetIds: string[];
  result?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type RetrievalSession = {
  searchGoal: SearchGoal | null;
  offset: number;
  hasMore: boolean;
  promptFingerprint: string | null;
};

/** Immutable copy of the task assigned to a participant. Frontend-only. */
export type AssignedStudyTaskSnapshot = {
  version: string;
  title: string;
  audience: string;
  brief: string;
  requirements: string[];
  fingerprint: string;
};

export type PromptRevisionSource =
  | "initial"
  | "blur"
  | "narrator_send"
  | "retrieval"
  | "outline_regeneration"
  | "skeleton_generation"
  | "first_generation";

/** A deliberate Working Prompt checkpoint; typing itself never emits one. */
export type PromptRevision = {
  id: string;
  text: string;
  fingerprint: string;
  createdAt: string;
  source: PromptRevisionSource;
};

export type CandidateGenerationSnapshot = {
  variantId: string;
  createdAt: string;
  promptRevisionId: string | null;
  promptFingerprint: string;
  workingPrompt: string;
  skeletonId: string | null;
  skeletonXml: string | null;
  styleReferenceId: string | null;
  nodeIconBindings: Record<string, ScientificIconReferenceId>;
  /** Optional Font/Color choices confirmed in Match for this Candidate. */
  matchAppearanceFingerprint: string;
  styleKitFingerprint: string;
  /** Frontend-only author confirmations shown in the generation input board. */
  authorDecisionSnapshot?: NarratorDecision[];
};

function stableTextFingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${value.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

export function createPromptFingerprint(value: string): string {
  return `prompt-${stableTextFingerprint(value)}`;
}

export function createAssignedTaskFingerprint(value: {
  version: string;
  title: string;
  audience: string;
  brief: string;
  requirements: readonly string[];
}): string {
  return `task-${stableTextFingerprint(JSON.stringify({
    version: value.version,
    title: value.title,
    audience: value.audience,
    brief: value.brief,
    requirements: value.requirements,
  }))}`;
}

export function createPromptRevision(
  text: string,
  source: PromptRevisionSource = "initial",
  now = new Date().toISOString(),
): PromptRevision {
  const fingerprint = createPromptFingerprint(text);
  return {
    id: `prompt-revision-${Date.parse(now) || 0}-${fingerprint.replace("prompt-", "")}`,
    text,
    fingerprint,
    createdAt: now,
    source,
  };
}

/**
 * Commit the current Working Prompt without changing or deleting any artifact.
 * Existing artifacts become stale naturally when their saved fingerprint no
 * longer matches the current Working Prompt fingerprint.
 */
export function commitWorkingPromptRevision(
  state: WorkspaceState,
  source: PromptRevisionSource,
  now = new Date().toISOString(),
): WorkspaceState {
  const text = state.prompt;
  const fingerprint = createPromptFingerprint(text);
  const currentRevision = state.promptRevisions.find(
    (revision) => revision.id === state.currentPromptRevisionId,
  );
  const skeletonPromptDraft = state.guidedDialogue.skeletonPromptDraft;
  const previousCommittedPrompt = currentRevision?.text ?? state.generationBrief ?? "";
  const shouldSyncSkeletonDraft =
    skeletonPromptDraft.length === 0 || skeletonPromptDraft === previousCommittedPrompt;
  const guidedDialogue = shouldSyncSkeletonDraft && skeletonPromptDraft !== text
    ? { ...state.guidedDialogue, skeletonPromptDraft: text }
    : state.guidedDialogue;
  if (currentRevision?.fingerprint === fingerprint && currentRevision.text === text) {
    return state.generationBrief === text && guidedDialogue === state.guidedDialogue
      ? state
      : { ...state, generationBrief: text, guidedDialogue };
  }
  const revision = createPromptRevision(text, source, now);
  return appendStudyEvent({
    ...state,
    generationBrief: text,
    guidedDialogue,
    promptUpdatedAt: now,
    promptRevisions: [...state.promptRevisions, revision].slice(-80),
    currentPromptRevisionId: revision.id,
  }, {
    stage: state.activeStudyStage,
    type: "working_prompt_revised",
    targetIds: [revision.id],
    result: source,
    metadata: {
      source,
      fingerprint,
      previousRevisionId: state.currentPromptRevisionId,
      skeletonStale: Boolean(
        (state.diagramSkeletonXml || state.diagramSkeletonPlan) &&
        state.diagramSkeletonPromptFingerprint &&
        state.diagramSkeletonPromptFingerprint !== fingerprint
      ),
    },
  });
}

export function promptArtifactIsStale(
  state: WorkspaceState,
  artifact: "skeleton" | "candidate",
  variantId = state.selectedVariantId,
): boolean {
  const currentFingerprint = createPromptFingerprint(state.prompt);
  if (artifact === "skeleton") {
    return Boolean(
      (state.diagramSkeletonXml || state.diagramSkeletonPlan) &&
      state.diagramSkeletonPromptFingerprint &&
      state.diagramSkeletonPromptFingerprint !== currentFingerprint
    );
  }
  const snapshot = variantId ? state.candidateGenerationSnapshots[variantId] : null;
  return Boolean(snapshot && snapshot.promptFingerprint !== currentFingerprint);
}

export type IntentGraphNodeType =
  | "prompt"
  | "referenceSearch"
  | "layoutReference"
  | "styleReference"
  | "iconReference"
  | "fontReference"
  | "skeletonGenerator"
  | "figureGenerator"
  | "output";

export type IntentGraphNodeStatus = "idle" | "ready" | "running" | "error";

export type IntentGraphNode = {
  id: string;
  type: IntentGraphNodeType;
  title: string;
  x: number;
  y: number;
  status?: IntentGraphNodeStatus;
};

export type IntentGraphEdge = {
  id: string;
  fromNodeId: string;
  fromPort: string;
  toNodeId: string;
  toPort: string;
};

export type IntentGraphState = {
  nodes: IntentGraphNode[];
  edges: IntentGraphEdge[];
  selectedNodeId: string | null;
};

export type CreativeCanvasItemType = "reference" | "skeleton" | "control" | "output" | "asset" | "template";
export type CreativeCanvasReferenceRole = "layout" | "style";
export type CreativeCanvasAssetKind = "icon" | "font" | "palette" | "pattern";
export type CreativeCanvasTemplateKind = "layout" | "style" | "skeleton" | "output";
export type CreativeCanvasOutputStage = "draft" | "final";

export type CreativeCanvasConfirmSnapshot = {
  prompt: string;
  selectedCanvasItemIds: string[];
  excludedIds: string[];
  positions: { itemId: string; x: number; y: number }[];
  sizes: { itemId: string; w: number; h: number }[];
  arrows: { id: string; fromItemId: string; toNodeId: string; note: string }[];
  notes: { id: string; x: number; y: number; text: string }[];
  skeletonId?: string | null;
  styleReferenceId?: string | null;
  addedIconIds?: string[];
  advancedOpen?: boolean;
  confirmMode?: "generated-image" | "skeleton-binding" | "reference-board";
  annotationSnapshot?: unknown | null;
};

export type CreativeCanvasItem = {
  id: string;
  type: CreativeCanvasItemType;
  role?: CreativeCanvasReferenceRole;
  assetKind?: CreativeCanvasAssetKind;
  templateKind?: CreativeCanvasTemplateKind;
  templateTitle?: string;
  templateHint?: string;
  assetId?: string;
  assetLabel?: string;
  assetColors?: string[];
  sourceRegionId?: string;
  referenceId?: string;
  sourceReferenceId?: string;
  sourceSkeletonId?: string;
  sourceStyleReferenceId?: string;
  sourceIconReferenceId?: string;
  sourceIconReferenceIds?: string[];
  sourceFontReferenceId?: string;
  sourcePaletteReferenceId?: string;
  sourceVariantId?: string;
  sourceCanvasItemIds?: string[];
  outputStage?: CreativeCanvasOutputStage;
  controlImageDataUrl?: string | null;
  controlImageStorageKey?: string | null;
  controlTitle?: string;
  controlSnapshot?: CreativeCanvasConfirmSnapshot | null;
  skeletonId?: string;
  variantId?: string;
  deletedAt?: string | null;
  /** Frontend-only authoring guard. Never sent to generation APIs. */
  locked?: boolean;
  /** Author-validated content excluded from ordinary local refinement. Frontend-only. */
  protected?: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
};

export type CreativeCanvasState = {
  drawerCollapsed: boolean;
  items: CreativeCanvasItem[];
  selectedItemId: string | null;
  selectedItemIds: string[];
  templateInitialized?: boolean;
};

export type WorkspaceVersion = {
  id: string;
  name: string;
  createdAt: string;
  canvas: CreativeCanvasState;
  skeletonXml: string | null;
  skeletonPlan?: DiagramPlan | null;
  selectedSkeletonId?: string | null;
  skeletonCheckpointPlan?: DiagramPlan | null;
  nodeIconBindings?: Record<string, ScientificIconReferenceId>;
  nodeFontBindings?: Record<string, FigureFontReferenceId>;
  nodeColorBindings?: Record<string, string>;
  customIconReferences?: CustomIconReference[];
  /** Optional style-source mirrors retained for complete historical restore. */
  board?: ReferenceItem[];
  referenceUsage?: Record<string, ReferenceUsage>;
  canvasFocusReferenceId?: string | null;
  referenceRegions?: ReferenceRegion[];
  recentIconIds?: ScientificIconReferenceId[];
  iconReferenceIds?: string[];
  iconReferenceId?: string;
  fontReferenceId?: FigureFontReferenceId | null;
  paletteReferenceId?: FigurePaletteReferenceId | null;
  matchedStylePalette?: StyleKitPalette | null;
  styleVisualAnalyses?: Record<string, { fonts: StyleFontCandidate[]; patterns: StylePatternCandidate[] }>;
  styleAnalysisStates?: Record<string, StyleAnalysisState>;
  guidedDialogue?: GuidedDialogueState;
  /** Frontend-only visual selections captured with this named version. */
  activeStyleKit?: StyleKit;
  /** Per-skeleton visual applications captured with this named version. */
  skeletonStyleApplications?: Record<string, SkeletonStyleApplication>;
  assignedTaskSnapshot?: AssignedStudyTaskSnapshot;
  prompt?: string;
  promptUpdatedAt?: string;
  promptRevisions?: PromptRevision[];
  currentPromptRevisionId?: string | null;
  diagramSkeletonPromptRevisionId?: string | null;
  diagramSkeletonPromptFingerprint?: string | null;
  candidateGenerationSnapshots?: Record<string, CandidateGenerationSnapshot>;
};

export type IdeaHistoryNodeKind = "root" | "checkpoint" | "skeleton" | "candidate" | "edit";
export type IdeaSparkStepId =
  | "prompt"
  | "retrieval"
  | "layout"
  | "skeleton"
  | "style"
  | "icons"
  | "candidate"
  | "edit"
  | "review";
export type IdeaStudioSurface = "content" | "layout" | "skeleton" | "style" | "icons" | "candidate" | "edit" | "review";

/**
 * Frontend-only authoring inputs captured at an inspiration checkpoint.
 * Retrieved references remain shared and are deliberately not copied here.
 */
export type IdeaSnapshot = {
  id: string;
  createdAt: string;
  fingerprint: string;
  studyStage: StudyStage;
  studioSurface: IdeaStudioSurface;
  prompt: string;
  promptRevisionId: string | null;
  promptUpdatedAt: string;
  promptDraft: string;
  referenceUsage: Record<string, ReferenceUsage>;
  layoutReferenceId: string | null;
  styleReferenceId: string | null;
  canvasGenerationReferenceIds: string[];
  activeStyleKit: StyleKit;
  styleAnalysisState: StyleAnalysisState | null;
  styleVisualAnalysis: { fonts: StyleFontCandidate[]; patterns: StylePatternCandidate[] } | null;
  selectedSkeleton: DiagramSkeletonCandidate | null;
  diagramSkeletonPromptRevisionId: string | null;
  diagramSkeletonPromptFingerprint: string | null;
  skeletonCheckpointPlan: DiagramPlan | null;
  skeletonConfirmedAt: string | null;
  nodeIconBindings: Record<string, ScientificIconReferenceId>;
  nodeFontBindings: Record<string, FigureFontReferenceId>;
  nodeColorBindings: Record<string, string>;
  skeletonStyleApplication: SkeletonStyleApplication | null;
  lockedDiagramObjectIds: string[];
  iconReferenceIds: string[];
  iconReferenceId: string;
  fontReferenceId: FigureFontReferenceId | null;
  paletteReferenceId: FigurePaletteReferenceId | null;
  matchedStylePalette: StyleKitPalette | null;
  selectedVariantId: string | null;
};

export type IdeaHistoryNode = {
  id: string;
  rootId: string;
  parentId: string | null;
  kind: IdeaHistoryNodeKind;
  title: string;
  createdAt: string;
  snapshotId: string;
  skeletonId: string | null;
  variantId: string | null;
  sourceVariantId: string | null;
  status: "current" | "archived";
  deletedAt?: string | null;
};

export type IdeaHistoryState = {
  version: "idea-history-v1";
  nodes: IdeaHistoryNode[];
  snapshots: Record<string, IdeaSnapshot>;
  activeRootId: string | null;
  activeNodeId: string | null;
  previewNodeId: string | null;
  collapsedRootIds: string[];
  homeOpen: boolean;
};

export function createEmptyIdeaHistoryState(homeOpen = false): IdeaHistoryState {
  return {
    version: "idea-history-v1",
    nodes: [],
    snapshots: {},
    activeRootId: null,
    activeNodeId: null,
    previewNodeId: null,
    collapsedRootIds: [],
    homeOpen,
  };
}

export function normalizeIdeaHistoryState(value: unknown): IdeaHistoryState {
  const fallback = createEmptyIdeaHistoryState(true);
  if (!value || typeof value !== "object") return fallback;
  const input = value as Partial<IdeaHistoryState>;
  const rawSnapshots = input.snapshots && typeof input.snapshots === "object" ? input.snapshots : {};
  const snapshots = Object.fromEntries(
    Object.entries(rawSnapshots).filter(([, snapshot]) =>
      Boolean(
        snapshot &&
        typeof snapshot === "object" &&
        typeof snapshot.id === "string" &&
        typeof snapshot.fingerprint === "string" &&
        typeof snapshot.prompt === "string",
      ),
    ),
  ) as Record<string, IdeaSnapshot>;
  const validKinds: IdeaHistoryNodeKind[] = ["root", "checkpoint", "skeleton", "candidate", "edit"];
  const nodes = (Array.isArray(input.nodes) ? input.nodes : []).filter((node): node is IdeaHistoryNode =>
    Boolean(
      node &&
      typeof node.id === "string" &&
      typeof node.rootId === "string" &&
      validKinds.includes(node.kind as IdeaHistoryNodeKind) &&
      typeof node.snapshotId === "string" &&
      snapshots[node.snapshotId],
    ),
  );
  const nodeIds = new Set(nodes.map((node) => node.id));
  const rootIds = new Set(nodes.filter((node) => node.kind === "root").map((node) => node.id));
  return {
    version: "idea-history-v1",
    nodes,
    snapshots,
    activeRootId: typeof input.activeRootId === "string" && rootIds.has(input.activeRootId)
      ? input.activeRootId
      : nodes.find((node) => node.kind === "root")?.id ?? null,
    activeNodeId: typeof input.activeNodeId === "string" && nodeIds.has(input.activeNodeId)
      ? input.activeNodeId
      : null,
    previewNodeId: typeof input.previewNodeId === "string" && nodeIds.has(input.previewNodeId)
      ? input.previewNodeId
      : null,
    collapsedRootIds: Array.isArray(input.collapsedRootIds)
      ? input.collapsedRootIds.filter((id): id is string => typeof id === "string" && rootIds.has(id))
      : [],
    homeOpen: false,
  };
}

export type CreativeCanvasDocument = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  canvas: CreativeCanvasState;
  undoStack: CreativeCanvasState[];
};

export type StudyProfile = {
  userId: string;
  figureGoal?: "method" | "system" | "result" | "teaser";
  referencePreference: "layout" | "style" | "balanced";
  onboardingCompletedAt: string | null;
};

function normalizeStudyProfile(value: unknown): StudyProfile | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<StudyProfile>;
  if (typeof input.userId !== "string" || !input.userId.trim()) return null;
  const figureGoal = input.figureGoal === "method" || input.figureGoal === "system" ||
    input.figureGoal === "result" || input.figureGoal === "teaser"
    ? input.figureGoal
    : undefined;
  return {
    userId: input.userId.trim(),
    figureGoal,
    referencePreference:
      input.referencePreference === "layout" || input.referencePreference === "style"
        ? input.referencePreference
        : "balanced",
    onboardingCompletedAt: typeof input.onboardingCompletedAt === "string"
      ? input.onboardingCompletedAt
      : null,
  };
}

export const GUIDED_DIALOGUE_VERSION = "narrator-v2" as const;
export type NarratorSurface = "skeleton" | "style";
export type NarratorMessageSpeaker = "assistant" | "author" | "status";
export type NarratorMessageTone = "default" | "success" | "warning" | "error" | "cached" | "fallback";
export type SkeletonConversationDetailView = "preview" | "drawio" | "structure";
export type StyleConversationDetailView = "preview" | "icons" | "fonts" | "palettes" | "manual";
export type StyleAnalysisStatus =
  | "not_requested"
  | "analyzing"
  | "completed"
  | "cached"
  | "fallback"
  | "failed"
  | "skipped";

export type StyleAnalysisState = {
  referenceId: string;
  status: StyleAnalysisStatus;
  requestedAt: string | null;
  completedAt: string | null;
  resultFingerprint: string | null;
  iconCount: number;
  fontCount: number;
  /** Invalidates cached font matches when the installed comparison catalog changes. */
  catalogFingerprint?: string | null;
  patternCount: number;
  errorReason: string | null;
  userRequested: boolean;
};

export type NarratorDecision = {
  id: string;
  surface: NarratorSurface;
  stepId: string;
  choiceId: string;
  summary: string;
  promptRevisionId: string | null;
  layoutReferenceId: string | null;
  skeletonId: string | null;
  styleReferenceId: string | null;
  styleKitId: string | null;
  analysisStatus: StyleAnalysisStatus | null;
  artifactFingerprint: string;
  status: "current" | "stale";
  createdAt: string;
};

/** A rendered fixed-script exchange. `summary` never contains a hidden/system prompt. */
export type NarratorMessage = {
  id: string;
  surface: NarratorSurface;
  speaker: NarratorMessageSpeaker;
  templateId: string;
  summary: string;
  promptRevisionId: string | null;
  referenceId: string | null;
  artifactId: string | null;
  artifactFingerprint: string | null;
  tone: NarratorMessageTone;
  status: "current" | "stale";
  createdAt: string;
};

export type GuidedDialogueState = {
  version: typeof GUIDED_DIALOGUE_VERSION;
  currentSteps: Record<NarratorSurface, string>;
  seenStepIds: string[];
  completedStepIds: string[];
  skippedStepIds: string[];
  collapsed: Record<NarratorSurface, boolean>;
  decisions: Partial<Record<NarratorSurface, NarratorDecision>>;
  messages: Record<NarratorSurface, NarratorMessage[]>;
  skeletonPromptDraft: string;
  detailViews: {
    skeleton: SkeletonConversationDetailView;
    style: StyleConversationDetailView;
  };
};

export function createGuidedDialogueState(promptDraft = ""): GuidedDialogueState {
  return {
    version: GUIDED_DIALOGUE_VERSION,
    currentSteps: { skeleton: "layout", style: "reference" },
    seenStepIds: [],
    completedStepIds: [],
    skippedStepIds: [],
    collapsed: { skeleton: false, style: false },
    decisions: {},
    messages: { skeleton: [], style: [] },
    skeletonPromptDraft: promptDraft,
    detailViews: { skeleton: "preview", style: "preview" },
  };
}

function narratorMessageId(message: Pick<NarratorMessage, "surface" | "templateId" | "createdAt">): string {
  return `narrator-${message.surface}-${message.templateId}-${stableTextFingerprint(message.createdAt)}`;
}

export function appendNarratorMessage(
  dialogue: GuidedDialogueState,
  message: Omit<NarratorMessage, "id" | "createdAt" | "status" | "tone"> &
    Partial<Pick<NarratorMessage, "id" | "createdAt" | "status" | "tone">>,
): GuidedDialogueState {
  const createdAt = message.createdAt ?? new Date().toISOString();
  const normalized: NarratorMessage = {
    ...message,
    id: message.id ?? narratorMessageId({ ...message, createdAt }),
    createdAt,
    status: message.status === "stale" ? "stale" : "current",
    tone: message.tone ?? "default",
  };
  const history = dialogue.messages[message.surface] ?? [];
  const previous = history[history.length - 1];
  const repeatsPrevious = previous &&
    previous.templateId === normalized.templateId &&
    previous.summary === normalized.summary &&
    previous.referenceId === normalized.referenceId &&
    previous.artifactFingerprint === normalized.artifactFingerprint &&
    previous.status === normalized.status;
  return {
    ...dialogue,
    messages: {
      ...dialogue.messages,
      [message.surface]: repeatsPrevious ? history : [...history, normalized].slice(-80),
    },
  };
}

export function markNarratorMessagesStale(
  dialogue: GuidedDialogueState,
  surface: NarratorSurface,
  predicate: (message: NarratorMessage) => boolean = () => true,
): GuidedDialogueState {
  return {
    ...dialogue,
    messages: {
      ...dialogue.messages,
      [surface]: dialogue.messages[surface].map((message) =>
        message.status === "current" && predicate(message) ? { ...message, status: "stale" as const } : message,
      ),
    },
  };
}

function normalizeNarratorDecision(value: unknown): NarratorDecision | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<NarratorDecision>;
  if (input.surface !== "skeleton" && input.surface !== "style") return null;
  if (typeof input.id !== "string" || typeof input.summary !== "string") return null;
  const validAnalysisStatuses: StyleAnalysisStatus[] = [
    "not_requested", "analyzing", "completed", "cached", "fallback", "failed", "skipped",
  ];
  return {
    id: input.id,
    surface: input.surface,
    stepId: typeof input.stepId === "string" ? input.stepId : "checkpoint",
    choiceId: typeof input.choiceId === "string" ? input.choiceId : "confirmed",
    summary: input.summary,
    promptRevisionId: typeof input.promptRevisionId === "string" ? input.promptRevisionId : null,
    layoutReferenceId: typeof input.layoutReferenceId === "string" ? input.layoutReferenceId : null,
    skeletonId: typeof input.skeletonId === "string" ? input.skeletonId : null,
    styleReferenceId: typeof input.styleReferenceId === "string" ? input.styleReferenceId : null,
    styleKitId: typeof input.styleKitId === "string" ? input.styleKitId : null,
    analysisStatus: validAnalysisStatuses.includes(input.analysisStatus as StyleAnalysisStatus)
      ? input.analysisStatus as StyleAnalysisStatus
      : null,
    artifactFingerprint: typeof input.artifactFingerprint === "string" ? input.artifactFingerprint : "",
    status: input.status === "stale" ? "stale" : "current",
    createdAt: typeof input.createdAt === "string" ? input.createdAt : new Date(0).toISOString(),
  };
}

function normalizeNarratorMessage(value: unknown, surface: NarratorSurface): NarratorMessage | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<NarratorMessage>;
  if (typeof input.summary !== "string" || typeof input.templateId !== "string") return null;
  const speaker: NarratorMessageSpeaker = input.speaker === "author" || input.speaker === "status"
    ? input.speaker
    : "assistant";
  const validTones: NarratorMessageTone[] = ["default", "success", "warning", "error", "cached", "fallback"];
  const createdAt = typeof input.createdAt === "string" ? input.createdAt : new Date(0).toISOString();
  return {
    id: typeof input.id === "string" && input.id ? input.id : narratorMessageId({ surface, templateId: input.templateId, createdAt }),
    surface,
    speaker,
    templateId: input.templateId,
    summary: input.summary,
    promptRevisionId: typeof input.promptRevisionId === "string" ? input.promptRevisionId : null,
    referenceId: typeof input.referenceId === "string" ? input.referenceId : null,
    artifactId: typeof input.artifactId === "string" ? input.artifactId : null,
    artifactFingerprint: typeof input.artifactFingerprint === "string" ? input.artifactFingerprint : null,
    tone: validTones.includes(input.tone as NarratorMessageTone) ? input.tone as NarratorMessageTone : "default",
    status: input.status === "stale" ? "stale" : "current",
    createdAt,
  };
}

export function normalizeGuidedDialogueState(value: unknown): GuidedDialogueState {
  const fallback = createGuidedDialogueState();
  if (!value || typeof value !== "object") return fallback;
  const input = value as Partial<GuidedDialogueState>;
  const skeletonDecision = normalizeNarratorDecision(input.decisions?.skeleton);
  const styleDecision = normalizeNarratorDecision(input.decisions?.style);
  const normalizeMessages = (surface: NarratorSurface) => {
    const raw = Array.isArray(input.messages?.[surface]) ? input.messages[surface] : [];
    const restored = raw
      .map((message) => normalizeNarratorMessage(message, surface))
      .filter((message): message is NarratorMessage => Boolean(message))
      .slice(-80);
    const decision = surface === "skeleton" ? skeletonDecision : styleDecision;
    if (restored.length > 0 || !decision) return restored;
    return [{
      id: `narrator-${surface}-migrated-${decision.id}`,
      surface,
      speaker: "status" as const,
      templateId: "migrated_checkpoint",
      summary: `Restored checkpoint: ${decision.summary}`,
      promptRevisionId: decision.promptRevisionId,
      referenceId: surface === "skeleton" ? decision.layoutReferenceId : decision.styleReferenceId,
      artifactId: surface === "skeleton" ? decision.skeletonId : decision.styleKitId,
      artifactFingerprint: decision.artifactFingerprint,
      tone: "cached" as const,
      status: decision.status,
      createdAt: decision.createdAt,
    }];
  };
  return {
    version: GUIDED_DIALOGUE_VERSION,
    currentSteps: {
      skeleton: typeof input.currentSteps?.skeleton === "string" ? input.currentSteps.skeleton : fallback.currentSteps.skeleton,
      style: typeof input.currentSteps?.style === "string" ? input.currentSteps.style : fallback.currentSteps.style,
    },
    seenStepIds: Array.isArray(input.seenStepIds) ? input.seenStepIds.filter((id): id is string => typeof id === "string") : [],
    completedStepIds: Array.isArray(input.completedStepIds) ? input.completedStepIds.filter((id): id is string => typeof id === "string") : [],
    skippedStepIds: Array.isArray(input.skippedStepIds) ? input.skippedStepIds.filter((id): id is string => typeof id === "string") : [],
    collapsed: {
      skeleton: Boolean(input.collapsed?.skeleton),
      style: Boolean(input.collapsed?.style),
    },
    decisions: {
      ...(skeletonDecision ? { skeleton: skeletonDecision } : {}),
      ...(styleDecision ? { style: styleDecision } : {}),
    },
    messages: {
      skeleton: normalizeMessages("skeleton"),
      style: normalizeMessages("style"),
    },
    skeletonPromptDraft: typeof input.skeletonPromptDraft === "string" ? input.skeletonPromptDraft : "",
    detailViews: {
      skeleton: input.detailViews?.skeleton === "drawio" || input.detailViews?.skeleton === "structure"
        ? input.detailViews.skeleton
        : "preview",
      style: input.detailViews?.style === "icons" || input.detailViews?.style === "fonts" ||
        input.detailViews?.style === "palettes" || input.detailViews?.style === "manual"
        ? input.detailViews.style
        : "preview",
    },
  };
}

export function normalizeStyleAnalysisStates(value: unknown): Record<string, StyleAnalysisState> {
  if (!value || typeof value !== "object") return {};
  const validStatuses: StyleAnalysisStatus[] = [
    "not_requested", "analyzing", "completed", "cached", "fallback", "failed", "skipped",
  ];
  return Object.fromEntries(Object.entries(value as Record<string, Partial<StyleAnalysisState>>).flatMap(([referenceId, input]) => {
    if (!input || !validStatuses.includes(input.status as StyleAnalysisStatus)) return [];
    const restoredStatus: StyleAnalysisStatus = input.status === "analyzing" ? "failed" : input.status as StyleAnalysisStatus;
    return [[referenceId, {
      referenceId,
      status: restoredStatus,
      requestedAt: typeof input.requestedAt === "string" ? input.requestedAt : null,
      completedAt: typeof input.completedAt === "string" ? input.completedAt : null,
      resultFingerprint: typeof input.resultFingerprint === "string" ? input.resultFingerprint : null,
      iconCount: Number.isFinite(input.iconCount) ? Math.max(0, Number(input.iconCount)) : 0,
      fontCount: Number.isFinite(input.fontCount) ? Math.max(0, Number(input.fontCount)) : 0,
      catalogFingerprint: typeof input.catalogFingerprint === "string" ? input.catalogFingerprint : null,
      patternCount: Number.isFinite(input.patternCount) ? Math.max(0, Number(input.patternCount)) : 0,
      errorReason: typeof input.errorReason === "string"
        ? input.errorReason
        : input.status === "analyzing"
          ? "Analysis was interrupted before this workspace was restored."
          : null,
      userRequested: Boolean(input.userRequested),
    } satisfies StyleAnalysisState]];
  }));
}

export function createNarratorArtifactFingerprint(value: unknown): string {
  return createPromptFingerprint(JSON.stringify(value));
}

export function createDefaultCreativeCanvas(): CreativeCanvasState {
  return {
    drawerCollapsed: true,
    items: createInitialCreativeCanvasTemplate(),
    selectedItemId: null,
    selectedItemIds: [],
    templateInitialized: true,
  };
}

export function createDefaultCreativeCanvasDocument(index = 1): CreativeCanvasDocument {
  const now = new Date().toISOString();
  return {
    id: `creative-canvas-${index}`,
    title: `Canvas ${index}`,
    createdAt: now,
    updatedAt: now,
    canvas: createDefaultCreativeCanvas(),
    undoStack: [],
  };
}

export function createInitialCreativeCanvasTemplate(): CreativeCanvasItem[] {
  return [
    {
      id: "canvas-template-layout",
      type: "template",
      templateKind: "layout",
      templateTitle: "Layout reference",
      templateHint: "Drop the strongest layout reference here.",
      x: 72,
      y: 94,
      w: 310,
      h: 210,
      z: 1,
    },
    {
      id: "canvas-template-style",
      type: "template",
      templateKind: "style",
      templateTitle: "Style reference",
      templateHint: "Place visual language, palette, and icon cues.",
      x: 72,
      y: 356,
      w: 310,
      h: 210,
      z: 2,
    },
    {
      id: "canvas-template-skeleton",
      type: "template",
      templateKind: "skeleton",
      templateTitle: "Skeleton plan",
      templateHint: "Generate or edit the diagram layout here.",
      x: 478,
      y: 154,
      w: 380,
      h: 292,
      z: 3,
    },
    {
      id: "canvas-template-output",
      type: "template",
      templateKind: "output",
      templateTitle: "Generated figure",
      templateHint: "Regenerate/edit results continue to the right.",
      x: 954,
      y: 180,
      w: 360,
      h: 250,
      z: 4,
    },
  ];
}

export function createDefaultIntentGraph(): IntentGraphState {
  return {
    selectedNodeId: "node-prompt",
    nodes: [
      { id: "node-prompt", type: "prompt", title: "Prompt", x: 60, y: 170, status: "idle" },
      { id: "node-search", type: "referenceSearch", title: "Reference Search", x: 60, y: 390, status: "idle" },
      { id: "node-layout", type: "layoutReference", title: "Layout Reference", x: 390, y: 120, status: "idle" },
      { id: "node-style", type: "styleReference", title: "Style Reference", x: 390, y: 410, status: "idle" },
      { id: "node-skeleton", type: "skeletonGenerator", title: "Skeleton Generator", x: 720, y: 130, status: "idle" },
      { id: "node-icon", type: "iconReference", title: "Icon Reference", x: 720, y: 500, status: "idle" },
      { id: "node-font", type: "fontReference", title: "Font Reference", x: 1030, y: 520, status: "idle" },
      { id: "node-figure", type: "figureGenerator", title: "Figure Generator", x: 1030, y: 290, status: "idle" },
      { id: "node-output", type: "output", title: "Output / Edit", x: 1340, y: 290, status: "idle" },
    ],
    edges: [
      {
        id: "edge-prompt-skeleton",
        fromNodeId: "node-prompt",
        fromPort: "prompt",
        toNodeId: "node-skeleton",
        toPort: "prompt",
      },
      {
        id: "edge-prompt-figure",
        fromNodeId: "node-prompt",
        fromPort: "prompt",
        toNodeId: "node-figure",
        toPort: "prompt",
      },
      {
        id: "edge-layout-skeleton",
        fromNodeId: "node-layout",
        fromPort: "reference",
        toNodeId: "node-skeleton",
        toPort: "layoutReference",
      },
      {
        id: "edge-skeleton-figure",
        fromNodeId: "node-skeleton",
        fromPort: "skeleton",
        toNodeId: "node-figure",
        toPort: "skeleton",
      },
      {
        id: "edge-style-figure",
        fromNodeId: "node-style",
        fromPort: "reference",
        toNodeId: "node-figure",
        toPort: "styleReference",
      },
      {
        id: "edge-icon-figure",
        fromNodeId: "node-icon",
        fromPort: "reference",
        toNodeId: "node-figure",
        toPort: "iconReference",
      },
      {
        id: "edge-font-figure",
        fromNodeId: "node-font",
        fromPort: "reference",
        toNodeId: "node-figure",
        toPort: "fontReference",
      },
      {
        id: "edge-figure-output",
        fromNodeId: "node-figure",
        fromPort: "variants",
        toNodeId: "node-output",
        toPort: "variants",
      },
    ],
  };
}

function normalizeIntentGraph(graph: IntentGraphState | null | undefined): IntentGraphState {
  const defaults = createDefaultIntentGraph();
  if (!graph) return defaults;
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const nodes = [
    ...graph.nodes,
    ...defaults.nodes.filter((node) => !nodeIds.has(node.id)),
  ];
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));
  const availableNodeIds = new Set(nodes.map((node) => node.id));
  const edges = [
    ...graph.edges,
    ...defaults.edges.filter(
      (edge) =>
        !edgeIds.has(edge.id) &&
        availableNodeIds.has(edge.fromNodeId) &&
        availableNodeIds.has(edge.toNodeId),
    ),
  ];
  const selectedNodeId =
    graph.selectedNodeId && availableNodeIds.has(graph.selectedNodeId)
      ? graph.selectedNodeId
      : defaults.selectedNodeId;
  return { nodes, edges, selectedNodeId };
}

function normalizeCreativeCanvas(canvas: CreativeCanvasState | null | undefined): CreativeCanvasState {
  const defaults = createDefaultCreativeCanvas();
  if (!canvas) return defaults;
  const items = Array.isArray(canvas.items) ? canvas.items : [];
  if (!canvas.templateInitialized && items.length === 0) return defaults;
  const selectedItemId =
    canvas.selectedItemId && items.some((item) => item.id === canvas.selectedItemId)
      ? canvas.selectedItemId
      : null;
  const itemIds = new Set(items.map((item) => item.id));
  const selectedItemIds = Array.isArray(canvas.selectedItemIds)
    ? Array.from(new Set(canvas.selectedItemIds.filter((id) => itemIds.has(id))))
    : [];
  return {
    drawerCollapsed: canvas.drawerCollapsed ?? true,
    items,
    selectedItemId,
    selectedItemIds,
    templateInitialized: canvas.templateInitialized ?? items.length > 0,
  };
}

function normalizeCreativeCanvasUndoStack(stack: CreativeCanvasState[] | null | undefined): CreativeCanvasState[] {
  return (stack ?? []).map((canvas) => normalizeCreativeCanvas(canvas)).slice(-80);
}

function normalizeCreativeCanvasDocuments(
  documents: CreativeCanvasDocument[] | null | undefined,
  fallbackCanvas: CreativeCanvasState,
  fallbackUndoStack: CreativeCanvasState[],
): CreativeCanvasDocument[] {
  const now = new Date().toISOString();
  const normalized = (documents ?? [])
    .filter((document) => document?.id && document?.canvas)
    .map((document, index) => ({
      id: document.id,
      title: document.title?.trim() || `Canvas ${index + 1}`,
      createdAt: document.createdAt ?? now,
      updatedAt: document.updatedAt ?? document.createdAt ?? now,
      canvas: normalizeCreativeCanvas(document.canvas),
      undoStack: normalizeCreativeCanvasUndoStack(document.undoStack),
    }));
  if (normalized.length > 0) return normalized;
  return [
    {
      id: "creative-canvas-1",
      title: "Canvas 1",
      createdAt: now,
      updatedAt: now,
      canvas: fallbackCanvas,
      undoStack: fallbackUndoStack,
    },
  ];
}

function activeCreativeCanvasDocument(
  documents: CreativeCanvasDocument[],
  activeId: string | null | undefined,
): CreativeCanvasDocument {
  return documents.find((document) => document.id === activeId) ?? documents[0] ?? createDefaultCreativeCanvasDocument(1);
}

export type WorkspaceState = {
  studyProfile: StudyProfile | null;
  studyTaskVersion: string;
  /** Immutable study-condition task; never overwritten by Working Prompt edits. */
  assignedTaskSnapshot: AssignedStudyTaskSnapshot;
  /** Frozen frontend icon catalog used for reproducible study sessions. */
  iconCatalogVersion: string;
  studySessionId: string | null;
  studySessionStartedAt: string | null;
  studySessionStatus: StudySessionStatus;
  activeStudyStage: StudyStage;
  visitedStudyStages: StudyStage[];
  completedStudyStages: StudyStage[];
  /** Three-phase study shell. Optional only so pre-migration seed objects remain source-compatible. */
  activeStudyPhase?: StudyPhase;
  /** Persisted navigation history for the three-phase shell. */
  visitedStudyPhases?: StudyPhase[];
  /** Phases the participant has navigated away from or explicitly completed. */
  completedStudyPhases?: StudyPhase[];
  workflowMode: WorkflowMode;
  /** Default structured authoring surface. The free canvas remains an explicit advanced view. */
  workspaceView: WorkspaceView;
  /** Persisted node in the compact Idea Spark navigator. */
  activeStudioStep: IdeaSparkStepId;
  studyEvents: StudyEvent[];
  /** Fixed frontend Narrator used only in Skeleton and Style. */
  guidedDialogue: GuidedDialogueState;
  skeletonConfirmedAt: string | null;
  reviewResult: ReviewIssue[];
  /** Targets requested by Review navigation for frontend-only focus/highlighting. */
  reviewFocusTargetIds?: string[];
  /** Active frontend-only visual style set. Never included in model requests. */
  activeStyleKit: StyleKit;
  /** Style and node-icon choices frozen per skeleton. */
  skeletonStyleApplications: Record<string, SkeletonStyleApplication>;
  nodeIconBindings: Record<string, ScientificIconReferenceId>;
  nodeFontBindings: Record<string, FigureFontReferenceId>;
  nodeColorBindings: Record<string, string>;
  recentIconIds: ScientificIconReferenceId[];
  lockedDiagramObjectIds: string[];
  /** Lightweight, fixed-layout inspiration lineage. Frontend-only. */
  ideaHistory: IdeaHistoryState;
  workspaceVersions: WorkspaceVersion[];
  activeWorkspaceVersionId: string | null;
  showProvenance: boolean;
  /** Search/query text used to retrieve references. */
  prompt: string;
  /** Compatibility mirror for existing skeleton/generation code. Kept equal to prompt on deliberate edits. */
  generationBrief?: string;
  promptUpdatedAt: string;
  promptRevisions: PromptRevision[];
  currentPromptRevisionId: string | null;
  /** Prompt provenance for non-destructive stale indicators. */
  diagramSkeletonPromptRevisionId: string | null;
  diagramSkeletonPromptFingerprint: string | null;
  /** Coordinate-aware draw.io skeleton XML from Step 2 */
  diagramSkeletonXml: string | null;
  /** Debug/source JSON used to build the draw.io skeleton. */
  diagramSkeletonPlan: DiagramPlan | null;
  /** Last author-saved skeleton checkpoint for frontend-only diff summaries. */
  skeletonCheckpointPlan?: DiagramPlan | null;
  /** Legacy/fallback prompt-only framework draft as Mermaid source. */
  diagramSkeletonMermaid: string | null;
  /** Generated layout skeleton options; selected option is mirrored into diagramSkeleton* fields. */
  diagramSkeletonCandidates: DiagramSkeletonCandidate[];
  selectedDiagramSkeletonId: string | null;
  layoutSkeletonGenerationInProgress: boolean;
  references: ReferenceItem[];
  /** Cursor state for the persisted reference result set. */
  retrievalSession: RetrievalSession;
  board: ReferenceItem[];
  /** One shared reference pool; usage flags say how each image should be used. */
  referenceUsage: Record<string, ReferenceUsage>;
  /** The single pocket reference picture used as the layout reference in Step 2 */
  layoutReferenceId: string | null;
  /** Pocket items checked for inclusion in Generate — ids must exist on board */
  canvasGenerationReferenceIds: string[];
  /** Active image on Canvas for region marking */
  canvasFocusReferenceId: string | null;
  /** Frontend-authored visual symbols used by the Icon Reference graph node. */
  iconReferenceIds: string[];
  /** Primary frontend-authored visual symbol kept for older saved workspaces. */
  iconReferenceId: string;
  /** Publication-safe font preset used by the Font Reference graph node. */
  fontReferenceId: FigureFontReferenceId | null;
  /** Publication-safe palette preset used as a color intent reference. */
  paletteReferenceId: FigurePaletteReferenceId | null;
  /** Colors extracted from Style and confirmed on the Match step for first generation. */
  matchedStylePalette: StyleKitPalette | null;
  /** Workspace-local icons extracted from marked style regions. */
  customIconReferences: CustomIconReference[];
  /** Cached lightweight LLM visual-language analysis keyed by style reference id. */
  styleVisualAnalyses: Record<string, { fonts: StyleFontCandidate[]; patterns: StylePatternCandidate[] }>;
  /** Explicit, user-requested LLM Style analysis status keyed by reference id. */
  styleAnalysisStates: Record<string, StyleAnalysisState>;
  /** Cross-image crop emphasis; sent with generation API */
  referenceRegions: ReferenceRegion[];
  variants: FigureVariant[];
  /** Immutable frontend-only inputs captured when each candidate is generated. */
  candidateGenerationSnapshots: Record<string, CandidateGenerationSnapshot>;
  selectedVariantId: string | null;
  figureHistory: FigureHistoryEntry[];
  /** When set, the version panel opens a before/after compare for these history entry ids. */
  figureHistoryCompareIds: [string, string] | null;
  intentGraph: IntentGraphState;
  activeCreativeCanvasId: string;
  creativeCanvases: CreativeCanvasDocument[];
  creativeCanvas: CreativeCanvasState;
  creativeCanvasUndoStack: CreativeCanvasState[];
  styleSummary: string[];
  status: string;
};

export function appendStudyEvent(
  state: WorkspaceState,
  event: Omit<StudyEvent, "id" | "sessionId" | "elapsedMs">,
): WorkspaceState {
  if (!state.studySessionId || !state.studySessionStartedAt || state.studySessionStatus === "finished") return state;
  const startedAt = Date.parse(state.studySessionStartedAt);
  const now = Date.now();
  return {
    ...state,
    studyEvents: [
      ...state.studyEvents,
      {
        ...event,
        id: `event-${now}-${state.studyEvents.length + 1}`,
        sessionId: state.studySessionId,
        elapsedMs: Number.isFinite(startedAt) ? Math.max(0, now - startedAt) : 0,
      },
    ],
  };
}

function cloneIdeaValue<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function ideaSnapshotContent(snapshot: Omit<IdeaSnapshot, "id" | "createdAt" | "fingerprint">) {
  return JSON.stringify(snapshot);
}

function finalizeIdeaSnapshot(
  state: WorkspaceState,
  content: Omit<IdeaSnapshot, "id" | "createdAt" | "fingerprint">,
  now: string,
): IdeaSnapshot {
  const fingerprint = `idea-${stableTextFingerprint(ideaSnapshotContent(content))}`;
  const ordinal = state.ideaHistory.nodes.length + Object.keys(state.ideaHistory.snapshots).length + 1;
  return {
    ...content,
    id: `idea-snapshot-${Date.parse(now) || Date.now()}-${ordinal}`,
    createdAt: now,
    fingerprint,
  };
}

export function captureIdeaSnapshot(
  state: WorkspaceState,
  options: {
    studioSurface?: IdeaStudioSurface;
    selectedSkeleton?: DiagramSkeletonCandidate | null;
    selectedVariantId?: string | null;
    now?: string;
  } = {},
): IdeaSnapshot {
  const now = options.now ?? new Date().toISOString();
  const selectedSkeleton = options.selectedSkeleton !== undefined
    ? options.selectedSkeleton
    : state.selectedDiagramSkeletonId
      ? state.diagramSkeletonCandidates.find((candidate) => candidate.id === state.selectedDiagramSkeletonId) ?? null
      : null;
  const styleReferenceId = state.canvasFocusReferenceId ?? state.activeStyleKit.sourceReferenceId;
  const application = selectedSkeleton ? state.skeletonStyleApplications[selectedSkeleton.id] ?? null : null;
  const content: Omit<IdeaSnapshot, "id" | "createdAt" | "fingerprint"> = {
    studyStage: state.activeStudyStage,
    studioSurface: options.studioSurface ?? (
      state.selectedVariantId ? "edit" : selectedSkeleton ? "skeleton" : "content"
    ),
    prompt: state.prompt,
    promptRevisionId: state.currentPromptRevisionId,
    promptUpdatedAt: state.promptUpdatedAt,
    promptDraft: state.guidedDialogue.skeletonPromptDraft,
    referenceUsage: cloneIdeaValue(state.referenceUsage),
    layoutReferenceId: state.layoutReferenceId,
    styleReferenceId,
    canvasGenerationReferenceIds: [...state.canvasGenerationReferenceIds],
    activeStyleKit: cloneIdeaValue(state.activeStyleKit),
    styleAnalysisState: styleReferenceId
      ? cloneIdeaValue(state.styleAnalysisStates[styleReferenceId] ?? null)
      : null,
    styleVisualAnalysis: styleReferenceId
      ? cloneIdeaValue(state.styleVisualAnalyses[styleReferenceId] ?? null)
      : null,
    selectedSkeleton: cloneIdeaValue(selectedSkeleton),
    diagramSkeletonPromptRevisionId: state.diagramSkeletonPromptRevisionId,
    diagramSkeletonPromptFingerprint: state.diagramSkeletonPromptFingerprint,
    skeletonCheckpointPlan: cloneIdeaValue(state.skeletonCheckpointPlan ?? null),
    skeletonConfirmedAt: state.skeletonConfirmedAt,
    nodeIconBindings: cloneIdeaValue(
      selectedSkeleton
        ? application?.nodeIconBindings ?? state.nodeIconBindings
        : state.nodeIconBindings,
    ) as Record<string, ScientificIconReferenceId>,
    nodeFontBindings: cloneIdeaValue(
      selectedSkeleton
        ? application?.nodeFontBindings ?? state.nodeFontBindings
        : state.nodeFontBindings,
    ) as Record<string, FigureFontReferenceId>,
    nodeColorBindings: cloneIdeaValue(
      selectedSkeleton
        ? application?.nodeColorBindings ?? state.nodeColorBindings
        : state.nodeColorBindings,
    ) as Record<string, string>,
    skeletonStyleApplication: cloneIdeaValue(application),
    lockedDiagramObjectIds: [...state.lockedDiagramObjectIds],
    iconReferenceIds: [...state.iconReferenceIds],
    iconReferenceId: state.iconReferenceId,
    fontReferenceId: state.fontReferenceId,
    paletteReferenceId: state.paletteReferenceId,
    matchedStylePalette: cloneIdeaValue(state.matchedStylePalette),
    selectedVariantId: options.selectedVariantId !== undefined
      ? options.selectedVariantId
      : state.selectedVariantId,
  };
  return finalizeIdeaSnapshot(state, content, now);
}

function withIdeaSnapshotUpdates(
  state: WorkspaceState,
  snapshot: IdeaSnapshot,
  updates: Partial<Omit<IdeaSnapshot, "id" | "createdAt" | "fingerprint">>,
  now: string,
): IdeaSnapshot {
  const { id: _id, createdAt: _createdAt, fingerprint: _fingerprint, ...content } = snapshot;
  return finalizeIdeaSnapshot(state, { ...content, ...cloneIdeaValue(updates) }, now);
}

function addIdeaHistoryNode(
  state: WorkspaceState,
  input: {
    kind: IdeaHistoryNodeKind;
    title: string;
    snapshot: IdeaSnapshot;
    parentId: string | null;
    rootId: string;
    skeletonId?: string | null;
    variantId?: string | null;
    sourceVariantId?: string | null;
    createdAt?: string;
    activate?: boolean;
  },
): WorkspaceState {
  const createdAt = input.createdAt ?? input.snapshot.createdAt;
  const nodeId = input.kind === "root"
    ? input.rootId
    : `idea-${input.kind}-${Date.parse(createdAt) || Date.now()}-${state.ideaHistory.nodes.length + 1}`;
  const node: IdeaHistoryNode = {
    id: nodeId,
    rootId: input.rootId,
    parentId: input.parentId,
    kind: input.kind,
    title: input.title,
    createdAt,
    snapshotId: input.snapshot.id,
    skeletonId: input.skeletonId ?? null,
    variantId: input.variantId ?? null,
    sourceVariantId: input.sourceVariantId ?? null,
    status: "current",
  };
  return {
    ...state,
    ideaHistory: {
      ...state.ideaHistory,
      nodes: [...state.ideaHistory.nodes, node],
      snapshots: { ...state.ideaHistory.snapshots, [input.snapshot.id]: input.snapshot },
      activeRootId: input.activate === false ? state.ideaHistory.activeRootId : input.rootId,
      activeNodeId: input.activate === false ? state.ideaHistory.activeNodeId : node.id,
      previewNodeId: input.activate === false ? state.ideaHistory.previewNodeId : node.id,
    },
  };
}

function ensureIdeaHistoryRoot(state: WorkspaceState, now = new Date().toISOString()): WorkspaceState {
  const activeRoot = state.ideaHistory.nodes.find(
    (node) => node.kind === "root" && node.id === state.ideaHistory.activeRootId,
  );
  if (activeRoot) return state;
  const rootCount = state.ideaHistory.nodes.filter((node) => node.kind === "root").length;
  const rootId = `idea-root-${Date.parse(now) || Date.now()}-${rootCount + 1}`;
  const snapshot = captureIdeaSnapshot(state, { studioSurface: "content", now });
  const rooted = addIdeaHistoryNode(state, {
    kind: "root",
    title: `Figure ${rootCount + 1}`,
    snapshot,
    parentId: null,
    rootId,
    createdAt: now,
  });
  return appendStudyEvent(rooted, {
    stage: state.activeStudyStage,
    type: "idea_root_created",
    targetIds: [rootId],
    result: rootCount === 0 ? "initial" : "created",
    metadata: { rootId },
  });
}

function ideaNodeForSkeleton(state: WorkspaceState, skeletonId: string | null | undefined) {
  return skeletonId
    ? state.ideaHistory.nodes.find((node) => node.kind === "skeleton" && node.skeletonId === skeletonId) ?? null
    : null;
}

function ideaNodeForVariant(state: WorkspaceState, variantId: string | null | undefined) {
  return variantId
    ? state.ideaHistory.nodes.find((node) => node.variantId === variantId) ?? null
    : null;
}

/** Add missing lineage metadata for artifacts created by any existing generation path. */
export function reconcileIdeaHistory(state: WorkspaceState, now = new Date().toISOString()): WorkspaceState {
  let next = ensureIdeaHistoryRoot(state, now);
  const fallbackRoot = next.ideaHistory.nodes.find(
    (node) => node.kind === "root" && node.id === next.ideaHistory.activeRootId,
  ) ?? next.ideaHistory.nodes.find((node) => node.kind === "root")!;

  for (const candidate of [...next.diagramSkeletonCandidates].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (ideaNodeForSkeleton(next, candidate.id)) continue;
    const snapshot = captureIdeaSnapshot(next, {
      selectedSkeleton: candidate,
      selectedVariantId: null,
      studioSurface: "skeleton",
      now: candidate.createdAt || now,
    });
    const shouldActivate = next.selectedDiagramSkeletonId === candidate.id;
    next = addIdeaHistoryNode(next, {
      kind: "skeleton",
      title: candidate.title,
      snapshot,
      parentId: fallbackRoot.id,
      rootId: fallbackRoot.id,
      skeletonId: candidate.id,
      createdAt: candidate.createdAt,
      activate: shouldActivate,
    });
    const addedNode = next.ideaHistory.nodes[next.ideaHistory.nodes.length - 1]!;
    next = appendStudyEvent(next, {
      stage: "skeleton",
      type: "idea_branch_created",
      targetIds: [addedNode.id, candidate.id],
      result: "skeleton",
      metadata: { rootId: addedNode.rootId, parentId: addedNode.parentId },
    });
  }

  const chronologicalHistory = [...next.figureHistory].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const entry of chronologicalHistory) {
    if (ideaNodeForVariant(next, entry.variantId)) continue;
    const variant = next.variants.find((item) => item.id === entry.variantId);
    if (!variant) continue;
    const candidateInput = next.candidateGenerationSnapshots[entry.variantId] ?? null;
    const sourceNode = ideaNodeForVariant(next, entry.sourceVariantId);
    const skeletonNode = ideaNodeForSkeleton(next, candidateInput?.skeletonId);
    const parentNode = sourceNode ?? skeletonNode ?? fallbackRoot;
    const kind: IdeaHistoryNodeKind = entry.sourceType === "generate" && !entry.sourceVariantId
      ? "candidate"
      : "edit";
    let snapshot = captureIdeaSnapshot(next, {
      selectedSkeleton: skeletonNode?.skeletonId
        ? next.diagramSkeletonCandidates.find((item) => item.id === skeletonNode.skeletonId) ?? null
        : undefined,
      selectedVariantId: variant.id,
      studioSurface: kind === "candidate" ? "candidate" : "edit",
      now: entry.createdAt,
    });
    if (candidateInput) {
      const candidateSkeleton = candidateInput.skeletonId
        ? next.diagramSkeletonCandidates.find((item) => item.id === candidateInput.skeletonId) ?? null
        : null;
      snapshot = withIdeaSnapshotUpdates(next, snapshot, {
        prompt: candidateInput.workingPrompt,
        promptRevisionId: candidateInput.promptRevisionId,
        selectedSkeleton: candidateSkeleton
          ? { ...candidateSkeleton, xml: candidateInput.skeletonXml ?? candidateSkeleton.xml }
          : null,
        styleReferenceId: candidateInput.styleReferenceId,
        nodeIconBindings: candidateInput.nodeIconBindings,
        selectedVariantId: variant.id,
        studioSurface: kind === "candidate" ? "candidate" : "edit",
      }, entry.createdAt);
    } else if (sourceNode) {
      const sourceSnapshot = next.ideaHistory.snapshots[sourceNode.snapshotId];
      if (sourceSnapshot) {
        snapshot = withIdeaSnapshotUpdates(next, sourceSnapshot, {
          selectedVariantId: variant.id,
          studioSurface: "edit",
          studyStage: "refine",
        }, entry.createdAt);
      }
    }
    next = addIdeaHistoryNode(next, {
      kind,
      title: variant.title,
      snapshot,
      parentId: parentNode.id,
      rootId: parentNode.rootId,
      skeletonId: snapshot.selectedSkeleton?.id ?? null,
      variantId: variant.id,
      sourceVariantId: entry.sourceVariantId ?? null,
      createdAt: entry.createdAt,
      activate: next.selectedVariantId === variant.id,
    });
    const addedNode = next.ideaHistory.nodes[next.ideaHistory.nodes.length - 1]!;
    next = appendStudyEvent(next, {
      stage: kind === "edit" ? "refine" : "compose",
      type: "idea_branch_created",
      targetIds: [addedNode.id, variant.id],
      result: kind,
      metadata: { rootId: addedNode.rootId, parentId: addedNode.parentId },
    });
  }

  // Very old outputs can predate FigureHistory. Keep them visible instead of dropping them.
  for (const variant of next.variants) {
    if (ideaNodeForVariant(next, variant.id)) continue;
    const sourceNode = ideaNodeForVariant(next, variant.sourceVariantId);
    const parentNode = sourceNode ?? fallbackRoot;
    const snapshot = sourceNode
      ? withIdeaSnapshotUpdates(
          next,
          next.ideaHistory.snapshots[sourceNode.snapshotId],
          { selectedVariantId: variant.id, studioSurface: variant.sourceVariantId ? "edit" : "candidate" },
          now,
        )
      : captureIdeaSnapshot(next, { selectedVariantId: variant.id, studioSurface: variant.sourceVariantId ? "edit" : "candidate", now });
    next = addIdeaHistoryNode(next, {
      kind: variant.sourceVariantId ? "edit" : "candidate",
      title: variant.title || "Earlier idea",
      snapshot,
      parentId: parentNode.id,
      rootId: parentNode.rootId,
      variantId: variant.id,
      sourceVariantId: variant.sourceVariantId ?? null,
      createdAt: now,
      activate: next.selectedVariantId === variant.id,
    });
    const addedNode = next.ideaHistory.nodes[next.ideaHistory.nodes.length - 1]!;
    next = appendStudyEvent(next, {
      stage: variant.sourceVariantId ? "refine" : "compose",
      type: "idea_branch_created",
      targetIds: [addedNode.id, variant.id],
      result: variant.sourceVariantId ? "edit" : "candidate",
      metadata: { rootId: addedNode.rootId, parentId: addedNode.parentId, migrated: true },
    });
  }
  const deletedAtByVariantId = new Map(
    next.variants
      .filter((variant) => Boolean(variant.deletedAt))
      .map((variant) => [variant.id, variant.deletedAt as string]),
  );
  if (deletedAtByVariantId.size === 0) return next;
  return {
    ...next,
    ideaHistory: {
      ...next.ideaHistory,
      nodes: next.ideaHistory.nodes.map((node) => {
        const deletedAt = node.variantId ? deletedAtByVariantId.get(node.variantId) : null;
        return deletedAt && node.deletedAt !== deletedAt
          ? { ...node, status: "archived", deletedAt }
          : node;
      }),
    },
  };
}

/**
 * Discard a generated figure and everything derived from it. The study log
 * keeps the record that the run happened; the workspace stops carrying it, so
 * the run rail, History, and the current selection never point at a figure the
 * author threw away. Branches below a removed node re-parent upward rather
 * than disappearing with it.
 */
export function removeVariantFromWorkspaceState(
  state: WorkspaceState,
  variantId: string,
  status?: string,
): WorkspaceState {
  const discarded = new Set<string>();
  const pending = [variantId];
  while (pending.length) {
    const current = pending.pop()!;
    if (discarded.has(current)) continue;
    discarded.add(current);
    for (const variant of state.variants) {
      if (variant.sourceVariantId === current) pending.push(variant.id);
    }
  }

  const variants = state.variants.filter((variant) => !discarded.has(variant.id));
  if (variants.length === state.variants.length) return state;

  const removedNodeIds = new Set(
    state.ideaHistory.nodes
      .filter((node) => node.variantId && discarded.has(node.variantId))
      .map((node) => node.id),
  );
  const parentById = new Map(state.ideaHistory.nodes.map((node) => [node.id, node.parentId] as const));
  const survivingParent = (parentId: string | null): string | null => {
    let cursor = parentId;
    const seen = new Set<string>();
    while (cursor && removedNodeIds.has(cursor) && !seen.has(cursor)) {
      seen.add(cursor);
      cursor = parentById.get(cursor) ?? null;
    }
    return cursor;
  };
  const nodes = state.ideaHistory.nodes
    .filter((node) => !removedNodeIds.has(node.id))
    .map((node) => {
      const parentId = survivingParent(node.parentId);
      const sourceVariantId = node.sourceVariantId && discarded.has(node.sourceVariantId)
        ? null
        : node.sourceVariantId;
      return parentId === node.parentId && sourceVariantId === node.sourceVariantId
        ? node
        : { ...node, parentId, sourceVariantId };
    });
  const liveSnapshotIds = new Set(nodes.map((node) => node.snapshotId));
  const activeNodeId = state.ideaHistory.activeNodeId && removedNodeIds.has(state.ideaHistory.activeNodeId)
    ? survivingParent(state.ideaHistory.activeNodeId) ?? nodes[nodes.length - 1]?.id ?? null
    : state.ideaHistory.activeNodeId;
  const previewNodeId = state.ideaHistory.previewNodeId && removedNodeIds.has(state.ideaHistory.previewNodeId)
    ? activeNodeId
    : state.ideaHistory.previewNodeId;

  const selectedVariantId = state.selectedVariantId && discarded.has(state.selectedVariantId)
    ? variants.find((variant) => !variant.sourceVariantId)?.id ?? variants[0]?.id ?? null
    : state.selectedVariantId;

  return {
    ...state,
    variants,
    selectedVariantId,
    figureHistory: state.figureHistory.filter((entry) => !discarded.has(entry.variantId)),
    candidateGenerationSnapshots: Object.fromEntries(
      Object.entries(state.candidateGenerationSnapshots).filter(([id]) => !discarded.has(id)),
    ),
    ideaHistory: {
      ...state.ideaHistory,
      nodes,
      snapshots: Object.fromEntries(
        Object.entries(state.ideaHistory.snapshots).filter(([id]) => liveSnapshotIds.has(id)),
      ),
      activeNodeId,
      previewNodeId,
    },
    status: status ?? state.status,
  };
}

export function saveIdeaCheckpoint(
  state: WorkspaceState,
  options: { title?: string; studioSurface?: IdeaStudioSurface; now?: string } = {},
): WorkspaceState {
  const now = options.now ?? new Date().toISOString();
  const prepared = ensureIdeaHistoryRoot(state, now);
  const root = prepared.ideaHistory.nodes.find((node) => node.id === prepared.ideaHistory.activeRootId) ??
    prepared.ideaHistory.nodes.find((node) => node.kind === "root")!;
  const parent = prepared.ideaHistory.nodes.find((node) => node.id === prepared.ideaHistory.activeNodeId) ?? root;
  const snapshot = captureIdeaSnapshot(prepared, { studioSurface: options.studioSurface, now });
  const checkpoints = prepared.ideaHistory.nodes.filter((node) => node.kind === "checkpoint").length;
  const titled = addIdeaHistoryNode(prepared, {
    kind: "checkpoint",
    title: options.title?.trim() || `Idea ${checkpoints + 1}`,
    snapshot,
    parentId: parent.id,
    rootId: parent.rootId,
    skeletonId: snapshot.selectedSkeleton?.id ?? null,
    variantId: snapshot.selectedVariantId,
    createdAt: now,
  });
  return appendStudyEvent({ ...titled, status: `Saved ${options.title?.trim() || `Idea ${checkpoints + 1}`}.` }, {
    stage: state.activeStudyStage,
    type: "idea_checkpoint_saved",
    targetIds: [titled.ideaHistory.activeNodeId!],
    result: "saved",
    metadata: { rootId: parent.rootId, fingerprint: snapshot.fingerprint },
  });
}

function currentIdeaHasUnsavedChanges(state: WorkspaceState): boolean {
  const activeNode = state.ideaHistory.nodes.find((node) => node.id === state.ideaHistory.activeNodeId);
  const activeSnapshot = activeNode ? state.ideaHistory.snapshots[activeNode.snapshotId] : null;
  if (!activeSnapshot) return false;
  return captureIdeaSnapshot(state).fingerprint !== activeSnapshot.fingerprint;
}

export function restoreIdeaHistoryNode(
  state: WorkspaceState,
  nodeId: string,
  now = new Date().toISOString(),
): WorkspaceState {
  let prepared = reconcileIdeaHistory(state, now);
  const node = prepared.ideaHistory.nodes.find((item) => item.id === nodeId);
  if (!node) return { ...prepared, status: "That idea is no longer available." };
  if (node.deletedAt) {
    return { ...prepared, status: `${node.title} was deleted from Edit and is kept in History as a record.` };
  }
  const snapshot = prepared.ideaHistory.snapshots[node.snapshotId];
  if (!snapshot) return { ...prepared, status: "That idea snapshot is unavailable." };
  if (currentIdeaHasUnsavedChanges(prepared)) {
    prepared = saveIdeaCheckpoint(prepared, { title: "Before restore", now });
  }
  const restoredRevision = prepared.promptRevisions.find((revision) => revision.id === snapshot.promptRevisionId);
  const fallbackRevision = restoredRevision ?? createPromptRevision(snapshot.prompt, "initial", snapshot.promptUpdatedAt || now);
  const selectedSkeleton = snapshot.selectedSkeleton;
  const nextCandidates = selectedSkeleton
    ? prepared.diagramSkeletonCandidates.some((candidate) => candidate.id === selectedSkeleton.id)
      ? prepared.diagramSkeletonCandidates.map((candidate) => candidate.id === selectedSkeleton.id
          ? cloneIdeaValue(selectedSkeleton)
          : candidate)
      : [...prepared.diagramSkeletonCandidates, cloneIdeaValue(selectedSkeleton)]
    : prepared.diagramSkeletonCandidates;
  const nextUsage = Object.fromEntries(prepared.board.map((item) => [
    item.id,
    cloneIdeaValue(snapshot.referenceUsage[item.id] ?? {}),
  ]));
  const restored: WorkspaceState = {
    ...prepared,
    prompt: snapshot.prompt,
    generationBrief: snapshot.prompt,
    promptUpdatedAt: snapshot.promptUpdatedAt,
    promptRevisions: restoredRevision ? prepared.promptRevisions : [...prepared.promptRevisions, fallbackRevision],
    currentPromptRevisionId: fallbackRevision.id,
    guidedDialogue: {
      ...prepared.guidedDialogue,
      skeletonPromptDraft: snapshot.promptDraft,
    },
    referenceUsage: nextUsage,
    layoutReferenceId: prepared.board.some((item) => item.id === snapshot.layoutReferenceId)
      ? snapshot.layoutReferenceId
      : null,
    canvasFocusReferenceId: prepared.board.some((item) => item.id === snapshot.styleReferenceId)
      ? snapshot.styleReferenceId
      : null,
    canvasGenerationReferenceIds: snapshot.canvasGenerationReferenceIds.filter((id) =>
      prepared.board.some((item) => item.id === id),
    ),
    activeStyleKit: normalizeStyleKit(cloneIdeaValue(snapshot.activeStyleKit)),
    styleAnalysisStates: snapshot.styleAnalysisState && snapshot.styleReferenceId
      ? { ...prepared.styleAnalysisStates, [snapshot.styleReferenceId]: cloneIdeaValue(snapshot.styleAnalysisState) }
      : prepared.styleAnalysisStates,
    styleVisualAnalyses: snapshot.styleVisualAnalysis && snapshot.styleReferenceId
      ? { ...prepared.styleVisualAnalyses, [snapshot.styleReferenceId]: cloneIdeaValue(snapshot.styleVisualAnalysis) }
      : prepared.styleVisualAnalyses,
    diagramSkeletonCandidates: nextCandidates,
    selectedDiagramSkeletonId: selectedSkeleton?.id ?? null,
    diagramSkeletonXml: selectedSkeleton?.xml ?? null,
    diagramSkeletonPlan: cloneIdeaValue(selectedSkeleton?.diagramPlan ?? null),
    diagramSkeletonMermaid: selectedSkeleton?.mermaid ?? null,
    diagramSkeletonPromptRevisionId: snapshot.diagramSkeletonPromptRevisionId,
    diagramSkeletonPromptFingerprint: snapshot.diagramSkeletonPromptFingerprint,
    skeletonCheckpointPlan: cloneIdeaValue(snapshot.skeletonCheckpointPlan),
    skeletonConfirmedAt: snapshot.skeletonConfirmedAt,
    nodeIconBindings: cloneIdeaValue(snapshot.nodeIconBindings),
    nodeFontBindings: cloneIdeaValue(snapshot.nodeFontBindings ?? {}),
    nodeColorBindings: cloneIdeaValue(snapshot.nodeColorBindings ?? {}),
    skeletonStyleApplications: selectedSkeleton && snapshot.skeletonStyleApplication
      ? {
          ...prepared.skeletonStyleApplications,
          [selectedSkeleton.id]: cloneIdeaValue(snapshot.skeletonStyleApplication),
        }
      : prepared.skeletonStyleApplications,
    lockedDiagramObjectIds: [...snapshot.lockedDiagramObjectIds],
    iconReferenceIds: [...snapshot.iconReferenceIds],
    iconReferenceId: snapshot.iconReferenceId,
    fontReferenceId: snapshot.fontReferenceId,
    paletteReferenceId: snapshot.paletteReferenceId,
    matchedStylePalette: cloneIdeaValue(snapshot.matchedStylePalette ?? null),
    selectedVariantId: snapshot.selectedVariantId && prepared.variants.some(
      (variant) => variant.id === snapshot.selectedVariantId && !variant.deletedAt,
    )
      ? snapshot.selectedVariantId
      : null,
    reviewResult: [],
    reviewFocusTargetIds: [],
    activeStudyStage: snapshot.studyStage,
    activeStudioStep: snapshot.studioSurface === "content" ? "prompt" : snapshot.studioSurface,
    ideaHistory: {
      ...prepared.ideaHistory,
      activeRootId: node.rootId,
      activeNodeId: node.id,
      previewNodeId: node.id,
      homeOpen: false,
    },
    status: `Restored ${node.title}. Continue from this point to create a new branch.`,
  };
  return appendStudyEvent(restored, {
    stage: snapshot.studyStage,
    type: "idea_node_restored",
    targetIds: [node.id, ...(node.skeletonId ? [node.skeletonId] : []), ...(node.variantId ? [node.variantId] : [])],
    result: node.kind,
    metadata: { rootId: node.rootId, fingerprint: snapshot.fingerprint },
  });
}

export function createNewIdeaRoot(state: WorkspaceState, now = new Date().toISOString()): WorkspaceState {
  let prepared = reconcileIdeaHistory(state, now);
  if (currentIdeaHasUnsavedChanges(prepared)) {
    prepared = saveIdeaCheckpoint(prepared, { title: "Before new figure", now });
  }
  const prompt = prepared.assignedTaskSnapshot.brief;
  const revision = createPromptRevision(prompt, "initial", now);
  const clearedUsage = Object.fromEntries(prepared.board.map((item) => [item.id, {}]));
  const cleared: WorkspaceState = {
    ...prepared,
    prompt,
    generationBrief: prompt,
    promptUpdatedAt: now,
    promptRevisions: [...prepared.promptRevisions, revision],
    currentPromptRevisionId: revision.id,
    guidedDialogue: createGuidedDialogueState(prompt),
    referenceUsage: clearedUsage,
    layoutReferenceId: null,
    canvasFocusReferenceId: null,
    canvasGenerationReferenceIds: [],
    activeStyleKit: createEmptyStyleKit(now),
    selectedDiagramSkeletonId: null,
    diagramSkeletonXml: null,
    diagramSkeletonPlan: null,
    diagramSkeletonMermaid: null,
    diagramSkeletonPromptRevisionId: null,
    diagramSkeletonPromptFingerprint: null,
    skeletonCheckpointPlan: null,
    skeletonConfirmedAt: null,
    nodeIconBindings: {},
    nodeFontBindings: {},
    nodeColorBindings: {},
    lockedDiagramObjectIds: [],
    iconReferenceIds: [],
    fontReferenceId: null,
    paletteReferenceId: null,
    matchedStylePalette: null,
    selectedVariantId: null,
    reviewResult: [],
    reviewFocusTargetIds: [],
    activeStudyStage: "brief",
    activeStudioStep: "prompt",
  };
  const rootCount = prepared.ideaHistory.nodes.filter((node) => node.kind === "root").length;
  const rootId = `idea-root-${Date.parse(now) || Date.now()}-${rootCount + 1}`;
  const snapshot = captureIdeaSnapshot(cleared, { studioSurface: "content", now });
  const rooted = addIdeaHistoryNode(cleared, {
    kind: "root",
    title: `Figure ${rootCount + 1}`,
    snapshot,
    parentId: null,
    rootId,
    createdAt: now,
  });
  return appendStudyEvent({
    ...rooted,
    ideaHistory: { ...rooted.ideaHistory, homeOpen: false },
    status: `Figure ${rootCount + 1} started from the assigned task. Retrieved references remain available.`,
  }, {
    stage: "brief",
    type: "idea_root_created",
    targetIds: [rootId],
    result: "assigned_task",
    metadata: { rootId, taskVersion: rooted.studyTaskVersion },
  });
}

const STUDY_STAGE_ORDER: StudyStage[] = ["brief", "references", "skeleton", "compose", "refine", "review"];
const STUDY_PHASE_ORDER: StudyPhase[] = ["envision", "externalize", "evolve"];

/**
 * Move between study stages without treating navigation as completion.
 * This is frontend-only state bookkeeping; it never changes a model request.
 */
export function transitionStudyStage(
  state: WorkspaceState,
  targetStage: StudyStage,
  options: {
    status?: string;
    targetIds?: string[];
    metadata?: Record<string, string | number | boolean | null>;
  } = {},
): WorkspaceState {
  if (state.studySessionStatus === "finished") return state;

  const fromStage = state.activeStudyStage;
  const fromPhase = studyPhaseForStage(fromStage);
  const targetPhase = studyPhaseForStage(targetStage);
  const stageChanged = fromStage !== targetStage;
  const phaseChanged = fromPhase !== targetPhase;
  const targetIds = options.targetIds ?? [];
  let next: WorkspaceState = {
    ...state,
    activeStudyStage: targetStage,
    activeStudyPhase: targetPhase,
    visitedStudyStages: Array.from(new Set([...state.visitedStudyStages, targetStage])),
    visitedStudyPhases: Array.from(new Set([...(state.visitedStudyPhases ?? [fromPhase]), targetPhase])),
    status: options.status ?? state.status,
  };

  if (phaseChanged) {
    const type = state.visitedStudyPhases?.includes(targetPhase)
      ? "phase_revisited"
      : STUDY_PHASE_ORDER.indexOf(targetPhase) > STUDY_PHASE_ORDER.indexOf(fromPhase) + 1
        ? "phase_skipped"
        : "phase_entered";
    next = appendStudyEvent(next, {
      stage: fromStage,
      type,
      targetIds,
      result: targetPhase,
      metadata: {
        ...options.metadata,
        phase: targetPhase,
        fromPhase,
        toPhase: targetPhase,
        fromStage,
        toStage: targetStage,
      },
    });
  }

  if (stageChanged) {
    const type = state.visitedStudyStages.includes(targetStage)
      ? "stage_revisited"
      : STUDY_STAGE_ORDER.indexOf(targetStage) > STUDY_STAGE_ORDER.indexOf(fromStage) + 1
        ? "stage_skipped"
        : "stage_entered";
    next = appendStudyEvent(next, {
      stage: fromStage,
      type,
      targetIds,
      result: targetStage,
      metadata: {
        ...options.metadata,
        phase: targetPhase,
        from: fromStage,
        to: targetStage,
        fromPhase,
        toPhase: targetPhase,
      },
    });
  }

  return next;
}

export function updateActiveCreativeCanvasState(
  current: WorkspaceState,
  nextCanvas: CreativeCanvasState,
  options: { trackUndo?: boolean } = {},
): Pick<
  WorkspaceState,
  "activeCreativeCanvasId" | "creativeCanvases" | "creativeCanvas" | "creativeCanvasUndoStack"
> {
  const now = new Date().toISOString();
  const fallbackCanvas = current.creativeCanvas ?? createDefaultCreativeCanvas();
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
  const activeDocument = activeCreativeCanvasDocument(documents, current.activeCreativeCanvasId);
  const trackUndo = options.trackUndo ?? true;
  const previousCanvas = activeDocument.canvas ?? fallbackCanvas;
  const undoStack = trackUndo
    ? [...(activeDocument.undoStack ?? current.creativeCanvasUndoStack ?? []), previousCanvas].slice(-80)
    : activeDocument.undoStack ?? current.creativeCanvasUndoStack ?? [];
  const creativeCanvases = documents.map((document) =>
    document.id === activeDocument.id
      ? { ...document, canvas: nextCanvas, undoStack, updatedAt: now }
      : document,
  );
  return {
    activeCreativeCanvasId: activeDocument.id,
    creativeCanvases,
    creativeCanvas: nextCanvas,
    creativeCanvasUndoStack: undoStack,
  };
}

const STORAGE_KEY = "hichart-workspace-ai-papers-v3";
const USER_STORAGE_PREFIX = "hichart-workspace-ai-papers-v3-user:";
const IMAGE_DB_NAME = "hichart-workspace-images";
const IMAGE_DB_VERSION = 1;
const IMAGE_STORE_NAME = "variantPreviews";

/** Base64 payloads blow past ~5MB localStorage quotas quickly — strip before JSON.stringify. */
const MAX_PERSIST_GENERATION_PROMPT_CHARS = 24_000;
const MAX_PERSIST_SELECTED_SVG_CHARS = 220_000;

function normalizeAssignedTaskSnapshot(
  value: AssignedStudyTaskSnapshot | null | undefined,
  fallback: AssignedStudyTaskSnapshot,
): AssignedStudyTaskSnapshot {
  if (!value || typeof value !== "object") return fallback;
  const version = typeof value.version === "string" && value.version ? value.version : fallback.version;
  const title = typeof value.title === "string" && value.title ? value.title : fallback.title;
  const audience = typeof value.audience === "string" ? value.audience : fallback.audience;
  const brief = typeof value.brief === "string" && value.brief ? value.brief : fallback.brief;
  const requirements = Array.isArray(value.requirements)
    ? value.requirements.filter((item): item is string => typeof item === "string")
    : fallback.requirements;
  return {
    version,
    title,
    audience,
    brief,
    requirements,
    fingerprint: createAssignedTaskFingerprint({ version, title, audience, brief, requirements }),
  };
}

function isPromptRevisionSource(value: unknown): value is PromptRevisionSource {
  return value === "initial" || value === "blur" || value === "narrator_send" || value === "retrieval" ||
    value === "outline_regeneration" || value === "skeleton_generation" || value === "first_generation";
}

function normalizePromptRevisionHistory(
  value: PromptRevision[] | null | undefined,
  workingPrompt: string,
  fallbackUpdatedAt: string,
): PromptRevision[] {
  const normalized = (Array.isArray(value) ? value : []).flatMap((revision) => {
    if (!revision || typeof revision !== "object" || typeof revision.text !== "string") return [];
    const fingerprint = createPromptFingerprint(revision.text);
    const createdAt = typeof revision.createdAt === "string" && revision.createdAt
      ? revision.createdAt
      : fallbackUpdatedAt;
    return [{
      id: typeof revision.id === "string" && revision.id
        ? revision.id
        : createPromptRevision(revision.text, "initial", createdAt).id,
      text: revision.text,
      fingerprint,
      createdAt,
      source: isPromptRevisionSource(revision.source) ? revision.source : "initial",
    } satisfies PromptRevision];
  }).slice(-80);
  const workingFingerprint = createPromptFingerprint(workingPrompt);
  if (normalized.some((revision) => revision.fingerprint === workingFingerprint && revision.text === workingPrompt)) {
    return normalized;
  }
  return [...normalized, createPromptRevision(workingPrompt, "initial", fallbackUpdatedAt)].slice(-80);
}

export function isLegacyAutoSeededStudyPrompt(
  workingPrompt: string,
  assignedTaskBrief: string,
  revisions: PromptRevision[] | null | undefined,
): boolean {
  const prompt = workingPrompt.trim();
  const brief = assignedTaskBrief.trim();
  if (!prompt || !brief || prompt !== brief) return false;
  return (Array.isArray(revisions) ? revisions : []).every((revision) =>
    revision?.source === "initial" && revision.text.trim() === brief,
  );
}

function normalizeCandidateGenerationSnapshots(
  value: Record<string, CandidateGenerationSnapshot> | null | undefined,
  validIconIds: Set<string>,
): Record<string, CandidateGenerationSnapshot> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, snapshot]) => {
    if (!snapshot || typeof snapshot !== "object") return [];
    const variantId = typeof snapshot.variantId === "string" && snapshot.variantId ? snapshot.variantId : key;
    if (!variantId) return [];
    const workingPrompt = typeof snapshot.workingPrompt === "string" ? snapshot.workingPrompt : "";
    return [[variantId, {
      variantId,
      createdAt: typeof snapshot.createdAt === "string" ? snapshot.createdAt : new Date(0).toISOString(),
      promptRevisionId: typeof snapshot.promptRevisionId === "string" ? snapshot.promptRevisionId : null,
      promptFingerprint: createPromptFingerprint(workingPrompt),
      workingPrompt,
      skeletonId: typeof snapshot.skeletonId === "string" ? snapshot.skeletonId : null,
      skeletonXml: typeof snapshot.skeletonXml === "string" ? snapshot.skeletonXml : null,
      styleReferenceId: typeof snapshot.styleReferenceId === "string" ? snapshot.styleReferenceId : null,
      nodeIconBindings: Object.fromEntries(
        Object.entries(snapshot.nodeIconBindings ?? {}).filter(([, iconId]) => validIconIds.has(iconId)),
      ) as Record<string, ScientificIconReferenceId>,
      matchAppearanceFingerprint: typeof snapshot.matchAppearanceFingerprint === "string"
        ? snapshot.matchAppearanceFingerprint
        : "font:none|palette:none",
      styleKitFingerprint: typeof snapshot.styleKitFingerprint === "string"
        ? snapshot.styleKitFingerprint
        : "",
      authorDecisionSnapshot: Array.isArray(snapshot.authorDecisionSnapshot)
        ? snapshot.authorDecisionSnapshot
            .map(normalizeNarratorDecision)
            .filter((decision): decision is NarratorDecision => Boolean(decision))
        : [],
    } satisfies CandidateGenerationSnapshot]];
  }));
}

const seededDefaultWorkspaceState = createDemoWorkspaceStateHydrated();

export const defaultWorkspaceState: WorkspaceState = {
  ...seededDefaultWorkspaceState,
  workspaceView: "studio",
  activeStudioStep: seededDefaultWorkspaceState.activeStudioStep ?? "prompt",
  activeStudyPhase: studyPhaseForStage(seededDefaultWorkspaceState.activeStudyStage),
  visitedStudyPhases: Array.from(
    new Set(seededDefaultWorkspaceState.visitedStudyStages.map((stage) => studyPhaseForStage(stage))),
  ),
  completedStudyPhases: Array.from(
    new Set(seededDefaultWorkspaceState.completedStudyStages.map((stage) => studyPhaseForStage(stage))),
  ),
  skeletonCheckpointPlan: null,
  reviewFocusTargetIds: [],
  guidedDialogue: {
    ...normalizeGuidedDialogueState(seededDefaultWorkspaceState.guidedDialogue),
    skeletonPromptDraft:
      normalizeGuidedDialogueState(seededDefaultWorkspaceState.guidedDialogue).skeletonPromptDraft ||
      seededDefaultWorkspaceState.prompt,
  },
  styleAnalysisStates: normalizeStyleAnalysisStates(seededDefaultWorkspaceState.styleAnalysisStates),
  activeStyleKit: normalizeStyleKit(seededDefaultWorkspaceState.activeStyleKit),
  skeletonStyleApplications: normalizeSkeletonStyleApplications(
    seededDefaultWorkspaceState.skeletonStyleApplications,
  ),
};

function recoveryMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value ? value : null;
}

function recoveryMetadataBoolean(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): boolean {
  return metadata?.[key] === true;
}

function recoveryMetadataNumber(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recoveryMetadataStrings(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string[] {
  const value = metadata?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecoverableStudyArtifact(artifact: StudyRecoveryArtifact): boolean {
  return artifact.kind === "workspace" || artifact.kind === "skeleton" || artifact.kind === "candidate" || artifact.kind === "revision";
}

/** Keep recovery scoped to the newest session with a workspace checkpoint or generated figure artifact. */
export function latestRecoverableStudySessionArtifacts(
  artifacts: StudyRecoveryArtifact[],
): StudyRecoveryArtifact[] {
  const latestArtifact = artifacts
    .filter(isRecoverableStudyArtifact)
    .reduce<StudyRecoveryArtifact | null>(
      (latest, artifact) => !latest || latest.receivedAt.localeCompare(artifact.receivedAt) < 0
        ? artifact
        : latest,
      null,
    );
  return latestArtifact
    ? artifacts.filter((artifact) => artifact.sessionId === latestArtifact.sessionId)
    : [];
}

/** Merge durable study archives into a browser workspace without replacing live authoring state. */
export function mergeRecoveredStudyArtifacts(
  state: WorkspaceState,
  artifacts: StudyRecoveryArtifact[],
  options: { restoreCheckpoint?: boolean } = {},
): WorkspaceState {
  const latestCheckpoint = artifacts
    .filter((artifact) => artifact.kind === "workspace" && artifact.textFormat === "json" && artifact.textContent)
    .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))[0] ?? null;
  let baseState = state;
  let recoveredCheckpoint = false;
  if (options.restoreCheckpoint !== false && latestCheckpoint?.textContent) {
    try {
      const parsed = JSON.parse(latestCheckpoint.textContent) as {
        schemaVersion?: unknown;
        state?: Partial<WorkspaceState>;
      };
      if (parsed.schemaVersion === 1 && parsed.state && typeof parsed.state === "object") {
        baseState = {
          ...state,
          ...parsed.state,
          // Identity and live session mechanics belong to the sign-in that is
          // performing recovery, not to the archived browser snapshot.
          studyProfile: state.studyProfile,
          studySessionId: state.studySessionId,
          studySessionStartedAt: state.studySessionStartedAt,
          studySessionStatus: state.studySessionStatus,
          studyEvents: state.studyEvents,
          variants: state.variants,
          figureHistory: state.figureHistory,
          diagramSkeletonCandidates: state.diagramSkeletonCandidates,
          diagramSkeletonXml: state.diagramSkeletonXml,
          diagramSkeletonMermaid: state.diagramSkeletonMermaid,
          diagramSkeletonPlan: state.diagramSkeletonPlan,
          ideaHistory: state.ideaHistory,
          workspaceVersions: state.workspaceVersions,
          activeWorkspaceVersionId: state.activeWorkspaceVersionId,
          creativeCanvas: state.creativeCanvas,
          creativeCanvases: state.creativeCanvases,
          creativeCanvasUndoStack: state.creativeCanvasUndoStack,
          status: state.status,
        };
        recoveredCheckpoint = true;
      }
    } catch {
      // Older or partially written checkpoints do not block artifact recovery.
    }
  }

  const recoveredReferences = artifacts.filter((artifact) => artifact.kind === "reference");
  const boardById = new Map(baseState.board.map((reference) => [reference.id, reference] as const));
  const referencesById = new Map(baseState.references.map((reference) => [reference.id, reference] as const));
  const referenceUsage = { ...baseState.referenceUsage };
  for (const artifact of recoveredReferences) {
    const referenceId = recoveryMetadataString(artifact.metadata, "referenceId");
    if (!referenceId) continue;
    const existing = boardById.get(referenceId) ?? referencesById.get(referenceId);
    const recovered: ReferenceItem = {
      id: referenceId,
      title: artifact.title || existing?.title || "Recovered reference",
      sourcePaper: recoveryMetadataString(artifact.metadata, "sourcePaper") ?? existing?.sourcePaper ?? "Recovered study archive",
      venue: recoveryMetadataString(artifact.metadata, "venue") ?? existing?.venue ?? "HiFigure",
      year: recoveryMetadataNumber(artifact.metadata, "year") ?? existing?.year ?? new Date().getFullYear(),
      imageType: recoveryMetadataString(artifact.metadata, "imageType") ?? existing?.imageType ?? "scientific figure",
      subject: recoveryMetadataString(artifact.metadata, "subject") ?? existing?.subject ?? "",
      styleTags: recoveryMetadataStrings(artifact.metadata, "styleTags").length
        ? recoveryMetadataStrings(artifact.metadata, "styleTags")
        : existing?.styleTags ?? [],
      similarityReason: recoveryMetadataString(artifact.metadata, "similarityReason") ?? existing?.similarityReason ?? "Recovered from the study archive.",
      thumbnail: existing?.thumbnail ?? "REC",
      thumbnailUrl: artifact.artifactUrl ?? artifact.imageUrl ?? existing?.thumbnailUrl ?? null,
      imageDataUrl: existing?.imageDataUrl ?? null,
      structuralAnalysis: recoveryMetadataString(artifact.metadata, "structuralAnalysis") ?? existing?.structuralAnalysis ?? "",
    };
    boardById.set(referenceId, recovered);
    referencesById.set(referenceId, recovered);
    const role = recoveryMetadataString(artifact.metadata, "role");
    if (role === "layout" || role === "style") {
      referenceUsage[referenceId] = { ...referenceUsage[referenceId], [role]: true };
    }
  }

  const recoveredIcons = artifacts.filter((artifact) => artifact.kind === "icon");
  const iconsById = new Map(baseState.customIconReferences.map((icon) => [icon.id, icon] as const));
  for (const artifact of recoveredIcons) {
    const iconId = recoveryMetadataString(artifact.metadata, "iconId");
    const cropDataUrl = artifact.artifactUrl ?? artifact.imageUrl ?? null;
    if (!iconId || !cropDataUrl) continue;
    const existing = iconsById.get(iconId);
    const iconKind = recoveryMetadataString(artifact.metadata, "iconKind");
    iconsById.set(iconId, {
      id: iconId,
      label: recoveryMetadataString(artifact.metadata, "label") ?? artifact.title ?? existing?.label ?? "Recovered icon",
      tags: recoveryMetadataStrings(artifact.metadata, "tags").length
        ? recoveryMetadataStrings(artifact.metadata, "tags")
        : existing?.tags ?? [],
      description: recoveryMetadataString(artifact.metadata, "description") ?? existing?.description ?? "Recovered workspace icon.",
      cropDataUrl,
      cropStorageKey: null,
      sourceReferenceId: recoveryMetadataString(artifact.metadata, "sourceReferenceId") ?? existing?.sourceReferenceId ?? "study-archive",
      sourceRegionId: recoveryMetadataString(artifact.metadata, "sourceRegionId") ?? existing?.sourceRegionId ?? `recovered-${iconId}`,
      kind: iconKind === "style-crop" ? "style-crop" : iconKind === "icon" ? "icon" : existing?.kind,
      contentHash: recoveryMetadataString(artifact.metadata, "contentHash") ?? existing?.contentHash,
      createdAt: recoveryMetadataString(artifact.metadata, "createdAt") ?? existing?.createdAt ?? artifact.receivedAt,
      stale: recoveryMetadataBoolean(artifact.metadata, "stale") || existing?.stale,
    });
  }

  const board = Array.from(boardById.values());
  const references = Array.from(referencesById.values());
  const layoutReferenceId = baseState.layoutReferenceId && boardById.has(baseState.layoutReferenceId)
    ? baseState.layoutReferenceId
    : board.find((reference) => referenceUsage[reference.id]?.layout)?.id ?? null;
  const canvasFocusReferenceId = baseState.canvasFocusReferenceId && boardById.has(baseState.canvasFocusReferenceId)
    ? baseState.canvasFocusReferenceId
    : board.find((reference) => referenceUsage[reference.id]?.style)?.id ?? layoutReferenceId;
  baseState = {
    ...baseState,
    board,
    references,
    referenceUsage,
    layoutReferenceId,
    canvasFocusReferenceId,
    canvasGenerationReferenceIds: baseState.canvasGenerationReferenceIds.filter((id) => boardById.has(id)).length
      ? baseState.canvasGenerationReferenceIds.filter((id) => boardById.has(id))
      : board.map((reference) => reference.id),
    customIconReferences: normalizeStoredCustomIconReferences(Array.from(iconsById.values())),
  };

  const relevant = artifacts.filter(isRecoverableStudyArtifact);
  if (relevant.length === 0 && !recoveredCheckpoint && recoveredReferences.length === 0 && recoveredIcons.length === 0) {
    return state;
  }

  const latestSkeletonById = new Map<string, StudyRecoveryArtifact>();
  for (const artifact of relevant) {
    if (artifact.kind !== "skeleton") continue;
    const skeletonId = recoveryMetadataString(artifact.metadata, "skeletonId") ?? artifact.outputId.split("@")[0];
    const previous = latestSkeletonById.get(skeletonId);
    if (!previous || previous.receivedAt.localeCompare(artifact.receivedAt) < 0) {
      latestSkeletonById.set(skeletonId, artifact);
    }
  }

  const recoveredSkeletons = Array.from(latestSkeletonById.entries())
    .sort(([, left], [, right]) => left.receivedAt.localeCompare(right.receivedAt))
    .map(([skeletonId, artifact]): DiagramSkeletonCandidate => ({
      id: skeletonId,
      title: artifact.title || "Recovered Skeleton",
      referenceId: recoveryMetadataString(artifact.metadata, "referenceId"),
      referenceTitle: recoveryMetadataString(artifact.metadata, "referenceTitle") ?? "Recovered study archive",
      createdAt: recoveryMetadataString(artifact.metadata, "createdAt") ?? artifact.receivedAt,
      source: recoveryMetadataString(artifact.metadata, "source") ?? "study-archive-recovery",
      initialXml: artifact.textFormat === "xml" ? artifact.textContent ?? null : null,
      xml: artifact.textFormat === "xml" ? artifact.textContent ?? null : null,
      mermaid: artifact.textFormat === "mermaid" ? artifact.textContent ?? null : null,
      diagramPlan: null,
      revisions: [],
    }));
  const skeletonById = new Map(baseState.diagramSkeletonCandidates.map((candidate) => [candidate.id, candidate] as const));
  for (const recovered of recoveredSkeletons) {
    const existing = skeletonById.get(recovered.id);
    skeletonById.set(recovered.id, existing
      ? {
          ...existing,
          initialXml: existing.initialXml || recovered.initialXml,
          xml: existing.xml || recovered.xml,
          mermaid: existing.mermaid || recovered.mermaid,
        }
      : recovered);
  }
  const diagramSkeletonCandidates = Array.from(skeletonById.values());

  const recoveredOutputArtifacts = relevant
    .filter((artifact) => artifact.kind === "candidate" || artifact.kind === "revision")
    .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
  const variantById = new Map(baseState.variants.map((variant) => [variant.id, variant] as const));
  for (const artifact of recoveredOutputArtifacts) {
    if (variantById.has(artifact.outputId)) continue;
    variantById.set(artifact.outputId, {
      id: artifact.outputId,
      title: artifact.title || (artifact.kind === "revision" ? "Recovered Edit" : "Recovered Candidate"),
      description: recoveryMetadataString(artifact.metadata, "description") ?? "Recovered from the durable study archive.",
      layoutStrategy: recoveryMetadataString(artifact.metadata, "layoutStrategy") ?? "recovered",
      sourceVariantId: recoveryMetadataString(artifact.metadata, "sourceVariantId"),
      previewImageUrl: artifact.artifactUrl ?? artifact.imageUrl ?? null,
      previewImageDataUrl: null,
      draftPreviewImageUrl: null,
      draftPreviewImageDataUrl: null,
      svg: "",
      generationPrompt: recoveryMetadataString(artifact.metadata, "generationPrompt"),
      draftGenerationPrompt: null,
      diagramPlan: null,
    });
  }
  const recoveryRank = new Map(recoveredOutputArtifacts.map((artifact) => [artifact.outputId, artifact.receivedAt] as const));
  const storageRank = new Map(baseState.variants.map((variant, index) => [variant.id, index] as const));
  const variants = Array.from(variantById.values()).sort((left, right) => {
    const leftTime = recoveryRank.get(left.id);
    const rightTime = recoveryRank.get(right.id);
    if (leftTime && rightTime) return rightTime.localeCompare(leftTime);
    if (leftTime) return 1;
    if (rightTime) return -1;
    return (storageRank.get(left.id) ?? 0) - (storageRank.get(right.id) ?? 0);
  });

  const historyByVariantId = new Map(baseState.figureHistory.map((entry) => [entry.variantId, entry] as const));
  for (const artifact of recoveredOutputArtifacts) {
    if (historyByVariantId.has(artifact.outputId)) continue;
    historyByVariantId.set(artifact.outputId, {
      id: `recovered-history-${artifact.outputId}`,
      variantId: artifact.outputId,
      title: artifact.title || (artifact.kind === "revision" ? "Recovered Edit" : "Recovered Candidate"),
      previewImageUrl: artifact.artifactUrl ?? artifact.imageUrl ?? null,
      previewImageStorageKey: null,
      sourceStage: artifact.kind === "revision" ? "refine" : "compose",
      sourceType: artifact.kind === "revision" ? "modify" : "generate",
      sourceVariantId: recoveryMetadataString(artifact.metadata, "sourceVariantId"),
      createdAt: artifact.receivedAt,
    });
  }
  const figureHistory = Array.from(historyByVariantId.values())
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const selectedSkeletonId =
    baseState.selectedDiagramSkeletonId && diagramSkeletonCandidates.some((candidate) => candidate.id === baseState.selectedDiagramSkeletonId)
      ? baseState.selectedDiagramSkeletonId
      : Array.from(latestSkeletonById.entries()).find(([, artifact]) =>
          recoveryMetadataBoolean(artifact.metadata, "selected"))?.[0]
        ?? recoveredSkeletons.at(-1)?.id
        ?? null;
  const selectedSkeleton = selectedSkeletonId
    ? diagramSkeletonCandidates.find((candidate) => candidate.id === selectedSkeletonId) ?? null
    : null;
  const selectedVariantId =
    baseState.selectedVariantId && variants.some((variant) => variant.id === baseState.selectedVariantId)
      ? baseState.selectedVariantId
      : recoveredOutputArtifacts.find((artifact) => recoveryMetadataBoolean(artifact.metadata, "selected"))?.outputId
        ?? variants[0]?.id
        ?? null;
  const recoveredCount =
    (recoveredCheckpoint ? 1 : 0) +
    recoveredReferences.filter((artifact) => {
      const referenceId = recoveryMetadataString(artifact.metadata, "referenceId");
      const existing = referenceId ? state.board.find((item) => item.id === referenceId) : null;
      return Boolean(referenceId && (!existing || (!existing.imageDataUrl && !existing.thumbnailUrl)));
    }).length +
    recoveredIcons.filter((artifact) => {
      const iconId = recoveryMetadataString(artifact.metadata, "iconId");
      const existing = iconId ? state.customIconReferences.find((item) => item.id === iconId) : null;
      return Boolean(iconId && (!existing || !existing.cropDataUrl));
    }).length +
    recoveredSkeletons.filter((candidate) => !baseState.diagramSkeletonCandidates.some((existing) => existing.id === candidate.id)).length +
    recoveredSkeletons.filter((candidate) => {
      const existing = baseState.diagramSkeletonCandidates.find((item) => item.id === candidate.id);
      return Boolean(existing && ((!existing.xml && candidate.xml) || (!existing.mermaid && candidate.mermaid)));
    }).length +
    recoveredOutputArtifacts.filter((artifact) => !baseState.variants.some((variant) => variant.id === artifact.outputId)).length;
  if (recoveredCount === 0) return state;

  return {
    ...baseState,
    diagramSkeletonCandidates,
    selectedDiagramSkeletonId: selectedSkeletonId,
    diagramSkeletonXml: baseState.diagramSkeletonXml || selectedSkeleton?.xml || null,
    diagramSkeletonMermaid: baseState.diagramSkeletonMermaid || selectedSkeleton?.mermaid || null,
    diagramSkeletonPlan: baseState.diagramSkeletonPlan || selectedSkeleton?.diagramPlan || null,
    variants,
    selectedVariantId,
    figureHistory,
    status: `Recovered ${recoveredCount} workspace artifact${recoveredCount === 1 ? "" : "s"} from the study archive.`,
  };
}

function userWorkspaceStorageKey(userId: string): string {
  return `${USER_STORAGE_PREFIX}${encodeURIComponent(userId.trim().toLowerCase())}`;
}

function truncateGenerationPrompt(prompt: string | null | undefined): string | null {
  if (!prompt) return prompt ?? null;
  if (prompt.length <= MAX_PERSIST_GENERATION_PROMPT_CHARS) return prompt;
  return `${prompt.slice(0, MAX_PERSIST_GENERATION_PROMPT_CHARS)}\n…[truncated for browser storage quota]`;
}

function truncateSvgForStorage(svg: string, selected: boolean): string {
  if (!selected) return "";
  if (svg.length <= MAX_PERSIST_SELECTED_SVG_CHARS) return svg;
  return "";
}

function openImageDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = window.indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
        db.createObjectStore(IMAGE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.error("Failed to open workspace image database", request.error);
      resolve(null);
    };
  });
}

function putWorkspaceArtifact(key: string, value: unknown): Promise<void> {
  return openImageDatabase().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) {
          resolve();
          return;
        }
        const transaction = db.transaction(IMAGE_STORE_NAME, "readwrite");
        transaction.objectStore(IMAGE_STORE_NAME).put(value, key);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          console.error("Failed to persist generated preview image", transaction.error);
          db.close();
          resolve();
        };
      }),
  );
}

function getWorkspaceArtifact(key: string): Promise<unknown | null> {
  return openImageDatabase().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        const transaction = db.transaction(IMAGE_STORE_NAME, "readonly");
        const request = transaction.objectStore(IMAGE_STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => resolve(null);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => db.close();
      }),
  );
}

function putVariantPreviewImage(key: string, dataUrl: string): Promise<void> {
  if (!dataUrl.startsWith("data:image/")) return Promise.resolve();
  return putWorkspaceArtifact(key, dataUrl);
}

async function getVariantPreviewImage(key: string): Promise<string | null> {
  const value = await getWorkspaceArtifact(key);
  return typeof value === "string" ? value : null;
}

function previewImageStorageKeys(
  workspaceKey: string,
  variantId: string,
  userId?: string | null,
  stage: "preview" | "draft" = "preview",
): string[] {
  const keys = [`${workspaceKey}:variant:${variantId}:${stage}`];
  const cleanUserId = userId?.trim();
  if (cleanUserId) keys.push(`${userWorkspaceStorageKey(cleanUserId)}:variant:${variantId}:${stage}`);
  if (stage === "preview") {
    keys.push(`${workspaceKey}:variant:${variantId}`);
    if (cleanUserId) keys.push(`${userWorkspaceStorageKey(cleanUserId)}:variant:${variantId}`);
  }
  return Array.from(new Set(keys));
}

function controlImageStorageKeys(
  workspaceKey: string,
  item: CreativeCanvasItem,
  userId?: string | null,
): string[] {
  const keys = [
    item.controlImageStorageKey,
    `${workspaceKey}:control:${item.id}`,
  ].filter((key): key is string => Boolean(key));
  const cleanUserId = userId?.trim();
  if (cleanUserId) keys.push(`${userWorkspaceStorageKey(cleanUserId)}:control:${item.id}`);
  return Array.from(new Set(keys));
}

function referenceImageStorageKeys(
  workspaceKey: string,
  referenceId: string,
  userId?: string | null,
): string[] {
  const keys = [`${workspaceKey}:reference:${referenceId}`];
  const cleanUserId = userId?.trim();
  if (cleanUserId) {
    keys.push(`${userWorkspaceStorageKey(cleanUserId)}:reference:${referenceId}`);
  }
  return Array.from(new Set(keys));
}

function skeletonStorageKeys(
  workspaceKey: string,
  skeletonId: string,
  userId?: string | null,
): string[] {
  const keys = [`${workspaceKey}:skeleton:${skeletonId}`];
  const cleanUserId = userId?.trim();
  if (cleanUserId) {
    keys.push(`${userWorkspaceStorageKey(cleanUserId)}:skeleton:${skeletonId}`);
  }
  return Array.from(new Set(keys));
}

function customIconCropStorageKey(
  workspaceKey: string,
  icon: Pick<CustomIconReference, "id" | "cropDataUrl" | "contentHash" | "cropStorageKey">,
): string {
  return icon.cropStorageKey ??
    `${workspaceKey}:custom-icon:${icon.id}:${icon.contentHash || customIconContentHash(icon.cropDataUrl)}`;
}

function styleRegionCropStorageKey(
  workspaceKey: string,
  region: Pick<ReferenceRegion, "id">,
  cropDataUrl: string,
  savedKey?: string | null,
): string {
  return savedKey ?? `${workspaceKey}:style-region:${region.id}:${customIconContentHash(cropDataUrl)}`;
}

function persistVariantPreviewImages(workspaceKey: string, state: WorkspaceState) {
  const writes: Promise<void>[] = [];
  for (const variant of state.variants) {
    const dataUrl =
      variant.previewImageDataUrl ??
      (variant.previewImageUrl?.startsWith("data:image/") ? variant.previewImageUrl : null);
    if (dataUrl) {
      for (const key of previewImageStorageKeys(workspaceKey, variant.id, state.studyProfile?.userId)) {
        writes.push(putVariantPreviewImage(key, dataUrl));
      }
    }
    const draftDataUrl =
      variant.draftPreviewImageDataUrl ??
      (variant.draftPreviewImageUrl?.startsWith("data:image/") ? variant.draftPreviewImageUrl : null);
    if (!draftDataUrl) continue;
    for (const key of previewImageStorageKeys(workspaceKey, variant.id, state.studyProfile?.userId, "draft")) {
      writes.push(putVariantPreviewImage(key, draftDataUrl));
    }
  }
  if (writes.length > 0) {
    void Promise.all(writes);
  }
}

function persistCreativeCanvasControlImages(workspaceKey: string, state: WorkspaceState) {
  const writes: Promise<void>[] = [];
  const canvases = [state.creativeCanvas, ...state.creativeCanvases.map((document) => document.canvas)];
  const seenItemIds = new Set<string>();
  for (const canvas of canvases) {
    for (const item of canvas.items) {
      if (item.type !== "control" || seenItemIds.has(item.id)) continue;
      seenItemIds.add(item.id);
      const dataUrl = item.controlImageDataUrl?.startsWith("data:image/") ? item.controlImageDataUrl : null;
      if (!dataUrl) continue;
      for (const key of controlImageStorageKeys(workspaceKey, item, state.studyProfile?.userId)) {
        writes.push(putVariantPreviewImage(key, dataUrl));
      }
    }
  }
  if (writes.length > 0) {
    void Promise.all(writes);
  }
}

function persistReferenceImages(workspaceKey: string, state: WorkspaceState) {
  const collections = [
    state.board,
    state.references,
    ...state.workspaceVersions.map((version) => version.board ?? []),
  ];
  const referencesById = new Map<string, ReferenceItem>();
  for (const reference of collections.flat()) {
    const current = referencesById.get(reference.id);
    const hasEmbeddedImage = Boolean(
      reference.imageDataUrl?.startsWith("data:image/") ||
      reference.thumbnailUrl?.startsWith("data:image/"),
    );
    const currentHasEmbeddedImage = Boolean(
      current?.imageDataUrl?.startsWith("data:image/") ||
      current?.thumbnailUrl?.startsWith("data:image/"),
    );
    if (
      !current ||
      (hasEmbeddedImage && !currentHasEmbeddedImage) ||
      (!currentHasEmbeddedImage && !current.thumbnailUrl && Boolean(reference.thumbnailUrl))
    ) {
      referencesById.set(reference.id, reference);
    }
  }
  const references = Array.from(referencesById.values());
  const writes = references.map(async (reference) => {
    const keys = referenceImageStorageKeys(workspaceKey, reference.id, state.studyProfile?.userId);
    const embeddedImage =
      (reference.imageDataUrl?.startsWith("data:image/") ? reference.imageDataUrl : null) ??
      (reference.thumbnailUrl?.startsWith("data:image/") ? reference.thumbnailUrl : null);
    if (embeddedImage) {
      await Promise.all(keys.map((key) => putVariantPreviewImage(key, embeddedImage)));
      return;
    }
    if (!reference.thumbnailUrl) return;

    // A restored HTTP URL is useful while the retrieval server is online, but
    // Pocket recovery must not depend on that server still serving the asset.
    // Fetch and cache each URL only when this workspace has no saved copy yet.
    for (const key of keys) {
      if (await getVariantPreviewImage(key)) return;
    }
    const dataUrl = await imageUrlToDataUrl(reference.thumbnailUrl);
    if (!dataUrl?.startsWith("data:image/")) return;
    await Promise.all(keys.map((key) => putVariantPreviewImage(key, dataUrl)));
  });
  if (writes.length > 0) void Promise.all(writes);
}

function persistSkeletonCandidates(workspaceKey: string, state: WorkspaceState) {
  const writes: Promise<void>[] = [];
  for (const candidate of state.diagramSkeletonCandidates) {
    if (!candidate.xml && !candidate.mermaid && !candidate.diagramPlan && !candidate.revisions?.length) continue;
    const payload = {
      initialXml: candidate.initialXml ?? candidate.revisions?.[0]?.xmlBefore ?? candidate.xml ?? null,
      xml: candidate.xml ?? null,
      mermaid: candidate.mermaid ?? null,
      diagramPlan: candidate.diagramPlan ?? null,
      revisions: candidate.revisions ?? [],
    };
    for (const key of skeletonStorageKeys(workspaceKey, candidate.id, state.studyProfile?.userId)) {
      writes.push(putWorkspaceArtifact(key, payload));
    }
  }
  if (writes.length > 0) void Promise.all(writes);
}

function persistCustomCropImages(workspaceKey: string, state: WorkspaceState) {
  const writes: Promise<void>[] = [];
  const iconCollections = [
    state.customIconReferences,
    ...state.workspaceVersions.map((version) => version.customIconReferences ?? []),
  ];
  const regionCollections = [
    state.referenceRegions,
    ...state.workspaceVersions.map((version) => version.referenceRegions ?? []),
  ];
  for (const icons of iconCollections) {
    for (const icon of icons) {
      if (!icon.cropDataUrl?.startsWith("data:image/")) continue;
      writes.push(putVariantPreviewImage(customIconCropStorageKey(workspaceKey, icon), icon.cropDataUrl));
    }
  }
  for (const regions of regionCollections) {
    for (const region of regions) {
      const candidate = region.detectedIcon;
      if (!candidate?.cropDataUrl?.startsWith("data:image/")) continue;
      writes.push(putVariantPreviewImage(
        styleRegionCropStorageKey(workspaceKey, region, candidate.cropDataUrl, candidate.cropStorageKey),
        candidate.cropDataUrl,
      ));
    }
  }
  if (writes.length > 0) void Promise.all(writes);
}

async function hydrateVariantPreviewImages(
  workspaceKey: string,
  state: WorkspaceState,
  userId?: string | null,
): Promise<WorkspaceState> {
  const variants = await Promise.all(
    state.variants.map(async (variant) => {
      let nextVariant = variant;
      if (!nextVariant.previewImageDataUrl && !nextVariant.previewImageUrl) {
        for (const key of previewImageStorageKeys(workspaceKey, variant.id, userId, "preview")) {
          const dataUrl = await getVariantPreviewImage(key);
          if (dataUrl) {
            nextVariant = { ...nextVariant, previewImageDataUrl: dataUrl };
            break;
          }
        }
      }
      if (!nextVariant.draftPreviewImageDataUrl && !nextVariant.draftPreviewImageUrl) {
        for (const key of previewImageStorageKeys(workspaceKey, variant.id, userId, "draft")) {
          const dataUrl = await getVariantPreviewImage(key);
          if (dataUrl) {
            nextVariant = { ...nextVariant, draftPreviewImageDataUrl: dataUrl };
            break;
          }
        }
      }
      return nextVariant;
    }),
  );
  return { ...state, variants };
}

async function hydrateSkeletonCandidates(
  workspaceKey: string,
  state: WorkspaceState,
  userId?: string | null,
): Promise<WorkspaceState> {
  const diagramSkeletonCandidates = await Promise.all(
    state.diagramSkeletonCandidates.map(async (candidate) => {
      for (const key of skeletonStorageKeys(workspaceKey, candidate.id, userId)) {
        const stored = await getWorkspaceArtifact(key);
        if (!stored || typeof stored !== "object") continue;
        const payload = stored as Partial<Pick<DiagramSkeletonCandidate, "initialXml" | "xml" | "mermaid" | "diagramPlan" | "revisions">>;
        return {
          ...candidate,
          initialXml: candidate.initialXml || (typeof payload.initialXml === "string" ? payload.initialXml : null),
          xml: candidate.xml || (typeof payload.xml === "string" ? payload.xml : null),
          mermaid: candidate.mermaid || (typeof payload.mermaid === "string" ? payload.mermaid : null),
          diagramPlan: candidate.diagramPlan || payload.diagramPlan || null,
          revisions: candidate.revisions?.length ? candidate.revisions : payload.revisions ?? [],
        };
      }
      return candidate;
    }),
  );
  const selected = state.selectedDiagramSkeletonId
    ? diagramSkeletonCandidates.find((candidate) => candidate.id === state.selectedDiagramSkeletonId) ?? null
    : null;
  return {
    ...state,
    diagramSkeletonCandidates,
    diagramSkeletonXml: state.diagramSkeletonXml || selected?.xml || null,
    diagramSkeletonMermaid: state.diagramSkeletonMermaid || selected?.mermaid || null,
    diagramSkeletonPlan: state.diagramSkeletonPlan || selected?.diagramPlan || null,
  };
}

function mergeHydratedSkeletonCandidates(
  current: DiagramSkeletonCandidate[],
  hydrated: DiagramSkeletonCandidate[],
): DiagramSkeletonCandidate[] {
  const hydratedById = new Map(hydrated.map((candidate) => [candidate.id, candidate] as const));
  return current.map((candidate) => {
    const stored = hydratedById.get(candidate.id);
    if (!stored) return candidate;
    return {
      ...candidate,
      initialXml: candidate.initialXml || stored.initialXml || null,
      xml: candidate.xml || stored.xml || null,
      mermaid: candidate.mermaid || stored.mermaid || null,
      diagramPlan: candidate.diagramPlan || stored.diagramPlan || null,
      revisions: candidate.revisions?.length ? candidate.revisions : stored.revisions ?? [],
    };
  });
}

async function hydrateCreativeCanvasControlImages(
  workspaceKey: string,
  state: WorkspaceState,
  userId?: string | null,
): Promise<WorkspaceState> {
  const hydrateItems = (items: CreativeCanvasItem[]) =>
    Promise.all(items.map(async (item) => {
      if (item.type !== "control" || item.controlImageDataUrl) return item;
      for (const key of controlImageStorageKeys(workspaceKey, item, userId)) {
        const dataUrl = await getVariantPreviewImage(key);
        if (dataUrl) return { ...item, controlImageDataUrl: dataUrl };
      }
      return item;
    }));
  const creativeCanvases = await Promise.all(
    state.creativeCanvases.map(async (document) => ({
      ...document,
      canvas: {
        ...document.canvas,
        items: await hydrateItems(document.canvas.items),
      },
    })),
  );
  const activeDocument = activeCreativeCanvasDocument(creativeCanvases, state.activeCreativeCanvasId);
  return {
    ...state,
    creativeCanvases,
    creativeCanvas: activeDocument.canvas,
  };
}

async function hydrateReferenceImages(
  workspaceKey: string,
  state: WorkspaceState,
  userId?: string | null,
): Promise<WorkspaceState> {
  const hydrateItems = (items: ReferenceItem[]) => Promise.all(
    items.map(async (reference) => {
      if (reference.imageDataUrl) return reference;
      for (const key of referenceImageStorageKeys(workspaceKey, reference.id, userId)) {
        const imageDataUrl = await getVariantPreviewImage(key);
        if (imageDataUrl) return { ...reference, imageDataUrl };
      }
      return reference;
    }),
  );
  const [board, references, workspaceVersions] = await Promise.all([
    hydrateItems(state.board),
    hydrateItems(state.references),
    Promise.all(state.workspaceVersions.map(async (version) => ({
      ...version,
      board: version.board ? await hydrateItems(version.board) : undefined,
    }))),
  ]);
  return { ...state, board, references, workspaceVersions };
}

async function hydrateCustomCropImages(
  workspaceKey: string,
  state: WorkspaceState,
): Promise<WorkspaceState> {
  const hydrateIcons = (icons: CustomIconReference[]) => Promise.all(
    icons.map(async (icon) => {
      if (icon.cropDataUrl) return icon;
      const storageKey = customIconCropStorageKey(workspaceKey, icon);
      const cropDataUrl = await getVariantPreviewImage(storageKey);
      return cropDataUrl ? { ...icon, cropDataUrl, cropStorageKey: storageKey } : icon;
    }),
  );
  const hydrateRegions = (regions: ReferenceRegion[]) => Promise.all(
    regions.map(async (region) => {
      const candidate = region.detectedIcon;
      if (!candidate || candidate.cropDataUrl) return region;
      const storageKey = styleRegionCropStorageKey(
        workspaceKey,
        region,
        candidate.cropDataUrl,
        candidate.cropStorageKey,
      );
      const cropDataUrl = await getVariantPreviewImage(storageKey);
      return cropDataUrl
        ? {
            ...region,
            detectedIcon: { ...candidate, cropDataUrl, cropStorageKey: storageKey },
          }
        : region;
    }),
  );
  const [customIconReferences, referenceRegions, workspaceVersions] = await Promise.all([
    hydrateIcons(state.customIconReferences),
    hydrateRegions(state.referenceRegions),
    Promise.all(state.workspaceVersions.map(async (version) => ({
      ...version,
      customIconReferences: version.customIconReferences
        ? await hydrateIcons(version.customIconReferences)
        : undefined,
      referenceRegions: version.referenceRegions
        ? await hydrateRegions(version.referenceRegions)
        : undefined,
    }))),
  ]);
  return { ...state, customIconReferences, referenceRegions, workspaceVersions };
}

function mergeHydratedCustomIcons(
  current: CustomIconReference[],
  hydrated: CustomIconReference[],
): CustomIconReference[] {
  return current.map((icon) => {
    if (icon.cropDataUrl) return icon;
    const match = hydrated.find((candidate) => candidate.id === icon.id);
    return match?.cropDataUrl
      ? { ...icon, cropDataUrl: match.cropDataUrl, cropStorageKey: match.cropStorageKey }
      : icon;
  });
}

function mergeHydratedReferenceRegions(
  current: ReferenceRegion[],
  hydrated: ReferenceRegion[],
): ReferenceRegion[] {
  return current.map((region) => {
    if (!region.detectedIcon || region.detectedIcon.cropDataUrl) return region;
    const match = hydrated.find((candidate) => candidate.id === region.id)?.detectedIcon;
    return match?.cropDataUrl
      ? { ...region, detectedIcon: { ...region.detectedIcon, ...match } }
      : region;
  });
}

function mergeHydratedWorkspaceVersionCrops(
  current: WorkspaceVersion[],
  hydrated: WorkspaceVersion[],
): WorkspaceVersion[] {
  return current.map((version) => {
    const match = hydrated.find((candidate) => candidate.id === version.id);
    if (!match) return version;
    return {
      ...version,
      customIconReferences: version.customIconReferences && match.customIconReferences
        ? mergeHydratedCustomIcons(version.customIconReferences, match.customIconReferences)
        : version.customIconReferences,
      referenceRegions: version.referenceRegions && match.referenceRegions
        ? mergeHydratedReferenceRegions(version.referenceRegions, match.referenceRegions)
        : version.referenceRegions,
    };
  });
}

function mergeHydratedReferences(
  current: ReferenceItem[],
  hydrated: ReferenceItem[],
): ReferenceItem[] {
  return current.map((reference) => {
    if (reference.imageDataUrl) return reference;
    const match = hydrated.find((candidate) => candidate.id === reference.id);
    return match?.imageDataUrl
      ? { ...reference, imageDataUrl: match.imageDataUrl }
      : reference;
  });
}

function mergeHydratedWorkspaceVersionReferences(
  current: WorkspaceVersion[],
  hydrated: WorkspaceVersion[],
): WorkspaceVersion[] {
  return current.map((version) => {
    const hydratedBoard = hydrated.find((candidate) => candidate.id === version.id)?.board;
    return version.board && hydratedBoard
      ? { ...version, board: mergeHydratedReferences(version.board, hydratedBoard) }
      : version;
  });
}

/** References carry huge imageDataUrl / data: thumbnails after uploads — omit from disk (HTTP URLs OK). */
function stripHeavyReferenceImages(items: ReferenceItem[]): ReferenceItem[] {
  return items.map((item) => ({
    ...item,
    imageDataUrl: null,
    thumbnailUrl: item.thumbnailUrl?.startsWith("data:image/") ? null : item.thumbnailUrl,
  }));
}

function stripCreativeCanvasControlImages(canvas: CreativeCanvasState): CreativeCanvasState {
  return {
    ...canvas,
    items: canvas.items.map((item) =>
      item.controlImageDataUrl?.startsWith("data:image/")
        ? { ...item, controlImageDataUrl: null }
        : item,
    ),
  };
}

function stripCreativeCanvasUndoControlImages(stack: CreativeCanvasState[]): CreativeCanvasState[] {
  return stack.map((canvas) => stripCreativeCanvasControlImages(canvas));
}

function stripCreativeCanvasDocumentControlImages(document: CreativeCanvasDocument): CreativeCanvasDocument {
  return {
    ...document,
    canvas: stripCreativeCanvasControlImages(document.canvas),
    undoStack: stripCreativeCanvasUndoControlImages(document.undoStack),
  };
}

function stripCustomIconCropImages(
  icons: CustomIconReference[],
  workspaceKey: string,
): CustomIconReference[] {
  return icons.map((icon) => {
    if (!icon.cropDataUrl?.startsWith("data:image/")) return icon;
    return {
      ...icon,
      cropStorageKey: customIconCropStorageKey(workspaceKey, icon),
      cropDataUrl: "",
    };
  });
}

function stripReferenceRegionCropImages(
  regions: ReferenceRegion[],
  workspaceKey: string,
): ReferenceRegion[] {
  return regions.map((region) => {
    const candidate = region.detectedIcon;
    if (!candidate?.cropDataUrl?.startsWith("data:image/")) return region;
    return {
      ...region,
      detectedIcon: {
        ...candidate,
        cropStorageKey: styleRegionCropStorageKey(
          workspaceKey,
          region,
          candidate.cropDataUrl,
          candidate.cropStorageKey,
        ),
        cropDataUrl: "",
      },
    };
  });
}

function stripWorkspaceVersionCropImages(
  version: WorkspaceVersion,
  workspaceKey: string,
): WorkspaceVersion {
  return {
    ...version,
    board: version.board ? stripHeavyReferenceImages(version.board) : undefined,
    customIconReferences: version.customIconReferences
      ? stripCustomIconCropImages(version.customIconReferences, workspaceKey)
      : undefined,
    referenceRegions: version.referenceRegions
      ? stripReferenceRegionCropImages(version.referenceRegions, workspaceKey)
      : undefined,
  };
}

function makePersistableState(state: WorkspaceState, workspaceKey = STORAGE_KEY): WorkspaceState {
  const board = stripHeavyReferenceImages(state.board);
  const references = stripHeavyReferenceImages(state.references);
  return {
    ...state,
    board,
    references,
    creativeCanvas: stripCreativeCanvasControlImages(state.creativeCanvas),
    creativeCanvasUndoStack: stripCreativeCanvasUndoControlImages(state.creativeCanvasUndoStack),
    creativeCanvases: state.creativeCanvases.map(stripCreativeCanvasDocumentControlImages),
    customIconReferences: stripCustomIconCropImages(state.customIconReferences, workspaceKey),
    referenceRegions: stripReferenceRegionCropImages(state.referenceRegions, workspaceKey),
    workspaceVersions: state.workspaceVersions.map((version) =>
      stripWorkspaceVersionCropImages(version, workspaceKey)),
    variants: state.variants.map((variant) => ({
      ...variant,
      previewImageDataUrl: null,
      previewImageUrl: variant.previewImageUrl?.startsWith("data:image/") ? null : variant.previewImageUrl,
      draftPreviewImageDataUrl: null,
      draftPreviewImageUrl: variant.draftPreviewImageUrl?.startsWith("data:image/") ? null : variant.draftPreviewImageUrl,
      generationPrompt: truncateGenerationPrompt(variant.generationPrompt ?? null),
      draftGenerationPrompt: truncateGenerationPrompt(variant.draftGenerationPrompt ?? null),
      svg: variant.svg,
    })),
  };
}

function makeMinimalPersistableState(state: WorkspaceState, workspaceKey = STORAGE_KEY): WorkspaceState {
  const base = makePersistableState(state, workspaceKey);
  return {
    ...base,
    variants: base.variants.map((variant) => ({
      ...variant,
      svg: truncateSvgForStorage(variant.svg, variant.id === state.selectedVariantId),
    })),
  };
}

/** Last resort: drop prompts + all SVG + data preview URLs — keeps layout/refs metadata only. */
function makeUltraMinimalPersistableState(state: WorkspaceState, workspaceKey = STORAGE_KEY): WorkspaceState {
  const base = makePersistableState(state, workspaceKey);
  return {
    ...base,
    creativeCanvasUndoStack: [],
    creativeCanvases: base.creativeCanvases.map((document) => ({
      ...document,
      undoStack: [],
    })),
    variants: base.variants.map((variant) => ({
      ...variant,
      previewImageDataUrl: null,
      previewImageUrl: variant.previewImageUrl?.startsWith("data:image/") ? null : variant.previewImageUrl,
      draftPreviewImageDataUrl: null,
      draftPreviewImageUrl: variant.draftPreviewImageUrl?.startsWith("data:image/") ? null : variant.draftPreviewImageUrl,
      generationPrompt: null,
      draftGenerationPrompt: null,
      svg: "",
    })),
  };
}

function makeEmergencyVariant(variant: FigureVariant): FigureVariant {
  return {
    ...variant,
    previewImageDataUrl: null,
    previewImageUrl: variant.previewImageUrl?.startsWith("data:image/") ? null : variant.previewImageUrl,
    draftPreviewImageDataUrl: null,
    draftPreviewImageUrl: variant.draftPreviewImageUrl?.startsWith("data:image/") ? null : variant.draftPreviewImageUrl,
    svg: "",
    generationPrompt: null,
    draftGenerationPrompt: null,
    diagramPlan: null,
  };
}

function makeEmergencyIdeaHistory(history: IdeaHistoryState): IdeaHistoryState {
  const snapshots = Object.fromEntries(Object.entries(history.snapshots).map(([id, snapshot]) => [id, {
    ...snapshot,
    prompt: snapshot.prompt.slice(0, 12_000),
    promptDraft: snapshot.promptDraft.slice(0, 12_000),
    styleVisualAnalysis: null,
    selectedSkeleton: snapshot.selectedSkeleton
      ? {
          ...snapshot.selectedSkeleton,
          initialXml: null,
          xml: null,
          mermaid: null,
          diagramPlan: null,
          revisions: [],
        }
      : null,
    skeletonCheckpointPlan: null,
  }]));
  return { ...history, snapshots };
}

/**
 * Quota-safe recovery snapshot. Keep the study identity, prompt, retrieved
 * references, current author choices, and lightweight generation lineage while
 * dropping binary-adjacent payloads that can exceed localStorage. Candidate,
 * Edit, Skeleton, and History metadata must never disappear during logout.
 */
function makeEmergencyPersistableState(
  state: WorkspaceState,
  workspaceKey = STORAGE_KEY,
): Partial<WorkspaceState> {
  return {
    studyTaskVersion: state.studyTaskVersion,
    studyProfile: state.studyProfile,
    studySessionId: state.studySessionId,
    studySessionStartedAt: state.studySessionStartedAt,
    studySessionStatus: state.studySessionStatus,
    assignedTaskSnapshot: state.assignedTaskSnapshot,
    activeStudyStage: state.activeStudyStage,
    activeStudyPhase: state.activeStudyPhase,
    visitedStudyStages: state.visitedStudyStages,
    visitedStudyPhases: state.visitedStudyPhases,
    completedStudyStages: state.completedStudyStages,
    completedStudyPhases: state.completedStudyPhases,
    workflowMode: state.workflowMode,
    workspaceView: state.workspaceView,
    activeStudioStep: state.activeStudioStep,
    prompt: state.prompt,
    generationBrief: state.generationBrief,
    promptUpdatedAt: state.promptUpdatedAt,
    promptRevisions: state.promptRevisions.slice(-12),
    currentPromptRevisionId: state.currentPromptRevisionId,
    board: stripHeavyReferenceImages(state.board),
    references: stripHeavyReferenceImages(state.references),
    retrievalSession: state.retrievalSession,
    referenceUsage: state.referenceUsage,
    layoutReferenceId: state.layoutReferenceId,
    canvasFocusReferenceId: state.canvasFocusReferenceId,
    canvasGenerationReferenceIds: state.canvasGenerationReferenceIds,
    referenceRegions: stripReferenceRegionCropImages(state.referenceRegions, workspaceKey),
    activeStyleKit: state.activeStyleKit,
    selectedDiagramSkeletonId: state.selectedDiagramSkeletonId,
    nodeIconBindings: state.nodeIconBindings,
    nodeFontBindings: state.nodeFontBindings,
    nodeColorBindings: state.nodeColorBindings,
    iconReferenceIds: state.iconReferenceIds,
    iconReferenceId: state.iconReferenceId,
    fontReferenceId: state.fontReferenceId,
    paletteReferenceId: state.paletteReferenceId,
    matchedStylePalette: state.matchedStylePalette,
    diagramSkeletonCandidates: state.diagramSkeletonCandidates.map((candidate) => ({
      ...candidate,
      initialXml: null,
      xml: null,
      mermaid: null,
      diagramPlan: null,
      revisions: [],
    })),
    diagramSkeletonXml:
      state.diagramSkeletonXml && state.diagramSkeletonXml.length <= 120_000
        ? state.diagramSkeletonXml
        : null,
    diagramSkeletonPlan: null,
    diagramSkeletonMermaid:
      state.diagramSkeletonMermaid && state.diagramSkeletonMermaid.length <= 20_000
        ? state.diagramSkeletonMermaid
        : null,
    variants: state.variants.map(makeEmergencyVariant),
    candidateGenerationSnapshots: Object.fromEntries(
      Object.entries(state.candidateGenerationSnapshots).map(([id, snapshot]) => [id, {
        ...snapshot,
        workingPrompt: snapshot.workingPrompt.slice(0, 12_000),
        skeletonXml: null,
      }]),
    ),
    figureHistory: state.figureHistory.map((entry) => ({
      ...entry,
      previewImageUrl: entry.previewImageUrl?.startsWith("data:image/") ? null : entry.previewImageUrl,
    })),
    figureHistoryCompareIds: state.figureHistoryCompareIds,
    ideaHistory: makeEmergencyIdeaHistory(state.ideaHistory),
    selectedVariantId: state.selectedVariantId,
    showProvenance: state.showProvenance,
    status: "Workspace saved in compact mode after browser storage quota was exceeded.",
  };
}

type WorkspaceContextValue = {
  hydrated: boolean;
  state: WorkspaceState;
  setState: Dispatch<SetStateAction<WorkspaceState>>;
  loadUserWorkspace: (profile: StudyProfile) => boolean;
  logoutUserWorkspace: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>(defaultWorkspaceState);
  const [hydrated, setHydrated] = useState(false);
  const latestStateRef = useRef(state);
  const hydratedRef = useRef(hydrated);
  const persistTimerRef = useRef<number | null>(null);
  const workspaceLoadEpochRef = useRef(0);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        workspaceLoadEpochRef.current += 1;
        const loadEpoch = workspaceLoadEpochRef.current;
        const parsed = JSON.parse(raw) as Partial<WorkspaceState> & {
          diagramSkeletonXml?: string | null;
        };
        // Participant workspaces are intentionally restored only after an ID is
        // entered. The shared key used to reopen whichever participant happened
        // to use this browser last, exposing their History to the next person.
        if (normalizeStudyProfile(parsed.studyProfile)) {
          window.localStorage.removeItem(STORAGE_KEY);
          return;
        }
        const restored = restoreWorkspaceFromPartial(parsed);
        setState(restored);
        void Promise.all([
          hydrateVariantPreviewImages(STORAGE_KEY, restored, restored.studyProfile?.userId),
          hydrateCreativeCanvasControlImages(STORAGE_KEY, restored, restored.studyProfile?.userId),
          hydrateCustomCropImages(STORAGE_KEY, restored),
          hydrateReferenceImages(STORAGE_KEY, restored, restored.studyProfile?.userId),
          hydrateSkeletonCandidates(STORAGE_KEY, restored, restored.studyProfile?.userId),
        ]).then(([hydratedVariantState, hydratedCanvasState, hydratedCropState, hydratedReferenceState, hydratedSkeletonState]) => {
          if (workspaceLoadEpochRef.current !== loadEpoch) return;
          setState((current) => {
            const diagramSkeletonCandidates = mergeHydratedSkeletonCandidates(
              current.diagramSkeletonCandidates,
              hydratedSkeletonState.diagramSkeletonCandidates,
            );
            const selectedSkeleton = current.selectedDiagramSkeletonId
              ? diagramSkeletonCandidates.find((candidate) => candidate.id === current.selectedDiagramSkeletonId) ?? null
              : null;
            return {
              ...current,
              board: mergeHydratedReferences(current.board, hydratedReferenceState.board),
              references: mergeHydratedReferences(current.references, hydratedReferenceState.references),
              customIconReferences: mergeHydratedCustomIcons(
                current.customIconReferences,
                hydratedCropState.customIconReferences,
              ),
              referenceRegions: mergeHydratedReferenceRegions(
                current.referenceRegions,
                hydratedCropState.referenceRegions,
              ),
              workspaceVersions: mergeHydratedWorkspaceVersionCrops(
                mergeHydratedWorkspaceVersionReferences(
                  current.workspaceVersions,
                  hydratedReferenceState.workspaceVersions,
                ),
                hydratedCropState.workspaceVersions,
              ),
              diagramSkeletonCandidates,
              diagramSkeletonXml: current.diagramSkeletonXml || selectedSkeleton?.xml || null,
              diagramSkeletonMermaid: current.diagramSkeletonMermaid || selectedSkeleton?.mermaid || null,
              diagramSkeletonPlan: current.diagramSkeletonPlan || selectedSkeleton?.diagramPlan || null,
              variants: current.variants.map((variant) => {
                const hydratedVariant = hydratedVariantState.variants.find((item) => item.id === variant.id);
                return {
                  ...variant,
                  previewImageDataUrl:
                    !variant.previewImageDataUrl && !variant.previewImageUrl
                      ? hydratedVariant?.previewImageDataUrl ?? variant.previewImageDataUrl
                      : variant.previewImageDataUrl,
                  draftPreviewImageDataUrl:
                    !variant.draftPreviewImageDataUrl && !variant.draftPreviewImageUrl
                      ? hydratedVariant?.draftPreviewImageDataUrl ?? variant.draftPreviewImageDataUrl
                    : variant.draftPreviewImageDataUrl,
                };
              }),
              creativeCanvas: {
                ...current.creativeCanvas,
                items: current.creativeCanvas.items.map((item) => {
                  const hydratedItem = hydratedCanvasState.creativeCanvas.items.find((entry) => entry.id === item.id);
                  return item.type === "control" && !item.controlImageDataUrl
                    ? { ...item, controlImageDataUrl: hydratedItem?.controlImageDataUrl ?? item.controlImageDataUrl }
                    : item;
                }),
              },
              creativeCanvases: current.creativeCanvases.map((document) => {
                const hydratedDocument = hydratedCanvasState.creativeCanvases.find((entry) => entry.id === document.id);
                return hydratedDocument ?? document;
              }),
            };
          });
        });
      }
    } catch (error) {
      console.error("Failed to restore workspace state", error);
    } finally {
      setHydrated(true);
    }
  }, []);

  function restoreWorkspaceFromPartial(parsed: Partial<WorkspaceState> & { diagramSkeletonXml?: string | null }): WorkspaceState {
    const mergedBoard = (parsed.board ?? defaultWorkspaceState.board).map((item) =>
      resolveReferenceAssetUrls(item),
    );
    const references = (parsed.references ?? defaultWorkspaceState.references).map((item) =>
      resolveReferenceAssetUrls(item),
    );
    const variants = (parsed.variants ?? defaultWorkspaceState.variants).map((variant) =>
      resolveFigureVariantAssetUrls(variant),
    );
    let canvasGenerationReferenceIds =
      parsed.canvasGenerationReferenceIds !== undefined
        ? parsed.canvasGenerationReferenceIds.filter((id) =>
            mergedBoard.some((b) => b.id === id),
          )
        : mergedBoard.map((b) => b.id);
    if (canvasGenerationReferenceIds.length === 0 && mergedBoard.length > 0) {
      canvasGenerationReferenceIds = mergedBoard.map((b) => b.id);
    }
    const layoutReferenceId =
      parsed.layoutReferenceId && mergedBoard.some((b) => b.id === parsed.layoutReferenceId)
        ? parsed.layoutReferenceId
        : null;
    const canvasFocusReferenceId =
      parsed.canvasFocusReferenceId && mergedBoard.some((b) => b.id === parsed.canvasFocusReferenceId)
        ? parsed.canvasFocusReferenceId
        : null;
    const parsedUsage = parsed.referenceUsage ?? {};
    const referenceUsage = mergedBoard.reduce<Record<string, ReferenceUsage>>((acc, item) => {
      const savedUsage = parsedUsage[item.id] ?? {};
      acc[item.id] = {
        ...savedUsage,
        layout: savedUsage.layout ?? false,
        style: savedUsage.style ?? false,
      };
      return acc;
    }, {});
    const diagramSkeletonXml =
      parsed.diagramSkeletonXml?.trim().startsWith("<")
        ? parsed.diagramSkeletonXml
        : defaultWorkspaceState.diagramSkeletonXml;
    const diagramSkeletonPlan = parsed.diagramSkeletonPlan ?? defaultWorkspaceState.diagramSkeletonPlan;
    const diagramSkeletonMermaid =
      parsed.diagramSkeletonMermaid ??
      (parsed.diagramSkeletonXml?.trim().startsWith("flowchart") ||
      parsed.diagramSkeletonXml?.trim().startsWith("graph")
        ? parsed.diagramSkeletonXml
        : defaultWorkspaceState.diagramSkeletonMermaid);
    const diagramSkeletonCandidates = parsed.diagramSkeletonCandidates ?? [];
    const selectedDiagramSkeletonId =
      parsed.selectedDiagramSkeletonId &&
      diagramSkeletonCandidates.some((candidate) => candidate.id === parsed.selectedDiagramSkeletonId)
        ? parsed.selectedDiagramSkeletonId
        : null;
    const fallbackCreativeCanvas = normalizeCreativeCanvas(parsed.creativeCanvas);
    const fallbackCreativeCanvasUndoStack = normalizeCreativeCanvasUndoStack(parsed.creativeCanvasUndoStack);
    const creativeCanvases = normalizeCreativeCanvasDocuments(
      parsed.creativeCanvases,
      fallbackCreativeCanvas,
      fallbackCreativeCanvasUndoStack,
    );
    const activeCreativeCanvas = activeCreativeCanvasDocument(creativeCanvases, parsed.activeCreativeCanvasId);
    const validStudyStages: StudyStage[] = ["brief", "references", "skeleton", "compose", "refine", "review"];
    const isStudyStage = (value: unknown): value is StudyStage =>
      typeof value === "string" && validStudyStages.includes(value as StudyStage);
    const storedActiveStudyStage = isStudyStage(parsed.activeStudyStage)
      ? parsed.activeStudyStage
      : defaultWorkspaceState.activeStudyStage;
    const activeStudyStage = parsed.studySessionStatus === "finished" ? "review" : storedActiveStudyStage;
    const validIdeaSparkSteps: IdeaSparkStepId[] = [
      "prompt",
      "retrieval",
      "layout",
      "skeleton",
      "style",
      "icons",
      "candidate",
      "edit",
      "review",
    ];
    const inferredStudioStep: IdeaSparkStepId = activeStudyStage === "brief"
      ? "prompt"
      : activeStudyStage === "references"
        ? "retrieval"
        : activeStudyStage === "skeleton"
          ? "layout"
          : activeStudyStage === "refine"
            ? "candidate"
            : activeStudyStage === "review"
              ? "review"
              : parsed.selectedVariantId ? "candidate" : "icons";
    const storedStudioStep = validIdeaSparkSteps.includes(parsed.activeStudioStep as IdeaSparkStepId)
      ? parsed.activeStudioStep as IdeaSparkStepId
      : inferredStudioStep;
    const activeStudioStep = storedStudioStep === "skeleton"
      ? "layout"
      : storedStudioStep === "edit"
        ? "candidate"
        : storedStudioStep;
    // Always derive phase from the detailed stage. Earlier builds used a
    // different phase mapping, so trusting the saved phase can restore an
    // impossible phase/stage combination.
    const activeStudyPhase = studyPhaseForStage(activeStudyStage);
    const visitedStudyStages = Array.from(
      new Set(
        (Array.isArray(parsed.visitedStudyStages) ? parsed.visitedStudyStages : [activeStudyStage])
          .filter(isStudyStage)
          .concat(activeStudyStage),
      ),
    );
    const completedStudyStages = Array.from(
      new Set(
        (Array.isArray(parsed.completedStudyStages) ? parsed.completedStudyStages : [])
          .filter(isStudyStage),
      ),
    );
    const visitedStudyPhases = Array.from(new Set(
      visitedStudyStages.map((stage) => studyPhaseForStage(stage)).concat(activeStudyPhase),
    ));
    const legacyCompletedStudyPhases: StudyPhase[] = [];
    const briefCompleted = completedStudyStages.includes("brief");
    const referencesCompleted =
      mergedBoard.some((item) => referenceUsage[item.id]?.layout) &&
      mergedBoard.some((item) => referenceUsage[item.id]?.style);
    if (briefCompleted && referencesCompleted) legacyCompletedStudyPhases.push("envision");
    if (parsed.skeletonConfirmedAt || diagramSkeletonXml) {
      legacyCompletedStudyPhases.push("externalize");
    }
    if (variants.length > 0 || (parsed.reviewResult?.length ?? 0) > 0 || parsed.studySessionStatus === "finished") {
      legacyCompletedStudyPhases.push("evolve");
    }
    // Recompute completion from durable artifacts so older phase snapshots do
    // not conflict with the current Envision / Externalize / Evolve mapping.
    const completedStudyPhases = Array.from(new Set(legacyCompletedStudyPhases));
    const customIconReferences = normalizeStoredCustomIconReferences(
      parsed.customIconReferences ?? defaultWorkspaceState.customIconReferences,
    );
    const validNodeIconBindings = Object.fromEntries(
      Object.entries(parsed.nodeIconBindings ?? {}).filter(([, iconId]) =>
        isKnownStoredIconId(iconId, customIconReferences),
      ),
    );
    const validFontIds = new Set(figureFontReferences.map((font) => font.id));
    const validNodeFontBindings = Object.fromEntries(
      Object.entries(parsed.nodeFontBindings ?? {}).filter(([, fontId]) => validFontIds.has(fontId)),
    ) as Record<string, FigureFontReferenceId>;
    const validNodeColorBindings = Object.fromEntries(
      Object.entries(parsed.nodeColorBindings ?? {}).filter(([, color]) => /^#[0-9a-fA-F]{6}$/.test(color)),
    );
    const validRecentIconIds = (parsed.recentIconIds ?? []).filter((iconId) =>
      isKnownStoredIconId(iconId, customIconReferences),
    );
    const restoredIconReferenceIds = (
      parsed.iconReferenceIds?.length
        ? parsed.iconReferenceIds
        : parsed.iconReferenceId
          ? [parsed.iconReferenceId]
          : defaultWorkspaceState.iconReferenceIds
    ).filter((iconId) => isKnownStoredIconId(iconId, customIconReferences));
    const referenceRegions = parsed.referenceRegions ?? defaultWorkspaceState.referenceRegions;
    const styleReferenceIds = mergedBoard
      .filter((item) => referenceUsage[item.id]?.style)
      .map((item) => item.id);
    const primaryStyleReferenceId = canvasFocusReferenceId && styleReferenceIds.includes(canvasFocusReferenceId)
      ? canvasFocusReferenceId
      : styleReferenceIds[0] ?? null;
    const styleRegions = referenceRegions.filter(
      (region) => region.intent === "style" && styleReferenceIds.includes(region.referenceId),
    );
    const legacyPaletteRegion = styleRegions.find(
      (region) => region.paletteEnabled && (region.extractedColors?.length ?? 0) > 0,
    );
    const restoredPaletteId = parsed.paletteReferenceId ?? defaultWorkspaceState.paletteReferenceId;
    const restoredPalette = restoredPaletteId
      ? figurePaletteReferences.find((palette) => palette.id === restoredPaletteId) ?? null
      : null;
    const restoredFontId = parsed.fontReferenceId ?? defaultWorkspaceState.fontReferenceId;
    const regionFontId = styleRegions.find((region) => region.fontEnabled && region.suggestedFontId)
      ?.suggestedFontId;
    const legacyActiveStyleKit = createLegacyStyleKit({
      sourceReferenceId: primaryStyleReferenceId,
      sourceReferenceIds: styleReferenceIds,
      palette: legacyPaletteRegion
        ? {
            kind: "region",
            id: `region:${legacyPaletteRegion.id}`,
            colors: legacyPaletteRegion.extractedColors ?? [],
            sourceReferenceId: legacyPaletteRegion.referenceId,
            sourceRegionId: legacyPaletteRegion.id,
          }
        : restoredPalette
          ? {
              kind: "preset",
              id: restoredPalette.id,
              colors: restoredPalette.colors,
            }
          : null,
      fontId: regionFontId ?? restoredFontId,
      iconIds: restoredIconReferenceIds,
      patternIds: [],
      regionIds: styleRegions.map((region) => region.id),
      confirmedAt: null,
    });
    const knownIconIds = [
      ...scientificIconReferences.map((icon) => icon.id),
      ...customIconReferences.map((icon) => icon.id),
    ];
    const knownIconIdSet = new Set(knownIconIds);
    const assignedTaskSnapshot = normalizeAssignedTaskSnapshot(
      parsed.assignedTaskSnapshot,
      defaultWorkspaceState.assignedTaskSnapshot,
    );
    const storedWorkingPrompt = typeof parsed.prompt === "string"
      ? parsed.prompt
      : typeof parsed.generationBrief === "string"
        ? parsed.generationBrief
        : defaultWorkspaceState.prompt;
    const clearLegacyAutoSeededPrompt = Boolean(normalizeStudyProfile(parsed.studyProfile)) &&
      isLegacyAutoSeededStudyPrompt(
        storedWorkingPrompt,
        assignedTaskSnapshot.brief,
        parsed.promptRevisions,
      );
    const workingPrompt = clearLegacyAutoSeededPrompt ? "" : storedWorkingPrompt;
    const promptUpdatedAt = typeof parsed.promptUpdatedAt === "string"
      ? parsed.promptUpdatedAt
      : defaultWorkspaceState.promptUpdatedAt;
    const promptRevisions = clearLegacyAutoSeededPrompt
      ? []
      : normalizePromptRevisionHistory(
          parsed.promptRevisions,
          workingPrompt,
          promptUpdatedAt,
        );
    const currentPromptRevision = promptRevisions.find(
      (revision) => revision.id === parsed.currentPromptRevisionId,
    ) ?? promptRevisions.slice().reverse().find(
      (revision) => revision.fingerprint === createPromptFingerprint(workingPrompt),
    ) ?? promptRevisions[promptRevisions.length - 1];
    const legacyArtifactPromptRevisionId = currentPromptRevision?.id ?? null;
    const legacyArtifactPromptFingerprint = currentPromptRevision?.fingerprint ?? createPromptFingerprint(workingPrompt);
    const parsedRetrievalSession = parsed.retrievalSession;
    const validSearchGoals: SearchGoal[] = ["idea", "structure", "style"];
    const latestSearchEvent = [...(parsed.studyEvents ?? [])].reverse().find(
      (event) => event.type === "reference_search_completed",
    );
    const legacySearchGoal = latestSearchEvent?.metadata?.searchGoal;
    const legacySearchOffset = latestSearchEvent?.metadata?.offset;
    const legacyResultCount = latestSearchEvent?.metadata?.resultCount;
    const legacyBatchSize = latestSearchEvent?.metadata?.batchSize;
    const retrievalSession: RetrievalSession = parsedRetrievalSession &&
      validSearchGoals.includes(parsedRetrievalSession.searchGoal as SearchGoal) &&
      Number.isFinite(parsedRetrievalSession.offset)
      ? {
          searchGoal: parsedRetrievalSession.searchGoal,
          offset: Math.max(0, parsedRetrievalSession.offset),
          hasMore: Boolean(parsedRetrievalSession.hasMore),
          promptFingerprint: parsedRetrievalSession.promptFingerprint ?? null,
        }
      : validSearchGoals.includes(legacySearchGoal as SearchGoal) &&
          typeof legacySearchOffset === "number" &&
          typeof legacyResultCount === "number"
        ? {
            searchGoal: legacySearchGoal as SearchGoal,
            offset: Math.max(0, legacySearchOffset + legacyResultCount),
            // Old events did not record hasMore. A full page may have a successor;
            // one harmless empty request will settle an exact-multiple result set.
            hasMore: typeof legacyBatchSize === "number" && legacyResultCount >= legacyBatchSize,
            promptFingerprint: typeof latestSearchEvent?.metadata?.promptFingerprint === "string"
              ? latestSearchEvent.metadata.promptFingerprint
              : legacyArtifactPromptFingerprint,
          }
        : defaultWorkspaceState.retrievalSession;
    const candidateGenerationSnapshots = normalizeCandidateGenerationSnapshots(
      parsed.candidateGenerationSnapshots,
      knownIconIdSet,
    );
    const activeStyleKit = normalizeStyleKit(parsed.activeStyleKit, {
      fallback: legacyActiveStyleKit,
      validReferenceIds: mergedBoard.map((item) => item.id),
      validRegionIds: referenceRegions.map((region) => region.id),
      validIconIds: knownIconIds,
      validFontIds: figureFontReferences.map((font) => font.id),
      validPaletteIds: figurePaletteReferences.map((palette) => palette.id),
      validPatternIds: [
        "pattern-rounded-modules",
        "pattern-dashed-groups",
        "pattern-loop-flow",
        "pattern-callout-strip",
        "pattern-icon-label-pairs",
        ...customIconReferences
          .filter((icon) => icon.kind === "style-crop" || icon.id.startsWith("custom-screenshot-"))
          .map((icon) => icon.id),
      ],
    });
    let skeletonStyleApplications = normalizeSkeletonStyleApplications(
      parsed.skeletonStyleApplications,
      {
        validSkeletonIds: diagramSkeletonCandidates.map((candidate) => candidate.id),
        validIconIds: knownIconIds,
        validFontIds: figureFontReferences.map((font) => font.id),
      },
    );
    if (
      parsed.skeletonStyleApplications === undefined &&
      selectedDiagramSkeletonId &&
      (Object.keys(validNodeIconBindings).length > 0 || styleKitHasSelections(activeStyleKit))
    ) {
      skeletonStyleApplications = {
        ...skeletonStyleApplications,
        [selectedDiagramSkeletonId]: createSkeletonStyleApplication(
          selectedDiagramSkeletonId,
          activeStyleKit,
          validNodeIconBindings,
        ),
      };
    }
    const parsedRecord = parsed as Record<string, unknown>;
    const knownParsedState = Object.fromEntries(
      Object.keys(defaultWorkspaceState)
        .filter((key) => key in parsedRecord)
        .map((key) => [key, parsedRecord[key]]),
    ) as Partial<WorkspaceState>;
    return {
      ...defaultWorkspaceState,
      ...knownParsedState,
      activeStudyStage,
      iconCatalogVersion: SCIENTIFIC_ICON_CATALOG_VERSION,
      assignedTaskSnapshot,
      visitedStudyStages,
      completedStudyStages,
      activeStudyPhase,
      visitedStudyPhases,
      completedStudyPhases,
      workflowMode: parsed.workflowMode === "refine" ? "refine" : "freeform",
      workspaceView: normalizeWorkspaceView(parsed.workspaceView),
      activeStudioStep,
      ideaHistory: normalizeIdeaHistoryState(parsed.ideaHistory),
      guidedDialogue: (() => {
        const restored = normalizeGuidedDialogueState(parsed.guidedDialogue);
        const restoredDraft = clearLegacyAutoSeededPrompt &&
          restored.skeletonPromptDraft.trim() === assignedTaskSnapshot.brief.trim()
          ? ""
          : restored.skeletonPromptDraft;
        return {
          ...restored,
          skeletonPromptDraft: restoredDraft || workingPrompt,
        };
      })(),
      prompt: workingPrompt,
      generationBrief: workingPrompt,
      promptUpdatedAt,
      promptRevisions,
      currentPromptRevisionId: currentPromptRevision?.id ?? null,
      diagramSkeletonPromptRevisionId: parsed.diagramSkeletonPromptRevisionId ?? (
        diagramSkeletonXml || diagramSkeletonPlan ? legacyArtifactPromptRevisionId : null
      ),
      diagramSkeletonPromptFingerprint: parsed.diagramSkeletonPromptFingerprint ?? (
        diagramSkeletonXml || diagramSkeletonPlan ? legacyArtifactPromptFingerprint : null
      ),
      skeletonCheckpointPlan: parsed.skeletonCheckpointPlan ?? null,
      reviewFocusTargetIds: parsed.reviewFocusTargetIds ?? [],
      activeStyleKit,
      skeletonStyleApplications,
      nodeIconBindings: validNodeIconBindings,
      nodeFontBindings: validNodeFontBindings,
      nodeColorBindings: validNodeColorBindings,
      recentIconIds: validRecentIconIds,
      lockedDiagramObjectIds: parsed.lockedDiagramObjectIds ?? [],
      workspaceVersions: (parsed.workspaceVersions ?? []).map((version) => ({
        ...version,
        customIconReferences: version.customIconReferences
          ? normalizeStoredCustomIconReferences(version.customIconReferences)
          : undefined,
        activeStyleKit: version.activeStyleKit
          ? normalizeStyleKit(version.activeStyleKit)
          : undefined,
        skeletonStyleApplications: version.skeletonStyleApplications
          ? normalizeSkeletonStyleApplications(version.skeletonStyleApplications)
          : undefined,
        assignedTaskSnapshot: version.assignedTaskSnapshot
          ? normalizeAssignedTaskSnapshot(version.assignedTaskSnapshot, assignedTaskSnapshot)
          : undefined,
        promptRevisions: version.promptRevisions
          ? normalizePromptRevisionHistory(
              version.promptRevisions,
              version.prompt ?? workingPrompt,
              version.promptUpdatedAt ?? promptUpdatedAt,
            )
          : undefined,
        candidateGenerationSnapshots: version.candidateGenerationSnapshots
          ? normalizeCandidateGenerationSnapshots(version.candidateGenerationSnapshots, knownIconIdSet)
          : undefined,
        guidedDialogue: version.guidedDialogue
          ? normalizeGuidedDialogueState(version.guidedDialogue)
          : undefined,
        styleAnalysisStates: version.styleAnalysisStates
          ? normalizeStyleAnalysisStates(version.styleAnalysisStates)
          : undefined,
      })),
      activeWorkspaceVersionId: parsed.activeWorkspaceVersionId ?? null,
      showProvenance: parsed.showProvenance ?? false,
      intentGraph: normalizeIntentGraph(parsed.intentGraph),
      diagramSkeletonXml,
      diagramSkeletonPlan,
      diagramSkeletonMermaid,
      diagramSkeletonCandidates,
      selectedDiagramSkeletonId,
      layoutSkeletonGenerationInProgress: false,
      board: mergedBoard,
      referenceUsage,
      references,
      retrievalSession,
      variants,
      candidateGenerationSnapshots,
      studyProfile: normalizeStudyProfile(parsed.studyProfile),
      layoutReferenceId,
      referenceRegions,
      canvasFocusReferenceId,
      iconReferenceIds: restoredIconReferenceIds.length
        ? restoredIconReferenceIds
        : defaultWorkspaceState.iconReferenceIds,
      iconReferenceId:
        restoredIconReferenceIds[0] ??
        defaultWorkspaceState.iconReferenceId,
      fontReferenceId: parsed.fontReferenceId ?? defaultWorkspaceState.fontReferenceId,
      paletteReferenceId: parsed.paletteReferenceId ?? defaultWorkspaceState.paletteReferenceId,
      matchedStylePalette: parsed.matchedStylePalette ?? null,
      customIconReferences,
      styleVisualAnalyses: parsed.styleVisualAnalyses ?? defaultWorkspaceState.styleVisualAnalyses,
      styleAnalysisStates: normalizeStyleAnalysisStates(parsed.styleAnalysisStates),
      activeCreativeCanvasId: activeCreativeCanvas.id,
      creativeCanvases,
      creativeCanvas: activeCreativeCanvas.canvas,
      creativeCanvasUndoStack: activeCreativeCanvas.undoStack,
      canvasGenerationReferenceIds,
      figureHistory: parsed.figureHistory ?? defaultWorkspaceState.figureHistory,
      figureHistoryCompareIds: parsed.figureHistoryCompareIds ?? null,
    };
  }

  function persistWorkspace(key: string, nextState: WorkspaceState) {
    persistVariantPreviewImages(key, nextState);
    persistCreativeCanvasControlImages(key, nextState);
    persistCustomCropImages(key, nextState);
    persistReferenceImages(key, nextState);
    persistSkeletonCandidates(key, nextState);
    try {
      window.localStorage.setItem(key, JSON.stringify(makePersistableState(nextState, key)));
    } catch {
      try {
        window.localStorage.setItem(
          key,
          JSON.stringify(makeMinimalPersistableState(nextState, key)),
        );
      } catch {
        try {
          window.localStorage.setItem(
            key,
            JSON.stringify(makeUltraMinimalPersistableState(nextState, key)),
          );
        } catch (fallbackError) {
          try {
            window.localStorage.setItem(
              key,
              JSON.stringify(makeEmergencyPersistableState(nextState, key)),
            );
          } catch (emergencyError) {
            // Persistence is best-effort. Keep the live in-memory workspace usable
            // and avoid turning a recoverable browser quota issue into an app error.
            console.warn("Workspace persistence skipped because browser storage is full", {
              fallbackError,
              emergencyError,
            });
          }
        }
      }
    }
  }

  function persistActiveWorkspace(nextState: WorkspaceState) {
    const userId = nextState.studyProfile?.userId?.trim();
    if (userId) {
      window.localStorage.removeItem(STORAGE_KEY);
      persistWorkspace(userWorkspaceStorageKey(userId), nextState);
      return;
    }
    persistWorkspace(STORAGE_KEY, nextState);
  }

  function loadUserWorkspace(profile: StudyProfile): boolean {
    const cleanUserId = profile.userId.trim();
    if (!cleanUserId) return false;
    try {
      const raw = window.localStorage.getItem(userWorkspaceStorageKey(cleanUserId));
      if (!raw) return false;
      const parsed = JSON.parse(raw) as Partial<WorkspaceState> & {
        diagramSkeletonXml?: string | null;
      };
      const workspaceKey = userWorkspaceStorageKey(cleanUserId);
      workspaceLoadEpochRef.current += 1;
      const loadEpoch = workspaceLoadEpochRef.current;
      const restored = restoreWorkspaceFromPartial({
          ...parsed,
          studyProfile: {
            ...profile,
            ...(parsed.studyProfile ?? {}),
            userId: cleanUserId,
            onboardingCompletedAt: profile.onboardingCompletedAt,
          },
          status: "Workspace restored.",
        });
      setState(restored);
      void Promise.all([
        hydrateVariantPreviewImages(workspaceKey, restored, cleanUserId),
        hydrateCreativeCanvasControlImages(workspaceKey, restored, cleanUserId),
        hydrateCustomCropImages(workspaceKey, restored),
        hydrateReferenceImages(workspaceKey, restored, cleanUserId),
        hydrateSkeletonCandidates(workspaceKey, restored, cleanUserId),
      ]).then(([hydratedVariantState, hydratedCanvasState, hydratedCropState, hydratedReferenceState, hydratedSkeletonState]) => {
        if (workspaceLoadEpochRef.current !== loadEpoch) return;
        setState((current) => {
          const diagramSkeletonCandidates = mergeHydratedSkeletonCandidates(
            current.diagramSkeletonCandidates,
            hydratedSkeletonState.diagramSkeletonCandidates,
          );
          const selectedSkeleton = current.selectedDiagramSkeletonId
            ? diagramSkeletonCandidates.find((candidate) => candidate.id === current.selectedDiagramSkeletonId) ?? null
            : null;
          return {
            ...current,
            board: mergeHydratedReferences(current.board, hydratedReferenceState.board),
            references: mergeHydratedReferences(current.references, hydratedReferenceState.references),
            customIconReferences: mergeHydratedCustomIcons(
              current.customIconReferences,
              hydratedCropState.customIconReferences,
            ),
            referenceRegions: mergeHydratedReferenceRegions(
              current.referenceRegions,
              hydratedCropState.referenceRegions,
            ),
            workspaceVersions: mergeHydratedWorkspaceVersionCrops(
              mergeHydratedWorkspaceVersionReferences(
                current.workspaceVersions,
                hydratedReferenceState.workspaceVersions,
              ),
              hydratedCropState.workspaceVersions,
            ),
            diagramSkeletonCandidates,
            diagramSkeletonXml: current.diagramSkeletonXml || selectedSkeleton?.xml || null,
            diagramSkeletonMermaid: current.diagramSkeletonMermaid || selectedSkeleton?.mermaid || null,
            diagramSkeletonPlan: current.diagramSkeletonPlan || selectedSkeleton?.diagramPlan || null,
            variants: current.variants.map((variant) => {
              const hydratedVariant = hydratedVariantState.variants.find((item) => item.id === variant.id);
              return {
                ...variant,
                previewImageDataUrl:
                  !variant.previewImageDataUrl && !variant.previewImageUrl
                    ? hydratedVariant?.previewImageDataUrl ?? variant.previewImageDataUrl
                    : variant.previewImageDataUrl,
                draftPreviewImageDataUrl:
                  !variant.draftPreviewImageDataUrl && !variant.draftPreviewImageUrl
                    ? hydratedVariant?.draftPreviewImageDataUrl ?? variant.draftPreviewImageDataUrl
                  : variant.draftPreviewImageDataUrl,
              };
            }),
            creativeCanvas: {
              ...current.creativeCanvas,
              items: current.creativeCanvas.items.map((item) => {
                const hydratedItem = hydratedCanvasState.creativeCanvas.items.find((entry) => entry.id === item.id);
                return item.type === "control" && !item.controlImageDataUrl
                  ? { ...item, controlImageDataUrl: hydratedItem?.controlImageDataUrl ?? item.controlImageDataUrl }
                  : item;
              }),
            },
            creativeCanvases: current.creativeCanvases.map((document) => {
              const hydratedDocument = hydratedCanvasState.creativeCanvases.find((entry) => entry.id === document.id);
              return hydratedDocument ?? document;
            }),
          };
        });
      });
      void fetchStudyRecovery(cleanUserId, restored.studySessionId)
        .then(async ({ artifacts }) => {
          const localHasOutputs = restored.diagramSkeletonCandidates.length > 0 ||
            restored.variants.length > 0 ||
            restored.figureHistory.length > 0;
          let recoveryArtifacts = artifacts;
          if (!localHasOutputs && !artifacts.some(isRecoverableStudyArtifact)) {
            const archive = await fetchStudyRecovery(cleanUserId);
            recoveryArtifacts = latestRecoverableStudySessionArtifacts(archive.artifacts);
          }
          if (workspaceLoadEpochRef.current !== loadEpoch) return;
          setState((current) => {
            if (current.studyProfile?.userId?.trim() !== cleanUserId) return current;
            if (restored.studySessionId && current.studySessionId !== restored.studySessionId) return current;
            const recoveredSessionId = recoveryArtifacts.find(isRecoverableStudyArtifact)?.sessionId ?? null;
            const restoreCheckpoint = Boolean(
              recoveredSessionId && recoveredSessionId !== current.studySessionId,
            );
            const recoveryBase = recoveredSessionId && recoveredSessionId !== current.studySessionId
              ? {
                  ...current,
                  studySessionId: recoveredSessionId,
                  studySessionStartedAt: recoveryArtifacts
                    .map((artifact) => artifact.receivedAt)
                    .sort()[0] ?? current.studySessionStartedAt,
                  studySessionStatus: "active" as const,
                }
              : current;
            return mergeRecoveredStudyArtifacts(recoveryBase, recoveryArtifacts, { restoreCheckpoint });
          });
        })
        .catch((error) => {
          // Browser persistence remains the primary source. Recovery is a
          // best-effort safety net when its durable study archive is online.
          console.warn("Study archive recovery was unavailable", error);
        });
      return true;
    } catch (error) {
      console.error("Failed to restore participant workspace", error);
      return false;
    }
  }

  function logoutUserWorkspace() {
    const snapshot = latestStateRef.current;
    workspaceLoadEpochRef.current += 1;
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (snapshot.studyProfile?.userId) {
      persistWorkspace(userWorkspaceStorageKey(snapshot.studyProfile.userId), snapshot);
    }
    window.localStorage.removeItem(STORAGE_KEY);
    const signedOutState: WorkspaceState = {
      ...defaultWorkspaceState,
      studyProfile: null,
      studySessionId: null,
      studySessionStartedAt: null,
      studySessionStatus: "setup",
      status: "Signed out. Enter the next participant ID to continue.",
    };
    latestStateRef.current = signedOutState;
    setState(signedOutState);
  }

  useEffect(() => {
    latestStateRef.current = state;
    hydratedRef.current = hydrated;
    if (!hydrated) return;
    if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      const snapshot = latestStateRef.current;
      persistActiveWorkspace(snapshot);
    }, 220);
  }, [hydrated, state]);

  useEffect(() => {
    const flush = () => {
      if (!hydratedRef.current) return;
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      const snapshot = latestStateRef.current;
      persistActiveWorkspace(snapshot);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flush();
    };
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({ hydrated, state, setState, loadUserWorkspace, logoutUserWorkspace }),
    [hydrated, state],
  );

  return createElement(WorkspaceContext.Provider, { value }, children);
}

export function useWorkspaceState(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspaceState must be used within a WorkspaceProvider");
  }
  return ctx;
}
