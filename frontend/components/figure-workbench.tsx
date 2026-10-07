"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { searchReferences } from "../lib/api";
import type { ReferenceItem, ReferenceRegion, SearchGoal } from "../lib/types";
import { partitionStableMasonry } from "../lib/stable-masonry";
import { normalizeStyleKit } from "../lib/style-kit";
import {
  appendStudyEvent,
  commitWorkingPromptRevision,
  countReferencesWithRole,
  createPromptFingerprint,
  hasReferenceRole,
  referenceHasAnyRole,
  referenceRoleUsageKey,
  REFERENCE_ROLES,
  useWorkspaceState,
  type ReferenceRole,
} from "../lib/workspace-state";
import { ImageRegionMarquee } from "./image-region-marquee";
import disclosureStyles from "./progressive-disclosure.module.css";

function shortCite(item: ReferenceItem) {
  const venue = item.venue ? `${item.venue} ${item.year}` : `${item.year}`;
  return `${item.sourcePaper} · ${venue}`;
}

const testPromptPresets = [
  {
    label: "RAG scoring",
    prompt:
      "Create a publication-quality methodology figure for an AI research paper. The figure should show an end-to-end hallucination-aware RAG framework: user query and retrieved documents enter parallel evidence and parametric-knowledge branches; an LLM layer analyzer extracts attention weights, FFN residual streams, and token evidence; two scoring modules compute external context support and parametric knowledge reliance; a conflict detector merges both scores and routes to faithful answer generation, abstention, or citation repair. Use clear grouped modules, labeled arrows, and a layout suitable for a two-column paper.",
  },
  {
    label: "Low-light pipeline",
    prompt:
      "Design a computer-vision method figure for unsupervised low-light image enhancement. Show an input image split into masked illumination variants, a decomposition network with illumination and reflectance branches, cross-attention guided degradation representation, LCnet illumination correction, a DCT prior module with low-pass and high-pass filters, and a loss panel for exposure, color consistency, and contrast. Keep the framework in three readable bands: preprocessing, network modules, and prior/loss supervision.",
  },
  {
    label: "Action agent",
    prompt:
      "Create a workflow figure for a multimodal question-answering agent. The pipeline starts from a user question and context examples, generates a chain of sub-questions, chooses actions such as web querying, data analysis, and knowledge encoding, monitors missing information flags, updates intermediate answers, and produces a final grounded answer. Use a left-to-right layout with one cyclic planning component and a separate execution/monitoring panel.",
  },
  {
    label: "Dynamic VQA",
    prompt:
      "Draw a framework figure for dynamic multimodal VQA retrieval. Show an input question and image pair feeding an action planner; the planner selects among web search, text-to-image search, image-to-image search, and no-search; retrieved content is passed to sub-question solvers using LLMs and MLLMs; updated feedback loops back to the planner until the system returns a final answer. Emphasize the feedback loop and retrieval routing choices.",
  },
] as const;

const SEARCH_GOAL_OPTIONS: Array<{ value: SearchGoal; label: string; description: string }> = [
  {
    value: "idea",
    label: "Search by Topic",
    description: "Match the problem, core mechanism, and explanatory intent.",
  },
  {
    value: "structure",
    label: "Search by Layout",
    description: "Match modules, grouping, topology, and reading flow.",
  },
  {
    value: "style",
    label: "Search by Style",
    description: "Match explicit visual language, rendering, and palette preferences.",
  },
];

const MIN_STUDY_POCKET_REFERENCES = 1;
const RETRIEVAL_BATCH_SIZE = 12;
const RETRIEVAL_COLUMN_STORAGE_KEY = "hichart.retrieval.columns";
const RETRIEVAL_COLUMN_OPTIONS = [2, 3, 4, 5, 6] as const;
type RetrievalColumnCount = (typeof RETRIEVAL_COLUMN_OPTIONS)[number];

function isRetrievalColumnCount(value: number): value is RetrievalColumnCount {
  return RETRIEVAL_COLUMN_OPTIONS.some((option) => option === value);
}

function appendUniqueReferences(current: ReferenceItem[], incoming: ReferenceItem[]) {
  const knownIds = new Set(current.map((reference) => reference.id));
  return [
    ...current,
    ...incoming.filter((reference) => {
      if (knownIds.has(reference.id)) return false;
      knownIds.add(reference.id);
      return true;
    }),
  ];
}

const REFERENCE_ROLE_LABELS: Record<ReferenceRole, string> = {
  layout: "Layout",
  style: "Style",
  icon: "Icon",
  font: "Font",
  palette: "Palette",
};

const EXTRA_REFERENCE_ROLES: ReferenceRole[] = ["icon", "font", "palette"];

function CardActionIcon({
  remove = false,
}: {
  remove?: boolean;
}) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d={remove ? "M4 10h12" : "M10 4v12M4 10h12"} />
    </svg>
  );
}

