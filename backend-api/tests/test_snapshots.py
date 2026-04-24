"""Tests for snapshot creation, retrieval, and deletion."""
import uuid
import pytest

from src.database import (
    create_snapshot, get_snapshot, list_user_snapshots, delete_snapshot,
    add_custom_project, save_chat_message,
)


# ── Database-layer tests ──────────────────────────────────────────────────────

def test_create_and_get_snapshot():
    snap_id = str(uuid.uuid4())
    messages = [{"role": "user", "content": "Hello"}, {"role": "assistant", "content": "Hi"}]
    files = ["doc1.pdf", "doc2.txt"]
    create_snapshot(snap_id, "ProjSnap", "owner1", "Thread-1", "My Snapshot", "owner1", messages, files)

    snap = get_snapshot(snap_id)
    assert snap is not None
    assert snap["id"] == snap_id
    assert snap["project_name"] == "ProjSnap"
    assert snap["thread_id"] == "Thread-1"
    assert snap["title"] == "My Snapshot"
    assert snap["created_by"] == "owner1"
    assert snap["messages"] == messages
    assert set(snap["files"]) == set(files)


def test_get_snapshot_not_found():
    result = get_snapshot(str(uuid.uuid4()))
    assert result is None


def test_list_user_snapshots():
    user = "listowner"
    id1, id2 = str(uuid.uuid4()), str(uuid.uuid4())
    create_snapshot(id1, "Proj1", user, "T1", "Snap A", user, [], [])
    create_snapshot(id2, "Proj2", user, "T2", "Snap B", user, [], ["file.pdf"])

    snaps = list_user_snapshots(user)
    ids = [s["id"] for s in snaps]
    assert id1 in ids
    assert id2 in ids


def test_list_user_snapshots_empty():
    assert list_user_snapshots("nobody_ever") == []


def test_delete_snapshot():
    snap_id = str(uuid.uuid4())
    create_snapshot(snap_id, "DelProj", "delowner", "T1", "To Delete", "delowner", [], [])
    assert get_snapshot(snap_id) is not None

    delete_snapshot(snap_id, "delowner")
    assert get_snapshot(snap_id) is None


def test_delete_snapshot_wrong_user_does_nothing():
    snap_id = str(uuid.uuid4())
    create_snapshot(snap_id, "P", "realowner", "T", "Keep Me", "realowner", [], [])

    delete_snapshot(snap_id, "attacker")  # wrong user — should be a no-op
    assert get_snapshot(snap_id) is not None  # still exists


def test_snapshot_stores_messages_correctly():
    snap_id = str(uuid.uuid4())
    messages = [
        {"role": "user", "content": "What is E=mc²?"},
        {"role": "assistant", "content": "Einstein's mass-energy equivalence formula."},
    ]
    create_snapshot(snap_id, "P", "u", "T", "Physics", "u", messages, [])
    snap = get_snapshot(snap_id)
    assert snap["messages"][0]["content"] == "What is E=mc²?"
    assert snap["messages"][1]["role"] == "assistant"


# ── HTTP endpoint tests ───────────────────────────────────────────────────────

def test_create_snapshot_unauthenticated(client):
    r = client.post("/api/snapshots", json={"project": "P", "thread_id": "T"})
    assert r.status_code == 401


def test_create_snapshot_returns_id(auth_client):
    add_custom_project("SnapHTTPProj", "admin")
    save_chat_message("SnapHTTPProj", "admin", "TestThread", "user", "Hello")
    save_chat_message("SnapHTTPProj", "admin", "TestThread", "assistant", "Hi there!")

    r = auth_client.post("/api/snapshots", json={
        "project": "SnapHTTPProj",
        "thread_id": "TestThread",
        "title": "HTTP Snapshot Test",
    })
    assert r.status_code == 200
    data = r.json()
    assert "id" in data
    assert len(data["id"]) == 36  # UUID format


def test_get_snapshot_public(auth_client, client):
    add_custom_project("PublicSnapProj", "admin")
    save_chat_message("PublicSnapProj", "admin", "PubThread", "user", "Public question")

    r = auth_client.post("/api/snapshots", json={
        "project": "PublicSnapProj",
        "thread_id": "PubThread",
        "title": "Public Snap",
    })
    snap_id = r.json()["id"]

    # Anyone (unauthenticated) can read a snapshot by ID
    r2 = client.get(f"/api/snapshots/{snap_id}")
    assert r2.status_code == 200
    data = r2.json()
    assert data["id"] == snap_id
    assert data["title"] == "Public Snap"
    assert isinstance(data["messages"], list)
    assert isinstance(data["files"], list)


def test_get_snapshot_not_found(client):
    r = client.get(f"/api/snapshots/{uuid.uuid4()}")
    assert r.status_code == 404


def test_list_snapshots_authenticated(auth_client):
    r = auth_client.get("/api/snapshots")
    assert r.status_code == 200
    assert "snapshots" in r.json()
    assert isinstance(r.json()["snapshots"], list)


def test_list_snapshots_unauthenticated(client):
    r = client.get("/api/snapshots")
    assert r.status_code == 401


def test_delete_snapshot_http(auth_client):
    add_custom_project("DeleteSnapProj", "admin")
    r = auth_client.post("/api/snapshots", json={
        "project": "DeleteSnapProj",
        "thread_id": "DelThread",
        "title": "To Be Deleted",
    })
    snap_id = r.json()["id"]

    r2 = auth_client.delete(f"/api/snapshots/{snap_id}")
    assert r2.status_code == 200

    r3 = auth_client.get(f"/api/snapshots/{snap_id}")
    assert r3.status_code == 404


def test_delete_snapshot_unauthenticated(client, auth_client):
    add_custom_project("NoDelSnapProj", "admin")
    r = auth_client.post("/api/snapshots", json={
        "project": "NoDelSnapProj",
        "thread_id": "T",
        "title": "Protected",
    })
    snap_id = r.json()["id"]

    r2 = client.delete(f"/api/snapshots/{snap_id}")
    assert r2.status_code == 401
