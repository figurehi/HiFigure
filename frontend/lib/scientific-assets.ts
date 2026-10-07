import {
  externalScientificIconRecords,
  externalScientificIconSourceManifest,
} from "./icon-catalog.generated";
import { SCIENTIFIC_ICON_CATALOG_VERSION } from "./icon-catalog-meta";

export { SCIENTIFIC_ICON_CATALOG_VERSION } from "./icon-catalog-meta";

/** Namespaced external IDs and all legacy IDs are intentionally supported. */
export type ScientificIconReferenceId = string;

export type ScientificIconCategory =
  | "ai-ml"
  | "data-retrieval"
  | "computer-vision"
  | "biology"
  | "systems"
  | "evaluation"
  | "general";

export type ScientificIconSource = "hichart" | "tabler" | "carbon" | "healthicons" | "phosphor" | "iconoir" | "bioicons";

export type ScientificIconReference = {
  id: ScientificIconReferenceId;
  label: string;
  role:
    | "agent"
    | "data"
    | "model"
    | "metric"
    | "process"
    | "paper"
    | "safety"
    | "system"
    | "science";
  description: string;
  category: ScientificIconCategory;
  keywords: string[];
  aliases: string[];
  source: ScientificIconSource;
  sourceId: string;
  sourceVersion: string;
  sourceUrl: string;
  license: "Project-authored" | "MIT" | "Apache-2.0" | "BSD-2-Clause" | "BSD-3-Clause" | "CC0-1.0";
  licenseUrl: string;
  author: string;
  attribution: string;
  /** Sanitized, self-contained SVG. Never references a runtime CDN or external resource. */
  svg: string;
};

type LegacyScientificIconReference = Omit<
  ScientificIconReference,
  | "category"
  | "keywords"
  | "aliases"
  | "source"
  | "sourceId"
  | "sourceVersion"
  | "sourceUrl"
  | "license"
  | "licenseUrl"
  | "author"
  | "attribution"
  | "svg"
> & {
  category?: ScientificIconCategory;
  keywords?: string[];
  aliases?: string[];
};

export type FigureFontReferenceId =
  | "paper"
  | "compact"
  | "serif"
  | "code"
  | "slide"
  | "method"
  | "annotation"
  | "equation"
  | "poster"
  | "journal"
  | "title"
  | "panel"
  | "caption"
  | "axis"
  | "legend"
  | "callout"
  | "label"
  | "denseMono"
  | "systemUi"
  | "supplement"
  | "cleanSans"
  | "technicalSans"
  | "researchSans"
  | "codeAlt"
  | "readingSerif"
  | "editorialSerif"
  | "displayHeading"
  | "narrowDisplay"
  | "elegantTitle"
  | "scholarlySerif"
  | "universalSans"
  | "universalSerif"
  | "openHumanist"
  | "sourceSans"
  | "modernSlab"
  | "classicSans"
  | "classicSerif"
  | "friendlyTechnical"
  | "softSans"
  | "roundedSystem"
  | "geometricFriendly"
  | "accessibleDisplay"
  | "editorialMono"
  | "technicalMono"
  | "literarySerif"
  | "compactHumanist"
  | "futuristicTechnical"
  | "narrowTechnical"
  | "highContrastSerif"
  | "classicDisplaySerif";

export type FigureFontReference = {
  id: FigureFontReferenceId;
  label: string;
  tone: string;
  cssFamily: string;
  svgFamily: string;
  description: string;
};

export type FigurePaletteReferenceId =
  | "colorblindSafe"
  | "categorical"
  | "sequential"
  | "diverging"
  | "grayscalePrint";

export type FigurePaletteReference = {
  id: FigurePaletteReferenceId;
  label: string;
  tone: string;
  colors: string[];
  description: string;
};

