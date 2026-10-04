"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { IdeaHistoryNode } from "../lib/workspace-state";
import styles from "./figure-switcher.module.css";

export function FigureSwitcher({
  roots,
  activeRootId,
  onSelect,
  onNewFigure,
}: {
  roots: IdeaHistoryNode[];
  activeRootId: string | null;
  onSelect: (rootId: string) => void;
  onNewFigure: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const orderedRoots = useMemo(
    () => [...roots].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    [roots],
  );
  const activeRoot = orderedRoots.find((root) => root.id === activeRootId) ?? orderedRoots.at(-1) ?? null;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.figureSwitcher} ref={rootRef}>
      <button
        type="button"
        className={styles.menuButton}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{activeRoot?.title ?? "Figure"}</span>
        <small>{orderedRoots.length} total</small>
      </button>
      {open ? (
        <div className={styles.menu} role="menu" aria-label="Switch figure">
          {orderedRoots.map((root) => (
            <button
              key={root.id}
              type="button"
              role="menuitem"
              className={`${styles.menuItem} ${root.id === activeRootId ? styles.menuItemActive : ""}`}
              onClick={() => {
                onSelect(root.id);
                setOpen(false);
              }}
            >
              <span>{root.title}</span>
              {root.id === activeRootId ? <small>Current</small> : null}
            </button>
          ))}
          <div className={styles.menuDivider} aria-hidden="true" />
          <button
            type="button"
            role="menuitem"
            className={`${styles.menuItem} ${styles.menuNew}`}
            onClick={() => {
              onNewFigure();
              setOpen(false);
            }}
          >
            + New figure
          </button>
        </div>
      ) : null}
    </div>
  );
}
