"""Natural-language documents for the three supported retrieval goals.

Each goal owns one independent FAISS index. A search selects exactly one goal;
there is no detailed-field index or runtime score fusion.
"""

from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Any


INDEX_DOCUMENT_VERSION = "composite-v1"
RETRIEVAL_DOMAIN_NAMES = (
    "idea_overview",
    "structure_overview",
    "style_overview",
)
SEARCH_GOAL_DOMAINS = MappingProxyType(
    {
        "idea": "idea_overview",
        "structure": "structure_overview",
        "style": "style_overview",
    }
)


@dataclass(frozen=True)
class FigureRetrievalDomain:
    name: str
    label: str
    source_paths: tuple[str, ...]
    purpose: str


FIGURE_RETRIEVAL_DOMAINS: dict[str, FigureRetrievalDomain] = {
    "idea_overview": FigureRetrievalDomain(
        name="idea_overview",
        label="Idea formation",
        source_paths=(
            "enrichment.content_card.domain_summary",
            "enrichment.content_card.main_idea",
            "enrichment.content_card.figure_role",
            "enrichment.content_card.input_output",
            "enrichment.content_card.process",
            "enrichment.content_card.key_components",
        ),
        purpose="Find figures that communicate a similar problem, central idea, and method story.",
    ),
    "structure_overview": FigureRetrievalDomain(
        name="structure_overview",
        label="Layout",
        source_paths=(
            "enrichment.design_card.layout",
            "enrichment.design_card.organization",
            "enrichment.design_card.flow",
            "enrichment.content_card.figure_role",
            "enrichment.content_card.process",
            "enrichment.content_card.key_components",
        ),
        purpose="Find figures with similar modules, grouping, topology, and reading flow.",
    ),
    "style_overview": FigureRetrievalDomain(
        name="style_overview",
        label="Style",
        source_paths=(
            "enrichment.design_card.style",
            "enrichment.design_card.visual_elements",
            "enrichment.closed_tags.visual.color_style",
            "enrichment.closed_tags.visual.rendering_style",
        ),
        purpose="Find figures with a similar visual language, rendering treatment, and motifs.",
    ),
}


def available_figure_domains() -> MappingProxyType[str, FigureRetrievalDomain]:
    return MappingProxyType(FIGURE_RETRIEVAL_DOMAINS)


def record_text_for_domain(record: dict, domain: str) -> str:
    if domain not in FIGURE_RETRIEVAL_DOMAINS:
        raise KeyError(f"Unknown figure retrieval domain: {domain}")
    return _composite_document(record, domain)


def _composite_document(record: dict, domain: str) -> str:
    enrichment = record.get("enrichment") or {}
    content = enrichment.get("content_card") or {}
    design = enrichment.get("design_card") or {}
    closed_tags = enrichment.get("closed_tags") or {}
    paper = record.get("paper") or {}

    if domain == "idea_overview":
        parts = [
            _sentence("Research context", content.get("domain_summary")),
            _sentence("Central idea", content.get("main_idea")),
            _sentence("Figure purpose", content.get("figure_role")),
            _sentence("Input and output", content.get("input_output")),
            _sentence("Method story", content.get("process")),
            _sentence("Core modules", content.get("key_components")),
        ]
        if not any(parts):
            parts = [
                _sentence("Paper", paper.get("title")),
                _sentence("Research context", paper.get("abstract")),
                _sentence("Figure caption", record.get("caption")),
            ]
    elif domain == "structure_overview":
        parts = [
            _sentence("Figure type", content.get("figure_role")),
            _sentence("Canvas and placement", design.get("layout")),
            _sentence("Module grouping", design.get("organization")),
            _sentence("Reading and connection flow", design.get("flow")),
            _sentence("Process shown", content.get("process")),
            _sentence("Modules shown", content.get("key_components")),
        ]
    else:
        parts = [
            _sentence("Visual language", design.get("style")),
            _sentence("Visual elements", design.get("visual_elements")),
            _sentence("Color treatment", closed_tags.get("visual.color_style")),
            _sentence("Rendering treatment", closed_tags.get("visual.rendering_style")),
        ]

    document = "\n".join(part for part in parts if part)
    if document:
        return document
    return _sentence("Figure caption", record.get("caption")) or _sentence("Paper", paper.get("title"))


def _sentence(label: str, value: Any) -> str:
    if value in (None, "", [], {}):
        return ""
    if isinstance(value, list):
        items = [str(item).strip() for item in value if str(item).strip()]
        text = _join_natural_list(items) if items else ""
    else:
        text = str(value).strip().replace("_", " ")
    return f"{label}: {text}" if text else ""


def _join_natural_list(items: list[str]) -> str:
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return f"{', '.join(items[:-1])}, and {items[-1]}"
