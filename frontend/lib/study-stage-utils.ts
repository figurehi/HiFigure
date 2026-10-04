import {
  studyPhaseForStage,
  type StudyPhase,
  type StudyStage,
  type WorkspaceState,
} from "./workspace-state";

export const STUDY_STAGES: Array<{ id: StudyStage; label: string }> = [
  { id: "brief", label: "Brief" },
  { id: "references", label: "References" },
  { id: "skeleton", label: "Skeleton" },
  { id: "compose", label: "Compose" },
  { id: "refine", label: "Refine" },
  { id: "review", label: "Review" },
];

export const STUDY_PHASES: Array<{
  id: StudyPhase;
  label: string;
  description: string;
  stages: StudyStage[];
}> = [
  {
    id: "envision",
    label: "Envision",
    description: "Clarify the task and gather visual direction",
    stages: ["brief", "references"],
  },
  {
    id: "externalize",
    label: "Externalize",
    description: "Shape and inspect the scientific skeleton",
    stages: ["skeleton"],
  },
  {
    id: "evolve",
    label: "Evolve",
    description: "Compose, refine, review, and hand off",
    stages: ["compose", "refine", "review"],
  },
];

export function normalizeStudyStage(stage: unknown): StudyStage {
  return STUDY_STAGES.some((candidate) => candidate.id === stage)
    ? stage as StudyStage
    : "brief";
}

export function getStudyPhaseIndex(phase: StudyPhase): number {
  return STUDY_PHASES.findIndex((candidate) => candidate.id === phase);
}

export function getStudyStageIndex(stage: StudyStage): number {
  return STUDY_STAGES.findIndex((candidate) => candidate.id === stage);
}

export type StageCompletionStatus = "complete" | "active" | "upcoming";

export function hasLayoutReference(state: WorkspaceState): boolean {
  return state.board.some((item) => state.referenceUsage[item.id]?.layout);
}

export function hasStyleReference(state: WorkspaceState): boolean {
  return state.board.some((item) => state.referenceUsage[item.id]?.style);
}

export function getStageCompletion(state: WorkspaceState, stage: StudyStage): boolean {
  switch (stage) {
    case "brief":
      return state.completedStudyStages.includes("brief");
    case "references":
      return hasLayoutReference(state) && hasStyleReference(state);
    case "skeleton":
      return Boolean(state.skeletonConfirmedAt || state.diagramSkeletonXml);
    case "compose":
      return state.variants.length > 0;
    case "refine":
      return state.variants.some((variant) => Boolean(variant.sourceVariantId)) || state.figureHistory.some((entry) => entry.sourceType !== "generate");
    case "review":
      return state.reviewResult.length > 0;
    default:
      return false;
  }
}

export function getPhaseCompletion(state: WorkspaceState, phase: StudyPhase): boolean {
  if (state.completedStudyPhases?.includes(phase)) return true;

  switch (phase) {
    case "envision":
      return getStageCompletion(state, "brief") && getStageCompletion(state, "references");
    case "externalize":
      return getStageCompletion(state, "skeleton");
    case "evolve":
      return getStageCompletion(state, "review") || state.studySessionStatus === "finished";
  }
}

export function phaseContainsStudyStage(phase: StudyPhase, stage: StudyStage): boolean {
  return studyPhaseForStage(stage) === phase;
}

export function getReviewIssueTargetStage(issue: { category: string; message: string; suggestedAction: string; targetIds?: string[] }): StudyStage {
  const text = `${issue.message} ${issue.suggestedAction}`.toLowerCase();
  if (issue.category === "scientific") {
    return "skeleton";
  }
  if (text.includes("editable") || text.includes("handoff") || text.includes("output") || text.includes("raster")) {
    return "review";
  }
  if ((issue.targetIds?.length ?? 0) > 0 && (text.includes("overlap") || text.includes("connector") || text.includes("module"))) {
    return "skeleton";
  }
  if (text.includes("align") || text.includes("spacing") || text.includes("color") || text.includes("font") || text.includes("density")) {
    return "refine";
  }
  return "compose";
}
