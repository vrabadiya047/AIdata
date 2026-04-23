"""Tests for authentication endpoints and user management."""
import pytest


# ── Health ────────────────────────────────────────────────────────────────────

def test_health(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "Sovereign" in r.json()["status"]


# ── Login / logout ────────────────────────────────────────────────────────────

def test_login_success(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "Admin2026!"})
    assert r.status_code == 200
    data = r.json()
    assert data["username"] == "admin"
    assert data["role"] == "Admin"
    assert "sovereign_session" in r.cookies


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "wrongpass"})
    assert r.status_code == 401


def test_login_unknown_user(client):
    r = client.post("/api/auth/login", json={"username": "nobody", "password": "pass"})
    assert r.status_code == 401


def test_logout(client):
    r = client.post("/api/auth/logout")
    assert r.status_code == 200


# ── /api/auth/me ──────────────────────────────────────────────────────────────

def test_me_unauthenticated(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_me_authenticated(auth_client):
    r = auth_client.get("/api/auth/me")
    assert r.status_code == 200
    data = r.json()
    assert data["username"] == "admin"
    assert data["role"] == "Admin"


# ── Admin user management ─────────────────────────────────────────────────────

def test_admin_list_users(auth_client):
    r = auth_client.get("/api/admin/users")
    assert r.status_code == 200
    users = r.json()["users"]
    usernames = [u["username"] for u in users]
    assert "admin" in usernames


def test_admin_create_and_delete_user(auth_client):
    r = auth_client.post("/api/admin/users", json={
        "username": "tmpuser_auth", "password": "Temp1234!", "role": "User"
    })
    assert r.status_code == 200

    r = auth_client.delete("/api/admin/users/tmpuser_auth")
    assert r.status_code == 200


def test_admin_duplicate_user(auth_client):
    r = auth_client.post("/api/admin/users", json={
        "username": "admin", "password": "Admin2026!", "role": "Admin"
    })
    assert r.status_code == 400


def test_admin_cannot_delete_last_admin(auth_client):
    r = auth_client.delete("/api/admin/users/admin")
    assert r.status_code == 400


def test_non_admin_cannot_list_users(client):
    r = client.get("/api/admin/users")
    assert r.status_code == 401


# ── Change password ───────────────────────────────────────────────────────────

def test_change_password_unauthenticated(client):
    r = client.post("/api/auth/change-password", json={"new_password": "ShouldFail1!"})
    assert r.status_code == 401
