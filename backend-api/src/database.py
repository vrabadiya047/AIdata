# src/database.py
"""
Metadata storage — PostgreSQL with a thread-safe connection pool.
All public function signatures are identical to the previous SQLite version.
"""
import os
import time
from contextlib import contextmanager

import psycopg2
from psycopg2 import pool as pg_pool

from .config import DATABASE_URL

_pool: pg_pool.ThreadedConnectionPool | None = None


def _get_pool() -> pg_pool.ThreadedConnectionPool:
    global _pool
    if _pool is None:
        _pool = pg_pool.ThreadedConnectionPool(minconn=2, maxconn=20, dsn=DATABASE_URL)
    return _pool


@contextmanager
def _conn():
    """Yields a pooled connection; commits on success, rolls back on error."""
    pool = _get_pool()
    conn = pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


def init_db():
    with _conn() as conn:
        cur = conn.cursor()

        cur.execute('''CREATE TABLE IF NOT EXISTS file_metadata (
            id SERIAL PRIMARY KEY,
            file_name TEXT, project_tag TEXT, owner TEXT,
            upload_date TIMESTAMP DEFAULT NOW()
        )''')

        cur.execute('''CREATE TABLE IF NOT EXISTS chat_history (
            id SERIAL PRIMARY KEY,
            project_tag TEXT, owner TEXT,
            thread_id TEXT DEFAULT 'General',
            role TEXT, content TEXT,
            timestamp TIMESTAMP DEFAULT NOW()
        )''')

        cur.execute('''CREATE TABLE IF NOT EXISTS custom_projects (
            name TEXT, owner TEXT,
            visibility TEXT DEFAULT 'private',
            PRIMARY KEY (name, owner)
        )''')

        cur.execute('''CREATE TABLE IF NOT EXISTS project_shares (
            project_name TEXT, project_owner TEXT, shared_with TEXT,
            PRIMARY KEY (project_name, project_owner, shared_with)
        )''')

        cur.execute('''CREATE TABLE IF NOT EXISTS groups (
            name TEXT, owner TEXT,
            PRIMARY KEY (name, owner)
        )''')

        cur.execute('''CREATE TABLE IF NOT EXISTS group_members (
            group_name TEXT, group_owner TEXT, username TEXT,
            PRIMARY KEY (group_name, group_owner, username)
        )''')

        cur.execute('''CREATE TABLE IF NOT EXISTS project_group_shares (
            project_name TEXT, project_owner TEXT,
            group_name TEXT, group_owner TEXT,
            PRIMARY KEY (project_name, project_owner, group_name, group_owner)
        )''')

        cur.execute('''CREATE TABLE IF NOT EXISTS system_state (
            key TEXT PRIMARY KEY, value TEXT
        )''')
        cur.execute(
            "INSERT INTO system_state (key, value) VALUES ('last_index_update', '0') "
            "ON CONFLICT DO NOTHING"
        )

        cur.execute('''CREATE TABLE IF NOT EXISTS snapshots (
            id          TEXT PRIMARY KEY,
            project_name  TEXT NOT NULL,
            project_owner TEXT NOT NULL,
            thread_id     TEXT NOT NULL,
            title         TEXT DEFAULT '',
            created_by    TEXT NOT NULL,
            created_at    TIMESTAMP DEFAULT NOW(),
            messages      JSONB NOT NULL DEFAULT '[]',
            files         TEXT[] NOT NULL DEFAULT '{}'
        )''')

        cur.execute('''CREATE TABLE IF NOT EXISTS indexing_jobs (
            id          TEXT PRIMARY KEY,
            file_path   TEXT NOT NULL,
            username    TEXT NOT NULL,
            project     TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'pending',
            error       TEXT NOT NULL DEFAULT '',
            created_at  TIMESTAMP DEFAULT NOW(),
            updated_at  TIMESTAMP DEFAULT NOW()
        )''')

        cur.execute('''CREATE TABLE IF NOT EXISTS redaction_events (
            id         SERIAL PRIMARY KEY,
            username   TEXT NOT NULL DEFAULT '',
            pii_type   TEXT NOT NULL,
            count      INTEGER NOT NULL DEFAULT 1,
            context    TEXT NOT NULL DEFAULT 'query',
            project    TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMP DEFAULT NOW()
        )''')

        # Safe idempotent column migrations
        for sql in [
            "ALTER TABLE chat_history ADD COLUMN IF NOT EXISTS thread_id TEXT DEFAULT 'General'",
            "ALTER TABLE custom_projects ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'private'",
            "ALTER TABLE project_shares ADD COLUMN IF NOT EXISTS permissions TEXT DEFAULT 'documents,chats'",
            "ALTER TABLE project_group_shares ADD COLUMN IF NOT EXISTS permissions TEXT DEFAULT 'documents,chats'",
            "ALTER TABLE project_shares ADD COLUMN IF NOT EXISTS valid_until TIMESTAMP DEFAULT NULL",
            "ALTER TABLE file_metadata ADD COLUMN IF NOT EXISTS version TEXT DEFAULT NULL",
        ]:
            cur.execute(sql)


