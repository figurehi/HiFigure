"""Deterministic keyword-only retrieval for the Baseline study website.

This module deliberately does not import the semantic retriever, query-planning
LLM, or HiFigure search services. It ranks the fixed FigureBench corpus with a
small BM25 implementation so the Baseline remains reproducible and auditable.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
import math
from pathlib import Path
import re
from typing import Iterable

from .retrieval.dataset import image_path, load_records


_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9]{1,}", re.IGNORECASE)
_STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in",
    "into", "is", "it", "of", "on", "or", "that", "the", "this", "to", "with",
}


def keyword_tokens(text: str) -> list[str]:
    """Return lowercase literal keyword tokens without expansion or stemming."""
    normalized = re.sub(r"[_+./-]+", " ", text)
    return [
        token.lower()
        for token in _TOKEN_RE.findall(normalized)
        if token.lower() not in _STOP_WORDS
    ]


def _string_values(value: object) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from _string_values(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from _string_values(item)


def _record_document(record: dict) -> str:
    """Flatten only human-readable dataset metadata into one keyword document."""
    paper = record.get("paper") or {}
    enrichment = record.get("enrichment") or {}
    content = enrichment.get("content_card") or {}
    design = enrichment.get("design_card") or {}
    closed_tags = enrichment.get("closed_tags") or {}
    fields: list[object] = [
        paper.get("title"),
        paper.get("abstract"),
        record.get("caption"),
        content,
        design,
        closed_tags,
    ]
    return " ".join(text for field in fields for text in _string_values(field) if text)


def _display_record(record: dict, *, score: float, matched_terms: list[str]) -> dict[str, object]:
    paper = record.get("paper") or {}
    enrichment = record.get("enrichment") or {}
    content = enrichment.get("content_card") or {}
    record_id = str(record.get("record_id") or "")
    image_path = str(record.get("image_path") or "").strip()
    paper_title = str(paper.get("title") or "").strip()
    caption = str(record.get("caption") or "").strip()
    main_idea = str(content.get("main_idea") or "").strip()
    figure_role = str(content.get("figure_role") or "diagram").strip() or "diagram"
    title = main_idea or caption or paper_title or record_id
    try:
        year = int(paper.get("year") or 0)
    except (TypeError, ValueError):
        year = 0
    return {
        "id": record_id,
        "title": title,
        "paperTitle": paper_title,
        "caption": caption,
        "venue": str(paper.get("venue") or "").strip(),
        "year": year,
        "imageType": figure_role,
        "imageUrl": f"/dataset/images/{image_path}" if image_path else None,
        "matchedTerms": matched_terms,
        "score": round(score, 6),
    }


@dataclass(frozen=True)
class _KeywordIndex:
    records: tuple[dict, ...]
    term_counts: tuple[Counter[str], ...]
    lengths: tuple[int, ...]
    document_frequency: Counter[str]
    average_length: float


def _build_index(records: list[dict]) -> _KeywordIndex:
    counts: list[Counter[str]] = []
    lengths: list[int] = []
    document_frequency: Counter[str] = Counter()
    for record in records:
        tokens = keyword_tokens(_record_document(record))
        term_count = Counter(tokens)
        counts.append(term_count)
        lengths.append(len(tokens))
        document_frequency.update(term_count.keys())
    average_length = sum(lengths) / len(lengths) if lengths else 1.0
    return _KeywordIndex(
        records=tuple(records),
        term_counts=tuple(counts),
        lengths=tuple(lengths),
        document_frequency=document_frequency,
        average_length=max(average_length, 1.0),
    )


@lru_cache(maxsize=1)
def _default_index() -> _KeywordIndex:
    return _build_index(load_records())


def search_keyword_records(
    query: str,
    *,
    limit: int = 24,
    offset: int = 0,
    records: list[dict] | None = None,
) -> dict[str, object]:
    """Rank literal keyword matches with BM25 and stable record-id tie breaks."""
    query_terms = list(dict.fromkeys(keyword_tokens(query)))[:30]
    safe_limit = max(1, min(int(limit), 48))
    safe_offset = max(0, int(offset))
    if not query_terms:
        return {
            "query": query.strip(),
            "algorithm": "bm25-keyword",
            "results": [],
            "total": 0,
            "limit": safe_limit,
            "offset": safe_offset,
            "hasMore": False,
        }

    index = _build_index(records) if records is not None else _default_index()
    document_count = len(index.records)
    k1 = 1.5
    b = 0.75
    scored: list[tuple[float, str, int, list[str]]] = []
    for position, (record, frequencies, length) in enumerate(
        zip(index.records, index.term_counts, index.lengths, strict=True)
    ):
        score = 0.0
        matched_terms: list[str] = []
        for term in query_terms:
            frequency = frequencies.get(term, 0)
            if not frequency:
                continue
            matched_terms.append(term)
            doc_frequency = index.document_frequency.get(term, 0)
            inverse_frequency = math.log(1 + (document_count - doc_frequency + 0.5) / (doc_frequency + 0.5))
            denominator = frequency + k1 * (1 - b + b * length / index.average_length)
            score += inverse_frequency * (frequency * (k1 + 1) / denominator)
        if score > 0:
            scored.append((score, str(record.get("record_id") or ""), position, matched_terms))

    scored.sort(key=lambda item: (-item[0], item[1]))
    page = scored[safe_offset : safe_offset + safe_limit]
    results = [
        _display_record(index.records[position], score=score, matched_terms=matched_terms)
        for score, _record_id, position, matched_terms in page
    ]
    return {
        "query": query.strip(),
        "algorithm": "bm25-keyword",
        "results": results,
        "total": len(scored),
        "limit": safe_limit,
        "offset": safe_offset,
        "hasMore": safe_offset + safe_limit < len(scored),
    }


def baseline_reference_image(record_id: str) -> Path | None:
    """Resolve one search-result image without exposing arbitrary filesystem paths."""
    record = next(
        (candidate for candidate in _default_index().records if candidate.get("record_id") == record_id),
        None,
    )
    if record is None:
        return None
    resolved = image_path(record)
    return resolved if resolved.is_file() else None
