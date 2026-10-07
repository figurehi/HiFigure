"""FigureBench dataset loader.

Expected layout on disk::

    frontend/datasets/
        records.json           ← dict keyed by record_id  OR  list of records
        images/
            figurebench_0001.png
            …

Each record in the JSON has at minimum::

    {
      "record_id": "figurebench_0001",
      "arxiv_id":  "2003.12294",
      "image_path": "figurebench_0001.png",
      "paper": {
        "title":    "…",
        "abstract": "…",
        "venue":    "arXiv",
        "year":     2020
      },
      "source": "figurebench"
    }

Fields beyond ``paper.title`` and ``paper.abstract`` are not required by the
first retrieval domain but are preserved so future domains can use them.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger("figpilot.retrieval")

# Default path: next to test_pics in the frontend tree
_HERE = Path(__file__).parent
_DATASET_ROOT = (_HERE / "../../../frontend/datasets").resolve()


def default_metadata_path() -> Path:
    """Return the active records file, including the legacy filename fallback."""
    path = _DATASET_ROOT / "records.json"
    if not path.exists():
        legacy_path = _DATASET_ROOT / "metadata.json"
        if legacy_path.exists():
            return legacy_path
    return path


def load_records(metadata_path: Path | None = None) -> list[dict]:
    """Load FigureBench records from the metadata JSON.

    Args:
        metadata_path: Explicit path to the JSON file.  Defaults to
            ``frontend/datasets/records.json`` relative to the repo root.

    Returns:
        List of record dicts, each guaranteed to have a non-empty
        ``record_id`` string.  Returns ``[]`` when the file is missing.
    """
    path = metadata_path or default_metadata_path()
    if not path.exists():
        logger.warning("Dataset metadata not found: %s", path)
        return []

    with open(path, encoding="utf-8") as f:
        raw = json.load(f)

    if isinstance(raw, dict):
        # Keyed format: {"figurebench_0001": {...}, …}
        records: list[dict] = list(raw.values())
    elif isinstance(raw, list):
        records = raw
    else:
        logger.error("Unexpected metadata format in %s: %s", path, type(raw))
        return []

    # Guarantee record_id is always present
    for i, rec in enumerate(records):
        if not rec.get("record_id"):
            rec["record_id"] = str(rec.get("arxiv_id") or f"record_{i}")

    logger.info("Loaded %d records from %s", len(records), path)
    return records


def image_path(record: dict, dataset_root: Path | None = None) -> Path:
    """Resolve the absolute path of the figure image for *record*.

    Args:
        record: A record dict as returned by :func:`load_records`.
        dataset_root: Override the default ``frontend/datasets/`` root.

    Returns:
        Absolute :class:`Path` — may not exist if the file is not present.
    """
    root = dataset_root or _DATASET_ROOT
    rel = str(record.get("image_path") or "")
    return (root / "images" / rel).resolve()
