import type { IdeaSparkStepId } from "./workspace-state";

/** Same order as IdeaSparkNavigator / NAV_PHASES in idea-history-view.tsx */
export const IDEA_SPARK_NAV_STEPS: IdeaSparkStepId[] = [
  "prompt",
  "retrieval",
  "layout",
  "style",
  "icons",
  "candidate",
  "review",
];

const STEP_SHORT_LABELS: Record<IdeaSparkStepId, string> = {
  prompt: "Prompt",
  retrieval: "Retrieval",
  layout: "Layout",
  skeleton: "Skeleton",
  style: "Style",
  icons: "Match",
  candidate: "Candidate",
  edit: "Edit",
  review: "History",
};

export function ideaSparkStepShortLabel(step: IdeaSparkStepId): string {
  return STEP_SHORT_LABELS[step];
}

export function continueToStepLabel(step: IdeaSparkStepId): string {
  return `Continue to ${STEP_SHORT_LABELS[step]} →`;
}

export function nextIdeaSparkStep(step: IdeaSparkStepId): IdeaSparkStepId | null {
  const index = IDEA_SPARK_NAV_STEPS.indexOf(step);
  if (index < 0 || index >= IDEA_SPARK_NAV_STEPS.length - 1) return null;
  return IDEA_SPARK_NAV_STEPS[index + 1] ?? null;
}