const legacyScientificIconReferences: LegacyScientificIconReference[] = [
  {
    id: "robot",
    label: "Robot",
    role: "agent",
    description: "AI assistant, planner, or autonomous agent symbol.",
  },
  {
    id: "dataset",
    label: "Dataset",
    role: "data",
    description: "Structured data store or benchmark dataset symbol.",
  },
  {
    id: "image",
    label: "Image",
    role: "data",
    description: "Input image, visual evidence, or figure panel symbol.",
  },
  {
    id: "text",
    label: "Text",
    role: "data",
    description: "Text input, prompt, document span, or natural language evidence.",
  },
  {
    id: "table",
    label: "Table",
    role: "data",
    description: "Tabular data, benchmark split, or structured evidence.",
  },
  {
    id: "chart",
    label: "Chart",
    role: "metric",
    description: "Plot, evaluation curve, or quantitative result panel.",
  },
  {
    id: "document",
    label: "Document",
    role: "paper",
    description: "Paper, report, citation source, or retrieved document.",
  },
  {
    id: "search",
    label: "Search",
    role: "process",
    description: "Search, retrieval, lookup, or candidate discovery.",
  },
  {
    id: "web",
    label: "Web",
    role: "system",
    description: "Web search, online evidence, browser, or external source.",
  },
  {
    id: "model",
    label: "Model",
    role: "model",
    description: "Neural model, encoder, decoder, or classifier symbol.",
  },
  {
    id: "encoder",
    label: "Encoder",
    role: "model",
    description: "Encoder block, representation learner, or embedding module.",
  },
  {
    id: "decoder",
    label: "Decoder",
    role: "model",
    description: "Decoder block, generator, or output synthesis module.",
  },
  {
    id: "transformer",
    label: "Transformer",
    role: "model",
    description: "Transformer layer stack, attention block, or LLM backbone.",
  },
  {
    id: "retriever",
    label: "Retriever",
    role: "model",
    description: "Retriever, reranker, or evidence selection component.",
  },
  {
    id: "llm",
    label: "LLM",
    role: "model",
    description: "Large language model, reasoning core, or multimodal model.",
  },
  {
    id: "classifier",
    label: "Classifier",
    role: "model",
    description: "Classifier head, verifier, or decision module.",
  },
  {
    id: "metric",
    label: "Metric",
    role: "metric",
    description: "Quantitative result, evaluation, or score symbol.",
  },
  {
    id: "loop",
    label: "Loop",
    role: "process",
    description: "Feedback, iteration, refinement, or control loop symbol.",
  },
  {
    id: "pipeline",
    label: "Pipeline",
    role: "process",
    description: "Sequential method flow or multi-stage system pipeline.",
  },
  {
    id: "feedback",
    label: "Feedback",
    role: "process",
    description: "Human or model feedback, iterative refinement, or control signal.",
  },
  {
    id: "question",
    label: "Question",
    role: "paper",
    description: "User query, research question, or task prompt.",
  },
  {
    id: "answer",
    label: "Answer",
    role: "paper",
    description: "Generated answer, prediction, output, or conclusion.",
  },
  {
    id: "citation",
    label: "Citation",
    role: "paper",
    description: "Citation, provenance marker, or evidence grounding.",
  },
  {
    id: "warning",
    label: "Warning",
    role: "safety",
    description: "Risk, hallucination warning, uncertainty, or failure mode.",
  },
  {
    id: "shield",
    label: "Shield",
    role: "safety",
    description: "Verifier, guardrail, safety check, or robustness component.",
  },
  {
    id: "cloud",
    label: "Cloud",
    role: "system",
    description: "Cloud service, external tool, or remote computation.",
  },
  {
    id: "user",
    label: "User",
    role: "agent",
    description: "Human user, annotator, domain expert, or participant.",
  },
  {
    id: "chip",
    label: "Chip",
    role: "system",
    description: "Hardware, edge device, sensor board, or compute substrate.",
  },
  {
    id: "sensor",
    label: "Sensor",
    role: "science",
    description: "Sensor, measurement instrument, or data acquisition device.",
  },
  {
    id: "microscope",
    label: "Microscope",
    role: "science",
    description: "Microscopy, lab experiment, or observation instrument.",
  },
  {
    id: "dna",
    label: "DNA",
    role: "science",
    description: "Genomics, sequence data, biological representation, or biomarker.",
  },
  {
    id: "molecule",
    label: "Molecule",
    role: "science",
    description: "Molecular structure, chemistry, material, or drug discovery symbol.",
  },
  {
    id: "cell",
    label: "Cell",
    role: "science",
    description: "Cell, tissue, biomedical sample, or biological entity.",
  },
  {
    id: "database",
    label: "Database",
    role: "data",
    description: "Database, vector store, index, or persistent memory.",
  },
  {
    id: "embedding",
    label: "Embedding",
    role: "model",
    description: "Embedding vector, latent representation, or feature space.",
  },
  {
    id: "attention",
    label: "Attention",
    role: "model",
    description: "Attention map, token relation, or cross-modal alignment.",
  },
  {
    id: "memory",
    label: "Memory",
    role: "system",
    description: "Memory buffer, cache, context store, or working state.",
  },
  {
    id: "planner",
    label: "Planner",
    role: "agent",
    description: "Planner, controller, router, or action selection module.",
  },
  {
    id: "reranker",
    label: "Reranker",
    role: "model",
    description: "Reranking model, scoring stage, or candidate ordering.",
  },
  {
    id: "verifier",
    label: "Verifier",
    role: "safety",
    description: "Verifier, consistency checker, or hallucination detector.",
  },
  {
    id: "generator",
    label: "Generator",
    role: "model",
    description: "Generator, synthesizer, decoder, or response construction stage.",
  },
  {
    id: "multimodal",
    label: "Multimodal",
    role: "model",
    description: "Multimodal fusion, image-text reasoning, or cross-modal bridge.",
  },
  {
    id: "audio",
    label: "Audio",
    role: "data",
    description: "Audio input, speech signal, or acoustic evidence.",
  },
  {
    id: "video",
    label: "Video",
    role: "data",
    description: "Video input, temporal frames, or visual sequence.",
  },
  {
    id: "graph",
    label: "Graph",
    role: "data",
    description: "Knowledge graph, network, relation structure, or topology.",
  },
  {
    id: "node",
    label: "Node",
    role: "system",
    description: "Graph node, module node, or intermediate state.",
  },
  {
    id: "arrow",
    label: "Arrow",
    role: "process",
    description: "Flow, transformation, dependency, or directional relation.",
  },
  {
    id: "compare",
    label: "Compare",
    role: "paper",
    description: "Comparison, before-after view, or method contrast.",
  },
  {
    id: "ablation",
    label: "Ablation",
    role: "metric",
    description: "Ablation result, component removal, or controlled comparison.",
  },
  {
    id: "experiment",
    label: "Experiment",
    role: "science",
    description: "Experiment setup, trial, study condition, or protocol.",
  },
  {
    id: "lab",
    label: "Lab",
    role: "science",
    description: "Lab setting, wet-lab process, or experimental apparatus.",
  },
  {
    id: "camera",
    label: "Camera",
    role: "data",
    description: "Camera, image capture, sensing, or visual observation.",
  },
  {
    id: "book",
    label: "Book",
    role: "paper",
    description: "Literature, knowledge base, paper corpus, or reference source.",
  },
  {
    id: "code",
    label: "Code",
    role: "system",
    description: "Code, script, algorithm, or implementation artifact.",
  },
  {
    id: "api",
    label: "API",
    role: "system",
    description: "API call, tool invocation, service, or external interface.",
  },
  {
    id: "heatmap",
    label: "Heatmap",
    role: "metric",
    description: "Heatmap, activation map, saliency, or density visualization.",
  },
  {
    id: "timeline",
    label: "Timeline",
    role: "process",
    description: "Timeline, temporal sequence, or staged progression.",
  },
  {
    id: "map",
    label: "Map",
    role: "science",
    description: "Spatial map, location, environment, or geographic context.",
  },
  {
    id: "equation",
    label: "Source Serif 4",
    role: "paper",
    description: "Equation, symbolic expression, or mathematical relation.",
  },
  {
    id: "parameter",
    label: "Parameter",
    role: "model",
    description: "Parameter, hyperparameter, knob, or controllable setting.",
  },
  {
    id: "loss",
    label: "Loss",
    role: "metric",
    description: "Loss curve, optimization objective, or training signal.",
  },
  {
    id: "accuracy",
    label: "Accuracy",
    role: "metric",
    description: "Accuracy, performance score, or evaluation improvement.",
  },
  ...([
    ["token", "Token", "model", "ai-ml", ["token", "wordpiece", "embedding unit"]],
    ["prompt", "Prompt", "data", "ai-ml", ["prompt", "instruction", "context"]],
    ["finetuning", "Fine-tuning", "process", "ai-ml", ["fine tuning", "training", "adaptation"]],
    ["diffusion", "Diffusion", "model", "ai-ml", ["diffusion", "denoising", "noise"]],
    ["visionEncoder", "Vision encoder", "model", "ai-ml", ["vision encoder", "visual encoder", "image encoder"]],
    ["crossAttention", "Cross-attention", "model", "ai-ml", ["cross attention", "fusion", "attention"]],
    ["ranking", "Ranking", "process", "ai-ml", ["ranking", "rank", "rerank"]],
    ["grounding", "Grounding", "process", "ai-ml", ["grounding", "grounded", "alignment"]],
    ["query", "Query", "data", "data-retrieval", ["query", "question", "request"]],
    ["corpus", "Corpus", "data", "data-retrieval", ["corpus", "collection", "documents"]],
    ["vectorStore", "Vector store", "data", "data-retrieval", ["vector store", "vector database", "embedding store"]],
    ["knowledgeGraph", "Knowledge graph", "data", "data-retrieval", ["knowledge graph", "ontology", "triples"]],
    ["filter", "Filter", "process", "data-retrieval", ["filter", "screen", "select"]],
    ["index", "Index", "data", "data-retrieval", ["index", "indexing", "lookup"]],
    ["metadata", "Metadata", "data", "data-retrieval", ["metadata", "attributes", "schema"]],
    ["segmentation", "Segmentation", "model", "computer-vision", ["segmentation", "segment", "pixel mask"]],
    ["detection", "Detection", "model", "computer-vision", ["detection", "detector", "localization"]],
    ["featureMap", "Feature map", "data", "computer-vision", ["feature map", "activation", "features"]],
    ["boundingBox", "Bounding box", "data", "computer-vision", ["bounding box", "bbox", "region"]],
    ["mask", "Mask", "data", "computer-vision", ["mask", "masked", "roi"]],
    ["object3d", "3D object", "data", "computer-vision", ["3d object", "mesh", "point cloud"]],
    ["protein", "Protein", "science", "biology", ["protein", "peptide", "amino acid"]],
    ["gene", "Gene", "science", "biology", ["gene", "genome", "genomic"]],
    ["sequence", "Sequence", "data", "biology", ["sequence", "dna sequence", "rna sequence"]],
    ["tissue", "Tissue", "science", "biology", ["tissue", "organ", "histology"]],
    ["sample", "Sample", "science", "biology", ["sample", "specimen", "cohort"]],
    ["petriDish", "Petri dish", "science", "biology", ["petri dish", "culture", "plate"]],
    ["pipette", "Pipette", "science", "biology", ["pipette", "liquid", "transfer"]],
    ["centrifuge", "Centrifuge", "science", "biology", ["centrifuge", "spin", "separation"]],
    ["server", "Server", "system", "systems", ["server", "backend", "compute"]],
    ["device", "Device", "system", "systems", ["device", "hardware", "edge"]],
    ["network", "Network", "system", "systems", ["network", "connected", "distributed"]],
    ["branch", "Branch", "process", "systems", ["branch", "split", "fork"]],
    ["merge", "Merge", "process", "systems", ["merge", "combine", "join"]],
    ["checkpoint", "Checkpoint", "system", "systems", ["checkpoint", "snapshot", "saved model"]],
    ["humanFeedback", "Human feedback", "agent", "systems", ["human feedback", "reviewer", "human in the loop"]],
    ["confusionMatrix", "Confusion matrix", "metric", "evaluation", ["confusion matrix", "classification matrix"]],
    ["distribution", "Distribution", "metric", "evaluation", ["distribution", "histogram", "density"]],
    ["scatterPlot", "Scatter plot", "metric", "evaluation", ["scatter plot", "correlation", "points"]],
    ["benchmark", "Benchmark", "metric", "evaluation", ["benchmark", "evaluation set", "leaderboard"]],
    ["uncertainty", "Uncertainty", "metric", "evaluation", ["uncertainty", "confidence", "variance"]],
  ] as const).map(([id, label, role, category, keywords]) => ({
    id, label, role, category, keywords: [...keywords], aliases: [...keywords.slice(1)],
    description: `${label} symbol for scientific figure authoring.`,
  })),
];

