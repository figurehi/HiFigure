"""Small helpers for slicing reference image data URLs into region crops.

We use this so the generation pipeline can attach a real cropped image for each
user-marked WANT region instead of just passing a bbox in text — which an image
model (and most non-inpainting image models) may ignore.
"""

from __future__ import annotations

import base64
import io
import math
import textwrap
from dataclasses import dataclass
from typing import Any

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    Image = None  # type: ignore[assignment]
    ImageDraw = None  # type: ignore[assignment]
    ImageFont = None  # type: ignore[assignment]


@dataclass(frozen=True)
class NormalizedBox:
    x: float
    y: float
    w: float
    h: float


def _split_data_url(data_url: str) -> tuple[str, bytes] | None:
    if not data_url or not data_url.startswith("data:"):
        return None
    if "," not in data_url:
        return None
    metadata, encoded = data_url.split(",", 1)
    if ";base64" not in metadata or not encoded:
        return None
    mime = metadata[5:].split(";", 1)[0] or "image/png"
    try:
        raw = base64.b64decode(encoded)
    except (ValueError, base64.binascii.Error):  # type: ignore[attr-defined]
        return None
    return mime, raw


def crop_data_url(
    data_url: str,
    box: NormalizedBox,
    *,
    max_side: int = 768,
    padding: float = 0.04,
) -> str | None:
    """Return a new ``data:image/...;base64,...`` URL containing the cropped region.

    - ``box`` is in normalized 0..1 coordinates relative to the source image.
    - ``padding`` adds a small margin around the crop so the model sees a little
      context, which empirically helps it understand what the region "is".
    - ``max_side`` clamps the long side of the crop so we don't blow past the
      provider's per-image payload limit.

    Returns None if Pillow is unavailable, the data URL is malformed, or the
    crop would be empty.
    """
    if Image is None:
        return None

    parsed = _split_data_url(data_url)
    if not parsed:
        return None
    _mime, raw = parsed

    try:
        with Image.open(io.BytesIO(raw)) as img:
            img = img.convert("RGB") if img.mode not in ("RGB", "RGBA") else img.copy()
    except Exception:  # noqa: BLE001 - any decoder error: bail to caller
        return None

    width, height = img.size
    if width <= 0 or height <= 0:
        return None

    pad = max(0.0, padding)
    x0 = max(0.0, box.x - pad)
    y0 = max(0.0, box.y - pad)
    x1 = min(1.0, box.x + box.w + pad)
    y1 = min(1.0, box.y + box.h + pad)
    if x1 <= x0 or y1 <= y0:
        return None

    left = int(round(x0 * width))
    top = int(round(y0 * height))
    right = int(round(x1 * width))
    bottom = int(round(y1 * height))
    if right - left < 4 or bottom - top < 4:
        return None

    crop = img.crop((left, top, right, bottom))

    long_side = max(crop.size)
    if long_side > max_side:
        scale = max_side / float(long_side)
        new_size = (max(1, int(crop.size[0] * scale)), max(1, int(crop.size[1] * scale)))
        crop = crop.resize(new_size, Image.LANCZOS)

    buffer = io.BytesIO()
    crop.save(buffer, format="PNG", optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _open_rgb_image(url: str):
    """Open a data URL or http(s) image so mask union is not data-URL-only."""
    if Image is None or not url:
        return None
    parsed = _split_data_url(url)
    if parsed:
        _mime, raw = parsed
        try:
            with Image.open(io.BytesIO(raw)) as img:
                return img.convert("RGB") if img.mode not in ("RGB", "RGBA") else img.copy()
        except Exception:  # noqa: BLE001
            return None
    if url.startswith("http://") or url.startswith("https://"):
        try:
            import urllib.request

            request = urllib.request.Request(url, headers={"User-Agent": "HiChart/1.0"})
            with urllib.request.urlopen(request, timeout=20) as response:
                raw = response.read()
            with Image.open(io.BytesIO(raw)) as img:
                return img.convert("RGB") if img.mode not in ("RGB", "RGBA") else img.copy()
        except Exception:  # noqa: BLE001
            return None
    return None


def union_boxes_mask_data_url(
    data_url: str,
    boxes: list[NormalizedBox],
) -> str | None:
    """Build a grayscale PNG mask the same size as ``data_url`` (white = edit, black = preserve).

    Multiple ``NormalizedBox`` entries (0..1 coords) are unioned into one mask. Used for
    provider mask-based inpainting alongside the original sheet image.
    """
    if Image is None or ImageDraw is None or not boxes:
        return None

    img = _open_rgb_image(data_url)
    if img is None:
        return None

    width, height = img.size
    if width <= 0 or height <= 0:
        return None

    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)

    for box in boxes:
        x0 = int(round(max(0.0, min(1.0, box.x)) * width))
        y0 = int(round(max(0.0, min(1.0, box.y)) * height))
        x1 = int(round(max(0.0, min(1.0, box.x + box.w)) * width))
        y1 = int(round(max(0.0, min(1.0, box.y + box.h)) * height))
        if x1 <= x0:
            x1 = min(width, x0 + 1)
        if y1 <= y0:
            y1 = min(height, y0 + 1)
        x0 = max(0, min(width - 1, x0))
        y0 = max(0, min(height - 1, y0))
        x1 = max(x0 + 1, min(width, x1))
        y1 = max(y0 + 1, min(height, y1))
        draw.rectangle([x0, y0, x1 - 1, y1 - 1], fill=255)

    if mask.getbbox() is None:
        return None

    buffer = io.BytesIO()
    mask.save(buffer, format="PNG", optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _png_data_url(image: Any) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _load_layout_font(size: int) -> Any:
    if ImageFont is None:
        return None
    for path in (
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        try:
            return ImageFont.truetype(path, size=size)
        except (OSError, ValueError):
            continue
    return ImageFont.load_default()


def _draw_dashed_line(draw: Any, points: list[tuple[float, float]], fill: str, width: int = 2) -> None:
    dash = 8.0
    gap = 6.0
    for start, end in zip(points, points[1:]):
        x1, y1 = start
        x2, y2 = end
        length = math.hypot(x2 - x1, y2 - y1)
        if length <= 0:
            continue
        ux = (x2 - x1) / length
        uy = (y2 - y1) / length
        cursor = 0.0
        while cursor < length:
            segment_end = min(length, cursor + dash)
            draw.line(
                [(x1 + ux * cursor, y1 + uy * cursor), (x1 + ux * segment_end, y1 + uy * segment_end)],
                fill=fill,
                width=width,
            )
            cursor = segment_end + gap


def render_diagram_plan_data_url(
    plan: dict[str, Any],
    *,
    width: int = 900,
    height: int = 540,
    highlights: list[dict[str, Any]] | None = None,
) -> str | None:
    """Render the actual candidate geometry into a compact PNG for visual review.

    This intentionally mirrors only layout-bearing information: containers, nodes,
    labels, orthogonal arrows, and feedback dashes. It is not a publication renderer.
    """
    if Image is None or ImageDraw is None:
        return None

    canvas = Image.new("RGB", (width, height), "#ffffff")
    draw = ImageDraw.Draw(canvas)
    font = _load_layout_font(14)
    small_font = _load_layout_font(11)
    plan_width = max(1.0, float(plan.get("width", 1600) or 1600))
    plan_height = max(1.0, float(plan.get("height", 960) or 960))
    pad = 24.0
    scale = min((width - 2 * pad) / plan_width, (height - 2 * pad) / plan_height)
    offset_x = (width - plan_width * scale) / 2
    offset_y = (height - plan_height * scale) / 2

    def box(node: dict[str, Any]) -> tuple[float, float, float, float]:
        x = offset_x + float(node.get("x", 0) or 0) * scale
        y = offset_y + float(node.get("y", 0) or 0) * scale
        w = max(8.0, float(node.get("w", 0) or 0) * scale)
        h = max(8.0, float(node.get("h", 0) or 0) * scale)
        return x, y, x + w, y + h

    nodes = [node for node in plan.get("nodes", []) if isinstance(node, dict)]
    groups = [node for node in nodes if str(node.get("role") or "").lower() in {"group", "container", "panel", "lane", "section"}]
    ordinary = [node for node in nodes if node not in groups]
    by_id = {str(node.get("id") or ""): node for node in ordinary}

    for group in groups:
        x1, y1, x2, y2 = box(group)
        _draw_dashed_line(draw, [(x1, y1), (x2, y1), (x2, y2), (x1, y2), (x1, y1)], "#64748b")
        label = str(group.get("label") or "")
        label_width = max(8, min(32, int((x2 - x1) / 7)))
        label_lines = textwrap.wrap(label, width=label_width) or [label]
        draw.multiline_text((x1 + 7, y1 + 5), "\n".join(label_lines), fill="#334155", font=small_font, spacing=2)

    for edge in plan.get("edges", []):
        if not isinstance(edge, dict):
            continue
        source = by_id.get(str(edge.get("from") or ""))
        target = by_id.get(str(edge.get("to") or ""))
        if source is None or target is None:
            continue
        raw_points = [point for point in edge.get("points", []) if isinstance(point, dict)]
        if len(raw_points) >= 2:
            points = [
                (
                    offset_x + float(point.get("x", 0) or 0) * scale,
                    offset_y + float(point.get("y", 0) or 0) * scale,
                )
                for point in raw_points
            ]
        else:
            sx1, sy1, sx2, sy2 = box(source)
            tx1, ty1, tx2, ty2 = box(target)
            source_center = ((sx1 + sx2) / 2, (sy1 + sy2) / 2)
            target_center = ((tx1 + tx2) / 2, (ty1 + ty2) / 2)
            if target_center[0] >= source_center[0]:
                start = (sx2, source_center[1])
                end = (tx1, target_center[1])
            else:
                start = (sx1, source_center[1])
                end = (tx2, target_center[1])
            mid_x = (start[0] + end[0]) / 2
            points = [start, (mid_x, start[1]), (mid_x, end[1]), end]
        if str(edge.get("kind") or "") == "feedback":
            _draw_dashed_line(draw, points, "#475569")
        else:
            draw.line(points, fill="#475569", width=2, joint="curve")
        previous, end = points[-2], points[-1]
        angle = math.atan2(end[1] - previous[1], end[0] - previous[0])
        draw.polygon(
            [
                end,
                (end[0] - math.cos(angle - 0.5) * 9, end[1] - math.sin(angle - 0.5) * 9),
                (end[0] - math.cos(angle + 0.5) * 9, end[1] - math.sin(angle + 0.5) * 9),
            ],
            fill="#475569",
        )

    role_colors = {
        "input": "#dbeafe",
        "data": "#dcfce7",
        "encoder": "#dcfce7",
        "process": "#fef3c7",
        "reasoning": "#ffedd5",
        "fusion": "#f3e8ff",
        "model": "#f3e8ff",
        "output": "#e0e7ff",
        "callout": "#fff7ed",
    }
    for node in ordinary:
        x1, y1, x2, y2 = box(node)
        role = str(node.get("role") or "process").lower()
        shape = str(node.get("shape") or "").lower()
        if role == "divider" or shape == "divider":
            _draw_dashed_line(draw, [((x1 + x2) / 2, y1), ((x1 + x2) / 2, y2)], "#64748b")
            continue
        fill = role_colors.get(role, "#f1f5f9")
        draw.rounded_rectangle((x1, y1, x2, y2), radius=10, fill=fill, outline="#64748b", width=2)
        label = str(node.get("label") or "")
        lines = textwrap.wrap(label, width=max(8, min(24, int((x2 - x1) / 8))))[:3] or [label]
        line_height = 16
        text_y = (y1 + y2 - len(lines) * line_height) / 2
        for line in lines:
            try:
                bounds = draw.textbbox((0, 0), line, font=font)
                line_width = bounds[2] - bounds[0]
            except (AttributeError, UnicodeEncodeError):
                line = line.encode("ascii", "replace").decode("ascii")
                line_width = len(line) * 7
            draw.text(((x1 + x2 - line_width) / 2, text_y), line, fill="#18314f", font=font)
            text_y += line_height

    for index, highlight in enumerate(highlights or []):
        x = offset_x + float(highlight.get("x", 0) or 0) * scale
        y = offset_y + float(highlight.get("y", 0) or 0) * scale
        radius = max(14.0, float(highlight.get("radius", 28) or 28) * scale)
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), outline="#dc2626", width=4)
        label = str(highlight.get("label") or f"ISSUE {index + 1}")[:28]
        try:
            bounds = draw.textbbox((0, 0), label, font=small_font)
            label_w, label_h = bounds[2] - bounds[0], bounds[3] - bounds[1]
        except (AttributeError, UnicodeEncodeError):
            label = label.encode("ascii", "replace").decode("ascii")
            label_w, label_h = len(label) * 7, 14
        label_x = min(width - label_w - 6, max(3.0, x + radius + 5))
        label_y = min(height - label_h - 6, max(3.0, y - label_h / 2))
        draw.rectangle((label_x - 3, label_y - 2, label_x + label_w + 3, label_y + label_h + 2), fill="#fee2e2")
        draw.text((label_x, label_y), label, fill="#991b1b", font=small_font)

    return _png_data_url(canvas)


