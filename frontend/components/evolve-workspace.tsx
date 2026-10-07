"use client";

import { useEffect, useState } from "react";
import {
  clearReviewSnapshot,
  createArtifactFingerprint,
  createIssueFingerprint,
  readReviewSnapshot,
} from "../lib/evolve-artifact";
import {
  appendStudyEvent,
  transitionStudyStage,
  useWorkspaceState,
  type StudyStage,
} from "../lib/workspace-state";
import { ProjectDashboard } from "./project-dashboard";

const EVOLVE_TABS: Array<{
  id: Extract<StudyStage, "refine" | "review">;
  label: string;
  description: string;
}> = [
  { id: "refine", label: "Refine", description: "Select, mask, annotate, and protect" },
  { id: "review", label: "Review & Export", description: "Check and hand off the editable artifact" },
];

export function EvolveWorkspace() {
  const { state, setState } = useWorkspaceState();
  const [workspaceInstance, setWorkspaceInstance] = useState(0);
  const activeTab = EVOLVE_TABS.some((tab) => tab.id === state.activeStudyStage)
    ? state.activeStudyStage as (typeof EVOLVE_TABS)[number]["id"]
    : "refine";
  const readOnly = state.studySessionStatus === "finished";
  const scientificCount = state.reviewResult.filter((issue) => issue.category === "scientific").length;
  const visualCount = state.reviewResult.filter((issue) => issue.category === "visual").length;
  const currentArtifactFingerprint = createArtifactFingerprint(state);
  const [reviewSnapshot, setReviewSnapshot] = useState<ReturnType<typeof readReviewSnapshot>>(null);

  useEffect(() => {
    setReviewSnapshot(readReviewSnapshot(state.studySessionId, state.studyProfile?.userId));
  }, [currentArtifactFingerprint, state.reviewResult, state.studyProfile?.userId, state.studySessionId]);

  const reviewIsStale = Boolean(
    state.reviewResult.length &&
    (!reviewSnapshot ||
      reviewSnapshot.artifactFingerprint !== currentArtifactFingerprint ||
      reviewSnapshot.issueFingerprint !== createIssueFingerprint(state.reviewResult)),
  );

  function openTab(stage: (typeof EVOLVE_TABS)[number]["id"]) {
    if (readOnly) return;
    if (stage === activeTab) {
      setWorkspaceInstance((value) => value + 1);
      return;
    }
    setState((current) => transitionStudyStage(current, stage, {
      status: `Opened ${EVOLVE_TABS.find((tab) => tab.id === stage)?.label ?? stage}.`,
    }));
  }

  function reopenStudy() {
    clearReviewSnapshot(state.studySessionId, state.studyProfile?.userId);
    setState((current) => appendStudyEvent({
      ...current,
      studySessionStatus: "active",
      reviewResult: [],
      activeStudyStage: "review",
      status: "Study reopened. Review must be run again after any changes.",
    }, {
      stage: "review",
      type: "session_reopened",
      targetIds: current.selectedVariantId ? [current.selectedVariantId] : [],
      result: "review_invalidated",
      metadata: { phase: "evolve" },
    }));
  }

  return (
    <section className={`evolve-workspace ${readOnly ? "is-readonly" : ""}`}>
      <header className="evolve-workspace-head">
        <div>
          <span className="label-text">Evolve</span>
          <strong>{readOnly ? "Finished study · read-only" : "Develop and verify the selected figure"}</strong>
        </div>
        <nav className="evolve-tabs is-two-tabs" aria-label="Evolve workspace">
          {EVOLVE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? "is-active" : ""}
              onClick={() => openTab(tab.id)}
              disabled={readOnly}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              <span>{tab.label}</span>
              <small>{tab.description}</small>
              {tab.id === "review" && state.reviewResult.length ? (
                <i>{reviewIsStale ? "Review stale · " : ""}{scientificCount} scientific · {visualCount} visual</i>
              ) : null}
            </button>
          ))}
        </nav>
        {readOnly ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={reopenStudy}>Reopen to edit</button>
        ) : null}
      </header>
      <div className={`evolve-workspace-body ${readOnly ? "is-readonly" : ""}`} aria-disabled={readOnly}>
        <ProjectDashboard key={`${activeTab}-${workspaceInstance}`} />
      </div>
    </section>
  );
}
