import re
import time
import logging
import os
import base64
import binascii
import io
import json
from dataclasses import dataclass
from typing import Any, Callable

import httpx
from PIL import Image, ImageOps, UnidentifiedImageError

from .config import DEFAULT_RESPONSES_IMAGE_MODEL, ImageModelSettings
from .prompts.image_generation import (
    image_generation_provider_prompt as _image_generation_provider_prompt,
    responses_reference_preface as _responses_reference_preface,
)

logger = logging.getLogger(__name__)

_SUPPORTED_IMAGE_DATA_URL_RE = re.compile(
    r"^data:image/(?:png|jpeg|jpg|webp|gif);base64,",
    re.IGNORECASE,
)
_IMAGE_DATA_URL_RE = re.compile(
    r"^data:image/(?P<mime>png|jpeg|jpg|webp|gif);base64,(?P<data>.+)$",
    re.IGNORECASE | re.DOTALL,
)

# Keep the four authoritative visual slots centralized so no transport silently
# drops Layout, Style, Skeleton, or the optional icon contact sheet.
_MAX_REFERENCE_IMAGES = 4


class ImageClientError(RuntimeError):
    """Raised when the external image service fails or returns malformed output."""


_TRANSIENT_HTTP_ERRORS = (
    httpx.RemoteProtocolError,
    httpx.ReadError,
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.PoolTimeout,
)


def _env_int(name: str, fallback: int) -> int:
    try:
        return int(os.getenv(name, str(fallback)))
    except ValueError:
        return fallback


def _env_float(name: str, fallback: float) -> float:
    try:
        return float(os.getenv(name, str(fallback)))
    except ValueError:
        return fallback


