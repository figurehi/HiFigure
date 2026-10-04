import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import type { DiagramEdge, DiagramNode, DiagramPlan } from "./types";

function decodeXml(text: string): string {
  if (typeof window === "undefined") {
    return text
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

function stripHtml(text: string): string {
  return decodeXml(text)
    .replace(/<\s*br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const GROUP_NODE_ROLES = new Set(["group", "container", "panel", "lane", "section"]);
type DiagramPoint = { x: number; y: number };
type CardinalPort = NonNullable<DiagramEdge["sourcePort"]>;
type RoutableNode = Pick<DiagramNode, "id" | "x" | "y" | "w" | "h">;

const PORT_VECTOR: Record<CardinalPort, DiagramPoint> = {
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 },
  south: { x: 0, y: 1 },
  north: { x: 0, y: -1 },
};

/**
 * Container-style nodes only wrap other modules, so they never carry an icon of
 * their own: the preview skips them and Match must not offer them for binding.
 */
export function isDiagramGroupNode(node: Pick<DiagramNode, "role">): boolean {
  return GROUP_NODE_ROLES.has((node.role ?? "").toLowerCase());
}

function nodeCenter(node: RoutableNode): DiagramPoint {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

function relativePortPair(source: RoutableNode, target: RoutableNode): [CardinalPort, CardinalPort] {
  const start = nodeCenter(source);
  const end = nodeCenter(target);
  if (Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)) {
    return end.x >= start.x ? ["east", "west"] : ["west", "east"];
  }
  return end.y >= start.y ? ["south", "north"] : ["north", "south"];
}

function portPoint(node: RoutableNode, port: CardinalPort): DiagramPoint {
  if (port === "west") return { x: node.x, y: node.y + node.h / 2 };
  if (port === "north") return { x: node.x + node.w / 2, y: node.y };
  if (port === "south") return { x: node.x + node.w / 2, y: node.y + node.h };
  return { x: node.x + node.w, y: node.y + node.h / 2 };
}

function inferredPortTowardPoint(node: RoutableNode, point: DiagramPoint): CardinalPort {
  const center = nodeCenter(node);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "east" : "west";
  return dy >= 0 ? "south" : "north";
}

function simplifyOrthogonalPoints(points: DiagramPoint[]): DiagramPoint[] {
  const epsilon = 0.001;
  const cleaned = points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous || Math.abs(point.x - previous.x) > epsilon || Math.abs(point.y - previous.y) > epsilon;
  });
  if (cleaned.length <= 2) return cleaned;
  const simplified = [cleaned[0]];
  for (let index = 1; index < cleaned.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = cleaned[index];
    const following = cleaned[index + 1];
    const vertical = Math.abs(previous.x - current.x) <= epsilon && Math.abs(current.x - following.x) <= epsilon;
    const horizontal = Math.abs(previous.y - current.y) <= epsilon && Math.abs(current.y - following.y) <= epsilon;
    if (!vertical && !horizontal) simplified.push(current);
  }
  simplified.push(cleaned[cleaned.length - 1]);
  return simplified;
}

function segmentHitsNode(start: DiagramPoint, end: DiagramPoint, node: RoutableNode, padding = 8): boolean {
  const epsilon = 0.001;
  const left = node.x - padding;
  const right = node.x + node.w + padding;
  const top = node.y - padding;
  const bottom = node.y + node.h + padding;
  if (Math.abs(start.y - end.y) <= epsilon) {
    return top < start.y && start.y < bottom && Math.max(Math.min(start.x, end.x), left) < Math.min(Math.max(start.x, end.x), right);
  }
  if (Math.abs(start.x - end.x) <= epsilon) {
    return left < start.x && start.x < right && Math.max(Math.min(start.y, end.y), top) < Math.min(Math.max(start.y, end.y), bottom);
  }
  return true;
}

function routeCandidateScore(
  points: DiagramPoint[],
  sourcePort: CardinalPort,
  targetPort: CardinalPort,
  obstacles: RoutableNode[],
  width: number,
  height: number,
): number {
  if (points.length < 2) return Number.POSITIVE_INFINITY;
  let score = Math.max(0, points.length - 2) * 18;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (Math.abs(start.x - end.x) > 0.001 && Math.abs(start.y - end.y) > 0.001) {
      return Number.POSITIVE_INFINITY;
    }
    score += Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
    score += obstacles.filter((node) => segmentHitsNode(start, end, node)).length * 1_000_000;
  }
  if (points.some((point) => point.x < 0 || point.y < 0 || point.x > width || point.y > height)) {
    score += 500_000;
  }

  const first = points[1];
  const start = points[0];
  const sourceVector = PORT_VECTOR[sourcePort];
  if ((first.x - start.x) * sourceVector.x + (first.y - start.y) * sourceVector.y <= 0) score += 2_000_000;
  const previous = points[points.length - 2];
  const end = points[points.length - 1];
  const targetVector = PORT_VECTOR[targetPort];
  if ((previous.x - end.x) * targetVector.x + (previous.y - end.y) * targetVector.y <= 0) score += 2_000_000;
  return score;
}