def compose_layout_review_data_url(
    reference_data_url: str | None,
    plan: dict[str, Any],
    *,
    highlights: list[dict[str, Any]] | None = None,
    candidate_label: str = "CANDIDATE RENDER",
) -> str | None:
    """Create one model-compatible image containing reference and rendered candidate."""
    if Image is None or ImageDraw is None:
        return None
    candidate_url = render_diagram_plan_data_url(plan, width=760, height=560, highlights=highlights)
    candidate_parsed = _split_data_url(candidate_url or "")
    if not candidate_parsed:
        return None
    try:
        candidate = Image.open(io.BytesIO(candidate_parsed[1])).convert("RGB")
    except Exception:  # noqa: BLE001
        return None

    reference = None
    parsed_reference = _split_data_url(reference_data_url or "")
    if parsed_reference:
        try:
            reference = Image.open(io.BytesIO(parsed_reference[1])).convert("RGB")
        except Exception:  # noqa: BLE001
            reference = None

    panel_w, panel_h, header_h = 760, 560, 42
    columns = 2 if reference is not None else 1
    sheet = Image.new("RGB", (panel_w * columns, panel_h + header_h), "#e2e8f0")
    draw = ImageDraw.Draw(sheet)
    header_font = _load_layout_font(18)

    def paste_fitted(image: Any, column: int) -> None:
        copy = image.copy()
        copy.thumbnail((panel_w - 20, panel_h - 20), Image.Resampling.LANCZOS)
        x = column * panel_w + (panel_w - copy.width) // 2
        y = header_h + (panel_h - copy.height) // 2
        sheet.paste(copy, (x, y))

    if reference is not None:
        draw.text((18, 10), "REFERENCE", fill="#0f172a", font=header_font)
        paste_fitted(reference, 0)
        candidate_column = 1
    else:
        candidate_column = 0
    draw.text((candidate_column * panel_w + 18, 10), candidate_label, fill="#0f172a", font=header_font)
    paste_fitted(candidate, candidate_column)
    return _png_data_url(sheet)


