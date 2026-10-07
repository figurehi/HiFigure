"use client";

// Loaded through annotation-canvas.tsx with SSR disabled. tldraw maintains a
// browser-global package registry and must not be evaluated by Next's server.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  DefaultColorStyle,
  DefaultFillStyle,
  DefaultStylePanel,
  DefaultStylePanelContent,
  DefaultToolbar,
  Tldraw,
  createShapeId,
  GeoShapeGeoStyle,
  getSnapshot,
  loadSnapshot,
  useEditor,
  useValue,
  type Editor,
  type TLAssetId,
  type TLImageAsset,
  type TLEditorSnapshot,
  type TLShape,
  type TLShapeId,
  type TLUiOverrides,
  type TLUiToolsContextType,
} from "tldraw";
import "tldraw/tldraw.css";
import { imageUrlToDataUrl } from "../lib/annotation-flatten";
import { figureRelativeMaskRects } from "../lib/evolve-artifact";

const MASK_TOOL_ID = "hichart-mask";
const MASK_TOOL_LABEL = "Mask";
/**
 * A mask marks a region without hiding it: the author still has to read the
 * labels underneath to describe what should change there.
 */
const MASK_OPACITY = 0.22;
const FIGURE_BG_META = "hichartFigureBackground";

export type AnnotationCanvasHandle = {
  exportToPngDataUrl: () => Promise<string | null>;
  /** White-on-black PNG covering the editable mask rectangles. */
  exportEditMaskDataUrl: () => Promise<string | null>;
  /** The figure pixels already loaded into tldraw, as a data URL. */
  exportFigureSourceDataUrl: () => Promise<string | null>;
  hasUserMarkup: () => boolean;
  getSnapshot: () => TLEditorSnapshot | null;
  /** Removes a mask from the notes panel, without tool switching. */
  deleteMarkup: (shapeId: string) => void;
};

export type AnnotationStyleCue = {
  id: string;
  name: string;
  bounds: { x: number; y: number; w: number; h: number };
  scope: "target" | "global";
  fontLabel?: string | null;
  fontFamily?: string | null;
  paletteLabel?: string | null;
  paletteColors?: string[];
};

type Props = {
  imageUrl: string | null;
  variantId: string;
  snapshot?: TLEditorSnapshot | null;
  onSnapshotChange?: (snapshot: TLEditorSnapshot) => void;
  onMarkupChange?: (hasMarkup: boolean) => void;
  /** Frontend-only appearance instructions flattened into the control image. */
  styleCues?: AnnotationStyleCue[];
  figureBounds?: { x: number; y: number; w: number; h: number } | null;
  /** Reports the markup picked on the canvas so its note can follow along. */
  onSelectMarkup?: (shapeId: string | null) => void;
  /** Selects markup on the canvas when its note is picked instead. */
  focusShapeId?: string | null;
};

export function isMaskRecord(record: { typeName?: unknown; type?: unknown; props?: unknown }): boolean {
  const props = record.props as Record<string, unknown> | undefined;
  return (
    record.typeName === "shape" &&
    record.type === "geo" &&
    props?.geo === "rectangle" &&
    props?.color === "violet" &&
    props?.fill === "semi"
  );
}

/**
 * Markup is numbered in reading order so the badge on the canvas and the note
 * in the side panel always agree, however the shapes were drawn or restored.
 */
export function compareMarkupForReading(
  left: { bounds: { x: number; y: number } },
  right: { bounds: { x: number; y: number } },
): number {
  const rowGap = 24;
  if (Math.abs(left.bounds.y - right.bounds.y) > rowGap) return left.bounds.y - right.bounds.y;
  return left.bounds.x - right.bounds.x;
}

