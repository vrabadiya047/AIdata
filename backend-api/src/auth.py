# src/auth.py
import hashlib
import os
import re
import secrets
import string

from .database import _conn


def init_auth_db():
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                role TEXT NOT NULL,
                requires_change INTEGER DEFAULT 1
            )
        ''')
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS requires_change INTEGER DEFAULT 0")


def generate_temp_password():
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        pwd = ''.join(secrets.choice(alphabet) for _ in range(12))
        if (any(c.islower() for c in pwd) and any(c.isupper() for c in pwd)
                and any(c.isdigit() for c in pwd)
                and any(c in "!@#$%^&*" for c in pwd)):
            return pwd


def validate_password_complexity(password):
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if not re.search(r"[A-Z]", password):
        return False, "Must contain an uppercase letter."
    if not re.search(r"[a-z]", password):
        return False, "Must contain a lowercase letter."
    if not re.search(r"\d", password):
        return False, "Must contain a number."
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False, "Must contain a special character."
    return True, "Valid"


def hash_password(password: str, salt: bytes = None):
    if salt is None:
        salt = os.urandom(32)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return key.hex(), salt.hex()


def add_user(username, password, role, requires_change=1):
    try:
        pwd_hash, salt = hash_password(password)
        with _conn() as conn:
            conn.cursor().execute(
                'INSERT INTO users (username, password_hash, salt, role, requires_change) '
                'VALUES (%s, %s, %s, %s, %s)',
                (username, pwd_hash, salt, role, requires_change),
            )
        return True
    except Exception:
        return False


def update_user_password(username, new_password):
    pwd_hash, salt = hash_password(new_password)
    with _conn() as conn:
        conn.cursor().execute(
            'UPDATE users SET password_hash = %s, salt = %s, requires_change = 0 '
            'WHERE username = %s',
            (pwd_hash, salt, username),
        )


def verify_user(username, password):
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(
            'SELECT password_hash, salt, role, requires_change FROM users WHERE username = %s',
            (username,),
        )
        row = cur.fetchone()
        if row is None:
            return False, None, False
        stored_hash, stored_salt_hex, role, req_change = row
        stored_salt = bytes.fromhex(stored_salt_hex)
        attempt_hash, _ = hash_password(password, stored_salt)
        if attempt_hash == stored_hash:
            return True, role, bool(req_change)
        return False, None, False


def get_all_users():
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute('SELECT id, username, role FROM users ORDER BY role ASC')
        return cur.fetchall()


def delete_user(username):
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM users WHERE role = 'Admin'")
        admin_count = cur.fetchone()[0]
        cur.execute('SELECT role FROM users WHERE username = %s', (username,))
        user_data = cur.fetchone()
        if user_data and user_data[0] == 'Admin' and admin_count <= 1:
            return False
        cur.execute('DELETE FROM users WHERE username = %s', (username,))
        return True


def check_and_create_default_admin():
    init_auth_db()
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM users WHERE role = 'Admin'")
        if cur.fetchone()[0] == 0:
            add_user("admin", "Admin2026!", "Admin", requires_change=0)
