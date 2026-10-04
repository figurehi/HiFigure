import {
  scientificIconReferences,
  type ScientificIconCategory,
  type ScientificIconReference,
  type ScientificIconReferenceId,
  type ScientificIconSource,
} from "./scientific-assets";

export type IconRecommendationInput = {
  label: string;
  role?: string;
  group?: string;
};

export type ScientificIconSearchOptions = {
  query?: string;
  category?: ScientificIconCategory | "all";
  source?: ScientificIconSource | "all";
  offset?: number;
  limit?: number;
};

export type ScientificIconSearchPage = {
  items: ScientificIconReference[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
};

const SOURCE_PRIORITY: Record<ScientificIconSource, number> = {
  tabler: 0,
  carbon: 1,
  healthicons: 2,
  phosphor: 3,
  iconoir: 4,
  hichart: 5,
  bioicons: 6,
};

const CATEGORY_HINTS: Record<ScientificIconCategory, string[]> = {
  "ai-ml": ["ai", "agent", "attention", "embedding", "language", "learning", "model", "neural", "prompt", "token", "training", "transformer"],
  "data-retrieval": ["archive", "corpus", "data", "database", "document", "filter", "index", "query", "retrieval", "search", "table", "vector"],
  "computer-vision": ["camera", "detection", "feature", "image", "mask", "object", "photo", "pixel", "scan", "segmentation", "video", "vision"],
  biology: ["biology", "blood", "cell", "dna", "experiment", "gene", "lab", "medical", "microscope", "molecule", "protein", "sample", "tissue"],
  systems: ["api", "branch", "cloud", "code", "compute", "device", "flow", "network", "pipeline", "server", "system", "workflow"],
  evaluation: ["analytics", "benchmark", "chart", "confidence", "distribution", "evaluation", "metric", "plot", "score", "test", "uncertainty"],
  general: ["annotation", "communication", "group", "human", "layout", "person", "time", "user", "warning"],
};

const RECOMMENDATION_STOP_TERMS = new Set([
  "block",
  "component",
  "module",
  "part",
  "stage",
  "step",
]);

function normalizeText(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function terms(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .filter((term) => term.length > 1);
}

type SearchDocument = {
  icon: ScientificIconReference;
  index: number;
  normalizedId: string;
  normalizedLabel: string;
  labelTerms: Set<string>;
  keywordTerms: Set<string>;
  aliasTerms: Set<string>;
  descriptionTerms: Set<string>;
  searchable: string;
};

const searchDocuments: SearchDocument[] = scientificIconReferences.map((icon, index) => {
  const normalizedId = normalizeText(icon.id.replace(":", " "));
  const normalizedLabel = normalizeText(icon.label);
  const keywordTerms = new Set(icon.keywords.flatMap(terms));
  const aliasTerms = new Set(icon.aliases.flatMap(terms));
  const descriptionTerms = new Set(terms(icon.description));
  return {
    icon,
    index,
    normalizedId,
    normalizedLabel,
    labelTerms: new Set(terms(icon.label)),
    keywordTerms,
    aliasTerms,
    descriptionTerms,
    searchable: normalizeText([
      icon.id,
      icon.label,
      icon.role,
      icon.category,
      icon.source,
      icon.description,
      ...icon.keywords,
      ...icon.aliases,
    ].join(" ")),
  };
});

function searchTermScore(document: SearchDocument, term: string): number {
  if (document.labelTerms.has(term)) return 12;
  if (document.normalizedId.split(" ").includes(term)) return 10;
  if (document.keywordTerms.has(term)) return 8;
  if (document.aliasTerms.has(term)) return 7;
  if (document.normalizedLabel.includes(term)) return 5;
  if (document.keywordTerms.size > 0 && [...document.keywordTerms].some((keyword) => keyword.includes(term))) return 4;
  if (document.descriptionTerms.has(term)) return 2;
  if (document.searchable.includes(term)) return 1;
  return 0;
}

function searchDocumentScore(document: SearchDocument, query: string, queryTerms: string[]): number | null {
  if (queryTerms.length === 0) return document.index === 0 ? 0 : -document.index / 100_000;
  let score = 0;
  for (const term of queryTerms) {
    const termScore = searchTermScore(document, term);
    if (termScore === 0) return null;
    score += termScore;
  }
  const normalizedQuery = normalizeText(query);
  if (normalizedQuery === document.normalizedLabel) score += 40;
  else if (document.normalizedLabel.startsWith(normalizedQuery)) score += 18;
  if (document.normalizedId.endsWith(normalizedQuery)) score += 14;
  return score;
}

function stableIconSort(
  a: { document: SearchDocument; score: number },
  b: { document: SearchDocument; score: number },
) {
  return b.score - a.score
    || SOURCE_PRIORITY[a.document.icon.source] - SOURCE_PRIORITY[b.document.icon.source]
    || a.document.icon.label.localeCompare(b.document.icon.label)
    || a.document.icon.id.localeCompare(b.document.icon.id);
}

export function recommendScientificIcons(
  input: IconRecommendationInput,
  limit = 5,
): ScientificIconReference[] {
  const normalizedLabel = normalizeText(input.label);
  const labelTerms = terms(input.label).filter((term) => !RECOMMENDATION_STOP_TERMS.has(term));
  const contextTerms = terms(`${input.group ?? ""} ${input.role ?? ""}`)
    .filter((term) => !RECOMMENDATION_STOP_TERMS.has(term));
  if (!normalizedLabel || labelTerms.length === 0) return [];

  const inferredCategories = new Set<ScientificIconCategory>();
  for (const [category, hints] of Object.entries(CATEGORY_HINTS) as [ScientificIconCategory, string[]][]) {
    if ([...labelTerms, ...contextTerms].some((term) => hints.includes(term))) inferredCategories.add(category);
  }

  return searchDocuments
    .map((document) => {
      let semanticMatches = 0;
      let score = 0;
      for (const term of labelTerms) {
        const termScore = searchTermScore(document, term);
        if (termScore >= 4) semanticMatches += 1;
        score += termScore;
      }
      for (const term of contextTerms) {
        score += Math.min(searchTermScore(document, term), 4);
      }
      if (normalizedLabel === document.normalizedLabel) {
        semanticMatches += 1;
        score += 50;
      } else if (document.normalizedLabel.includes(normalizedLabel)) {
        semanticMatches += 1;
        score += 16;
      }
      if (input.role && document.icon.role === input.role) score += 3;
      if (inferredCategories.has(document.icon.category)) score += 4;
      return { document, score, semanticMatches };
    })
    // Role and category are only tie-breakers. They must never create a recommendation alone.
    .filter(({ semanticMatches }) => semanticMatches > 0)
    .sort(stableIconSort)
    .slice(0, Math.max(0, Math.min(limit, 12)))
    .map(({ document }) => document.icon);
}

/**
 * Deterministic, bounded catalog search for virtualized or "load more" UIs.
 * It never performs a network request and caps each page at 100 SVGs.
 */
export function searchScientificIcons(options: ScientificIconSearchOptions = {}): ScientificIconSearchPage {
  const query = options.query?.trim() ?? "";
  const queryTerms = terms(query);
  const category = options.category ?? "all";
  const source = options.source ?? "all";
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 72)));

  const matches = searchDocuments
    .filter(({ icon }) => category === "all" || icon.category === category)
    .filter(({ icon }) => source === "all" || icon.source === source)
    .map((document) => ({ document, score: searchDocumentScore(document, query, queryTerms) }))
    .filter((match): match is { document: SearchDocument; score: number } => match.score !== null)
    .sort(stableIconSort);
  const items = matches.slice(offset, offset + limit).map(({ document }) => document.icon);
  const nextOffset = offset + items.length;
  return {
    items,
    total: matches.length,
    offset,
    limit,
    hasMore: nextOffset < matches.length,
    nextOffset: nextOffset < matches.length ? nextOffset : null,
  };
}

/** Backward-compatible unbounded filter used by existing icon pickers. */
export function filterScientificIcons(
  query: string,
  category: ScientificIconCategory | "all" = "all",
): ScientificIconReference[] {
  const queryTerms = terms(query);
  return searchDocuments
    .filter(({ icon }) => category === "all" || icon.category === category)
    .map((document) => ({ document, score: searchDocumentScore(document, query, queryTerms) }))
    .filter((match): match is { document: SearchDocument; score: number } => match.score !== null)
    .sort(stableIconSort)
    .map(({ document }) => document.icon);
}

export function normalizeRecentIconIds(ids: ScientificIconReferenceId[]): ScientificIconReferenceId[] {
  const available = new Set(scientificIconReferences.map((icon) => icon.id));
  return Array.from(new Set(ids)).filter((id) => available.has(id)).slice(0, 12);
}
