"""
Tests for source-citation extraction in the /api/query SSE stream.

The engine and LlamaIndex are fully mocked so these run without Ollama/Qdrant.
"""
import json
import pytest
from unittest.mock import MagicMock, patch


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_source_node(file_name, page_label=None, text="", score=0.9):
    """Build a minimal LlamaIndex-like NodeWithScore mock."""
    node = MagicMock()
    meta = {"file_name": file_name}
    if page_label is not None:
        meta["page_label"] = page_label
    node.metadata = meta
    node.text = text
    sn = MagicMock()
    sn.node = node
    sn.score = score
    return sn


def _make_engine_response(source_nodes, tokens=("Hello", " world")):
    """Return a mock engine whose .query() yields a streaming response."""
    response = MagicMock()
    response.source_nodes = source_nodes
    response.response_gen = iter(tokens)
    # Make str(response) return something sensible for the non-streaming branch
    response.__str__ = lambda self: "Hello world"
    return response


def _sse_events(raw: bytes) -> list[dict]:
    """Parse SSE bytes → list of JSON dicts (skips [DONE] and empties)."""
    events = []
    for line in raw.decode().splitlines():
        if line.startswith("data: ") and line[6:] != "[DONE]":
            try:
                events.append(json.loads(line[6:]))
            except json.JSONDecodeError:
                pass
    return events


# ══════════════════════════════════════════════════════════════════════════════
# Extraction unit tests — call generate_tokens() directly via the HTTP endpoint
# ══════════════════════════════════════════════════════════════════════════════

class TestSourceExtractionViaEndpoint:
    """Drive /api/query with a mocked engine and inspect SSE output."""

    def _post(self, auth_client, engine_response):
        mock_retriever = MagicMock()
        mock_retriever.retrieve.return_value = engine_response.source_nodes

        mock_synthesizer = MagicMock()
        mock_synthesizer.synthesize.return_value = engine_response

        with patch("main.get_query_components", return_value=(mock_retriever, [], mock_synthesizer)):
            with patch("main.save_chat_message"), patch("main.log_query"):
                auth_client.post("/api/projects", json={"name": "cite_proj"})
                r = auth_client.post("/api/query", json={
                    "prompt": "test question",
                    "project": "cite_proj",
                    "username": "admin",
                    "thread_id": "General",
                })
        return r

    def test_sources_event_emitted_before_tokens(self, auth_client):
        sn = _make_source_node("report.pdf", page_label="5", text="The answer is 42.", score=0.95)
        resp = _make_engine_response([sn])
        r = self._post(auth_client, resp)
        assert r.status_code == 200
        events = _sse_events(r.content)
        # First event must be sources
        assert "sources" in events[0]
        src = events[0]["sources"][0]
        assert src["file"] == "report.pdf"
        assert src["page"] == 5
        assert src["score"] == 0.95
        assert "answer is 42" in src["excerpt"]

    def test_page_label_none_when_not_present(self, auth_client):
        sn = _make_source_node("notes.txt", page_label=None, text="Some text.", score=0.7)
        resp = _make_engine_response([sn])
        r = self._post(auth_client, resp)
        events = _sse_events(r.content)
        src = events[0]["sources"][0]
        assert src["page"] is None

    def test_excerpt_truncated_to_280_chars(self, auth_client):
        long_text = "A" * 500
        sn = _make_source_node("big.pdf", page_label="1", text=long_text, score=0.8)
        resp = _make_engine_response([sn])
        r = self._post(auth_client, resp)
        events = _sse_events(r.content)
        src = events[0]["sources"][0]
        assert len(src["excerpt"]) <= 280

    def test_deduplication_by_file_and_page(self, auth_client):
        """Two nodes from same file+page → only one citation."""
        sn1 = _make_source_node("doc.pdf", page_label="3", text="First chunk.", score=0.9)
        sn2 = _make_source_node("doc.pdf", page_label="3", text="Second chunk.", score=0.85)
        resp = _make_engine_response([sn1, sn2])
        r = self._post(auth_client, resp)
        events = _sse_events(r.content)
        assert len(events[0]["sources"]) == 1

    def test_same_file_different_pages_both_emitted(self, auth_client):
        """Two nodes from same file but different pages → two citations."""
        sn1 = _make_source_node("manual.pdf", page_label="2", text="Chapter intro.", score=0.9)
        sn2 = _make_source_node("manual.pdf", page_label="7", text="Later section.", score=0.8)
        resp = _make_engine_response([sn1, sn2])
        r = self._post(auth_client, resp)
        events = _sse_events(r.content)
        pages = [s["page"] for s in events[0]["sources"]]
        assert 2 in pages
        assert 7 in pages

    def test_multiple_files_cited(self, auth_client):
        sn1 = _make_source_node("alpha.pdf", page_label="1", text="Alpha content.", score=0.9)
        sn2 = _make_source_node("beta.txt",  page_label=None,  text="Beta content.",  score=0.7)
        resp = _make_engine_response([sn1, sn2])
        r = self._post(auth_client, resp)
        events = _sse_events(r.content)
        files = [s["file"] for s in events[0]["sources"]]
        assert "alpha.pdf" in files
        assert "beta.txt" in files

    def test_no_sources_event_when_no_nodes(self, auth_client):
        """If source_nodes is empty, no sources event is emitted."""
        resp = _make_engine_response([])
        r = self._post(auth_client, resp)
        events = _sse_events(r.content)
        source_events = [e for e in events if "sources" in e]
        assert source_events == []

    def test_score_rounded_to_3_decimal_places(self, auth_client):
        sn = _make_source_node("x.pdf", page_label="1", text="x", score=0.987654321)
        resp = _make_engine_response([sn])
        r = self._post(auth_client, resp)
        events = _sse_events(r.content)
        score = events[0]["sources"][0]["score"]
        assert score == round(0.987654321, 3)

    def test_tokens_follow_sources(self, auth_client):
        """Ensure token events come after the sources event."""
        sn = _make_source_node("z.pdf", page_label="1", text="z", score=0.9)
        resp = _make_engine_response([sn], tokens=("tok1", "tok2"))
        r = self._post(auth_client, resp)
        events = _sse_events(r.content)
        assert events[0].get("sources") is not None
        token_events = [e for e in events if "token" in e]
        assert len(token_events) >= 1


