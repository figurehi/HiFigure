"""Text retrieval module for the FigureBench dataset.

Public API
----------
Build the three supported goal indexes with ``backend/scripts/build_index.py``.

Extension points
----------------
- Add a new domain: subclass :class:`BaseRetriever`, override ``domain`` and
  ``_record_to_text``, register in :mod:`build_index` and the registry.
- Multi-domain fusion: pass ``domains=[...]`` and ``weights={...}`` to
  :meth:`RetrieverRegistry.search`.
"""

__all__ = [
    "BaseRetriever",
    "SearchResult",
    "RetrieverRegistry",
    "load_records",
]


def __getattr__(name: str):
    if name in {"BaseRetriever", "SearchResult"}:
        from .base import BaseRetriever, SearchResult

        return {"BaseRetriever": BaseRetriever, "SearchResult": SearchResult}[name]
    if name == "load_records":
        from .dataset import load_records

        return load_records
    if name == "RetrieverRegistry":
        from .registry import RetrieverRegistry

        return RetrieverRegistry
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
