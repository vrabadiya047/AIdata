"""Tests for file upload, listing, and deletion endpoints."""
import io
import os
import pytest

from src.database import add_custom_project, save_file_project


def _names(files: list) -> list[str]:
    """/api/files now returns dicts with 'name' key, not bare strings."""
    return [f["name"] if isinstance(f, dict) else f for f in files]


# ── GET /api/files ────────────────────────────────────────────────────────────

def test_list_files_unauthenticated(client):
    r = client.get("/api/files", params={"project": "P"})
    assert r.status_code == 401


def test_list_files_empty(auth_client):
    add_custom_project("FilesEmptyProj", "admin")
    r = auth_client.get("/api/files", params={"project": "FilesEmptyProj"})
    assert r.status_code == 200
    assert r.json()["files"] == []


def test_list_files_after_upload(auth_client):
    add_custom_project("FilesListProj", "admin")

    # Upload a file
    auth_client.post(
        "/api/upload",
        files={"file": ("hello.txt", io.BytesIO(b"hello world"), "text/plain")},
        data={"project": "FilesListProj"},
    )

    r = auth_client.get("/api/files", params={"project": "FilesListProj"})
    assert r.status_code == 200
    assert "hello.txt" in _names(r.json()["files"])


# ── POST /api/upload ──────────────────────────────────────────────────────────

def test_upload_unauthenticated(client):
    r = client.post(
        "/api/upload",
        files={"file": ("test.txt", io.BytesIO(b"data"), "text/plain")},
        data={"project": "SomeProj"},
    )
    assert r.status_code == 401


def test_upload_creates_file(auth_client):
    add_custom_project("UploadProj", "admin")
    r = auth_client.post(
        "/api/upload",
        files={"file": ("report.txt", io.BytesIO(b"report content"), "text/plain")},
        data={"project": "UploadProj"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "uploaded"
    assert r.json()["file"] == "report.txt"


def test_upload_file_appears_in_listing(auth_client):
    add_custom_project("UploadListProj", "admin")
    auth_client.post(
        "/api/upload",
        files={"file": ("notes.txt", io.BytesIO(b"notes"), "text/plain")},
        data={"project": "UploadListProj"},
    )
    r = auth_client.get("/api/files", params={"project": "UploadListProj"})
    assert "notes.txt" in _names(r.json()["files"])


def test_upload_sanitises_filename(auth_client):
    """Filenames with path traversal characters should be sanitised."""
    add_custom_project("UploadSanitProj", "admin")
    r = auth_client.post(
        "/api/upload",
        files={"file": ("../../evil.txt", io.BytesIO(b"evil"), "text/plain")},
        data={"project": "UploadSanitProj"},
    )
    assert r.status_code == 200
    # The returned filename must NOT contain path separators
    returned = r.json()["file"]
    assert "/" not in returned
    assert "\\" not in returned
    assert ".." not in returned


# ── DELETE /api/files/{filename} ──────────────────────────────────────────────

def test_delete_file_unauthenticated(client):
    r = client.delete("/api/files/somefile.txt", params={"project": "P"})
    assert r.status_code == 401


def test_delete_file_removes_from_listing(auth_client):
    add_custom_project("DeleteFileProj", "admin")

    # Upload
    auth_client.post(
        "/api/upload",
        files={"file": ("todelete.txt", io.BytesIO(b"bye"), "text/plain")},
        data={"project": "DeleteFileProj"},
    )
    # Confirm present
    r = auth_client.get("/api/files", params={"project": "DeleteFileProj"})
    assert "todelete.txt" in _names(r.json()["files"])

    # Delete
    r = auth_client.delete("/api/files/todelete.txt", params={"project": "DeleteFileProj"})
    assert r.status_code == 200
    assert r.json()["status"] == "deleted"

    # Confirm gone
    r = auth_client.get("/api/files", params={"project": "DeleteFileProj"})
    assert "todelete.txt" not in _names(r.json()["files"])


def test_delete_nonexistent_file_is_graceful(auth_client):
    """Deleting a file that doesn't exist should not 500."""
    add_custom_project("DeleteMissingProj", "admin")
    r = auth_client.delete("/api/files/ghost.pdf", params={"project": "DeleteMissingProj"})
    assert r.status_code == 200