# ─── Projects ────────────────────────────────────────────────────────────────

def add_custom_project(name, username, visibility='private'):
    with _conn() as conn:
        conn.cursor().execute(
            'INSERT INTO custom_projects (name, owner, visibility) VALUES (%s, %s, %s) '
            'ON CONFLICT DO NOTHING',
            (name, username, visibility),
        )

def set_project_visibility(name, owner, visibility):
    with _conn() as conn:
        conn.cursor().execute(
            'UPDATE custom_projects SET visibility = %s WHERE name = %s AND owner = %s',
            (visibility, name, owner),
        )

def delete_project_data(name, username):
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute('DELETE FROM custom_projects WHERE name = %s AND owner = %s', (name, username))
        cur.execute('DELETE FROM file_metadata WHERE project_tag = %s AND owner = %s', (name, username))
        cur.execute('DELETE FROM chat_history WHERE project_tag = %s AND owner = %s', (name, username))
        cur.execute('DELETE FROM project_shares WHERE project_name = %s AND project_owner = %s', (name, username))
        cur.execute('DELETE FROM project_group_shares WHERE project_name = %s AND project_owner = %s', (name, username))

def get_all_projects(username):
    from .config import DATA_DIR
    with _conn() as conn:
        cur = conn.cursor()

        cur.execute('SELECT name, owner, visibility FROM custom_projects WHERE owner = %s', (username,))
        own = [(r[0], r[1], r[2], 'own') for r in cur.fetchall()]

        cur.execute(
            "SELECT name, owner, visibility FROM custom_projects "
            "WHERE visibility = 'public' AND owner != %s",
            (username,),
        )
        public = [(r[0], r[1], r[2], 'public') for r in cur.fetchall()]

        cur.execute('''
            SELECT cp.name, cp.owner, cp.visibility
            FROM custom_projects cp
            JOIN project_shares ps
              ON cp.name = ps.project_name AND cp.owner = ps.project_owner
            WHERE ps.shared_with = %s AND cp.owner != %s
              AND (ps.valid_until IS NULL OR ps.valid_until > NOW())
        ''', (username, username))
        shared = [(r[0], r[1], r[2], 'shared') for r in cur.fetchall()]

        cur.execute('''
            SELECT cp.name, cp.owner, cp.visibility
            FROM custom_projects cp
            JOIN project_group_shares pgs
              ON cp.name = pgs.project_name AND cp.owner = pgs.project_owner
            JOIN group_members gm
              ON pgs.group_name = gm.group_name AND pgs.group_owner = gm.group_owner
            WHERE gm.username = %s AND cp.owner != %s
        ''', (username, username))
        group_shared = [(r[0], r[1], r[2], 'shared') for r in cur.fetchall()]

    seen: set = set()
    result = []
    for name, owner, visibility, access in own + public + shared + group_shared:
        key = (name, owner)
        if key in seen:
            continue
        seen.add(key)
        if os.path.exists(os.path.join(DATA_DIR, owner, name)):
            result.append({"name": name, "owner": owner, "visibility": visibility, "access": access})

    return sorted(result, key=lambda x: (x["access"] != "own", x["name"]))