/**
 * Draw.io calculates orthogonal routes at render time when an edge has no
 * explicit waypoints. The Canvas preview has no mxGraph router, so generate a
 * compact obstacle-aware polyline that preserves the same entry/exit sides.
 */
export function routeOrthogonalPreviewEdge({
  source,
  target,
  sourcePort: requestedSourcePort,
  targetPort: requestedTargetPort,
  obstacles = [],
  width = 1600,
  height = 960,
}: {
  source: RoutableNode;
  target: RoutableNode;
  sourcePort?: CardinalPort;
  targetPort?: CardinalPort;
  obstacles?: RoutableNode[];
  width?: number;
  height?: number;
}): { sourcePort: CardinalPort; targetPort: CardinalPort; points: DiagramPoint[] } {
  const inferredPorts = relativePortPair(source, target);
  const sourcePort = requestedSourcePort ?? inferredPorts[0];
  const targetPort = requestedTargetPort ?? inferredPorts[1];
  const start = portPoint(source, sourcePort);
  const end = portPoint(target, targetPort);
  const gap = 22;
  const sourceVector = PORT_VECTOR[sourcePort];
  const targetVector = PORT_VECTOR[targetPort];
  const sourceOut = { x: start.x + sourceVector.x * gap, y: start.y + sourceVector.y * gap };
  const targetOut = { x: end.x + targetVector.x * gap, y: end.y + targetVector.y * gap };
  const relevantObstacles = obstacles.filter((node) => node.id !== source.id && node.id !== target.id);
  const candidates: DiagramPoint[][] = [];

  const sourceHorizontal = sourcePort === "east" || sourcePort === "west";
  const targetHorizontal = targetPort === "east" || targetPort === "west";
  if (sourceHorizontal && targetHorizontal) {
    const middleX = (start.x + end.x) / 2;
    candidates.push([start, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end]);
  } else if (!sourceHorizontal && !targetHorizontal) {
    const middleY = (start.y + end.y) / 2;
    candidates.push([start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end]);
  } else if (sourceHorizontal) {
    candidates.push([start, { x: end.x, y: start.y }, end]);
  } else {
    candidates.push([start, { x: start.x, y: end.y }, end]);
  }

  // Two compact alternatives connect short outward stubs before approaching
  // the target. They cover reversed and mixed-side connections without loops.
  candidates.push(
    [start, sourceOut, { x: targetOut.x, y: sourceOut.y }, targetOut, end],
    [start, sourceOut, { x: sourceOut.x, y: targetOut.y }, targetOut, end],
  );

  const allNodes = [source, target, ...relevantObstacles];
  const minX = Math.min(...allNodes.map((node) => node.x));
  const maxX = Math.max(...allNodes.map((node) => node.x + node.w));
  const minY = Math.min(...allNodes.map((node) => node.y));
  const maxY = Math.max(...allNodes.map((node) => node.y + node.h));
  const laneXs = [Math.max(8, minX - gap), Math.min(Math.max(8, width - 8), maxX + gap)];
  const laneYs = [Math.max(8, minY - gap), Math.min(Math.max(8, height - 8), maxY + gap)];
  laneXs.forEach((laneX) => {
    candidates.push([start, sourceOut, { x: laneX, y: sourceOut.y }, { x: laneX, y: targetOut.y }, targetOut, end]);
  });
  laneYs.forEach((laneY) => {
    candidates.push([start, sourceOut, { x: sourceOut.x, y: laneY }, { x: targetOut.x, y: laneY }, targetOut, end]);
  });

  const routed = candidates
    .map(simplifyOrthogonalPoints)
    .map((points) => ({
      points,
      score: routeCandidateScore(points, sourcePort, targetPort, relevantObstacles, width, height),
    }))
    .sort((left, right) => left.score - right.score || left.points.length - right.points.length)[0]?.points;
  return { sourcePort, targetPort, points: routed ?? [start, end] };
}

