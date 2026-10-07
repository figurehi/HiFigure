"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { fetchStudyRecovery, fetchStudyTasks } from "../lib/api";
import { createDemoWorkspaceState } from "../lib/demo-seed";
import {
  useWorkspaceState,
  latestRecoverableStudySessionArtifacts,
  mergeRecoveredStudyArtifacts,
  type StudyProfile,
  type WorkspaceState,
} from "../lib/workspace-state";
import {
  getParticipantTaskAssignment,
  getParticipantStudyTasks,
  PARTICIPANT_STUDY_TASKS,
  type StudyTask,
} from "../lib/study-config";
import { SCIENTIFIC_ICON_CATALOG_VERSION } from "../lib/icon-catalog-meta";

export function StudyOnboarding() {
  const { setState, loadUserWorkspace } = useWorkspaceState();
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [tasks, setTasks] = useState<readonly StudyTask[]>(PARTICIPANT_STUDY_TASKS);
  const [touched, setTouched] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const cleanUserId = userId.trim();
  const canContinue = cleanUserId.length >= 2;
  const assignment = getParticipantTaskAssignment(cleanUserId, tasks);
  const selectedTask = assignment.task;

  useEffect(() => {
    let active = true;
    void fetchStudyTasks()
      .then((nextTasks) => {
        const participantTasks = getParticipantStudyTasks(nextTasks);
        if (active && participantTasks.length) setTasks(participantTasks);
      })
      .catch(() => {
        // The checked-in shared catalog is the offline fallback.
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!canContinue || restoring) return;
    setRestoring(true);
    const profile: StudyProfile = {
      userId: cleanUserId,
      figureGoal: "method",
      referencePreference: "balanced",
      onboardingCompletedAt: new Date().toISOString(),
    };
    if (loadUserWorkspace(profile)) {
      router.push("/");
      return;
    }
    const now = new Date().toISOString();
    const sessionId = `${cleanUserId}-${Date.now()}`;
    const initializedWorkspace: WorkspaceState = {
      ...createDemoWorkspaceState(selectedTask, { seedWorkingPrompt: false }),
      studyProfile: profile,
      studySessionId: sessionId,
      studySessionStartedAt: now,
      studySessionStatus: "active",
      activeStudyStage: "brief",
      activeStudyPhase: "envision",
      visitedStudyStages: ["brief"],
      visitedStudyPhases: ["envision"],
      completedStudyStages: [],
      completedStudyPhases: [],
      workflowMode: "freeform",
      studyEvents: [{
        id: `event-${Date.now()}-1`,
        sessionId,
        elapsedMs: 0,
        stage: "brief",
        type: "session_started",
        targetIds: [],
        metadata: {
          taskVersion: selectedTask.version,
          assignmentSequence: assignment.sequenceSlot,
          hifigurePeriod: assignment.hifigurePeriod,
          taskPosition: assignment.taskPosition,
          iconCatalogVersion: SCIENTIFIC_ICON_CATALOG_VERSION,
          entryMode: "direct",
          phase: "envision",
        },
      }],
      status: "Workspace initialized. Search for reference figures to get started.",
    };

    // A participant archive can outlive its browser storage. Before treating a
    // missing localStorage entry as a brand-new participant, recover the latest
    // durable session so re-entering an ID cannot silently hide prior outputs.
    try {
      const { artifacts } = await fetchStudyRecovery(cleanUserId);
      const sessionArtifacts = latestRecoverableStudySessionArtifacts(artifacts);
      const latestArtifact = sessionArtifacts.find((artifact) =>
        artifact.kind === "workspace" || artifact.kind === "skeleton" || artifact.kind === "candidate" || artifact.kind === "revision",
      );
      if (latestArtifact) {
        const hasRevision = sessionArtifacts.some((artifact) => artifact.kind === "revision");
        const hasCandidate = sessionArtifacts.some((artifact) => artifact.kind === "candidate");
        const hasSkeleton = sessionArtifacts.some((artifact) => artifact.kind === "skeleton");
        const recoveredWorkspace = mergeRecoveredStudyArtifacts({
          ...initializedWorkspace,
          studySessionId: latestArtifact.sessionId,
          studySessionStartedAt: sessionArtifacts
            .map((artifact) => artifact.receivedAt)
            .sort()[0] ?? now,
          activeStudyStage: hasRevision ? "refine" : hasCandidate ? "compose" : hasSkeleton ? "skeleton" : "brief",
          activeStudyPhase: hasCandidate || hasRevision ? "evolve" : hasSkeleton ? "externalize" : "envision",
          activeStudioStep: hasCandidate || hasRevision ? "candidate" : hasSkeleton ? "layout" : "prompt",
          visitedStudyStages: [
            "brief",
            "references",
            ...(hasSkeleton ? ["skeleton" as const] : []),
            ...(hasCandidate || hasRevision ? ["compose" as const] : []),
            ...(hasRevision ? ["refine" as const] : []),
          ],
          visitedStudyPhases: [
            "envision",
            ...(hasSkeleton ? ["externalize" as const] : []),
            ...(hasCandidate || hasRevision ? ["evolve" as const] : []),
          ],
          completedStudyStages: [
            "brief",
            "references",
            ...(hasSkeleton ? ["skeleton" as const] : []),
            ...(hasCandidate || hasRevision ? ["compose" as const] : []),
          ],
          completedStudyPhases: [
            "envision",
            ...(hasSkeleton ? ["externalize" as const] : []),
          ],
          status: "Workspace restored from the durable study archive.",
        }, sessionArtifacts, { restoreCheckpoint: true });
        setState(recoveredWorkspace);
        router.push("/");
        return;
      }
    } catch (error) {
      console.warn("Study archive lookup was unavailable during sign-in", error);
    }
    setState(initializedWorkspace);
    router.push("/");
    setRestoring(false);
  }

  return (
    <div className="page study-entry-page">
      <div className="page-inner study-entry-inner">
        <form className="study-entry-panel" onSubmit={handleSubmit}>
          <header className="study-entry-head">
            <h1>Start the HiFigure study</h1>
            <p>
              Enter the participant ID to open the assigned study workspace.
            </p>
          </header>

          <label className="label study-user-id">
            <span className="label-text">Participant ID</span>
            <input
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="e.g. P07"
              autoFocus
            />
            {touched && !canContinue ? <small>Enter at least two characters.</small> : null}
          </label>

          <footer className="study-entry-actions">
            <button type="submit" className="btn btn-primary" disabled={!canContinue || restoring}>
              {restoring ? "Restoring workspace…" : "Start study"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
