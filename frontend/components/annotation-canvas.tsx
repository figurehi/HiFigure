"use client";

import dynamic from "next/dynamic";
import type {
  AnnotationCanvasHandle,
  AnnotationStyleCue,
} from "./annotation-canvas-impl";

/**
 * Keep tldraw out of Next's server module graph. In development, server-side
 * module re-evaluation otherwise registers the same ESM packages repeatedly
 * and produces tldraw's multiple-instances warning.
 */
export const AnnotationCanvas = dynamic(
  () => import("./annotation-canvas-impl").then((module) => module.AnnotationCanvas),
  { ssr: false },
);

export type { AnnotationCanvasHandle, AnnotationStyleCue };