def _env_bool(name: str, fallback: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return fallback
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class GeneratedImage:
    image_url: str | None
    image_data_url: str | None
    revised_prompt: str | None = None


ImagePartialCallback = Callable[[GeneratedImage, int], None]


@dataclass
class OpenAIImageClient:
    settings: ImageModelSettings

    def generate_image(
        self,
        prompt: str,
        *,
        size: str = "1024x1024",
        reference_images: list[str] | None = None,
        reference_role: str = "inspiration",
        edit_mask_image: str | None = None,
        timeout_seconds: float | None = None,
        partial_images: int = 0,
        on_partial: ImagePartialCallback | None = None,
    ) -> GeneratedImage:
        if not self.settings.is_configured:
            raise ImageClientError("Image model service is not configured.")

        timeout = timeout_seconds or self.settings.timeout_seconds
        safe_reference_images = _supported_reference_images(reference_images or [])
        requested_partials = max(0, min(3, partial_images))
        stream_partials = (
            requested_partials
            if on_partial is not None and _env_bool("IMAGE_MODEL_STREAM", False)
            else 0
        )

        api_style = _api_style(self.settings)

        if api_style == "openai_responses_image_tool":
            return self._generate_with_openai_responses_image_tool(
                prompt=prompt,
                size=size,
                reference_images=safe_reference_images,
                reference_role=reference_role,
                edit_mask_image=edit_mask_image,
                timeout=timeout,
                partial_images=stream_partials,
                on_partial=on_partial,
            )

        if api_style == "openai_sdk":
            return self._generate_with_openai_sdk(
                prompt=prompt,
                size=size,
                reference_images=safe_reference_images,
                reference_role=reference_role,
                edit_mask_image=edit_mask_image,
                timeout=timeout,
                partial_images=stream_partials,
                on_partial=on_partial,
            )

        if api_style == "openai_images":
            return self._generate_with_openai_images(prompt=prompt, size=size, timeout=timeout)

        raise ImageClientError(f"Unsupported OpenAI image API style: {api_style}")

    def _generate_with_openai_images(self, prompt: str, *, size: str, timeout: float) -> GeneratedImage:
        payload = {
            "model": self.settings.model_name,
            "prompt": prompt,
            "size": size,
            "response_format": self.settings.response_format,
        }

        endpoint = _api_endpoint(self.settings.base_url or "", "/v1/images/generations")
        headers = _build_auth_headers(self.settings.api_key)

        try:
            response = _post_json_with_transient_retries(
                endpoint=endpoint,
                headers=headers,
                payload=payload,
                timeout=timeout,
            )
            _raise_for_status_with_body(response)

            body = response.json()
            data = body["data"][0]
            image_url = data.get("url")
            image_data_url = None
            if "b64_json" in data and data["b64_json"]:
                image_data_url = f"data:image/png;base64,{data['b64_json']}"

            return GeneratedImage(
                image_url=image_url,
                image_data_url=image_data_url,
                revised_prompt=data.get("revised_prompt"),
            )
        except httpx.TimeoutException as exc:
            raise ImageClientError(f"Image generation request timed out after {timeout} seconds.") from exc
        except httpx.HTTPError as exc:
            raise ImageClientError(f"Image generation request failed: {exc}") from exc
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise ImageClientError(f"Image generation parsing failed: {exc}") from exc

    def _generate_with_openai_sdk(
        self,
        prompt: str,
        *,
        size: str,
        reference_images: list[str],
        reference_role: str,
        edit_mask_image: str | None,
        timeout: float,
        partial_images: int,
        on_partial: ImagePartialCallback | None,
    ) -> GeneratedImage:
        client_cls = _openai_sdk_client_class()
        client_kwargs: dict[str, Any] = {"api_key": self.settings.api_key, "timeout": timeout}
        if self.settings.base_url:
            client_kwargs["base_url"] = self.settings.base_url
        client = client_cls(**client_kwargs)

        selected_reference_images = reference_images[:_MAX_REFERENCE_IMAGES]
        prepared_masked_edit = (
            _prepare_openai_masked_edit_files(selected_reference_images[0], edit_mask_image)
            if selected_reference_images and edit_mask_image
            else None
        )
        mask_file: io.BytesIO | None = None
        if prepared_masked_edit is not None:
            source_file, mask_file = prepared_masked_edit
            reference_files = [
                source_file,
                *_openai_sdk_reference_files(selected_reference_images[1:]),
            ]
        else:
            reference_files = _openai_sdk_reference_files(selected_reference_images)
        output_format = _openai_sdk_output_format()
        model = self.settings.model_name or "gpt-image-2"
        configured_size = os.getenv("IMAGE_MODEL_SIZE", "").strip()
        request_size = size if prepared_masked_edit is not None else configured_size or size

        def build_payload(images: list[str], files: list[io.BytesIO]) -> dict[str, Any]:
            sent_prompt = _image_generation_provider_prompt(
                prompt=prompt,
                reference_images=images,
                reference_role=reference_role,
                output_instruction=f"Output: one generated scientific diagram image, preferred size {request_size}.",
            )
            return _openai_sdk_image_options(
                model=model,
                prompt=sent_prompt if files else prompt,
                size=request_size,
                output_format=output_format,
                include_moderation=not files,
            )

        payload = build_payload(selected_reference_images, reference_files)
        stream_enabled = partial_images > 0 and on_partial is not None
        if stream_enabled:
            payload.update({"stream": True, "partial_images": partial_images})

        try:
            if reference_files:
                logger.warning(
                    "OpenAI SDK image edit configured; model=%s refs=%d mask=%s size=%s quality=%s stream=%s partials=%d.",
                    payload["model"],
                    len(reference_files),
                    mask_file is not None,
                    request_size,
                    payload.get("quality"),
                    stream_enabled,
                    partial_images,
                )
                edit_kwargs: dict[str, Any] = {"image": reference_files, **payload}
                if mask_file is not None:
                    edit_kwargs["mask"] = mask_file
                try:
                    result = client.images.edit(**edit_kwargs)
                except Exception as exc:
                    if not _is_openai_sdk_connection_error(exc):
                        raise
                    logger.warning(
                        "OpenAI SDK image edit connection failed with %d refs; retrying with the same required refs. reason=%s",
                        len(reference_files),
                        _openai_sdk_error_detail(exc),
                    )
                    for file_obj in reference_files:
                        file_obj.seek(0)
                    if mask_file is not None:
                        mask_file.seek(0)
                    result = client.images.edit(**edit_kwargs)
            else:
                logger.warning(
                    "OpenAI SDK image generation configured; model=%s refs=0 size=%s quality=%s stream=%s partials=%d.",
                    payload["model"],
                    request_size,
                    payload.get("quality"),
                    stream_enabled,
                    partial_images,
                )
                result = client.images.generate(**payload)
            if stream_enabled:
                return _consume_openai_image_stream(
                    result,
                    output_format=output_format,
                    on_partial=on_partial,
                )
            return _parse_openai_sdk_image_result(result, output_format=output_format)
        except ImageClientError:
            raise
        except Exception as exc:
            raise ImageClientError(
                f"OpenAI SDK image generation failed: {_openai_sdk_error_detail(exc)}"
            ) from exc

    def _generate_with_openai_responses_image_tool(
        self,
        prompt: str,
        *,
        size: str,
        reference_images: list[str],
        reference_role: str,
        edit_mask_image: str | None,
        timeout: float,
        partial_images: int,
        on_partial: ImagePartialCallback | None,
    ) -> GeneratedImage:
        client_cls = _openai_sdk_client_class()
        client_kwargs: dict[str, Any] = {"api_key": self.settings.api_key, "timeout": timeout}
        if self.settings.base_url:
            client_kwargs["base_url"] = self.settings.base_url
        client = client_cls(**client_kwargs)

        selected_reference_images = reference_images[:_MAX_REFERENCE_IMAGES]
        prepared_masked_edit = (
            _prepare_openai_masked_edit_files(selected_reference_images[0], edit_mask_image)
            if selected_reference_images and edit_mask_image
            else None
        )
        selected_reference_images = (
            [selected_reference_images[0], *_compact_reference_images(selected_reference_images[1:])]
            if prepared_masked_edit is not None
            else _compact_reference_images(selected_reference_images)
        )
        configured_size = os.getenv("IMAGE_MODEL_SIZE", "").strip()
        request_size = size if prepared_masked_edit is not None else configured_size or size

        stream_enabled = partial_images > 0 and on_partial is not None
        max_tool_calls = max(1, _env_int("IMAGE_MODEL_MAX_TOOL_CALLS", 1))
        use_background = _env_bool("IMAGE_MODEL_RESPONSES_BACKGROUND", True)

        def build_payload(
            images: list[str],
            *,
            source_file_id: str | None,
            mask_file_id: str | None,
        ) -> dict[str, Any]:
            sent_prompt = _image_generation_provider_prompt(
                prompt=prompt,
                reference_images=images,
                reference_role=reference_role,
                output_instruction=(
                    "Output: use the image_generation tool to return one generated scientific diagram image, "
                    f"preferred size {request_size}."
                ),
            )
            content: list[dict[str, Any]] = [{"type": "input_text", "text": sent_prompt}]
            first_inline_index = 0
            if source_file_id:
                content.append({"type": "input_image", "file_id": source_file_id})
                first_inline_index = 1
            for image_data_url in images[first_inline_index:]:
                if image_data_url.startswith("data:"):
                    content.append({"type": "input_image", "image_url": image_data_url})
            tool = _openai_responses_image_generation_tool(
                size=request_size,
                partial_images=partial_images if stream_enabled else 0,
                input_image_mask_file_id=mask_file_id,
            )
            payload = {
                "model": self.settings.model_name or DEFAULT_RESPONSES_IMAGE_MODEL,
                "input": [{"role": "user", "content": content}],
                "tools": [tool],
                "max_tool_calls": max_tool_calls,
            }
            payload.update(_openai_responses_model_options())
            if use_background and not stream_enabled:
                payload["background"] = True
            if stream_enabled:
                payload["stream"] = True
            return payload

        uploaded_file_ids: list[str] = []
        try:
            source_file_id: str | None = None
            mask_file_id: str | None = None
            if prepared_masked_edit is not None:
                source_file, mask_file = prepared_masked_edit
                source_file_id = _upload_openai_vision_file(client, source_file)
                uploaded_file_ids.append(source_file_id)
                mask_file_id = _upload_openai_vision_file(client, mask_file)
                uploaded_file_ids.append(mask_file_id)

            payload = build_payload(
                selected_reference_images,
                source_file_id=source_file_id,
                mask_file_id=mask_file_id,
            )
            tool = payload["tools"][0]
            logger.warning(
                "OpenAI Responses image tool configured; model=%s toolModel=%s refs=%d mask=%s size=%s quality=%s stream=%s partials=%d.",
                payload["model"],
                tool.get("model", "auto"),
                len(selected_reference_images),
                mask_file_id is not None,
                tool.get("size"),
                tool.get("quality"),
                stream_enabled,
                partial_images,
            )

            def create_response() -> Any:
                result = client.responses.create(**payload)
                if stream_enabled:
                    return _consume_responses_image_stream(result, on_partial=on_partial)
                return _resolve_openai_responses_image_result(client, result)

            try:
                result = create_response()
            except Exception as exc:
                if not _is_openai_sdk_connection_error(exc):
                    raise
                logger.warning(
                    "OpenAI Responses image tool connection failed with %d refs; retrying with the same required refs. reason=%s",
                    len(selected_reference_images),
                    _openai_sdk_error_detail(exc),
                )
                result = create_response()
            plain_result = _object_to_plain(result)
            try:
                return _parse_responses_image_payload(plain_result)
            except ValueError:
                logger.warning(
                    "OpenAI Responses image tool parse failed; output types=%s",
                    _responses_output_type_summary(plain_result),
                )
                raise
        except ImageClientError:
            raise
        except Exception as exc:
            raise ImageClientError(
                f"OpenAI Responses image tool generation failed: {_openai_sdk_error_detail(exc)}"
            ) from exc
        finally:
            _delete_openai_files(client, uploaded_file_ids)


def _image_data_url_from_b64(encoded: str, *, output_format: str = "png") -> str:
    mime = "image/jpeg" if output_format in {"jpg", "jpeg"} else f"image/{output_format or 'png'}"
    return f"data:{mime};base64,{encoded}"


def _emit_partial_image(
    callback: ImagePartialCallback | None,
    encoded: str,
    index: int,
    *,
    output_format: str,
) -> None:
    if callback is None or not encoded:
        return
    try:
        callback(
            GeneratedImage(
                image_url=None,
                image_data_url=_image_data_url_from_b64(encoded, output_format=output_format),
            ),
            index,
        )
    except Exception as exc:  # pragma: no cover - UI progress must not fail generation
        logger.warning("Ignoring image partial callback failure: %s", exc)


def _consume_openai_image_stream(
    stream: Any,
    *,
    output_format: str,
    on_partial: ImagePartialCallback | None,
) -> GeneratedImage:
    final_image: GeneratedImage | None = None
    for event in stream:
        event_type = str(_object_field(event, "type") or "")
        encoded = _object_field(event, "b64_json")
        event_format = str(_object_field(event, "output_format") or output_format or "png")
        if event_type in {"image_generation.partial_image", "image_edit.partial_image"}:
            _emit_partial_image(
                on_partial,
                str(encoded or ""),
                int(_object_field(event, "partial_image_index") or 0),
                output_format=event_format,
            )
        elif event_type in {"image_generation.completed", "image_edit.completed"} and encoded:
            final_image = GeneratedImage(
                image_url=None,
                image_data_url=_image_data_url_from_b64(str(encoded), output_format=event_format),
            )
    if final_image is None:
        raise ImageClientError("OpenAI image stream completed without a final image event.")
    return final_image


def _consume_responses_image_stream(
    stream: Any,
    *,
    on_partial: ImagePartialCallback | None,
) -> Any:
    completed_response: Any = None
    for event in stream:
        event_type = str(_object_field(event, "type") or "")
        if event_type == "response.image_generation_call.partial_image":
            _emit_partial_image(
                on_partial,
                str(_object_field(event, "partial_image_b64") or ""),
                int(_object_field(event, "partial_image_index") or 0),
                output_format="png",
            )
        elif event_type == "response.completed":
            completed_response = _object_field(event, "response")
        elif event_type in {"response.failed", "response.incomplete"}:
            response = _object_field(event, "response")
            detail = _openai_sdk_error_detail(response) if response is not None else event_type
            raise ImageClientError(f"OpenAI Responses image stream ended with {event_type}: {detail}")
    if completed_response is None:
        raise ImageClientError("OpenAI Responses image stream completed without a response.completed event.")
    return completed_response

def _post_json_with_transient_retries(
    *,
    endpoint: str,
    headers: dict[str, str],
    payload: dict[str, Any],
    timeout: float,
    attempts: int = 2,
) -> httpx.Response:
    last_error: httpx.HTTPError | None = None

    for attempt in range(1, attempts + 1):
        try:
            with httpx.Client(timeout=timeout) as client:
                return client.post(endpoint, headers=headers, json=payload)
        except _TRANSIENT_HTTP_ERRORS as exc:
            last_error = exc
            if attempt >= attempts:
                break
            time.sleep(min(0.75 * attempt, 2.0))

    assert last_error is not None
    raise last_error


def _raise_for_status_with_body(response: httpx.Response) -> None:
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = _compact_response_text(response)
        if detail:
            raise ImageClientError(f"Image generation request failed: {exc}; response body: {detail}") from exc
        raise ImageClientError(f"Image generation request failed: {exc}") from exc


def _compact_response_text(response: httpx.Response, limit: int = 900) -> str:
    text = response.text.strip()
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text)
    if len(text) <= limit:
        return text
    return f"{text[:limit]}..."