function numberAttr(element: Element | null, name: string, fallback: number): number {
  if (!element) return fallback;
  const value = Number(element.getAttribute(name));
  return Number.isFinite(value) ? value : fallback;
}

function parseXmlDocument(xml: string): Document | null {
  if (!xml.trim()) return null;
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return null;
  return doc;
}

function decodeBase64(text: string): Uint8Array | null {
  try {
    const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const binary =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("binary");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function decodeCompressedDiagramText(text: string): string | null {
  const bytes = decodeBase64(text.trim());
  if (!bytes) return null;
  try {
    const inflated = strFromU8(inflateSync(bytes));
    try {
      return decodeURIComponent(inflated);
    } catch {
      return inflated;
    }
  } catch {
    return null;
  }
}

function encodeBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

function encodeCompressedDiagramText(text: string): string {
  return encodeBase64(deflateSync(strToU8(encodeURIComponent(text))));
}

function encodeXmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function removeEdgeCellsFromModelXml(xml: string): { xml: string; removedCount: number } {
  const edgeCellSource = String.raw`<mxCell\b(?=[^>]*\bedge\s*=\s*["']1["'])[^>]*(?:\/\s*>|>[\s\S]*?<\/mxCell\s*>)`;
  let removedCount = 0;
  let nextXml = xml.replace(
    new RegExp(String.raw`<(object|UserObject)\b[^>]*>\s*${edgeCellSource}\s*<\/\1\s*>`, "gi"),
    () => {
      removedCount += 1;
      return "";
    },
  );
  nextXml = nextXml.replace(new RegExp(edgeCellSource, "gi"), () => {
    removedCount += 1;
    return "";
  });
  return { xml: nextXml, removedCount };
}

function removeEdgeCellByIdFromModelXml(xml: string, edgeId: string): { xml: string; removedCount: number } {
  const escapedId = edgeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const edgeCellSource = String.raw`<mxCell\b(?=[^>]*\bedge\s*=\s*["']1["'])(?=[^>]*\bid\s*=\s*["']${escapedId}["'])[^>]*(?:\/\s*>|>[\s\S]*?<\/mxCell\s*>)`;
  let removedCount = 0;
  let nextXml = xml.replace(
    new RegExp(String.raw`<(object|UserObject)\b[^>]*>\s*${edgeCellSource}\s*<\/\1\s*>`, "gi"),
    () => {
      removedCount += 1;
      return "";
    },
  );
  nextXml = nextXml.replace(new RegExp(edgeCellSource, "gi"), () => {
    removedCount += 1;
    return "";
  });
  return { xml: nextXml, removedCount };
}

/**
 * Removes every Draw.io connection while preserving the rest of the document.
 * Handles the raw mxGraphModel used by the editor as well as encoded or
 * compressed diagrams from imported .drawio files.
 */
export function clearDrawioConnections(xml: string): { xml: string; removedCount: number } {
  const direct = removeEdgeCellsFromModelXml(xml);
  if (direct.removedCount > 0) return direct;

  let removedCount = 0;
  const nextXml = xml.replace(
    /(<diagram\b[^>]*>)([\s\S]*?)(<\/diagram\s*>)/gi,
    (match, opening: string, body: string, closing: string) => {
      const diagramText = decodeXml(body.trim()).trim();
      const decoded = diagramText.startsWith("<")
        ? diagramText
        : decodeCompressedDiagramText(diagramText);
      if (!decoded) return match;

      const cleared = removeEdgeCellsFromModelXml(decoded);
      if (cleared.removedCount === 0) return match;
      removedCount += cleared.removedCount;

      const encoded = diagramText.startsWith("<")
        ? encodeXmlText(cleared.xml)
        : encodeCompressedDiagramText(cleared.xml);
      return `${opening}${encoded}${closing}`;
    },
  );
  return { xml: removedCount > 0 ? nextXml : xml, removedCount };
}

/** Removes one complete Draw.io connector (line, arrowhead, label, and waypoints). */
export function removeDrawioConnection(xml: string, edgeId: string): { xml: string; removedCount: number } {
  const normalizedEdgeId = edgeId.trim();
  if (!normalizedEdgeId) return { xml, removedCount: 0 };
  const direct = removeEdgeCellByIdFromModelXml(xml, normalizedEdgeId);
  if (direct.removedCount > 0) return direct;

  let removedCount = 0;
  const nextXml = xml.replace(
    /(<diagram\b[^>]*>)([\s\S]*?)(<\/diagram\s*>)/gi,
    (match, opening: string, body: string, closing: string) => {
      const diagramText = decodeXml(body.trim()).trim();
      const decoded = diagramText.startsWith("<")
        ? diagramText
        : decodeCompressedDiagramText(diagramText);
      if (!decoded) return match;

      const removed = removeEdgeCellByIdFromModelXml(decoded, normalizedEdgeId);
      if (removed.removedCount === 0) return match;
      removedCount += removed.removedCount;
      const encoded = diagramText.startsWith("<")
        ? encodeXmlText(removed.xml)
        : encodeCompressedDiagramText(removed.xml);
      return `${opening}${encoded}${closing}`;
    },
  );
  return { xml: removedCount > 0 ? nextXml : xml, removedCount };
}

function drawioModelDocumentFromXml(xml: string): Document | null {
  const doc = parseXmlDocument(xml);
  if (!doc) return null;
  if (doc.querySelector("mxGraphModel")) return doc;

  const diagram = doc.querySelector("diagram");
  const rawDiagramText = diagram?.textContent?.trim();
  if (!rawDiagramText) return doc;

  const decodedDiagramText = decodeXml(rawDiagramText).trim();
  if (!decodedDiagramText.startsWith("<")) {
    const inflatedDiagramText = decodeCompressedDiagramText(decodedDiagramText)?.trim();
    if (inflatedDiagramText?.startsWith("<")) {
      return parseXmlDocument(inflatedDiagramText) ?? doc;
    }
    return doc;
  }

  return parseXmlDocument(decodedDiagramText) ?? doc;
}

function roleFromCell(label: string, style: string): string {
  const lower = label.toLowerCase();
  if (style.includes("container=1") || style.includes("fillOpacity=35")) return "group";
  if (style.includes("shape=line")) return "divider";
  if (style.includes("text;")) return "annotation";
  if (style.includes("dashed=1")) return "callout";
  if (style.includes("ellipse")) return lower.includes("bad") ? "badMarker" : lower.includes("good") ? "goodMarker" : "marker";
  if (lower.includes("language model") || lower.includes("model")) return "model";
  if (lower.includes("doc")) return "document";
  if (lower.includes("retrieved") || lower.includes("data")) return "data";
  if (lower.includes("answer") || lower.includes("output") || lower.includes("rationale")) return "output";
  if (lower.includes("question") || lower.includes("input")) return "input";
  if (lower.includes("objective") || lower.includes("p_") || lower.includes("pθ")) return "annotation";
  return "process";
}

function shapeFromStyle(style: string): string | null {
  if (style.includes("container=1") || style.includes("fillOpacity=35")) return "dashedBox";
  if (style.includes("shape=line")) return "divider";
  if (style.includes("text;")) return "text";
  if (style.includes("ellipse")) return "marker";
  if (style.includes("dashed=1")) return "dashedBox";
  if (style.includes("rounded=0")) return "rect";
  return "roundRect";
}

function drawioStyleValue(style: string, key: string): string | null {
  for (const token of style.split(";")) {
    const separator = token.indexOf("=");
    if (separator < 0 || token.slice(0, separator) !== key) continue;
    return token.slice(separator + 1);
  }
  return null;
}

function drawioPortFromStyle(style: string, prefix: "exit" | "entry"): CardinalPort | undefined {
  const rawX = drawioStyleValue(style, `${prefix}X`);
  const rawY = drawioStyleValue(style, `${prefix}Y`);
  const x = rawX === null ? Number.NaN : Number(rawX);
  const y = rawY === null ? Number.NaN : Number(rawY);
  if (Number.isFinite(x) && x === 0) return "west";
  if (Number.isFinite(x) && x === 1) return "east";
  if (Number.isFinite(y) && y === 0) return "north";
  if (Number.isFinite(y) && y === 1) return "south";
  return undefined;
}

function styleForNode(node: DiagramNode): string {
  const role = (node.role ?? "").toLowerCase();
  const shape = (node.shape ?? "").toLowerCase();
  const visualRole = (node.visualRole ?? "").toLowerCase();
  const fontSize = node.fontSize ?? (node.importanceTier === "primary" ? 15 : node.importanceTier === "annotation" ? 12 : 14);
  if (role === "group") {
    return (
      "rounded=1;whiteSpace=wrap;html=1;arcSize=12;fillColor=#eef2ff;strokeColor=#64748b;" +
      "fontColor=#334155;fontSize=20;fontStyle=1;shadow=0;dashed=1;strokeWidth=1.8;" +
      "fillOpacity=35;verticalAlign=top;align=left;spacing=10;spacingTop=8;" +
      "container=0;collapsible=0;recursiveResize=0;"
    );
  }
  if (role === "divider" || shape === "divider") {
    return "shape=line;html=1;strokeColor=#334155;strokeWidth=2;dashed=1;";
  }
  if (shape === "text") {
    return "text;html=1;strokeColor=none;fillColor=none;fontColor=#334155;fontSize=12;whiteSpace=wrap;rounded=0;shadow=0;";
  }
  if (role === "goodmarker") {
    return "ellipse;whiteSpace=wrap;html=1;fillColor=#dcfce7;strokeColor=#22c55e;fontColor=#166534;fontSize=11;fontStyle=1;shadow=0;";
  }
  if (role === "badmarker") {
    return "ellipse;whiteSpace=wrap;html=1;fillColor=#fee2e2;strokeColor=#ef4444;fontColor=#991b1b;fontSize=11;fontStyle=1;shadow=0;";
  }
  if (shape === "marker" || role === "marker") {
    return "ellipse;whiteSpace=wrap;html=1;fillColor=#e0f2fe;strokeColor=#0ea5e9;fontColor=#18314f;fontSize=11;fontStyle=1;shadow=0;";
  }
  if (shape === "dashedbox" || role === "callout") {
    return "rounded=1;whiteSpace=wrap;html=1;arcSize=12;fillColor=#fff7ed;strokeColor=#f59e0b;fontColor=#18314f;fontSize=13;fontStyle=1;shadow=0;dashed=1;strokeWidth=2;";
  }
  const semanticPalette: Record<string, [string, string]> = {
    input: ["#E8F2F5", "#58727D"],
    standard_component: ["#EAF0F6", "#63758A"],
    tensor_transform: ["#EDE9F4", "#7B6A9A"],
    decision: ["#F4EEDC", "#9A7B3F"],
    proposed: ["#F1D7D4", "#B44948"],
    output: ["#E5F1E3", "#5A8A55"],
    annotation: ["#F8FAFC", "#94A3B8"],
  };
  if (semanticPalette[visualRole]) {
    const [fill, stroke] = semanticPalette[visualRole];
    const strokeWidth = visualRole === "proposed" ? 2.6 : 1.8;
    return `rounded=1;whiteSpace=wrap;html=1;arcSize=20;fillColor=${fill};strokeColor=${stroke};fontColor=#263238;fontSize=${fontSize};fontStyle=1;shadow=0;strokeWidth=${strokeWidth};`;
  }
  if (role === "model") {
    return "rounded=1;whiteSpace=wrap;html=1;arcSize=20;fillColor=#f3e8ff;strokeColor=#a855f7;fontColor=#18314f;fontSize=14;fontStyle=1;shadow=1;";
  }
  if (role === "document" || role === "data") {
    return "rounded=1;whiteSpace=wrap;html=1;arcSize=20;fillColor=#dcfce7;strokeColor=#22c55e;fontColor=#18314f;fontSize=14;fontStyle=1;shadow=1;";
  }
  if (role === "output") {
    return "rounded=1;whiteSpace=wrap;html=1;arcSize=20;fillColor=#e0e7ff;strokeColor=#6366f1;fontColor=#18314f;fontSize=14;fontStyle=1;shadow=1;";
  }
  if (role === "annotation") {
    return "rounded=1;whiteSpace=wrap;html=1;arcSize=12;fillColor=#f1f5f9;strokeColor=#94a3b8;fontColor=#18314f;fontSize=13;fontStyle=1;shadow=0;";
  }
  return "rounded=1;whiteSpace=wrap;html=1;arcSize=20;fillColor=#dbeafe;strokeColor=#3b82f6;fontColor=#18314f;fontSize=14;fontStyle=1;shadow=1;";
}

export function parseDrawioXmlToDiagramPlan(xml: string): DiagramPlan | null {
  const doc = drawioModelDocumentFromXml(xml);
  if (!doc) return null;
  const model = doc.querySelector("mxGraphModel");
  const root = model?.querySelector("root");
  if (!model || !root) return null;

  const width = Number(model.getAttribute("pageWidth")) || 1200;
  const height = Number(model.getAttribute("pageHeight")) || 620;
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const structuralParentById = new Map<string, string>();

  root.querySelectorAll("mxCell").forEach((cell) => {
    const id = cell.getAttribute("id") ?? "";
    if (!id || id === "0" || id === "1") return;
    structuralParentById.set(id, cell.getAttribute("parent") ?? "");
    const geometry = cell.querySelector("mxGeometry");
    const style = cell.getAttribute("style") ?? "";
    const label = stripHtml(cell.getAttribute("value") ?? "");
    if (cell.getAttribute("vertex") === "1") {
      nodes.push({
        id,
        label,
        role: cell.getAttribute("role") ?? roleFromCell(label, style),
        shape: cell.getAttribute("shape") || shapeFromStyle(style),
        groupId: cell.getAttribute("groupId") || null,
        x: numberAttr(geometry, "x", 0),
        y: numberAttr(geometry, "y", 0),
        w: numberAttr(geometry, "width", 140),
        h: numberAttr(geometry, "height", 60),
        storyRole: cell.getAttribute("storyRole") ?? undefined,
        importanceTier: cell.getAttribute("importanceTier") ?? undefined,
        componentStatus: cell.getAttribute("componentStatus") ?? undefined,
        visualUnit: cell.getAttribute("visualUnit") ?? undefined,
        visualRole: cell.getAttribute("visualRole") ?? undefined,
        branchId: cell.getAttribute("branchId"),
        fontSize: Number(cell.getAttribute("fontSize")) || undefined,
      });
    } else if (cell.getAttribute("edge") === "1") {
      const from = cell.getAttribute("source");
      const to = cell.getAttribute("target");
      if (from && to) {
        const sourcePort = drawioPortFromStyle(style, "exit");
        const targetPort = drawioPortFromStyle(style, "entry");
        edges.push({
          id,
          from,
          to,
          label,
          kind: cell.getAttribute("kind") ?? (style.includes("dashed=1") ? "feedback" : "flow"),
          lineStyle: cell.getAttribute("lineStyle") === "dashed" || style.includes("dashed=1")
            ? "dashed"
            : "solid",
          sourcePort,
          targetPort,
          points: Array.from(geometry?.querySelectorAll('Array[as="points"] > mxPoint') ?? []).map((point) => ({
            x: numberAttr(point, "x", 0),
            y: numberAttr(point, "y", 0),
          })),
          routingStyle:
            cell.getAttribute("routingStyle") ||
            drawioStyleValue(style, "edgeStyle") ||
            undefined,
          semanticId: cell.getAttribute("semanticId"),
        });
      }
    }
  });

  if (nodes.length === 0) return null;
  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  const absoluteOriginCache = new Map<string, { x: number; y: number }>();
  const absoluteOrigin = (nodeId: string, seen = new Set<string>()): { x: number; y: number } => {
    const cached = absoluteOriginCache.get(nodeId);
    if (cached) return cached;
    const node = byId.get(nodeId);
    if (!node) return { x: 0, y: 0 };
    let x = node.x;
    let y = node.y;
    const parentId = structuralParentById.get(nodeId);
    if (parentId && byId.has(parentId) && !seen.has(parentId)) {
      const nextSeen = new Set(seen);
      nextSeen.add(nodeId);
      const parentOrigin = absoluteOrigin(parentId, nextSeen);
      x += parentOrigin.x;
      y += parentOrigin.y;
    }
    const origin = { x, y };
    absoluteOriginCache.set(nodeId, origin);
    return origin;
  };
  const absoluteNodes = nodes.map((node) => {
    const origin = absoluteOrigin(node.id);
    const structuralParentId = structuralParentById.get(node.id);
    const groupId = node.groupId ?? (structuralParentId && byId.has(structuralParentId) ? structuralParentId : null);
    return { ...node, groupId, x: origin.x, y: origin.y };
  });
  const absoluteById = new Map(absoluteNodes.map((node) => [node.id, node] as const));
  const routeObstacles = absoluteNodes.filter((node) => !isDiagramGroupNode(node));
  const routedEdges = edges.map((edge) => {
    const source = absoluteById.get(edge.from);
    const target = absoluteById.get(edge.to);
    if (!source || !target) return edge;
    const edgeParent = absoluteById.get(structuralParentById.get(edge.id) ?? "");
    const interiorPoints = (edge.points ?? []).map((point) => edgeParent
      ? { x: point.x + edgeParent.x, y: point.y + edgeParent.y }
      : point);
    const relativePorts = relativePortPair(source, target);
    const sourcePort = edge.sourcePort ?? (
      interiorPoints.length > 0
        ? inferredPortTowardPoint(source, interiorPoints[0])
        : relativePorts[0]
    );
    const targetPort = edge.targetPort ?? (
      interiorPoints.length > 0
        ? inferredPortTowardPoint(target, interiorPoints[interiorPoints.length - 1])
        : relativePorts[1]
    );
    const autoOrthogonal = (edge.routingStyle ?? "").toLowerCase().includes("orthogonal");
    if (interiorPoints.length === 0 && autoOrthogonal) {
      const route = routeOrthogonalPreviewEdge({
        source,
        target,
        sourcePort,
        targetPort,
        obstacles: routeObstacles,
        width,
        height,
      });
      return {
        ...edge,
        sourcePort: route.sourcePort,
        targetPort: route.targetPort,
        points: route.points,
      };
    }
    return {
      ...edge,
      sourcePort,
      targetPort,
      points: [portPoint(source, sourcePort), ...interiorPoints, portPoint(target, targetPort)],
    };
  });
  return { title: "Layout skeleton", width, height, nodes: absoluteNodes, edges: routedEdges };
}

export function diagramPlanToDrawioXml(plan: DiagramPlan): string {
  const cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  const orderedNodes = [...plan.nodes].sort((left, right) =>
    Number(isDiagramGroupNode(right)) - Number(isDiagramGroupNode(left)),
  );
  for (const node of orderedNodes) {
    cells.push(
        `<mxCell id="${escapeXml(node.id)}" value="${escapeXml(node.label)}" role="${escapeXml(node.role ?? "process")}" shape="${escapeXml(node.shape ?? "")}" groupId="${escapeXml(node.groupId ?? "")}" storyRole="${escapeXml(node.storyRole ?? "")}" importanceTier="${escapeXml(node.importanceTier ?? "")}" componentStatus="${escapeXml(node.componentStatus ?? "")}" visualUnit="${escapeXml(node.visualUnit ?? "")}" visualRole="${escapeXml(node.visualRole ?? "")}" branchId="${escapeXml(node.branchId ?? "")}" fontSize="${node.fontSize ?? ""}" style="${styleForNode(node)}" vertex="1" parent="1">` +
        `<mxGeometry x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" as="geometry"/></mxCell>`,
    );
  }
  for (const edge of plan.edges) {
    const isDashed = edge.lineStyle === "dashed" || (!edge.lineStyle && edge.kind === "feedback");
    const dashed = isDashed ? "dashed=1;strokeColor=#6B7280;" : "strokeColor=#263238;";
    const portValues = {
      west: [0, 0.5],
      east: [1, 0.5],
      north: [0.5, 0],
      south: [0.5, 1],
    } as const;
    const sourcePort = edge.sourcePort ? portValues[edge.sourcePort] : null;
    const targetPort = edge.targetPort ? portValues[edge.targetPort] : null;
    const portStyle =
      `${sourcePort ? `exitX=${sourcePort[0]};exitY=${sourcePort[1]};exitPerimeter=1;` : ""}` +
      `${targetPort ? `entryX=${targetPort[0]};entryY=${targetPort[1]};entryPerimeter=1;` : ""}`;
    const waypointXml = (edge.points ?? [])
      .slice(1, -1)
      .map((point) => `<mxPoint x="${point.x}" y="${point.y}"/>`)
      .join("");
    const geometry = waypointXml
      ? `<mxGeometry relative="1" as="geometry"><Array as="points">${waypointXml}</Array></mxGeometry>`
      : `<mxGeometry relative="1" as="geometry"/>`;
    const edgeStyle = (edge.points?.length ?? 0) > 2 ? "edgeStyle=none" : "edgeStyle=orthogonalEdgeStyle";
    cells.push(
      `<mxCell id="${escapeXml(edge.id)}" value="${escapeXml(edge.label ?? "")}" kind="${escapeXml(edge.kind ?? "flow")}" lineStyle="${isDashed ? "dashed" : "solid"}" routingStyle="${escapeXml(edge.routingStyle ?? "")}" semanticId="${escapeXml(edge.semanticId ?? "")}" ` +
        `style="${edgeStyle};rounded=1;html=1;endArrow=block;strokeWidth=1.8;fontSize=11;${portStyle}${dashed}" edge="1" parent="1" ` +
        `source="${escapeXml(edge.from)}" target="${escapeXml(edge.to)}">${geometry}</mxCell>`,
    );
  }
  return (
    `<mxGraphModel dx="900" dy="640" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" ` +
    `fold="1" page="1" pageScale="1" pageWidth="${plan.width}" pageHeight="${plan.height}" math="0" shadow="0">` +
    `<root>${cells.join("")}</root></mxGraphModel>`
  );
}
