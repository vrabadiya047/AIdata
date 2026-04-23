"""API integration tests for thread endpoints."""
import pytest

from src.database import save_chat_message


# ── GET /api/threads ──────────────────────────────────────────────────────────

def test_get_threads_unauthenticated(client):
    r = client.get("/api/threads?project=anything")
    assert r.status_code == 401


def test_get_threads_empty(auth_client):
    auth_client.post("/api/projects", json={"name": "EmptyThreadProj", "username": "admin"})
    r = auth_client.get("/api/threads?project=EmptyThreadProj")
    assert r.status_code == 200
    assert r.json()["threads"] == []


def test_get_threads_after_chat(auth_client):
    save_chat_message("ChatProj", "admin", "General", "user", "hello")
    r = auth_client.get("/api/threads?project=ChatProj")
    assert r.status_code == 200
    assert "General" in r.json()["threads"]


def test_get_threads_multiple(auth_client):
    save_chat_message("MultiProj", "admin", "Alpha", "user", "msg1")
    save_chat_message("MultiProj", "admin", "Beta",  "user", "msg2")
    r = auth_client.get("/api/threads?project=MultiProj")
    threads = r.json()["threads"]
    assert "Alpha" in threads
    assert "Beta" in threads


# ── PUT /api/threads (rename) ─────────────────────────────────────────────────

def test_rename_thread_unauthenticated(client):
    r = client.put("/api/threads", json={
        "project": "X", "old_id": "Old", "new_id": "New"
    })
    assert r.status_code == 401


def test_rename_thread(auth_client):
    save_chat_message("RenameProj", "admin", "BeforeRename", "user", "hi")
    r = auth_client.put("/api/threads", json={
        "project": "RenameProj",
        "old_id": "BeforeRename",
        "new_id": "AfterRename",
    })
    assert r.status_code == 200
    assert r.json()["status"] == "renamed"

    threads = auth_client.get("/api/threads?project=RenameProj").json()["threads"]
    assert "AfterRename" in threads
    assert "BeforeRename" not in threads


# ── DELETE /api/threads ───────────────────────────────────────────────────────

def test_delete_thread_unauthenticated(client):
    r = client.delete("/api/threads?project=X&thread_id=T")
    assert r.status_code == 401


def test_delete_thread(auth_client):
    save_chat_message("DelProj", "admin", "ThreadToGo", "user", "bye")
    r = auth_client.delete("/api/threads?project=DelProj&thread_id=ThreadToGo")
    assert r.status_code == 200
    assert r.json()["status"] == "deleted"

    threads = auth_client.get("/api/threads?project=DelProj").json()["threads"]
    assert "ThreadToGo" not in threads


# ── Query log ─────────────────────────────────────────────────────────────────

def test_query_log_unauthenticated(client):
    r = client.get("/api/query-log")
    assert r.status_code == 401


def test_query_log_empty(auth_client):
    r = auth_client.get("/api/query-log")
    assert r.status_code == 200
    assert "entries" in r.json()
