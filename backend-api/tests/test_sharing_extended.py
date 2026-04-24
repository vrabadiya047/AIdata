"""Tests for group sharing, permission updates, and permission-resolution DB functions."""
import pytest

from src.database import (
    add_custom_project, share_project_with_user, get_project_shares,
    share_project_with_group, unshare_project_from_group,
    create_group, add_group_member, delete_group,
    get_project_owner, get_user_permissions, update_share_permissions,
)


# ── get_project_owner ─────────────────────────────────────────────────────────

def test_owner_resolves_own_project():
    add_custom_project("OwnResolveProj", "admin")
    assert get_project_owner("OwnResolveProj", "admin") == "admin"


def test_owner_resolves_directly_shared_project():
    add_custom_project("DirectSharedProj", "admin")
    share_project_with_user("DirectSharedProj", "admin", "shareduser1", "documents,chats")
    assert get_project_owner("DirectSharedProj", "shareduser1") == "admin"


def test_owner_resolves_group_shared_project():
    add_custom_project("GroupSharedProj", "admin")
    create_group("ResolveTestGroup", "admin")
    add_group_member("ResolveTestGroup", "admin", "groupmember1")
    share_project_with_group("GroupSharedProj", "admin", "ResolveTestGroup", "admin")
    assert get_project_owner("GroupSharedProj", "groupmember1") == "admin"


def test_owner_falls_back_for_unknown_project():
    # Unknown project — fallback returns the requester themselves
    result = get_project_owner("NonExistentProject999", "someuser")
    assert result == "someuser"


# ── get_user_permissions ──────────────────────────────────────────────────────

def test_owner_has_all_permissions():
    add_custom_project("OwnerPermsProj", "admin")
    perms = get_user_permissions("OwnerPermsProj", "admin", "admin")
    assert set(perms) == {"documents", "chats", "upload", "query"}


def test_shared_user_gets_granted_permissions():
    add_custom_project("SharedPermsProj", "admin")
    share_project_with_user("SharedPermsProj", "admin", "permuser1", "documents,chats")
    perms = get_user_permissions("SharedPermsProj", "admin", "permuser1")
    assert "documents" in perms
    assert "chats" in perms
    assert "upload" not in perms
    assert "query" not in perms


def test_shared_user_with_all_permissions():
    add_custom_project("AllPermsProj", "admin")
    share_project_with_user("AllPermsProj", "admin", "permuser2", "documents,chats,upload,query")
    perms = get_user_permissions("AllPermsProj", "admin", "permuser2")
    assert set(perms) == {"documents", "chats", "upload", "query"}


def test_group_member_gets_group_permissions():
    add_custom_project("GroupPermsProj", "admin")
    create_group("PermsGroup", "admin")
    add_group_member("PermsGroup", "admin", "grppermsuser")
    share_project_with_group("GroupPermsProj", "admin", "PermsGroup", "admin")
    perms = get_user_permissions("GroupPermsProj", "admin", "grppermsuser")
    assert len(perms) > 0


def test_unshared_user_gets_no_permissions():
    add_custom_project("NoPermsProj", "admin")
    perms = get_user_permissions("NoPermsProj", "admin", "completestranger")
    assert perms == []


# ── update_share_permissions ──────────────────────────────────────────────────

def test_update_share_permissions_db():
    add_custom_project("UpdatePermsProj", "admin")
    share_project_with_user("UpdatePermsProj", "admin", "updateuser", "documents")

    update_share_permissions("UpdatePermsProj", "admin", "updateuser", "documents,chats,upload")

    perms = get_user_permissions("UpdatePermsProj", "admin", "updateuser")
    assert "chats" in perms
    assert "upload" in perms


# ── share_project_with_group / unshare ────────────────────────────────────────

def test_share_and_unshare_group_db():
    add_custom_project("GroupShareDBProj", "admin")
    create_group("DBShareGroup", "admin")
    share_project_with_group("GroupShareDBProj", "admin", "DBShareGroup", "admin")

    # Verify via a group member gaining owner resolution
    add_group_member("DBShareGroup", "admin", "dbgroupmember")
    assert get_project_owner("GroupShareDBProj", "dbgroupmember") == "admin"

    unshare_project_from_group("GroupShareDBProj", "admin", "DBShareGroup", "admin")
    # After unshare, fallback returns the member's own username
    assert get_project_owner("GroupShareDBProj", "dbgroupmember") == "dbgroupmember"