def compose_repair_comparison_data_url(
    reference_data_url: str | None,
    before_plan: dict[str, Any],
    after_plan: dict[str, Any],
    *,
    before_highlights: list[dict[str, Any]] | None = None,
) -> str | None:
    """Compose reference, before, and after renders for a closed repair decision."""
    if Image is None or ImageDraw is None:
        return None
    before_url = render_diagram_plan_data_url(before_plan, width=640, height=500, highlights=before_highlights)
    after_url = render_diagram_plan_data_url(after_plan, width=640, height=500)
    before_parsed = _split_data_url(before_url or "")
    after_parsed = _split_data_url(after_url or "")
    if not before_parsed or not after_parsed:
        return None
    try:
        before = Image.open(io.BytesIO(before_parsed[1])).convert("RGB")
        after = Image.open(io.BytesIO(after_parsed[1])).convert("RGB")
    except Exception:  # noqa: BLE001
        return None

    panels: list[tuple[str, Any]] = []
    parsed_reference = _split_data_url(reference_data_url or "")
    if parsed_reference:
        try:
            panels.append(("REFERENCE", Image.open(io.BytesIO(parsed_reference[1])).convert("RGB")))
        except Exception:  # noqa: BLE001
            pass
    panels.extend([("BEFORE", before), ("AFTER", after)])
    panel_w, panel_h, header_h = 640, 500, 42
    sheet = Image.new("RGB", (panel_w * len(panels), panel_h + header_h), "#e2e8f0")
    draw = ImageDraw.Draw(sheet)
    header_font = _load_layout_font(18)
    for index, (label, panel) in enumerate(panels):
        draw.text((index * panel_w + 18, 10), label, fill="#0f172a", font=header_font)
        copy = panel.copy()
        copy.thumbnail((panel_w - 20, panel_h - 20), Image.Resampling.LANCZOS)
        x = index * panel_w + (panel_w - copy.width) // 2
        y = header_h + (panel_h - copy.height) // 2
        sheet.paste(copy, (x, y))
    return _png_data_url(sheet)
