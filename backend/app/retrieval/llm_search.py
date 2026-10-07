"""Structured-output LLM layer for retrieval query planning."""

from __future__ import annotations

from functools import lru_cache

from openai import OpenAI
from pydantic import BaseModel, ConfigDict, Field

from ..config import ModelSettings, get_retrieval_model_settings


class RetrievalLLMError(RuntimeError):
    """Raised when retrieval can continue safely without the LLM stage."""


class RetrievalQueryPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    idea_query: str = Field(min_length=1, max_length=4000)
    structure_query: str | None = Field(default=None, max_length=4000)
    style_query: str | None = Field(default=None, max_length=4000)


_DECOMPOSE_INSTRUCTIONS = """
You prepare retrieval queries for scientific figure references. The user gives
one drawing prompt. Return at most three coherent, self-contained descriptions:

- idea_query: preserve the research problem, core mechanism, inputs/outputs,
  and explanatory intent. This is always required.
- structure_query: emphasize modules, groups, topology, reading order, branches,
  loops, and connections. Keep the relevant method context, but do not invent a
  layout or modules that the user did not provide. Return null only when no
  process or organization can reasonably be derived.
- style_query: emphasize only explicitly requested visual language, rendering,
  palette, typography, and motifs. Return null when the user did not express a
  style preference. Never infer a preferred style merely because this is a
  scientific figure.

Do not emit keyword bags or mechanically split the prompt into fragments. Each
non-null query must stand alone and retain enough context for semantic search.
""".strip()


def decompose_query(
    prompt: str,
    settings: ModelSettings | None = None,
) -> RetrievalQueryPlan:
    resolved = settings or get_retrieval_model_settings()
    if not resolved.is_configured:
        raise RetrievalLLMError("Retrieval model is not configured.")
    return _decompose_query_cached(prompt.strip(), resolved)


@lru_cache(maxsize=256)
def _decompose_query_cached(prompt: str, settings: ModelSettings) -> RetrievalQueryPlan:
    try:
        response = _client(settings).responses.parse(
            model=settings.model_name,
            instructions=_DECOMPOSE_INSTRUCTIONS,
            input=prompt,
            text_format=RetrievalQueryPlan,
            text={"verbosity": "low"},
            reasoning={"effort": "low"},
            max_output_tokens=1200,
            store=False,
        )
        parsed = response.output_parsed
        if parsed is None:
            raise RetrievalLLMError("Query decomposition returned no structured output.")
        return parsed
    except RetrievalLLMError:
        raise
    except Exception as exc:  # OpenAI transport, refusal, or schema parsing error
        raise RetrievalLLMError(f"Query decomposition failed: {exc}") from exc


def _client(settings: ModelSettings) -> OpenAI:
    return OpenAI(
        api_key=settings.api_key,
        base_url=settings.base_url,
        timeout=settings.timeout_seconds,
        max_retries=1,
    )
