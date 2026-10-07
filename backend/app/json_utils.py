import ast
import json
import re
from typing import Any


def parse_json_object_relaxed(raw_text: str) -> dict[str, Any]:
    """Parse a JSON object from model output with a few low-risk repairs.

    The model layer is expected to return strict JSON, but some providers still
    emit one of the common near-miss variants:
    - wrapped in markdown fences
    - trailing commas
    - raw newlines inside quoted strings
    - JSON literals that can be interpreted as Python literals after repair

    We try the canonical parse first, then a small repair pass, and finally a
    Python-literal fallback before giving up.
    """
    cleaned = _extract_first_json_object(_strip_code_fences(raw_text).strip())
    candidates = _candidate_json_texts(cleaned)

    last_error: Exception | None = None
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError as exc:
            last_error = exc
            continue
        if isinstance(parsed, dict):
            return parsed
        raise ValueError("JSON payload was not an object.")

    pythonized = _pythonize_json_literals(_escape_control_chars(cleaned))
    pythonized = _strip_trailing_commas(pythonized)
    try:
        parsed = ast.literal_eval(pythonized)
    except (SyntaxError, ValueError) as exc:
        if last_error is not None:
            raise last_error
        raise exc

    if not isinstance(parsed, dict):
        raise ValueError("JSON payload was not an object.")
    return parsed


def _candidate_json_texts(text: str) -> list[str]:
    escaped = _escape_control_chars(text)
    stripped = _strip_trailing_commas(escaped)
    backslash_repaired = _escape_invalid_json_backslashes(stripped)
    return [
        text,
        stripped,
        _escape_control_chars(stripped),
        _strip_trailing_commas(text),
        backslash_repaired,
        _strip_trailing_commas(backslash_repaired),
    ]


def _strip_code_fences(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        return "\n".join(lines)
    return text


def _extract_first_json_object(text: str) -> str:
    start = text.find("{")
    if start == -1:
        return text

    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        ch = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
    return text[start:]


def _strip_trailing_commas(text: str) -> str:
    return re.sub(r",(\s*[}\]])", r"\1", text)


def _escape_control_chars(text: str) -> str:
    out: list[str] = []
    in_string = False
    escaped = False
    for ch in text:
        if in_string:
            if escaped:
                out.append(ch)
                escaped = False
                continue
            if ch == "\\":
                out.append(ch)
                escaped = True
                continue
            if ch == '"':
                out.append(ch)
                in_string = False
                continue
            if ch == "\n":
                out.append("\\n")
                continue
            if ch == "\r":
                out.append("\\r")
                continue
            if ch == "\t":
                out.append("\\t")
                continue
            out.append(ch)
            continue

        out.append(ch)
        if ch == '"':
            in_string = True
            escaped = False
    return "".join(out)


def _escape_invalid_json_backslashes(text: str) -> str:
    r"""Escape LaTeX-style backslashes inside JSON strings.

    Models often emit formula labels like ``\mathcal{Q}`` in JSON strings. JSON
    only permits a small set of backslash escapes, so those labels need the
    backslash doubled before ``json.loads`` can accept them.
    """
    out: list[str] = []
    in_string = False
    escaped = False
    valid_escapes = {'"', "\\", "/", "b", "f", "n", "r", "t", "u"}

    for ch in text:
        if in_string:
            if escaped:
                if ch not in valid_escapes:
                    out.append("\\")
                out.append(ch)
                escaped = False
                continue
            if ch == "\\":
                out.append(ch)
                escaped = True
                continue
            if ch == '"':
                in_string = False
            out.append(ch)
            continue

        out.append(ch)
        if ch == '"':
            in_string = True
            escaped = False

    if escaped:
        out.append("\\")
    return "".join(out)


def _pythonize_json_literals(text: str) -> str:
    text = re.sub(r"(?<![A-Za-z0-9_])true(?![A-Za-z0-9_])", "True", text)
    text = re.sub(r"(?<![A-Za-z0-9_])false(?![A-Za-z0-9_])", "False", text)
    text = re.sub(r"(?<![A-Za-z0-9_])null(?![A-Za-z0-9_])", "None", text)
    return text