function SearchGoalIcon({ goal }: { goal: SearchGoal }) {
  if (goal === "idea") {
    return (
      <svg className="retrieval-goal-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <circle cx="8.25" cy="8.25" r="4.25" />
        <path d="m11.5 11.5 4.25 4.25M6.3 6.9h3.9M6.3 9.2h2.4" />
      </svg>
    );
  }
  if (goal === "structure") {
    return (
      <svg className="retrieval-goal-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <rect x="7" y="2.75" width="6" height="4.25" rx="1" />
        <rect x="2.5" y="13" width="6" height="4.25" rx="1" />
        <rect x="11.5" y="13" width="6" height="4.25" rx="1" />
        <path d="M10 7v3.25M5.5 13v-2.75h9V13" />
      </svg>
    );
  }
  return (
    <svg className="retrieval-goal-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 2.75a7.25 7.25 0 1 0 0 14.5h1.15a1.7 1.7 0 0 0 1.2-2.9l-.25-.25a1.35 1.35 0 0 1 .95-2.3h1.2A3 3 0 0 0 17.25 9 7.25 7.25 0 0 0 10 2.75Z" />
      <circle className="is-fill" cx="6.4" cy="8.1" r=".85" />
      <circle className="is-fill" cx="8.7" cy="5.9" r=".85" />
      <circle className="is-fill" cx="12" cy="6.1" r=".85" />
    </svg>
  );
}

type FigureWorkbenchProps = {
  onEnterCanvas?: () => void;
  studyMode?: boolean;
  focus?: "prompt" | "retrieval";
  pocketFocusRequest?: {
    referenceId: string;
    role: "layout" | "style";
    nonce: number;
  } | null;
  onPocketAction?: (
    item: ReferenceItem,
    role: "layout" | "style",
    action: "add" | "remove",
  ) => void;
};

