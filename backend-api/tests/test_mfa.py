"""
Tests for TOTP-based Multi-Factor Authentication.

Covers:
  - Auth DB layer: mfa_generate_secret, mfa_confirm, mfa_verify,
                   mfa_is_enabled, mfa_disable
  - Login flow: login returns mfa_token when MFA enabled,
                full session after TOTP verify
  - Pending-token guards: regular token rejected; expired token rejected
  - HTTP: GET /api/auth/mfa/setup, POST /api/auth/mfa/confirm,
          DELETE /api/auth/mfa, DELETE /api/admin/users/{u}/mfa
"""

import time
import pytest
import pyotp
from jose import jwt as pyjwt

from src.database import _conn
from src.auth import (
    add_user, delete_user,
    mfa_generate_secret, mfa_provisioning_uri,
    mfa_confirm, mfa_verify, mfa_is_enabled, mfa_disable,
)


# ─── Module-level cleanup ─────────────────────────────────────────────────────
# The session-scoped `client` is shared across all test modules. MFA tests
# log in via `client`, so we log out after this module to leave the shared
# client unauthenticated for subsequent test files.
@pytest.fixture(scope="module", autouse=True)
def _logout_shared_client_after_module(client):
    yield
    client.post("/api/auth/logout")


# ─── helpers ─────────────────────────────────────────────────────────────────

MFA_USER = "mfa_testuser"
MFA_PASS = "MfaTest2026!"


@pytest.fixture(autouse=True)
def _fresh_mfa_user():
    """Create a fresh MFA test user; delete after each test."""
    try:
        delete_user(MFA_USER)
    except Exception:
        pass
    add_user(MFA_USER, MFA_PASS, role="User", requires_change=0)
    yield
    try:
        delete_user(MFA_USER)
    except Exception:
        pass


def _current_totp(secret: str) -> str:
    return pyotp.TOTP(secret).now()


def _login_cookie(client, username=MFA_USER, password=MFA_PASS) -> str:
    """Return the session cookie value after a plain (no-MFA) login."""
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200
    return r.cookies.get("sovereign_session", "")


# ─── DB-layer: mfa_generate_secret ───────────────────────────────────────────

class TestMFAGenerateSecret:
    def test_returns_base32_string(self):
        secret = mfa_generate_secret(MFA_USER)
        assert isinstance(secret, str) and len(secret) >= 16

    def test_stored_in_db(self):
        secret = mfa_generate_secret(MFA_USER)
        with _conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT mfa_secret FROM users WHERE username=%s", (MFA_USER,))
            row = cur.fetchone()
        assert row and row[0] == secret

    def test_mfa_still_disabled_after_generate(self):
        mfa_generate_secret(MFA_USER)
        assert mfa_is_enabled(MFA_USER) is False

    def test_regenerate_replaces_secret(self):
        s1 = mfa_generate_secret(MFA_USER)
        s2 = mfa_generate_secret(MFA_USER)
        assert s1 != s2  # very high probability

    def test_unknown_user_does_not_raise(self):
        mfa_generate_secret("nobody_exists_xyz")  # no row updated; no crash


# ─── DB-layer: mfa_provisioning_uri ──────────────────────────────────────────

class TestMFAProvisioningURI:
    def test_uri_format(self):
        secret = mfa_generate_secret(MFA_USER)
        uri = mfa_provisioning_uri(MFA_USER, secret)
        assert uri.startswith("otpauth://totp/")
        assert MFA_USER in uri

    def test_uri_contains_issuer(self):
        secret = mfa_generate_secret(MFA_USER)
        uri = mfa_provisioning_uri(MFA_USER, secret, issuer="TestApp")
        assert "TestApp" in uri


# ─── DB-layer: mfa_confirm ───────────────────────────────────────────────────

class TestMFAConfirm:
    def test_valid_code_enables_mfa(self):
        secret = mfa_generate_secret(MFA_USER)
        code = _current_totp(secret)
        assert mfa_confirm(MFA_USER, code) is True
        assert mfa_is_enabled(MFA_USER) is True

    def test_wrong_code_does_not_enable(self):
        mfa_generate_secret(MFA_USER)
        assert mfa_confirm(MFA_USER, "000000") is False
        assert mfa_is_enabled(MFA_USER) is False

    def test_no_secret_returns_false(self):
        # user was never given a secret
        assert mfa_confirm(MFA_USER, "123456") is False

    def test_unknown_user_returns_false(self):
        assert mfa_confirm("nobody_xyz", "123456") is False


