"""API integration tests for project (workspace) endpoints."""
import pytest


# ── List workspaces ───────────────────────────────────────────────────────────

def test_workspaces_unauthenticated(client):
    r = client.get("/api/workspaces/admin")
    assert r.status_code == 401


def test_get_own_workspaces(auth_client):
    r = auth_client.get("/api/workspaces/admin")
    assert r.status_code == 200
    assert "workspaces" in r.json()


def test_admin_can_view_any_workspaces(auth_client):
    r = auth_client.get("/api/workspaces/someotheruser")
    assert r.status_code == 200


# ── Create project ────────────────────────────────────────────────────────────

def test_create_project_unauthenticated(client):
    r = client.post("/api/projects", json={"name": "ShouldFail", "username": "admin"})
    assert r.status_code == 401


def test_create_project(auth_client):
    r = auth_client.post("/api/projects", json={"name": "ApiProject1", "username": "admin"})
    assert r.status_code == 200
    assert r.json()["name"] == "ApiProject1"


def test_create_project_appears_in_workspaces(auth_client):
    auth_client.post("/api/projects", json={"name": "VisibleProject", "username": "admin"})
    r = auth_client.get("/api/workspaces/admin")
    names = [w["name"] for w in r.json()["workspaces"]]
    assert "VisibleProject" in names


def test_create_project_empty_name(auth_client):
    r = auth_client.post("/api/projects", json={"name": "", "username": "admin"})
    assert r.status_code == 400


# ── Rename project ────────────────────────────────────────────────────────────

def test_rename_project(auth_client):
    auth_client.post("/api/projects", json={"name": "BeforeRename", "username": "admin"})
    r = auth_client.put("/api/projects/BeforeRename", json={"new_name": "AfterRename"})
    assert r.status_code == 200
    assert r.json()["name"] == "AfterRename"


def test_rename_project_empty_name(auth_client):
    auth_client.post("/api/projects", json={"name": "KeepMe", "username": "admin"})
    r = auth_client.put("/api/projects/KeepMe", json={"new_name": "   "})
    assert r.status_code == 400


def test_rename_project_unauthenticated(client):
    r = client.put("/api/projects/anything", json={"new_name": "other"})
    assert r.status_code == 401


# ── Delete project ────────────────────────────────────────────────────────────

def test_delete_project(auth_client):
    auth_client.post("/api/projects", json={"name": "ToBeDeleted", "username": "admin"})
    r = auth_client.delete("/api/projects/ToBeDeleted")
    assert r.status_code == 200


def test_delete_project_unauthenticated(client):
    r = client.delete("/api/projects/anything")
    assert r.status_code == 401


# ── Visibility ────────────────────────────────────────────────────────────────

def test_set_visibility(auth_client):
    auth_client.post("/api/projects", json={"name": "VisProj", "username": "admin"})
    r = auth_client.put("/api/projects/VisProj/visibility", json={"visibility": "public"})
    assert r.status_code == 200


def test_invalid_visibility(auth_client):
    auth_client.post("/api/projects", json={"name": "InvVisProj", "username": "admin"})
    r = auth_client.put("/api/projects/InvVisProj/visibility", json={"visibility": "secret"})
    assert r.status_code == 400


# ── Sharing ───────────────────────────────────────────────────────────────────

def test_share_and_get_shares(auth_client):
    auth_client.post("/api/projects", json={"name": "ShareMe", "username": "admin"})
    r = auth_client.post("/api/projects/ShareMe/share", json={"shared_with": "bob"})
    assert r.status_code == 200

    r = auth_client.get("/api/projects/ShareMe/shares")
    assert r.status_code == 200
    assert "bob" in r.json()["shared_with"]


def test_unshare(auth_client):
    auth_client.post("/api/projects", json={"name": "UnshareMe", "username": "admin"})
    auth_client.post("/api/projects/UnshareMe/share", json={"shared_with": "carol"})
    r = auth_client.delete("/api/projects/UnshareMe/share/carol")
    assert r.status_code == 200
