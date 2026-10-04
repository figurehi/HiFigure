"use client";

import { useEffect, useRef } from "react";
import { ProjectDashboard } from "./project-dashboard";
import { StudyOnboarding } from "./study-onboarding";
import { flushStudyLog } from "../lib/study-log";
import {
  normalizeStudyPhase,
  studyPhaseForStage,
  transitionStudyStage,
  useWorkspaceState,
  type StudyPhase,
  type StudyStage,
  type WorkspaceState,
} from "../lib/workspace-state";
import {
  getPhaseCompletion,
  normalizeStudyStage,
  STUDY_PHASES,
} from "../lib/study-stage-utils";

export const MIN_STUDY_POCKET_REFERENCES = 1;

function navigateWorkflowState(
  current: WorkspaceState,
  targetPhase: StudyPhase,
  targetStage: StudyStage,
): WorkspaceState {
  const fromStage = normalizeStudyStage(current.activeStudyStage);
  const fromPhase = normalizeStudyPhase(current.activeStudyPhase, fromStage);
  const phaseChanged = fromPhase !== targetPhase;
  const fromPhaseCompleted = phaseChanged && getPhaseCompletion({ ...current, completedStudyPhases: [] }, fromPhase);
  const phaseLabel = STUDY_PHASES.find((item) => item.id === targetPhase)?.label ?? targetPhase;

  const prepared: WorkspaceState = {
    ...current,
    completedStudyPhases: Array.from(new Set([
      ...(current.completedStudyPhases ?? []),
      ...(fromPhaseCompleted ? [fromPhase] : []),
    ])),
  };
  return transitionStudyStage(prepared, targetStage, { status: `Navigated to ${phaseLabel}.` });
}

export function StudyEntryGate() {
  const { hydrated, state, setState } = useWorkspaceState();
  const activeStage = normalizeStudyStage(state.activeStudyStage);
  const activePhase = normalizeStudyPhase(state.activeStudyPhase, activeStage);
  const hasProfile = Boolean(state.studyProfile?.userId);

  // Old workspaces only know the six detailed stages. Keep both navigation
  // layers synchronized so existing child views can continue writing stages.
  useEffect(() => {
    if (!hydrated || !hasProfile) return;
    setState((current) => {
      const currentStage = normalizeStudyStage(current.activeStudyStage);
      const inferredPhase = studyPhaseForStage(currentStage);
      const storedPhase = current.activeStudyPhase;
      const hasNormalizedHistory =
        Boolean(current.visitedStudyPhases?.includes(inferredPhase)) &&
        Array.isArray(current.completedStudyPhases);

      if (!storedPhase) {
        return {
          ...current,
          activeStudyPhase: inferredPhase,
          visitedStudyPhases: Array.from(new Set([
            ...(current.visitedStudyPhases ?? current.visitedStudyStages.map(studyPhaseForStage)),
            inferredPhase,
          ])),
          completedStudyPhases: current.completedStudyPhases ?? STUDY_PHASES
            .filter((phase) => getPhaseCompletion({ ...current, completedStudyPhases: [] }, phase.id))
            .map((phase) => phase.id),
        };
      }
      if (storedPhase !== inferredPhase) {
        return navigateWorkflowState(current, inferredPhase, currentStage);
      }
      if (!hasNormalizedHistory) {
        return {
          ...current,
          visitedStudyPhases: Array.from(new Set([...(current.visitedStudyPhases ?? []), inferredPhase])),
          completedStudyPhases: current.completedStudyPhases ?? [],
        };
      }
      return current;
    });
  }, [activeStage, hasProfile, hydrated, setState, state.activeStudyPhase]);

  // Ship participant events, Pocket references, and generated outputs after
  // each change settles. Sync progress lives in localStorage, so retries after
  // a backend hiccup or page reload never duplicate records.
  const studyLogStateRef = useRef(state);
  useEffect(() => {
    studyLogStateRef.current = state;
  }, [state]);
  useEffect(() => {
    if (!hydrated || !hasProfile) return;
    const timer = window.setTimeout(() => {
      void flushStudyLog(studyLogStateRef.current);
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [
    hasProfile,
    hydrated,
    state.board,
    state.activeStyleKit,
    state.customIconReferences,
    state.diagramSkeletonCandidates,
    state.nodeColorBindings,
    state.nodeFontBindings,
    state.nodeIconBindings,
    state.referenceUsage,
    state.referenceRegions,
    state.studyEvents.length,
    state.variants,
  ]);
  useEffect(() => {
    const flush = () => {
      void flushStudyLog(studyLogStateRef.current);
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  if (!hydrated) {
    return (
      <div className="page study-entry-page">
        <div className="page-inner study-entry-inner">
          <section className="study-entry-panel">
            <span className="ui-spinner ui-spinner--lg" aria-hidden="true" />
            <h1>Preparing your workspace…</h1>
          </section>
        </div>
      </div>
    );
  }

  if (!hasProfile) {
    return <StudyOnboarding />;
  }

  return (
    <div className="study-canvas-shell" data-active-study-phase={activePhase}>
      <ProjectDashboard />
    </div>
  );
}
