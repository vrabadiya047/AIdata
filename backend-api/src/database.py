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

        # Safe idempotent column migrations
        for sql in [
            "ALTER TABLE chat_history ADD COLUMN IF NOT EXISTS thread_id TEXT DEFAULT 'General'",
            "ALTER TABLE custom_projects ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'private'",
            "ALTER TABLE project_shares ADD COLUMN IF NOT EXISTS permissions TEXT DEFAULT 'documents,chats'",
            "ALTER TABLE project_group_shares ADD COLUMN IF NOT EXISTS permissions TEXT DEFAULT 'documents,chats'",
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
        # Directly shared with this user
        cur.execute("""
            SELECT cp.owner FROM custom_projects cp
            JOIN project_shares ps ON cp.name = ps.project_name AND cp.owner = ps.project_owner
            WHERE cp.name = %s AND ps.shared_with = %s
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
            "WHERE project_name = %s AND project_owner = %s AND shared_with = %s",
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

def share_project_with_user(project_name, project_owner, shared_with, permissions="documents,chats"):
    with _conn() as conn:
        conn.cursor().execute(
            'INSERT INTO project_shares (project_name, project_owner, shared_with, permissions) '
            'VALUES (%s, %s, %s, %s) ON CONFLICT (project_name, project_owner, shared_with) '
            'DO UPDATE SET permissions = EXCLUDED.permissions',
            (project_name, project_owner, shared_with, permissions),
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
            'SELECT shared_with, permissions FROM project_shares '
            'WHERE project_name = %s AND project_owner = %s',
            (project_name, project_owner),
        )
        return [
            {
                "username": r[0],
                "permissions": [p.strip() for p in (r[1] or "documents,chats").split(",") if p.strip()],
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

def nuke_database():
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute('DELETE FROM custom_projects')
        cur.execute('DELETE FROM file_metadata')
        cur.execute('DELETE FROM chat_history')
        cur.execute('DELETE FROM project_shares')
        cur.execute('DELETE FROM project_group_shares')
        cur.execute("UPDATE system_state SET value = '0' WHERE key = 'last_index_update'")
