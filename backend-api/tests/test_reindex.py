"""Tests for admin/user reindex endpoints and workspace listing privacy rules."""
import uuid
import pytest
from unittest.mock import patch, MagicMock


def _uid():
    return str(uuid.uuid4())[:8]


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _create_user(client, username, password="Pass123!", role="User"):
    client.post("/api/admin/users", json={"username": username, "password": password, "role": role})


def _login(app_client, username, password="Pass123!"):
    from fastapi.testclient import TestClient
    from main import app
    c = TestClient(app, raise_server_exceptions=False)
    r = c.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, f"Login failed for {username}: {r.text}"
    return c


def _create_project(client, name, visibility="private"):
    r = client.post("/api/projects", json={"name": name})
    assert r.status_code == 200
    if visibility != "private":
        client.put(f"/api/projects/{name}/visibility", json={"visibility": visibility})


# ══════════════════════════════════════════════════════════════════════════════
# GET /api/admin/workspaces — privacy rules
# ══════════════════════════════════════════════════════════════════════════════

class TestAdminWorkspacesPrivacy:
    def test_unauthenticated_returns_401(self, client):
        r = client.get("/api/admin/workspaces")
        assert r.status_code == 401

    def test_non_admin_returns_403(self, auth_client, _bootstrap_db):
        u = _uid()
        _create_user(auth_client, u)
        c = _login(auth_client, u)
        r = c.get("/api/admin/workspaces")
        assert r.status_code == 403

    def test_admin_sees_own_private_workspace(self, auth_client, _bootstrap_db):
        proj = f"adminpriv_{_uid()}"
        _create_project(auth_client, proj, visibility="private")
        r = auth_client.get("/api/admin/workspaces")
        assert r.status_code == 200
        names = [(w["username"], w["project"]) for w in r.json()["workspaces"]]
        assert ("admin", proj) in names

    def test_admin_sees_own_public_workspace(self, auth_client, _bootstrap_db):
        proj = f"adminpub_{_uid()}"
        _create_project(auth_client, proj, visibility="public")
        r = auth_client.get("/api/admin/workspaces")
        assert r.status_code == 200
        names = [(w["username"], w["project"]) for w in r.json()["workspaces"]]
        assert ("admin", proj) in names

    def test_admin_cannot_see_other_users_private_workspace(self, auth_client, _bootstrap_db):
        u = f"priv_{_uid()}"
        _create_user(auth_client, u)
        c = _login(auth_client, u)
        proj = f"secret_{_uid()}"
        _create_project(c, proj, visibility="private")

        r = auth_client.get("/api/admin/workspaces")
        assert r.status_code == 200
        private_entries = [
            w for w in r.json()["workspaces"]
            if w["username"] == u and w["project"] == proj
        ]
        assert private_entries == [], "Admin should NOT see another user's private workspace"

    def test_admin_sees_other_users_public_workspace(self, auth_client, _bootstrap_db):
        u = f"pub_{_uid()}"
        _create_user(auth_client, u)
        c = _login(auth_client, u)
        proj = f"public_{_uid()}"
        _create_project(c, proj, visibility="public")

        r = auth_client.get("/api/admin/workspaces")
        assert r.status_code == 200
        entries = [
            w for w in r.json()["workspaces"]
            if w["username"] == u and w["project"] == proj
        ]
        assert len(entries) == 1, "Admin should see other user's public workspace"
        assert entries[0]["visibility"] == "public"

    def test_admin_sees_other_users_shared_workspace(self, auth_client, _bootstrap_db):
        u = f"shrd_{_uid()}"
        _create_user(auth_client, u)
        c = _login(auth_client, u)
        proj = f"shared_{_uid()}"
        _create_project(c, proj, visibility="shared")

        r = auth_client.get("/api/admin/workspaces")
        assert r.status_code == 200
        entries = [
            w for w in r.json()["workspaces"]
            if w["username"] == u and w["project"] == proj
        ]
        assert len(entries) == 1, "Admin should see other user's shared workspace"
        assert entries[0]["visibility"] == "shared"

    def test_response_includes_visibility_field(self, auth_client, _bootstrap_db):
        proj = f"visfield_{_uid()}"
        _create_project(auth_client, proj, visibility="public")
        r = auth_client.get("/api/admin/workspaces")
        assert r.status_code == 200
        for w in r.json()["workspaces"]:
            assert "visibility" in w, "Each workspace entry must include visibility"