def get_project_owner(project_name, username):
    """Return the owner of project_name that username has access to."""
    with _conn() as conn:
        cur = conn.cursor()
        # Own project
        cur.execute("SELECT owner FROM custom_projects WHERE name = %s AND owner = %s", (project_name, username))
        row = cur.fetchone()
        if row:
            return row[0]
        # Public project
        cur.execute("SELECT owner FROM custom_projects WHERE name = %s AND visibility = 'public'", (project_name,))
        row = cur.fetchone()
        if row:
            return row[0]
        # Directly shared with this user (not expired)
        cur.execute("""
            SELECT cp.owner FROM custom_projects cp
            JOIN project_shares ps ON cp.name = ps.project_name AND cp.owner = ps.project_owner
            WHERE cp.name = %s AND ps.shared_with = %s
              AND (ps.valid_until IS NULL OR ps.valid_until > NOW())
        """, (project_name, username))
        row = cur.fetchone()
        if row:
            return row[0]
        # Shared via group
        cur.execute("""
            SELECT cp.owner FROM custom_projects cp
            JOIN project_group_shares pgs ON cp.name = pgs.project_name AND cp.owner = pgs.project_owner
            JOIN group_members gm ON pgs.group_name = gm.group_name AND pgs.group_owner = gm.group_owner
            WHERE cp.name = %s AND gm.username = %s
        """, (project_name, username))
        row = cur.fetchone()
        if row:
            return row[0]
        return username  # fallback — own project not yet in DB


def get_user_permissions(project_name, project_owner, username):
    """Return list of permission strings for username on this project."""
    if project_owner == username:
        return ["documents", "chats", "upload", "query"]
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT permissions FROM project_shares "
            "WHERE project_name = %s AND project_owner = %s AND shared_with = %s"
            "  AND (valid_until IS NULL OR valid_until > NOW())",
            (project_name, project_owner, username),
        )
        row = cur.fetchone()
        if row and row[0]:
            return [p.strip() for p in row[0].split(",") if p.strip()]
        # Check group share
        cur.execute("""
            SELECT pgs.permissions FROM project_group_shares pgs
            JOIN group_members gm ON pgs.group_name = gm.group_name AND pgs.group_owner = gm.group_owner
            WHERE pgs.project_name = %s AND pgs.project_owner = %s AND gm.username = %s
        """, (project_name, project_owner, username))
        row = cur.fetchone()
        if row and row[0]:
            return [p.strip() for p in row[0].split(",") if p.strip()]
    return []


# ─── Sharing ─────────────────────────────────────────────────────────────────

def share_project_with_user(project_name, project_owner, shared_with, permissions="documents,chats", valid_until=None):
    with _conn() as conn:
        conn.cursor().execute(
            'INSERT INTO project_shares (project_name, project_owner, shared_with, permissions, valid_until) '
            'VALUES (%s, %s, %s, %s, %s) ON CONFLICT (project_name, project_owner, shared_with) '
            'DO UPDATE SET permissions = EXCLUDED.permissions, valid_until = EXCLUDED.valid_until',
            (project_name, project_owner, shared_with, permissions, valid_until),
        )

def update_share_permissions(project_name, project_owner, shared_with, permissions):
    with _conn() as conn:
        conn.cursor().execute(
            'UPDATE project_shares SET permissions = %s '
            'WHERE project_name = %s AND project_owner = %s AND shared_with = %s',
            (permissions, project_name, project_owner, shared_with),
        )

def unshare_project_from_user(project_name, project_owner, shared_with):
    with _conn() as conn:
        conn.cursor().execute(
            'DELETE FROM project_shares '
            'WHERE project_name = %s AND project_owner = %s AND shared_with = %s',
            (project_name, project_owner, shared_with),
        )

def get_project_shares(project_name, project_owner):
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(
            'SELECT shared_with, permissions, valid_until FROM project_shares '
            'WHERE project_name = %s AND project_owner = %s',
            (project_name, project_owner),
        )
        return [
            {
                "username": r[0],
                "permissions": [p.strip() for p in (r[1] or "documents,chats").split(",") if p.strip()],
                "valid_until": r[2].isoformat() if r[2] else None,
            }
            for r in cur.fetchall()
        ]

def share_project_with_group(project_name, project_owner, group_name, group_owner):
    with _conn() as conn:
        conn.cursor().execute(
            'INSERT INTO project_group_shares VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING',
            (project_name, project_owner, group_name, group_owner),
        )

def unshare_project_from_group(project_name, project_owner, group_name, group_owner):
    with _conn() as conn:
        conn.cursor().execute(
            'DELETE FROM project_group_shares '
            'WHERE project_name=%s AND project_owner=%s AND group_name=%s AND group_owner=%s',
            (project_name, project_owner, group_name, group_owner),
        )


# ─── Groups ──────────────────────────────────────────────────────────────────

def create_group(name, owner):
    with _conn() as conn:
        conn.cursor().execute(
            'INSERT INTO groups (name, owner) VALUES (%s, %s) ON CONFLICT DO NOTHING',
            (name, owner),
        )

