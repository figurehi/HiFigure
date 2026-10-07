/**
 * Parses backend image-generation prompts into UI-friendly sections.
 *
 * Canonical prompts use ALL-CAPS one-line headings (SUBJECT, FIGURE STRUCTURE…);
 * relayout prompts use compact labels like New layout:/Rules:
 */

export type ImagePromptSection = {
  id: string;
  label: string;
  body: string;
};

const CANON_HEADINGS_EXACT = new Set([
  "SUBJECT",
  "FIGURE STRUCTURE",
  "LAYOUT",
  "REFERENCE IMAGES",
  "VISUAL STYLE",
  "OUTPUT RULES",
]);

function slugify(label: string, index: number): string {
  const base = label
    .replace(/:$/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return base || `section-${index}`;
}

type HeadingPick = {
  summaryLabel: string;
  seedBody: string[];
};

function classifyHeading(trimmedLine: string, rawLine: string): HeadingPick | null {
  if (!trimmedLine) return null;

  if (CANON_HEADINGS_EXACT.has(trimmedLine)) {
    return { summaryLabel: trimmedLine, seedBody: [] };
  }

  if (
    /^CONTENT ANALYSIS \(from\b/.test(trimmedLine) ||
    /^CONTENT ANALYSIS:\s*\(Planner\b/i.test(trimmedLine)
  ) {
    return { summaryLabel: "CONTENT ANALYSIS", seedBody: [rawLine] };
  }

  if (trimmedLine.startsWith("New layout:")) {
    return { summaryLabel: "NEW LAYOUT", seedBody: [rawLine] };
  }

  if (trimmedLine === "Rules:" || trimmedLine === "Rules") {
    return { summaryLabel: "RULES", seedBody: [] };
  }

  return null;
}

/** Compact tab label for segmented prompt UI */
export function segmentShortTitle(label: string): string {
  const upper = label.toUpperCase();

  switch (upper) {
    case "INTRO":
      return "Intro";
    case "SUBJECT":
      return "Subject";
    case "FIGURE STRUCTURE":
      return "Layout";
    case "LAYOUT":
      return "Layout";
    case "CONTENT ANALYSIS":
      return "Content";
    case "REFERENCE IMAGES":
      return "References";
    case "VISUAL STYLE":
      return "Style";
    case "OUTPUT RULES":
      return "Output";
    case "NEW LAYOUT":
      return "Relayout";
    case "RULES":
      return "Rules";
    case "FULL PROMPT":
      return "Full";
    default:
      return label.length > 16 ? `${label.slice(0, 14)}…` : label;
  }
}

/** Split into labelled blocks; fallback to one section when no headings are found. */
export function splitImageGenerationPrompt(raw: string): ImagePromptSection[] {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const lines = text.split("\n");
  type Cur = { label: string; body: string[] };
  const out: ImagePromptSection[] = [];

  let sawHeading = false;
  let prelude: string[] = [];
  let cur: Cur | null = null;

  function closeCurrent() {
    if (!cur) return;
    const body = cur.body.join("\n").trimEnd();
    if (body.trim()) {
      out.push({ id: slugify(cur.label, out.length), label: cur.label, body });
    }
    cur = null;
  }

  for (const line of lines) {
    const t = line.trim();
    const hd = classifyHeading(t, line);
    if (hd) {
      sawHeading = true;
      if (!cur && prelude.length) {
        const intro = prelude.join("\n").trimEnd();
        if (intro.trim()) {
          out.push({ id: "intro", label: "Intro", body: intro });
        }
        prelude = [];
      } else closeCurrent();

      cur = { label: hd.summaryLabel, body: [...hd.seedBody] };
      continue;
    }

    if (!sawHeading) {
      prelude.push(line);
    } else if (cur) {
      cur.body.push(line);
    }
  }

  closeCurrent();

  if (!sawHeading || out.length === 0) {
    return [{ id: "full", label: "Full prompt", body: text }];
  }

  const used = new Set<string>();
  return out.map((sec, idx) => {
    let id = slugify(sec.label, idx);
    if (used.has(id)) id = `${id}-${idx}`;
    used.add(id);
    return { id, label: sec.label, body: sec.body };
  });
}
