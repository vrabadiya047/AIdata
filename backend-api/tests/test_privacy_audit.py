"""
Tests for the Privacy Audit Dashboard.

Covers:
  - PIIShield.redact_and_log() — counting, logging, graceful DB-failure handling
  - DB functions: log_redaction_event, get_redaction_stats
  - HTTP: GET /api/admin/privacy (auth guard + response shape)
"""
import pytest
from unittest.mock import patch, MagicMock


# ══════════════════════════════════════════════════════════════════════════════
# PIIShield.redact_and_log — unit tests (no DB needed)
# ══════════════════════════════════════════════════════════════════════════════

class TestRedactAndLog:
    def setup_method(self):
        from src.privacy import PIIShield
        self.shield = PIIShield()

    def test_returns_redacted_text(self):
        out = self.shield.redact_and_log("email: user@example.com", username="u", project="p")
        assert "[EMAIL]" in out
        assert "user@example.com" not in out

    def test_calls_log_for_each_pii_type_found(self):
        with patch("src.database.log_redaction_event") as mock_log:
            self.shield.redact_and_log(
                "email: a@b.com  phone: 555-123-4567",
                username="alice", project="proj", context="query",
            )
            calls = {c.args[1] for c in mock_log.call_args_list}  # pii_type arg
            assert "EMAIL" in calls
            assert "PHONE" in calls

    def test_count_reflects_number_of_matches(self):
        with patch("src.database.log_redaction_event") as mock_log:
            self.shield.redact_and_log(
                "a@b.com and c@d.com",
                username="u", project="p", context="query",
            )
            email_calls = [c for c in mock_log.call_args_list if c.args[1] == "EMAIL"]
            assert len(email_calls) == 1
            assert email_calls[0].args[2] == 2  # count = 2

    def test_no_log_when_no_pii(self):
        with patch("src.database.log_redaction_event") as mock_log:
            out = self.shield.redact_and_log("no PII here at all", username="u", project="p")
            mock_log.assert_not_called()
            assert out == "no PII here at all"

    def test_empty_string_returns_empty(self):
        out = self.shield.redact_and_log("", username="u", project="p")
        assert out == ""

    def test_db_failure_does_not_block_redaction(self):
        """A broken DB must never prevent PII from being redacted."""
        with patch("src.database.log_redaction_event", side_effect=Exception("DB down")):
            out = self.shield.redact_and_log("user@example.com", username="u", project="p")
        assert "[EMAIL]" in out

    def test_username_and_project_passed_to_log(self):
        with patch("src.database.log_redaction_event") as mock_log:
            self.shield.redact_and_log("x@y.com", username="bob", project="myproj", context="document")
            call = mock_log.call_args_list[0]
            assert call.args[0] == "bob"       # username
            assert call.args[3] == "document"  # context
            assert call.args[4] == "myproj"    # project

    def test_ssn_detected_and_logged(self):
        with patch("src.database.log_redaction_event") as mock_log:
            out = self.shield.redact_and_log("SSN: 123-45-6789", username="u", project="p")
            types = {c.args[1] for c in mock_log.call_args_list}
            assert "SSN" in types
        assert "[SSN]" in out

    def test_credit_card_detected_and_logged(self):
        with patch("src.database.log_redaction_event") as mock_log:
            out = self.shield.redact_and_log("card: 4111 1111 1111 1111", username="u", project="p")
            types = {c.args[1] for c in mock_log.call_args_list}
            assert "CREDIT_CARD" in types
        assert "4111" not in out


# ══════════════════════════════════════════════════════════════════════════════
# DB layer — log_redaction_event + get_redaction_stats
# ══════════════════════════════════════════════════════════════════════════════

