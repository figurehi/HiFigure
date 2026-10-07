"""Abstract base for all single-domain text retrievers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable


@dataclass
class SearchResult:
    record_id: str
    score: float
    domain: str


class BaseRetriever(ABC):
    """Single-domain retriever backed by a FAISS index.

    Subclasses declare a ``domain`` class attribute (e.g. ``"idea_overview"``)
    and implement build / search / save / load.  The registry uses this
    interface to support single-domain and multi-vector fused search without
    knowing anything about the underlying embedding strategy.
    """

    domain: str  # declared by each subclass

    @abstractmethod
    def build(
        self,
        records: Iterable[dict],
        *,
        progress_callback: Callable[[int, int], None] | None = None,
    ) -> None:
        """Embed *records* and populate the FAISS index in memory."""

    @abstractmethod
    def search(self, query: str, top_k: int = 10) -> list[SearchResult]:
        """Return up to *top_k* results for a free-text *query*."""

    @abstractmethod
    def save(self, directory: Path) -> None:
        """Persist index and ID mapping under *directory*."""

    @classmethod
    @abstractmethod
    def load(cls, directory: Path) -> "BaseRetriever":
        """Restore index and ID mapping from *directory*."""
