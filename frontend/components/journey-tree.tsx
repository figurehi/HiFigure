"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { isDiagramGroupNode } from "../lib/diagram-xml";
import { svgPreviewDataUrl } from "../lib/evolve-artifact";
import { historyMatchIngredients } from "../lib/history-match";
import { LayoutPngPreview } from "./layout-png-preview";
import { resolveWorkspaceIcon, workspaceIconDataUrl } from "../lib/workspace-icon-assets";
import {
  useWorkspaceState,
  type IdeaHistoryNode,
  type IdeaHistoryNodeKind,
  type IdeaSnapshot,
} from "../lib/workspace-state";
import type { CustomIconReference, DiagramPlan, FigureVariant, ReferenceItem } from "../lib/types";
import styles from "./journey-tree.module.css";

const KIND_LABEL: Record<IdeaHistoryNodeKind, string> = {
  root: "Task",
  checkpoint: "Saved idea",
  skeleton: "Skeleton",
  candidate: "Candidate",
  edit: "Edit",
};

type TracePhase = "envision" | "externalize" | "evolve";
type DetailRow = { label: string; value: ReactNode | string | null };
type DetailSection = { title: string; phase: TracePhase; rows: DetailRow[] };

function formatRoles(usage: { layout?: boolean; style?: boolean; icon?: boolean; font?: boolean; palette?: boolean; flow?: boolean; grouping?: boolean; typography?: boolean } | undefined): string {
  if (!usage) return "referenced";
  const roles = [
    usage.layout ? "Layout" : null,
    usage.style ? "Style" : null,
    usage.icon ? "Icon" : null,
    usage.font || usage.typography ? "Font" : null,
    usage.palette ? "Palette" : null,
    usage.flow ? "Flow" : null,
    usage.grouping ? "Grouping" : null,
  ].filter(Boolean);
  return roles.length ? roles.join(" · ") : "referenced";
}

function nodeLabelForBinding(
  snapshot: IdeaSnapshot,
  nodeId: string,
): string {
  const plan = snapshot.selectedSkeleton?.diagramPlan;
  const node = plan?.nodes.find((entry) => entry.id === nodeId || entry.semanticId === nodeId);
  return node?.label || nodeId;
}