export const figureFontReferences: FigureFontReference[] = [
  {
    id: "paper",
    label: "IBM Plex Sans",
    tone: "Publication figure",
    cssFamily: "var(--font-plex-sans), 'IBM Plex Sans', Arial, sans-serif",
    svgFamily: "IBM Plex Sans, Arial, sans-serif",
    description: "Clean sans-serif labels for dense paper figures.",
  },
  {
    id: "compact",
    label: "IBM Plex Sans Condensed",
    tone: "Dense two-column",
    cssFamily: "var(--font-plex-condensed), 'IBM Plex Sans Condensed', Arial, sans-serif",
    svgFamily: "IBM Plex Sans Condensed, Arial, sans-serif",
    description: "Compact, high-legibility labels for crowded multi-panel paper figures.",
  },
  {
    id: "serif",
    label: "Source Serif 4",
    tone: "Academic caption",
    cssFamily: "var(--font-serif), Source Serif 4, Georgia, serif",
    svgFamily: "Source Serif 4, Georgia, serif",
    description: "Serif labels for formal annotations and paper-like captions.",
  },
  {
    id: "code",
    label: "JetBrains Mono",
    tone: "System / variable",
    cssFamily: "var(--font-jetbrains), 'JetBrains Mono', Menlo, monospace",
    svgFamily: "JetBrains Mono, Menlo, monospace",
    description: "Monospace labels for tokens, APIs, variables, and model internals.",
  },
  {
    id: "slide",
    label: "Atkinson Hyperlegible",
    tone: "Presentation figure",
    cssFamily: "var(--font-atkinson), 'Atkinson Hyperlegible', Arial, sans-serif",
    svgFamily: "Atkinson Hyperlegible, Arial, sans-serif",
    description: "Larger, bolder labels for talk slides and demo figures.",
  },
  {
    id: "method",
    label: "Inter",
    tone: "Pipeline / system",
    cssFamily: "var(--font-sans), Inter, Arial, sans-serif",
    svgFamily: "Inter, Arial, sans-serif",
    description: "Balanced typography for method figures with modules, arrows, and short captions.",
  },
  {
    id: "annotation",
    label: "Karla",
    tone: "Callouts",
    cssFamily: "var(--font-karla), Karla, Arial, sans-serif",
    svgFamily: "Karla, Arial, sans-serif",
    description: "Readable callout text for notes, explanations, and side annotations.",
  },
  {
    id: "equation",
    label: "EB Garamond",
    tone: "Symbols / formula",
    cssFamily: "var(--font-garamond), 'EB Garamond', Georgia, serif",
    svgFamily: "EB Garamond, Georgia, serif",
    description: "Old-style serif for variables, equations, and symbolic labels.",
  },
  {
    id: "poster",
    label: "Archivo Black",
    tone: "Large format",
    cssFamily: "var(--font-archivo-black), 'Archivo Black', Impact, sans-serif",
    svgFamily: "Archivo Black, Impact, sans-serif",
    description: "Heavy display weight for poster-scale scientific diagrams.",
  },
  {
    id: "journal",
    label: "Libre Baskerville",
    tone: "Formal article",
    cssFamily: "var(--font-baskerville), 'Libre Baskerville', Georgia, serif",
    svgFamily: "Libre Baskerville, Georgia, serif",
    description: "Transitional serif for journal and archival paper figures.",
  },
  {
    id: "title",
    label: "Space Grotesk",
    tone: "Main title",
    cssFamily: "var(--font-space-grotesk), 'Space Grotesk', Arial, sans-serif",
    svgFamily: "Space Grotesk, Arial, sans-serif",
    description: "Geometric display sans for the main claim or figure heading.",
  },
  {
    id: "panel",
    label: "Barlow Condensed",
    tone: "A/B/C panels",
    cssFamily: "var(--font-barlow-condensed), 'Barlow Condensed', Arial, sans-serif",
    svgFamily: "Barlow Condensed, Arial, sans-serif",
    description: "Narrow grotesque for multi-panel A/B/C labels.",
  },
  {
    id: "caption",
    label: "Lora",
    tone: "Explanatory caption",
    cssFamily: "var(--font-lora), Lora, Georgia, serif",
    svgFamily: "Lora, Georgia, serif",
    description: "Contemporary serif for longer explanatory figure captions.",
  },
  {
    id: "axis",
    label: "Roboto Condensed",
    tone: "Plot axes",
    cssFamily: "var(--font-roboto-condensed), 'Roboto Condensed', Arial, sans-serif",
    svgFamily: "Roboto Condensed, Arial, sans-serif",
    description: "Small, precise condensed type for chart axes and measurements.",
  },
  {
    id: "legend",
    label: "Public Sans",
    tone: "Color legend",
    cssFamily: "var(--font-public-sans), 'Public Sans', Arial, sans-serif",
    svgFamily: "Public Sans, Arial, sans-serif",
    description: "Neutral sans for legends, keys, and visual encodings.",
  },
  {
    id: "callout",
    label: "Zilla Slab",
    tone: "Emphasis note",
    cssFamily: "var(--font-zilla-slab), 'Zilla Slab', Georgia, serif",
    svgFamily: "Zilla Slab, Georgia, serif",
    description: "Slab serif for emphasis notes and editorial side callouts.",
  },
  {
    id: "label",
    label: "Manrope",
    tone: "Box label",
    cssFamily: "var(--font-manrope), Manrope, Arial, sans-serif",
    svgFamily: "Manrope, Arial, sans-serif",
    description: "Rounded geometric sans for modules, boxes, nodes, and arrows.",
  },
  {
    id: "denseMono",
    label: "IBM Plex Mono",
    tone: "Compact code",
    cssFamily: "var(--font-plex-mono), 'IBM Plex Mono', Menlo, monospace",
    svgFamily: "IBM Plex Mono, Menlo, monospace",
    description: "Alternate monospace for token IDs, formulas, and API labels.",
  },
  {
    id: "systemUi",
    label: "Roboto",
    tone: "Interface diagram",
    cssFamily: "var(--font-roboto), Roboto, Arial, sans-serif",
    svgFamily: "Roboto, Arial, sans-serif",
    description: "Product-like typography for tool, dashboard, and interface figures.",
  },
  {
    id: "supplement",
    label: "Nunito Sans",
    tone: "Supplementary figure",
    cssFamily: "var(--font-nunito-sans), 'Nunito Sans', Arial, sans-serif",
    svgFamily: "Nunito Sans, Arial, sans-serif",
    description: "Soft humanist sans for supplementary material diagrams.",
  },
  {
    id: "cleanSans",
    label: "DM Sans",
    tone: "Clean contemporary",
    cssFamily: "var(--font-dm-sans), 'DM Sans', Arial, sans-serif",
    svgFamily: "DM Sans, Arial, sans-serif",
    description: "Low-noise contemporary sans for clear module labels and compact explanations.",
  },
  {
    id: "technicalSans",
    label: "Work Sans",
    tone: "Technical document",
    cssFamily: "var(--font-work-sans), 'Work Sans', Arial, sans-serif",
    svgFamily: "Work Sans, Arial, sans-serif",
    description: "Practical grotesque for technical workflows, engineering figures, and process notes.",
  },
  {
    id: "researchSans",
    label: "Fira Sans",
    tone: "Research system",
    cssFamily: "var(--font-fira-sans), 'Fira Sans', Arial, sans-serif",
    svgFamily: "Fira Sans, Arial, sans-serif",
    description: "Open, legible sans for research systems with many small labels and annotations.",
  },
  {
    id: "codeAlt",
    label: "Fira Code",
    tone: "Code / notation",
    cssFamily: "var(--font-fira-code), 'Fira Code', Menlo, monospace",
    svgFamily: "Fira Code, Menlo, monospace",
    description: "Coding-oriented monospace for algorithms, operators, identifiers, and data paths.",
  },
  {
    id: "readingSerif",
    label: "Merriweather",
    tone: "Readable serif",
    cssFamily: "var(--font-merriweather), Merriweather, Georgia, serif",
    svgFamily: "Merriweather, Georgia, serif",
    description: "High-readability serif for longer captions, explanations, and narrative callouts.",
  },
  {
    id: "editorialSerif",
    label: "Crimson Pro",
    tone: "Editorial academic",
    cssFamily: "var(--font-crimson-pro), 'Crimson Pro', Georgia, serif",
    svgFamily: "Crimson Pro, Georgia, serif",
    description: "Book-inspired serif for formal academic figures and editorial annotations.",
  },
  {
    id: "displayHeading",
    label: "Montserrat",
    tone: "Strong heading",
    cssFamily: "var(--font-montserrat), Montserrat, Arial, sans-serif",
    svgFamily: "Montserrat, Arial, sans-serif",
    description: "Geometric sans with strong hierarchy for section headings and major modules.",
  },
  {
    id: "narrowDisplay",
    label: "Oswald",
    tone: "Narrow display",
    cssFamily: "var(--font-oswald), Oswald, Arial, sans-serif",
    svgFamily: "Oswald, Arial, sans-serif",
    description: "Tall condensed sans for narrow headers, panel labels, and space-limited titles.",
  },
  {
    id: "elegantTitle",
    label: "Raleway",
    tone: "Elegant title",
    cssFamily: "var(--font-raleway), Raleway, Arial, sans-serif",
    svgFamily: "Raleway, Arial, sans-serif",
    description: "Refined geometric sans for polished figure titles and presentation callouts.",
  },
  {
    id: "scholarlySerif",
    label: "Vollkorn",
    tone: "Scholarly print",
    cssFamily: "var(--font-vollkorn), Vollkorn, Georgia, serif",
    svgFamily: "Vollkorn, Georgia, serif",
    description: "Sturdy text serif for scholarly diagrams, archival figures, and print-oriented labels.",
  },
  {
    id: "universalSans",
    label: "Noto Sans",
    tone: "Neutral multilingual sans",
    cssFamily: "var(--font-noto-sans), 'Noto Sans', Arial, sans-serif",
    svgFamily: "Noto Sans, Arial, sans-serif",
    description: "Neutral, highly legible sans with broad proportions for international research figures.",
  },
  {
    id: "universalSerif",
    label: "Noto Serif",
    tone: "Neutral multilingual serif",
    cssFamily: "var(--font-noto-serif), 'Noto Serif', Georgia, serif",
    svgFamily: "Noto Serif, Georgia, serif",
    description: "Balanced serif with sturdy details for formal academic labels and captions.",
  },
  {
    id: "openHumanist",
    label: "Open Sans",
    tone: "Open humanist sans",
    cssFamily: "var(--font-open-sans), 'Open Sans', Arial, sans-serif",
    svgFamily: "Open Sans, Arial, sans-serif",
    description: "Open apertures and neutral rhythm for readable scientific diagrams and interfaces.",
  },
  {
    id: "sourceSans",
    label: "Source Sans 3",
    tone: "Publication humanist sans",
    cssFamily: "var(--font-source-sans-3), 'Source Sans 3', Arial, sans-serif",
    svgFamily: "Source Sans 3, Arial, sans-serif",
    description: "Professional humanist sans suited to publication graphics and dense annotations.",
  },
  {
    id: "modernSlab",
    label: "Roboto Slab",
    tone: "Modern slab serif",
    cssFamily: "var(--font-roboto-slab), 'Roboto Slab', Georgia, serif",
    svgFamily: "Roboto Slab, Georgia, serif",
    description: "Contemporary slab serif for strong labels, findings, and structured callouts.",
  },
  {
    id: "classicSans",
    label: "PT Sans",
    tone: "Classic technical sans",
    cssFamily: "var(--font-pt-sans), 'PT Sans', Arial, sans-serif",
    svgFamily: "PT Sans, Arial, sans-serif",
    description: "Compact humanist sans with conventional scientific-document proportions.",
  },
  {
    id: "classicSerif",
    label: "PT Serif",
    tone: "Classic technical serif",
    cssFamily: "var(--font-pt-serif), 'PT Serif', Georgia, serif",
    svgFamily: "PT Serif, Georgia, serif",
    description: "Traditional serif with clear small-size forms for paper-oriented figures.",
  },
  {
    id: "friendlyTechnical",
    label: "Ubuntu",
    tone: "Friendly technical sans",
    cssFamily: "var(--font-ubuntu), Ubuntu, Arial, sans-serif",
    svgFamily: "Ubuntu, Arial, sans-serif",
    description: "Distinctive technical sans with softly shaped terminals and compact labels.",
  },
  {
    id: "softSans",
    label: "Mulish",
    tone: "Soft minimal sans",
    cssFamily: "var(--font-mulish), Mulish, Arial, sans-serif",
    svgFamily: "Mulish, Arial, sans-serif",
    description: "Quiet, light geometric sans for minimal diagrams and unobtrusive annotations.",
  },
  {
    id: "roundedSystem",
    label: "Rubik",
    tone: "Rounded system sans",
    cssFamily: "var(--font-rubik), Rubik, Arial, sans-serif",
    svgFamily: "Rubik, Arial, sans-serif",
    description: "Rounded corners and sturdy shapes for approachable system and process figures.",
  },
  {
    id: "geometricFriendly",
    label: "Poppins",
    tone: "Geometric rounded sans",
    cssFamily: "var(--font-poppins), Poppins, Arial, sans-serif",
    svgFamily: "Poppins, Arial, sans-serif",
    description: "Circular geometric construction for polished presentation figures and modules.",
  },
  {
    id: "accessibleDisplay",
    label: "Lexend",
    tone: "Accessible wide sans",
    cssFamily: "var(--font-lexend), Lexend, Arial, sans-serif",
    svgFamily: "Lexend, Arial, sans-serif",
    description: "Wide, differentiated letterforms for highly readable labels and slide figures.",
  },
  {
    id: "editorialMono",
    label: "Inconsolata",
    tone: "Humanist monospace",
    cssFamily: "var(--font-inconsolata), Inconsolata, Menlo, monospace",
    svgFamily: "Inconsolata, Menlo, monospace",
    description: "Narrow humanist monospace for code, variables, and compact algorithm labels.",
  },
  {
    id: "technicalMono",
    label: "Source Code Pro",
    tone: "Technical monospace",
    cssFamily: "var(--font-source-code-pro), 'Source Code Pro', Menlo, monospace",
    svgFamily: "Source Code Pro, Menlo, monospace",
    description: "Precise monospace for technical identifiers, data paths, and pseudocode.",
  },
  {
    id: "literarySerif",
    label: "Alegreya",
    tone: "Literary dynamic serif",
    cssFamily: "var(--font-alegreya), Alegreya, Georgia, serif",
    svgFamily: "Alegreya, Georgia, serif",
    description: "Lively calligraphic serif for editorial research figures and long captions.",
  },
  {
    id: "compactHumanist",
    label: "Cabin",
    tone: "Compact humanist sans",
    cssFamily: "var(--font-cabin), Cabin, Arial, sans-serif",
    svgFamily: "Cabin, Arial, sans-serif",
    description: "Compact humanist sans with subtly rounded forms for method diagrams.",
  },
  {
    id: "futuristicTechnical",
    label: "Exo 2",
    tone: "Futuristic technical sans",
    cssFamily: "var(--font-exo-2), 'Exo 2', Arial, sans-serif",
    svgFamily: "Exo 2, Arial, sans-serif",
    description: "Squared technical construction for computing systems and futuristic pipelines.",
  },
  {
    id: "narrowTechnical",
    label: "Titillium Web",
    tone: "Narrow engineered sans",
    cssFamily: "var(--font-titillium-web), 'Titillium Web', Arial, sans-serif",
    svgFamily: "Titillium Web, Arial, sans-serif",
    description: "Narrow engineered letterforms for compact panels and technical annotations.",
  },
  {
    id: "highContrastSerif",
    label: "Spectral",
    tone: "High-contrast editorial serif",
    cssFamily: "var(--font-spectral), Spectral, Georgia, serif",
    svgFamily: "Spectral, Georgia, serif",
    description: "Crisp contrast and contemporary proportions for scholarly titles and captions.",
  },
  {
    id: "classicDisplaySerif",
    label: "Cormorant Garamond",
    tone: "High-contrast classic serif",
    cssFamily: "var(--font-cormorant-garamond), 'Cormorant Garamond', Georgia, serif",
    svgFamily: "Cormorant Garamond, Georgia, serif",
    description: "Elegant high-contrast Garalde for formal titles and refined academic callouts.",
  },
];

