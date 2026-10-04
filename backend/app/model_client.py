import json
import re
import time
from dataclasses import dataclass
from typing import Any

import httpx

from .config import ModelSettings
from .json_utils import parse_json_object_relaxed

# Transport-level errors that are worth retrying (connection dropped mid-flight,
# read timeouts, etc.) as opposed to 4xx/5xx responses which we let surface.
_TRANSIENT_HTTP_ERRORS = (
    httpx.RemoteProtocolError,
    httpx.ReadError,
    httpx.ReadTimeout,
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.PoolTimeout,
)
_MAX_MODEL_ATTEMPTS = 3
_MODEL_RETRY_BACKOFF_SECONDS = 1.5


class ModelClientError(RuntimeError):
    """Raised when the external model service fails or returns malformed output."""


@dataclass
class OpenAICompatibleModelClient:
    settings: ModelSettings

    def create_json_completion(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        image_data_url: str | None = None,
        temperature: float = 0.2,
        timeout_seconds: float | None = None,
        max_attempts: int = _MAX_MODEL_ATTEMPTS,
    ) -> dict[str, Any]:
        if not self.settings.is_configured:
            raise ModelClientError("Model service is not configured.")

        messages = _build_messages(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            image_data_url=image_data_url,
        )
        payload = {
            "model": self.settings.model_name,
            "messages": messages,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        }

        api_style = _api_style(self.settings)
        endpoint = _api_endpoint(self.settings.base_url or "", "/v1/responses" if api_style == "responses" else "/v1/chat/completions")
        headers = {
            "Authorization": f"Bearer {self.settings.api_key}",
            "Content-Type": "application/json",
        }
        request_payload = (
            _responses_payload(
                model=str(self.settings.model_name),
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                image_data_url=image_data_url,
                            temperature=_responses_temperature(self.settings, temperature),
                            json_mode=True,
                        )
            if api_style == "responses"
            else payload
        )

        last_exc: Exception | None = None
        attempts = max(1, max_attempts)
        request_timeout = timeout_seconds if timeout_seconds is not None else self.settings.timeout_seconds
        for attempt in range(attempts):
            try:
                with httpx.Client(timeout=request_timeout) as client:
                    response = client.post(endpoint, headers=headers, json=request_payload)

                if response.status_code >= 400:
                    retry_payload = (
                        _responses_payload(
                            model=str(self.settings.model_name),
                            system_prompt=system_prompt,
                            user_prompt=user_prompt,
                            image_data_url=image_data_url,
                            temperature=_responses_temperature(self.settings, temperature),
                            json_mode=False,
                        )
                        if api_style == "responses"
                        else {
                            "model": self.settings.model_name,
                            "messages": payload["messages"],
                            "temperature": temperature,
                        }
                    )
                    with httpx.Client(timeout=request_timeout) as client:
                        retry_response = client.post(endpoint, headers=headers, json=retry_payload)
                    _raise_for_status_with_body(retry_response)
                    return _parse_model_json_payload(retry_response.json(), api_style)

                _raise_for_status_with_body(response)
                return _parse_model_json_payload(response.json(), api_style)
            except _TRANSIENT_HTTP_ERRORS as exc:
                last_exc = exc
                if attempt < attempts - 1:
                    time.sleep(_MODEL_RETRY_BACKOFF_SECONDS * (attempt + 1))
                    continue
                raise ModelClientError(f"Model request failed: {exc}") from exc
            except httpx.HTTPError as exc:
                raise ModelClientError(f"Model request failed: {exc}") from exc
            except (KeyError, IndexError, json.JSONDecodeError, TypeError, ValueError) as exc:
                raise ModelClientError(f"Model response parsing failed: {exc}") from exc

        raise ModelClientError(f"Model request failed: {last_exc}")

    def create_text_completion(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        image_data_url: str | None = None,
        temperature: float = 0.2,
        timeout_seconds: float | None = None,
        max_attempts: int = _MAX_MODEL_ATTEMPTS,
    ) -> str:
        """Plain chat completion returning the raw assistant text (no JSON parsing).

        Used when we want the model to emit a non-JSON artifact such as draw.io XML.
        """
        if not self.settings.is_configured:
            raise ModelClientError("Model service is not configured.")

        messages = _build_messages(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            image_data_url=image_data_url,
        )
        payload = {
            "model": self.settings.model_name,
            "messages": messages,
            "temperature": temperature,
        }

        api_style = _api_style(self.settings)
        endpoint = _api_endpoint(self.settings.base_url or "", "/v1/responses" if api_style == "responses" else "/v1/chat/completions")
        headers = {
            "Authorization": f"Bearer {self.settings.api_key}",
            "Content-Type": "application/json",
        }
        request_payload = (
            _responses_payload(
                model=str(self.settings.model_name),
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                image_data_url=image_data_url,
                            temperature=_responses_temperature(self.settings, temperature),
                            json_mode=False,
                        )
            if api_style == "responses"
            else payload
        )

        # Slow reasoning models behind aggregators (e.g. gpt-5) sometimes drop the
        # connection mid-flight ("Server disconnected without sending a response").
        # Retry such transient transport errors a couple of times before giving up.
        last_exc: Exception | None = None
        attempts = max(1, max_attempts)
        request_timeout = timeout_seconds if timeout_seconds is not None else self.settings.timeout_seconds
        for attempt in range(attempts):
            try:
                with httpx.Client(timeout=request_timeout) as client:
                    response = client.post(endpoint, headers=headers, json=request_payload)
                _raise_for_status_with_body(response)
                return _extract_model_text(response.json(), api_style)
            except _TRANSIENT_HTTP_ERRORS as exc:
                last_exc = exc
                if attempt < attempts - 1:
                    time.sleep(_MODEL_RETRY_BACKOFF_SECONDS * (attempt + 1))
                    continue
                raise ModelClientError(f"Model request failed: {exc}") from exc
            except httpx.HTTPError as exc:
                raise ModelClientError(f"Model request failed: {exc}") from exc
            except (KeyError, IndexError, TypeError, ValueError) as exc:
                raise ModelClientError(f"Model response parsing failed: {exc}") from exc

        raise ModelClientError(f"Model request failed: {last_exc}")


