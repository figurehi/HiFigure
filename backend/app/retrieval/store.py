"""Application-level retrieval singleton.

Lazily loads the FAISS index and the full dataset records on first use,
then keeps them alive for the process lifetime.

Usage (from services.py)::

    from .retrieval.store import get_registry, get_record, is_ready

    if not is_ready():
        return []                    # index not yet built

    results = get_registry().search(query, top_k=20)
    for r in results:
        record = get_record(r.record_id)   # → dict | None
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

from .dataset import default_metadata_path, load_records
from .index_metadata import index_fingerprint
from .registry import RetrieverRegistry
from .figure_retriever import FIGURE_RETRIEVER_CLASSES

logger = logging.getLogger("figpilot.retrieval")

_INDEX_DIR = Path(__file__).parent.parent.parent / "data" / "indices"
_INDEX_HASH_FILE = _INDEX_DIR / "metadata.hash"


def _index_metadata_matches() -> bool:
    metadata_path = default_metadata_path()
    if not metadata_path.exists() or not _INDEX_HASH_FILE.exists():
        return False
    try:
        return _INDEX_HASH_FILE.read_text(encoding="utf-8").strip() == index_fingerprint(metadata_path)
    except OSError:
        return False


@lru_cache(maxsize=1)
def get_registry() -> RetrieverRegistry | None:
    """Return the populated registry, or None if the index hasn't been built yet."""
    if not _index_metadata_matches():
        logger.warning(
            "Retrieval index fingerprint is missing or stale. "
            "Run `python backend/scripts/build_index.py`."
        )
        return None
    registry = RetrieverRegistry()
    for domain, cls in FIGURE_RETRIEVER_CLASSES.items():
        try:
            registry.register(cls.load(_INDEX_DIR))
        except (FileNotFoundError, ValueError) as exc:
            logger.warning("Retrieval index for domain '%s' is unavailable: %s", domain, exc)
    if registry.is_ready():
        return registry
    logger.warning(
        "No retrieval indices found in %s. "
        "Run `python backend/scripts/build_index.py` to build them.",
        _INDEX_DIR,
    )
    return None


@lru_cache(maxsize=1)
def _records_by_id() -> dict[str, dict]:
    records = load_records()
    return {r["record_id"]: r for r in records}


def get_record(record_id: str) -> dict | None:
    return _records_by_id().get(record_id)


def is_ready() -> bool:
    reg = get_registry()
    return reg is not None and reg.is_ready()
