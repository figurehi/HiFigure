import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(here, "..");
const outputPath = resolve(frontendRoot, "lib/icon-catalog.generated.ts");
const catalogMetaPath = resolve(frontendRoot, "lib/icon-catalog-meta.ts");

const catalogMetaSource = readFileSync(catalogMetaPath, "utf8");
const catalogVersionMatch = catalogMetaSource.match(/SCIENTIFIC_ICON_CATALOG_VERSION\s*=\s*["']([^"']+)["']/);
if (!catalogVersionMatch) throw new Error(`Missing catalog version in ${catalogMetaPath}`);
const CATALOG_VERSION = catalogVersionMatch[1];

const sourceDefinitions = {
  tabler: {
    packageName: "@iconify-json/tabler",
    source: "tabler",
    sourceUrl: "https://github.com/tabler/tabler-icons",
    license: "MIT",
    licenseUrl: "https://github.com/tabler/tabler-icons/blob/main/LICENSE",
    author: "Paweł Kuna and Tabler Icons contributors",
    attribution: "Tabler Icons, used under the MIT License.",
  },
  carbon: {
    packageName: "@iconify-json/carbon",
    source: "carbon",
    sourceUrl: "https://github.com/carbon-design-system/carbon/tree/main/packages/icons",
    license: "Apache-2.0",
    licenseUrl: "https://github.com/carbon-design-system/carbon/blob/main/LICENSE",
    author: "IBM and Carbon Design System contributors",
    attribution: "Carbon icons, used under the Apache License 2.0.",
  },
  healthicons: {
    packageName: "@iconify-json/healthicons",
    source: "healthicons",
    sourceUrl: "https://github.com/resolvetosavelives/healthicons",
    // The artwork is explicitly dedicated to the public domain in the upstream README.
    // The repository code and Iconify packaging remain MIT; see THIRD_PARTY_NOTICES.md.
    license: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    author: "Resolve to Save Lives and Health Icons contributors",
    attribution: "Health Icons public-domain artwork (CC0 1.0); credit is appreciated but not required.",
  },
  phosphor: {
    packageName: "@iconify-json/ph",
    source: "phosphor",
    sourceUrl: "https://github.com/phosphor-icons/core",
    license: "MIT",
    licenseUrl: "https://github.com/phosphor-icons/core/blob/main/LICENSE",
    author: "Phosphor Icons contributors",
    attribution: "Phosphor Icons, used under the MIT License.",
  },
  iconoir: {
    packageName: "@iconify-json/iconoir",
    source: "iconoir",
    sourceUrl: "https://github.com/iconoir-icons/iconoir",
    license: "MIT",
    licenseUrl: "https://github.com/iconoir-icons/iconoir/blob/main/LICENSE",
    author: "Luca Burgio and Iconoir contributors",
    attribution: "Iconoir icons, used under the MIT License.",
  },
};