def delete_group(name, owner):
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute('DELETE FROM groups WHERE name = %s AND owner = %s', (name, owner))
        cur.execute('DELETE FROM group_members WHERE group_name = %s AND group_owner = %s', (name, owner))
        cur.execute('DELETE FROM project_group_shares WHERE group_name = %s AND group_owner = %s', (name, owner))

def add_group_member(group_name, group_owner, username):
    with _conn() as conn:
        conn.cursor().execute(
            'INSERT INTO group_members (group_name, group_owner, username) '
            'VALUES (%s, %s, %s) ON CONFLICT DO NOTHING',
            (group_name, group_owner, username),
        )

def remove_group_member(group_name, group_owner, username):
    with _conn() as conn:
        conn.cursor().execute(
            'DELETE FROM group_members '
            'WHERE group_name = %s AND group_owner = %s AND username = %s',
            (group_name, group_owner, username),
        )

def get_user_groups(owner):
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute('SELECT name FROM groups WHERE owner = %s', (owner,))
        groups = [r[0] for r in cur.fetchall()]
        result = []
        for g in groups:
            cur.execute(
                'SELECT username FROM group_members '
                'WHERE group_name = %s AND group_owner = %s',
                (g, owner),
            )
            result.append({"name": g, "members": [r[0] for r in cur.fetchall()]})
        return result


# ─── Threads / Chat ──────────────────────────────────────────────────────────

def rename_project(old_name, new_name, username):
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute('UPDATE custom_projects SET name=%s WHERE name=%s AND owner=%s', (new_name, old_name, username))
        cur.execute('UPDATE file_metadata SET project_tag=%s WHERE project_tag=%s AND owner=%s', (new_name, old_name, username))
        cur.execute('UPDATE chat_history SET project_tag=%s WHERE project_tag=%s AND owner=%s', (new_name, old_name, username))
        cur.execute('UPDATE project_shares SET project_name=%s WHERE project_name=%s AND project_owner=%s', (new_name, old_name, username))
        cur.execute('UPDATE project_group_shares SET project_name=%s WHERE project_name=%s AND project_owner=%s', (new_name, old_name, username))

def get_project_threads(project_tag, username):
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(
            'SELECT thread_id FROM chat_history '
            'WHERE project_tag = %s AND owner = %s '
            'GROUP BY thread_id ORDER BY MAX(timestamp) DESC',
            (project_tag, username),
        )
        threads = [row[0] for row in cur.fetchall()]
        return threads if threads else []

def rename_thread(project, username, old_id, new_id):
    with _conn() as conn:
        conn.cursor().execute(
            'UPDATE chat_history SET thread_id=%s '
            'WHERE thread_id=%s AND project_tag=%s AND owner=%s',
            (new_id, old_id, project, username),
        )

def delete_thread(project, username, thread_id):
    with _conn() as conn:
        conn.cursor().execute(
            'DELETE FROM chat_history WHERE thread_id=%s AND project_tag=%s AND owner=%s',
            (thread_id, project, username),
        )

def save_chat_message(project, username, thread_id, role, content):
    with _conn() as conn:
        conn.cursor().execute(
            'INSERT INTO chat_history (project_tag, owner, thread_id, role, content) '
            'VALUES (%s, %s, %s, %s, %s)',
            (project, username, thread_id, role, content),
        )

def get_chat_history(project, username, thread_id):
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(
            'SELECT role, content FROM chat_history '
            'WHERE project_tag = %s AND owner = %s AND thread_id = %s '
            'ORDER BY timestamp ASC',
            (project, username, thread_id),
        )
        return [{"role": row[0], "content": row[1]} for row in cur.fetchall()]


# ─── Files ───────────────────────────────────────────────────────────────────

def delete_file_metadata(file_name, username):
    with _conn() as conn:
        conn.cursor().execute(
            'DELETE FROM file_metadata WHERE file_name = %s AND owner = %s',
            (file_name, username),
        )

def save_file_project(file_name, project_tag, username):
    with _conn() as conn:
        conn.cursor().execute(
            'INSERT INTO file_metadata (file_name, project_tag, owner) VALUES (%s, %s, %s)',
            (file_name, project_tag, username),
        )

def get_metadata_for_file(file_path):
    file_name = os.path.basename(file_path)
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute('SELECT project_tag, owner FROM file_metadata WHERE file_name = %s', (file_name,))
        row = cur.fetchone()
        return {
            "project":   row[0] if row else "Unknown",
            "file_name": file_name,
            "owner":     row[1] if row else "Unknown",
        }