/** Chips drawn over each mask, matching the notes beside the canvas. */
function MarkupBadges() {
  const editor = useEditor();
  const badges = useValue(
    "markup badges",
    () => {
      const collect = (match: (shape: { typeName?: unknown; type?: unknown }) => boolean) =>
        editor
          .getCurrentPageShapes()
          .filter((shape) => match(shape))
          .map((shape) => {
            const bounds = editor.getShapePageBounds(shape);
            return bounds ? { id: shape.id, bounds: { x: bounds.minX, y: bounds.minY } } : null;
          })
          .filter((entry): entry is { id: TLShapeId; bounds: { x: number; y: number } } => Boolean(entry))
          .sort(compareMarkupForReading);

      const selected = new Set(editor.getSelectedShapeIds());
      const toBadge = (
        entry: { id: TLShapeId; bounds: { x: number; y: number } },
        label: string,
      ) => {
        const point = editor.pageToViewport(entry.bounds);
        return { id: entry.id, label, x: point.x, y: point.y, selected: selected.has(entry.id) };
      };

      return collect(isMaskRecord).map((entry, index) => toBadge(entry, `${index + 1}`));
    },
    [editor],
  );

  if (!badges.length) return null;
  return (
    <>
      {badges.map((badge) => (
        <span
          key={badge.id}
          className={`hichart-markup-badge is-mask ${badge.selected ? "is-active" : ""}`}
          style={{ transform: `translate(${badge.x}px, ${badge.y}px)` }}
          aria-hidden="true"
        >
          {badge.label}
        </span>
      ))}
    </>
  );
}

export function annotationStyleCueText(cue: AnnotationStyleCue): string[] {
  const lines = [cue.scope === "global" ? "GLOBAL STYLE" : `STYLE TARGET: ${cue.name}`];
  if (cue.fontLabel) lines.push(`Font: ${cue.fontLabel}`);
  if (cue.paletteLabel || cue.paletteColors?.length) {
    lines.push(`Palette: ${cue.paletteLabel ?? "selected colors"}`);
  }
  return lines;
}

async function flattenStyleCues(
  imageDataUrl: string,
  cues: AnnotationStyleCue[],
  figureBounds: Props["figureBounds"],
): Promise<string> {
  const activeCues = cues.filter(
    (cue) => Boolean(cue.fontLabel || cue.paletteLabel || cue.paletteColors?.length),
  );
  if (!activeCues.length || typeof document === "undefined") return imageDataUrl;

  const image = new Image();
  image.src = imageDataUrl;
  try {
    await image.decode();
  } catch {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not decode annotation control image."));
    });
  }

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return imageDataUrl;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return imageDataUrl;
  context.drawImage(image, 0, 0, width, height);

  const sourceBounds = figureBounds && figureBounds.w > 0 && figureBounds.h > 0
    ? figureBounds
    : { x: 0, y: 0, w: width, h: height };
  const scaleX = width / sourceBounds.w;
  const scaleY = height / sourceBounds.h;
  const panelWidth = Math.max(176, Math.min(286, Math.round(width * 0.34)));
  const lineHeight = 18;

  activeCues.forEach((cue, index) => {
    const lines = annotationStyleCueText(cue);
    const hasSwatches = Boolean(cue.paletteColors?.length);
    const panelHeight = 14 + lines.length * lineHeight + (hasSwatches ? 22 : 0);
    const rawX = cue.scope === "global"
      ? 12
      : (cue.bounds.x - sourceBounds.x) * scaleX + 6;
    const rawY = cue.scope === "global"
      ? 12 + index * (panelHeight + 8)
      : (cue.bounds.y - sourceBounds.y) * scaleY + 6;
    const x = Math.max(6, Math.min(width - panelWidth - 6, rawX));
    const y = Math.max(6, Math.min(height - panelHeight - 6, rawY));

    context.save();
    context.fillStyle = "rgba(255,255,255,0.94)";
    context.strokeStyle = cue.scope === "global" ? "#7c3aed" : "#a21caf";
    context.lineWidth = 3;
    context.fillRect(x, y, panelWidth, panelHeight);
    context.strokeRect(x, y, panelWidth, panelHeight);
    lines.forEach((line, lineIndex) => {
      const isFontLine = line.startsWith("Font:") && cue.fontFamily;
      context.font = isFontLine
        ? `600 13px ${cue.fontFamily}`
        : `${lineIndex === 0 ? "700" : "600"} 13px Arial, sans-serif`;
      context.fillStyle = "#241331";
      context.fillText(line, x + 9, y + 18 + lineIndex * lineHeight, panelWidth - 18);
    });
    if (hasSwatches) {
      const swatchY = y + 9 + lines.length * lineHeight;
      cue.paletteColors?.slice(0, 8).forEach((color, colorIndex) => {
        context.fillStyle = color;
        context.fillRect(x + 9 + colorIndex * 24, swatchY, 18, 14);
        context.strokeStyle = "rgba(36,19,49,0.45)";
        context.lineWidth = 1;
        context.strokeRect(x + 9 + colorIndex * 24, swatchY, 18, 14);
      });
    }
    context.restore();
  });

  return canvas.toDataURL("image/png");
}

