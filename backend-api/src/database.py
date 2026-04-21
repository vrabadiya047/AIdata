# src/database.py
import sqlite3
import os
import time
from .config import DB_PATH

def init_db():
    with sqlite3.connect(DB_PATH, timeout=10) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=10000")
        conn.execute("PRAGMA synchronous=NORMAL")
        cursor = conn.cursor()

        cursor.execute('''CREATE TABLE IF NOT EXISTS file_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_name TEXT, project_tag TEXT, owner TEXT,
            upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )''')

        cursor.execute('''CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_tag TEXT, owner TEXT, thread_id TEXT,
            role TEXT, content TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )''')

        cursor.execute('''CREATE TABLE IF NOT EXISTS custom_projects (
            name TEXT, owner TEXT,
            visibility TEXT DEFAULT 'private',
            PRIMARY KEY (name, owner)
        )''')

        # Sharing tables
        cursor.execute('''CREATE TABLE IF NOT EXISTS project_shares (
            project_name TEXT, project_owner TEXT, shared_with TEXT,
            PRIMARY KEY (project_name, project_owner, shared_with)
        )''')

        cursor.execute('''CREATE TABLE IF NOT EXISTS groups (
            name TEXT, owner TEXT,
            PRIMARY KEY (name, owner)
        )''')

        cursor.execute('''CREATE TABLE IF NOT EXISTS group_members (
            group_name TEXT, group_owner TEXT, username TEXT,
            PRIMARY KEY (group_name, group_owner, username)
        )''')

        cursor.execute('''CREATE TABLE IF NOT EXISTS project_group_shares (
            project_name TEXT, project_owner TEXT,
            group_name TEXT, group_owner TEXT,
            PRIMARY KEY (project_name, project_owner, group_name, group_owner)
        )''')

        cursor.execute('''CREATE TABLE IF NOT EXISTS system_state (
            key TEXT PRIMARY KEY, value TEXT
        )''')
        cursor.execute("INSERT OR IGNORE INTO system_state (key, value) VALUES ('last_index_update', '0')")

        # Safe migrations for existing DBs
        for migration in [
            "ALTER TABLE chat_history ADD COLUMN thread_id TEXT DEFAULT 'General'",
            "ALTER TABLE custom_projects ADD COLUMN visibility TEXT DEFAULT 'private'",
        ]:
            try:
                cursor.execute(migration)
            except sqlite3.OperationalError:
                pass

        conn.commit()


# ─── Projects ────────────────────────────────────────────────────────────────

def add_custom_project(name, username, visibility='private'):
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        conn.execute(
            'INSERT OR IGNORE INTO custom_projects (name, owner, visibility) VALUES (?, ?, ?)',
            (name, username, visibility)
        )

def set_project_visibility(name, owner, visibility):
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        conn.execute(
            'UPDATE custom_projects SET visibility = ? WHERE name = ? AND owner = ?',
            (visibility, name, owner)
        )
        conn.commit()

def delete_project_data(name, username):
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        conn.execute('DELETE FROM custom_projects WHERE name = ? AND owner = ?', (name, username))
        conn.execute('DELETE FROM file_metadata WHERE project_tag = ? AND owner = ?', (name, username))
        conn.execute('DELETE FROM chat_history WHERE project_tag = ? AND owner = ?', (name, username))
        conn.execute('DELETE FROM project_shares WHERE project_name = ? AND project_owner = ?', (name, username))
        conn.execute('DELETE FROM project_group_shares WHERE project_name = ? AND project_owner = ?', (name, username))
        conn.commit()

def get_all_projects(username):
    """Returns all projects accessible to the user with metadata."""
    from .config import DATA_DIR
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        cursor = conn.cursor()

        # Own projects
        cursor.execute('SELECT name, owner, visibility FROM custom_projects WHERE owner = ?', (username,))
        own = [(r[0], r[1], r[2], 'own') for r in cursor.fetchall()]

        # Public projects by others
        cursor.execute(
            "SELECT name, owner, visibility FROM custom_projects WHERE visibility = 'public' AND owner != ?",
            (username,)
        )
        public = [(r[0], r[1], r[2], 'public') for r in cursor.fetchall()]

        # Shared directly with user
        cursor.execute('''
            SELECT cp.name, cp.owner, cp.visibility FROM custom_projects cp
            JOIN project_shares ps ON cp.name = ps.project_name AND cp.owner = ps.project_owner
            WHERE ps.shared_with = ? AND cp.owner != ?
        ''', (username, username))
        shared = [(r[0], r[1], r[2], 'shared') for r in cursor.fetchall()]

        # Shared via group
        cursor.execute('''
            SELECT cp.name, cp.owner, cp.visibility FROM custom_projects cp
            JOIN project_group_shares pgs ON cp.name = pgs.project_name AND cp.owner = pgs.project_owner
            JOIN group_members gm ON pgs.group_name = gm.group_name AND pgs.group_owner = gm.group_owner
            WHERE gm.username = ? AND cp.owner != ?
        ''', (username, username))
        group_shared = [(r[0], r[1], r[2], 'shared') for r in cursor.fetchall()]

    seen = set()
    result = []
    for name, owner, visibility, access in own + public + shared + group_shared:
        key = (name, owner)
        if key in seen:
            continue
        seen.add(key)
        p_dir = os.path.join(DATA_DIR, owner, name)
        if os.path.exists(p_dir):
            result.append({
                "name": name,
                "owner": owner,
                "visibility": visibility,
                "access": access,   # own / public / shared
            })

    return sorted(result, key=lambda x: (x["access"] != "own", x["name"]))


def get_project_owner(project_name, username):
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        cursor = conn.cursor()
        cursor.execute(
            'SELECT owner FROM custom_projects WHERE name = ? AND (owner = ? OR visibility = "public")',
            (project_name, username)
        )
        row = cursor.fetchone()
        return row[0] if row else username


