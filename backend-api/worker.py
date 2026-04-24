#!/usr/bin/env python3
"""
Background indexing worker.

Polls the indexing_jobs table and processes files one at a time.
Run alongside the API server:

    python worker.py

Environment variables:
    WORKER_POLL_INTERVAL   seconds between polls when queue is empty (default 2)
"""
import os
import signal
import sys
import time

# Ensure src/ is importable when run from project root
sys.path.insert(0, os.path.dirname(__file__))

from src.database import init_db, claim_next_job, mark_job_done, mark_job_failed
from src.engine import index_file

POLL_INTERVAL = int(os.environ.get("WORKER_POLL_INTERVAL", "2"))

_running = True


def _handle_shutdown(sig, frame):
    global _running
    print(f"[worker] Signal {sig} received — finishing current job then exiting…", flush=True)
    _running = False


signal.signal(signal.SIGINT, _handle_shutdown)
signal.signal(signal.SIGTERM, _handle_shutdown)


def run():
    init_db()
    print(f"[worker] Started. Polling every {POLL_INTERVAL}s.", flush=True)
    while _running:
        job = claim_next_job()
        if job is None:
            time.sleep(POLL_INTERVAL)
            continue
        print(f"[worker] Processing job {job['id']}  file={job['file_path']}", flush=True)
        try:
            index_file(job["file_path"], job["username"], job["project"])
            mark_job_done(job["id"])
            print(f"[worker] Done {job['id']}", flush=True)
        except Exception as exc:
            mark_job_failed(job["id"], str(exc))
            print(f"[worker] Failed {job['id']}: {exc}", flush=True)
    print("[worker] Exited cleanly.", flush=True)


if __name__ == "__main__":
    run()