def _api_style(settings: ImageModelSettings) -> str:
    style = str(getattr(settings, "api_style", "openai_sdk") or "openai_sdk").strip().lower()
    if style in {
        "openai_responses_image_tool",
        "openai-responses-image-tool",
        "responses_image_tool",
        "responses-image-tool",
        "image_tool",
        "image-tool",
    }:
        return "openai_responses_image_tool"
    if style in {"openai_sdk", "openai-sdk", "official_openai", "official-openai"}:
        return "openai_sdk"
    if style in {"openai_images", "openai-images", "images", "image"}:
        return "openai_images"
    raise ImageClientError(
        "Unsupported IMAGE_MODEL_API_STYLE. Use openai_sdk, "
        "openai_responses_image_tool, or openai_images."
    )


def _api_endpoint(base_url: str, path: str) -> str:
    base = base_url.rstrip("/")
    suffix = path if path.startswith("/") else f"/{path}"
    if base.endswith("/v1") and suffix.startswith("/v1/"):
        suffix = suffix[3:]
    return f"{base}{suffix}"


def _parse_responses_image_payload(payload: dict[str, Any]) -> GeneratedImage:
    image_url: str | None = None
    image_data_url: str | None = None
    revised_prompt: str | None = None
    text_samples: list[str] = []

    def visit(value: Any) -> None:
        nonlocal image_url, image_data_url, revised_prompt
        if image_data_url or image_url:
            return
        if isinstance(value, dict):
            mime_type = str(
                value.get("mime_type")
                or value.get("mimeType")
                or value.get("media_type")
                or "image/png"
            )
            b64 = (
                value.get("b64_json")
                or value.get("base64")
                or value.get("image_base64")
                or value.get("data")
                or (
                    value.get("result")
                    if str(value.get("type") or "").lower()
                    in {"image_generation_call", "output_image", "image"}
                    else None
                )
            )
            if isinstance(b64, str) and b64.strip():
                image_data_url = (
                    b64 if b64.startswith("data:image/") else f"data:{mime_type};base64,{b64}"
                )
                return

            url = value.get("image_url") or value.get("url")
            if isinstance(url, dict):
                url = url.get("url") or url.get("href")
            if isinstance(url, str) and url.strip():
                _assign_extracted_image(url)
                return

            text = (
                value.get("text")
                or value.get("output_text")
                or value.get("content")
                or value.get("message")
            )
            if isinstance(text, str) and text.strip():
                _record_text(text)
                if _extract_and_assign_from_text(text):
                    return

            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)
        elif isinstance(value, str) and value.strip():
            _record_text(value)
            _extract_and_assign_from_text(value)

    def _record_text(text: str) -> None:
        nonlocal revised_prompt
        stripped = text.strip()
        if not stripped:
            return
        revised_prompt = revised_prompt or stripped
        if len(text_samples) < 3:
            text_samples.append(stripped)

    def _assign_extracted_image(extracted: str) -> None:
        nonlocal image_url, image_data_url
        cleaned = extracted.strip().rstrip(".,;")
        if cleaned.startswith("data:image/"):
            image_data_url = cleaned
        else:
            image_url = cleaned

    def _extract_and_assign_from_text(text: str) -> bool:
        extracted = _extract_image_from_text(text)
        if not extracted:
            return False
        _assign_extracted_image(extracted)
        return True

    visit(payload)
    if not image_url and not image_data_url:
        detail = _compact_text_snippet(" | ".join(text_samples))
        if detail:
            raise ValueError(f"Responses API payload did not include an image. Text response: {detail}")
        raise ValueError("Responses API payload did not include an image.")
    return GeneratedImage(
        image_url=image_url,
        image_data_url=image_data_url,
        revised_prompt=revised_prompt,
    )