# ══════════════════════════════════════════════════════════════════════════════
# Metadata extraction unit tests — pure logic, no HTTP
# ══════════════════════════════════════════════════════════════════════════════

class TestMetadataExtraction:
    """Test the file_name / page_label fallback logic in isolation."""

    def _extract(self, meta: dict, text="", score=0.9):
        """Reproduce the extraction logic from main.py generate_tokens()."""
        fname = (
            meta.get("file_name") or
            meta.get("filename") or
            (meta.get("file_path", "").replace("\\", "/").split("/")[-1]) or
            "Unknown"
        )
        raw_page = meta.get("page_label") or meta.get("page")
        try:
            page = int(raw_page) if raw_page is not None else None
        except (ValueError, TypeError):
            page = None
        return {"file": fname, "page": page, "excerpt": text[:280].strip(), "score": round(score, 3)}

    def test_uses_file_name_field(self):
        r = self._extract({"file_name": "report.pdf"})
        assert r["file"] == "report.pdf"

    def test_falls_back_to_filename(self):
        r = self._extract({"filename": "notes.txt"})
        assert r["file"] == "notes.txt"

    def test_falls_back_to_file_path_basename(self):
        r = self._extract({"file_path": "/data/admin/proj/doc.csv"})
        assert r["file"] == "doc.csv"

    def test_windows_path_normalised(self):
        r = self._extract({"file_path": "C:\\Users\\data\\file.pdf"})
        assert r["file"] == "file.pdf"

    def test_page_label_as_int(self):
        r = self._extract({"file_name": "f.pdf", "page_label": "12"})
        assert r["page"] == 12

    def test_page_label_integer_passthrough(self):
        r = self._extract({"file_name": "f.pdf", "page_label": 7})
        assert r["page"] == 7

    def test_page_key_as_fallback(self):
        r = self._extract({"file_name": "f.pdf", "page": "3"})
        assert r["page"] == 3

    def test_invalid_page_label_yields_none(self):
        r = self._extract({"file_name": "f.pdf", "page_label": "N/A"})
        assert r["page"] is None

    def test_missing_page_yields_none(self):
        r = self._extract({"file_name": "f.pdf"})
        assert r["page"] is None
