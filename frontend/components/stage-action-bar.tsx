"use client";

import styles from "./stage-action-bar.module.css";

export type StageActionBarProps = {
  meta?: string;
  metaTitle?: string;
  primaryLabel: string;
  onPrimary: () => void;
  disabled?: boolean;
  loading?: boolean;
  guideAnchor?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryDisabled?: boolean;
  sticky?: boolean;
};

export function StageActionBar({
  meta,
  metaTitle,
  primaryLabel,
  onPrimary,
  disabled = false,
  loading = false,
  guideAnchor,
  secondaryLabel,
  onSecondary,
  secondaryDisabled = false,
  sticky = true,
}: StageActionBarProps) {
  return (
    <footer
      className={`${styles.bar} ${sticky ? styles.sticky : ""}`}
      aria-label="Stage primary action"
    >
      {metaTitle || meta ? (
        <div className={styles.meta}>
          {metaTitle ? <strong>{metaTitle}</strong> : null}
          {meta ? <span>{meta}</span> : null}
        </div>
      ) : null}
      <div className={styles.actions}>
        {secondaryLabel && onSecondary ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onSecondary}
            disabled={secondaryDisabled || loading}
          >
            {secondaryLabel}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-primary"
          data-guide-anchor={guideAnchor}
          onClick={onPrimary}
          disabled={disabled || loading}
        >
          {loading ? (
            <>
              <span className="ui-spinner" aria-hidden="true" />
              {primaryLabel}
            </>
          ) : (
            primaryLabel
          )}
        </button>
      </div>
    </footer>
  );
}