async function alignedAnnotationControlImage(
  editor: Editor,
  cues: AnnotationStyleCue[],
): Promise<string | null> {
  const figure = editor.getCurrentPageShapes().find((shape) => shape.meta?.[FIGURE_BG_META]);
  if (!figure || figure.type !== "image") return null;
  const pageBounds = editor.getShapePageBounds(figure);
  if (!pageBounds || pageBounds.w <= 0 || pageBounds.h <= 0) return null;
  const assetId = (figure.props as { assetId?: string | null }).assetId;
  if (!assetId) return null;
  const asset = editor.getAsset(assetId as TLAssetId);
  if (!asset || asset.type !== "image" || typeof asset.props.src !== "string" || !asset.props.src) {
    return null;
  }
  const sourceDataUrl = await imageUrlToDataUrl(asset.props.src);
  if (!sourceDataUrl) return null;

  const sourceImage = new Image();
  sourceImage.src = sourceDataUrl;
  try {
    await sourceImage.decode();
  } catch {
    await new Promise<void>((resolve, reject) => {
      sourceImage.onload = () => resolve();
      sourceImage.onerror = () => reject(new Error("Could not decode the figure source image."));
    });
  }
  const width = sourceImage.naturalWidth || sourceImage.width;
  const height = sourceImage.naturalHeight || sourceImage.height;
  if (!width || !height) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(sourceImage, 0, 0, width, height);

  const figureBounds = { x: pageBounds.x, y: pageBounds.y, w: pageBounds.w, h: pageBounds.h };
  const scaleX = width / pageBounds.w;
  const scaleY = height / pageBounds.h;
  const masks = editor
    .getCurrentPageShapes()
    .filter((shape) => isMaskRecord(shape))
    .flatMap((shape) => {
      const bounds = editor.getShapePageBounds(shape);
      return bounds
        ? [{ id: shape.id, bounds: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h } }]
        : [];
    })
    .sort(compareMarkupForReading);

  masks.forEach((mask, index) => {
    const [rect] = figureRelativeMaskRects(figureBounds, [mask.bounds]);
    if (!rect) return;
    const x = rect.x * scaleX;
    const y = rect.y * scaleY;
    const w = rect.w * scaleX;
    const h = rect.h * scaleY;
    const strokeWidth = Math.max(2, Math.round(Math.min(width, height) / 420));
    context.save();
    context.fillStyle = "rgba(124, 58, 237, 0.24)";
    context.strokeStyle = "rgba(109, 40, 217, 0.96)";
    context.lineWidth = strokeWidth;
    context.fillRect(x, y, w, h);
    context.strokeRect(x + strokeWidth / 2, y + strokeWidth / 2, Math.max(1, w - strokeWidth), Math.max(1, h - strokeWidth));

    // The React badges visible in the editor are outside tldraw's export.
    // Burn the same number into the control raster so textual Mask #N notes
    // have an unambiguous visual target for the image model.
    const radius = Math.max(11, Math.min(18, Math.round(Math.min(width, height) / 55)));
    const badgeX = Math.max(radius + 2, Math.min(width - radius - 2, x + radius + 3));
    const badgeY = Math.max(radius + 2, Math.min(height - radius - 2, y + radius + 3));
    context.beginPath();
    context.arc(badgeX, badgeY, radius, 0, Math.PI * 2);
    context.fillStyle = "#6d28d9";
    context.fill();
    context.font = `700 ${Math.max(12, Math.round(radius * 1.15))}px Arial, sans-serif`;
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(index + 1), badgeX, badgeY + 0.5);
    context.restore();
  });

  return flattenStyleCues(canvas.toDataURL("image/png"), cues, figureBounds);
}

