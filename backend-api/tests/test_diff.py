"""
Tests for the /api/diff document comparison endpoint.

All LlamaIndex/Qdrant/LLM calls are mocked — no network needed.
"""
import io
import json
import pytest
from unittest.mock import MagicMock, patch, AsyncMock

from src.database import add_custom_project


# ── helpers ───────────────────────────────────────────────────────────────────

def _sse_events(raw: bytes) -> list[dict]:
    events = []
    for line in raw.decode().splitlines():
        if line.startswith("data: ") and line[6:] != "[DONE]":
            try:
                events.append(json.loads(line[6:]))
            except json.JSONDecodeError:
                pass
    return events


def _post_diff(auth_client, file_a: str, file_b: str, project: str,
               chunks_a=None, chunks_b=None, llm_reply="Comparison result."):
    """POST to /api/diff with mocked Qdrant chunks and LLM."""
    chunks_a = chunks_a if chunks_a is not None else ["Content of document A."]
    chunks_b = chunks_b if chunks_b is not None else ["Content of document B."]

    mock_complete = MagicMock()
    mock_complete.text = llm_reply

    with patch("main.get_file_chunks", side_effect=[chunks_a, chunks_b]), \
         patch("main.adb.get_project_owner", new_callable=AsyncMock, return_value="admin"), \
         patch("llama_index.core.Settings") as mock_settings:
        mock_settings.llm.complete.return_value = mock_complete
        r = auth_client.post("/api/diff", json={
            "file_a": file_a,
            "file_b": file_b,
            "project": project,
        })
    return r


# ── authentication ────────────────────────────────────────────────────────────

def test_diff_unauthenticated(client):
    r = client.post("/api/diff", json={
        "file_a": "a.pdf", "file_b": "b.pdf", "project": "P",
    })
    assert r.status_code == 401


# ── 404 when no indexed content ───────────────────────────────────────────────

def test_diff_missing_file_a_returns_404(auth_client):
    add_custom_project("DiffMissA", "admin")

    def _chunks(_owner, _proj, filename, **kw):
        return [] if filename == "ghost.pdf" else ["text of B"]

    with patch("main.get_file_chunks", side_effect=_chunks), \
         patch("main.adb.get_project_owner", new_callable=AsyncMock, return_value="admin"):
        r = auth_client.post("/api/diff", json={
            "file_a": "ghost.pdf", "file_b": "real.pdf", "project": "DiffMissA",
        })
    assert r.status_code == 404
    assert "ghost.pdf" in r.json()["detail"]


def test_diff_missing_file_b_returns_404(auth_client):
    add_custom_project("DiffMissB", "admin")

    def _chunks(_owner, _proj, filename, **kw):
        return [] if filename == "ghost.pdf" else ["text of A"]

    with patch("main.get_file_chunks", side_effect=_chunks), \
         patch("main.adb.get_project_owner", new_callable=AsyncMock, return_value="admin"):
        r = auth_client.post("/api/diff", json={
            "file_a": "real.pdf", "file_b": "ghost.pdf", "project": "DiffMissB",
        })
    assert r.status_code == 404
    assert "ghost.pdf" in r.json()["detail"]


# ── successful comparison ─────────────────────────────────────────────────────

def test_diff_streams_llm_response(auth_client):
    add_custom_project("DiffStream", "admin")
    reply = "1. Overview: A covers v1 specs. B covers v2.\n2. Changed: yield strength 250→300 MPa."

    r = _post_diff(auth_client, "spec_v1.pdf", "spec_v2.pdf", "DiffStream", llm_reply=reply)
    assert r.status_code == 200

    events = _sse_events(r.content)
    tokens = [e["token"] for e in events if "token" in e]
    full = "".join(tokens)
    assert full == reply


def test_diff_response_is_event_stream(auth_client):
    add_custom_project("DiffMime", "admin")
    r = _post_diff(auth_client, "a.pdf", "b.pdf", "DiffMime")
    assert r.status_code == 200
    assert "text/event-stream" in r.headers.get("content-type", "")