def _openai_sdk_client_class():
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise ImageClientError(
            "OpenAI SDK is not installed. Install backend dependencies so `openai` is available."
        ) from exc
    return OpenAI


def _openai_sdk_reference_files(reference_images: list[str]) -> list[io.BytesIO]:
    max_side = max(320, _env_int("IMAGE_MODEL_REFERENCE_MAX_SIDE", 1400))
    jpeg_quality = max(45, min(95, _env_int("IMAGE_MODEL_REFERENCE_JPEG_QUALITY", 82)))
    max_bytes = max(0, _env_int("IMAGE_MODEL_REFERENCE_MAX_BYTES", 1_200_000))
    files: list[io.BytesIO] = []
    skipped = 0
    for index, image_data_url in enumerate(reference_images, start=1):
        next_url = image_data_url
        if image_data_url.startswith("data:image/"):
            next_url = _compact_data_url_image(
                image_data_url,
                max_side=max_side,
                jpeg_quality=jpeg_quality,
                max_bytes=max_bytes,
            )
            if next_url != image_data_url:
                logger.warning(
                    "OpenAI SDK reference image %d compacted from %.1fKB to %.1fKB.",
                    index,
                    _data_url_payload_bytes(image_data_url) / 1024,
                    _data_url_payload_bytes(next_url) / 1024,
                )
        file_obj = _openai_sdk_file_from_data_url(next_url, index=index)
        if file_obj is None:
            skipped += 1
            continue
        files.append(file_obj)
    if skipped:
        logger.warning(
            "OpenAI SDK image edit skipped unsupported/non-inline reference image(s); skipped=%d kept=%d",
            skipped,
            len(files),
        )
    return files


