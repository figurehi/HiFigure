"use client";

import { useState } from "react";
import {
  transitionStudyStage,
  useWorkspaceState,
  type StudyStage,
} from "../lib/workspace-state";
import { LayoutStudio } from "./layout-studio";
import { ProjectDashboard } from "./project-dashboard";

const EXTERNALIZE_TABS: Array<{
  id: Extract<StudyStage, "skeleton" | "compose">;
  label: string;
  description: string;
}> = [
  {
    id: "skeleton",
    label: "Layout",
    description: "Inspect the scientific layout and shape the skeleton",
  },
  {
    id: "compose",
    label: "Compose",
    description: "Turn the checked skeleton into a first figure candidate",
  },
];

export function ExternalizeWorkspace() {
  const { state, setState } = useWorkspaceState();
  const [workspaceInstance, setWorkspaceInstance] = useState(0);
  const activeTab = EXTERNALIZE_TABS.some((tab) => tab.id === state.activeStudyStage)
    ? state.activeStudyStage as (typeof EXTERNALIZE_TABS)[number]["id"]
    : "skeleton";

  function openTab(stage: (typeof EXTERNALIZE_TABS)[number]["id"]) {
    if (stage === activeTab) {
      if (stage === "compose") setWorkspaceInstance((value) => value + 1);
      return;
    }

    setState((current) => transitionStudyStage(current, stage, {
      status: `Opened ${EXTERNALIZE_TABS.find((tab) => tab.id === stage)?.label ?? stage}.`,
    }));
  }

  return (
    <section className="evolve-workspace externalize-workspace">
      <header className="evolve-workspace-head">
        <div>
          <span className="label-text">Externalize</span>
          <strong>Make the scientific layout visible, then compose it</strong>
        </div>
        <nav className="evolve-tabs is-two-tabs" aria-label="Externalize workspace">
          {EXTERNALIZE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? "is-active" : ""}
              onClick={() => openTab(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              <span>{tab.label}</span>
              <small>{tab.description}</small>
            </button>
          ))}
        </nav>
      </header>
      <div className="evolve-workspace-body">
        {activeTab === "skeleton" ? <LayoutStudio /> : <ProjectDashboard key={`compose-${workspaceInstance}`} />}
      </div>
    </section>
  );
}
