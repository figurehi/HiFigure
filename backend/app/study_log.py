"""Participant study logging.

Every user-study participant has an ID (e.g. "P07"). This module persists
their interaction events, selected Pocket references, and generated outputs
on disk so researchers can review them after each session:

    study_logs/
      P07/
        events.jsonl        # one StudyEvent per line, with server receive time
        outputs.jsonl       # one reference/output record per line (metadata)
        outputs/            # selected references plus generated PNG/SVG files
          20260811-053000-variant-1.png
"""

from __future__ import annotations

import base64
import binascii
import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STUDY_LOG_ROOT = (Path(__file__).parent / "../../study_logs").resolve()

_write_lock = threading.Lock()

_DATA_URL_PATTERN = re.compile(r"^data:image/(png|jpeg|svg\+xml);base64,", re.IGNORECASE)

_EXTENSION_BY_KIND = {
    "png": ".png",
    "jpeg": ".jpg",
    "svg+xml": ".svg",
}


class StudyLogError(ValueError):
    """Raised for invalid participant ids or undecodable payloads."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def sanitize_participant_id(participant_id: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]", "", (participant_id or "").strip())
    if not cleaned:
        raise StudyLogError("participantId must contain letters, digits, '-' or '_'.")
    return cleaned[:64]


def participant_dir(participant_id: str) -> Path:
    return STUDY_LOG_ROOT / sanitize_participant_id(participant_id)


def participant_artifact_path(participant_id: str, relative_path: str) -> Path:
    """Resolve one archived output without allowing traversal outside its participant folder."""
    if not relative_path.startswith("outputs/"):
        raise StudyLogError("Only archived participant outputs can be opened.")
    directory = participant_dir(participant_id).resolve()
    target = (directory / relative_path).resolve()
    if directory not in target.parents:
        raise StudyLogError("Invalid participant output path.")
    if not target.is_file():
        raise StudyLogError("Participant output was not found.")
    return target


def load_outputs(participant_id: str, session_id: str | None = None) -> list[dict[str, Any]]:
    """Read archived artifacts for workspace recovery, newest record winning per output id."""
    clean_id = sanitize_participant_id(participant_id)
    path = participant_dir(clean_id) / "outputs.jsonl"
    if not path.exists():
        return []

    records_by_id: dict[str, dict[str, Any]] = {}
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if session_id and record.get("sessionId") != session_id:
                continue
            output_id = str(record.get("outputId") or "").strip()
            if not output_id:
                continue
            recovered = dict(record)
            image_file = recovered.get("imageFile")
            if isinstance(image_file, str) and image_file.startswith("outputs/"):
                recovered["artifactPath"] = f"/study/artifacts/{clean_id}/{image_file}"
                if recovered.get("textFormat"):
                    try:
                        recovered["textContent"] = participant_artifact_path(clean_id, image_file).read_text(
                            encoding="utf-8"
                        )
                    except (OSError, UnicodeError, StudyLogError):
                        recovered["textContent"] = None
            records_by_id[output_id] = recovered
    return sorted(
        records_by_id.values(),
        key=lambda record: str(record.get("receivedAt") or ""),
    )


def _append_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with _write_lock, path.open("a", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def append_events(
    participant_id: str,
    session_id: str,
    events: list[dict[str, Any]],
    *,
    session_started_at: str | None = None,
) -> int:
    """Append a batch of frontend StudyEvents; returns the stored count."""
    directory = participant_dir(participant_id)
    received_at = _now_iso()
    lines = [
        {
            "receivedAt": received_at,
            "sessionId": session_id,
            "sessionStartedAt": session_started_at,
            "event": event,
        }
        for event in events
    ]
    if lines:
        _append_jsonl(directory / "events.jsonl", lines)
    return len(lines)


def _decode_image_data_url(image_data_url: str) -> tuple[bytes, str]:
    match = _DATA_URL_PATTERN.match(image_data_url)
    if not match:
        raise StudyLogError("imageDataUrl must be a base64 png, jpeg, or svg data URL.")
    extension = _EXTENSION_BY_KIND[match.group(1).lower()]
    try:
        payload = base64.b64decode(image_data_url[match.end():], validate=True)
    except (binascii.Error, ValueError) as exc:
        raise StudyLogError("imageDataUrl payload is not valid base64.") from exc
    if not payload:
        raise StudyLogError("imageDataUrl payload is empty.")
    return payload, extension


def _safe_file_stem(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]", "-", value.strip())[:80]
    return cleaned or "output"


_TEXT_EXTENSIONS = {
    "json": ".json",
    "xml": ".drawio.xml",
    "mermaid": ".mmd",
    "svg": ".svg",
    "text": ".txt",
}


def save_output(
    participant_id: str,
    session_id: str,
    *,
    output_id: str,
    kind: str,
    title: str | None = None,
    image_data_url: str | None = None,
    image_url: str | None = None,
    text_content: str | None = None,
    text_format: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Persist one reference or generated artifact plus its metadata line."""
    directory = participant_dir(participant_id)
    saved_file: str | None = None
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    if image_data_url:
        payload, extension = _decode_image_data_url(image_data_url)
        filename = f"{timestamp}-{_safe_file_stem(output_id)}{extension}"
        output_path = directory / "outputs" / filename
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(payload)
        saved_file = f"outputs/{filename}"
    elif text_content:
        extension = _TEXT_EXTENSIONS.get((text_format or "text").lower(), ".txt")
        filename = f"{timestamp}-{_safe_file_stem(output_id)}{extension}"
        output_path = directory / "outputs" / filename
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(text_content, encoding="utf-8")
        saved_file = f"outputs/{filename}"

    record = {
        "receivedAt": _now_iso(),
        "sessionId": session_id,
        "outputId": output_id,
        "kind": kind,
        "title": title,
        "imageFile": saved_file,
        "imageUrl": image_url,
        "textFormat": text_format if text_content else None,
        "metadata": metadata or {},
    }
    _append_jsonl(directory / "outputs.jsonl", [record])
    return record


def _count_lines(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open("r", encoding="utf-8") as handle:
        return sum(1 for line in handle if line.strip())


def list_participants() -> list[dict[str, Any]]:
    """Summaries for every participant folder, newest activity first."""
    if not STUDY_LOG_ROOT.exists():
        return []
    summaries: list[dict[str, Any]] = []
    for directory in sorted(STUDY_LOG_ROOT.iterdir()):
        if not directory.is_dir():
            continue
        events_path = directory / "events.jsonl"
        outputs_path = directory / "outputs.jsonl"
        latest = max(
            (path.stat().st_mtime for path in (events_path, outputs_path) if path.exists()),
            default=directory.stat().st_mtime,
        )
        summaries.append(
            {
                "participantId": directory.name,
                "eventCount": _count_lines(events_path),
                "outputCount": _count_lines(outputs_path),
                "lastActivityAt": datetime.fromtimestamp(latest, timezone.utc).isoformat(),
            }
        )
    summaries.sort(key=lambda item: item["lastActivityAt"], reverse=True)
    return summaries
