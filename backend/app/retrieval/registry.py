"""Multi-domain retriever registry with late-fusion scoring.

Design contract
---------------
- Each registered retriever owns exactly one ``domain`` (a string key).
- Single-domain search: ``registry.search(q, domains=["idea_overview"])``
  delegates directly to that retriever — no fusion overhead.
- Multi-domain search: scores from every requested domain are weighted and
  summed per record_id, then the top-k are returned as ``domain="fused"``.
- Future retrievers (caption, figure_type, …) can be registered without
  touching this file.
"""

from __future__ import annotations

import logging
from collections import defaultdict

from .base import BaseRetriever, SearchResult

logger = logging.getLogger("figpilot.retrieval")


class RetrieverRegistry:
    """Holds multiple single-domain retrievers; supports single- and multi-domain search.

    Example — single domain::

        reg = RetrieverRegistry()
        cls = FIGURE_RETRIEVER_CLASSES["idea_overview"]
        reg.register(cls.load(index_dir))
        results = reg.search("attention mechanism for scene text recognition")

    Example — weighted multi-domain (once more domains are indexed)::

        results = reg.search(
            query,
            domains=["idea_overview", "structure_overview"],
            weights={"idea_overview": 0.7, "structure_overview": 0.3},
            top_k=20,
        )
    """

    def __init__(self) -> None:
        self._retrievers: dict[str, BaseRetriever] = {}

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def register(self, retriever: BaseRetriever) -> None:
        self._retrievers[retriever.domain] = retriever
        logger.info("Registered retriever for domain '%s'", retriever.domain)

    def domains(self) -> list[str]:
        return list(self._retrievers.keys())

    def get(self, domain: str) -> BaseRetriever | None:
        return self._retrievers.get(domain)

    def is_ready(self) -> bool:
        return bool(self._retrievers)

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    def search(
        self,
        query: str,
        *,
        top_k: int = 10,
        domains: list[str] | None = None,
        weights: dict[str, float] | None = None,
    ) -> list[SearchResult]:
        """Search across one or more domains and return fused top-k results.

        Args:
            query: Free-text query (e.g. a method description).
            top_k: Number of results to return.
            domains: Which domains to search. ``None`` searches all registered
                domains.
            weights: Per-domain score multipliers for fusion. When ``None``,
                uniform weights are used.  Keys not present in *domains* are
                ignored.

        Returns:
            Ranked list of :class:`SearchResult` with ``domain`` set to the
            single domain name (when only one domain is active) or
            ``"fused"`` (when multiple domains contribute).
        """
        active = domains if domains is not None else list(self._retrievers.keys())
        if not active:
            return []

        n = len(active)
        uniform_w = 1.0 / n
        w: dict[str, float] = weights or {}

        # Over-fetch per domain before fusion to avoid cutting off candidates
        fetch_k = top_k * max(2, n)
        fused: dict[str, float] = defaultdict(float)

        for domain in active:
            retriever = self._retrievers.get(domain)
            if retriever is None:
                logger.warning("Domain '%s' not registered; skipping", domain)
                continue
            domain_weight = w.get(domain, uniform_w)
            for r in retriever.search(query, top_k=fetch_k):
                fused[r.record_id] += r.score * domain_weight

        sorted_ids = sorted(fused, key=fused.__getitem__, reverse=True)[:top_k]
        result_domain = active[0] if n == 1 else "fused"
        return [
            SearchResult(record_id=rid, score=fused[rid], domain=result_domain)
            for rid in sorted_ids
        ]
