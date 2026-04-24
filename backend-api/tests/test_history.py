"""Tests for GET /api/history and shared-workspace history access."""
import pytest

from src.database import (
    add_custom_project, save_chat_message,
    share_project_with_user, get_project_owner, get_user_permissions,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _seed(project, owner, thread, messages):
    add_custom_project(project, owner)
    for role, content in messages:
        save_chat_message(project, owner, thread, role, content)


# ── Unauthenticated ───────────────────────────────────────────────────────────

def test_history_unauthenticated(client):
    r = client.get("/api/history", params={"project": "P", "username": "admin", "thread_id": "T"})
    assert r.status_code == 401


# ── Basic retrieval ───────────────────────────────────────────────────────────

def test_history_empty_thread(auth_client):
    add_custom_project("HistEmptyProj", "admin")
    r = auth_client.get("/api/history", params={
        "project": "HistEmptyProj", "username": "admin", "thread_id": "NoSuchThread",
    })
    assert r.status_code == 200
    assert r.json()["history"] == []


def test_history_returns_messages_in_order(auth_client):
    _seed("HistOrderProj", "admin", "MainThread", [
        ("user", "First question"),
        ("assistant", "First answer"),
        ("user", "Second question"),
        ("assistant", "Second answer"),
    ])
    r = auth_client.get("/api/history", params={
        "project": "HistOrderProj", "username": "admin", "thread_id": "MainThread",
    })
    assert r.status_code == 200
    history = r.json()["history"]
    assert len(history) == 4
    assert history[0]["role"] == "user"
    assert history[0]["content"] == "First question"
    assert history[3]["content"] == "Second answer"


def test_history_default_thread_is_general(auth_client):
    add_custom_project("HistDefaultProj", "admin")
    save_chat_message("HistDefaultProj", "admin", "General", "user", "General msg")
    r = auth_client.get("/api/history", params={
        "project": "HistDefaultProj", "username": "admin",
    })
    assert r.status_code == 200
    assert any(m["content"] == "General msg" for m in r.json()["history"])


def test_history_isolated_by_thread(auth_client):
    add_custom_project("HistIsolProj", "admin")
    save_chat_message("HistIsolProj", "admin", "ThreadA", "user", "In A")
    save_chat_message("HistIsolProj", "admin", "ThreadB", "user", "In B")

    r = auth_client.get("/api/history", params={
        "project": "HistIsolProj", "username": "admin", "thread_id": "ThreadA",
    })
    contents = [m["content"] for m in r.json()["history"]]
    assert "In A" in contents
    assert "In B" not in contents


# ── Shared workspace history ──────────────────────────────────────────────────

def test_history_shared_user_with_chats_permission(auth_client):
    """A user with 'chats' permission sees the owner's thread history."""
    add_custom_project("SharedHistProj", "admin")
    save_chat_message("SharedHistProj", "admin", "SharedThread", "user", "Owner msg")
    share_project_with_user("SharedHistProj", "admin", "histuser1", "documents,chats")

    r = auth_client.get("/api/history", params={
        "project": "SharedHistProj", "username": "histuser1", "thread_id": "SharedThread",
    })
    assert r.status_code == 200
    assert any(m["content"] == "Owner msg" for m in r.json()["history"])


def test_history_shared_user_without_chats_permission(auth_client):
    """A user without 'chats' permission gets an empty history."""
    add_custom_project("SharedHistProj2", "admin")
    save_chat_message("SharedHistProj2", "admin", "SecretThread", "user", "Secret")
    share_project_with_user("SharedHistProj2", "admin", "histuser2", "documents")

    r = auth_client.get("/api/history", params={
        "project": "SharedHistProj2", "username": "histuser2", "thread_id": "SecretThread",
    })
    assert r.status_code == 200
    assert r.json()["history"] == []