function snapshotSections(
  snapshot: IdeaSnapshot | null,
  variant: FigureVariant | null,
  referenceTitles: Map<string, string>,
): DetailSection[] {
  if (!snapshot) return [];
  const kit = snapshot.activeStyleKit;
  const skeletonPlan = snapshot.selectedSkeleton?.diagramPlan ?? null;
  const leafNodes = skeletonPlan?.nodes.filter((node) => !isDiagramGroupNode(node)) ?? [];
  const iconBindings = Object.entries(snapshot.nodeIconBindings ?? {});
  const matchIngredients = historyMatchIngredients(snapshot);

  const sections: DetailSection[] = [
    {
      title: "Prompt",
      phase: "envision",
      rows: [
        { label: "Working prompt", value: snapshot.prompt.trim() || null },
        { label: "Revision", value: snapshot.promptRevisionId ?? "Unversioned" },
        { label: "Updated", value: snapshot.promptUpdatedAt ? new Date(snapshot.promptUpdatedAt).toLocaleString() : null },
        ...(snapshot.promptDraft.trim() && snapshot.promptDraft.trim() !== snapshot.prompt.trim()
          ? [{ label: "Draft (unsaved)", value: snapshot.promptDraft.trim() }]
          : []),
      ],
    },
    {
      title: "Retrieval",
      phase: "envision",
      rows: Object.keys(snapshot.referenceUsage ?? {}).length
        ? Object.entries(snapshot.referenceUsage).map(([referenceId, usage]) => ({
            label: referenceTitles.get(referenceId) ?? referenceId,
            value: formatRoles(usage),
          }))
        : [{ label: "References", value: null }],
    },
    {
      title: "Layout",
      phase: "externalize",
      rows: [
        {
          label: "Layout reference",
          value: snapshot.layoutReferenceId
            ? referenceTitles.get(snapshot.layoutReferenceId) ?? snapshot.layoutReferenceId
            : null,
        },
      ],
    },
    {
      title: "Skeleton",
      phase: "externalize",
      rows: [
        { label: "Title", value: snapshot.selectedSkeleton?.title ?? null },
        {
          label: "Structure",
          value: skeletonPlan
            ? `${skeletonPlan.nodes.length} nodes · ${skeletonPlan.edges.length} relations`
            : null,
        },
        {
          label: "Confirmed",
          value: snapshot.skeletonConfirmedAt
            ? new Date(snapshot.skeletonConfirmedAt).toLocaleString()
            : null,
        },
        { label: "Prompt revision", value: snapshot.diagramSkeletonPromptRevisionId ?? null },
        { label: "Prompt fingerprint", value: snapshot.diagramSkeletonPromptFingerprint ?? null },
        ...(leafNodes.length
          ? [{
              label: "Modules",
              value: (
                <ul className={styles.detailList}>
                  {leafNodes.map((node) => (
                    <li key={node.id}>{node.label || node.id}</li>
                  ))}
                </ul>
              ),
            }]
          : []),
      ],
    },
    {
      title: "Style",
      phase: "externalize",
      rows: [
        {
          label: "Primary style",
          value: snapshot.styleReferenceId
            ? referenceTitles.get(snapshot.styleReferenceId) ?? snapshot.styleReferenceId
            : null,
        },
        {
          label: "Style kit icons",
          value: kit?.iconIds?.length ? kit.iconIds.join(", ") : null,
        },
      ],
    },
    {
      title: "Match",
      phase: "externalize",
      rows: [
        ...(iconBindings.length
          ? iconBindings.map(([nodeId, iconId]) => ({
              label: nodeLabelForBinding(snapshot, nodeId),
              value: `Icon · ${iconId}`,
            }))
          : [{ label: "Icons", value: null }]),
        {
          label: "Font",
          value: matchIngredients.font?.label ?? null,
        },
        {
          label: "Colors",
          value: matchIngredients.palette?.label ?? null,
        },
      ],
    },
    {
      title: "Figure",
      phase: "evolve",
      rows: [
        { label: "Title", value: variant?.title ?? null },
        { label: "Variant id", value: snapshot.selectedVariantId ?? variant?.id ?? null },
        { label: "Description", value: variant?.description?.trim() || null },
      ],
    },
  ];

  return sections;
}

/**
 * A version is read as the decision that produced it: one storyboard frame
 * carrying the artefact this step produced plus a line naming the choice, so a
 * lineage reads as a sequence of moves instead of the same chain repeated.
 */
type AspectKey = "prompt" | "layout" | "style" | "skeleton" | "icons" | "font" | "palette" | "figure";

const ASPECT_LABEL: Record<AspectKey, string> = {
  prompt: "Prompt",
  layout: "Layout ref",
  style: "Style ref",
  skeleton: "Skeleton",
  icons: "Icons",
  font: "Font",
  palette: "Colors",
  figure: "Figure",
};

/**
 * One comparable string per ingredient. Anything the author can change has to
 * move the signature, otherwise the step would look like a no-op on the tree.
 */
function aspectSignatures(
  snapshot: IdeaSnapshot | null,
  variantId: string | null,
): Record<AspectKey, string | null> {
  if (!snapshot) {
    return {
      prompt: null,
      layout: null,
      style: null,
      skeleton: null,
      icons: null,
      font: null,
      palette: null,
      figure: null,
    };
  }
  const kit = snapshot.activeStyleKit;
  const plan = snapshot.selectedSkeleton?.diagramPlan ?? snapshot.skeletonCheckpointPlan ?? null;
  const matchIngredients = historyMatchIngredients(snapshot);
  const iconEntries = Object.entries(snapshot.nodeIconBindings ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([nodeId, iconId]) => `${nodeId}=${iconId}`);
  return {
    prompt: snapshot.prompt.trim() || null,
    layout: snapshot.layoutReferenceId,
    style: snapshot.styleReferenceId,
    skeleton: plan
      ? `${snapshot.selectedSkeleton?.id ?? ""}|${plan.nodes
          .map((node) => `${node.id}:${node.label}:${Math.round(node.x)}:${Math.round(node.y)}`)
          .join(",")}|${plan.edges.map((edge) => `${edge.from}>${edge.to}`).join(",")}`
      : null,
    icons: [...(kit?.iconIds ?? [])].sort().join(",") + "#" + iconEntries.join(",") || null,
    font: matchIngredients.font?.id ?? null,
    palette: matchIngredients.palette?.key ?? null,
    figure: variantId,
  };
}