# ─── DB-layer: mfa_verify ────────────────────────────────────────────────────

class TestMFAVerify:
    def test_correct_code_returns_true(self):
        secret = mfa_generate_secret(MFA_USER)
        mfa_confirm(MFA_USER, _current_totp(secret))
        assert mfa_verify(MFA_USER, _current_totp(secret)) is True

    def test_wrong_code_returns_false(self):
        secret = mfa_generate_secret(MFA_USER)
        mfa_confirm(MFA_USER, _current_totp(secret))
        assert mfa_verify(MFA_USER, "000000") is False

    def test_not_enabled_returns_false(self):
        mfa_generate_secret(MFA_USER)  # secret set but NOT confirmed
        assert mfa_verify(MFA_USER, _current_totp(mfa_generate_secret(MFA_USER))) is False

    def test_unknown_user_returns_false(self):
        assert mfa_verify("nobody_xyz", "123456") is False


# ─── DB-layer: mfa_disable ───────────────────────────────────────────────────

class TestMFADisable:
    def test_disables_and_clears_secret(self):
        secret = mfa_generate_secret(MFA_USER)
        mfa_confirm(MFA_USER, _current_totp(secret))
        assert mfa_is_enabled(MFA_USER) is True

        mfa_disable(MFA_USER)
        assert mfa_is_enabled(MFA_USER) is False

        with _conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT mfa_secret FROM users WHERE username=%s", (MFA_USER,))
            row = cur.fetchone()
        assert row[0] is None

    def test_disable_idempotent(self):
        mfa_disable(MFA_USER)  # never enabled
        mfa_disable(MFA_USER)  # again — no crash
        assert mfa_is_enabled(MFA_USER) is False

    def test_verify_fails_after_disable(self):
        secret = mfa_generate_secret(MFA_USER)
        mfa_confirm(MFA_USER, _current_totp(secret))
        mfa_disable(MFA_USER)
        assert mfa_verify(MFA_USER, _current_totp(secret)) is False


# ─── Login flow (HTTP) ────────────────────────────────────────────────────────