def _openai_sdk_file_from_data_url(data_url: str, *, index: int) -> io.BytesIO | None:
    match = _IMAGE_DATA_URL_RE.match(data_url)
    if not match:
        return None
    mime = match.group("mime").lower()
    try:
        raw = base64.b64decode(match.group("data"), validate=False)
    except (ValueError, binascii.Error):
        return None
    ext = "jpg" if mime in {"jpg", "jpeg"} else mime
    file_obj = io.BytesIO(raw)
    file_obj.name = f"reference_{index}.{ext}"
    return file_obj


def _prepare_openai_masked_edit_files(
    source_data_url: str,
    edit_mask_data_url: str,
) -> tuple[io.BytesIO, io.BytesIO] | None:
    """Return same-size PNG source/mask files using OpenAI's alpha-mask convention.

    HiChart exports a black/white scope image where white pixels are editable.
    OpenAI edits transparent mask pixels, so the exported luminance must be
    inverted when it becomes the mask's alpha channel.
    """
    source_match = _IMAGE_DATA_URL_RE.match(source_data_url)
    mask_match = _IMAGE_DATA_URL_RE.match(edit_mask_data_url)
    if not source_match or not mask_match:
        logger.warning("Native masked edit requires inline source and mask images; using fallback guidance.")
        return None
    try:
        source_raw = base64.b64decode(source_match.group("data"), validate=False)
        mask_raw = base64.b64decode(mask_match.group("data"), validate=False)
        source = ImageOps.exif_transpose(Image.open(io.BytesIO(source_raw))).convert("RGBA")
        edit_mask = ImageOps.exif_transpose(Image.open(io.BytesIO(mask_raw))).convert("L")
    except (ValueError, binascii.Error, OSError, UnidentifiedImageError) as exc:
        logger.warning("Could not prepare native masked edit files: %s", exc)
        return None

    if edit_mask.size != source.size:
        edit_mask = edit_mask.resize(source.size, Image.NEAREST)
    if edit_mask.getbbox() is None:
        logger.warning("Native masked edit skipped because the mask has no editable pixels.")
        return None

    source_file = io.BytesIO()
    source.save(source_file, format="PNG", optimize=True)
    source_file.name = "edit_source.png"
    source_file.seek(0)

    native_mask = Image.new("RGBA", source.size, (255, 255, 255, 255))
    native_mask.putalpha(ImageOps.invert(edit_mask))
    mask_file = io.BytesIO()
    native_mask.save(mask_file, format="PNG", optimize=True)
    mask_file.name = "edit_mask.png"
    mask_file.seek(0)
    return source_file, mask_file


def _upload_openai_vision_file(client: Any, file_obj: io.BytesIO) -> str:
    file_obj.seek(0)
    uploaded = client.files.create(file=file_obj, purpose="vision")
    file_id = _object_field(uploaded, "id")
    if not isinstance(file_id, str) or not file_id.strip():
        raise ImageClientError("OpenAI file upload did not return a file id.")
    return file_id


def _delete_openai_files(client: Any, file_ids: list[str]) -> None:
    for file_id in file_ids:
        try:
            client.files.delete(file_id)
        except Exception as exc:  # pragma: no cover - cleanup must not hide the edit result
            logger.warning("Could not delete temporary OpenAI vision file %s: %s", file_id, exc)


def _is_openai_sdk_connection_error(exc: Exception) -> bool:
    if exc.__class__.__name__ in {"APIConnectionError", "APITimeoutError"}:
        return True
    cause = getattr(exc, "__cause__", None) or getattr(exc, "__context__", None)
    if isinstance(cause, (TimeoutError, OSError)):
        return True
    return "connection error" in str(exc).lower()


def _openai_sdk_error_detail(exc: Exception) -> str:
    parts = [f"{exc.__class__.__name__}: {exc}"]
    cause = getattr(exc, "__cause__", None) or getattr(exc, "__context__", None)
    if cause is not None:
        parts.append(f"cause={cause.__class__.__name__}: {cause}")
    response = getattr(exc, "response", None)
    if response is not None:
        status_code = getattr(response, "status_code", None)
        text = getattr(response, "text", None)
        if status_code is not None:
            parts.append(f"status={status_code}")
        if text:
            parts.append(f"body={_compact_text_snippet(str(text), 500)}")
    body = getattr(exc, "body", None)
    if body:
        parts.append(f"body={_compact_text_snippet(str(body), 500)}")
    return "; ".join(parts)