def set_file_version(file_name: str, project: str, owner: str, version: str):
    with _conn() as conn:
        conn.cursor().execute(
            'UPDATE file_metadata SET version = %s '
            'WHERE file_name = %s AND project_tag = %s AND owner = %s',
            (version.strip() or None, file_name, project, owner),
        )

def list_files_with_versions(project: str, owner: str) -> list[dict]:
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(
            'SELECT file_name, version, upload_date FROM file_metadata '
            'WHERE project_tag = %s AND owner = %s ORDER BY upload_date',
            (project, owner),
        )
        return [
            {
                "file_name":   r[0],
                "version":     r[1],
                "upload_date": r[2].isoformat() if r[2] else None,
            }
            for r in cur.fetchall()
        ]


# ─── System ──────────────────────────────────────────────────────────────────

def update_index_signal():
    with _conn() as conn:
        conn.cursor().execute(
            "UPDATE system_state SET value = %s WHERE key = 'last_index_update'",
            (str(time.time()),),
        )

def get_index_signal():
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT value FROM system_state WHERE key = 'last_index_update'")
        row = cur.fetchone()
        return row[0] if row else '0'

# ─── Snapshots ───────────────────────────────────────────────────────────────

import json as _json

def create_snapshot(snap_id, project_name, project_owner, thread_id, title, created_by, messages, files):
    with _conn() as conn:
        conn.cursor().execute(
            'INSERT INTO snapshots (id, project_name, project_owner, thread_id, title, created_by, messages, files) '
            'VALUES (%s, %s, %s, %s, %s, %s, %s, %s)',
            (snap_id, project_name, project_owner, thread_id, title, created_by,
             _json.dumps(messages), list(files)),
        )

def get_snapshot(snap_id):
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute('SELECT id, project_name, project_owner, thread_id, title, created_by, created_at, messages, files FROM snapshots WHERE id = %s', (snap_id,))
        row = cur.fetchone()
        if not row:
            return None
        return {
            "id": row[0], "project_name": row[1], "project_owner": row[2],
            "thread_id": row[3], "title": row[4], "created_by": row[5],
            "created_at": row[6].isoformat() if row[6] else None,
            "messages": row[7] if isinstance(row[7], list) else _json.loads(row[7] or "[]"),
            "files": list(row[8] or []),
        }

def list_user_snapshots(username):
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(
            'SELECT id, project_name, thread_id, title, created_at, files '
            'FROM snapshots WHERE created_by = %s ORDER BY created_at DESC',
            (username,),
        )
        return [
            {"id": r[0], "project_name": r[1], "thread_id": r[2], "title": r[3],
             "created_at": r[4].isoformat() if r[4] else None, "files": list(r[5] or [])}
            for r in cur.fetchall()
        ]

def delete_snapshot(snap_id, username):
    with _conn() as conn:
        conn.cursor().execute(
            'DELETE FROM snapshots WHERE id = %s AND created_by = %s',
            (snap_id, username),
        )


# ─── Indexing Jobs ───────────────────────────────────────────────────────────

def enqueue_job(job_id: str, file_path: str, username: str, project: str):
    with _conn() as conn:
        conn.cursor().execute(
            'INSERT INTO indexing_jobs (id, file_path, username, project, status) '
            'VALUES (%s, %s, %s, %s, %s)',
            (job_id, file_path, username, project, 'pending'),
        )


def claim_next_job() -> dict | None:
    """Atomically claim one pending job. Returns job dict or None."""
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(
            'SELECT id, file_path, username, project FROM indexing_jobs '
            'WHERE status = %s ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED',
            ('pending',),
        )
        row = cur.fetchone()
        if row is None:
            return None
        cur.execute(
            "UPDATE indexing_jobs SET status = 'running', updated_at = NOW() WHERE id = %s",
            (row[0],),
        )
        return {"id": row[0], "file_path": row[1], "username": row[2], "project": row[3]}


def mark_job_done(job_id: str):
    with _conn() as conn:
        conn.cursor().execute(
            "UPDATE indexing_jobs SET status = 'done', updated_at = NOW() WHERE id = %s",
            (job_id,),
        )


def mark_job_failed(job_id: str, error: str):
    with _conn() as conn:
        conn.cursor().execute(
            "UPDATE indexing_jobs SET status = 'failed', error = %s, updated_at = NOW() WHERE id = %s",
            (error, job_id),
        )


