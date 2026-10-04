import {
  createDefaultCreativeCanvas,
  createDefaultCreativeCanvasDocument,
  createGuidedDialogueState,
  createDefaultIntentGraph,
  createEmptyIdeaHistoryState,
  type WorkspaceState,
} from "./workspace-state";
import { STUDY_TASK, type StudyTask } from "./study-config";
import { SCIENTIFIC_ICON_CATALOG_VERSION } from "./icon-catalog-meta";
import { createEmptyStyleKit } from "./style-kit";

function seedFingerprint(prefix: "task" | "prompt", value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${prefix}-${value.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

export function createDemoWorkspaceState(
  task: StudyTask = STUDY_TASK,
  options: { seedWorkingPrompt?: boolean } = {},
): WorkspaceState {
  const now = new Date().toISOString();
  const workingPrompt = options.seedWorkingPrompt === false ? "" : task.prompt;
  const initialPromptFingerprint = seedFingerprint("prompt", workingPrompt);
  const initialPromptRevision = {
    id: `prompt-revision-${Date.parse(now) || 0}-${initialPromptFingerprint.replace("prompt-", "")}`,
    text: workingPrompt,
    fingerprint: initialPromptFingerprint,
    createdAt: now,
    source: "initial" as const,
  };
  const creativeCanvas = createDefaultCreativeCanvas();
  const creativeCanvasDocument = {
    ...createDefaultCreativeCanvasDocument(1),
    canvas: creativeCanvas,
  };
  return {
    studyProfile: null,
    studyTaskVersion: task.version,
    assignedTaskSnapshot: {
      version: task.version,
      title: task.title,
      audience: task.audience,
      brief: task.prompt,
      requirements: [...task.requirements],
      fingerprint: seedFingerprint("task", JSON.stringify({
        version: task.version,
        title: task.title,
        audience: task.audience,
        brief: task.prompt,
        requirements: task.requirements,
      })),
    },
    iconCatalogVersion: SCIENTIFIC_ICON_CATALOG_VERSION,
    studySessionId: null,
    studySessionStartedAt: null,
    studySessionStatus: "setup",
    activeStudyStage: "references",
    visitedStudyStages: ["references"],
    completedStudyStages: [],
    workflowMode: "freeform",
    workspaceView: "studio",
    activeStudioStep: "prompt",
    studyEvents: [],
    guidedDialogue: createGuidedDialogueState(),
    skeletonConfirmedAt: null,
    reviewResult: [],
    activeStyleKit: createEmptyStyleKit(),
    skeletonStyleApplications: {},
    nodeIconBindings: {},
    nodeFontBindings: {},
    nodeColorBindings: {},
    recentIconIds: [],
    lockedDiagramObjectIds: [],
    ideaHistory: createEmptyIdeaHistoryState(false),
    workspaceVersions: [],
    activeWorkspaceVersionId: null,
    showProvenance: false,
    prompt: workingPrompt,
    generationBrief: workingPrompt,
    promptUpdatedAt: now,
    promptRevisions: workingPrompt ? [initialPromptRevision] : [],
    currentPromptRevisionId: workingPrompt ? initialPromptRevision.id : null,
    diagramSkeletonPromptRevisionId: null,
    diagramSkeletonPromptFingerprint: null,
    diagramSkeletonXml: null,
    diagramSkeletonPlan: null,
    diagramSkeletonMermaid: null,
    diagramSkeletonCandidates: [],
    selectedDiagramSkeletonId: null,
    layoutSkeletonGenerationInProgress: false,
    references: [],
    retrievalSession: {
      searchGoal: null,
      offset: 0,
      hasMore: false,
      promptFingerprint: null,
    },
    board: [],
    referenceUsage: {},
    layoutReferenceId: null,
    canvasGenerationReferenceIds: [],
    canvasFocusReferenceId: null,
    iconReferenceIds: ["robot"],
    iconReferenceId: "robot",
    fontReferenceId: null,
    paletteReferenceId: null,
    matchedStylePalette: null,
    customIconReferences: [],
    styleVisualAnalyses: {},
    styleAnalysisStates: {},
    referenceRegions: [],
    variants: [],
    candidateGenerationSnapshots: {},
    selectedVariantId: null,
    figureHistory: [],
    figureHistoryCompareIds: null,
    intentGraph: createDefaultIntentGraph(),
    activeCreativeCanvasId: creativeCanvasDocument.id,
    creativeCanvases: [creativeCanvasDocument],
    creativeCanvas,
    creativeCanvasUndoStack: [],
    styleSummary: [],
    status: "Search for references to get started.",
  };
}

export function createDemoWorkspaceStateHydrated(): WorkspaceState {
  return createDemoWorkspaceState();
}
