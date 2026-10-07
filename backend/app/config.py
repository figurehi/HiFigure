import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)


DEFAULT_RESPONSES_IMAGE_MODEL = "gpt-5.6-sol"


@dataclass(frozen=True)
class ModelSettings:
    base_url: str | None
    api_key: str | None
    model_name: str | None
    timeout_seconds: float
    api_style: str = "chat"

    @property
    def is_configured(self) -> bool:
        return bool(self.base_url and self.api_key and self.model_name)


@dataclass(frozen=True)
class ImageModelSettings(ModelSettings):
    api_style: str = "openai_sdk"
    response_format: str = "b64_json"


@dataclass(frozen=True)
class VectorizerSettings:
    endpoint: str
    api_id: str | None
    api_secret: str | None
    mode: str
    timeout_seconds: float

    @property
    def is_configured(self) -> bool:
        return bool(self.api_id and self.api_secret)


def _env_or_none(name: str) -> str | None:
    value = os.getenv(name)
    return value or None


def _resolve_env_reference(value: str | None) -> str | None:
    if not value:
        return None
    if value.startswith("${") and value.endswith("}"):
        return _env_or_none(value[2:-1])
    return value


@lru_cache
def get_text_model_settings() -> ModelSettings:
    timeout_raw = os.getenv("TEXT_MODEL_TIMEOUT_SECONDS", "60")

    try:
        timeout_seconds = float(timeout_raw)
    except ValueError:
        timeout_seconds = 60.0

    # Fall back to IMAGE_MODEL credentials if TEXT_MODEL_* are not set.
    # Useful when both text and image go through the same aggregator endpoint.
    fallback_base_url = _env_or_none("IMAGE_MODEL_BASE_URL") or _env_or_none("MODEL_BASE_URL")
    fallback_api_key = _env_or_none("IMAGE_MODEL_API_KEY") or _env_or_none("MODEL_API_KEY")

    return ModelSettings(
        base_url=_resolve_env_reference(_env_or_none("TEXT_MODEL_BASE_URL")) or fallback_base_url,
        api_key=_resolve_env_reference(_env_or_none("TEXT_MODEL_API_KEY")) or fallback_api_key,
        model_name=os.getenv("TEXT_MODEL_NAME"),
        timeout_seconds=timeout_seconds,
        api_style=os.getenv("TEXT_MODEL_API_STYLE", os.getenv("MODEL_API_STYLE", "chat")),
    )


@lru_cache
def get_image_model_settings() -> ImageModelSettings:
    timeout_raw = os.getenv("IMAGE_MODEL_TIMEOUT_SECONDS", os.getenv("MODEL_TIMEOUT_SECONDS", "120"))
    api_style = os.getenv("IMAGE_MODEL_API_STYLE", "openai_sdk")
    default_model = (
        DEFAULT_RESPONSES_IMAGE_MODEL
        if api_style == "openai_responses_image_tool"
        else "gpt-image-2"
    )

    try:
        timeout_seconds = float(timeout_raw)
    except ValueError:
        timeout_seconds = 120.0

    return ImageModelSettings(
        base_url=os.getenv(
            "IMAGE_MODEL_BASE_URL",
            os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        ),
        api_key=os.getenv(
            "IMAGE_MODEL_API_KEY",
            os.getenv("OPENAI_API_KEY", os.getenv("MODEL_API_KEY")),
        ),
        model_name=_env_or_none("IMAGE_MODEL_NAME") or default_model,
        timeout_seconds=timeout_seconds,
        api_style=api_style,
        response_format=os.getenv("IMAGE_RESPONSE_FORMAT", "b64_json"),
    )


@lru_cache
def get_retrieval_model_settings() -> ModelSettings:
    """OpenAI Responses API settings for retrieval query planning.

    Query planning uses its own credentials when provided. For a minimal local
    setup, the image-model credential is reused only when it points at the
    official OpenAI API; arbitrary image gateways are not assumed to support
    strict Responses API parsing.
    """
    timeout_raw = os.getenv("RETRIEVAL_MODEL_TIMEOUT_SECONDS", "60")
    try:
        timeout_seconds = float(timeout_raw)
    except ValueError:
        timeout_seconds = 60.0

    image_base_url = _resolve_env_reference(_env_or_none("IMAGE_MODEL_BASE_URL"))
    official_image_fallback = bool(
        image_base_url and "api.openai.com" in image_base_url.lower()
    )
    fallback_base_url = image_base_url if official_image_fallback else None
    fallback_api_key = (
        _resolve_env_reference(_env_or_none("IMAGE_MODEL_API_KEY"))
        if official_image_fallback
        else None
    )

    return ModelSettings(
        base_url=(
            _resolve_env_reference(_env_or_none("RETRIEVAL_MODEL_BASE_URL"))
            or _resolve_env_reference(_env_or_none("OPENAI_BASE_URL"))
            or fallback_base_url
            or "https://api.openai.com/v1"
        ),
        api_key=(
            _resolve_env_reference(_env_or_none("RETRIEVAL_MODEL_API_KEY"))
            or _resolve_env_reference(_env_or_none("OPENAI_API_KEY"))
            or fallback_api_key
        ),
        model_name=(
            _env_or_none("RETRIEVAL_MODEL_NAME")
            or "gpt-5.4-mini"
        ),
        timeout_seconds=timeout_seconds,
        api_style="responses",
    )


@lru_cache
def get_vectorizer_settings() -> VectorizerSettings:
    timeout_raw = os.getenv("VECTORIZER_TIMEOUT_SECONDS", "180")

    try:
        timeout_seconds = float(timeout_raw)
    except ValueError:
        timeout_seconds = 180.0

    return VectorizerSettings(
        endpoint=os.getenv("VECTORIZER_ENDPOINT", "https://vectorizer.ai/api/v1/vectorize"),
        api_id=os.getenv("VECTORIZER_API_ID"),
        api_secret=os.getenv("VECTORIZER_API_SECRET"),
        mode=os.getenv("VECTORIZER_MODE", "test"),
        timeout_seconds=timeout_seconds,
    )