class TestRedactionDB:
    def _clean(self):
        from src.database import _conn
        with _conn() as conn:
            conn.cursor().execute("DELETE FROM redaction_events")

    def test_log_and_retrieve_event(self, _bootstrap_db):
        self._clean()
        from src.database import log_redaction_event, get_redaction_stats
        log_redaction_event("alice", "EMAIL", 3, "query", "proj1")
        stats = get_redaction_stats()
        assert stats["summary"]["total_redactions"] == 3
        assert any(t["pii_type"] == "EMAIL" for t in stats["by_type"])

    def test_summary_totals_aggregate_correctly(self, _bootstrap_db):
        self._clean()
        from src.database import log_redaction_event, get_redaction_stats
        log_redaction_event("alice", "EMAIL",  2, "query",    "p")
        log_redaction_event("alice", "PHONE",  1, "query",    "p")
        log_redaction_event("bob",   "SSN",    5, "document", "p")
        stats = get_redaction_stats()
        assert stats["summary"]["total_redactions"] == 8
        assert stats["summary"]["unique_pii_types"] == 3
        assert stats["summary"]["query_hits"] == 2   # 2 query-context rows
        assert stats["summary"]["document_hits"] == 1

    def test_by_type_sorted_descending(self, _bootstrap_db):
        self._clean()
        from src.database import log_redaction_event, get_redaction_stats
        log_redaction_event("u", "PHONE", 1,  "query", "p")
        log_redaction_event("u", "EMAIL", 10, "query", "p")
        stats = get_redaction_stats()
        counts = [t["count"] for t in stats["by_type"]]
        assert counts == sorted(counts, reverse=True)

    def test_by_user_populated(self, _bootstrap_db):
        self._clean()
        from src.database import log_redaction_event, get_redaction_stats
        log_redaction_event("userA", "EMAIL", 4, "query", "p")
        log_redaction_event("userB", "PHONE", 2, "query", "p")
        stats = get_redaction_stats()
        users = [u["username"] for u in stats["by_user"]]
        assert "userA" in users
        assert "userB" in users

    def test_recent_events_returned(self, _bootstrap_db):
        self._clean()
        from src.database import log_redaction_event, get_redaction_stats
        log_redaction_event("u", "EMAIL", 1, "query", "proj_recent")
        stats = get_redaction_stats()
        assert any(e["project"] == "proj_recent" for e in stats["recent"])

    def test_empty_db_returns_zeros(self, _bootstrap_db):
        self._clean()
        from src.database import get_redaction_stats
        stats = get_redaction_stats()
        assert stats["summary"]["total_redactions"] == 0
        assert stats["summary"]["unique_pii_types"] == 0
        assert stats["by_type"] == []
        assert stats["by_user"] == []
        assert stats["recent"] == []

    def test_by_day_contains_today(self, _bootstrap_db):
        self._clean()
        from src.database import log_redaction_event, get_redaction_stats
        from datetime import date
        log_redaction_event("u", "IP_ADDRESS", 2, "query", "p")
        stats = get_redaction_stats()
        today = str(date.today())
        assert any(d["date"] == today for d in stats["by_day"])

    def test_affected_users_counts_distinct_query_users(self, _bootstrap_db):
        self._clean()
        from src.database import log_redaction_event, get_redaction_stats
        # Same user twice + second user — should be 2 distinct
        log_redaction_event("u1", "EMAIL", 1, "query", "p")
        log_redaction_event("u1", "PHONE", 1, "query", "p")
        log_redaction_event("u2", "SSN",   1, "query", "p")
        stats = get_redaction_stats()
        assert stats["summary"]["affected_users"] == 2


# ══════════════════════════════════════════════════════════════════════════════
# HTTP layer — GET /api/admin/privacy
# ══════════════════════════════════════════════════════════════════════════════

class TestPrivacyEndpoint:
    def test_unauthenticated_returns_401(self, client):
        r = client.get("/api/admin/privacy")
        assert r.status_code == 401

    def test_non_admin_returns_403(self, _bootstrap_db):
        from main import app
        from fastapi.testclient import TestClient
        from src.auth import add_user
        add_user("privuser", "Pass1234!", "User")
        with TestClient(app, raise_server_exceptions=False) as c:
            c.post("/api/auth/login", json={"username": "privuser", "password": "Pass1234!"})
            r = c.get("/api/admin/privacy")
            assert r.status_code == 403

    def test_admin_returns_200_with_correct_shape(self, auth_client):
        r = auth_client.get("/api/admin/privacy")
        assert r.status_code == 200
        data = r.json()
        assert "summary" in data
        assert "by_type" in data
        assert "by_user" in data
        assert "by_day" in data
        assert "recent" in data

    def test_summary_keys_present(self, auth_client):
        r = auth_client.get("/api/admin/privacy")
        summary = r.json()["summary"]
        for key in ("total_redactions", "unique_pii_types", "affected_users", "query_hits", "document_hits"):
            assert key in summary

    def test_stats_reflect_logged_event(self, auth_client, _bootstrap_db):
        from src.database import log_redaction_event, _conn
        with _conn() as conn:
            conn.cursor().execute("DELETE FROM redaction_events")
        log_redaction_event("admin", "PASSPORT", 7, "query", "test_proj")
        r = auth_client.get("/api/admin/privacy")
        data = r.json()
        assert data["summary"]["total_redactions"] >= 7
        types = [t["pii_type"] for t in data["by_type"]]
        assert "PASSPORT" in types