type AspectChange = { key: AspectKey; kind: "added" | "changed" };

function diffAspects(
  current: Record<AspectKey, string | null>,
  parent: Record<AspectKey, string | null>,
): Map<AspectKey, AspectChange["kind"]> {
  const changes = new Map<AspectKey, AspectChange["kind"]>();
  for (const key of Object.keys(current) as AspectKey[]) {
    const next = current[key];
    const previous = parent[key];
    if (!next || next === previous) continue;
    changes.set(key, previous ? "changed" : "added");
  }
  return changes;
}

/**
 * The same renderer Layout draws with, so a run's skeleton in History is the
 * artefact itself — labels, roles, routing — not a stand-in sketch of it.
 */
function SkeletonThumb({ plan }: { plan: DiagramPlan }) {
  return (
    <span className={styles.planPreview}>
      <LayoutPngPreview plan={plan} compact />
    </span>
  );
}

/**
 * One picture in the pipeline: the artefact, what it is called, and whether an
 * earlier run already stood on it.
 */
type FlowCard = {
  key: string;
  caption: string;
  note: string | null;
  body: ReactNode;
  reused: boolean;
};

type FlowStage = { id: string; label: string; cards: FlowCard[] };
type FlowTrack = { id: string; stages: FlowStage[] };

/**
 * One generation and everything that fed it: the prompt it ran on, the three
 * ingredient tracks, the figure it produced, and the edits drawn on that
 * figure afterwards.
 */
type RunBatch = {
  id: string;
  base: IdeaHistoryNode | null;
  edits: IdeaHistoryNode[];
  prompt: FlowCard | null;
  tracks: FlowTrack[];
};

function referenceCard(
  caption: string,
  referenceId: string,
  references: Map<string, { title: string; image: string | null }>,
): Omit<FlowCard, "reused"> {
  const reference = references.get(referenceId);
  return {
    key: referenceId,
    caption,
    note: reference?.title ?? null,
    body: reference?.image
      ? <img src={reference.image} alt="" />
      : <span className={styles.tileText}>{reference?.title ?? referenceId}</span>,
  };
}

/** Every ingredient one snapshot stood on, keyed so reuse is detectable. */
function snapshotCards(
  snapshot: IdeaSnapshot,
  references: Map<string, { title: string; image: string | null }>,
  customIcons: CustomIconReference[],
): {
  prompt: Omit<FlowCard, "reused"> | null;
  layout: Omit<FlowCard, "reused"> | null;
  skeleton: Omit<FlowCard, "reused"> | null;
  style: Omit<FlowCard, "reused"> | null;
  match: Omit<FlowCard, "reused">[];
} {
  const prompt = snapshot.prompt.trim();
  const plan = snapshot.selectedSkeleton?.diagramPlan ?? snapshot.skeletonCheckpointPlan ?? null;
  const skeletonKey = snapshot.selectedSkeleton?.id
    ?? (plan ? `plan-${plan.nodes.map((entry) => entry.id).join(",")}` : null);
  const ingredients = historyMatchIngredients(snapshot);
  const { iconIds, boundIconCount, font, palette } = ingredients;

  const match: Omit<FlowCard, "reused">[] = [];
  if (iconIds.length) {
    match.push({
      key: `icons:${[...iconIds].sort().join(",")}`,
      caption: "Icons",
      note: boundIconCount ? `${boundIconCount} bound` : `${iconIds.length} picked`,
      body: (
        <span className={styles.tileIcons}>
          {iconIds.slice(0, 4).map((iconId) => {
            const icon = resolveWorkspaceIcon(iconId, customIcons);
            return (
              <img
                key={iconId}
                src={icon?.dataUrl ?? workspaceIconDataUrl(iconId, customIcons)}
                alt=""
                title={icon?.label ?? iconId}
              />
            );
          })}
        </span>
      ),
    });
  }
  if (palette) {
    match.push({
      key: `palette:${palette.key}`,
      caption: "Colors",
      note: palette.label,
      body: palette.colors.length ? (
        <span
          className={styles.tileSwatches}
          style={{ gridTemplateColumns: `repeat(${Math.min(3, palette.colors.length)}, 1fr)` }}
        >
          {palette.colors.slice(0, 9).map((color, index) => (
            <i key={`${color}-${index}`} style={{ backgroundColor: color }} />
          ))}
        </span>
      ) : <span className={styles.tileText}>{palette.label}</span>,
    });
  }
  if (font) {
    match.push({
      key: `font:${font.id}`,
      caption: "Font",
      note: font.label,
      body: <span className={styles.tileFont} style={{ fontFamily: font.cssFamily }}>Aa</span>,
    });
  }
  return {
    prompt: prompt
      ? { key: `prompt:${prompt}`, caption: "Prompt", note: null, body: <span className={styles.flowPrompt}>{prompt}</span> }
      : null,
    layout: snapshot.layoutReferenceId
      ? referenceCard("Layout ref", snapshot.layoutReferenceId, references)
      : null,
    skeleton: plan && skeletonKey
      ? {
          key: `skeleton:${skeletonKey}`,
          caption: "Skeleton",
          note: snapshot.selectedSkeleton?.title ?? `${plan.nodes.length} nodes`,
          body: <SkeletonThumb plan={plan} />,
        }
      : null,
    style: snapshot.styleReferenceId
      ? referenceCard("Style ref", snapshot.styleReferenceId, references)
      : null,
    match,
  };
}

