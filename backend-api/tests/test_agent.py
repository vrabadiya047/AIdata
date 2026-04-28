"""
Tests for the /api/agent endpoint (ReActAgent with tools).

All LlamaIndex/Ollama/Qdrant calls are mocked — no GPU or network needed.
The WorkflowHandler async iterator is simulated with an async generator.
"""
import json
import pytest
from unittest.mock import MagicMock, patch, AsyncMock


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


def _make_tool_result_event(tool_name: str, kwargs: str, output: str):
    """Build a minimal ToolCallResult-like mock."""
    evt = MagicMock()
    # isinstance() checks won't work with MagicMock, so we patch with spec below
    evt.tool_name = tool_name
    evt.tool_kwargs = kwargs
    evt.tool_output = output
    return evt


async def _mock_stream_events(tool_events=(), token_events=()):
    """Async generator that yields mock agent events."""
    for e in tool_events:
        yield e
    for delta in token_events:
        e = MagicMock()
        e.delta = delta
        yield e


def _make_workflow_handler(tool_events=(), token_events=()):
    """Return an async-iterable mock WorkflowHandler."""
    handler = MagicMock()

    async def _stream():
        async for evt in _mock_stream_events(tool_events, token_events):
            yield evt

    handler.stream_events = _stream
    handler.__await__ = lambda self: iter([None])  # make it awaitable
    return handler


def _post_agent(auth_client, agent=None, project="AgentProj"):
    """POST to /api/agent with mocked engine and event imports."""
    if agent is None:
        agent = MagicMock()
        agent.run.return_value = _make_workflow_handler(token_events=["Hello", " world"])

    from llama_index.core.agent.workflow import workflow_events as _wfe  # noqa
    import sys
    # Ensure the event classes used in isinstance() checks are the real ones
    # (they're already available from the conftest stub tree, but let's be explicit)

    with patch("main.get_agent_engine", return_value=agent), \
         patch("main.adb.save_chat_message", new_callable=AsyncMock), \
         patch("main.adb.get_project_owner", new_callable=AsyncMock, return_value="admin"), \
         patch("main.log_query"):
        from src.database import add_custom_project
        add_custom_project(project, "admin")
        r = auth_client.post("/api/agent", json={
            "prompt": "What materials are mentioned in the specs?",
            "project": project,
            "username": "admin",
            "thread_id": "General",
        })
    return r


# ── authentication ────────────────────────────────────────────────────────────

def test_agent_unauthenticated(client):
    r = client.post("/api/agent", json={
        "prompt": "test", "project": "P", "username": "u", "thread_id": "G",
    })
    assert r.status_code == 401


# ── no index ──────────────────────────────────────────────────────────────────

def test_agent_no_index_returns_message(auth_client):
    """When get_agent_engine returns None (no docs), a helpful message is streamed."""
    with patch("main.get_agent_engine", return_value=None), \
         patch("main.adb.save_chat_message", new_callable=AsyncMock), \
         patch("main.adb.get_project_owner", new_callable=AsyncMock, return_value="admin"), \
         patch("main.log_query"):
        from src.database import add_custom_project
        add_custom_project("AgentEmpty", "admin")
        r = auth_client.post("/api/agent", json={
            "prompt": "anything",
            "project": "AgentEmpty",
            "username": "admin",
            "thread_id": "General",
        })
    assert r.status_code == 200
    events = _sse_events(r.content)
    tokens = [e["token"] for e in events if "token" in e]
    full = "".join(tokens)
    assert "no documents" in full.lower() or "upload" in full.lower()


# ── token streaming ───────────────────────────────────────────────────────────

def test_agent_streams_tokens(auth_client):
    """Tokens emitted by AgentStream.delta must appear in the SSE output."""
    from llama_index.core.agent.workflow.workflow_events import AgentStream

    async def _events():
        for delta in ["The ", "answer ", "is 42."]:
            e = AgentStream(
                delta=delta, response="", current_agent_name="Agent",
                tool_calls=[], raw=MagicMock(),
            )
            yield e

    handler = MagicMock()
    handler.stream_events = _events
    handler.__await__ = lambda s: iter([None])

    agent = MagicMock()
    agent.run.return_value = handler

    r = _post_agent(auth_client, agent=agent, project="AgentTokens")
    assert r.status_code == 200
    events = _sse_events(r.content)
    tokens = [e["token"] for e in events if "token" in e]
    assert "".join(tokens) == "The answer is 42."


# ── tool-call thoughts ────────────────────────────────────────────────────────

def test_agent_emits_thought_for_tool_calls(auth_client):
    """ToolCallResult events must be forwarded as thought SSE events."""
    from llama_index.core.agent.workflow.workflow_events import AgentStream, ToolCallResult

    tool_evt = ToolCallResult(
        tool_name="calculate",
        tool_kwargs={"expression": "1500 * 750"},
        tool_id="t1",
        tool_output="1125000",
        return_direct=False,
    )

    async def _events():
        yield tool_evt
        e = AgentStream(
            delta="Total cost: $1,125,000",
            response="", current_agent_name="Agent",
            tool_calls=[], raw=MagicMock(),
        )
        yield e

    handler = MagicMock()
    handler.stream_events = _events
    handler.__await__ = lambda s: iter([None])

    agent = MagicMock()
    agent.run.return_value = handler

    r = _post_agent(auth_client, agent=agent, project="AgentThoughts")
    assert r.status_code == 200
    events = _sse_events(r.content)

    thought_events = [e for e in events if "thought" in e]
    assert len(thought_events) >= 1
    thought_text = thought_events[0]["thought"]
    assert "calculate" in thought_text
    assert "1125000" in thought_text


def test_agent_thought_before_tokens(auth_client):
    """Thoughts must appear in the SSE stream before any token events."""
    from llama_index.core.agent.workflow.workflow_events import AgentStream, ToolCallResult

    tool_evt = ToolCallResult(
        tool_name="rag_search", tool_kwargs={"query": "steel"},
        tool_id="t2", tool_output="Steel yield: 250 MPa", return_direct=False,
    )

    async def _events():
        yield tool_evt
        yield AgentStream(delta="Found it.", response="",
                          current_agent_name="Agent", tool_calls=[], raw=MagicMock())

    handler = MagicMock()
    handler.stream_events = _events
    handler.__await__ = lambda s: iter([None])
    agent = MagicMock()
    agent.run.return_value = handler

    r = _post_agent(auth_client, agent=agent, project="AgentOrder")
    events = _sse_events(r.content)
    kinds = ["thought" if "thought" in e else "token" for e in events]
    assert kinds.index("thought") < kinds.index("token")


# ── agent error handling ──────────────────────────────────────────────────────

def test_agent_error_returns_message_not_500(auth_client):
    """If agent.run raises, endpoint must stream an error message, not 500."""
    async def _events():
        raise RuntimeError("Ollama timed out")
        yield  # make it an async generator

    handler = MagicMock()
    handler.stream_events = _events
    handler.__await__ = lambda s: iter([None])
    agent = MagicMock()
    agent.run.return_value = handler

    r = _post_agent(auth_client, agent=agent, project="AgentErr")
    assert r.status_code == 200
    events = _sse_events(r.content)
    tokens = "".join(e.get("token", "") for e in events)
    assert "error" in tokens.lower() or "agent" in tokens.lower()
