export type StudyStage = "brief" | "references" | "skeleton" | "compose" | "refine" | "review";
export type StudyPhase = "envision" | "externalize" | "evolve";

export function studyPhaseForStage(stage: StudyStage | null | undefined): StudyPhase {
  switch (stage) {
    case "brief":
    case "references":
      return "envision";
    case "skeleton":
      return "externalize";
    case "compose":
    case "refine":
    case "review":
    default:
      return "evolve";
  }
}

export function normalizeStudyPhase(
  phase: StudyPhase | string | null | undefined,
  fallbackStage: StudyStage = "brief",
): StudyPhase {
  return phase === "envision" || phase === "externalize" || phase === "evolve"
    ? phase
    : studyPhaseForStage(fallbackStage);
}

export function defaultStudyStageForPhase(phase: StudyPhase): StudyStage {
  switch (phase) {
    case "envision":
      return "references";
    case "externalize":
      return "skeleton";
    case "evolve":
      return "compose";
  }
}