const categoryDefinitions = [
  {
    category: "ai-ml",
    quotas: { tabler: 38, carbon: 45, healthicons: 0, phosphor: 14, iconoir: 15 },
    terms: [
      "ai", "agent", "artificial-intelligence", "automation", "binary", "brain", "chat", "focus", "generate",
      "input", "language", "learning", "machine-learning", "model", "neural", "prediction", "prompt",
      "recommend", "robot", "subtitles", "token", "training", "transform", "wand",
    ],
    preferred: [
      "ai", "ai-agent", "brain", "robot", "automation", "image-generation", "message-chatbot", "binary",
      "box-model", "focus", "input-ai", "text-scan-ai", "file-text-ai", "settings-automation",
      "machine-learning", "machine-learning-model", "foundation-model", "model", "model-alt",
      "ai-agent-invocation", "ai-generate", "ai-recommend", "ai-observability", "nlp",
    ],
    aliases: ["artificial intelligence", "machine learning", "neural model", "generative ai"],
  },
  {
    category: "data-retrieval",
    quotas: { tabler: 45, carbon: 40, healthicons: 4, phosphor: 22, iconoir: 18 },
    terms: [
      "archive", "book", "catalog", "collection", "corpus", "data", "database", "document",
      "file", "filter", "folder", "graph", "index", "knowledge", "metadata", "query", "record",
      "retrieve", "search", "storage", "table", "vector",
    ],
    preferred: [
      "database", "database-search", "database-import", "database-export", "file-search", "folder-search",
      "search", "filter", "table", "vector", "graph", "books", "archive", "data-base", "data-reference",
      "data-structured", "data-unstructured", "document", "query", "catalog", "search-advanced",
    ],
    aliases: ["retrieval", "information retrieval", "vector store", "knowledge base"],
  },
  {
    category: "computer-vision",
    quotas: { tabler: 30, carbon: 22, healthicons: 6, phosphor: 18, iconoir: 20 },
    terms: [
      "3d", "bounding", "camera", "capture", "crop", "cube", "detection", "eye", "feature",
      "focus", "frame", "grid", "image", "mask", "object", "photo", "pixel", "scan",
      "segmentation", "video", "vision",
    ],
    preferred: [
      "camera", "camera-ai", "photo", "photo-scan", "object-scan", "scan", "scan-eye", "scan-cube",
      "bounding-box", "box-model", "cube-3d-sphere", "video", "image", "image-search", "image-medical",
      "3d-cursor", "3d-print-mesh", "view", "crop", "ultrasound-scanner",
    ],
    aliases: ["computer vision", "visual input", "image analysis", "object detection"],
  },
  {
    category: "biology",
    quotas: { tabler: 16, carbon: 14, healthicons: 56, phosphor: 14, iconoir: 8 },
    terms: [
      "anatomy", "antibody", "bacteria", "bio", "biomarker", "blood", "cell", "chemistry",
      "clinical", "culture", "dna", "drug", "experiment", "fish", "flask", "gene", "genome", "lab",
      "heart", "kidney", "liver", "lung", "medical", "medication", "microscope", "molecule", "organ", "petri",
      "pill", "pipette", "protein", "sample", "specimen", "surgery", "syringe", "test-tube", "tissue", "virus",
    ],
    preferred: [
      "dna", "dna-2", "microscope", "molecule", "atom", "flask", "test-pipe", "vaccine", "cell",
      "chemistry", "microscope", "dna", "medication", "pills", "coronavirus", "fish", "biomarker", "bio-pharma", "blood-cells",
      "biochemistry-laboratory", "hematology-laboratory", "petri-dish", "pipette", "test-tubes",
      "virus-research", "microscope-with-specimen", "sample", "tissue",
    ],
    aliases: ["life science", "wet lab", "biomedical", "experimental sample"],
  },
  {
    category: "systems",
    quotas: { tabler: 42, carbon: 30, healthicons: 5, phosphor: 22, iconoir: 18 },
    terms: [
      "api", "branch", "cache", "chip", "cloud", "code", "compute", "cpu", "device", "flow",
      "git", "integration", "merge", "network", "node", "pipeline", "plug", "router", "server",
      "service", "settings", "terminal", "tool", "workflow",
    ],
    preferred: [
      "server", "server-2", "network", "cloud-network", "cpu", "device-desktop", "device-mobile",
      "api", "code", "terminal", "git-branch", "git-merge", "route", "router", "settings", "tools",
      "workflow", "flow", "network-1", "network-3", "cloud-service-management", "edge-node",
    ],
    aliases: ["system architecture", "computing", "network service", "software pipeline"],
  },
  {
    category: "evaluation",
    quotas: { tabler: 34, carbon: 22, healthicons: 10, phosphor: 18, iconoir: 12 },
    terms: [
      "analytics", "benchmark", "chart", "check", "compare", "confidence", "distribution", "error",
      "evaluation", "gauge", "histogram", "measure", "metric", "percentage", "plot", "report",
      "scale", "score", "statistics", "target", "test", "trend", "uncertainty",
    ],
    preferred: [
      "chart-bar", "chart-line", "chart-dots", "chart-scatter", "chart-histogram", "chart-infographic",
      "gauge", "target", "percentage", "scale", "report-analytics", "chart-evaluation", "chart-multitype",
      "chart-relationship", "data-error", "meter", "result", "analytics", "chart-bar",
    ],
    aliases: ["evaluation result", "performance metric", "statistical analysis", "benchmark"],
  },
  {
    category: "general",
    quotas: { tabler: 34, carbon: 18, healthicons: 12, phosphor: 20, iconoir: 22 },
    terms: [
      "arrow", "calendar", "clock", "communication", "group", "help", "hierarchy", "human", "idea",
      "layout", "lightbulb", "link", "lock", "message", "palette", "person", "question", "shield",
      "tag", "team", "timeline", "user", "warning",
    ],
    preferred: [
      "users", "user", "users-group", "hierarchy", "layout", "palette", "bulb", "clock", "calendar",
      "message", "help", "question-mark", "lock", "shield", "warning", "link", "timeline", "group",
      "user-multiple", "communication", "community-meeting", "person",
    ],
    aliases: ["general diagram", "people", "communication", "annotation"],
  },
];

