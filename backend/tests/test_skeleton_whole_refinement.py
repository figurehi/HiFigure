import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import _coerce_whole_refinement


def test_whole_refinement_reroutes_only_edges_attached_to_moved_nodes() -> None:
    plan = {
        "width": 800,
        "height": 400,
        "nodes": [
            {"id": "a", "label": "A", "role": "process", "x": 20, "y": 40, "w": 120, "h": 60},
            {"id": "b", "label": "B", "role": "process", "x": 280, "y": 40, "w": 120, "h": 60},
            {"id": "c", "label": "C", "role": "process", "x": 20, "y": 260, "w": 120, "h": 60},
            {"id": "d", "label": "D", "role": "process", "x": 280, "y": 260, "w": 120, "h": 60},
        ],
        "edges": [
            {
                "id": "e1",
                "from": "a",
                "to": "b",
                "kind": "flow",
                "sourcePort": "east",
                "targetPort": "west",
                "points": [{"x": 140, "y": 70}, {"x": 280, "y": 70}],
            },
            {
                "id": "e2",
                "from": "c",
                "to": "d",
                "kind": "flow",
                "sourcePort": "east",
                "targetPort": "west",
                "points": [{"x": 140, "y": 290}, {"x": 280, "y": 290}],
            },
        ],
    }
    parsed = {
        "nodes": [
            {"id": "a", "label": "A", "role": "process", "x": 20, "y": 40, "w": 120, "h": 60},
            {"id": "b", "label": "B", "role": "process", "x": 380, "y": 160, "w": 120, "h": 60},
            {"id": "c", "label": "C", "role": "process", "x": 20, "y": 260, "w": 120, "h": 60},
            {"id": "d", "label": "D", "role": "process", "x": 280, "y": 260, "w": 120, "h": 60},
        ],
        "edges": [
            {"id": "e1", "from": "a", "to": "b", "kind": "flow", "lineStyle": "solid"},
            {"id": "e2", "from": "c", "to": "d", "kind": "flow", "lineStyle": "solid"},
        ],
    }

    result = _coerce_whole_refinement(plan, parsed)
    edges = {edge["id"]: edge for edge in result["edges"]}

    assert result["_rerouteEdgeIds"] == ["e1"]
    assert "points" not in edges["e1"]
    assert edges["e1"]["routingStyle"] == "orthogonal"
    assert edges["e1"]["sourcePort"] == "east"
    assert edges["e1"]["targetPort"] == "west"
    assert edges["e2"]["points"] == plan["edges"][1]["points"]
