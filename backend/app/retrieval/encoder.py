"""Jina Embeddings v3 singleton encoder.

Loaded lazily on first call; shared across all retriever instances in the
same process. Uses the model's asymmetric retrieval LoRA adapters so indexed
documents and live queries are embedded for their respective roles.
"""

from __future__ import annotations

import logging
import os
import time
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path
from typing import Callable, Literal, Sequence

import numpy as np

logger = logging.getLogger("figpilot.retrieval")

MODEL_NAME = "jinaai/jina-embeddings-v3"
MODEL_REVISION = "ab036b023d30b4d1138c4c3bfa9f0c445ab455d6"
MODEL_CODE_REVISION = "845308d0fd72a8406a3e378450e1a09522790419"
EMBEDDING_DIM = 256
MAX_LENGTH = 8192
BATCH_SIZE = 8  # lower if GPU OOM; long documents are padded within each batch
MAX_BATCH_CHARACTERS = 8192
QUERY_CACHE_SIZE = 512
DOCUMENT_TASK = "retrieval.passage"
QUERY_TASK = "retrieval.query"
EmbeddingTask = Literal["retrieval.passage", "retrieval.query"]

_TORCH_DTYPE_DEPRECATION = "`torch_dtype` is deprecated! Use `dtype` instead!"


class _JinaTorchDtypeWarningFilter(logging.Filter):
    """Hide a deprecation emitted by Jina's pinned Transformers remote code."""

    def filter(self, record: logging.LogRecord) -> bool:
        return record.getMessage() != _TORCH_DTYPE_DEPRECATION


@contextmanager
def _suppress_jina_torch_dtype_deprecation():
    """Suppress only Jina v3's obsolete config property during model loading.

    The pinned remote implementation assigns ``config.torch_dtype`` internally,
    so callers cannot replace it with ``dtype``. Keep all unrelated Transformers
    diagnostics visible.
    """
    warning_filter = _JinaTorchDtypeWarningFilter()
    transformers_loggers = [
        logging.getLogger("transformers.configuration_utils"),
        logging.getLogger("transformers.modeling_utils"),
    ]
    for transformers_logger in transformers_loggers:
        transformers_logger.addFilter(warning_filter)
    try:
        yield
    finally:
        for transformers_logger in transformers_loggers:
            transformers_logger.removeFilter(warning_filter)


def _hf_modules_cache() -> Path:
    from transformers.utils import HF_MODULES_CACHE

    return Path(HF_MODULES_CACHE)


def _quarantine_incomplete_dynamic_module(exc: FileNotFoundError) -> bool:
    """Move only the broken remote-code revision aside so Transformers can rebuild it.

    A cancelled Hugging Face download can leave the dynamic-module destination
    directory present but incomplete. Transformers then trusts that directory
    and fails on every later startup, even when the hub snapshot is complete.
    Never touch paths outside the pinned code revision used by this encoder.
    """
    if not exc.filename:
        return False
    missing_path = Path(exc.filename).expanduser()
    revision_dir = missing_path.parent
    try:
        cache_root = _hf_modules_cache().expanduser().resolve()
        resolved_revision_dir = revision_dir.resolve()
    except (OSError, RuntimeError):
        return False
    if (
        resolved_revision_dir.name != MODEL_CODE_REVISION
        or cache_root not in resolved_revision_dir.parents
        or not resolved_revision_dir.is_dir()
    ):
        return False
    quarantine = resolved_revision_dir.with_name(
        f"{MODEL_CODE_REVISION}.incomplete-{os.getpid()}-{time.time_ns()}"
    )
    try:
        resolved_revision_dir.rename(quarantine)
    except OSError:
        logger.exception("Could not quarantine incomplete Hugging Face module cache")
        return False
    logger.warning(
        "Quarantined incomplete Hugging Face module cache %s; rebuilding pinned revision",
        quarantine,
    )
    return True


