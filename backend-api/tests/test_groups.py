"""Tests for group management — database layer and HTTP endpoints."""
import pytest

from src.database import (
    create_group, delete_group, add_group_member, remove_group_member, get_user_groups,
)


# ── Database-layer tests ──────────────────────────────────────────────────────

def test_create_group_appears_in_list():
    create_group("EngineeringDB", "admin")
    groups = get_user_groups("admin")
    names = [g["name"] for g in groups]
    assert "EngineeringDB" in names


def test_delete_group_removes_from_list():
    create_group("TempGroupDB", "admin")
    delete_group("TempGroupDB", "admin")
    groups = get_user_groups("admin")
    assert not any(g["name"] == "TempGroupDB" for g in groups)


def test_add_and_remove_group_member():
    create_group("MembersGroupDB", "admin")
    add_group_member("MembersGroupDB", "admin", "alice")

    groups = get_user_groups("admin")
    grp = next(g for g in groups if g["name"] == "MembersGroupDB")
    assert "alice" in grp["members"]

    remove_group_member("MembersGroupDB", "admin", "alice")
    groups = get_user_groups("admin")
    grp = next((g for g in groups if g["name"] == "MembersGroupDB"), None)
    if grp:
        assert "alice" not in grp["members"]


def test_remove_group_member_wrong_group_is_noop():
    create_group("SafeGroupDB", "admin")
    add_group_member("SafeGroupDB", "admin", "bob")
    remove_group_member("NonExistentGroup", "admin", "bob")  # should not raise
    groups = get_user_groups("admin")
    grp = next(g for g in groups if g["name"] == "SafeGroupDB")
    assert "bob" in grp["members"]


def test_delete_group_also_removes_members():
    create_group("CleanupGroupDB", "admin")
    add_group_member("CleanupGroupDB", "admin", "charlie")
    delete_group("CleanupGroupDB", "admin")
    groups = get_user_groups("admin")
    assert not any(g["name"] == "CleanupGroupDB" for g in groups)


def test_get_user_groups_empty_for_new_user():
    groups = get_user_groups("totally_new_user_xyz")
    assert groups == []


def test_duplicate_group_member_is_ignored():
    create_group("DedupGroupDB", "admin")
    add_group_member("DedupGroupDB", "admin", "dave")
    add_group_member("DedupGroupDB", "admin", "dave")  # second add — ON CONFLICT DO NOTHING
    groups = get_user_groups("admin")
    grp = next(g for g in groups if g["name"] == "DedupGroupDB")
    assert grp["members"].count("dave") == 1


# ── HTTP endpoint tests ───────────────────────────────────────────────────────

def test_list_groups_unauthenticated(client):
    r = client.get("/api/groups")
    assert r.status_code == 401


def test_list_groups_authenticated(auth_client):
    r = auth_client.get("/api/groups")
    assert r.status_code == 200
    assert "groups" in r.json()
    assert isinstance(r.json()["groups"], list)


def test_create_group_http(auth_client):
    r = auth_client.post("/api/groups", json={"name": "ResearchTeam"})
    assert r.status_code == 200
    assert r.json()["status"] == "created"

    r2 = auth_client.get("/api/groups")
    names = [g["name"] for g in r2.json()["groups"]]
    assert "ResearchTeam" in names


def test_create_group_unauthenticated(client):
    r = client.post("/api/groups", json={"name": "Hackers"})
    assert r.status_code == 401


def test_delete_group_http(auth_client):
    auth_client.post("/api/groups", json={"name": "ToDeleteGroup"})
    r = auth_client.delete("/api/groups/ToDeleteGroup")
    assert r.status_code == 200

    r2 = auth_client.get("/api/groups")
    names = [g["name"] for g in r2.json()["groups"]]
    assert "ToDeleteGroup" not in names


def test_delete_group_unauthenticated(client):
    r = client.delete("/api/groups/AnyGroup")
    assert r.status_code == 401


def test_add_member_http(auth_client):
    auth_client.post("/api/groups", json={"name": "AddMemberGroup"})
    r = auth_client.post("/api/groups/AddMemberGroup/members", json={"username": "member1"})
    assert r.status_code == 200
    assert r.json()["status"] == "added"

    r2 = auth_client.get("/api/groups")
    grp = next(g for g in r2.json()["groups"] if g["name"] == "AddMemberGroup")
    assert "member1" in grp["members"]


def test_add_member_unauthenticated(client):
    r = client.post("/api/groups/SomeGroup/members", json={"username": "x"})
    assert r.status_code == 401


def test_remove_member_http(auth_client):
    auth_client.post("/api/groups", json={"name": "RemoveMemberGroup"})
    auth_client.post("/api/groups/RemoveMemberGroup/members", json={"username": "exmember"})

    r = auth_client.delete("/api/groups/RemoveMemberGroup/members/exmember")
    assert r.status_code == 200
    assert r.json()["status"] == "removed"

    r2 = auth_client.get("/api/groups")
    grp = next(g for g in r2.json()["groups"] if g["name"] == "RemoveMemberGroup")
    assert "exmember" not in grp["members"]


def test_remove_member_unauthenticated(client):
    r = client.delete("/api/groups/SomeGroup/members/someone")
    assert r.status_code == 401