export const figurePaletteReferences: FigurePaletteReference[] = [
  {
    id: "colorblindSafe",
    label: "Colorblind Safe",
    tone: "accessibility",
    colors: ["#0072B2", "#E69F00", "#009E73", "#D55E00", "#CC79A7", "#56B4E9"],
    description: "Accessible categorical palette for paper figures and dense legends.",
  },
  {
    id: "categorical",
    label: "Categorical Modules",
    tone: "system diagram",
    colors: ["#3B6EA8", "#5C9E6E", "#C8903D", "#8D6AB8", "#D36F5B", "#4BA3A5"],
    description: "Balanced module colors for pipelines, branches, and grouped components.",
  },
  {
    id: "sequential",
    label: "Sequential Evidence",
    tone: "magnitude",
    colors: ["#EDF6F9", "#B8DCE3", "#76B7C4", "#3E8FA5", "#1D5F75"],
    description: "Ordered blue-green scale for confidence, evidence strength, or ranking.",
  },
  {
    id: "diverging",
    label: "Diverging Scores",
    tone: "contrast",
    colors: ["#B2182B", "#EF8A62", "#F7F7F7", "#67A9CF", "#2166AC"],
    description: "Diverging palette for opposing states, error versus support, or ablations.",
  },
  {
    id: "grayscalePrint",
    label: "Grayscale Print",
    tone: "print-safe",
    colors: ["#111827", "#4B5563", "#9CA3AF", "#D1D5DB", "#F3F4F6"],
    description: "Print-friendly neutral palette for supplementary material and monochrome review.",
  },
];

