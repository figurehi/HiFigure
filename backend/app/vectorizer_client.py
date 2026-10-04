import base64
import binascii
import re

import httpx

from .config import VectorizerSettings


class VectorizerClientError(Exception):
    """Raised when image vectorization fails."""


class VectorizerClient:
    def __init__(self, settings: VectorizerSettings):
        self.settings = settings

    def vectorize(self, *, image_data_url: str | None, image_url: str | None) -> str:
        image_bytes, mime_type = self._load_image(image_data_url=image_data_url, image_url=image_url)

        try:
            response = httpx.post(
                self.settings.endpoint,
                auth=(self.settings.api_id or "", self.settings.api_secret or ""),
                data={"mode": self.settings.mode},
                files={"image": ("image.png", image_bytes, mime_type)},
                follow_redirects=True,
                timeout=self.settings.timeout_seconds,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:500] if exc.response is not None else str(exc)
            raise VectorizerClientError(f"Vectorizer API failed: {detail}") from exc
        except httpx.HTTPError as exc:
            raise VectorizerClientError(f"Vectorizer request failed: {exc}") from exc

        svg = response.content.decode("utf-8", errors="replace").strip()
        if "<svg" not in svg:
            raise VectorizerClientError("Vectorizer response did not contain SVG content.")

        return svg

    def _load_image(self, *, image_data_url: str | None, image_url: str | None) -> tuple[bytes, str]:
        if image_data_url:
            return _decode_data_url(image_data_url)

        if image_url:
            return _download_image(image_url, timeout=self.settings.timeout_seconds)

        raise VectorizerClientError("Provide either imageDataUrl or imageUrl.")


def _decode_data_url(value: str) -> tuple[bytes, str]:
    match = re.fullmatch(r"data:(?P<mime>[-\w.+/]+);base64,(?P<data>.+)", value, re.DOTALL)
    if not match:
        raise VectorizerClientError("imageDataUrl must be a base64 data URL.")

    try:
        return base64.b64decode(match.group("data"), validate=True), match.group("mime")
    except (binascii.Error, ValueError) as exc:
        raise VectorizerClientError("imageDataUrl contains invalid base64 data.") from exc


def _download_image(url: str, *, timeout: float) -> tuple[bytes, str]:
    try:
        response = httpx.get(url, follow_redirects=True, timeout=timeout)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise VectorizerClientError(f"Could not download imageUrl: {exc}") from exc

    content_type = response.headers.get("content-type", "image/png").split(";")[0].strip()
    if not content_type.startswith("image/"):
        raise VectorizerClientError("imageUrl did not return an image content type.")

    return response.content, content_type
