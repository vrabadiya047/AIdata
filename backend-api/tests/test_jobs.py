"""Tests for background indexing job queue — DB functions and HTTP endpoints."""
import uuid
import pytest
from unittest.mock import patch, MagicMock


# ── Helpers ───────────────────────────────────────────────────────────────────

def _jid():
    return str(uuid.uuid4())


# ══════════════════════════════════════════════════════════════════════════════
# DB layer
# ══════════════════════════════════════════════════════════════════════════════

class TestEnqueueAndGet:
    def test_enqueue_creates_pending_job(self, _bootstrap_db):
        from src.database import enqueue_job, get_job
        jid = _jid()
        enqueue_job(jid, "/tmp/file.pdf", "admin", "proj1")
        job = get_job(jid)
        assert job is not None
        assert job["id"] == jid
        assert job["status"] == "pending"
        assert job["file_path"] == "/tmp/file.pdf"
        assert job["username"] == "admin"
        assert job["project"] == "proj1"
        assert job["error"] == ""

    def test_get_job_not_found(self, _bootstrap_db):
        from src.database import get_job
        assert get_job(_jid()) is None


class TestClaimNextJob:
    def test_claim_returns_oldest_pending(self, _bootstrap_db):
        from src.database import enqueue_job, claim_next_job, get_job, _conn
        with _conn() as conn:
            conn.cursor().execute("DELETE FROM indexing_jobs WHERE status = 'pending'")
        j1, j2 = _jid(), _jid()
        enqueue_job(j1, "/a.pdf", "admin", "proj_claim")
        enqueue_job(j2, "/b.pdf", "admin", "proj_claim")
        claimed = claim_next_job()
        assert claimed is not None
        assert claimed["id"] == j1
        job = get_job(j1)
        assert job["status"] == "running"

    def test_claim_returns_none_when_empty(self, _bootstrap_db):
        from src.database import claim_next_job, _conn
        # ensure no pending rows exist
        with _conn() as conn:
            conn.cursor().execute("DELETE FROM indexing_jobs WHERE status='pending'")
        result = claim_next_job()
        assert result is None

    def test_claimed_job_not_claimed_twice(self, _bootstrap_db):
        from src.database import enqueue_job, claim_next_job, _conn
        with _conn() as conn:
            conn.cursor().execute("DELETE FROM indexing_jobs")
        jid = _jid()
        enqueue_job(jid, "/x.pdf", "admin", "proj_once")
        first = claim_next_job()
        second = claim_next_job()
        assert first is not None
        assert second is None  # already claimed


class TestMarkDoneAndFailed:
    def test_mark_done(self, _bootstrap_db):
        from src.database import enqueue_job, claim_next_job, mark_job_done, get_job
        jid = _jid()
        enqueue_job(jid, "/done.pdf", "admin", "proj_done")
        claim_next_job()
        mark_job_done(jid)
        assert get_job(jid)["status"] == "done"

    def test_mark_failed(self, _bootstrap_db):
        from src.database import enqueue_job, claim_next_job, mark_job_failed, get_job
        jid = _jid()
        enqueue_job(jid, "/fail.pdf", "admin", "proj_fail")
        claim_next_job()
        mark_job_failed(jid, "out of memory")
        job = get_job(jid)
        assert job["status"] == "failed"
        assert job["error"] == "out of memory"


class TestGetProjectJobs:
    def test_returns_jobs_for_project(self, _bootstrap_db):
        from src.database import enqueue_job, get_project_jobs, _conn
        with _conn() as conn:
            conn.cursor().execute("DELETE FROM indexing_jobs")
        j1, j2 = _jid(), _jid()
        enqueue_job(j1, "/a.pdf", "admin", "myproj")
        enqueue_job(j2, "/b.pdf", "admin", "myproj")
        jobs = get_project_jobs("myproj", "admin")
        ids = [j["id"] for j in jobs]
        assert j1 in ids
        assert j2 in ids

    def test_does_not_return_other_project_jobs(self, _bootstrap_db):
        from src.database import enqueue_job, get_project_jobs, _conn
        with _conn() as conn:
            conn.cursor().execute("DELETE FROM indexing_jobs")
        enqueue_job(_jid(), "/c.pdf", "admin", "proj_a")
        enqueue_job(_jid(), "/d.pdf", "admin", "proj_b")
        jobs = get_project_jobs("proj_a", "admin")
        for j in jobs:
            assert j["project"] == "proj_a"

    def test_empty_for_unknown_project(self, _bootstrap_db):
        from src.database import get_project_jobs
        assert get_project_jobs("no_such_project", "admin") == []

    def test_ordered_newest_first(self, _bootstrap_db):
        from src.database import enqueue_job, get_project_jobs, _conn
        with _conn() as conn:
            conn.cursor().execute("DELETE FROM indexing_jobs")
        j1, j2, j3 = _jid(), _jid(), _jid()
        enqueue_job(j1, "/1.pdf", "admin", "ordered_proj")
        enqueue_job(j2, "/2.pdf", "admin", "ordered_proj")
        enqueue_job(j3, "/3.pdf", "admin", "ordered_proj")
        jobs = get_project_jobs("ordered_proj", "admin")
        assert jobs[0]["id"] == j3
        assert jobs[-1]["id"] == j1


