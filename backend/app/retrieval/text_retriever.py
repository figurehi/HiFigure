"""Reusable FAISS implementation for a single text retrieval domain.

Search flow:
  1. At index-build time: turn every record into one domain-specific document,
     embed with jina-embeddings-v3's ``retrieval.passage`` adapter, add to
     an ``IndexFlatIP`` FAISS index (inner product == cosine for L2-normalised
     vectors).
  2. At query time: embed the user's method-description query with the
     ``retrieval.query`` adapter, run FAISS k-NN, return ranked results.

Concrete subclasses must set ``domain`` and override ``_record_to_text``.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Callable, Iterable

import numpy as np

from .base import BaseRetriever, SearchResult
from .encoder import DOCUMENT_TASK, EMBEDDING_DIM, encode, encode_query


def _faiss():
    try:
        import faiss as _f
        return _f
    except ModuleNotFoundError as exc:
        raise ModuleNotFoundError(
            "faiss-cpu is required for retrieval. "
            "Install it with: pip install faiss-cpu"
        ) from exc

logger = logging.getLogger("figpilot.retrieval")


class TextIndexRetriever(BaseRetriever):
    """Embeds one text document per record and ranks by cosine similarity."""

    domain = ""

    def __init__(self) -> None:
        self._index: faiss.Index | None = None
        self._ids: list[str] = []  # position i → record_id

    # ------------------------------------------------------------------
    # Index construction
    # ------------------------------------------------------------------

    def build(
        self,
        records: Iterable[dict],
        *,
        progress_callback: Callable[[int, int], None] | None = None,
    ) -> None:
        record_list = list(records)
        if not record_list:
            raise ValueError("Cannot build index from empty record list.")

        texts = [self._record_to_text(r) for r in record_list]
        self._ids = [str(r["record_id"]) for r in record_list]

        logger.info(
            "Embedding %d records for domain '%s'", len(texts), self.domain
        )
        embeddings = encode(
            texts,
            task=DOCUMENT_TASK,
            progress_callback=progress_callback,
        )  # (N, D), L2-normalised float32

        dim = embeddings.shape[1]
        faiss = _faiss()
        self._index = faiss.IndexFlatIP(dim)  # cosine via inner product
        self._index.add(embeddings)
        logger.info(
            "FAISS index built: %d vectors, dim=%d", self._index.ntotal, dim
        )

    def _record_to_text(self, record: dict) -> str:
        raise NotImplementedError

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    def search(self, query: str, top_k: int = 10) -> list[SearchResult]:
        if self._index is None:
            raise RuntimeError(
                f"'{self.domain}' index not ready. Call build() or load() first."
            )

        q_emb = encode_query(query).astype(np.float32)
        k = min(top_k, self._index.ntotal)
        scores, indices = self._index.search(q_emb, k)

        results: list[SearchResult] = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0:
                continue
            results.append(
                SearchResult(
                    record_id=self._ids[idx],
                    score=float(score),
                    domain=self.domain,
                )
            )
        return results

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def save(self, directory: Path) -> None:
        directory.mkdir(parents=True, exist_ok=True)
        _faiss().write_index(self._index, str(directory / f"{self.domain}.faiss"))
        (directory / f"{self.domain}.ids.json").write_text(
            json.dumps(self._ids, ensure_ascii=False), encoding="utf-8"
        )
        logger.info("Saved '%s' index (%d vectors) to %s", self.domain, self._index.ntotal, directory)

    @classmethod
    def load(cls, directory: Path) -> "TextIndexRetriever":
        index_path = directory / f"{cls.domain}.faiss"
        ids_path = directory / f"{cls.domain}.ids.json"
        if not index_path.exists() or not ids_path.exists():
            raise FileNotFoundError(
                f"'{cls.domain}' index files not found in {directory}. "
                "Run `python backend/scripts/build_index.py` first."
            )
        obj = cls()
        obj._index = _faiss().read_index(str(index_path))
        if obj._index.d != EMBEDDING_DIM:
            raise ValueError(
                f"'{cls.domain}' index has dimension {obj._index.d}; expected "
                f"{EMBEDDING_DIM} for the current embedding model. Rebuild the index."
            )
        obj._ids = json.loads(ids_path.read_text(encoding="utf-8"))
        logger.info(
            "Loaded '%s' index: %d vectors", cls.domain, obj._index.ntotal
        )
        return obj