function unlockGlobalToolLock(editor: Editor) {
  if (!editor.getInstanceState().isToolLocked) return;
  editor.updateInstanceState({ isToolLocked: false });
}

function selectMaskTool(editor: Editor) {
  unlockGlobalToolLock(editor);
  editor.run(() => {
    editor.setStyleForNextShapes(GeoShapeGeoStyle, "rectangle");
    editor.setStyleForNextShapes(DefaultColorStyle, "violet");
    editor.setStyleForNextShapes(DefaultFillStyle, "semi");
    editor.setOpacityForNextShapes(MASK_OPACITY);
    editor.setCurrentTool("geo");
  });
}

function isMaskToolActive(editor: Editor) {
  return (
    editor.getCurrentToolId() === "geo" &&
    editor.getStyleForNextShape(GeoShapeGeoStyle) === "rectangle" &&
    editor.getStyleForNextShape(DefaultColorStyle) === "violet" &&
    editor.getStyleForNextShape(DefaultFillStyle) === "semi" &&
    editor.getInstanceState().opacityForNextShape === MASK_OPACITY
  );
}

function MaskToolbarItem() {
  const editor = useEditor();
  const isSelected = useValue(
    "mask tool selected",
    () => isMaskToolActive(editor),
    [editor],
  );
  return (
    <button
      type="button"
      aria-label={MASK_TOOL_LABEL}
      aria-pressed={isSelected}
      className={`tlui-button tlui-button__tool hichart-mask-tool-button ${isSelected ? "tlui-button__tool--selected" : ""}`}
      onClick={() => selectMaskTool(editor)}
      title="Mask editable area"
    >
      <span className="hichart-mask-tool-icon" aria-hidden="true">
        ▧
      </span>
      <span>{MASK_TOOL_LABEL}</span>
    </button>
  );
}

function HichartToolbar(props: React.ComponentProps<typeof DefaultToolbar>) {
  return (
    <DefaultToolbar {...props} maxItems={4}>
      <MaskToolbarItem />
    </DefaultToolbar>
  );
}

function HichartStylePanel(props: React.ComponentProps<typeof DefaultStylePanel>) {
  return (
    <DefaultStylePanel {...props}>
      <DefaultStylePanelContent />
    </DefaultStylePanel>
  );
}

const hichartUiOverrides: TLUiOverrides = {
  translations: {
    en: {
      "tool.hichart-mask": MASK_TOOL_LABEL,
    },
  },
  tools(editor: Editor, tools: TLUiToolsContextType) {
    return {
      ...tools,
      [MASK_TOOL_ID]: {
        id: MASK_TOOL_ID,
        label: "tool.hichart-mask",
        icon: "geo-rectangle",
        kbd: "m",
        onSelect() {
          selectMaskTool(editor);
        },
      },
    } as typeof tools;
  },
};

const hichartComponents = {
  Toolbar: HichartToolbar,
  StylePanel: HichartStylePanel,
  InFrontOfTheCanvas: MarkupBadges,
};