def _build_messages(
    *,
    system_prompt: str,
    user_prompt: str,
    image_data_url: str | None = None,
) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    if image_data_url:
        if not image_data_url.startswith("data:"):
            raise ModelClientError("Image input must be a data URL.")
        messages.append(
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_prompt},
                    {"type": "image_url", "image_url": {"url": image_data_url}},
                ],
            }
        )
    else:
        messages.append({"role": "user", "content": user_prompt})
    return messages


def _api_style(settings: ModelSettings) -> str:
    style = str(getattr(settings, "api_style", "chat") or "chat").strip().lower()
    if style in {"responses", "response"}:
        return "responses"
    if style in {"chat", "chat_completions", "chat-completions", "poe_chat", "poe-chat"}:
        return "chat"
    return "chat"


def _api_endpoint(base_url: str, path: str) -> str:
    base = base_url.rstrip("/")
    suffix = path if path.startswith("/") else f"/{path}"
    if base.endswith("/v1") and suffix.startswith("/v1/"):
        suffix = suffix[3:]
    return f"{base}{suffix}"


def _responses_temperature(settings: ModelSettings, temperature: float | None) -> float | None:
    """OpenAI GPT-5 Responses models reject custom temperature values."""
    model = str(settings.model_name or "").strip().lower()
    base_url = str(settings.base_url or "").strip().lower()
    if "api.openai.com" in base_url and re.match(r"^gpt-5(?:[.\-]|$)", model):
        return None
    return temperature


def _responses_payload(
    *,
    model: str,
    system_prompt: str,
    user_prompt: str,
    image_data_url: str | None,
    temperature: float,
    json_mode: bool,
) -> dict[str, Any]:
    user_content: list[dict[str, Any]] = [{"type": "input_text", "text": user_prompt}]
    if image_data_url:
        if not image_data_url.startswith("data:"):
            raise ModelClientError("Image input must be a data URL.")
        user_content.append({"type": "input_image", "image_url": image_data_url})

    payload: dict[str, Any] = {
        "model": model,
        "input": [
            {"role": "system", "content": [{"type": "input_text", "text": system_prompt}]},
            {"role": "user", "content": user_content},
        ],
    }
    if temperature is not None:
        payload["temperature"] = temperature
    if json_mode:
        payload["text"] = {"format": {"type": "json_object"}}
    return payload


def _raise_for_status_with_body(response: httpx.Response) -> None:
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = response.text
        if detail:
            detail = detail[:2000]
            raise ModelClientError(f"Model request failed: {exc}; response body: {detail}") from exc
        raise ModelClientError(f"Model request failed: {exc}") from exc


def _extract_model_text(payload: dict[str, Any], api_style: str) -> str:
    if api_style == "responses":
        return _extract_responses_text(payload)
    return _extract_message_text(payload)


def _parse_model_json_payload(payload: dict[str, Any], api_style: str) -> dict[str, Any]:
    if api_style == "responses":
        return parse_json_object_relaxed(_extract_responses_text(payload))
    return _parse_json_payload(payload)


def _extract_responses_text(payload: dict[str, Any]) -> str:
    output_text = payload.get("output_text")
    if isinstance(output_text, str):
        return output_text

    chunks: list[str] = []
    for item in payload.get("output", []) or []:
        if not isinstance(item, dict):
            continue
        for part in item.get("content", []) or []:
            if not isinstance(part, dict):
                continue
            text = part.get("text")
            if isinstance(text, str):
                chunks.append(text)
            elif isinstance(part.get("output_text"), str):
                chunks.append(str(part["output_text"]))
    if chunks:
        return "".join(chunks)
    raise ValueError("Responses API payload did not include output text.")


def _extract_message_text(payload: dict[str, Any]) -> str:
    content = payload["choices"][0]["message"]["content"]
    if isinstance(content, list):
        return "".join(part.get("text", "") for part in content if isinstance(part, dict))
    return str(content)


def _parse_json_payload(payload: dict[str, Any]) -> dict[str, Any]:
    content = payload["choices"][0]["message"]["content"]

    if isinstance(content, list):
        text_content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
    else:
        text_content = str(content)

    parsed = parse_json_object_relaxed(text_content)
    return parsed
