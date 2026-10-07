import json
from functools import lru_cache
from pathlib import Path

from pydantic import TypeAdapter

from .schemas import StudyTask


_CATALOG_PATH = Path(__file__).resolve().parents[2] / "shared" / "study_tasks.json"
_TASK_LIST_ADAPTER = TypeAdapter(list[StudyTask])


@lru_cache(maxsize=1)
def _load_catalog() -> tuple[StudyTask, ...]:
    payload = json.loads(_CATALOG_PATH.read_text(encoding="utf-8"))
    if payload.get("schemaVersion") != 1:
        raise ValueError("Unsupported study-task catalog schema version.")
    tasks = _TASK_LIST_ADAPTER.validate_python(payload.get("tasks"))
    versions = [task.version for task in tasks]
    if len(versions) != len(set(versions)):
        raise ValueError("Study-task versions must be unique.")
    return tuple(tasks)


def list_study_tasks() -> list[StudyTask]:
    """Return defensive copies of the shared frontend/backend task catalog."""
    return [task.model_copy(deep=True) for task in _load_catalog()]