// Weight/fill variants (Phosphor -bold/-duotone/…, Iconoir -solid) are excluded so
// the catalog only ships each glyph once, in the regular outline weight.
const disallowedName = /(^|-)\d+px$|(^|-)outline$|(^|-)negative$|(^|-)filled$|(^|-)off$|(^|-)disabled$|(^|-)logo($|-)|(^|-)brand($|-)|(^|-)currency($|-)|(^|-)reference$|(^|-)dash$|-(?:bold|duotone|fill|light|thin|solid)$/;
const disallowedProduct = /(^|-)(ibm|watson|aws|azure|google|microsoft|red-hat|sap|facebook|instagram|twitter|youtube|github|gitlab|npm|figma|adobe|apple|android|windows|linux|chrome|firefox|safari|edge|opera|tiktok|linkedin|telegram|whatsapp|discord|slack|dropbox|paypal|amazon|meta|openai|reddit|soundcloud|spotify|threads|x)(-|$)/;
const disallowedSvg = [
  /<\s*script\b/i,
  /<\s*(?:foreignObject|iframe|object|embed|image|use|style|font)\b/i,
  /\bon[a-z]+\s*=/i,
  /\b(?:href|xlink:href)\s*=/i,
  /\burl\s*\(/i,
  /<!DOCTYPE/i,
  /<\?xml/i,
];

function loadSource(key) {
  const definition = sourceDefinitions[key];
  const packageRoot = resolve(frontendRoot, "node_modules", ...definition.packageName.split("/"));
  const packageJson = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
  const info = JSON.parse(readFileSync(resolve(packageRoot, "info.json"), "utf8"));
  const iconSet = JSON.parse(readFileSync(resolve(packageRoot, "icons.json"), "utf8"));
  return {
    ...definition,
    packageVersion: packageJson.version,
    sourceVersion: info.version,
    iconSet,
  };
}

function cleanName(name) {
  return name
    .replace(/-(?:24px|32px|16px)$/g, "")
    .replace(/-(?:outline|negative|filled|off|disabled)$/g, "");
}

function candidateScore(name, definition) {
  if (name.length < 2 || /^\d+$/.test(name) || disallowedName.test(name) || disallowedProduct.test(name)) {
    return Number.NEGATIVE_INFINITY;
  }
  const normalized = cleanName(name);
  const tokens = normalized.split("-");
  let score = 0;
  definition.preferred.forEach((preferred, index) => {
    if (normalized === preferred) score += 1_000 - index;
    else if (normalized.startsWith(`${preferred}-`)) score += 180 - index;
  });
  for (const term of definition.terms) {
    if (normalized === term) score += 180;
    else if (normalized.startsWith(`${term}-`)) score += 90;
    else if (normalized.endsWith(`-${term}`)) score += 70;
    else if (tokens.includes(term)) score += 55;
    else if (term.length >= 5 && normalized.includes(term)) score += 20;
  }
  if (score === 0) return Number.NEGATIVE_INFINITY;
  return score - tokens.length * 2 - normalized.length / 40;
}

function categoryCandidateAllowed(source, category, name) {
  if (category === "ai-ml" && /^(?:mail|battery|flag|home|heart|phone)-|language-(?:hiragana|katakana)|transform-point|-spark$/.test(name)) return false;
  if (category === "biology" && /cell-tower|spine-label|generate-pdf|collaborate/.test(name)) return false;
  if (category === "systems" && source === "healthicons" && /lymph|blood|organ|patient/.test(name)) return false;
  if (category === "general" && /meetingx\d|(?:^|-)x\d$/.test(name)) return false;
  if (category === "general" && /resoruces/.test(name)) return false;
  if (category === "computer-vision" && /scan-letter/.test(name)) return false;
  if (category === "evaluation" && /^(?:percentage|error)-\d/.test(name)) return false;
  if (category === "biology" && /^blood-(?:a|b|o|ab|rh)-(?:n|p)$/.test(name)) return false;
  return true;
}

function iconFamily(name) {
  const tokens = cleanName(name).split("-").filter((token) => !/^\d+$/.test(token));
  if (tokens[0] === "ai" && ["results", "status", "governance"].includes(tokens[1])) return `ai-${tokens[1]}`;
  if (tokens[0] === "chart") return `chart-${tokens[1] ?? "base"}`;
  if (tokens[0] === "data") return `data-${tokens[1] ?? "base"}`;
  return tokens[0] ?? name;
}

function familyLimit(family) {
  if (["percentage", "label", "collaborate"].includes(family)) return 1;
  if (["pill", "pills"].includes(family)) return 2;
  if (["ai-results", "ai-status", "ai-governance", "cell", "clock", "calendar", "message", "user"].includes(family)) return 3;
  if (["camera", "device", "server"].includes(family)) return 5;
  if (["database", "blood", "virus"].includes(family)) return 10;
  return 7;
}

function sanitizeSvgBody(body, id) {
  for (const pattern of disallowedSvg) {
    if (pattern.test(body)) throw new Error(`Unsafe SVG content in ${id}: ${pattern}`);
  }
  return body.replace(/\s+/g, " ").trim();
}

function titleCase(name) {
  const replacements = new Map([
    ["ai", "AI"], ["api", "API"], ["cpu", "CPU"], ["dna", "DNA"], ["ml", "ML"],
    ["nlp", "NLP"], ["3d", "3D"], ["2d", "2D"], ["db", "DB"],
  ]);
  return name
    .split("-")
    .map((token) => replacements.get(token) ?? `${token.charAt(0).toUpperCase()}${token.slice(1)}`)
    .join(" ");
}

function inferRole(category, name) {
  if (/warning|shield|secure|safety|error/.test(name)) return "safety";
  if (/user|person|human|agent|team|group/.test(name)) return "agent";
  if (/chart|plot|analytics|metric|score|gauge|target|report|statistics|distribution|percentage/.test(name)) return "metric";
  if (/document|book|citation|paper|question|answer/.test(name)) return "paper";
  if (category === "biology") return "science";
  if (/database|data|file|folder|image|photo|video|table|vector|sample|record/.test(name)) return "data";
  if (category === "ai-ml" || /model|learning|brain|neural|classifier|prediction/.test(name)) return "model";
  if (/flow|pipeline|branch|merge|search|filter|query|transform|training|workflow|arrow/.test(name)) return "process";
  return "system";
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function renderCatalogSvg({ body, width, height, label, source, role }) {
  const safeLabel = escapeXml(label);
  // Keep the catalog asset glyph-only. Card backgrounds and labels belong to the
  // React picker; baking them into every SVG makes distinct icons look like the
  // same small white card once thumbnails are reduced.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${safeLabel}" data-hichart-source="${source}" data-hichart-role="${role}" color="#1f3b73">${body}</svg>`;
}

function keywordMetadata(name, definition) {
  const tokens = cleanName(name).split("-").filter((token) => token.length > 1);
  const expansions = [];
  if (tokens.includes("ai")) expansions.push("artificial intelligence");
  if (tokens.includes("ml")) expansions.push("machine learning");
  if (tokens.includes("dna")) expansions.push("genomics", "genetic sequence");
  if (tokens.includes("3d")) expansions.push("three dimensional");
  if (tokens.includes("api")) expansions.push("application programming interface");
  const keywords = [...new Set([...tokens, ...definition.terms.filter((term) => name.includes(term)).slice(0, 5), ...expansions])];
  const aliases = [...new Set([cleanName(name).replaceAll("-", " "), ...definition.aliases, ...expansions])];
  return { keywords: keywords.slice(0, 12), aliases: aliases.slice(0, 8) };
}

const loadedSources = Object.fromEntries(Object.keys(sourceDefinitions).map((key) => [key, loadSource(key)]));
const selectedKeys = new Set();
const records = [];

for (const categoryDefinition of categoryDefinitions) {
  for (const [sourceKey, quota] of Object.entries(categoryDefinition.quotas)) {
    if (quota === 0) continue;
    const source = loadedSources[sourceKey];
    const candidates = Object.keys(source.iconSet.icons)
      .filter((name) => !selectedKeys.has(`${sourceKey}:${name}`))
      .filter((name) => categoryCandidateAllowed(sourceKey, categoryDefinition.category, name))
      .map((name) => ({ name, score: candidateScore(name, categoryDefinition) }))
      .filter(({ score }) => Number.isFinite(score))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const familyCounts = new Map();
    const chosen = [];
    for (const candidate of candidates) {
      const family = iconFamily(candidate.name);
      const used = familyCounts.get(family) ?? 0;
      if (used >= familyLimit(family)) continue;
      familyCounts.set(family, used + 1);
      chosen.push(candidate);
      if (chosen.length === quota) break;
    }
    if (chosen.length < quota) {
      throw new Error(`${sourceKey}/${categoryDefinition.category} only has ${chosen.length} diverse candidates for quota ${quota}`);
    }
    for (const { name } of chosen) {
      selectedKeys.add(`${sourceKey}:${name}`);
      const icon = source.iconSet.icons[name];
      const body = sanitizeSvgBody(icon.body, `${sourceKey}:${name}`);
      const width = icon.width ?? source.iconSet.width ?? source.iconSet.height ?? 24;
      const height = icon.height ?? source.iconSet.height ?? source.iconSet.width ?? 24;
      const label = titleCase(cleanName(name));
      const role = inferRole(categoryDefinition.category, name);
      const searchMetadata = keywordMetadata(name, categoryDefinition);
      records.push({
        id: `${source.source}:${name}`,
        label,
        role,
        description: `${label} symbol for ${categoryDefinition.category.replaceAll("-", " ")} scientific diagrams.`,
        category: categoryDefinition.category,
        ...searchMetadata,
        source: source.source,
        sourceId: name,
        sourceVersion: source.sourceVersion,
        sourceUrl: source.sourceUrl,
        license: source.license,
        licenseUrl: source.licenseUrl,
        author: source.author,
        attribution: source.attribution,
        svg: renderCatalogSvg({ body, width, height, label, source: source.source, role }),
      });
    }
  }
}

const externalIconTarget = categoryDefinitions.reduce(
  (total, definition) => total + Object.values(definition.quotas).reduce((sum, quota) => sum + quota, 0),
  0,
);
if (records.length !== externalIconTarget) {
  throw new Error(`Expected ${externalIconTarget} external icons, generated ${records.length}`);
}
if (new Set(records.map((record) => record.id)).size !== records.length) {
  throw new Error("Generated icon IDs must be unique");
}

const sourceManifest = Object.fromEntries(Object.entries(loadedSources).map(([key, source]) => [key, {
  source: source.source,
  sourceVersion: source.sourceVersion,
  packageName: source.packageName,
  packageVersion: source.packageVersion,
  packageLicense: source.packageName === "@iconify-json/healthicons" ? "MIT" : source.license,
  license: source.license,
  count: records.filter((record) => record.source === source.source).length,
}]));

const output = `/* eslint-disable */\n// Generated by scripts/generate-scientific-icon-catalog.mjs for catalog ${CATALOG_VERSION}. Do not edit by hand.\n\nexport const externalScientificIconSourceManifest = ${JSON.stringify(sourceManifest, null, 2)} as const;\n\nexport const externalScientificIconRecords = ${JSON.stringify(records, null, 2)} as const;\n`;
writeFileSync(outputPath, output, "utf8");
console.log(`Generated ${records.length} external scientific icons at ${outputPath}`);
