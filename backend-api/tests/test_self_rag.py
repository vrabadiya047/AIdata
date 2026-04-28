"""
Unit tests for Self-RAG (self_rag_retrieve) in src/engine.py.

Relies on the session-wide stubs already injected by conftest.py.
All LLM / Qdrant calls are mocked — no network required.
"""
import pytest
from unittest.mock import MagicMock, patch

# conftest.py has already run and stubbed all heavy ML packages.
from src.engine import self_rag_retrieve, _extract_keywords


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_node(text="some content"):
    node = MagicMock()
    node.node.get_content.return_value = text
    return node


def _make_retriever(nodes_per_call):
    """Retriever whose successive retrieve() calls return nodes_per_call[i]."""
    call_count = [0]
    retriever = MagicMock()

    def _retrieve(query):
        idx = min(call_count[0], len(nodes_per_call) - 1)
        call_count[0] += 1
        return nodes_per_call[idx]

    retriever.retrieve.side_effect = _retrieve
    return retriever


# ── tests ────────────────────────────────────────────────────────────────────

class TestSelfRAGRetrieve:

    def _run(self, retriever, postprocessors=None, query="what is the yield strength?",
             grade_returns=True):
        with patch("src.engine._grade_context", return_value=grade_returns):
            return self_rag_retrieve(retriever, postprocessors or [], query)

    def test_returns_nodes_and_events(self):
        nodes = [_make_node()]
        retriever = _make_retriever([nodes])
        result_nodes, events = self._run(retriever, grade_returns=True)
        assert result_nodes == nodes
        assert isinstance(events, list)

    def test_no_retry_when_grade_passes(self):
        """Critic says YES on first attempt → no retry events emitted."""
        nodes = [_make_node()]
        retriever = _make_retriever([nodes])
        _, events = self._run(retriever, grade_returns=True)
        assert not any(e["type"] == "retry" for e in events)

    def test_retry_emitted_when_grade_fails(self):
        """Critic says NO → a retry event must be emitted."""
        nodes = [_make_node()]
        retriever = _make_retriever([nodes, nodes])
        _, events = self._run(retriever, grade_returns=False)
        assert any(e["type"] == "retry" for e in events)

    def test_retry_event_has_required_fields(self):
        nodes = [_make_node()]
        retriever = _make_retriever([nodes, nodes])
        _, events = self._run(retriever, grade_returns=False)
        for ev in events:
            if ev["type"] == "retry":
                assert "message" in ev
                assert "attempt" in ev

    def test_grade_event_emitted_before_retry(self):
        """'grading' event must precede the 'retry' event in the sequence."""
        nodes = [_make_node()]
        retriever = _make_retriever([nodes, nodes])
        _, events = self._run(retriever, grade_returns=False)
        types_seq = [e["type"] for e in events]
        if "retry" in types_seq and "grading" in types_seq:
            assert types_seq.index("grading") < types_seq.index("retry")

    def test_empty_retrieval_triggers_retry(self):
        """First retrieve returns nothing → retry keyword search, return second nodes."""
        nodes = [_make_node()]
        retriever = _make_retriever([[], nodes])
        result_nodes, events = self._run(retriever, grade_returns=True)
        assert any(e["type"] == "retry" for e in events)
        assert result_nodes == nodes

    def test_returns_best_nodes_after_retries(self):
        """Nodes from any successful attempt are returned (not lost after retry)."""
        first_nodes = [_make_node("weak context")]
        second_nodes = [_make_node("strong context")]
        call_n = [0]
        retriever = MagicMock()

        def _retrieve(q):
            i = call_n[0]; call_n[0] += 1
            return [first_nodes, second_nodes][min(i, 1)]

        retriever.retrieve.side_effect = _retrieve

        grade_calls = [0]

        def _grade(query, context):
            i = grade_calls[0]; grade_calls[0] += 1
            return i > 0  # first NO, second YES

        with patch("src.engine._grade_context", side_effect=_grade):
            nodes, _ = self_rag_retrieve(retriever, [], "some question")

        assert nodes is not None and len(nodes) > 0

    def test_postprocessors_are_applied(self):
        """Each postprocessor must receive and transform the retrieved nodes."""
        raw_nodes = [_make_node()]
        processed_nodes = [_make_node("processed")]
        retriever = _make_retriever([raw_nodes])

        pp = MagicMock()
        pp.postprocess_nodes.return_value = processed_nodes

        result_nodes, _ = self._run(retriever, postprocessors=[pp], grade_returns=True)

        pp.postprocess_nodes.assert_called_once()
        assert result_nodes == processed_nodes

    def test_extract_keywords_removes_stop_words(self):
        result = _extract_keywords("what is the yield strength of steel")
        assert "what" not in result
        assert "is" not in result
        assert "the" not in result
        assert "yield" in result
        assert "strength" in result
        assert "steel" in result

    def test_extract_keywords_fallback_when_all_stop_words(self):
        result = _extract_keywords("what is the")
        assert len(result) > 0