def _resolve_openai_responses_image_result(client: Any, result: Any) -> Any:
    plain = _object_to_plain(result)
    response_id = _responses_payload_id(plain) or _object_field(result, "id")
    status = _responses_payload_status(plain) or _object_field(result, "status")
    if response_id:
        logger.warning(
            "OpenAI Responses image tool response id=%s status=%s.",
            response_id,
            status or "unknown",
        )
    if _responses_payload_has_image(plain):
        return result
    if not response_id:
        return result
    if _is_openai_responses_failure_status(status):
        detail = _openai_responses_failure_detail(plain)
        raise ImageClientError(
            f"OpenAI Responses image tool response {response_id} ended with status={status}.{detail}"
        )
    if status and not _is_openai_responses_active_status(status):
        return result

    retrieve = getattr(getattr(client, "responses", None), "retrieve", None)
    if not callable(retrieve):
        return result

    interval = max(0.2, _env_float("IMAGE_MODEL_RESPONSES_POLL_INTERVAL_SECONDS", 2.0))
    timeout = max(interval, _env_float("IMAGE_MODEL_RESPONSES_POLL_TIMEOUT_SECONDS", 600.0))
    deadline = time.monotonic() + timeout
    last_status = str(status or "")
    while time.monotonic() < deadline:
        time.sleep(interval)
        result = retrieve(response_id)
        plain = _object_to_plain(result)
        status = _responses_payload_status(plain) or _object_field(result, "status")
        if str(status or "") != last_status:
            logger.warning(
                "OpenAI Responses image tool response id=%s status=%s.",
                response_id,
                status or "unknown",
            )
            last_status = str(status or "")
        if _responses_payload_has_image(plain):
            return result
        if _is_openai_responses_failure_status(status):
            detail = _openai_responses_failure_detail(plain)
            raise ImageClientError(
                f"OpenAI Responses image tool response {response_id} ended with status={status}.{detail}"
            )
        if status and not _is_openai_responses_active_status(status):
            return result

    raise ImageClientError(
        f"OpenAI Responses image tool response {response_id} did not complete within {timeout:.0f}s."
    )


def _responses_payload_id(payload: Any) -> str | None:
    if isinstance(payload, dict):
        value = payload.get("id")
        if isinstance(value, str) and value.strip():
            return value
    return None


def _responses_payload_status(payload: Any) -> str | None:
    if isinstance(payload, dict):
        value = payload.get("status")
        if isinstance(value, str) and value.strip():
            return value
    return None


def _is_openai_responses_active_status(status: Any) -> bool:
    return str(status or "").strip().lower() in {"queued", "in_progress", "running"}


def _is_openai_responses_failure_status(status: Any) -> bool:
    return str(status or "").strip().lower() in {
        "failed",
        "cancelled",
        "canceled",
        "expired",
        "incomplete",
    }


