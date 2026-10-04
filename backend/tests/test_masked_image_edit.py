import base64
import io
import sys
from pathlib import Path
from types import SimpleNamespace

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import ImageModelSettings
from app.image_client import (
    GeneratedImage,
    OpenAIImageClient,
    _prepare_openai_masked_edit_files,
)
from app.services import _composite_masked_edit_data_url, _generate_masked_edit_with_retry


def _data_url(image: Image.Image) -> str:
    output = io.BytesIO()
    image.save(output, format="PNG")
    return f"data:image/png;base64,{base64.b64encode(output.getvalue()).decode('ascii')}"


def _image_from_data_url(data_url: str) -> Image.Image:
    return Image.open(io.BytesIO(base64.b64decode(data_url.split(",", 1)[1]))).convert("RGBA")


def test_mask_is_converted_from_white_editable_to_transparent_editable() -> None:
    source = Image.new("RGB", (6, 4), "white")
    exported_mask = Image.new("L", (3, 2), 0)
    exported_mask.putpixel((1, 1), 255)

    prepared = _prepare_openai_masked_edit_files(
        _data_url(source),
        _data_url(exported_mask),
    )

    assert prepared is not None
    source_file, mask_file = prepared
    normalized_source = Image.open(source_file)
    native_mask = Image.open(mask_file).convert("RGBA")
    assert normalized_source.format == "PNG"
    assert normalized_source.size == source.size
    assert native_mask.size == source.size
    alpha = native_mask.getchannel("A")
    assert alpha.getpixel((0, 0)) == 255
    assert alpha.getpixel((3, 3)) == 0


def test_responses_request_uploads_source_and_native_mask(monkeypatch) -> None:
    source = _data_url(Image.new("RGB", (8, 8), "white"))
    annotation = _data_url(Image.new("RGB", (8, 8), "lavender"))
    mask_image = Image.new("L", (8, 8), 0)
    ImageDraw.Draw(mask_image).rectangle((2, 2, 5, 5), fill=255)
    mask = _data_url(mask_image)
    result_b64 = source.split(",", 1)[1]

    class FakeFiles:
        def __init__(self) -> None:
            self.created: list[tuple[str, bytes]] = []
            self.deleted: list[str] = []

        def create(self, *, file, purpose):
            payload = file.read()
            self.created.append((purpose, payload))
            return SimpleNamespace(id=f"file-{len(self.created)}")

        def delete(self, file_id: str) -> None:
            self.deleted.append(file_id)

    class FakeResponses:
        def __init__(self) -> None:
            self.payload = None

        def create(self, **payload):
            self.payload = payload
            return {
                "id": "resp-1",
                "status": "completed",
                "output": [{"type": "image_generation_call", "result": result_b64}],
            }

    class FakeOpenAI:
        instance = None

        def __init__(self, **_kwargs) -> None:
            self.files = FakeFiles()
            self.responses = FakeResponses()
            FakeOpenAI.instance = self

    monkeypatch.setattr("app.image_client._openai_sdk_client_class", lambda: FakeOpenAI)
    monkeypatch.setenv("IMAGE_MODEL_RESPONSES_BACKGROUND", "0")
    monkeypatch.setenv("IMAGE_MODEL_SIZE", "1024x1024")
    client = OpenAIImageClient(
        ImageModelSettings(
            base_url="https://api.openai.com/v1",
            api_key="test-key",
            model_name="gpt-5.6-sol",
            timeout_seconds=30,
            api_style="openai_responses_image_tool",
        )
    )

    generated = client.generate_image(
        "Replace the symbol inside the mask.",
        size="auto",
        reference_images=[source, annotation],
        reference_role="annotation_edit",
        edit_mask_image=mask,
    )

    assert generated.image_data_url is not None
    fake = FakeOpenAI.instance
    assert fake is not None
    assert len(fake.files.created) == 2
    assert all(purpose == "vision" for purpose, _payload in fake.files.created)
    assert fake.files.deleted == ["file-1", "file-2"]
    payload = fake.responses.payload
    assert payload["tools"][0]["input_image_mask"] == {"file_id": "file-2"}
    assert payload["tools"][0]["size"] == "auto"
    content = payload["input"][0]["content"]
    assert content[1] == {"type": "input_image", "file_id": "file-1"}
    assert content[2]["type"] == "input_image"
    assert content[2]["image_url"].startswith("data:image/")


def test_near_noop_masked_edit_retries_once(monkeypatch) -> None:
    source_image = Image.new("RGB", (12, 12), "white")
    changed_image = Image.new("RGB", (12, 12), "navy")
    mask_image = Image.new("L", (12, 12), 0)
    ImageDraw.Draw(mask_image).rectangle((3, 3, 8, 8), fill=255)
    source = _data_url(source_image)
    mask = _data_url(mask_image)

    class FakeImageClient:
        def __init__(self) -> None:
            self.prompts: list[str] = []

        def generate_image(self, prompt: str, **kwargs) -> GeneratedImage:
            self.prompts.append(prompt)
            assert kwargs["edit_mask_image"] == mask
            assert kwargs["size"] == "auto"
            image = source if len(self.prompts) == 1 else _data_url(changed_image)
            return GeneratedImage(image_url=None, image_data_url=image)

    monkeypatch.delenv("IMAGE_EDIT_MIN_CHANGED_RATIO", raising=False)
    fake = FakeImageClient()
    result, used_prompt, change_ratio = _generate_masked_edit_with_retry(
        image_client=fake,  # type: ignore[arg-type]
        prompt="Change the icon.",
        reference_images=[source],
        reference_role="masked_inpaint",
        source_data_url=source,
        mask_data_url=mask,
    )

    assert len(fake.prompts) == 2
    assert "MASKED EDIT RETRY" in used_prompt
    assert change_ratio == 1.0
    assert result.image_data_url is not None


def test_masked_composite_matches_boundary_tone_and_preserves_crossing_line() -> None:
    source = Image.new("RGB", (80, 50), (255, 255, 255))
    ImageDraw.Draw(source).line((0, 25, 79, 25), fill=(0, 0, 0), width=2)
    generated = Image.new("RGB", (80, 50), (242, 240, 234))
    ImageDraw.Draw(generated).line((0, 27, 79, 27), fill=(0, 0, 0), width=2)
    mask = Image.new("L", (80, 50), 0)
    ImageDraw.Draw(mask).rectangle((15, 8, 64, 41), fill=255)

    composited_url = _composite_masked_edit_data_url(
        source_data_url=_data_url(source),
        generated_data_url=_data_url(generated),
        mask_data_url=_data_url(mask),
    )

    assert composited_url is not None
    composited = _image_from_data_url(composited_url)
    # Protected pixels remain exact, while the first editable pixels retain the
    # original crossing line instead of abruptly switching to the shifted one.
    assert composited.getpixel((14, 25))[:3] == (0, 0, 0)
    assert max(composited.getpixel((15, 25))[:3]) < 80
    # The off-white generated canvas is tone-matched, avoiding a visible box.
    assert min(composited.getpixel((40, 15))[:3]) >= 250
    # The generated change remains present away from the protected seam.
    assert max(composited.getpixel((40, 27))[:3]) < 40
