# src/database.py
import sqlite3
import os
import time
from .config import DB_PATH

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('CREATE TABLE IF NOT EXISTS file_metadata (id INTEGER PRIMARY KEY AUTOINCREMENT, file_name TEXT, project_tag TEXT, owner TEXT, upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP)')
        # Creating table with thread_id
        cursor.execute('CREATE TABLE IF NOT EXISTS chat_history (id INTEGER PRIMARY KEY AUTOINCREMENT, project_tag TEXT, owner TEXT, thread_id TEXT, role TEXT, content TEXT, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)')
        
        # Safely migrate existing databases to include thread_id
        try:
            cursor.execute("ALTER TABLE chat_history ADD COLUMN thread_id TEXT DEFAULT 'General'")
        except sqlite3.OperationalError:
            pass # Column already exists
            
        cursor.execute('CREATE TABLE IF NOT EXISTS custom_projects (name TEXT, owner TEXT, PRIMARY KEY (name, owner))')
        cursor.execute('CREATE TABLE IF NOT EXISTS system_state (key TEXT PRIMARY KEY, value TEXT)')
        cursor.execute("INSERT OR IGNORE INTO system_state (key, value) VALUES ('last_index_update', '0')")
        conn.commit()

def get_project_threads(project_tag, username):
    """Retrieves all unique chat threads for a specific project."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT DISTINCT thread_id FROM chat_history WHERE project_tag = ? AND owner = ?', (project_tag, username))
        threads = [row[0] for row in cursor.fetchall()]
        return threads if threads else ["General"]
    
def add_custom_project(name, username):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('INSERT OR IGNORE INTO custom_projects (name, owner) VALUES (?, ?)', (name, username))

def delete_project_data(name, username):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('DELETE FROM custom_projects WHERE name = ? AND owner = ?', (name, username))
        conn.execute('DELETE FROM file_metadata WHERE project_tag = ? AND owner = ?', (name, username))
        conn.execute('DELETE FROM chat_history WHERE project_tag = ? AND owner = ?', (name, username))
        conn.commit()

def delete_file_metadata(file_name, username):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('DELETE FROM file_metadata WHERE file_name = ? AND owner = ?', (file_name, username))
        conn.commit()

# Update these two functions in src/database.py

def get_project_owner(project_name, username):
    """Determines if a project belongs to the user or is a public company workspace."""
    if project_name == "All Projects":
        return username
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT owner FROM custom_projects WHERE name = ? AND (owner = ? OR owner = "PUBLIC_WORKSPACE")', (project_name, username))
        row = cursor.fetchone()
        return row[0] if row else username

def get_all_projects(username):
    """Returns the user's private projects AND the global public projects."""
    from .config import DATA_DIR
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        # Fetch both private and public projects
        cursor.execute('SELECT name, owner FROM custom_projects WHERE owner = ? OR owner = "PUBLIC_WORKSPACE"', (username,))
        db_projects = cursor.fetchall()
    
    valid_projects = []
    for name, owner in db_projects:
        p_dir = os.path.join(DATA_DIR, owner, name)
        if os.path.exists(p_dir):
            valid_projects.append(name)
            
    return sorted(valid_projects)

def save_chat_message(project, username, thread_id, role, content):
    """Saves a message locked to the user AND the specific thread."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('INSERT INTO chat_history (project_tag, owner, thread_id, role, content) VALUES (?, ?, ?, ?, ?)', 
                     (project, username, thread_id, role, content))

def get_chat_history(project, username, thread_id):
    """Retrieves chat history for a specific thread."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT role, content FROM chat_history WHERE project_tag = ? AND owner = ? AND thread_id = ? ORDER BY timestamp ASC', 
                       (project, username, thread_id))
        return [{"role": row[0], "content": row[1]} for row in cursor.fetchall()]

def update_index_signal():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE system_state SET value = ? WHERE key = 'last_index_update'", (str(time.time()),))

def get_index_signal():
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM system_state WHERE key = 'last_index_update'")
        row = cursor.fetchone()
        return row[0] if row else '0'

def save_file_project(file_name, project_tag, username):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('INSERT INTO file_metadata (file_name, project_tag, owner) VALUES (?, ?, ?)', (file_name, project_tag, username))

def get_metadata_for_file(file_path):
    file_name = os.path.basename(file_path)
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT project_tag, owner FROM file_metadata WHERE file_name = ?', (file_name,))
        row = cursor.fetchone()
        return {"project": row[0] if row else "Unknown", "file_name": file_name, "owner": row[1] if row else "Unknown"}

def nuke_database():
    """Safely wipes all project, file, and chat data without deleting the Users table."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('DELETE FROM custom_projects')
        conn.execute('DELETE FROM file_metadata')
        conn.execute('DELETE FROM chat_history')
        conn.execute("UPDATE system_state SET value = '0' WHERE key = 'last_index_update'")
        conn.commit()

init_db()