"""
Tests for /api/users/search and the underlying src.auth.search_usernames helper.

The endpoint is used by workspace-share autocomplete: requires authentication,
needs ≥3 chars, returns at most 8 case-insensitive prefix matches, and never
returns the calling user.
"""
import pytest


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _create_users(auth_client, names: list[str], password: str = "TempPass1!"):
    """Idempotent helper — creates each user, ignoring 'already exists'."""
    for n in names:
        auth_client.post("/api/admin/users", json={
            "username": n, "password": password, "role": "User",
        })


def _delete_users(auth_client, names: list[str]):
    for n in names:
        auth_client.delete(f"/api/admin/users/{n}")


# ══════════════════════════════════════════════════════════════════════════════
# Endpoint behaviour
# ══════════════════════════════════════════════════════════════════════════════

class TestSearchEndpointAuth:
    """Auth gate: anonymous callers must be rejected."""

    def test_unauthenticated_rejected(self, client):
        r = client.get("/api/users/search?q=admin")
        assert r.status_code == 401

    def test_authenticated_returns_200(self, auth_client):
        r = auth_client.get("/api/users/search?q=adm")
        assert r.status_code == 200
        assert "usernames" in r.json()


class TestSearchEndpointBehaviour:
    """Functional contract of the search endpoint."""

    @pytest.fixture(autouse=True)
    def _seed(self, auth_client):
        users = ["alice_smith", "alicia_jones", "alex_park", "bob_marley", "charlie_brown"]
        _create_users(auth_client, users)
        yield
        _delete_users(auth_client, users)

    def test_min_three_chars_returns_empty(self, auth_client):
        """Queries shorter than 3 characters return nothing — avoids massive lists."""
        for q in ["", "a", "al"]:
            r = auth_client.get(f"/api/users/search?q={q}")
            assert r.status_code == 200
            assert r.json()["usernames"] == [], f"q={q!r} should be empty"

    def test_three_chars_returns_matches(self, auth_client):
        r = auth_client.get("/api/users/search?q=ali")
        assert r.status_code == 200
        names = r.json()["usernames"]
        assert "alice_smith" in names
        assert "alicia_jones" in names
        # Other prefixes must not leak in
        assert "bob_marley" not in names
        assert "charlie_brown" not in names

    def test_case_insensitive(self, auth_client):
        r1 = auth_client.get("/api/users/search?q=ali").json()["usernames"]
        r2 = auth_client.get("/api/users/search?q=ALI").json()["usernames"]
        r3 = auth_client.get("/api/users/search?q=Ali").json()["usernames"]
        assert sorted(r1) == sorted(r2) == sorted(r3)

    def test_excludes_calling_user(self, auth_client):
        """The caller (admin) must not appear in their own search results."""
        r = auth_client.get("/api/users/search?q=adm")
        names = r.json()["usernames"]
        assert "admin" not in names

    def test_results_alphabetised(self, auth_client):
        names = auth_client.get("/api/users/search?q=ali").json()["usernames"]
        assert names == sorted(names)

    def test_results_capped_at_eight(self, auth_client):
        """Hard limit of 8 results so a popular prefix can't overwhelm the dropdown."""
        bulk = [f"useruser_{i:02d}" for i in range(15)]
        try:
            _create_users(auth_client, bulk)
            r = auth_client.get("/api/users/search?q=useruser_")
            assert r.status_code == 200
            assert len(r.json()["usernames"]) <= 8
        finally:
            _delete_users(auth_client, bulk)

    def test_no_match_returns_empty_list(self, auth_client):
        r = auth_client.get("/api/users/search?q=zzznoexist")
        assert r.status_code == 200
        assert r.json()["usernames"] == []

    def test_prefix_match_only_not_substring(self, auth_client):
        """'lic' should NOT match 'alice_smith' (would only match a substring)."""
        r = auth_client.get("/api/users/search?q=lic")
        names = r.json()["usernames"]
        assert "alice_smith" not in names
        assert "alicia_jones" not in names


# ══════════════════════════════════════════════════════════════════════════════
# Unit tests for the underlying helper
# ══════════════════════════════════════════════════════════════════════════════

class TestSearchUsernamesHelper:
    """Isolated tests for src.auth.search_usernames — pure DB logic."""

    @pytest.fixture(autouse=True)
    def _seed(self, auth_client):
        users = ["unit_alpha", "unit_alphabet", "unit_beta"]
        _create_users(auth_client, users)
        yield
        _delete_users(auth_client, users)

    def test_returns_empty_for_short_prefix(self):
        from src.auth import search_usernames
        assert search_usernames("") == []
        assert search_usernames("a") == []
        assert search_usernames("ab") == []

    def test_returns_matches_for_valid_prefix(self):
        from src.auth import search_usernames
        result = search_usernames("unit_alph")
        assert "unit_alpha" in result
        assert "unit_alphabet" in result
        assert "unit_beta" not in result

    def test_respects_limit(self):
        from src.auth import search_usernames
        result = search_usernames("unit_", limit=2)
        assert len(result) <= 2

    def test_exclude_filter_drops_user(self):
        from src.auth import search_usernames
        result = search_usernames("unit_", exclude="unit_alpha")
        assert "unit_alpha" not in result
        assert "unit_alphabet" in result

    def test_strips_whitespace(self):
        from src.auth import search_usernames
        a = search_usernames("unit_alph")
        b = search_usernames("  unit_alph  ")
        assert sorted(a) == sorted(b)
