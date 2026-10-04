import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import study_log


def test_workspace_checkpoint_round_trips_as_recovery_json(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(study_log, "STUDY_LOG_ROOT", tmp_path)
    checkpoint = json.dumps({"schemaVersion": 1, "state": {"activeStudioStep": "style"}})

    study_log.save_output(
        "P01",
        "session-1",
        output_id="workspace-checkpoint",
        kind="workspace",
        title="Workspace checkpoint",
        text_content=checkpoint,
        text_format="json",
        metadata={"schemaVersion": 1},
    )

    [artifact] = study_log.load_outputs("P01", session_id="session-1")
    assert artifact["kind"] == "workspace"
    assert artifact["artifactPath"].endswith(".json")
    assert artifact["textContent"] == checkpoint