function iconBody(id: ScientificIconReferenceId) {
  if (id === "robot") {
    return `
      <rect x="26" y="30" width="76" height="58" rx="14" fill="#dfe6f3" stroke="#1f3b73" stroke-width="3"/>
      <line x1="64" y1="30" x2="64" y2="16" stroke="#1f3b73" stroke-width="3" stroke-linecap="round"/>
      <circle cx="64" cy="13" r="5" fill="#f5e3c8" stroke="#9c6b3c" stroke-width="2"/>
      <circle cx="50" cy="58" r="6" fill="#ffffff" stroke="#1f3b73" stroke-width="2"/>
      <circle cx="78" cy="58" r="6" fill="#ffffff" stroke="#1f3b73" stroke-width="2"/>
      <path d="M48 75c9 7 23 7 32 0" fill="none" stroke="#19623a" stroke-width="3" stroke-linecap="round"/>
      <rect x="17" y="49" width="10" height="24" rx="5" fill="#f8fafc" stroke="#1f3b73" stroke-width="2"/>
      <rect x="101" y="49" width="10" height="24" rx="5" fill="#f8fafc" stroke="#1f3b73" stroke-width="2"/>
    `;
  }
  if (id === "dataset") {
    return `
      <ellipse cx="64" cy="34" rx="40" ry="13" fill="#dfe6f3" stroke="#1f3b73" stroke-width="3"/>
      <path d="M24 34v42c0 7 18 13 40 13s40-6 40-13V34" fill="none" stroke="#1f3b73" stroke-width="3"/>
      <path d="M24 55c0 7 18 13 40 13s40-6 40-13" fill="none" stroke="#1f3b73" stroke-width="2" opacity=".72"/>
    `;
  }
  if (id === "database" || id === "memory") {
    return `
      <ellipse cx="64" cy="28" rx="38" ry="12" fill="#dfe6f3" stroke="#1f3b73" stroke-width="3"/>
      <path d="M26 28v48c0 7 17 13 38 13s38-6 38-13V28" fill="none" stroke="#1f3b73" stroke-width="3"/>
      <path d="M26 44c0 7 17 13 38 13s38-6 38-13M26 61c0 7 17 13 38 13s38-6 38-13" fill="none" stroke="#1f3b73" stroke-width="2" opacity=".72"/>
    `;
  }
  if (id === "image") {
    return `
      <rect x="22" y="28" width="84" height="62" rx="10" fill="#f8fafc" stroke="#1f3b73" stroke-width="3"/>
      <circle cx="82" cy="45" r="7" fill="#f5e3c8" stroke="#9c6b3c" stroke-width="2"/>
      <path d="M31 80l23-24 17 16 11-10 18 18" fill="none" stroke="#19623a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  }
  if (id === "text") {
    return `
      <rect x="24" y="28" width="80" height="58" rx="8" fill="#f8fafc" stroke="#1f3b73" stroke-width="3"/>
      <path d="M40 47h48M40 60h40M40 73h30" stroke="#1f3b73" stroke-width="4" stroke-linecap="round"/>
      <path d="M36 38h16" stroke="#19623a" stroke-width="4" stroke-linecap="round"/>
    `;
  }
  if (id === "table") {
    return `
      <rect x="22" y="28" width="84" height="60" rx="8" fill="#ffffff" stroke="#1f3b73" stroke-width="3"/>
      <path d="M22 46h84M22 65h84M50 28v60M78 28v60" stroke="#1f3b73" stroke-width="2.5"/>
      <rect x="24" y="30" width="80" height="14" fill="#dfe6f3"/>
    `;
  }
  if (id === "chart") {
    return `
      <rect x="22" y="24" width="84" height="68" rx="10" fill="#ffffff" stroke="#1f3b73" stroke-width="3"/>
      <path d="M36 78c10-20 18-16 27-28 8-10 14-6 29-22" fill="none" stroke="#19623a" stroke-width="4" stroke-linecap="round"/>
      <path d="M34 82h60M34 82V38" stroke="#5c5b54" stroke-width="2.5" stroke-linecap="round"/>
    `;
  }
  if (id === "document") {
    return `
      <path d="M36 22h40l18 18v52H36z" fill="#ffffff" stroke="#1f3b73" stroke-width="3" stroke-linejoin="round"/>
      <path d="M76 22v20h18" fill="#dfe6f3" stroke="#1f3b73" stroke-width="3" stroke-linejoin="round"/>
      <path d="M48 55h32M48 68h28M48 81h22" stroke="#5c5b54" stroke-width="3" stroke-linecap="round"/>
    `;
  }
  if (id === "search" || id === "retriever") {
    return `
      <circle cx="56" cy="52" r="27" fill="#f8fafc" stroke="#1f3b73" stroke-width="4"/>
      <path d="M76 72l24 24" stroke="#1f3b73" stroke-width="6" stroke-linecap="round"/>
      <path d="M43 52h26M56 39v26" stroke="#19623a" stroke-width="4" stroke-linecap="round"/>
    `;
  }
  if (id === "web" || id === "cloud") {
    return `
      <path d="M38 78h54c12 0 20-7 20-18 0-10-8-18-19-18-5-15-19-24-35-18-10 4-16 12-18 23-12 0-22 8-22 18 0 8 7 13 20 13z" fill="#f8fafc" stroke="#1f3b73" stroke-width="3" stroke-linejoin="round"/>
      <path d="M47 62h34M58 50l23 24" stroke="#19623a" stroke-width="3" stroke-linecap="round"/>
    `;
  }
  if (id === "model") {
    return `
      <rect x="20" y="30" width="88" height="60" rx="14" fill="#d8eddc" stroke="#19623a" stroke-width="3"/>
      <path d="M42 51l24-12 24 12v26L66 89 42 77z" fill="#ffffff" stroke="#19623a" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M42 51l24 13 24-13M66 64v25" fill="none" stroke="#19623a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  }
  if (id === "encoder") {
    return `
      <rect x="24" y="28" width="80" height="58" rx="12" fill="#d8eddc" stroke="#19623a" stroke-width="3"/>
      <path d="M42 46h44M42 60h44M42 74h44" stroke="#19623a" stroke-width="4" stroke-linecap="round"/>
      <path d="M31 57l-10 10 10 10" fill="none" stroke="#1f3b73" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  }
  if (id === "decoder") {
    return `
      <rect x="24" y="28" width="80" height="58" rx="12" fill="#d8eddc" stroke="#19623a" stroke-width="3"/>
      <path d="M42 46h44M42 60h44M42 74h30" stroke="#19623a" stroke-width="4" stroke-linecap="round"/>
      <path d="M97 57l10 10-10 10" fill="none" stroke="#1f3b73" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  }
  if (id === "transformer" || id === "llm") {
    return `
      <rect x="22" y="25" width="84" height="66" rx="14" fill="#e0e7ff" stroke="#1f3b73" stroke-width="3"/>
      <circle cx="46" cy="48" r="8" fill="#ffffff" stroke="#1f3b73" stroke-width="2.5"/>
      <circle cx="82" cy="48" r="8" fill="#ffffff" stroke="#1f3b73" stroke-width="2.5"/>
      <circle cx="64" cy="72" r="8" fill="#ffffff" stroke="#19623a" stroke-width="2.5"/>
      <path d="M54 51l20 0M50 56l9 10M78 56l-9 10" stroke="#5c5b54" stroke-width="2.5" stroke-linecap="round"/>
    `;
  }
  if (id === "embedding") {
    return `
      <rect x="21" y="29" width="86" height="58" rx="12" fill="#f8fafc" stroke="#1f3b73" stroke-width="3"/>
      <path d="M38 73l13-34 12 24 10-16 17 26" fill="none" stroke="#19623a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="38" cy="73" r="4" fill="#dfe6f3" stroke="#1f3b73" stroke-width="2"/>
      <circle cx="51" cy="39" r="4" fill="#d8eddc" stroke="#19623a" stroke-width="2"/>
      <circle cx="90" cy="73" r="4" fill="#f5e3c8" stroke="#9c6b3c" stroke-width="2"/>
    `;
  }
  if (id === "attention" || id === "heatmap") {
    return `
      <rect x="28" y="28" width="72" height="64" rx="9" fill="#ffffff" stroke="#1f3b73" stroke-width="3"/>
      <rect x="38" y="38" width="14" height="14" fill="#dfe6f3"/>
      <rect x="57" y="38" width="14" height="14" fill="#f5e3c8"/>
      <rect x="76" y="38" width="14" height="14" fill="#d8eddc"/>
      <rect x="38" y="57" width="14" height="14" fill="#f3d9e0"/>
      <rect x="57" y="57" width="14" height="14" fill="#d8eddc"/>
      <rect x="76" y="57" width="14" height="14" fill="#dfe6f3"/>
      <rect x="38" y="76" width="14" height="8" fill="#f5e3c8"/>
      <rect x="57" y="76" width="14" height="8" fill="#dfe6f3"/>
      <rect x="76" y="76" width="14" height="8" fill="#f3d9e0"/>
    `;
  }
  if (id === "classifier") {
    return `
      <rect x="24" y="30" width="80" height="56" rx="12" fill="#d8eddc" stroke="#19623a" stroke-width="3"/>
      <path d="M42 45h28M42 61h42M42 77h20" stroke="#19623a" stroke-width="4" stroke-linecap="round"/>
      <path d="M84 42l14 14-14 14" fill="none" stroke="#1f3b73" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  }
  if (id === "metric") {
    return `
      <rect x="22" y="26" width="84" height="68" rx="10" fill="#fff7ed" stroke="#9c6b3c" stroke-width="3"/>
      <rect x="38" y="66" width="10" height="18" rx="3" fill="#f5e3c8" stroke="#5c5b54"/>
      <rect x="56" y="54" width="10" height="30" rx="3" fill="#d8eddc" stroke="#5c5b54"/>
      <rect x="74" y="42" width="10" height="42" rx="3" fill="#dfe6f3" stroke="#5c5b54"/>
      <path d="M35 84h58" stroke="#5c5b54" stroke-width="2" stroke-linecap="round"/>
    `;
  }
  if (id === "pipeline") {
    return `
      <rect x="16" y="42" width="26" height="28" rx="7" fill="#dfe6f3" stroke="#1f3b73" stroke-width="3"/>
      <rect x="52" y="42" width="26" height="28" rx="7" fill="#d8eddc" stroke="#19623a" stroke-width="3"/>
      <rect x="88" y="42" width="26" height="28" rx="7" fill="#f5e3c8" stroke="#9c6b3c" stroke-width="3"/>
      <path d="M43 56h8M79 56h8" stroke="#1f3b73" stroke-width="4" stroke-linecap="round"/>
    `;
  }
  if (id === "arrow") {
    return `
      <path d="M24 56h72" stroke="#1f3b73" stroke-width="7" stroke-linecap="round"/>
      <path d="M82 38l22 18-22 18" fill="none" stroke="#1f3b73" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  }
  if (id === "timeline") {
    return `
      <path d="M24 60h80" stroke="#1f3b73" stroke-width="5" stroke-linecap="round"/>
      <circle cx="34" cy="60" r="8" fill="#dfe6f3" stroke="#1f3b73" stroke-width="3"/>
      <circle cx="64" cy="60" r="8" fill="#d8eddc" stroke="#19623a" stroke-width="3"/>
      <circle cx="94" cy="60" r="8" fill="#f5e3c8" stroke="#9c6b3c" stroke-width="3"/>
      <path d="M34 42v-9M64 78v9M94 42v-9" stroke="#5c5b54" stroke-width="3" stroke-linecap="round"/>
    `;
  }
  if (id === "feedback" || id === "loop") {
    return `
      <path d="M38 40c15-18 49-18 65 0 12 15 8 39-8 52" fill="none" stroke="#1f3b73" stroke-width="5" stroke-linecap="round"/>
      <path d="M96 80l-1 12 12-2" fill="none" stroke="#1f3b73" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M90 88c-15 18-49 18-65 0-12-15-8-39 8-52" fill="none" stroke="#19623a" stroke-width="5" stroke-linecap="round"/>
      <path d="M32 48l1-12-12 2" fill="none" stroke="#19623a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  }
  if (id === "question") {
    return `
      <circle cx="64" cy="56" r="37" fill="#f8fafc" stroke="#1f3b73" stroke-width="4"/>
      <path d="M51 45c2-11 22-13 27-2 5 12-11 15-12 24" fill="none" stroke="#1f3b73" stroke-width="6" stroke-linecap="round"/>
      <circle cx="64" cy="80" r="4" fill="#19623a"/>
    `;
  }
  if (id === "answer") {
    return `
      <path d="M24 32h80v48H70L54 94V80H24z" fill="#f8fafc" stroke="#1f3b73" stroke-width="3" stroke-linejoin="round"/>
      <path d="M43 57l13 13 30-31" fill="none" stroke="#19623a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  }
  if (id === "citation") {
    return `
      <rect x="26" y="24" width="76" height="68" rx="8" fill="#ffffff" stroke="#1f3b73" stroke-width="3"/>
      <path d="M44 47h40M44 61h34M44 75h24" stroke="#5c5b54" stroke-width="3" stroke-linecap="round"/>
      <path d="M35 35h18v18H35zM72 84l20-20" fill="none" stroke="#19623a" stroke-width="4" stroke-linecap="round"/>
    `;
  }
  if (id === "warning") {
    return `
      <path d="M64 20l45 76H19z" fill="#fff7ed" stroke="#9c6b3c" stroke-width="4" stroke-linejoin="round"/>
      <path d="M64 44v24" stroke="#9c6b3c" stroke-width="7" stroke-linecap="round"/>
      <circle cx="64" cy="80" r="4" fill="#9c6b3c"/>
    `;
  }
  if (id === "shield") {
    return `
      <path d="M64 18l38 15v26c0 25-15 41-38 49-23-8-38-24-38-49V33z" fill="#d8eddc" stroke="#19623a" stroke-width="4" stroke-linejoin="round"/>
      <path d="M45 61l13 13 28-31" fill="none" stroke="#19623a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  }
  if (id === "user") {
    return `
      <circle cx="64" cy="40" r="18" fill="#dfe6f3" stroke="#1f3b73" stroke-width="3"/>
      <path d="M32 94c5-24 59-24 64 0" fill="#f8fafc" stroke="#1f3b73" stroke-width="3" stroke-linecap="round"/>
    `;
  }
  if (id === "chip" || id === "sensor") {
    return `
      <rect x="34" y="30" width="60" height="56" rx="8" fill="#f8fafc" stroke="#1f3b73" stroke-width="3"/>
      <rect x="48" y="44" width="32" height="28" rx="5" fill="#dfe6f3" stroke="#19623a" stroke-width="2.5"/>
      <path d="M24 42h10M24 56h10M24 70h10M94 42h10M94 56h10M94 70h10M48 20v10M64 20v10M80 20v10M48 86v10M64 86v10M80 86v10" stroke="#1f3b73" stroke-width="3" stroke-linecap="round"/>
    `;
  }
  if (id === "microscope") {
    return `
      <path d="M54 24l28 16-10 18-28-16z" fill="#dfe6f3" stroke="#1f3b73" stroke-width="3" stroke-linejoin="round"/>
      <path d="M67 58c-3 15-14 24-30 25M38 84h56M64 84v12" fill="none" stroke="#1f3b73" stroke-width="4" stroke-linecap="round"/>
      <circle cx="40" cy="62" r="9" fill="#f5e3c8" stroke="#9c6b3c" stroke-width="2"/>
    `;
  }
  if (id === "dna") {
    return `
      <path d="M44 20c40 24 40 48 0 72M84 20c-40 24-40 48 0 72" fill="none" stroke="#1f3b73" stroke-width="4" stroke-linecap="round"/>
      <path d="M50 33h28M45 50h38M45 66h38M50 83h28" stroke="#19623a" stroke-width="3" stroke-linecap="round"/>
    `;
  }
  if (id === "molecule") {
    return `
      <circle cx="42" cy="58" r="13" fill="#dfe6f3" stroke="#1f3b73" stroke-width="3"/>
      <circle cx="82" cy="38" r="11" fill="#d8eddc" stroke="#19623a" stroke-width="3"/>
      <circle cx="86" cy="78" r="12" fill="#f5e3c8" stroke="#9c6b3c" stroke-width="3"/>
      <path d="M54 52l17-9M55 65l19 8" stroke="#5c5b54" stroke-width="3" stroke-linecap="round"/>
    `;
  }
  if (id === "cell") {
    return `
      <ellipse cx="64" cy="58" rx="43" ry="31" fill="#f8fafc" stroke="#1f3b73" stroke-width="3"/>
      <circle cx="59" cy="57" r="13" fill="#d8eddc" stroke="#19623a" stroke-width="3"/>
      <circle cx="83" cy="49" r="5" fill="#f5e3c8" stroke="#9c6b3c" stroke-width="2"/>
      <circle cx="38" cy="67" r="4" fill="#dfe6f3" stroke="#1f3b73" stroke-width="2"/>
    `;
  }
  const asset = legacyScientificIconReferences.find((item) => item.id === id);
  const initials = (asset?.label ?? id)
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return `
    <rect x="24" y="27" width="80" height="62" rx="13" fill="#f8fafc" stroke="#1f3b73" stroke-width="3"/>
    <circle cx="42" cy="47" r="8" fill="#dfe6f3" stroke="#1f3b73" stroke-width="2"/>
    <circle cx="86" cy="47" r="8" fill="#d8eddc" stroke="#19623a" stroke-width="2"/>
    <path d="M50 47h28M64 55v14" stroke="#5c5b54" stroke-width="3" stroke-linecap="round"/>
    <text x="64" y="78" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="800" fill="#1f3b73">${initials}</text>
  `;
}

function legacyCategory(asset: LegacyScientificIconReference): ScientificIconCategory {
  if (asset.category) return asset.category;
  if (["image", "camera", "video", "heatmap"].includes(asset.id)) return "computer-vision";
  if (["microscope", "dna", "molecule", "cell", "sensor", "experiment", "lab", "map"].includes(asset.id)) return "biology";
  if (asset.role === "model") return "ai-ml";
  if (asset.role === "metric" || asset.role === "safety") return "evaluation";
  if (asset.role === "data") return "data-retrieval";
  if (asset.role === "system" || asset.role === "agent" || asset.role === "process") return "systems";
  return "general";
}

function metadataTerms(asset: LegacyScientificIconReference) {
  const descriptionTerms = asset.description
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2);
  return Array.from(new Set([
    asset.id.toLowerCase(),
    ...asset.label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
    ...(asset.keywords ?? []),
    ...descriptionTerms,
  ])).slice(0, 16);
}

function escapeIconLabel(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function legacyIconSvg(asset: LegacyScientificIconReference) {
  const label = escapeIconLabel(asset.label);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 112" role="img" aria-label="${label}" data-hichart-source="hichart" data-hichart-role="${asset.role}">
    ${iconBody(asset.id)}
  </svg>`;
}

export const scientificIconSourceManifest = externalScientificIconSourceManifest;
export const legacyScientificIconReferenceIds = legacyScientificIconReferences.map((asset) => asset.id);

const projectAuthoredScientificIcons: ScientificIconReference[] = legacyScientificIconReferences.map((asset) => ({
  ...asset,
  category: legacyCategory(asset),
  keywords: metadataTerms(asset),
  aliases: Array.from(new Set(asset.aliases ?? asset.keywords ?? [])).slice(0, 10),
  source: "hichart",
  sourceId: asset.id,
  sourceVersion: "1.0.0",
  sourceUrl: "hichart://project-authored/scientific-icons",
  license: "Project-authored",
  licenseUrl: "hichart://project-authored/license",
  author: "HiChart",
  attribution: "Project-authored HiChart scientific icon.",
  svg: legacyIconSvg(asset),
}));

const externalScientificIcons: ScientificIconReference[] = externalScientificIconRecords.map((asset) => ({
  ...asset,
  keywords: [...asset.keywords],
  aliases: [...asset.aliases],
}));

export const scientificIconReferences: ScientificIconReference[] = [
  ...externalScientificIcons,
  // Legacy IDs remain fully supported for stored bindings, but the richer
  // upstream glyphs lead the browse order so the first page is visually useful.
  ...projectAuthoredScientificIcons,
];

const scientificIconsById = new Map(scientificIconReferences.map((asset) => [asset.id, asset]));

export function findScientificIconReference(id: ScientificIconReferenceId | null | undefined) {
  return id ? scientificIconsById.get(id) : undefined;
}

export function isScientificIconReferenceId(id: string): id is ScientificIconReferenceId {
  return scientificIconsById.has(id);
}

function unavailableIconSvg(id: string) {
  const label = escapeIconLabel(id || "Unavailable icon");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 112" role="img" aria-label="Unavailable icon" data-hichart-source="unavailable"><rect width="128" height="112" rx="18" fill="#ffffff"/><rect x="31" y="20" width="66" height="58" rx="10" fill="#f8fafc" stroke="#9ca3af" stroke-width="2" stroke-dasharray="5 4"/><path d="M48 37l32 25M80 37L48 62" stroke="#9ca3af" stroke-width="4" stroke-linecap="round"/><text x="64" y="101" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="9" font-weight="700" fill="#6b7280">${label}</text></svg>`;
}

export function scientificIconSvg(id: ScientificIconReferenceId) {
  return scientificIconsById.get(id)?.svg ?? unavailableIconSvg(id);
}

export function scientificIconDataUrl(id: ScientificIconReferenceId) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(scientificIconSvg(id))}`;
}
