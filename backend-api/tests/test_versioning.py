"""
Tests for document versioning:
  - GET /api/files returns dicts with 'name', 'version', 'upload_date'
  - PUT /api/files/{filename}/version tags a file
  - src.database version CRUD functions
"""
import io
import pytest

from src.database import (
    add_custom_project, save_file_project,
    set_file_version, list_files_with_versions,
)


# ── /api/files response shape ─────────────────────────────────────────────────

class TestFileListShape:
    """Verify the new dict-based response format."""

    def test_files_returns_list_of_dicts(self, auth_client):
        add_custom_project("VerShape", "admin")
        r = auth_client.get("/api/files", params={"project": "VerShape"})
        assert r.status_code == 200
        files = r.json()["files"]
        assert isinstance(files, list)

    def test_file_dict_has_required_keys(self, auth_client):
        add_custom_project("VerKeys", "admin")
        auth_client.post(
            "/api/upload",
            files={"file": ("spec.txt", io.BytesIO(b"spec content"), "text/plain")},
            data={"project": "VerKeys"},
        )
        r = auth_client.get("/api/files", params={"project": "VerKeys"})
        files = r.json()["files"]
        assert len(files) >= 1
        f = next(x for x in files if x["name"] == "spec.txt")
        assert "name" in f
        assert "version" in f
        assert "upload_date" in f

    def test_new_file_has_null_version(self, auth_client):
        add_custom_project("VerNull", "admin")
        auth_client.post(
            "/api/upload",
            files={"file": ("unversioned.txt", io.BytesIO(b"data"), "text/plain")},
            data={"project": "VerNull"},
        )
        r = auth_client.get("/api/files", params={"project": "VerNull"})
        f = next(x for x in r.json()["files"] if x["name"] == "unversioned.txt")
        assert f["version"] is None


# ── PUT /api/files/{filename}/version ────────────────────────────────────────

class TestVersionEndpoint:
    def test_unauthenticated_rejected(self, client):
        r = client.put(
            "/api/files/spec.pdf/version",
            json={"project": "P", "version": "v1"},
        )
        assert r.status_code == 401

    def test_set_version_returns_200(self, auth_client):
        add_custom_project("VerSet", "admin")
        auth_client.post(
            "/api/upload",
            files={"file": ("doc.txt", io.BytesIO(b"doc"), "text/plain")},
            data={"project": "VerSet"},
        )
        r = auth_client.put(
            "/api/files/doc.txt/version",
            json={"project": "VerSet", "version": "v1.0"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "updated"

    def test_version_appears_in_listing(self, auth_client):
        add_custom_project("VerAppear", "admin")
        auth_client.post(
            "/api/upload",
            files={"file": ("report.txt", io.BytesIO(b"rpt"), "text/plain")},
            data={"project": "VerAppear"},
        )
        # Tag it
        auth_client.put(
            "/api/files/report.txt/version",
            json={"project": "VerAppear", "version": "v2.1"},
        )
        # Verify in listing
        r = auth_client.get("/api/files", params={"project": "VerAppear"})
        f = next(x for x in r.json()["files"] if x["name"] == "report.txt")
        assert f["version"] == "v2.1"

    def test_version_can_be_updated(self, auth_client):
        add_custom_project("VerUpdate", "admin")
        auth_client.post(
            "/api/upload",
            files={"file": ("specs.txt", io.BytesIO(b"s"), "text/plain")},
            data={"project": "VerUpdate"},
        )
        auth_client.put(
            "/api/files/specs.txt/version",
            json={"project": "VerUpdate", "version": "v1"},
        )
        auth_client.put(
            "/api/files/specs.txt/version",
            json={"project": "VerUpdate", "version": "v2"},
        )
        r = auth_client.get("/api/files", params={"project": "VerUpdate"})
        f = next(x for x in r.json()["files"] if x["name"] == "specs.txt")
        assert f["version"] == "v2"

    def test_empty_version_clears_tag(self, auth_client):
        add_custom_project("VerClear", "admin")
        auth_client.post(
            "/api/upload",
            files={"file": ("clear.txt", io.BytesIO(b"c"), "text/plain")},
            data={"project": "VerClear"},
        )
        auth_client.put(
            "/api/files/clear.txt/version",
            json={"project": "VerClear", "version": "v1"},
        )
        # Clear it
        auth_client.put(
            "/api/files/clear.txt/version",
            json={"project": "VerClear", "version": ""},
        )
        r = auth_client.get("/api/files", params={"project": "VerClear"})
        f = next(x for x in r.json()["files"] if x["name"] == "clear.txt")
        assert f["version"] is None


# ── src.database version CRUD ─────────────────────────────────────────────────

class TestVersionDatabase:
    def test_set_and_list_versions(self):
        add_custom_project("DbVerProj", "admin")
        save_file_project("schema_v1.pdf", "DbVerProj", "admin")
        save_file_project("schema_v2.pdf", "DbVerProj", "admin")

        set_file_version("schema_v1.pdf", "DbVerProj", "admin", "v1.0")
        set_file_version("schema_v2.pdf", "DbVerProj", "admin", "v2.0")

        rows = list_files_with_versions("DbVerProj", "admin")
        names_versions = {r["file_name"]: r["version"] for r in rows}
        assert names_versions.get("schema_v1.pdf") == "v1.0"
        assert names_versions.get("schema_v2.pdf") == "v2.0"

    def test_rows_contain_upload_date(self):
        add_custom_project("DbVerDate", "admin")
        save_file_project("dated.pdf", "DbVerDate", "admin")
        rows = list_files_with_versions("DbVerDate", "admin")
        row = next(r for r in rows if r["file_name"] == "dated.pdf")
        assert row["upload_date"] is not None

    def test_unversioned_file_has_null_version(self):
        add_custom_project("DbVerNone", "admin")
        save_file_project("no_ver.pdf", "DbVerNone", "admin")
        rows = list_files_with_versions("DbVerNone", "admin")
        row = next(r for r in rows if r["file_name"] == "no_ver.pdf")
        assert row["version"] is None

    def test_empty_string_stored_as_null(self):
        add_custom_project("DbVerEmpty", "admin")
        save_file_project("empty_ver.pdf", "DbVerEmpty", "admin")
        set_file_version("empty_ver.pdf", "DbVerEmpty", "admin", "")
        rows = list_files_with_versions("DbVerEmpty", "admin")
        row = next(r for r in rows if r["file_name"] == "empty_ver.pdf")
        assert row["version"] is None