def test_duplicate_group_share_ignored():
    add_custom_project("DupGroupShareProj", "admin")
    create_group("DupShareGroup", "admin")
    share_project_with_group("DupGroupShareProj", "admin", "DupShareGroup", "admin")
    share_project_with_group("DupGroupShareProj", "admin", "DupShareGroup", "admin")  # ON CONFLICT DO NOTHING


# ── PUT /api/projects/{name}/share/{target}/permissions (HTTP) ────────────────

def test_update_permissions_http(auth_client):
    auth_client.post("/api/projects", json={"name": "HTTPPermsProj"})
    auth_client.post(
        "/api/projects/HTTPPermsProj/share",
        json={"shared_with": "httppermuser", "permissions": ["documents"]},
    )

    r = auth_client.put(
        "/api/projects/HTTPPermsProj/share/httppermuser/permissions",
        json={"permissions": ["documents", "chats", "query"]},
    )
    assert r.status_code == 200

    r2 = auth_client.get("/api/projects/HTTPPermsProj/shares")
    user_entry = next(s for s in r2.json()["shared_with"] if s["username"] == "httppermuser")
    assert "chats" in user_entry["permissions"]
    assert "query" in user_entry["permissions"]


def test_update_permissions_unauthenticated(client):
    r = client.put(
        "/api/projects/SomeProj/share/someuser/permissions",
        json={"permissions": ["documents"]},
    )
    assert r.status_code == 401


# ── POST /api/projects/{name}/share-group (HTTP) ──────────────────────────────

def test_share_with_group_http(auth_client):
    auth_client.post("/api/projects", json={"name": "HTTPGroupShareProj"})
    auth_client.post("/api/groups", json={"name": "HTTPShareGroup"})

    r = auth_client.post(
        "/api/projects/HTTPGroupShareProj/share",
        json={"shared_with": "groupuser_ignored"},  # user share, not group
    )
    # Group share goes via PUT on the share route (share-group backend)
    r2 = auth_client.post(
        "/api/projects/HTTPGroupShareProj/share-group",
        json={"group_name": "HTTPShareGroup", "group_owner": "admin"},
    )
    assert r2.status_code == 200


def test_share_with_group_unauthenticated(client):
    r = client.post(
        "/api/projects/SomeProj/share-group",
        json={"group_name": "G", "group_owner": "owner"},
    )
    assert r.status_code == 401


# ── DELETE /api/projects/{name}/share-group/{owner}/{group} (HTTP) ────────────

def test_unshare_group_http(auth_client):
    auth_client.post("/api/projects", json={"name": "UnshareGroupProj"})
    auth_client.post("/api/groups", json={"name": "UnshareHTTPGroup"})
    auth_client.post(
        "/api/projects/UnshareGroupProj/share-group",
        json={"group_name": "UnshareHTTPGroup", "group_owner": "admin"},
    )

    r = auth_client.delete("/api/projects/UnshareGroupProj/share-group/admin/UnshareHTTPGroup")
    assert r.status_code == 200
    assert r.json()["status"] == "unshared"


def test_unshare_group_unauthenticated(client):
    r = client.delete("/api/projects/SomeProj/share-group/owner/group")
    assert r.status_code == 401


# ── Share with permissions (HTTP) ─────────────────────────────────────────────

def test_share_stores_permissions(auth_client):
    auth_client.post("/api/projects", json={"name": "ShareWithPermsProj"})
    r = auth_client.post(
        "/api/projects/ShareWithPermsProj/share",
        json={"shared_with": "permsrecip", "permissions": ["documents", "query"]},
    )
    assert r.status_code == 200

    r2 = auth_client.get("/api/projects/ShareWithPermsProj/shares")
    entry = next(s for s in r2.json()["shared_with"] if s["username"] == "permsrecip")
    assert "documents" in entry["permissions"]
    assert "query" in entry["permissions"]
    assert "chats" not in entry["permissions"]


def test_share_defaults_to_documents_and_chats(auth_client):
    auth_client.post("/api/projects", json={"name": "ShareDefaultPermsProj"})
    auth_client.post(
        "/api/projects/ShareDefaultPermsProj/share",
        json={"shared_with": "defaultrecip"},
    )

    r = auth_client.get("/api/projects/ShareDefaultPermsProj/shares")
    entry = next(s for s in r.json()["shared_with"] if s["username"] == "defaultrecip")
    assert "documents" in entry["permissions"]
    assert "chats" in entry["permissions"]
