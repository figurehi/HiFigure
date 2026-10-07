"""Fingerprint metadata that determines retrieval index compatibility."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from . import encoder
from .figure_fields import INDEX_DOCUMENT_VERSION


def index_fingerprint(metadata_path: Path) -> str:
    payload = {
        "metadata_sha256": hashlib.sha256(metadata_path.read_bytes()).hexdigest(),
        "embedding_model": encoder.MODEL_NAME,
        "embedding_model_revision": encoder.MODEL_REVISION,
        "embedding_code_revision": encoder.MODEL_CODE_REVISION,
        "embedding_dim": encoder.EMBEDDING_DIM,
        "max_length": encoder.MAX_LENGTH,
        "document_task": encoder.DOCUMENT_TASK,
        "query_task": encoder.QUERY_TASK,
        "document_schema": INDEX_DOCUMENT_VERSION,
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()