# ══════════════════════════════════════════════════════════════════════════════
# POST /api/admin/reindex — privacy guard
# ══════════════════════════════════════════════════════════════════════════════

class TestAdminReindexPrivacyGuard:
    def test_unauthenticated_returns_401(self, client):
        r = client.post("/api/admin/reindex", json={"workspaces": []})
        assert r.status_code == 401

    def test_non_admin_returns_403(self, auth_client, _bootstrap_db):
        u = _uid()
        _create_user(auth_client, u)
        c = _login(auth_client, u)
        r = c.post("/api/admin/reindex", json={"workspaces": []})
        assert r.status_code == 403

    def test_cannot_reindex_other_users_private_workspace(self, auth_client, _bootstrap_db):
        u = f"reidxpriv_{_uid()}"
        _create_user(auth_client, u)
        c = _login(auth_client, u)
        proj = f"pvt_{_uid()}"
        _create_project(c, proj, visibility="private")

        with patch("main.delete_project_index"), patch("main.list_files_in_project", return_value=[]):
            r = auth_client.post(
                "/api/admin/reindex",
                json={"workspaces": [{"username": u, "project": proj}]},
            )
        assert r.status_code == 200
        # Private workspace is silently skipped — job_ids should be empty
        assert r.json()["job_ids"] == [], "Private workspace must not be reindexed"

    def test_can_reindex_own_private_workspace(self, auth_client, _bootstrap_db):
        proj = f"ownpvt_{_uid()}"
        _create_project(auth_client, proj, visibility="private")

        import os, tempfile
        tmp = tempfile.mkdtemp()
        fake_file = os.path.join(tmp, "doc.txt")
        open(fake_file, "w").close()

        with (
            patch("main.delete_project_index"),
            patch("main.list_files_in_project", return_value=["doc.txt"]),
            patch("main.os.path.join", return_value=fake_file),
            patch("main.adb.enqueue_job"),
        ):
            r = auth_client.post(
                "/api/admin/reindex",
                json={"workspaces": [{"username": "admin", "project": proj}]},
            )
        assert r.status_code == 200
        assert r.json()["status"] == "queued"

    def test_can_reindex_other_users_public_workspace(self, auth_client, _bootstrap_db):
        u = f"reidxpub_{_uid()}"
        _create_user(auth_client, u)
        c = _login(auth_client, u)
        proj = f"pub_{_uid()}"
        _create_project(c, proj, visibility="public")

        with patch("main.delete_project_index"), patch("main.list_files_in_project", return_value=[]):
            r = auth_client.post(
                "/api/admin/reindex",
                json={"workspaces": [{"username": u, "project": proj}]},
            )
        assert r.status_code == 200
        assert r.json()["status"] == "queued"

    def test_empty_workspaces_returns_empty_job_ids(self, auth_client, _bootstrap_db):
        r = auth_client.post("/api/admin/reindex", json={"workspaces": []})
        assert r.status_code == 200
        assert r.json()["job_ids"] == []
        assert r.json()["count"] == 0


# ══════════════════════════════════════════════════════════════════════════════
# GET /api/user/workspaces
# ══════════════════════════════════════════════════════════════════════════════

