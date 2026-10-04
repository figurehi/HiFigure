"use client";

import { useEffect, useMemo, useState } from "react";
import { reviewFigure } from "../lib/api";
import {
  clearReviewSnapshot,
  createArtifactFingerprint,
  createIssueFingerprint,
  readRefineSession,
  readReviewSnapshot,
  svgPreviewDataUrl,
  writeReviewSnapshot,
  type EvolveReviewSnapshot,
} from "../lib/evolve-artifact";
import { getReviewIssueTargetStage } from "../lib/study-stage-utils";
import { appendStudyEvent, transitionStudyStage, useWorkspaceState, type StudyStage } from "../lib/workspace-state";
import type { ReviewIssue } from "../lib/types";

type StudyReviewProps = {
  onNavigateToStage?: (stage: StudyStage) => void;
};

export function StudyReview({ onNavigateToStage }: StudyReviewProps) {
  const { state, setState } = useWorkspaceState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewSnapshot, setReviewSnapshot] = useState<EvolveReviewSnapshot | null>(null);
  const [handoffConfirmed, setHandoffConfirmed] = useState(false);
  const blocking = state.reviewResult.filter((issue) => issue.severity === "blocking");
  const unacknowledgedWarnings = state.reviewResult.filter(
    (issue) => issue.severity === "warning" && !issue.acknowledged,
  );
  const scientific = state.reviewResult.filter((issue) => issue.category === "scientific");
  const visual = state.reviewResult.filter((issue) => issue.category === "visual");
  const selectedVariant =
    state.variants.find((variant) => variant.id === state.selectedVariantId) ?? state.variants[0] ?? null;
  const artifactFingerprint = useMemo(
    () =>
      createArtifactFingerprint({
        diagramSkeletonPlan: state.diagramSkeletonPlan,
        diagramSkeletonXml: state.diagramSkeletonXml,
        diagramSkeletonMermaid: state.diagramSkeletonMermaid,
        selectedDiagramSkeletonId: state.selectedDiagramSkeletonId,
        selectedVariantId: state.selectedVariantId,
        variants: state.variants,
        nodeIconBindings: state.nodeIconBindings,
        customIconReferences: state.customIconReferences,
      }),
    [
      state.diagramSkeletonMermaid,
      state.diagramSkeletonPlan,
      state.diagramSkeletonXml,
      state.customIconReferences,
      state.nodeIconBindings,
      state.selectedDiagramSkeletonId,
      state.selectedVariantId,
      state.variants,
    ],
  );
  const issueFingerprint = useMemo(
    () => createIssueFingerprint(state.reviewResult),
    [state.reviewResult],
  );
  const participantId = state.studyProfile?.userId ?? null;
  const reviewIsStale = Boolean(
    reviewSnapshot &&
      (reviewSnapshot.artifactFingerprint !== artifactFingerprint ||
        reviewSnapshot.issueFingerprint !== issueFingerprint),
  );
  const hasCurrentReview = Boolean(reviewSnapshot && !reviewIsStale);
  const readOnly = state.studySessionStatus === "finished";
  const hasEditableSvg = Boolean(
    selectedVariant?.svg?.trim() &&
      !selectedVariant.svg.includes("Editable mock SVG generated from references"),
  );
  const editableSvgPreview = svgPreviewDataUrl(hasEditableSvg ? selectedVariant?.svg : null);

  useEffect(() => {
    setReviewSnapshot(readReviewSnapshot(state.studySessionId, participantId));
  }, [participantId, state.studySessionId]);

  useEffect(() => {
    setHandoffConfirmed(false);
  }, [artifactFingerprint, reviewSnapshot?.reviewedAt]);

  async function runReview() {
    setLoading(true);
    setError(null);
    try {
      const apiIssues = await reviewFigure({ diagramPlan: state.diagramSkeletonPlan });
      const hasPreviewableOutput = Boolean(
        selectedVariant &&
          (hasEditableSvg ||
            selectedVariant.previewImageDataUrl ||
            selectedVariant.previewImageUrl),
      );
      const frontendHandoffIssues: ReviewIssue[] = !hasPreviewableOutput
        ? [
            {
              id: "frontend-handoff-output-missing",
              category: "visual",
              severity: "blocking",
              message: "No current figure output is available to inspect for handoff.",
              targetIds: selectedVariant ? [selectedVariant.id] : [],
              suggestedAction: "Select or generate an output, inspect its preview, and run Review again.",
            },
          ]
        : !hasEditableSvg
          ? [
              {
                id: "frontend-handoff-editable-svg-missing",
                category: "visual",
                severity: "warning",
                message: "The current handoff has a raster preview but no saved editable SVG.",
                targetIds: [selectedVariant.id],
                suggestedAction: "Convert and inspect an SVG, or acknowledge that this handoff remains raster-only.",
              },
            ]
          : [];
      const issues = [...apiIssues, ...frontendHandoffIssues];
      const nextBlocking = issues.filter((issue) => issue.severity === "blocking");
      const nextSnapshot: EvolveReviewSnapshot = {
        schemaVersion: 1,
        artifactFingerprint,
        issueFingerprint: createIssueFingerprint(issues),
        reviewedAt: new Date().toISOString(),
        selectedVariantId: selectedVariant?.id ?? null,
      };
      writeReviewSnapshot(state.studySessionId, participantId, nextSnapshot);
      setReviewSnapshot(nextSnapshot);
      setState((current) =>
        appendStudyEvent(
          {
            ...current,
            reviewResult: issues,
            status: `Review completed with ${issues.length} finding(s).`,
          },
          {
            stage: "review",
            type: "review_completed",
            targetIds: issues.flatMap((issue) => issue.targetIds),
            result: nextBlocking.length ? "blocking" : "completed",
            metadata: { issueCount: issues.length },
          },
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review failed.");
    } finally {
      setLoading(false);
    }
  }

  function downloadBundle() {
    const bundle = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      participantId: state.studyProfile?.userId ?? null,
      taskVersion: state.studyTaskVersion,
      iconCatalogVersion: state.iconCatalogVersion,
      taskTitle: state.assignedTaskSnapshot.title,
      condition: "hifigure",
      frontendVersion: "study-ui-v4-inline-workspaces",
      session: {
        id: state.studySessionId,
        startedAt: state.studySessionStartedAt,
        status: state.studySessionStatus,
      },
      events: state.studyEvents,
      diagramPlan: state.diagramSkeletonPlan,
      diagramSkeletonXml: state.diagramSkeletonXml,
      review: state.reviewResult,
      reviewBinding: reviewSnapshot,
      artifactFingerprint,
      refineSessions: Object.fromEntries(
        state.variants.flatMap((variant) => {
          const session = readRefineSession(state.studySessionId, participantId, variant.id);
          return session ? [[variant.id, session] as const] : [];
        }),
      ),
      nodeIconBindings: state.nodeIconBindings,
      customIcons: state.customIconReferences.map((icon) => ({
        id: icon.id,
        label: icon.label,
        kind: icon.kind ?? null,
        tags: icon.tags,
        description: icon.description,
        contentHash: icon.contentHash ?? null,
        sourceReferenceId: icon.sourceReferenceId,
        sourceRegionId: icon.sourceRegionId,
      })),
      figureHistory: state.figureHistory,
      finalVariant: selectedVariant ? { ...selectedVariant, previewImageDataUrl: null, draftPreviewImageDataUrl: null } : null,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hifigure-study-${state.studyProfile?.userId ?? "participant"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setState((current) =>
      appendStudyEvent(current, {
        stage: "review",
        type: "study_bundle_exported",
        targetIds: selectedVariant ? [selectedVariant.id] : [],
        result: "downloaded",
      }),
    );
  }

  function finishStudy() {
    if (
      !selectedVariant ||
      blocking.length ||
      unacknowledgedWarnings.length ||
      !hasCurrentReview ||
      !handoffConfirmed
    ) {
      return;
    }
    setState((current) => {
      const logged = appendStudyEvent(current, {
        stage: "review",
        type: "session_finished",
        targetIds: [],
        result: "finished",
      });
      return { ...logged, studySessionStatus: "finished", status: "Study session finished and locked." };
    });
  }

  function reopenStudy() {
    clearReviewSnapshot(state.studySessionId, participantId);
    setReviewSnapshot(null);
    setHandoffConfirmed(false);
    setState((current) =>
      appendStudyEvent(
        {
          ...current,
          studySessionStatus: "active",
          reviewResult: [],
          status: "Study reopened. Run Review again after making changes.",
        },
        {
          stage: "review",
          type: "session_reopened",
          targetIds: selectedVariant ? [selectedVariant.id] : [],
          result: "review_invalidated",
        },
      ),
    );
  }

  function navigateForIssue(issue: ReviewIssue) {
    const stage = getReviewIssueTargetStage(issue);
    const targetVariant = state.variants.find((variant) => issue.targetIds.includes(variant.id));
    onNavigateToStage?.(stage);
    setState((current) => {
      const navigated = onNavigateToStage
        ? current
        : transitionStudyStage(current, stage, {
            status: `Opened ${stage} to inspect the selected review finding.`,
            targetIds: issue.targetIds,
          });
      return appendStudyEvent({
        ...navigated,
        selectedVariantId: targetVariant?.id ?? current.selectedVariantId,
        reviewFocusTargetIds: issue.targetIds,
        status: `Opened ${stage} to inspect the selected review finding.`,
      }, {
        stage: "review",
        type: "review_issue_navigation",
        targetIds: issue.targetIds,
        result: stage,
        metadata: { issueId: issue.id, severity: issue.severity },
      });
    });
  }

  function acknowledgeIssue(issue: ReviewIssue) {
    if (issue.severity === "blocking" || readOnly) return;
    setState((current) => appendStudyEvent({
      ...current,
      reviewResult: current.reviewResult.map((item) => item.id === issue.id ? { ...item, acknowledged: !item.acknowledged } : item),
    }, {
      stage: "review",
      type: issue.acknowledged ? "review_issue_unacknowledged" : "review_issue_acknowledged",
      targetIds: issue.targetIds,
      result: issue.id,
    }));
  }

  return (
    <div className="page study-entry-page">
      <div className="page-inner study-review-page">
        <header className="study-entry-panel study-review-hero">
          <div className="study-review-hero-row">
            <div>
              <span className="label-text">Study review</span>
              <h2 className="study-review-title">Scientific &amp; visual checks</h2>
            </div>
            {readOnly ? (
              <button type="button" className="btn btn-secondary" onClick={reopenStudy}>
                Reopen to edit
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void runReview()}
                disabled={loading}
              >
                {loading ? "Reviewing…" : reviewSnapshot ? "Run review again" : "Run final review"}
              </button>
            )}
          </div>
          {error ? <p className="study-inline-error">{error}</p> : null}
          {readOnly ? (
            <p className="study-review-hint">
              This study is read-only. Reopen it before changing the figure; reopening invalidates this check.
            </p>
          ) : reviewIsStale ? (
            <p className="study-inline-error">
              The figure changed after this check. Run Review again before finishing.
            </p>
          ) : hasCurrentReview ? (
            <p className="study-review-hint">
              Checked {reviewSnapshot ? new Date(reviewSnapshot.reviewedAt).toLocaleString() : "now"}.
            </p>
          ) : null}
        </header>
        <section className="study-review-grid">
          <ReviewColumn
            title="Scientific correctness"
            description="Modules, connectors, data flow, labels and reading order."
            issues={scientific}
            onFix={navigateForIssue}
            onAcknowledge={acknowledgeIssue}
            readOnly={readOnly}
          />
          <ReviewColumn
            title="Visual readiness"
            description="Overlap, spacing, density and editable delivery warnings."
            issues={visual}
            onFix={navigateForIssue}
            onAcknowledge={acknowledgeIssue}
            readOnly={readOnly}
          />
        </section>
        <section className="study-entry-panel study-review-handoff" aria-label="Editable handoff check">
          <div className="study-review-handoff-meta">
            <strong>Editable handoff</strong>
            <span className="badge">{editableSvgPreview ? "SVG" : "Raster"}</span>
            <span className="muted">{selectedVariant?.title ?? "No output selected"}</span>
          </div>
          <label className="study-review-handoff-confirm">
            <input
              type="checkbox"
              checked={handoffConfirmed || readOnly}
              disabled={readOnly || !hasCurrentReview || !selectedVariant}
              onChange={(event) => setHandoffConfirmed(event.target.checked)}
            />
            <span>I inspected the current output, its editable status, and the Review findings.</span>
          </label>
        </section>
        <footer className="study-outline-actions">
          <span>
            {blocking.length
              ? `${blocking.length} blocking issue(s) must be fixed`
              : reviewIsStale
                ? "The Review is stale — run it again"
                : unacknowledgedWarnings.length
                  ? `${unacknowledgedWarnings.length} warning(s) need author acknowledgement`
                  : hasCurrentReview
                    ? "Review complete — inspect and confirm the handoff"
                    : "Run Review before finishing"}
          </span>
          <button type="button" className="btn btn-secondary" onClick={downloadBundle} disabled={!reviewSnapshot}>
            Download study bundle
          </button>
          {readOnly ? (
            <button type="button" className="btn btn-secondary" onClick={reopenStudy}>Reopen</button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={finishStudy}
              disabled={
                blocking.length > 0 ||
                unacknowledgedWarnings.length > 0 ||
                !selectedVariant ||
                !hasCurrentReview ||
                !handoffConfirmed
              }
            >
              Finish study
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function ReviewColumn({
  title,
  description,
  issues,
  onFix,
  onAcknowledge,
  readOnly = false,
}: {
  title: string;
  description: string;
  issues: ReviewIssue[];
  onFix?: (issue: ReviewIssue) => void;
  onAcknowledge?: (issue: ReviewIssue) => void;
  readOnly?: boolean;
}) {
  return (
    <article className="study-entry-panel">
      <header className="study-review-column-head">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="badge">{issues.length}</span>
      </header>
      <div className="study-review-list">
        {issues.length ? (
          issues.map((issue) => (
            <div key={issue.id} className={`study-review-issue is-${issue.severity}`}>
              <strong>{issue.severity}</strong>
              <span>{issue.message}</span>
              <small>{issue.suggestedAction}</small>
              {onFix ? (
                <button type="button" className="btn btn-ghost btn-sm study-review-fix-btn" onClick={() => onFix(issue)}>
                  Inspect →
                </button>
              ) : null}
              {issue.severity === "warning" && onAcknowledge ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onAcknowledge(issue)}
                  disabled={readOnly}
                >
                  {issue.acknowledged ? "Acknowledged ✓" : "Author acknowledges"}
                </button>
              ) : null}
            </div>
          ))
        ) : (
          <p className="dashboard-empty">No findings yet.</p>
        )}
      </div>
    </article>
  );
}