/**
 * Read the lineage one generation at a time. Each run keeps its own prompt,
 * structure, style, and match lines gathering into the figure it produced, and
 * ingredients an earlier run already used are marked as carried over rather
 * than merged away, so the batches stay comparable side by side.
 */
function buildRunBatches(
  orderedNodes: IdeaHistoryNode[],
  snapshots: Record<string, IdeaSnapshot>,
  references: Map<string, { title: string; image: string | null }>,
  customIcons: CustomIconReference[],
): RunBatch[] {
  const columns: { base: IdeaHistoryNode; edits: IdeaHistoryNode[] }[] = [];
  const columnByVariant = new Map<string, number>();
  for (const node of orderedNodes) {
    if (node.kind !== "candidate" && node.kind !== "edit") continue;
    const parentColumn = node.kind === "edit" && node.sourceVariantId
      ? columnByVariant.get(node.sourceVariantId)
      : undefined;
    if (parentColumn === undefined) {
      columnByVariant.set(node.variantId ?? node.id, columns.length);
      columns.push({ base: node, edits: [] });
      continue;
    }
    columns[parentColumn]!.edits.push(node);
    if (node.variantId) columnByVariant.set(node.variantId, parentColumn);
  }

  // A run that has not been generated yet still has inputs worth showing, so
  // the newest snapshot becomes a trailing batch with no figure on its right.
  const sources: { id: string; base: IdeaHistoryNode | null; edits: IdeaHistoryNode[]; snapshot: IdeaSnapshot | null }[] =
    columns.map((column) => ({
      id: column.base.id,
      base: column.base,
      edits: column.edits,
      snapshot: snapshots[column.base.snapshotId] ?? null,
    }));
  if (!sources.length) {
    const latest = [...orderedNodes].reverse().find((node) => snapshots[node.snapshotId]) ?? null;
    sources.push({
      id: latest?.id ?? "pending",
      base: null,
      edits: [],
      snapshot: latest ? snapshots[latest.snapshotId] ?? null : null,
    });
  }

  const seen = new Set<string>();
  return sources.map((source) => {
    if (!source.snapshot) {
      return { id: source.id, base: source.base, edits: source.edits, prompt: null, tracks: [] };
    }
    const cards = snapshotCards(source.snapshot, references, customIcons);
    // Marking happens after the whole batch is read, so two tracks in the same
    // run never mark each other as a repeat.
    const batchKeys: string[] = [];
    const mark = (card: Omit<FlowCard, "reused"> | null): FlowCard | null => {
      if (!card) return null;
      batchKeys.push(card.key);
      return { ...card, reused: seen.has(card.key) };
    };
    const prompt = mark(cards.prompt);
    const layout = mark(cards.layout);
    const skeleton = mark(cards.skeleton);
    const style = mark(cards.style);
    const match = cards.match.map((card) => mark(card)!).filter(Boolean);
    for (const key of batchKeys) seen.add(key);

    return {
      id: source.id,
      base: source.base,
      edits: source.edits,
      prompt,
      tracks: [
        {
          id: "structure",
          stages: [
            { id: "layout", label: "Layout", cards: layout ? [layout] : [] },
            { id: "skeleton", label: "Skeleton", cards: skeleton ? [skeleton] : [] },
          ],
        },
        {
          id: "style",
          stages: [{ id: "style", label: "Style", cards: style ? [style] : [] }],
        },
        {
          id: "match",
          stages: [{ id: "match", label: "Match", cards: match }],
        },
      ],
    };
  });
}