def get_job(job_id: str) -> dict | None:
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(
            'SELECT id, file_path, username, project, status, error, created_at, updated_at '
            'FROM indexing_jobs WHERE id = %s',
            (job_id,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return {
            "id": row[0], "file_path": row[1], "username": row[2], "project": row[3],
            "status": row[4], "error": row[5],
            "created_at": row[6].isoformat() if row[6] else None,
            "updated_at": row[7].isoformat() if row[7] else None,
        }


def get_project_jobs(project: str, username: str) -> list:
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(
            'SELECT id, file_path, project, status, error, created_at, updated_at '
            'FROM indexing_jobs WHERE project = %s AND username = %s ORDER BY created_at DESC',
            (project, username),
        )
        return [
            {
                "id": r[0], "file_path": r[1], "project": r[2], "status": r[3],
                "error": r[4],
                "created_at": r[5].isoformat() if r[5] else None,
                "updated_at": r[6].isoformat() if r[6] else None,
            }
            for r in cur.fetchall()
        ]


# ─── Privacy / Redaction Audit ───────────────────────────────────────────────

def log_redaction_event(username: str, pii_type: str, count: int, context: str, project: str):
    with _conn() as conn:
        conn.cursor().execute(
            'INSERT INTO redaction_events (username, pii_type, count, context, project) '
            'VALUES (%s, %s, %s, %s, %s)',
            (username, pii_type, count, context, project),
        )


def get_redaction_stats() -> dict:
    with _conn() as conn:
        cur = conn.cursor()

        cur.execute('SELECT COALESCE(SUM(count), 0) FROM redaction_events')
        total = int(cur.fetchone()[0])

        cur.execute('SELECT COUNT(DISTINCT pii_type) FROM redaction_events')
        unique_types = int(cur.fetchone()[0])

        cur.execute(
            "SELECT COUNT(DISTINCT username) FROM redaction_events "
            "WHERE username != '' AND context = 'query'"
        )
        affected_users = int(cur.fetchone()[0])

        cur.execute(
            "SELECT COUNT(*) FROM redaction_events WHERE context = 'query'"
        )
        query_hits = int(cur.fetchone()[0])

        cur.execute(
            "SELECT COUNT(*) FROM redaction_events WHERE context = 'document'"
        )
        document_hits = int(cur.fetchone()[0])

        cur.execute(
            'SELECT pii_type, SUM(count) AS total FROM redaction_events '
            'GROUP BY pii_type ORDER BY total DESC'
        )
        by_type = [{"pii_type": r[0], "count": int(r[1])} for r in cur.fetchall()]

        cur.execute(
            "SELECT username, SUM(count) AS total FROM redaction_events "
            "WHERE username != '' GROUP BY username ORDER BY total DESC LIMIT 20"
        )
        by_user = [{"username": r[0], "count": int(r[1])} for r in cur.fetchall()]

        cur.execute(
            "SELECT DATE(created_at) AS day, SUM(count) AS total FROM redaction_events "
            "WHERE created_at >= NOW() - INTERVAL '30 days' "
            "GROUP BY day ORDER BY day ASC"
        )
        by_day = [{"date": str(r[0]), "count": int(r[1])} for r in cur.fetchall()]

        cur.execute(
            'SELECT id, username, pii_type, count, context, project, created_at '
            'FROM redaction_events ORDER BY created_at DESC LIMIT 100'
        )
        recent = [
            {
                "id": r[0], "username": r[1], "pii_type": r[2],
                "count": r[3], "context": r[4], "project": r[5],
                "created_at": r[6].isoformat() if r[6] else None,
            }
            for r in cur.fetchall()
        ]

    return {
        "summary": {
            "total_redactions": total,
            "unique_pii_types": unique_types,
            "affected_users": affected_users,
            "query_hits": query_hits,
            "document_hits": document_hits,
        },
        "by_type": by_type,
        "by_user": by_user,
        "by_day": by_day,
        "recent": recent,
    }


def nuke_database():
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute('DELETE FROM custom_projects')
        cur.execute('DELETE FROM file_metadata')
        cur.execute('DELETE FROM chat_history')
        cur.execute('DELETE FROM project_shares')
        cur.execute('DELETE FROM project_group_shares')
        cur.execute('DELETE FROM indexing_jobs')
        cur.execute('DELETE FROM redaction_events')
        cur.execute("UPDATE system_state SET value = '0' WHERE key = 'last_index_update'")