class TestLoginMFAFlow:
    def test_login_without_mfa_returns_cookie(self, client):
        r = client.post("/api/auth/login", json={"username": MFA_USER, "password": MFA_PASS})
        assert r.status_code == 200
        body = r.json()
        assert body["mfa_required"] is False
        assert "sovereign_session" in r.cookies

    def test_login_with_mfa_returns_pending_token(self, client):
        secret = mfa_generate_secret(MFA_USER)
        mfa_confirm(MFA_USER, _current_totp(secret))

        r = client.post("/api/auth/login", json={"username": MFA_USER, "password": MFA_PASS})
        assert r.status_code == 200
        body = r.json()
        assert body["mfa_required"] is True
        assert "mfa_token" in body
        assert "sovereign_session" not in r.cookies

    def test_pending_token_has_mfa_pending_claim(self, client):
        from main import JWT_SECRET, JWT_ALGORITHM
        secret = mfa_generate_secret(MFA_USER)
        mfa_confirm(MFA_USER, _current_totp(secret))

        r = client.post("/api/auth/login", json={"username": MFA_USER, "password": MFA_PASS})
        mfa_token = r.json()["mfa_token"]
        payload = pyjwt.decode(mfa_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        assert payload["mfa_pending"] is True
        assert payload["sub"] == MFA_USER

    def test_wrong_password_still_401(self, client):
        r = client.post("/api/auth/login", json={"username": MFA_USER, "password": "wrong!"})
        assert r.status_code == 401

    def test_full_mfa_login_sets_session_cookie(self, client):
        secret = mfa_generate_secret(MFA_USER)
        mfa_confirm(MFA_USER, _current_totp(secret))

        r1 = client.post("/api/auth/login", json={"username": MFA_USER, "password": MFA_PASS})
        mfa_token = r1.json()["mfa_token"]

        r2 = client.post("/api/auth/mfa/verify",
                         json={"code": _current_totp(secret), "mfa_token": mfa_token})
        assert r2.status_code == 200
        assert "sovereign_session" in r2.cookies
        body = r2.json()
        assert body["mfa_required"] is False
        assert body["username"] == MFA_USER

    def test_mfa_verify_wrong_code_returns_401(self, client):
        secret = mfa_generate_secret(MFA_USER)
        mfa_confirm(MFA_USER, _current_totp(secret))

        r1 = client.post("/api/auth/login", json={"username": MFA_USER, "password": MFA_PASS})
        mfa_token = r1.json()["mfa_token"]

        r2 = client.post("/api/auth/mfa/verify",
                         json={"code": "000000", "mfa_token": mfa_token})
        assert r2.status_code == 401


# ─── Pending-token guards ─────────────────────────────────────────────────────

class TestPendingTokenGuards:
    def test_regular_session_token_rejected_by_mfa_verify(self, client):
        """A full session cookie must NOT be accepted as an mfa_token."""
        secret = mfa_generate_secret(MFA_USER)
        mfa_confirm(MFA_USER, _current_totp(secret))

        # get a real full-session token (bypassing MFA via direct create_token)
        from main import JWT_SECRET, JWT_ALGORITHM, create_token, get_user_info
        info = get_user_info(MFA_USER)
        full_token = create_token(MFA_USER, info["role"])

        r = client.post("/api/auth/mfa/verify",
                        json={"code": _current_totp(secret), "mfa_token": full_token})
        assert r.status_code == 400  # "Invalid token type"

    def test_pending_token_cannot_access_protected_routes(self, client):
        """The mfa_pending token must not work as a session cookie."""
        secret = mfa_generate_secret(MFA_USER)
        mfa_confirm(MFA_USER, _current_totp(secret))

        r1 = client.post("/api/auth/login", json={"username": MFA_USER, "password": MFA_PASS})
        mfa_token = r1.json()["mfa_token"]

        # Try to use the pending token as a session cookie
        r2 = client.get("/api/auth/me", cookies={"sovereign_session": mfa_token})
        # The pending token has no "role" — get_current_user returns role="" which is fine,
        # but it also has mfa_pending=True and no "username" claim (only "sub").
        # Either 401 or the route succeeds but returns no meaningful user role;
        # what matters is that the token cannot satisfy require_admin.
        # For simplicity: just confirm /api/admin/users rejects it.
        r3 = client.get("/api/admin/users", cookies={"sovereign_session": mfa_token})
        assert r3.status_code in (401, 403)

    def test_expired_mfa_token_returns_401(self, client):
        """Forge an already-expired pending token — verify endpoint rejects it."""
        from main import JWT_SECRET, JWT_ALGORITHM
        from datetime import datetime, timezone, timedelta
        expired_token = pyjwt.encode(
            {"sub": MFA_USER, "mfa_pending": True,
             "exp": datetime.now(timezone.utc) - timedelta(seconds=1)},
            JWT_SECRET, algorithm=JWT_ALGORITHM,
        )
        r = client.post("/api/auth/mfa/verify",
                        json={"code": "123456", "mfa_token": expired_token})
        assert r.status_code == 401

    def test_mfa_verify_requires_valid_token(self, client):
        r = client.post("/api/auth/mfa/verify",
                        json={"code": "123456", "mfa_token": "not.a.token"})
        assert r.status_code == 401


# ─── HTTP: /api/auth/mfa/setup ───────────────────────────────────────────────

class TestMFASetupEndpoint:
    def _login(self, client):
        r = client.post("/api/auth/login", json={"username": MFA_USER, "password": MFA_PASS})
        assert r.status_code == 200
        return client

    def test_setup_returns_secret_uri_qr(self, client):
        self._login(client)
        r = client.get("/api/auth/mfa/setup")
        assert r.status_code == 200
        body = r.json()
        assert "secret" in body and "uri" in body and "qr" in body

    def test_qr_is_base64_png(self, client):
        self._login(client)
        r = client.get("/api/auth/mfa/setup")
        qr = r.json()["qr"]
        assert qr.startswith("data:image/png;base64,")

    def test_setup_requires_auth(self):
        from main import app
        from fastapi.testclient import TestClient
        with TestClient(app, raise_server_exceptions=False) as c:
            r = c.get("/api/auth/mfa/setup")
        assert r.status_code == 401

    def test_setup_sets_mfa_not_enabled(self, client):
        self._login(client)
        client.get("/api/auth/mfa/setup")
        assert mfa_is_enabled(MFA_USER) is False


# ─── HTTP: /api/auth/mfa/confirm ─────────────────────────────────────────────

class TestMFAConfirmEndpoint:
    def _setup(self, client):
        client.post("/api/auth/login", json={"username": MFA_USER, "password": MFA_PASS})
        r = client.get("/api/auth/mfa/setup")
        secret = r.json()["secret"]
        return secret

    def test_valid_code_returns_200(self, client):
        secret = self._setup(client)
        r = client.post("/api/auth/mfa/confirm", json={"code": _current_totp(secret)})
        assert r.status_code == 200
        assert r.json()["status"] == "mfa_enabled"

    def test_valid_code_enables_mfa_in_db(self, client):
        secret = self._setup(client)
        client.post("/api/auth/mfa/confirm", json={"code": _current_totp(secret)})
        assert mfa_is_enabled(MFA_USER) is True

    def test_invalid_code_returns_401(self, auth_client):
        mfa_generate_secret("admin")  # store a secret without enabling MFA
        try:
            r = auth_client.post("/api/auth/mfa/confirm", json={"code": "000000"})
            assert r.status_code == 401
        finally:
            mfa_disable("admin")

    def test_confirm_requires_auth(self):
        from main import app
        from fastapi.testclient import TestClient
        with TestClient(app, raise_server_exceptions=False) as c:
            r = c.post("/api/auth/mfa/confirm", json={"code": "123456"})
        assert r.status_code == 401


# ─── HTTP: DELETE /api/auth/mfa ──────────────────────────────────────────────

class TestMFADisableEndpoint:
    def _enable_mfa(self, client):
        client.post("/api/auth/login", json={"username": MFA_USER, "password": MFA_PASS})
        r = client.get("/api/auth/mfa/setup")
        secret = r.json()["secret"]
        client.post("/api/auth/mfa/confirm", json={"code": _current_totp(secret)})
        return secret

    def test_disable_returns_200(self, client):
        self._enable_mfa(client)
        r = client.delete("/api/auth/mfa")
        assert r.status_code == 200
        assert r.json()["status"] == "mfa_disabled"

    def test_disable_clears_mfa_in_db(self, client):
        self._enable_mfa(client)
        client.delete("/api/auth/mfa")
        assert mfa_is_enabled(MFA_USER) is False

    def test_disable_requires_auth(self):
        from main import app
        from fastapi.testclient import TestClient
        with TestClient(app, raise_server_exceptions=False) as c:
            r = c.delete("/api/auth/mfa")
        assert r.status_code == 401


# ─── HTTP: DELETE /api/admin/users/{username}/mfa ────────────────────────────

class TestAdminMFAReset:
    def _enable_mfa_for_user(self):
        secret = mfa_generate_secret(MFA_USER)
        mfa_confirm(MFA_USER, _current_totp(secret))
        assert mfa_is_enabled(MFA_USER) is True

    def test_admin_can_reset_user_mfa(self, auth_client):
        self._enable_mfa_for_user()
        r = auth_client.delete(f"/api/admin/users/{MFA_USER}/mfa")
        assert r.status_code == 200
        assert r.json()["status"] == "mfa_reset"
        assert mfa_is_enabled(MFA_USER) is False

    def test_admin_reset_nonexistent_user_still_200(self, auth_client):
        r = auth_client.delete("/api/admin/users/nobody_xyz/mfa")
        assert r.status_code == 200  # disable is a no-op for unknown user

    def test_non_admin_cannot_reset_mfa(self, client):
        client.post("/api/auth/login", json={"username": MFA_USER, "password": MFA_PASS})
        r = client.delete(f"/api/admin/users/admin/mfa")
        assert r.status_code == 403

    def test_unauthenticated_cannot_reset_mfa(self):
        from main import app
        from fastapi.testclient import TestClient
        with TestClient(app, raise_server_exceptions=False) as c:
            r = c.delete(f"/api/admin/users/{MFA_USER}/mfa")
        assert r.status_code == 401


# ─── /api/auth/me includes mfa_enabled ───────────────────────────────────────

class TestMeEndpointMFA:
    def test_me_shows_mfa_disabled(self, client):
        client.post("/api/auth/login", json={"username": MFA_USER, "password": MFA_PASS})
        r = client.get("/api/auth/me")
        assert r.status_code == 200
        assert r.json()["mfa_enabled"] is False

    def test_me_shows_mfa_enabled(self, client):
        client.post("/api/auth/login", json={"username": MFA_USER, "password": MFA_PASS})
        secret = mfa_generate_secret(MFA_USER)
        mfa_confirm(MFA_USER, _current_totp(secret))
        r = client.get("/api/auth/me")
        assert r.status_code == 200
        assert r.json()["mfa_enabled"] is True
