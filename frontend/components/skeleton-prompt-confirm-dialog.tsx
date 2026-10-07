"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./skeleton-prompt-confirm-dialog.module.css";

export function SkeletonPromptConfirmDialog({
  generationLabel = "Skeleton",
  value,
  onChange,
  onCancel,
  onConfirm,
}: {
  referenceTitle: string;
  generationLabel?: "Skeleton" | "Candidate";
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    textareaRef.current?.focus();
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onCancelRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.backdrop} role="presentation" onMouseDown={onCancel}>
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="generation-prompt-confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 id="generation-prompt-confirm-title">Confirm {generationLabel} prompt</h2>
        </header>
        <label className={styles.field}>
          <span>Prompt</span>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && value.trim()) {
                event.preventDefault();
                onConfirm();
              }
            }}
          />
        </label>
        <footer className={styles.actions}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={!value.trim()}>
            Confirm &amp; generate
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
