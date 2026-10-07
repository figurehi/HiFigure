"""Build and persist the FigureBench retrieval index.

Run once (offline) after placing records.json in frontend/datasets/.

Usage (from repo root, re-copilot environment active)::

    python backend/scripts/build_index.py

Options::

    --metadata   PATH   Path to records JSON
                        [default: frontend/datasets/records.json]
    --index-dir  PATH   Directory to write FAISS index files
                        [default: backend/data/indices]

The script always builds the Idea, Layout, and Style indexes and writes two
files per domain into --index-dir:
    <domain>.faiss       FAISS IndexFlatIP binary
    <domain>.ids.json    Ordered list of record_ids matching FAISS row positions
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import TextIO

HASH_FILENAME = "metadata.hash"

# Allow running as `python backend/scripts/build_index.py` from the repo root
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(_REPO_ROOT / "backend"))

from app.retrieval import load_records
from app.retrieval.figure_fields import RETRIEVAL_DOMAIN_NAMES
from app.retrieval.figure_retriever import FIGURE_RETRIEVER_CLASSES
from app.retrieval.index_metadata import index_fingerprint

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("build_index")

# The build surface is intentionally limited to the three user-visible goals.
_DOMAIN_REGISTRY: dict[str, type] = {
    domain: FIGURE_RETRIEVER_CLASSES[domain]
    for domain in RETRIEVAL_DOMAIN_NAMES
}


def _remove_inactive_index_files(index_dir: Path) -> list[Path]:
    active_files = {
        HASH_FILENAME,
        *(f"{domain}.faiss" for domain in _DOMAIN_REGISTRY),
        *(f"{domain}.ids.json" for domain in _DOMAIN_REGISTRY),
    }
    removed: list[Path] = []
    for pattern in ("*.faiss", "*.ids.json"):
        for path in index_dir.glob(pattern):
            if path.name not in active_files:
                path.unlink()
                removed.append(path)
    return removed


class ProgressBar:
    """Small terminal progress bar for batch embedding work."""

    def __init__(
        self,
        total: int,
        *,
        label: str = "Embedding",
        stream: TextIO = sys.stderr,
        width: int = 32,
    ) -> None:
        self.total = max(total, 1)
        self.label = label
        self.stream = stream
        self.width = width
        self._done = 0
        self._has_written = False

    def update(self, done: int, total: int | None = None) -> None:
        if total is not None:
            self.total = max(total, 1)
        self._done = max(0, min(done, self.total))
        filled = int(self.width * self._done / self.total)
        bar = "#" * filled + "-" * (self.width - filled)
        percent = int(100 * self._done / self.total)
        self.stream.write(
            f"\r{self.label}: [{bar}] {self._done}/{self.total} ({percent:3d}%)"
        )
        self.stream.flush()
        self._has_written = True

    def finish(self) -> None:
        if self._has_written:
            self.stream.write("\n")
            self.stream.flush()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build FigureBench FAISS retrieval index",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--metadata",
        type=Path,
        default=None,
        help="Path to records JSON (default: frontend/datasets/records.json)",
    )
    parser.add_argument(
        "--index-dir",
        type=Path,
        default=_REPO_ROOT / "backend" / "data" / "indices",
        metavar="PATH",
        help="Directory to write FAISS index files",
    )
    args = parser.parse_args()

    # Resolve metadata path before loading so we can hash the file.
    from app.retrieval.dataset import default_metadata_path
    metadata_path: Path = args.metadata or default_metadata_path()

    records = load_records(metadata_path=metadata_path)
    if not records:
        logger.error(
            "No records loaded. Place records.json in frontend/datasets/ "
            "or pass --metadata <path>."
        )
        sys.exit(1)
    logger.info("Loaded %d records", len(records))

    for domain, cls in _DOMAIN_REGISTRY.items():

        logger.info("Building '%s' index …", domain)
        retriever = cls()
        progress = ProgressBar(len(records), label=f"Embedding {domain}")
        try:
            retriever.build(records, progress_callback=progress.update)
        finally:
            progress.finish()
        retriever.save(args.index_dir)
        logger.info("'%s' index saved to %s", domain, args.index_dir)

    # Write the compatibility fingerprint so dev.sh / build_index.sh can detect stale index.
    hash_file = args.index_dir / HASH_FILENAME
    hash_file.write_text(index_fingerprint(metadata_path), encoding="utf-8")
    logger.info("Metadata hash written to %s", hash_file)

    for path in _remove_inactive_index_files(args.index_dir):
        logger.info("Removed inactive retrieval index file %s", path)

    logger.info("Done.")


if __name__ == "__main__":
    main()
