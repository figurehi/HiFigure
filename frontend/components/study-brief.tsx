"use client";

import { getStudyTask } from "../lib/study-config";
import { appendStudyEvent, transitionStudyStage, useWorkspaceState } from "../lib/workspace-state";

type StudyBriefProps = {
  compact?: boolean;
  onContinue?: () => void;
};

export function StudyBrief({ compact = false, onContinue }: StudyBriefProps = {}) {
  const { state, setState } = useWorkspaceState();
  const assignedTask = state.assignedTaskSnapshot;
  const catalogTask = getStudyTask(assignedTask.version);
  const hasCatalogDetails = catalogTask.version === assignedTask.version;
  const taskOverview = hasCatalogDetails ? catalogTask.methodOverview : assignedTask.brief;
  const taskHighlights = hasCatalogDetails
    ? [catalogTask.modules[0], catalogTask.modules[Math.floor(catalogTask.modules.length / 2)], catalogTask.modules.at(-1)]
        .filter((module) => Boolean(module))
    : [];

  function continueToReferences() {
    setState((current) => {
      const confirmed = appendStudyEvent({
        ...current,
        completedStudyStages: Array.from(new Set([...current.completedStudyStages, "brief" as const])),
        status: "Task understood. Start by exploring references.",
      }, {
        stage: "brief",
        type: "brief_confirmed",
        targetIds: [],
        result: "continued",
        metadata: { taskVersion: assignedTask.version },
      });
      return compact && onContinue
        ? confirmed
        : transitionStudyStage(confirmed, "references", { status: confirmed.status });
    });
    onContinue?.();
    if (compact) {
      window.requestAnimationFrame(() => {
        document.querySelector(".workspace-prompt-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  const card = (
    <section className={`study-entry-panel study-brief-card ${compact ? "is-compact" : ""}`}>
          <header className="study-entry-head">
            <span className="label-text">Assigned task · {assignedTask.version}</span>
            <h1>{assignedTask.title}</h1>
            {!compact ? <p className="study-brief-audience">{assignedTask.audience}</p> : null}
          </header>

          <div className="study-brief-task">
            <span className="label-text">Your task</span>
            <p>{taskOverview}</p>
          </div>

          {!compact && taskHighlights.length ? (
            <div className="study-brief-three-points" aria-label="Representative method modules">
              {taskHighlights.map((module, index) => module ? (
                <article key={module.id}>
                  <i>{index + 1}</i>
                  <span><strong>{module.title}</strong><small>{module.purpose}</small></span>
                </article>
              ) : null)}
            </div>
          ) : null}

          <details className="study-brief-details">
            <summary>View the complete figure checklist</summary>
            <div className="study-task-requirements">
              {assignedTask.requirements.map((requirement) => <span key={requirement}>✓ {requirement}</span>)}
            </div>
          </details>

          {!compact || onContinue ? <footer className="study-entry-actions study-brief-actions">
            <span>You can begin with references, then generate the layout directly from your current prompt.</span>
            <button type="button" className="btn btn-primary" onClick={continueToReferences}>
              Explore references →
            </button>
          </footer> : null}
        </section>
  );

  if (compact) {
    return <div className="study-brief-inline">{card}</div>;
  }

  return (
    <div className="page study-entry-page">
      <div className="page-inner study-brief-page">
        {card}
      </div>
    </div>
  );
}
