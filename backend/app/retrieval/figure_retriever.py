"""FAISS retrievers for natural-language figure metadata domains."""

from __future__ import annotations

from .figure_fields import FIGURE_RETRIEVAL_DOMAINS, record_text_for_domain
from .text_retriever import TextIndexRetriever


class FigureTextRetriever(TextIndexRetriever):
    """Single-domain retriever over one composite figure-search document."""

    domain = ""

    def _record_to_text(self, record: dict) -> str:
        return record_text_for_domain(record, self.domain)


def make_figure_retriever_class(domain: str) -> type[FigureTextRetriever]:
    if domain not in FIGURE_RETRIEVAL_DOMAINS:
        raise KeyError(f"Unknown figure retrieval domain: {domain}")

    class _DomainFigureRetriever(FigureTextRetriever):
        pass

    _DomainFigureRetriever.domain = domain
    _DomainFigureRetriever.__name__ = "".join(part.title() for part in domain.split("_")) + "Retriever"
    _DomainFigureRetriever.__qualname__ = _DomainFigureRetriever.__name__
    return _DomainFigureRetriever


FIGURE_RETRIEVER_CLASSES: dict[str, type[FigureTextRetriever]] = {
    domain: make_figure_retriever_class(domain)
    for domain in FIGURE_RETRIEVAL_DOMAINS
}