def test_diff_ends_with_done(auth_client):
    add_custom_project("DiffDone", "admin")
    r = _post_diff(auth_client, "a.pdf", "b.pdf", "DiffDone")
    assert r.status_code == 200
    assert b"[DONE]" in r.content


def test_diff_uses_both_files_as_context(auth_client):
    """The LLM prompt must include content from both files."""
    add_custom_project("DiffCtx", "admin")
    captured_prompt = {}

    def _capture_complete(prompt):
        captured_prompt["text"] = prompt
        m = MagicMock()
        m.text = "Comparison done."
        return m

    with patch("main.get_file_chunks", side_effect=[
        ["Steel yield strength: 250 MPa"],
        ["Steel yield strength: 300 MPa"],
    ]), patch("main.adb.get_project_owner", new_callable=AsyncMock, return_value="admin"), \
         patch("llama_index.core.Settings") as mock_settings:
        mock_settings.llm.complete.side_effect = _capture_complete
        auth_client.post("/api/diff", json={
            "file_a": "v1.pdf", "file_b": "v2.pdf", "project": "DiffCtx",
        })

    prompt_text = captured_prompt.get("text", "")
    assert "250 MPa" in prompt_text
    assert "300 MPa" in prompt_text


def test_diff_filenames_in_prompt(auth_client):
    """File names must appear in the comparison prompt."""
    add_custom_project("DiffNames", "admin")
    captured_prompt = {}

    def _capture(prompt):
        captured_prompt["text"] = prompt
        m = MagicMock()
        m.text = "done"
        return m

    with patch("main.get_file_chunks", side_effect=[["A text"], ["B text"]]), \
         patch("main.adb.get_project_owner", new_callable=AsyncMock, return_value="admin"), \
         patch("llama_index.core.Settings") as mock_settings:
        mock_settings.llm.complete.side_effect = _capture
        auth_client.post("/api/diff", json={
            "file_a": "design_v1.pdf", "file_b": "design_v2.pdf", "project": "DiffNames",
        })

    text = captured_prompt.get("text", "")
    assert "design_v1.pdf" in text
    assert "design_v2.pdf" in text


# ── get_file_chunks unit tests ────────────────────────────────────────────────

class TestGetFileChunks:
    """Test the Qdrant chunk fetcher used by the diff endpoint."""

    def test_returns_empty_list_when_collection_missing(self):
        from src.engine import get_file_chunks
        with patch("src.engine._qdrant_client") as mock_client:
            mock_client.return_value.scroll.side_effect = Exception("Collection not found")
            result = get_file_chunks("admin", "proj", "missing.pdf")
        assert result == []

    def test_extracts_text_from_node_content(self):
        from src.engine import get_file_chunks
        import json as _json

        node_content = _json.dumps({"text": "Hello from node."})
        mock_point = MagicMock()
        mock_point.payload = {"_node_content": node_content, "file_name": "doc.pdf"}

        with patch("src.engine._qdrant_client") as mock_client:
            mock_client.return_value.scroll.return_value = ([mock_point], None)
            result = get_file_chunks("admin", "proj", "doc.pdf")

        assert result == ["Hello from node."]

    def test_falls_back_to_text_field(self):
        from src.engine import get_file_chunks

        mock_point = MagicMock()
        mock_point.payload = {"text": "Fallback text.", "file_name": "doc.pdf"}

        with patch("src.engine._qdrant_client") as mock_client:
            mock_client.return_value.scroll.return_value = ([mock_point], None)
            result = get_file_chunks("admin", "proj", "doc.pdf")

        assert "Fallback text." in result

    def test_respects_limit(self):
        from src.engine import get_file_chunks
        import json as _json

        points = []
        for i in range(5):
            p = MagicMock()
            p.payload = {"_node_content": _json.dumps({"text": f"chunk {i}"})}
            points.append(p)

        with patch("src.engine._qdrant_client") as mock_client:
            mock_client.return_value.scroll.return_value = (points, None)
            result = get_file_chunks("admin", "proj", "doc.pdf", limit=5)

        assert len(result) == 5
