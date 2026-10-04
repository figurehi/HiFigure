"use client";

import { useWorkspaceState, type StudyPhase, type StudyStage } from "../lib/workspace-state";
import {
  getPhaseCompletion,
  getStageCompletion,
  STUDY_PHASES,
  STUDY_STAGES,
} from "../lib/study-stage-utils";

type PhaseNavigatorProps = {
  active: StudyPhase;
  onNavigate: (phase: StudyPhase) => void;
  disabled?: boolean;
};

export function PhaseNavigator({ active, onNavigate, disabled = false }: PhaseNavigatorProps) {
  const { state } = useWorkspaceState();
  const activePhase = STUDY_PHASES.find((phase) => phase.id === active) ?? STUDY_PHASES[0];

  return (
    <details
      className="study-phase-disclosure"
      data-guide-anchor="phase-navigation"
    >
      <summary>
        <span>Workflow</span>
        <strong>{activePhase.label}</strong>
        <small>{activePhase.description}</small>
        <i aria-hidden="true">⌄</i>
      </summary>
      <nav className="study-progress study-phase-progress" aria-label="Study milestones">
        {STUDY_PHASES.map((phase, index) => {
          const isActive = phase.id === active;
          const isComplete = getPhaseCompletion(state, phase.id);
          const className = isActive ? "is-active" : isComplete ? "is-complete" : "";
          return (
            <button
              key={phase.id}
              type="button"
              className={className}
              onClick={(event) => {
                onNavigate(phase.id);
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
              disabled={disabled && !isActive}
              aria-current={isActive ? "step" : undefined}
              title={phase.description}
              data-study-phase={phase.id}
            >
              <i>{isComplete && !isActive ? "✓" : index + 1}</i>
              <span>
                <strong>{phase.label}</strong>
                <small>{phase.description}</small>
              </span>
            </button>
          );
        })}
      </nav>
    </details>
  );
}

type StageNavigatorProps = {
  active: StudyStage;
  onNavigate: (stage: StudyStage) => void;
};

export function StageNavigator({ active, onNavigate }: StageNavigatorProps) {
  const { state } = useWorkspaceState();

  return (
    <nav className="study-progress" aria-label="Study workflow">
      {STUDY_STAGES.map((stage, index) => {
        const isActive = stage.id === active;
        const isComplete = getStageCompletion(state, stage.id);
        const className = isActive ? "is-active" : isComplete ? "is-complete" : "";
        return (
          <button
            key={stage.id}
            type="button"
            className={className}
            onClick={() => onNavigate(stage.id)}
            aria-current={isActive ? "step" : undefined}
            title={`Go to ${stage.label}`}
          >
            <i>{isComplete && !isActive ? "✓" : index + 1}</i>
            {stage.label}
          </button>
        );
      })}
    </nav>
  );
}
