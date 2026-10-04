"use client";

import { svgPreviewDataUrl } from "../lib/evolve-artifact";
import type { VariantGenerationProgress } from "../lib/api";
import type { FigureVariant } from "../lib/types";
import styles from "./candidate-studio.module.css";

type CandidateStudioProps = {
  variants: FigureVariant[];
  selectedVariantId: string | null;
  generating: boolean;
  generationProgress?: VariantGenerationProgress | null;
  /** True when inputs changed after the shown Candidate was generated. */
  stale?: boolean;
  /** Step names that changed, e.g. ["Prompt", "Match"]. */
  staleReasons?: string[];
  canRegenerate?: boolean;
  onRegenerate?: () => void;
  onEdit?: () => void;
  onContinueRetrieval?: () => void;
  /** An Edit revision still running on the backend, shown under the figure. */
  pendingRevision?: { title: string; isSelected: boolean } | null;
};

function variantPreview(variant: FigureVariant) {
  return variant.previewImageDataUrl ?? variant.previewImageUrl ?? svgPreviewDataUrl(variant.svg);
}

function RetrievalContinueHint({ onContinueRetrieval }: { onContinueRetrieval?: () => void }) {
  return (
    <div className={styles.retrievalHint}>
      {onContinueRetrieval ? (
        <>
          You can{" "}
          <button type="button" className={styles.retrievalHintLink} onClick={onContinueRetrieval}>
            return to Retrieval
          </button>
          {" "}to keep searching for more reference figures before you generate.
        </>
      ) : (
        "You can return to Retrieval to keep searching for more reference figures before you generate."
      )}
    </div>
  );
}

export function CandidateStudio({
  variants,
  selectedVariantId,
  generating,
  generationProgress = null,
  stale = false,
  staleReasons = [],
  canRegenerate = false,
  onRegenerate,
  onEdit,
  onContinueRetrieval,
  pendingRevision = null,
}: CandidateStudioProps) {
  const liveVariants = variants.filter((variant) => !variant.deletedAt);
  const candidates = liveVariants.filter((variant) => !variant.sourceVariantId);
  const selected = liveVariants.find((variant) => variant.id === selectedVariantId)
    ?? candidates[0]
    ?? liveVariants[0]
    ?? null;
  const livePreview = generationProgress?.previewImageDataUrl ?? generationProgress?.previewImageUrl ?? null;
  const progressLabel = generationProgress?.label ?? "Generating your Candidate…";

  if (!selected) {
    if (generating && livePreview) {
      return (
        <section className={styles.workspace} aria-label="Candidate workspace">
          <div className={styles.generatingNote} role="status">
            <span className="ui-spinner" aria-hidden="true" />
            <div>
              <strong>{progressLabel}</strong>
              <span className={styles.phaseMeta}>Step {generationProgress?.passIndex ?? 1} of {generationProgress?.passCount ?? 1}</span>
            </div>
          </div>
          <div className={styles.previewStage}>
            <figure className={`${styles.preview} ${styles.livePreview}`}>
              <img
                key={`progress-${generationProgress?.version ?? 0}`}
                className={styles.previewImage}
                src={livePreview}
                alt="Candidate generation preview"
              />
              {generationProgress?.phase === "refining" ? (
                <figcaption className={styles.refiningOverlay}>
                  <span className="ui-spinner" aria-hidden="true" />
                  Draft locked · refining details
                </figcaption>
              ) : null}
            </figure>
          </div>
        </section>
      );
    }
    return (
      <section className={styles.empty} aria-label="Candidate workspace">
        <span className="label-text">Candidate</span>
        <h2>No Candidates yet</h2>
        {generating ? <span className="ui-spinner ui-spinner--lg" aria-hidden="true" /> : null}
        <p>{generating ? "Generating the first Candidate…" : "Confirm inputs on the left, then generate your first Candidate."}</p>
        <RetrievalContinueHint onContinueRetrieval={onContinueRetrieval} />
      </section>
    );
  }

  const selectedPreview = variantPreview(selected);
  const displayedPreview = generating && livePreview ? livePreview : selectedPreview;
  const previewKey = generating && livePreview
    ? `progress-${generationProgress?.version ?? 0}`
    : `candidate-${selected.id}`;

  return (
    <section className={styles.workspace} aria-label="Candidate workspace">
      {/* The generated title restates the prompt and the stage toolbar already
          names this step, so the figure itself leads the page. */}
      {generating ? (
        <div className={styles.generatingNote} role="status">
          <span className="ui-spinner" aria-hidden="true" />
          <div>
            <strong>{progressLabel}</strong>
            {generationProgress ? (
              <span className={styles.phaseMeta}>Step {generationProgress.passIndex} of {generationProgress.passCount}</span>
            ) : null}
            <RetrievalContinueHint onContinueRetrieval={onContinueRetrieval} />
          </div>
        </div>
      ) : null}

      {stale ? (
        <div className={styles.staleBanner} role="status">
          <div>
            <strong>Inputs changed since this Candidate</strong>
            <p>
              {staleReasons.length
                ? `${staleReasons.join(", ")} changed after this figure was generated. Generate again to apply the new inputs, or keep this one and edit it.`
                : "Generate again to apply the new inputs, or keep this one and edit it."}
            </p>
          </div>
        </div>
      ) : null}

      <div className={styles.previewStage}>
        <figure className={styles.preview}>
          {displayedPreview ? (
            <img key={previewKey} className={styles.previewImage} src={displayedPreview} alt={selected.title} />
          ) : <div className={styles.noPreview}>Preview unavailable</div>}
          {selected.sourceVariantId && !generating ? (
            <span className={styles.editResultBadge}>Selected Edit</span>
          ) : null}
          {generating && livePreview && generationProgress?.phase === "refining" ? (
            <figcaption className={styles.refiningOverlay}>
              <span className="ui-spinner" aria-hidden="true" />
              Draft locked · refining details
            </figcaption>
          ) : null}
          {onEdit || onRegenerate ? (
            <div className={styles.previewActions}>
              {onRegenerate ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  data-guide-anchor="candidate-generate-action"
                  onClick={onRegenerate}
                  disabled={!canRegenerate || generating}
                >
                  {generating ? <><span className="ui-spinner" aria-hidden="true" />Generating…</> : stale ? "Generate again" : "Generate another"}
                </button>
              ) : null}
              {onEdit ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  data-guide-anchor="candidate-edit-action"
                  onClick={onEdit}
                >
                  Edit this Candidate
                </button>
              ) : null}
            </div>
          ) : null}
        </figure>
        {pendingRevision ? (
          <p className={styles.revisionNote} role="status">
            <span className="ui-spinner" aria-hidden="true" />
            {pendingRevision.isSelected
              ? "Still applying your edits to this figure. Closing Edit did not stop the run; the revision lands in Edit and History when it is done."
              : `Still applying your edits to ${pendingRevision.title}. Closing Edit did not stop the run.`}
          </p>
        ) : null}
      </div>

    </section>
  );
}