function variantPreview(variant: FigureVariant | null | undefined): string | null {
  if (!variant) return null;
  return variant.previewImageDataUrl ?? variant.previewImageUrl ?? svgPreviewDataUrl(variant.svg);
}

function formatClock(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

type JourneyTreeProps = {
  /** Restores the workspace to the clicked version; hosted by the dashboard. */
  onRestore?: (nodeId: string) => void;
};

export function JourneyTree({ onRestore }: JourneyTreeProps) {
  const { state } = useWorkspaceState();
  const { nodes, snapshots, activeNodeId, activeRootId } = state.ideaHistory;
  const readOnly = state.studySessionStatus === "finished";
  const [expandedNodeIds, setExpandedNodeIds] = useState<ReadonlySet<string>>(() => new Set());
  /** Thumbnails stay small enough to compare; this is how you actually read one. */
  const [zoom, setZoom] = useState<{ caption: string; note: string | null; body: ReactNode } | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoom(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);
  const referenceIndex = useMemo(() => {
    const map = new Map<string, { title: string; image: string | null }>();
    for (const item of [...state.references, ...state.board] as ReferenceItem[]) {
      map.set(item.id, {
        title: item.title,
        image: item.thumbnailUrl?.trim() || item.imageDataUrl?.trim() || null,
      });
    }
    return map;
  }, [state.board, state.references]);
  const referenceTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const [id, entry] of referenceIndex) map.set(id, entry.title);
    return map;
  }, [referenceIndex]);

  const roots = useMemo(
    () =>
      nodes
        .filter((node) => node.kind === "root")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [nodes],
  );
  const rootId =
    (activeRootId && roots.some((root) => root.id === activeRootId) ? activeRootId : null) ??
    roots.at(-1)?.id ??
    null;

  const rootNodes = useMemo(
    () => nodes
      .filter((node) => node.rootId === rootId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [nodes, rootId],
  );
  const rootNode = rootNodes.find((node) => node.kind === "root") ?? null;
  const batches = useMemo(
    () => buildRunBatches(rootNodes, snapshots, referenceIndex, state.customIconReferences),
    [referenceIndex, rootNodes, snapshots, state.customIconReferences],
  );
  const generatedCount = batches.filter((batch) => batch.base).length;

  function toggleExpanded(nodeId: string) {
    setExpandedNodeIds((current) => {
      const next = new Set(current);
      if (!next.delete(nodeId)) next.add(nodeId);
      return next;
    });
  }

  if (!rootNode) {
    return (
      <div className={styles.empty}>
        <strong>No history yet</strong>
        <p>Generate a Skeleton or Candidate first — every version lands here automatically.</p>
      </div>
    );
  }

  function openCardZoom(card: FlowCard) {
    setZoom({ caption: card.caption, note: card.note, body: card.body });
  }

  function renderFlowCard(card: FlowCard) {
    return (
      <li key={card.key} className={`${styles.flowCard} ${card.reused ? styles.flowCardReused : ""}`}>
        <div
          role="button"
          tabIndex={0}
          className={styles.tile}
          onClick={() => openCardZoom(card)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openCardZoom(card);
            }
          }}
          title={`Enlarge ${card.caption}`}
        >
          {card.body}
        </div>
        <span className={styles.tileCaption}>
          {card.caption}
          {card.reused ? <b className={styles.reusedTag} title="An earlier run already used this">kept</b> : null}
        </span>
        {card.note ? <span className={styles.tileNote} title={card.note}>{card.note}</span> : null}
      </li>
    );
  }

  function renderStage(stage: FlowStage) {
    return (
      <div key={stage.id} className={styles.stage}>
        <span className={styles.stageLabel}>{stage.label}</span>
        {stage.cards.length ? (
          <ul className={styles.stageCards}>{stage.cards.map(renderFlowCard)}</ul>
        ) : (
          <p className={styles.stageEmpty}>Not chosen</p>
        )}
      </div>
    );
  }

  function renderFigureNode(node: IdeaHistoryNode, kindClass: string) {
    const variant = node.variantId
      ? state.variants.find((item) => item.id === node.variantId) ?? null
      : null;
    const snapshot = snapshots[node.snapshotId] ?? null;
    const isDeleted = Boolean(node.deletedAt || variant?.deletedAt);
    const isActive = !isDeleted && activeNodeId === node.id;
    const preview = variantPreview(variant);

    // Siblings in this row share every upstream ingredient, so a figure is
    // told apart by what its own run moved relative to the run before it.
    const parent = node.parentId ? rootNodes.find((item) => item.id === node.parentId) ?? null : null;
    const parentSnapshot = parent ? snapshots[parent.snapshotId] ?? null : null;
    const changes = parentSnapshot
      ? diffAspects(
          aspectSignatures(snapshot, node.variantId),
          aspectSignatures(parentSnapshot, parent?.variantId ?? null),
        )
      : null;
    const lead = !parentSnapshot
      ? "First run"
      : changes && changes.size
        ? [...changes]
            .map(([key, kind]) => `${kind === "added" ? "Added" : "Changed"} ${ASPECT_LABEL[key]}`)
            .join(" · ")
        : "Same inputs";

    const restoreTitle = isDeleted
      ? "Deleted edits are kept in History and cannot be restored"
      : readOnly
      ? "Reopen the study before restoring"
      : isActive
        ? "This version is already active"
        : "Restore the workspace to this version";
    const restore = () => {
      if (!onRestore || readOnly || isActive || isDeleted) return;
      onRestore(node.id);
    };

    return (
      <div
        className={`${styles.figureCard} ${kindClass} ${isActive ? styles.cardSelected : ""} ${isDeleted ? styles.figureDeleted : ""}`}
        aria-label={isDeleted ? `${node.title}, Deleted` : undefined}
      >
        <span className={styles.kindRow}>
          <i className={`${styles.kind} ${styles[`kind_${node.kind}`]}`}>{KIND_LABEL[node.kind]}</i>
          <time className={styles.time} dateTime={node.createdAt}>{formatClock(node.createdAt)}</time>
        </span>
        <span className={styles.heroWrap}>
          <button
            type="button"
            className={styles.figureHero}
            onClick={restore}
            disabled={readOnly || !onRestore || isDeleted}
            aria-current={isActive ? "true" : undefined}
            title={restoreTitle}
          >
            {preview ? <img src={preview} alt="" /> : <span className={styles.heroEmpty}>No preview</span>}
          </button>
          {preview ? (
            <button
              type="button"
              className={styles.heroZoom}
              onClick={() => setZoom({ caption: KIND_LABEL[node.kind], note: node.title, body: <img src={preview} alt="" /> })}
              title={`Enlarge ${node.title}`}
              aria-label={`Enlarge ${node.title}`}
            >
              ⤢
            </button>
          ) : null}
        </span>
        <button
          type="button"
          className={styles.cardMain}
          onClick={restore}
          disabled={readOnly || !onRestore || isDeleted}
          title={restoreTitle}
        >
          <strong className={styles.title} title={node.title}>{node.title}</strong>
          {isActive ? (
            <span className={styles.chips}><span className={styles.chipActive}>current</span></span>
          ) : isDeleted ? (
            <span className={styles.chips}><span className={styles.chipDeleted}>Deleted</span></span>
          ) : null}
        </button>
        <p className={`${styles.changeLead} ${parentSnapshot ? "" : styles.changeLeadOrigin}`}>{lead}</p>
        {expandedNodeIds.has(node.id) ? (
          <div className={styles.cardDetail}>
            {snapshotSections(snapshot, variant, referenceTitles).map((section) => (
              <section key={section.title} className={`${styles.detailSection} ${styles[`phase_${section.phase}`]}`}>
                <h3>{section.title}</h3>
                <dl className={styles.detailRows}>
                  {section.rows.map((row) => (
                    <div key={`${section.title}-${row.label}`} className={styles.detailRow}>
                      <dt>{row.label}</dt>
                      <dd className={row.value ? "" : styles.detailEmpty}>{row.value ?? "not set"}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          className={`${styles.traceToggle} ${expandedNodeIds.has(node.id) ? styles.traceToggleActive : ""}`}
          onClick={() => toggleExpanded(node.id)}
          aria-expanded={expandedNodeIds.has(node.id)}
          disabled={!snapshot}
        >
          {expandedNodeIds.has(node.id) ? "Show less" : "Show everything"}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLead}>
          <span className="label-text">History</span>
          <strong className={styles.singleRoot}>Current figure</strong>
        </div>
        <span className={styles.legendNote}>
          {generatedCount} run{generatedCount === 1 ? "" : "s"} · each band is one generation, with its own prompt fanning into structure, style, and match, then gathering into the figure it produced · <b>kept</b> marks an ingredient an earlier run already used
        </span>
      </div>

      <div className={styles.canvas} aria-label="How this figure was made">
        <div className={styles.runs}>
          {batches.map((batch, index) => {
            const restoreNode = batch.base;
            const restoreCurrent = Boolean(restoreNode && activeNodeId === restoreNode.id);
            return (
            <section key={batch.id} className={styles.runBatch} aria-label={`Run ${index + 1}`}>
              <header className={styles.runBatchHead}>
                <span className={styles.runBadge}>Run {index + 1}</span>
                {restoreNode ? (
                  <time dateTime={restoreNode.createdAt}>{formatClock(restoreNode.createdAt)}</time>
                ) : (
                  <span className={styles.runPending}>not generated yet</span>
                )}
                {restoreNode ? (
                  <button
                    type="button"
                    className={styles.runRestore}
                    onClick={() => {
                      if (!onRestore || readOnly || restoreCurrent) return;
                      setZoom(null);
                      onRestore(restoreNode.id);
                    }}
                    disabled={readOnly || !onRestore || restoreCurrent}
                    title={
                      readOnly
                        ? "Reopen the study before restoring"
                        : restoreCurrent
                          ? "This run is already active"
                          : `Restore the workspace to Run ${index + 1}`
                    }
                  >
                    {restoreCurrent ? "Current" : "Restore"}
                  </button>
                ) : null}
              </header>

              <div className={styles.flow}>
                <div className={styles.origin}>
                  <span className={styles.stageLabel}>Prompt</span>
                  {batch.prompt ? (
                    <ul className={styles.stageCards}>{renderFlowCard(batch.prompt)}</ul>
                  ) : (
                    <p className={styles.stageEmpty}>Not written</p>
                  )}
                </div>

                <div className={styles.fan}>
                  {batch.tracks.map((track) => (
                    <div key={track.id} className={styles.trackRow}>
                      <i className={styles.fork} aria-hidden="true" />
                      <div className={styles.track}>
                        {track.stages.map((stage, stageIndex) => (
                          <Fragment key={stage.id}>
                            {stageIndex > 0 ? <span className={styles.link} aria-hidden="true" /> : null}
                            {renderStage(stage)}
                          </Fragment>
                        ))}
                      </div>
                      <i className={styles.gather} aria-hidden="true" />
                    </div>
                  ))}
                </div>

                <div className={styles.outcome}>
                  <span className={styles.stageLabel}>Figure</span>
                  {batch.base ? (
                    <div className={styles.candidateColumn}>
                      {renderFigureNode(batch.base, styles.figureBase)}
                      {batch.edits.map((edit) => (
                        <Fragment key={edit.id}>
                          <span className={styles.link} aria-hidden="true" />
                          {renderFigureNode(edit, styles.figureEdit)}
                        </Fragment>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.stageEmpty}>No figure generated yet</p>
                  )}
                </div>
              </div>
            </section>
            );
          })}
        </div>
      </div>

      {zoom && portalReady && typeof document !== "undefined"
        ? createPortal(
          <div
            className={styles.lightbox}
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setZoom(null);
            }}
          >
            <section className={styles.lightboxPanel} role="dialog" aria-modal="true" aria-label={zoom.caption}>
              <header className={styles.lightboxHead}>
                <div>
                  <span className={styles.stageLabel}>{zoom.caption}</span>
                  {zoom.note ? <strong>{zoom.note}</strong> : null}
                </div>
                <button type="button" className={styles.lightboxClose} onClick={() => setZoom(null)} aria-label="Close">
                  ×
                </button>
              </header>
              <div className={styles.lightboxBody}>{zoom.body}</div>
            </section>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}