# ══════════════════════════════════════════════════════════════════════════════
# HTTP layer
# ══════════════════════════════════════════════════════════════════════════════

class TestGetJobEndpoint:
    def test_unauthenticated_returns_401(self, client):
        r = client.get(f"/api/jobs/{_jid()}")
        assert r.status_code == 401

    def test_not_found_returns_404(self, auth_client):
        r = auth_client.get(f"/api/jobs/{_jid()}")
        assert r.status_code == 404

    def test_returns_job_after_upload(self, auth_client):
        import io
        from src.database import _conn
        # Create a project so upload is valid
        auth_client.post("/api/projects", json={"name": "job_test_proj"})

        with patch("main.enqueue_job") as mock_enq:
            mock_jid = _jid()
            mock_enq.return_value = None
            # Manually enqueue so we can test get
            from src.database import enqueue_job
            enqueue_job(mock_jid, "/fake.txt", "admin", "job_test_proj")

            r = auth_client.get(f"/api/jobs/{mock_jid}")
            assert r.status_code == 200
            data = r.json()
            assert data["id"] == mock_jid
            assert data["status"] in ("pending", "running", "done", "failed")


class TestListJobsEndpoint:
    def test_unauthenticated_returns_401(self, client):
        r = client.get("/api/jobs?project=x")
        assert r.status_code == 401

    def test_authenticated_returns_jobs_list(self, auth_client):
        from src.database import enqueue_job, _conn
        with _conn() as conn:
            conn.cursor().execute("DELETE FROM indexing_jobs WHERE project = 'list_test_proj'")
        enqueue_job(_jid(), "/a.pdf", "admin", "list_test_proj")
        enqueue_job(_jid(), "/b.pdf", "admin", "list_test_proj")
        r = auth_client.get("/api/jobs?project=list_test_proj")
        assert r.status_code == 200
        assert "jobs" in r.json()
        assert len(r.json()["jobs"]) >= 2

    def test_empty_project_returns_empty_list(self, auth_client):
        r = auth_client.get("/api/jobs?project=nonexistent_proj_xyz")
        assert r.status_code == 200
        assert r.json()["jobs"] == []


class TestUploadEnqueuesJob:
    def test_upload_returns_job_id(self, auth_client):
        import io
        auth_client.post("/api/projects", json={"name": "upload_job_proj"})
        with patch("main.index_file"), patch("main.enqueue_job") as mock_enq:
            captured_id = []
            def _fake_enqueue(jid, *args, **kwargs):
                captured_id.append(jid)
            mock_enq.side_effect = _fake_enqueue

            data = {"project": "upload_job_proj"}
            files = {"file": ("test.txt", io.BytesIO(b"hello"), "text/plain")}
            r = auth_client.post("/api/upload", data=data, files=files)
            assert r.status_code == 200
            body = r.json()
            assert "job_id" in body
            assert body["job_id"] is not None
            # enqueue_job was called, not index_file directly
            mock_enq.assert_called_once()


# ══════════════════════════════════════════════════════════════════════════════
# Worker logic (unit tests with mocks — no real DB or ML needed)
# ══════════════════════════════════════════════════════════════════════════════

class TestWorkerLogic:
    def test_processes_job_and_marks_done(self):
        """Worker calls index_file then mark_job_done on success."""
        job = {"id": "j1", "file_path": "/f.pdf", "username": "u", "project": "p"}
        with (
            patch("worker.claim_next_job", side_effect=[job, None]),
            patch("worker.mark_job_done") as mock_done,
            patch("worker.mark_job_failed") as mock_fail,
            patch("worker.index_file") as mock_idx,
            patch("worker._running", new=True),
            patch("worker.time.sleep"),
        ):
            import worker as wmod
            # Simulate one loop iteration
            j = wmod.claim_next_job()
            wmod.index_file(j["file_path"], j["username"], j["project"])
            wmod.mark_job_done(j["id"])
            mock_idx.assert_called_once_with("/f.pdf", "u", "p")
            mock_done.assert_called_once_with("j1")
            mock_fail.assert_not_called()

    def test_marks_job_failed_on_exception(self):
        """Worker calls mark_job_failed when index_file raises."""
        job = {"id": "j2", "file_path": "/bad.pdf", "username": "u", "project": "p"}
        with (
            patch("worker.index_file", side_effect=RuntimeError("OOM")),
            patch("worker.mark_job_done") as mock_done,
            patch("worker.mark_job_failed") as mock_fail,
        ):
            import worker as wmod
            try:
                wmod.index_file(job["file_path"], job["username"], job["project"])
                wmod.mark_job_done(job["id"])
            except RuntimeError as exc:
                wmod.mark_job_failed(job["id"], str(exc))
            mock_fail.assert_called_once_with("j2", "OOM")
            mock_done.assert_not_called()

    def test_sleeps_when_queue_empty(self):
        """Worker sleeps when there is nothing to claim."""
        with (
            patch("worker.claim_next_job", return_value=None),
            patch("worker.time.sleep") as mock_sleep,
        ):
            import worker as wmod
            result = wmod.claim_next_job()
            assert result is None
            wmod.time.sleep(wmod.POLL_INTERVAL)
            mock_sleep.assert_called_once_with(wmod.POLL_INTERVAL)