// tldraw refuses to run on a production domain without a key, and shows the
// "get a license for production" badge until one is supplied.
const TLDRAW_LICENSE_KEY = process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY || undefined;

/**
 * Canvases saved before the figure carried an explicit opacity come back with
 * the mask tool's value, which reads as a white wash over the whole figure.
 */
function restoreFigureBackgroundOpacity(editor: Editor, shape: TLShape) {
  if (shape.opacity === 1) return;
  editor.run(
    () => {
      editor.updateShapes([{ id: shape.id, type: shape.type, opacity: 1 }]);
    },
    { ignoreShapeLock: true },
  );
}

async function createFigureImageAsset(editor: Editor, imageUrl: string) {
  const dataUrl = await imageUrlToDataUrl(imageUrl);
  if (!dataUrl) return null;
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], "figure.png", { type: blob.type || "image/png" });
  const asset = await editor.getAssetForExternalContent({ type: "file", file });
  if (!asset || asset.type !== "image") return null;
  return asset as TLImageAsset;
}

async function hydrateFigureBackgroundAsset(editor: Editor, shape: TLShape, imageUrl: string) {
  const assetId = (shape.props as { assetId?: string | null }).assetId;
  const existingAsset = assetId ? editor.getAsset(assetId as TLAssetId) : undefined;
  if (existingAsset?.type === "image" && typeof existingAsset.props.src === "string" && existingAsset.props.src) {
    restoreFigureBackgroundOpacity(editor, shape);
    return shape.id;
  }

  const imageAsset = await createFigureImageAsset(editor, imageUrl);
  if (!imageAsset) {
    restoreFigureBackgroundOpacity(editor, shape);
    return shape.id;
  }

  editor.run(
    () => {
      if (existingAsset?.type === "image") {
        editor.updateAssets([{
          id: existingAsset.id,
          type: "image",
          props: { ...existingAsset.props, src: imageAsset.props.src },
        }]);
      } else {
        editor.createAssets([imageAsset]);
        editor.updateShapes([
          {
            id: shape.id,
            type: "image",
            props: { assetId: imageAsset.id },
          },
        ]);
      }
      restoreFigureBackgroundOpacity(editor, shape);
    },
    { ignoreShapeLock: true },
  );
  return shape.id;
}

async function ensureFigureBackground(
  editor: Editor,
  imageUrl: string,
  figureBounds?: { x: number; y: number; w: number; h: number } | null,
) {
  const existing = editor.getCurrentPageShapes().find((shape) => shape.meta?.[FIGURE_BG_META]);
  if (existing) {
    return hydrateFigureBackgroundAsset(editor, existing, imageUrl);
  }

  const imageAsset = await createFigureImageAsset(editor, imageUrl);
  if (!imageAsset) return null;

  const shapeId = createShapeId("figure-bg");
  const x = figureBounds?.x ?? 0;
  const y = figureBounds?.y ?? 0;
  const w = figureBounds && figureBounds.w > 0 ? figureBounds.w : imageAsset.props.w;
  const h = figureBounds && figureBounds.h > 0 ? figureBounds.h : imageAsset.props.h;

  editor.run(() => {
    editor.createAssets([imageAsset]);
    editor.createShapes([
      {
        id: shapeId,
        type: "image",
        x,
        y,
        parentId: editor.getCurrentPageId(),
        // tldraw falls back to `opacityForNextShape` when a partial omits it, and
        // the mask tool leaves that at MASK_OPACITY, so the figure has to say 1.
        opacity: 1,
        isLocked: true,
        meta: { [FIGURE_BG_META]: true },
        props: {
          assetId: imageAsset.id,
          w,
          h,
        },
      },
    ]);
    editor.sendToBack([shapeId]);
    editor.zoomToBounds({ x, y, w, h }, { inset: 40, targetZoom: 1 });
  });

  return shapeId;
}