# ─── Sharing ─────────────────────────────────────────────────────────────────

def share_project_with_user(project_name, project_owner, shared_with):
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        conn.execute(
            'INSERT OR IGNORE INTO project_shares (project_name, project_owner, shared_with) VALUES (?, ?, ?)',
            (project_name, project_owner, shared_with)
        )
        conn.commit()

def unshare_project_from_user(project_name, project_owner, shared_with):
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        conn.execute(
            'DELETE FROM project_shares WHERE project_name = ? AND project_owner = ? AND shared_with = ?',
            (project_name, project_owner, shared_with)
        )
        conn.commit()

def get_project_shares(project_name, project_owner):
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        cursor = conn.cursor()
        cursor.execute(
            'SELECT shared_with FROM project_shares WHERE project_name = ? AND project_owner = ?',
            (project_name, project_owner)
        )
        return [r[0] for r in cursor.fetchall()]

def share_project_with_group(project_name, project_owner, group_name, group_owner):
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        conn.execute(
            'INSERT OR IGNORE INTO project_group_shares VALUES (?, ?, ?, ?)',
            (project_name, project_owner, group_name, group_owner)
        )
        conn.commit()

def unshare_project_from_group(project_name, project_owner, group_name, group_owner):
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        conn.execute(
            'DELETE FROM project_group_shares WHERE project_name=? AND project_owner=? AND group_name=? AND group_owner=?',
            (project_name, project_owner, group_name, group_owner)
        )
        conn.commit()


# ─── Groups ──────────────────────────────────────────────────────────────────

def create_group(name, owner):
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        conn.execute('INSERT OR IGNORE INTO groups (name, owner) VALUES (?, ?)', (name, owner))
        conn.commit()

def delete_group(name, owner):
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        conn.execute('DELETE FROM groups WHERE name = ? AND owner = ?', (name, owner))
        conn.execute('DELETE FROM group_members WHERE group_name = ? AND group_owner = ?', (name, owner))
        conn.execute('DELETE FROM project_group_shares WHERE group_name = ? AND group_owner = ?', (name, owner))
        conn.commit()

def add_group_member(group_name, group_owner, username):
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        conn.execute(
            'INSERT OR IGNORE INTO group_members (group_name, group_owner, username) VALUES (?, ?, ?)',
            (group_name, group_owner, username)
        )
        conn.commit()

def remove_group_member(group_name, group_owner, username):
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        conn.execute(
            'DELETE FROM group_members WHERE group_name = ? AND group_owner = ? AND username = ?',
            (group_name, group_owner, username)
        )
        conn.commit()

def get_user_groups(owner):
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT name FROM groups WHERE owner = ?', (owner,))
        groups = [r[0] for r in cursor.fetchall()]
        result = []
        for g in groups:
            cursor.execute(
                'SELECT username FROM group_members WHERE group_name = ? AND group_owner = ?',
                (g, owner)
            )
            members = [r[0] for r in cursor.fetchall()]
            result.append({"name": g, "members": members})
        return result


# ─── Threads / Chat ──────────────────────────────────────────────────────────

def get_project_threads(project_tag, username):
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        cursor = conn.cursor()
        cursor.execute(
            'SELECT DISTINCT thread_id FROM chat_history WHERE project_tag = ? AND owner = ?',
            (project_tag, username)
        )
        threads = [row[0] for row in cursor.fetchall()]
        return threads if threads else ["General"]

def save_chat_message(project, username, thread_id, role, content):
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        conn.execute(
            'INSERT INTO chat_history (project_tag, owner, thread_id, role, content) VALUES (?, ?, ?, ?, ?)',
            (project, username, thread_id, role, content)
        )

def get_chat_history(project, username, thread_id):
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        cursor = conn.cursor()
        cursor.execute(
            'SELECT role, content FROM chat_history WHERE project_tag = ? AND owner = ? AND thread_id = ? ORDER BY timestamp ASC',
            (project, username, thread_id)
        )
        return [{"role": row[0], "content": row[1]} for row in cursor.fetchall()]


# ─── Files ───────────────────────────────────────────────────────────────────

def delete_file_metadata(file_name, username):
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        conn.execute('DELETE FROM file_metadata WHERE file_name = ? AND owner = ?', (file_name, username))
        conn.commit()

def save_file_project(file_name, project_tag, username):
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        conn.execute(
            'INSERT INTO file_metadata (file_name, project_tag, owner) VALUES (?, ?, ?)',
            (file_name, project_tag, username)
        )

def get_metadata_for_file(file_path):
    file_name = os.path.basename(file_path)
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT project_tag, owner FROM file_metadata WHERE file_name = ?', (file_name,))
        row = cursor.fetchone()
        return {"project": row[0] if row else "Unknown", "file_name": file_name, "owner": row[1] if row else "Unknown"}


# ─── System ──────────────────────────────────────────────────────────────────

def update_index_signal():
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        conn.execute("UPDATE system_state SET value = ? WHERE key = 'last_index_update'", (str(time.time()),))

def get_index_signal():
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM system_state WHERE key = 'last_index_update'")
        row = cursor.fetchone()
        return row[0] if row else '0'

def nuke_database():
    with sqlite3.connect(DB_PATH, timeout=5) as conn:
        conn.execute('DELETE FROM custom_projects')
        conn.execute('DELETE FROM file_metadata')
        conn.execute('DELETE FROM chat_history')
        conn.execute('DELETE FROM project_shares')
        conn.execute('DELETE FROM project_group_shares')
        conn.execute("UPDATE system_state SET value = '0' WHERE key = 'last_index_update'")
        conn.commit()


init_db()
