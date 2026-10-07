"""Separate append-only interaction log for the Baseline study website."""

from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
from uuid import uuid4


class BaselineLogError(ValueError):
    pass


_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{2,64}$")
_DEFAULT_ROOT = (Path(__file__).parent / "../../baseline_study_logs").resolve()


def _root() -> Path:
    configured = os.getenv("BASELINE_STUDY_LOG_DIR", "").strip()
    return Path(configured).expanduser().resolve() if configured else _DEFAULT_ROOT


def append_baseline_events(participant_id: str, session_id: str, events: list[dict]) -> int:
    if not _SAFE_ID.fullmatch(participant_id):
        raise BaselineLogError("Invalid participant ID")
    if not _SAFE_ID.fullmatch(session_id):
        raise BaselineLogError("Invalid session ID")
    if len(events) > 100:
        raise BaselineLogError("Too many events in one batch")

    participant_dir = _root() / participant_id
    participant_dir.mkdir(parents=True, exist_ok=True)
    destination = participant_dir / "events.jsonl"
    received_at = datetime.now(timezone.utc).isoformat()
    with destination.open("a", encoding="utf-8") as handle:
        for event in events:
            record = {
                "receivedAt": received_at,
                "participantId": participant_id,
                "sessionId": session_id,
                "event": event,
            }
            handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
    return len(events)


def record_baseline_download(
    participant_id: str,
    session_id: str,
    *,
    reference_ids: list[str],
    filenames: list[str],
    download_kind: str,
    query: str = "",
) -> int:
    """Record the exact files successfully prepared by a download endpoint."""
    return append_baseline_events(
        participant_id,
        session_id,
        [{
            "id": f"download-{uuid4().hex}",
            "type": "baseline_bundle_downloaded" if download_kind == "zip" else "baseline_image_downloaded",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "query": query[:500],
            "resultIds": reference_ids,
            "metadata": {
                "downloadKind": download_kind,
                "referenceCount": len(reference_ids),
                "referenceIds": reference_ids,
                "filenames": filenames,
            },
        }],
    )