class TestUserWorkspaces:
    def test_unauthenticated_returns_401(self, client):
        r = client.get("/api/user/workspaces")
        assert r.status_code == 401

    def test_returns_own_workspaces_only(self, auth_client, _bootstrap_db):
        u = f"uwsown_{_uid()}"
        _create_user(auth_client, u)
        c = _login(auth_client, u)

        proj = f"myws_{_uid()}"
        _create_project(c, proj)

        r = c.get("/api/user/workspaces")
        assert r.status_code == 200
        usernames = {w["username"] for w in r.json()["workspaces"]}
        assert usernames == {u}, "User workspace list must only contain own username"

    def test_does_not_include_other_users_workspaces(self, auth_client, _bootstrap_db):
        u1 = f"uws1_{_uid()}"
        u2 = f"uws2_{_uid()}"
        _create_user(auth_client, u1)
        _create_user(auth_client, u2)

        c1 = _login(auth_client, u1)
        c2 = _login(auth_client, u2)

        proj2 = f"u2ws_{_uid()}"
        _create_project(c2, proj2, visibility="public")

        r = c1.get("/api/user/workspaces")
        assert r.status_code == 200
        for w in r.json()["workspaces"]:
            assert w["username"] == u1, f"u1 should not see u2's workspace: {w}"

    def test_response_includes_file_count(self, auth_client, _bootstrap_db):
        u = f"uwsfc_{_uid()}"
        _create_user(auth_client, u)
        c = _login(auth_client, u)
        proj = f"fcws_{_uid()}"
        _create_project(c, proj)

        r = c.get("/api/user/workspaces")
        assert r.status_code == 200
        for w in r.json()["workspaces"]:
            assert "file_count" in w


# ══════════════════════════════════════════════════════════════════════════════
# POST /api/user/reindex — ownership guard
# ══════════════════════════════════════════════════════════════════════════════

class TestUserReindex:
    def test_unauthenticated_returns_401(self, client):
        r = client.post("/api/user/reindex", json={"workspaces": []})
        assert r.status_code == 401

    def test_cannot_reindex_another_users_workspace(self, auth_client, _bootstrap_db):
        u1 = f"ure1_{_uid()}"
        u2 = f"ure2_{_uid()}"
        _create_user(auth_client, u1)
        _create_user(auth_client, u2)

        c2 = _login(auth_client, u2)
        proj = f"u2proj_{_uid()}"
        _create_project(c2, proj)

        c1 = _login(auth_client, u1)
        r = c1.post(
            "/api/user/reindex",
            json={"workspaces": [{"username": u2, "project": proj}]},
        )
        assert r.status_code == 403, "User must not reindex another user's workspace"

    def test_can_reindex_own_workspace(self, auth_client, _bootstrap_db):
        u = f"ureo_{_uid()}"
        _create_user(auth_client, u)
        c = _login(auth_client, u)
        proj = f"myproj_{_uid()}"
        _create_project(c, proj)

        with patch("main.delete_project_index"), patch("main.list_files_in_project", return_value=[]):
            r = c.post(
                "/api/user/reindex",
                json={"workspaces": [{"username": u, "project": proj}]},
            )
        assert r.status_code == 200
        assert r.json()["status"] == "queued"

    def test_returns_job_ids(self, auth_client, _bootstrap_db):
        u = f"urejid_{_uid()}"
        _create_user(auth_client, u)
        c = _login(auth_client, u)
        proj = f"jidproj_{_uid()}"
        _create_project(c, proj)

        import os, tempfile
        tmp = tempfile.mkdtemp()
        fake_file = os.path.join(tmp, "a.txt")
        open(fake_file, "w").close()

        with (
            patch("main.delete_project_index"),
            patch("main.list_files_in_project", return_value=["a.txt"]),
            patch("main.os.path.join", return_value=fake_file),
            patch("main.adb.enqueue_job"),
        ):
            r = c.post(
                "/api/user/reindex",
                json={"workspaces": [{"username": u, "project": proj}]},
            )
        assert r.status_code == 200
        assert "job_ids" in r.json()

    def test_empty_workspaces_returns_empty_job_ids(self, auth_client, _bootstrap_db):
        r = auth_client.post("/api/user/reindex", json={"workspaces": []})
        assert r.status_code == 200
        assert r.json()["job_ids"] == []