function hasUserMarkup(editor: Editor) {
  return editor.getCurrentPageShapes().some((shape) => !shape.meta?.[FIGURE_BG_META]);
}

export const AnnotationCanvas = forwardRef<AnnotationCanvasHandle, Props>(function AnnotationCanvas(
  {
    imageUrl,
    variantId,
    snapshot,
    onSnapshotChange,
    onMarkupChange,
    styleCues = [],
    figureBounds = null,
    onSelectMarkup,
    focusShapeId = null,
  },
  ref,
) {
  const editorRef = useRef<Editor | null>(null);
  const loadedImageRef = useRef<string | null>(null);
  // Held in a ref so a new handler never remounts the tldraw instance.
  const onSelectMarkupRef = useRef(onSelectMarkup);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onSelectMarkupRef.current = onSelectMarkup;
  }, [onSelectMarkup]);

  const notifyChange = useCallback(
    (editor: Editor) => {
      onSnapshotChange?.(getSnapshot(editor.store));
      onMarkupChange?.(hasUserMarkup(editor));
    },
    [onMarkupChange, onSnapshotChange],
  );

  useImperativeHandle(ref, () => ({
    async exportToPngDataUrl() {
      const editor = editorRef.current;
      if (!editor) return null;
      // Build the edit control from the original source pixels at their native
      // dimensions. Exporting the whole tldraw page can change the aspect ratio
      // when a mask crosses the figure edge and makes local edits drift.
      try {
        const aligned = await alignedAnnotationControlImage(editor, styleCues);
        if (aligned) return aligned;
      } catch {
        // Keep the tldraw export below as a compatibility fallback.
      }
      const shapeIds = [...editor.getCurrentPageShapeIds()];
      if (!shapeIds.length) return null;
      try {
        const result = await editor.toImageDataUrl(shapeIds, {
          format: "png",
          background: true,
          padding: 0,
          scale: 1,
        });
        const imageDataUrl = typeof result === "string" ? result : result?.url ?? null;
        return imageDataUrl
          ? await flattenStyleCues(imageDataUrl, styleCues, figureBounds)
          : null;
      } catch {
        return null;
      }
    },
    async exportEditMaskDataUrl() {
      const editor = editorRef.current;
      if (!editor) return null;
      const figure = editor.getCurrentPageShapes().find((shape) => shape.meta?.[FIGURE_BG_META]);
      if (!figure) return null;
      const pageBounds = editor.getShapePageBounds(figure);
      if (!pageBounds || pageBounds.w <= 0 || pageBounds.h <= 0) return null;
      const masks = editor.getCurrentPageShapes().filter((shape) => isMaskRecord(shape));
      if (!masks.length) return null;
      const figurePageBounds = {
        x: pageBounds.x,
        y: pageBounds.y,
        w: pageBounds.w,
        h: pageBounds.h,
      };
      const rects = figureRelativeMaskRects(
        figurePageBounds,
        masks.flatMap((shape) => {
          const bounds = editor.getShapePageBounds(shape);
          return bounds ? [{ x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }] : [];
        }),
      );
      if (!rects.length) return null;
      const width = Math.max(1, Math.round(pageBounds.w));
      const height = Math.max(1, Math.round(pageBounds.h));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff";
      const scaleX = width / pageBounds.w;
      const scaleY = height / pageBounds.h;
      for (const rect of rects) {
        ctx.fillRect(
          Math.round(rect.x * scaleX),
          Math.round(rect.y * scaleY),
          Math.max(1, Math.round(rect.w * scaleX)),
          Math.max(1, Math.round(rect.h * scaleY)),
        );
      }
      return canvas.toDataURL("image/png");
    },
    async exportFigureSourceDataUrl() {
      const editor = editorRef.current;
      if (!editor) return null;
      const figure = editor.getCurrentPageShapes().find((shape) => shape.meta?.[FIGURE_BG_META]);
      if (!figure || figure.type !== "image") return null;
      const assetId = (figure.props as { assetId?: string | null }).assetId;
      if (!assetId) return null;
      const asset = editor.getAsset(assetId as TLAssetId);
      if (!asset || asset.type !== "image") return null;
      const src = asset.props.src;
      if (typeof src !== "string" || !src) return null;
      return imageUrlToDataUrl(src);
    },
    hasUserMarkup() {
      const editor = editorRef.current;
      return editor ? hasUserMarkup(editor) : false;
    },
    getSnapshot() {
      const editor = editorRef.current;
      return editor ? getSnapshot(editor.store) : null;
    },
    deleteMarkup(shapeId: string) {
      const editor = editorRef.current;
      if (!editor) return;
      const shape = editor.getShape(shapeId as TLShapeId);
      if (!shape || !isMaskRecord(shape)) return;
      editor.deleteShapes([shape.id]);
      notifyChange(editor);
    },
  }));

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      setReady(true);

      if (snapshot) {
        loadSnapshot(editor.store, snapshot);
        // Saved sessions created before Annotate was removed may still contain
        // arrow shapes. Drop them immediately so they cannot reappear or be
        // submitted through the mask-only Edit flow.
        const legacyArrowIds = editor
          .getCurrentPageShapes()
          .filter((shape) => shape.type === "arrow")
          .map((shape) => shape.id);
        if (legacyArrowIds.length) editor.deleteShapes(legacyArrowIds);
      }

      const unsubscribeUserChanges = editor.store.listen(
        () => notifyChange(editor),
        { source: "user", scope: "document" },
      );

      // Picking markup on the canvas scrolls its note into view on the right.
      let lastReportedSelection: string | null = null;
      const unsubscribeSelectionSync = editor.store.listen(
        () => {
          const selected = editor
            .getSelectedShapes()
            .find((shape) => isMaskRecord(shape));
          const nextId = selected?.id ?? null;
          if (nextId === lastReportedSelection) return;
          lastReportedSelection = nextId;
          onSelectMarkupRef.current?.(nextId);
        },
        { source: "user", scope: "session" },
      );

      void (async () => {
        if (imageUrl) {
          await ensureFigureBackground(editor, imageUrl, figureBounds);
          loadedImageRef.current = imageUrl;
          selectMaskTool(editor);
          notifyChange(editor);
        }
      })();

      return () => {
        unsubscribeUserChanges();
        unsubscribeSelectionSync();
        if (editorRef.current === editor) {
          editorRef.current = null;
        }
      };
    },
    [figureBounds, imageUrl, notifyChange, snapshot],
  );

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !ready || !focusShapeId) return;
    const shape = editor.getShape(focusShapeId as TLShapeId);
    if (!shape) return;
    if (editor.getSelectedShapeIds().includes(shape.id)) return;
    editor.setCurrentTool("select");
    editor.select(shape.id);
  }, [focusShapeId, ready]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !ready || !imageUrl || loadedImageRef.current === imageUrl) return;
    void ensureFigureBackground(editor, imageUrl, figureBounds).then(() => {
      loadedImageRef.current = imageUrl;
      selectMaskTool(editor);
      notifyChange(editor);
    });
  }, [figureBounds, imageUrl, notifyChange, ready]);

  if (!imageUrl) {
    return <div className="annotation-empty">This figure has no image to edit.</div>;
  }

  return (
    <div className="annotation-root annotation-root-tldraw">
      <Tldraw
        key={variantId}
        onMount={handleMount}
        overrides={hichartUiOverrides}
        components={hichartComponents}
        hideUi={false}
        licenseKey={TLDRAW_LICENSE_KEY}
      />
      <p className="annotation-hint">
        Use <strong>Mask</strong> to mark each editable area, then describe its change in Notes.
      </p>
    </div>
  );
});
