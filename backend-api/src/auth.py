# src/auth.py
import sqlite3
import hashlib
import os
import re
import secrets
import string
from .config import DB_PATH

def init_auth_db():
    """Creates tables and safely updates existing ones for the forced-reset feature."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                role TEXT NOT NULL,
                requires_change INTEGER DEFAULT 1
            )
        ''')
        # Safely migrate existing databases to include the new column
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN requires_change INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass # Column already exists
        conn.commit()

def generate_temp_password():
    """Generates an ultra-secure 12-character temporary password meeting all complexity rules."""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        pwd = ''.join(secrets.choice(alphabet) for i in range(12))
        # Ensure it meets all complexity standards
        if (any(c.islower() for c in pwd) and any(c.isupper() for c in pwd) and
            any(c.isdigit() for c in pwd) and any(c in "!@#$%^&*" for c in pwd)):
            return pwd

def validate_password_complexity(password):
    """Enforces enterprise password complexity standards."""
    if len(password) < 8: return False, "Password must be at least 8 characters long."
    if not re.search(r"[A-Z]", password): return False, "Must contain an uppercase letter."
    if not re.search(r"[a-z]", password): return False, "Must contain a lowercase letter."
    if not re.search(r"\d", password): return False, "Must contain a number."
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password): return False, "Must contain a special character."
    return True, "Valid"

def hash_password(password: str, salt: bytes = None):
    if salt is None: salt = os.urandom(32)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return key.hex(), salt.hex()

def add_user(username, password, role, requires_change=1):
    """Registers a new user. Defaults to requiring a password change."""
    try:
        pwd_hash, salt = hash_password(password)
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                'INSERT INTO users (username, password_hash, salt, role, requires_change) VALUES (?, ?, ?, ?, ?)', 
                (username, pwd_hash, salt, role, requires_change)
            )
        return True
    except sqlite3.IntegrityError:
        return False

def update_user_password(username, new_password):
    """Updates the password and removes the 'requires_change' flag."""
    pwd_hash, salt = hash_password(new_password)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            'UPDATE users SET password_hash = ?, salt = ?, requires_change = 0 WHERE username = ?',
            (pwd_hash, salt, username)
        )
        conn.commit()

def verify_user(username, password):
    """Validates login and returns (is_valid, role, requires_change)."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT password_hash, salt, role, requires_change FROM users WHERE username = ?', (username,))
        row = cursor.fetchone()
        
        if row is None: return False, None, False
            
        stored_hash, stored_salt_hex, role, req_change = row
        stored_salt = bytes.fromhex(stored_salt_hex)
        attempt_hash, _ = hash_password(password, stored_salt)
        
        if attempt_hash == stored_hash:
            return True, role, bool(req_change)
        else:
            return False, None, False

def get_all_users():
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id, username, role FROM users ORDER BY role ASC')
        return cursor.fetchall()

def delete_user(username):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM users WHERE role = "Admin"')
        admin_count = cursor.fetchone()[0]
        cursor.execute('SELECT role FROM users WHERE username = ?', (username,))
        user_data = cursor.fetchone()
        
        if user_data and user_data[0] == 'Admin' and admin_count <= 1:
            return False
            
        conn.execute('DELETE FROM users WHERE username = ?', (username,))
        conn.commit()
        return True

def check_and_create_default_admin():
    init_auth_db()
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM users WHERE role = "Admin"')
        if cursor.fetchone()[0] == 0:
            # Default Admin doesn't require a change so you aren't locked out immediately
            add_user("admin", "Admin2026!", "Admin", requires_change=0)