export function FigureWorkbench({
  onEnterCanvas,
  studyMode = false,
  focus = "prompt",
  pocketFocusRequest = null,
  onPocketAction,
}: FigureWorkbenchProps = {}) {
  const { state, setState } = useWorkspaceState();
  const promptSectionRef = useRef<HTMLDivElement | null>(null);
  const retrievalSectionRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState<null | "search">(null);
  const [previewReference, setPreviewReference] = useState<ReferenceItem | null>(null);
  const [regionReference, setRegionReference] = useState<ReferenceItem | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{ item: ReferenceItem; role: ReferenceRole; dependencyCount: number } | null>(null);
  const [pocketExpanded, setPocketExpanded] = useState(false);
  const [provenanceExpanded, setProvenanceExpanded] = useState(false);
  const [roleMenuReferenceId, setRoleMenuReferenceId] = useState<string | null>(null);
  const [retrievalColumnCount, setRetrievalColumnCount] = useState<RetrievalColumnCount>(3);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const retrievalCardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const { prompt, references, board, referenceUsage, studyProfile } = state;
  const searchPrompt = prompt;
  const promptFingerprint = createPromptFingerprint(prompt);
  const retrievalSession = state.retrievalSession ?? {
    searchGoal: null,
    offset: 0,
    hasMore: false,
    promptFingerprint: null,
  };
  const activeSearchGoal = retrievalSession.searchGoal;
  const searchOffset = retrievalSession.offset;
  const searchMatchesPrompt = retrievalSession.promptFingerprint === promptFingerprint;
  const searchHasMore = searchMatchesPrompt && retrievalSession.hasMore;
  const skeletonIsStale = Boolean(
    (state.diagramSkeletonXml || state.diagramSkeletonPlan) &&
    state.diagramSkeletonPromptFingerprint &&
    state.diagramSkeletonPromptFingerprint !== promptFingerprint
  );
  const selectedCandidateSnapshot = state.selectedVariantId
    ? state.candidateGenerationSnapshots[state.selectedVariantId]
    : null;
  const candidateIsStale = Boolean(
    selectedCandidateSnapshot && selectedCandidateSnapshot.promptFingerprint !== promptFingerprint
  );
  const staleArtifactCount = [skeletonIsStale, candidateIsStale].filter(Boolean).length;
  const candidateReferences = references;
  const layoutPocketCount = countReferencesWithRole(board, referenceUsage, "layout");
  const stylePocketCount = countReferencesWithRole(board, referenceUsage, "style");
  const canEnterCanvas = layoutPocketCount >= MIN_STUDY_POCKET_REFERENCES && stylePocketCount >= MIN_STUDY_POCKET_REFERENCES;
  const pocketByRole = REFERENCE_ROLES.map((role) => ({
    role,
    items: board.filter((item) => hasReferenceRole(referenceUsage[item.id], role)),
  }));

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const target = focus === "retrieval" ? retrievalSectionRef.current : promptSectionRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focus]);

  useEffect(() => {
    if (focus !== "retrieval" || !pocketFocusRequest) return;
    const frame = requestAnimationFrame(() => {
      const target = retrievalCardRefs.current.get(pocketFocusRequest.referenceId);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const mostlyVisible = rect.top >= -32 && rect.bottom <= viewportHeight + 32;
      if (!mostlyVisible) {
        target.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focus, pocketFocusRequest]);

  useEffect(() => {
    try {
      const savedColumnCount = Number(window.localStorage.getItem(RETRIEVAL_COLUMN_STORAGE_KEY));
      if (isRetrievalColumnCount(savedColumnCount)) setRetrievalColumnCount(savedColumnCount);
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
  }, []);

  useEffect(() => {
    if (!previewReference && !regionReference && !pendingRemoval) {
      return;
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewReference(null);
        setRegionReference(null);
        setPendingRemoval(null);
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [pendingRemoval, previewReference, regionReference]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !searchHasMore || loading !== null || !activeSearchGoal) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void handleSearch(searchOffset, activeSearchGoal);
    }, { rootMargin: "480px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeSearchGoal, loading, searchHasMore, searchOffset]);

  async function handleSearch(
    offset = 0,
    requestedGoal?: SearchGoal,
  ) {
    const searchGoal = requestedGoal ?? activeSearchGoal ?? "idea";
    const appendResults = offset > 0;
    const requestPrompt = searchPrompt;
    const requestPromptFingerprint = createPromptFingerprint(requestPrompt);
    setLoading("search");
    setState((current) => ({
      ...commitWorkingPromptRevision(current, "retrieval"),
      retrievalSession: appendResults
        ? { ...current.retrievalSession, searchGoal, hasMore: false }
        : {
            searchGoal,
            offset: 0,
            hasMore: false,
            promptFingerprint: requestPromptFingerprint,
          },
      status: appendResults ? "Loading more scientific references..." : "Searching scientific references...",
    }));

    try {
      const result = await searchReferences({
        prompt: requestPrompt,
        searchGoal,
        excludeReferenceIds: board.map((item) => item.id),
        limit: RETRIEVAL_BATCH_SIZE,
        offset,
      });
      setState((current) => {
        const currentSession = current.retrievalSession;
        if (
          currentSession.searchGoal !== searchGoal ||
          currentSession.offset !== offset ||
          currentSession.promptFingerprint !== requestPromptFingerprint
        ) {
          return current;
        }
        return appendStudyEvent({
          ...current,
          references: appendResults
            ? appendUniqueReferences(current.references, result.references)
            : result.references,
          retrievalSession: {
            searchGoal,
            offset: result.offset + result.references.length,
            hasMore: result.hasMore,
            promptFingerprint: requestPromptFingerprint,
          },
          styleSummary: [
            `Layout: ${result.styleSummary.layoutPreference}`,
            `Palette: ${result.styleSummary.palette}`,
            `Components: ${result.styleSummary.componentStyle}`,
            `Arrows: ${result.styleSummary.arrowStyle}`,
            ...result.styleSummary.notes,
          ],
          status: appendResults
            ? `Added ${result.references.length} more references.`
            : `Loaded ${result.references.length} references.`,
        }, {
          stage: "references",
          type: "reference_search_completed",
          targetIds: result.references.map((reference) => reference.id),
          result: result.references.length > 0 ? "results" : "empty",
          metadata: {
            resultCount: result.references.length,
            offset,
            batchSize: RETRIEVAL_BATCH_SIZE,
            searchGoal,
            promptFingerprint: requestPromptFingerprint,
            promptRevisionId: current.currentPromptRevisionId,
          },
        });
      });
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : "Reference search failed.";
      setState((current) => ({
        ...current,
        retrievalSession: appendResults &&
          current.retrievalSession.searchGoal === searchGoal &&
          current.retrievalSession.offset === offset &&
          current.retrievalSession.promptFingerprint === requestPromptFingerprint
          ? { ...current.retrievalSession, hasMore: true }
          : current.retrievalSession,
        status: `Search error: ${msg}`,
      }));
    } finally {
      setLoading(null);
    }
  }

  function addToPocket(item: ReferenceItem, role: ReferenceRole) {
    setState((current) => {
      const inBoard = current.board.some((entry) => entry.id === item.id);
      const usageKey = referenceRoleUsageKey(role);
      const alreadyInRolePocket = current.referenceUsage[item.id]?.[usageKey];
      if (inBoard && alreadyInRolePocket) return current;
      const nextBoard = inBoard ? current.board : [...current.board, item];
      return {
        ...current,
        board: nextBoard,
        referenceUsage: {
          ...current.referenceUsage,
          [item.id]: {
            ...current.referenceUsage[item.id],
            [usageKey]: true,
          },
        },
        status: `Added "${item.title}" to the ${role} pocket.`,
      };
    });
    if (role === "layout" || role === "style") onPocketAction?.(item, role, "add");
  }

  function referenceDependencyCount(referenceId: string) {
    const canvasItems = state.creativeCanvas.items.filter((item) =>
      item.referenceId === referenceId ||
      item.sourceReferenceId === referenceId ||
      item.sourceStyleReferenceId === referenceId,
    ).length;
    const regions = state.referenceRegions.filter((region) => region.referenceId === referenceId).length;
    const skeletons = state.diagramSkeletonCandidates.filter((candidate) => candidate.referenceId === referenceId).length;
    return canvasItems + regions + skeletons;
  }

  function requestRemoveFromPocket(item: ReferenceItem, role: ReferenceRole) {
    const usageKey = referenceRoleUsageKey(role);
    const nextUsage = { ...state.referenceUsage[item.id], [usageKey]: false };
    const dependencyCount = referenceDependencyCount(item.id);
    if (!referenceHasAnyRole(nextUsage) && dependencyCount > 0) {
      setPendingRemoval({ item, role, dependencyCount });
      return;
    }
    removeFromPocket(item, role);
  }

  function removeFromPocket(item: ReferenceItem, role: ReferenceRole) {
    setState((current) => {
      const usageKey = referenceRoleUsageKey(role);
      const currentUsage = current.referenceUsage[item.id] ?? {};
      const nextUsageForItem = {
        ...currentUsage,
        [usageKey]: false,
      };
      const dependencyCount =
        current.referenceRegions.filter((region) => region.referenceId === item.id).length +
        current.diagramSkeletonCandidates.filter((candidate) => candidate.referenceId === item.id).length +
        current.creativeCanvas.items.filter((canvasItem) =>
          canvasItem.referenceId === item.id ||
          canvasItem.sourceReferenceId === item.id ||
          canvasItem.sourceStyleReferenceId === item.id,
        ).length;
      // Keep a source-only record when downstream artifacts still depend on it.
      // This prevents a role change from silently breaking provenance.
      const keepInBoard = referenceHasAnyRole(nextUsageForItem) || dependencyCount > 0;
      const nextReferenceUsage = { ...current.referenceUsage };
      if (keepInBoard) {
        nextReferenceUsage[item.id] = nextUsageForItem;
      } else {
        delete nextReferenceUsage[item.id];
      }
      const now = new Date().toISOString();
      const removingStyleSource = role === "style" && current.activeStyleKit.sourceReferenceIds.includes(item.id);
      const next = {
        ...current,
        board: keepInBoard
          ? current.board
          : current.board.filter((entry) => entry.id !== item.id),
        referenceUsage: nextReferenceUsage,
        layoutReferenceId:
          role === "layout" && current.layoutReferenceId === item.id
            ? null
            : current.layoutReferenceId,
        canvasFocusReferenceId:
          role === "style" && current.canvasFocusReferenceId === item.id
            ? null
            : current.canvasFocusReferenceId,
        activeStyleKit: removingStyleSource
          ? normalizeStyleKit({
              ...current.activeStyleKit,
              sourceReferenceId: current.activeStyleKit.sourceReferenceId === item.id
                ? null
                : current.activeStyleKit.sourceReferenceId,
              sourceReferenceIds: current.activeStyleKit.sourceReferenceIds.filter((id) => id !== item.id),
              updatedAt: now,
              confirmedAt: null,
            }, { now })
          : current.activeStyleKit,
        canvasGenerationReferenceIds: keepInBoard
          ? current.canvasGenerationReferenceIds
          : current.canvasGenerationReferenceIds.filter((id) => id !== item.id),
        referenceRegions: keepInBoard
          ? current.referenceRegions
          : current.referenceRegions.filter((r) => r.referenceId !== item.id),
        status: dependencyCount > 0 && !referenceHasAnyRole(nextUsageForItem)
          ? `Removed the ${role} role. "${item.title}" remains as a provenance source for ${dependencyCount} linked item(s).`
          : `Removed "${item.title}" from the ${role} pocket.`,
      };
      return role === "style"
        ? appendStudyEvent(next, {
            stage: "references",
            type: "style_kit_item_removed",
            targetIds: [item.id],
            result: "source",
            metadata: { itemKind: "source" },
          })
        : next;
    });
    if (role === "layout" || role === "style") onPocketAction?.(item, role, "remove");
  }

  function createReferenceRegion(rect: Omit<ReferenceRegion, "id" | "label">) {
    if (!regionReference) return;
    const nextRegion: ReferenceRegion = {
      ...rect,
      id: `reference-region-${Date.now()}`,
      label: null,
    };
    setState((current) => appendStudyEvent({
      ...current,
      board: current.board.some((item) => item.id === regionReference.id)
        ? current.board
        : [...current.board, regionReference],
      referenceUsage: current.referenceUsage[regionReference.id]
        ? current.referenceUsage
        : { ...current.referenceUsage, [regionReference.id]: {} },
      referenceRegions: [...current.referenceRegions, nextRegion],
      status: `Saved a ${rect.intent ?? "content"} region from "${regionReference.title}".`,
    }, {
      stage: "references",
      type: "reference_region_created",
      targetIds: [regionReference.id, nextRegion.id],
      result: rect.intent ?? "include",
    }));
  }

  function updateReferenceRegionLabel(regionId: string, label: string | null) {
    setState((current) => ({
      ...current,
      referenceRegions: current.referenceRegions.map((region) =>
        region.id === regionId ? { ...region, label } : region,
      ),
    }));
  }

  function removeReferenceRegion(regionId: string) {
    setState((current) => appendStudyEvent({
      ...current,
      referenceRegions: current.referenceRegions.filter((region) => region.id !== regionId),
    }, {
      stage: "references",
      type: "reference_region_removed",
      targetIds: [regionId],
      result: "removed",
    }));
  }

  function removeFromBoard(itemId: string) {
    setState((current) => {
      const nextBoard = current.board.filter((item) => item.id !== itemId);
      return {
        ...current,
        board: nextBoard,
        referenceUsage: Object.fromEntries(
          Object.entries(current.referenceUsage).filter(([id]) => id !== itemId),
        ),
        layoutReferenceId:
          current.layoutReferenceId === itemId
            ? null
            : current.layoutReferenceId,
        canvasGenerationReferenceIds: current.canvasGenerationReferenceIds.filter((id) => id !== itemId),
        referenceRegions: current.referenceRegions.filter((r) => r.referenceId !== itemId),
        canvasFocusReferenceId:
          current.canvasFocusReferenceId === itemId
            ? null
            : current.canvasFocusReferenceId,
        status: "Reference removed from pocket.",
      };
    });
  }

  function applyTestPrompt(nextPrompt: string) {
    setState((current) => commitWorkingPromptRevision({
      ...current,
      prompt: nextPrompt,
      generationBrief: nextPrompt,
      promptUpdatedAt: new Date().toISOString(),
      status: "Test prompt loaded.",
    }, "blur"));
  }

  const busy = loading !== null;

  function updateRetrievalColumnCount(value: string) {
    const nextColumnCount = Number(value);
    if (!isRetrievalColumnCount(nextColumnCount)) return;
    setRetrievalColumnCount(nextColumnCount);
    try {
      window.localStorage.setItem(RETRIEVAL_COLUMN_STORAGE_KEY, String(nextColumnCount));
    } catch {
      // The visual setting still works for the current session without storage.
    }
  }

  function renderRetrievalColumnControl() {
    return (
      <label className="retrieval-column-control">
        <span>Images per row</span>
        <select
          value={retrievalColumnCount}
          onChange={(event) => updateRetrievalColumnCount(event.target.value)}
          aria-label="Images per row"
        >
          {RETRIEVAL_COLUMN_OPTIONS.map((columnCount) => (
            <option key={columnCount} value={columnCount}>
              {columnCount}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (!studyProfile?.userId) {
    return (
      <div className="page study-entry-page">
        <div className="page-inner study-entry-inner">
          <section className="study-entry-panel">
            <header className="study-entry-head">
              <span className="label-text">User study setup required</span>
              <h1>Initialize participant first</h1>
              <p>Enter the participant ID and preference profile before collecting reference images.</p>
            </header>
            <footer className="study-entry-actions">
              <Link href="/" className="btn btn-primary">
                Start setup
              </Link>
            </footer>
          </section>
        </div>
      </div>
    );
  }

  function renderPreviewThumb(reference: ReferenceItem, lazy = true) {
    return (
      <button
        type="button"
        className="paper-card-thumb paper-card-thumb-button"
        onClick={() => setPreviewReference(reference)}
        aria-label={`Open larger preview for ${reference.title}`}
      >
        {reference.thumbnailUrl ? (
          <img src={reference.thumbnailUrl} alt="" loading={lazy ? "lazy" : undefined} />
        ) : (
          <span className="paper-card-thumb-fallback">
            {reference.thumbnail}
          </span>
        )}
      </button>
    );
  }

  function renderReferenceCard(reference: ReferenceItem, index: number, variant: "list" | "grid" = "list") {
    const usage = referenceUsage[reference.id] ?? {};
    return (
      <article
        key={reference.id}
        ref={(node) => {
          if (node) retrievalCardRefs.current.set(reference.id, node);
          else retrievalCardRefs.current.delete(reference.id);
        }}
        tabIndex={-1}
        data-retrieval-reference-id={reference.id}
        data-pocket-role={pocketFocusRequest?.referenceId === reference.id ? pocketFocusRequest.role : undefined}
        className={`${variant === "grid" ? "paper-card paper-card-grid" : "paper-card"} ${
          pocketFocusRequest?.referenceId === reference.id ? "is-pocket-focused" : ""
        }`}
      >
        <div className="paper-card-media">
          {renderPreviewThumb(reference)}
        </div>
        <div className="paper-card-body">
          <h3 className="paper-card-title">{reference.title}</h3>
          <div className="paper-card-foot">
            <div className="paper-card-actions">
              {(["layout", "style"] as const).map((role) => {
                const isAdded = hasReferenceRole(usage, role);
                const fullPocketLabel = isAdded
                  ? `Remove from ${REFERENCE_ROLE_LABELS[role]} pocket`
                  : `Add to ${REFERENCE_ROLE_LABELS[role]} pocket`;
                const pocketLabel = studyMode
                  ? isAdded
                    ? `Remove ${REFERENCE_ROLE_LABELS[role]}`
                    : REFERENCE_ROLE_LABELS[role]
                  : fullPocketLabel;
                return (
                  <button
                    key={role}
                    type="button"
                    data-guide-anchor={
                      index === 0
                        ? role === "style"
                          ? "reference-keep-style"
                          : "reference-keep-layout"
                        : undefined
                    }
                    className={`reference-action-btn reference-action-btn-${role} ${
                      isAdded ? "is-added" : ""
                    }`}
                    onClick={() => {
                      if (!isAdded) {
                        addToPocket(reference, role);
                        return;
                      }
                      if (studyMode) removeFromPocket(reference, role);
                      else requestRemoveFromPocket(reference, role);
                    }}
                    title={fullPocketLabel}
                    aria-label={fullPocketLabel}
                    aria-pressed={isAdded}
                  >
                    <CardActionIcon remove={isAdded} />
                    <span>{pocketLabel}</span>
                  </button>
                );
              })}
              {!studyMode ? (
                <>
                  <button
                    type="button"
                    className="reference-action-btn reference-action-btn-region"
                    onClick={() => setRegionReference(reference)}
                    title="Select a content or style region"
                  >
                    <span aria-hidden="true">⌗</span><span>Select region</span>
                  </button>
                  <div className="reference-more-roles">
                    <button
                      type="button"
                      className={`reference-action-btn reference-action-btn-more ${
                        EXTRA_REFERENCE_ROLES.some((role) => hasReferenceRole(usage, role)) ? "is-added" : ""
                      }`}
                      onClick={() =>
                        setRoleMenuReferenceId((current) => (current === reference.id ? null : reference.id))
                      }
                      title="More reference roles (icon, font, palette)"
                      aria-expanded={roleMenuReferenceId === reference.id}
                    >
                      <span>⋯</span>
                    </button>
                    {roleMenuReferenceId === reference.id ? (
                      <>
                      <button
                        type="button"
                        className="reference-more-roles-backdrop"
                        aria-label="Close role menu"
                        onClick={() => setRoleMenuReferenceId(null)}
                      />
                      <div className="reference-more-roles-menu" role="menu">
                        {EXTRA_REFERENCE_ROLES.map((role) => {
                          const isAdded = hasReferenceRole(usage, role);
                          return (
                            <button
                              key={role}
                              type="button"
                              role="menuitemcheckbox"
                              aria-checked={isAdded}
                              className={isAdded ? "is-added" : ""}
                              onClick={() => {
                                if (isAdded) {
                                  requestRemoveFromPocket(reference, role);
                                } else {
                                  addToPocket(reference, role);
                                }
                              }}
                            >
                              <span className="reference-role-check">{isAdded ? "✓" : ""}</span>
                              {REFERENCE_ROLE_LABELS[role]}
                            </button>
                          );
                        })}
                      </div>
                      </>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </article>
    );
  }

  function renderReferenceMasonry(
    items: ReferenceItem[],
    variant: "list" | "grid" = "list",
  ) {
    return partitionStableMasonry(items, retrievalColumnCount).map((column, columnIndex) => (
      <div className="results-masonry-column" key={`column-${columnIndex}`}>
        {column.map(({ item, index }) => renderReferenceCard(item, index, variant))}
      </div>
    ));
  }

  const portalTarget = typeof document === "undefined" ? null : document.body;

  return (
    <div className="page workspace-page">
      <div className="page-inner">
        <div
          ref={promptSectionRef}
          tabIndex={-1}
          className={`workspace-prompt-panel ${studyMode ? "is-study-mode" : ""}`}
        >
          <form
            className="workspace-prompt-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSearch(0, activeSearchGoal ?? "idea");
            }}
          >
            <div className={disclosureStyles.promptPrimary}>
              <label
                className="label"
                data-guide-anchor={studyMode ? "working-prompt" : "figure-description"}
              >
                <span className="label-text">{studyMode ? "Idea of Your Research" : "Describe the figure"}</span>
                <textarea
                  className="textarea workspace-prompt-textarea"
                  autoComplete="off"
                  placeholder="e.g. four-stage AI architecture: tokenized inputs -> transformer encoder -> contrastive objective -> downstream task heads; restrained palette; clear arrows and publication-ready labels"
                  value={prompt}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      prompt: event.target.value,
                      generationBrief: event.target.value,
                      promptUpdatedAt: new Date().toISOString(),
                    }))
                  }
                  onBlur={() => setState((current) => commitWorkingPromptRevision(current, "blur"))}
                />
              </label>
              <fieldset className="retrieval-goal-picker">
                <legend className="label-text">Search references</legend>
                <div className="retrieval-goal-buttons" role="group" aria-label="Search references by goal">
                  {SEARCH_GOAL_OPTIONS.map((option, optionIndex) => {
                    const isActive = activeSearchGoal === option.value;
                    const isMuted = activeSearchGoal !== null && !isActive;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        data-guide-anchor={optionIndex === 0 ? "reference-search-submit" : undefined}
                        className={`retrieval-goal-button ${isActive ? "is-active" : ""} ${isMuted ? "is-muted" : ""}`}
                        aria-pressed={isActive}
                        title={option.description}
                        disabled={busy || searchPrompt.trim().length === 0}
                        onClick={() => void handleSearch(0, option.value)}
                      >
                        <strong>
                          {loading === "search" && isActive
                            ? <span className="ui-spinner" aria-hidden="true" />
                            : <SearchGoalIcon goal={option.value} />}
                          <span>{option.label}</span>
                        </strong>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>

            {staleArtifactCount > 0 ? (
              <div className="stage-soft-warning" role="status">
                Earlier {[
                  skeletonIsStale ? "skeleton" : null,
                  candidateIsStale ? "candidate" : null,
                ].filter(Boolean).join(" and ")} remain available but reflect an earlier task brief.
              </div>
            ) : null}
          </form>
          {!studyMode ? <div className="workspace-prompt-presets" aria-label="Test prompts">
            <span className="label-text">Test prompts</span>
            <div className="workspace-prompt-preset-list">
              {testPromptPresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => applyTestPrompt(preset.prompt)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div> : null}
        </div>

        <div
          ref={retrievalSectionRef}
          tabIndex={-1}
          className={`workbench-grid ${studyMode ? disclosureStyles.studyRetrievalGrid : ""}`}
        >
          <section className="flex-col" style={{ minHeight: 0 }}>
            <div className="results-header">
              <h2 className="h-section">
                Candidate references
                <span className="badge">{candidateReferences.length} loaded</span>
                {board.length > 0 ? <span className="badge">{board.length} pinned</span> : null}
              </h2>
              <div className="reference-pagination" aria-label="Candidate reference controls">
                {renderRetrievalColumnControl()}
                <span className="mono muted">
                  {searchHasMore
                    ? "Scroll for more"
                    : candidateReferences.length > 0 && !searchMatchesPrompt
                      ? "Search again to refresh"
                      : candidateReferences.length > 0 ? "All results loaded" : "Ready to search"}
                </span>
              </div>
            </div>

            <div className="results-list results-masonry scroll-y" data-columns={retrievalColumnCount}>
              {candidateReferences.length === 0 ? (
                <div className="results-list-empty">
                  <p>
                    Your reference shelf is empty. {studyMode ? "Search from the fixed task" : "Describe the figure you want"} and
                    press <strong>Search references</strong> to pull comparable papers.
                  </p>
                </div>
              ) : (
                renderReferenceMasonry(candidateReferences)
              )}
            </div>
            <div ref={loadMoreSentinelRef} className="retrieval-load-sentinel" aria-live="polite">
              {loading === "search" && searchOffset > 0 ? (
                <><span className="ui-spinner" aria-hidden="true" /> Loading more references…</>
              ) : searchHasMore ? (
                "More references load automatically as you scroll."
              ) : candidateReferences.length > 0 && !searchMatchesPrompt ? (
                "The prompt changed. Search again to refresh these references."
              ) : candidateReferences.length > 0 ? (
                "All available references are loaded."
              ) : null}
            </div>
            {studyMode && onEnterCanvas ? (
              <footer className={disclosureStyles.studyRetrievalFooter}>
                <div>
                  <strong>{board.length} reference{board.length === 1 ? "" : "s"} saved</strong>
                  <span>{layoutPocketCount ? "Layout ready" : "You can start with a blank Skeleton"} · Style can be selected later</span>
                </div>
              </footer>
            ) : null}
          </section>

          {!studyMode ? <aside className="workbench-pocket">
            <div className="pocket-rail">
              <div className="pocket-head">
                <button type="button" className="pocket-collapse-toggle" onClick={() => setPocketExpanded((current) => !current)}>
                  <h2 className="h-section">
                    Pocket
                    <span className="badge" style={{ marginLeft: 8 }}>
                      {board.length}
                    </span>
                  </h2>
                </button>
                <span className="mono muted">role-based references</span>
              </div>
              {pocketExpanded ? (
              <>
              <div className="pocket-list scroll-y">
                {board.length === 0 ? (
                  <p className="pocket-empty">
                    No content references chosen yet. Add figures with layout, style, icon, font, or palette roles.
                  </p>
                ) : (
                  pocketByRole.map(({ role, items }) =>
                    items.length === 0 ? null : (
                      <section key={role} className="pocket-role-group">
                        <header className="pocket-role-head">
                          <strong>{REFERENCE_ROLE_LABELS[role]}</strong>
                          <span className="badge">{items.length}</span>
                        </header>
                        {items.map((item, index) => (
                          <div key={`${role}-${item.id}`} className="pocket-card">
                            <button
                              type="button"
                              className="pocket-card-thumb"
                              onClick={() => setPreviewReference(item)}
                              aria-label={`Open larger preview for ${item.title}`}
                            >
                              {item.thumbnailUrl ? (
                                <img src={item.thumbnailUrl} alt="" />
                              ) : (
                                <span className="paper-card-thumb-fallback">{item.thumbnail}</span>
                              )}
                            </button>
                            <div className="min-w-0">
                              <div className="pocket-card-title">
                                <span className="mono muted" style={{ marginRight: 6 }}>
                                  {String(index + 1).padStart(2, "0")}
                                </span>
                                {item.title}
                              </div>
                              <div className="pocket-card-cite">{shortCite(item)}</div>
                            </div>
                            <button
                              type="button"
                              className="pocket-card-remove"
                              onClick={() => requestRemoveFromPocket(item, role)}
                              aria-label={`Remove ${item.title} from ${role} pocket`}
                              title={`Remove from ${role} pocket`}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </section>
                    ),
                  )
                )}
              </div>
              <div className="pocket-provenance">
                <button type="button" className="pocket-collapse-toggle" onClick={() => setProvenanceExpanded((current) => !current)}>
                  <span className="label-text">Reference provenance {provenanceExpanded ? "▾" : "▸"}</span>
                </button>
                {provenanceExpanded ? (
                  <div className="pocket-provenance-body">
                    {board.map((item) => (
                      <div key={item.id} className="pocket-provenance-entry">
                        <strong>{item.title}</strong>
                        <span className="mono muted">{shortCite(item)}</span>
                        <span>
                          Roles: {REFERENCE_ROLES.filter((role) => hasReferenceRole(referenceUsage[item.id], role)).join(", ") || "source only"}
                          {state.layoutReferenceId === item.id ? " · primary layout" : ""}
                          {state.canvasFocusReferenceId === item.id ? " · primary style" : ""}
                        </span>
                        {state.referenceRegions.filter((region) => region.referenceId === item.id).map((region, index) => (
                          <span key={region.id} className="mono muted">
                            Region {index + 1}: {region.intent ?? "content"}{region.label ? ` · ${region.label}` : ""}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="pocket-foot">
                <div className="study-pocket-status">
                  <span>{board.length} selected</span>
                  <strong>
                    {canEnterCanvas
                      ? "Ready for skeleton"
                      : board.length === 0
                        ? "Freeform is available; references are optional"
                        : "Tip: adding both Layout and Style can improve control"}
                  </strong>
                  <div className="study-reference-meta is-compact" aria-label="Pocket role counts">
                    {REFERENCE_ROLES.map((role) => {
                      const count = countReferencesWithRole(board, referenceUsage, role);
                      if (count === 0 && role !== "layout" && role !== "style") return null;
                      return (
                        <span key={role} className={count > 0 ? "is-filled" : ""}>
                          {REFERENCE_ROLE_LABELS[role]} {count}
                        </span>
                      );
                    })}
                  </div>
                </div>
                {onEnterCanvas ? (
                  <button
                    type="button"
                    className="btn btn-primary flex-1"
                    onClick={() => {
                      setState((current) => ({
                        ...current,
                        status: "Canvas ready.",
                      }));
                      onEnterCanvas();
                    }}
                    style={{ justifyContent: "center" }}
                  >
                    {stylePocketCount > 0 ? "Continue to Style →" : "Continue without style →"}
                  </button>
                ) : (
                  <Link
                    href="/"
                    className="btn btn-primary flex-1"
                    style={{ justifyContent: "center" }}
                  >
                    {stylePocketCount > 0 ? "Continue to Style →" : "Continue without style →"}
                  </Link>
                )}
              </div>
              </>
              ) : (
                <div className="pocket-collapsed-summary">
                  <div className="pocket-collapsed-thumbs" aria-label={`${board.length} selected references`}>
                    {board.slice(0, 4).map((item) => (
                      <button key={item.id} type="button" onClick={() => setPreviewReference(item)} title={item.title}>
                        {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" /> : <span>{item.thumbnail}</span>}
                      </button>
                    ))}
                    {board.length > 4 ? <span>+{board.length - 4}</span> : null}
                    {board.length === 0 ? <em>No references — Freeform remains available.</em> : null}
                  </div>
                  {onEnterCanvas ? (
                    <button type="button" className="btn btn-primary" onClick={onEnterCanvas}>
                      {stylePocketCount > 0 ? "Continue to Style →" : "Continue without style →"}
                    </button>
                  ) : (
                    <Link href="/" className="btn btn-primary">
                      {stylePocketCount > 0 ? "Continue to Style →" : "Continue without style →"}
                    </Link>
                  )}
                </div>
              )}
            </div>
          </aside> : null}
        </div>
      </div>
      {portalTarget && regionReference ? createPortal((
        <div
          className="image-preview-overlay reference-region-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Select regions from ${regionReference.title}`}
          onClick={() => setRegionReference(null)}
        >
          <div className="reference-region-panel" onClick={(event) => event.stopPropagation()}>
            <header className="reference-region-panel-head">
              <div>
                <span className="label-text">Partial reference</span>
                <h2>{regionReference.title}</h2>
                <p>Select only the content or visual language you intend to reuse.</p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRegionReference(null)}>Done</button>
            </header>
            <ImageRegionMarquee
              imageUrl={regionReference.imageDataUrl ?? regionReference.thumbnailUrl ?? null}
              referenceId={regionReference.id}
              regions={state.referenceRegions}
              allowedIntents={["include", "style"]}
              onCreate={createReferenceRegion}
              onRemove={removeReferenceRegion}
              onUpdateLabel={updateReferenceRegionLabel}
            />
          </div>
        </div>
      ), portalTarget) : null}
      {portalTarget && pendingRemoval ? createPortal((
        <div
          className="image-preview-overlay reference-removal-overlay"
          role="alertdialog"
          aria-modal="true"
          aria-label="Reference dependency warning"
          onClick={() => setPendingRemoval(null)}
        >
          <div className="reference-removal-dialog" onClick={(event) => event.stopPropagation()}>
            <span className="label-text">Source is already in use</span>
            <h2>Remove the {pendingRemoval.role} role?</h2>
            <p>
              “{pendingRemoval.item.title}” is linked to {pendingRemoval.dependencyCount} saved region, skeleton,
              or canvas item. Its source record will remain in provenance so those links do not break.
            </p>
            <div className="reference-removal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setPendingRemoval(null)}>Keep role</button>
              <button type="button" className="btn btn-primary" onClick={() => {
                removeFromPocket(pendingRemoval.item, pendingRemoval.role);
                setPendingRemoval(null);
              }}>Remove role, keep source</button>
            </div>
          </div>
        </div>
      ), portalTarget) : null}
      {portalTarget && previewReference ? createPortal((
        <div
          className="image-preview-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Larger preview for ${previewReference.title}`}
          onClick={() => setPreviewReference(null)}
        >
          <div className="image-preview-panel" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="image-preview-close"
              onClick={() => setPreviewReference(null)}
              aria-label="Close larger preview"
            >
              ×
            </button>
            <div className="image-preview-stage">
              {previewReference.imageDataUrl || previewReference.thumbnailUrl ? (
                <img src={previewReference.imageDataUrl ?? previewReference.thumbnailUrl ?? ""} alt="" />
              ) : (
                <span className="paper-card-thumb-fallback">{previewReference.thumbnail}</span>
              )}
            </div>
            <div className="image-preview-caption">
              <h2>{previewReference.title}</h2>
              <span>{shortCite(previewReference)}</span>
            </div>
          </div>
        </div>
      ), portalTarget) : null}
    </div>
  );
}