def _openai_responses_failure_detail(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""

    parts: list[str] = []
    for key in ("error", "incomplete_details"):
        detail = payload.get(key)
        if detail:
            parts.append(f"{key}={_format_response_failure_value(detail)}")

    output_summary = _responses_output_type_summary(payload)
    if output_summary and output_summary != "(none)":
        parts.append(f"output_types={output_summary}")

    output_details = _responses_failure_output_details(payload.get("output"))
    if output_details:
        parts.append(f"output_details={output_details}")

    if not parts:
        return ""
    return " " + "; ".join(parts)


def _responses_failure_output_details(output: Any) -> str:
    if not isinstance(output, list):
        return ""

    details: list[str] = []
    for item in output:
        if not isinstance(item, dict):
            continue
        status = item.get("status")
        error = item.get("error")
        incomplete_details = item.get("incomplete_details")
        item_parts: list[str] = []
        if status:
            item_parts.append(f"status={status}")
        if error:
            item_parts.append(f"error={_format_response_failure_value(error)}")
        if incomplete_details:
            item_parts.append(f"incomplete_details={_format_response_failure_value(incomplete_details)}")
        if item_parts:
            item_type = item.get("type") or "output"
            details.append(f"{item_type}({', '.join(item_parts)})")
    return _compact_text_snippet(" | ".join(details), 700)


def _format_response_failure_value(value: Any) -> str:
    if isinstance(value, dict):
        important_keys = ("code", "type", "message", "reason", "param")
        parts = [
            f"{key}={value[key]}"
            for key in important_keys
            if value.get(key) is not None
        ]
        if parts:
            return _compact_text_snippet(", ".join(parts), 700)
    return _compact_text_snippet(str(value), 700)


def _responses_payload_has_image(payload: Any) -> bool:
    found = False

    def visit(value: Any) -> None:
        nonlocal found
        if found:
            return
        if isinstance(value, dict):
            value_type = str(value.get("type") or "").lower()
            if value_type in {"image_generation_call", "output_image", "image"}:
                for key in ("result", "b64_json", "base64", "image_base64", "data", "url", "image_url"):
                    candidate = value.get(key)
                    if isinstance(candidate, str) and candidate.strip():
                        found = True
                        return
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(payload)
    return found


def _responses_output_type_summary(payload: Any) -> str:
    types: list[str] = []

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            value_type = value.get("type")
            if isinstance(value_type, str) and value_type and len(types) < 24:
                types.append(value_type)
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(payload.get("output") if isinstance(payload, dict) else payload)
    return ", ".join(types) if types else "(none)"


def _openai_responses_image_generation_tool(
    *,
    size: str,
    partial_images: int = 0,
    input_image_mask_file_id: str | None = None,
) -> dict[str, Any]:
    tool: dict[str, Any] = {"type": "image_generation"}
    tool_model = os.getenv("IMAGE_MODEL_TOOL_MODEL", "").strip()
    if tool_model:
        tool["model"] = tool_model
    tool["size"] = size
    if partial_images > 0:
        tool["partial_images"] = max(1, min(3, partial_images))
    if input_image_mask_file_id:
        tool["input_image_mask"] = {"file_id": input_image_mask_file_id}
    quality = os.getenv("IMAGE_MODEL_QUALITY", "").strip()
    if quality:
        tool["quality"] = quality
    background = os.getenv("IMAGE_MODEL_BACKGROUND", "").strip()
    if background:
        tool["background"] = background
    moderation = os.getenv("IMAGE_MODEL_MODERATION", "").strip()
    if moderation:
        tool["moderation"] = moderation
    output_format = _openai_sdk_output_format()
    if output_format:
        tool["output_format"] = output_format
    compression = os.getenv("IMAGE_MODEL_OUTPUT_COMPRESSION", "").strip()
    if compression and output_format in {"jpeg", "webp"}:
        try:
            tool["output_compression"] = max(0, min(100, int(compression)))
        except ValueError:
            logger.warning("Ignoring invalid IMAGE_MODEL_OUTPUT_COMPRESSION=%s", compression)
    return tool


def _openai_responses_model_options() -> dict[str, Any]:
    options: dict[str, Any] = {}
    effort = os.getenv("IMAGE_MODEL_REASONING_EFFORT", "").strip().lower()
    if effort in {"minimal", "low", "medium", "high"}:
        options["reasoning"] = {"effort": effort}
    elif effort:
        logger.warning("Ignoring invalid IMAGE_MODEL_REASONING_EFFORT=%s", effort)

    verbosity = os.getenv("IMAGE_MODEL_TEXT_VERBOSITY", "").strip().lower()
    if verbosity in {"low", "medium", "high"}:
        options["text"] = {"verbosity": verbosity}
    elif verbosity:
        logger.warning("Ignoring invalid IMAGE_MODEL_TEXT_VERBOSITY=%s", verbosity)

    top_p = os.getenv("IMAGE_MODEL_TOP_P", "").strip()
    if top_p:
        try:
            parsed_top_p = float(top_p)
            if 0 <= parsed_top_p <= 1:
                options["top_p"] = parsed_top_p
            else:
                logger.warning("Ignoring invalid IMAGE_MODEL_TOP_P=%s", top_p)
        except ValueError:
            logger.warning("Ignoring invalid IMAGE_MODEL_TOP_P=%s", top_p)
    return options


def _object_to_plain(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        try:
            return value.model_dump(mode="json")
        except TypeError:
            return value.model_dump()
    if isinstance(value, dict):
        return {key: _object_to_plain(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_object_to_plain(item) for item in value]
    if hasattr(value, "__dict__"):
        return {
            key: _object_to_plain(item)
            for key, item in vars(value).items()
            if not key.startswith("_")
        }
    return value


def _openai_sdk_image_options(
    *,
    model: str,
    prompt: str,
    size: str,
    output_format: str,
    include_moderation: bool = False,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "size": size,
    }
    payload["n"] = max(1, _env_int("IMAGE_MODEL_N", 1))
    quality = os.getenv("IMAGE_MODEL_QUALITY", "").strip()
    if quality:
        payload["quality"] = quality
    background = os.getenv("IMAGE_MODEL_BACKGROUND", "").strip()
    if background and not (model == "gpt-image-2" and background == "transparent"):
        payload["background"] = background
    moderation = os.getenv("IMAGE_MODEL_MODERATION", "").strip()
    if include_moderation and moderation:
        payload["moderation"] = moderation
    if output_format:
        payload["output_format"] = output_format
    compression = os.getenv("IMAGE_MODEL_OUTPUT_COMPRESSION", "").strip()
    if compression and output_format in {"jpeg", "webp"}:
        try:
            payload["output_compression"] = max(0, min(100, int(compression)))
        except ValueError:
            logger.warning("Ignoring invalid IMAGE_MODEL_OUTPUT_COMPRESSION=%s", compression)
    return payload


def _openai_sdk_output_format() -> str:
    value = os.getenv("IMAGE_MODEL_OUTPUT_FORMAT", "").strip().lower()
    if value in {"png", "jpeg", "jpg", "webp"}:
        return "jpeg" if value == "jpg" else value
    return ""


def _parse_openai_sdk_image_result(result: Any, *, output_format: str = "") -> GeneratedImage:
    data = _object_field(result, "data")
    if not isinstance(data, list) or not data:
        raise ValueError("OpenAI SDK image response did not include data.")
    first = data[0]
    b64_json = _object_field(first, "b64_json")
    image_url = _object_field(first, "url")
    revised_prompt = _object_field(first, "revised_prompt")
    image_data_url = None
    if isinstance(b64_json, str) and b64_json.strip():
        mime_type = _mime_type_for_output_format(output_format)
        image_data_url = f"data:{mime_type};base64,{b64_json}"
    if isinstance(image_url, str) and image_url.startswith("data:image/"):
        image_data_url = image_url
        image_url = None
    if not image_url and not image_data_url:
        raise ValueError("OpenAI SDK image response did not include b64_json or url.")
    return GeneratedImage(
        image_url=image_url if isinstance(image_url, str) else None,
        image_data_url=image_data_url,
        revised_prompt=revised_prompt if isinstance(revised_prompt, str) else None,
    )


def _object_field(value: Any, key: str) -> Any:
    if isinstance(value, dict):
        return value.get(key)
    return getattr(value, key, None)


def _mime_type_for_output_format(output_format: str) -> str:
    if output_format == "jpeg":
        return "image/jpeg"
    if output_format == "webp":
        return "image/webp"
    return "image/png"


def _extract_image_from_text(text: str) -> str | None:
    data_match = re.search(r"data:image/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\n\r]+", text)
    if data_match:
        return re.sub(r"\s+", "", data_match.group(0))
    markdown_image_match = re.search(r"!\[[^\]]*\]\((https?://[^)\s]+)\)", text)
    if markdown_image_match:
        return markdown_image_match.group(1)
    url_match = re.search(r"https?://[^\s)>\"]+\.(?:png|jpe?g|webp)(?:\?[^\s)>\"]*)?", text)
    if url_match:
        return url_match.group(0)
    imageish_url_match = re.search(
        r"(?:image|generated|output|result)[^\n]{0,120}?(https?://[^\s)>\"]+)",
        text,
        re.IGNORECASE,
    )
    return imageish_url_match.group(1) if imageish_url_match else None


def _compact_text_snippet(text: str, limit: int = 700) -> str:
    compact = re.sub(r"\s+", " ", text or "").strip()
    if len(compact) <= limit:
        return compact
    return f"{compact[:limit]}..."


def _is_supported_reference_image(value: str) -> bool:
    if value.startswith("data:"):
        return bool(_SUPPORTED_IMAGE_DATA_URL_RE.match(value))
    return value.startswith("http://") or value.startswith("https://")


def _supported_reference_images(reference_images: list[str]) -> list[str]:
    safe: list[str] = []
    skipped = 0
    for image in reference_images:
        if _is_supported_reference_image(image):
            safe.append(image)
        else:
            skipped += 1
    if skipped:
        logger.warning("skipped unsupported reference image(s); skipped=%d kept=%d", skipped, len(safe))
    return safe


def _compact_reference_images(reference_images: list[str]) -> list[str]:
    max_side = max(320, _env_int("IMAGE_MODEL_REFERENCE_MAX_SIDE", 1400))
    jpeg_quality = max(45, min(95, _env_int("IMAGE_MODEL_REFERENCE_JPEG_QUALITY", 82)))
    max_bytes = max(0, _env_int("IMAGE_MODEL_REFERENCE_MAX_BYTES", 1_200_000))
    compacted: list[str] = []

    for index, image_url in enumerate(reference_images, start=1):
        if not image_url.startswith("data:image/"):
            if image_url.startswith("http://") or image_url.startswith("https://"):
                compacted.append(image_url)
            continue

        next_url = _compact_data_url_image(
            image_url,
            max_side=max_side,
            jpeg_quality=jpeg_quality,
            max_bytes=max_bytes,
        )
        compacted.append(next_url)
        if next_url != image_url:
            logger.warning(
                "OpenAI reference image %d compacted from %.1fKB to %.1fKB.",
                index,
                _data_url_payload_bytes(image_url) / 1024,
                _data_url_payload_bytes(next_url) / 1024,
            )
    return compacted


def _compact_data_url_image(
    data_url: str,
    *,
    max_side: int,
    jpeg_quality: int,
    max_bytes: int,
) -> str:
    match = _IMAGE_DATA_URL_RE.match(data_url)
    if not match:
        return data_url
    try:
        raw = base64.b64decode(match.group("data"), validate=False)
        image = Image.open(io.BytesIO(raw))
        image = ImageOps.exif_transpose(image)
    except (ValueError, OSError, UnidentifiedImageError):
        return data_url

    work = image.copy()
    if max(work.size) > max_side:
        work.thumbnail((max_side, max_side), Image.LANCZOS)

    has_alpha = work.mode in {"RGBA", "LA"} or (work.mode == "P" and "transparency" in work.info)
    if has_alpha:
        output = io.BytesIO()
        work.save(output, format="PNG", optimize=True)
        encoded = base64.b64encode(output.getvalue()).decode("ascii")
        compact = f"data:image/png;base64,{encoded}"
        if max_bytes and _data_url_payload_bytes(compact) > max_bytes:
            flattened = Image.new("RGB", work.size, "white")
            if work.mode != "RGBA":
                work = work.convert("RGBA")
            flattened.paste(work, mask=work.getchannel("A"))
            return _encode_jpeg_data_url(flattened, jpeg_quality=jpeg_quality)
        return compact

    rgb = work.convert("RGB")
    compact = _encode_jpeg_data_url(rgb, jpeg_quality=jpeg_quality)
    if max_bytes and _data_url_payload_bytes(data_url) <= max_bytes and _data_url_payload_bytes(compact) > _data_url_payload_bytes(data_url):
        return data_url
    return compact


def _encode_jpeg_data_url(image: Image.Image, *, jpeg_quality: int) -> str:
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=jpeg_quality, optimize=True, progressive=True)
    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def _data_url_payload_bytes(data_url: str) -> int:
    match = _IMAGE_DATA_URL_RE.match(data_url)
    if not match:
        return len(data_url.encode("utf-8"))
    return int(len(match.group("data")) * 0.75)


def _build_auth_headers(api_key: str | None) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}

    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    return headers