def _from_pretrained_with_cache_repair(auto_model):
    kwargs = {
        "revision": MODEL_REVISION,
        "code_revision": MODEL_CODE_REVISION,
        "trust_remote_code": True,
        "use_flash_attn": False,
    }
    with _suppress_jina_torch_dtype_deprecation():
        try:
            return auto_model.from_pretrained(MODEL_NAME, **kwargs)
        except FileNotFoundError as exc:
            if not _quarantine_incomplete_dynamic_module(exc):
                raise
            return auto_model.from_pretrained(MODEL_NAME, **kwargs)


@lru_cache(maxsize=1)
def _load_model():
    try:
        import torch
        from transformers import AutoModel
    except ModuleNotFoundError as exc:
        raise ModuleNotFoundError(
            "torch and transformers are required for retrieval. "
            "Install the repository environment from environment.yml."
        ) from exc

    logger.info("Loading embedding model %s", MODEL_NAME)
    model = _from_pretrained_with_cache_repair(AutoModel)
    if torch.cuda.is_available():
        device = "cuda"
    elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"
    model = model.to(device).eval()
    logger.info("Embedding model ready on %s", device)
    return model


def preload() -> None:
    """Load the embedding model before the first user query."""
    _load_model()


def project_embedding(embeddings: np.ndarray) -> np.ndarray:
    """Project embeddings to the configured dimension and normalize."""
    if embeddings.shape[1] < EMBEDDING_DIM:
        raise ValueError(
            f"Embedding has {embeddings.shape[1]} dimensions; expected at least {EMBEDDING_DIM}."
        )
    projected = embeddings[:, :EMBEDDING_DIM].astype(np.float32, copy=False)
    norms = np.linalg.norm(projected, axis=1, keepdims=True)
    return projected / np.clip(norms, 1e-12, None)


def _text_batches(texts: Sequence[str]) -> list[list[str]]:
    """Keep very long inputs in small batches to avoid padding-driven OOMs."""
    batches: list[list[str]] = []
    current: list[str] = []
    current_characters = 0
    for text in texts:
        text_characters = max(1, len(text))
        if current and (
            len(current) >= BATCH_SIZE
            or current_characters + text_characters > MAX_BATCH_CHARACTERS
        ):
            batches.append(current)
            current = []
            current_characters = 0
        current.append(text)
        current_characters += text_characters
    if current:
        batches.append(current)
    return batches


def encode(
    texts: Sequence[str],
    *,
    task: EmbeddingTask = DOCUMENT_TASK,
    progress_callback: Callable[[int, int], None] | None = None,
) -> np.ndarray:
    """Return L2-normalised embeddings of shape ``(N, D)`` as float32.

    Args:
        texts: Strings to embed.
        task: Jina's asymmetric retrieval adapter. Index documents use
            ``retrieval.passage`` and live searches use ``retrieval.query``.

    Returns:
        ``numpy`` array of shape ``(len(texts), hidden_dim)``, dtype float32,
        with each row L2-normalised (cosine similarity == inner product).
    """
    if task not in {DOCUMENT_TASK, QUERY_TASK}:
        raise ValueError(f"Unsupported embedding task: {task}")
    if not texts:
        return np.empty((0, EMBEDDING_DIM), dtype=np.float32)

    model = _load_model()
    values = list(texts)

    all_embeddings: list[np.ndarray] = []
    total = len(values)
    if progress_callback is not None:
        progress_callback(0, total)
    processed = 0
    for batch in _text_batches(values):
        embeddings = model.encode(
            batch,
            task=task,
            batch_size=len(batch),
            max_length=MAX_LENGTH,
            truncate_dim=EMBEDDING_DIM,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        )
        projected = project_embedding(np.asarray(embeddings))
        all_embeddings.append(projected)
        processed += len(batch)
        if progress_callback is not None:
            progress_callback(processed, total)

    return np.concatenate(all_embeddings, axis=0)


@lru_cache(maxsize=QUERY_CACHE_SIZE)
def _encode_query_cached(query: str) -> np.ndarray:
    return encode([query], task=QUERY_TASK).astype(np.float32)


def encode_query(query: str) -> np.ndarray:
    """Return a cached query embedding copy so callers cannot mutate the cache."""
    return _encode_query_cached(query).copy()


def clear_query_cache() -> None:
    _encode_query_cached.cache_clear()
