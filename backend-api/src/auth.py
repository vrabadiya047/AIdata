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
        for migration in [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS requires_change INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title TEXT DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_b64 TEXT DEFAULT NULL",
        ]:
            cur.execute(migration)
        cur.execute('''
            CREATE TABLE IF NOT EXISTS user_sessions (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                user_agent TEXT DEFAULT '',
                ip_address TEXT DEFAULT '',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                last_seen_at TIMESTAMPTZ DEFAULT NOW(),
                revoked BOOLEAN DEFAULT FALSE
            )
        ''')
        cur.execute(
            'CREATE INDEX IF NOT EXISTS idx_user_sessions_username ON user_sessions(username)'
        )


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


def get_user_info(username: str) -> dict | None:
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(
            'SELECT role, requires_change, mfa_enabled FROM users WHERE username = %s',
            (username,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {"role": row[0], "requires_change": bool(row[1]), "mfa_enabled": bool(row[2])}


def get_all_users():
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute('SELECT id, username, role, mfa_enabled FROM users ORDER BY role ASC')
        return cur.fetchall()


def search_usernames(prefix: str, limit: int = 8, exclude: str | None = None) -> list[str]:
    """Return usernames starting with `prefix` (case-insensitive). Used by share-with autocomplete.

    Returns at most `limit` results, alphabetised. The current user can be excluded so they
    don't appear in their own share suggestions.
    """
    prefix = (prefix or "").strip()
    if len(prefix) < 3:
        return []
    pattern = prefix.lower() + "%"
    with _conn() as conn:
        cur = conn.cursor()
        if exclude:
            cur.execute(
                'SELECT username FROM users '
                'WHERE LOWER(username) LIKE %s AND username <> %s '
                'ORDER BY username ASC LIMIT %s',
                (pattern, exclude, limit),
            )
        else:
            cur.execute(
                'SELECT username FROM users '
                'WHERE LOWER(username) LIKE %s '
                'ORDER BY username ASC LIMIT %s',
                (pattern, limit),
            )
        return [row[0] for row in cur.fetchall()]


# ─── MFA (TOTP) ───────────────────────────────────────────────────────────────

def mfa_generate_secret(username: str) -> str:
    """Create a fresh TOTP secret for the user. MFA stays disabled until confirmed."""
    import pyotp
    secret = pyotp.random_base32()
    with _conn() as conn:
        conn.cursor().execute(
            'UPDATE users SET mfa_secret = %s, mfa_enabled = 0 WHERE username = %s',
            (secret, username),
        )
    return secret


def mfa_provisioning_uri(username: str, secret: str, issuer: str = "Sovereign AI") -> str:
    import pyotp
    return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=issuer)


def mfa_confirm(username: str, code: str) -> bool:
    """Verify the first TOTP code and activate MFA for the user."""
    import pyotp
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute('SELECT mfa_secret FROM users WHERE username = %s', (username,))
        row = cur.fetchone()
        if not row or not row[0]:
            return False
        if pyotp.TOTP(row[0]).verify(code, valid_window=1):
            conn.cursor().execute(
                'UPDATE users SET mfa_enabled = 1 WHERE username = %s', (username,)
            )
            return True
        return False


def mfa_verify(username: str, code: str) -> bool:
    """Verify a TOTP code during the login second factor."""
    import pyotp
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(
            'SELECT mfa_secret FROM users WHERE username = %s AND mfa_enabled = 1',
            (username,),
        )
        row = cur.fetchone()
        if not row or not row[0]:
            return False
        return pyotp.TOTP(row[0]).verify(code, valid_window=1)


def mfa_is_enabled(username: str) -> bool:
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute('SELECT mfa_enabled FROM users WHERE username = %s', (username,))
        row = cur.fetchone()
        return bool(row[0]) if row else False


def mfa_disable(username: str):
    with _conn() as conn:
        conn.cursor().execute(
            'UPDATE users SET mfa_enabled = 0, mfa_secret = NULL WHERE username = %s',
            (username,),
        )


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


# ─── Profile ──────────────────────────────────────────────────────────────────

def get_user_profile(username: str) -> dict:
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(
            'SELECT display_name, job_title, department, avatar_b64 FROM users WHERE username = %s',
            (username,),
        )
        row = cur.fetchone()
        if not row:
            return {"display_name": "", "job_title": "", "department": "", "avatar_b64": ""}
        return {
            "display_name": row[0] or "",
            "job_title":    row[1] or "",
            "department":   row[2] or "",
            "avatar_b64":   row[3] or "",
        }


def update_user_profile(username: str, display_name: str, job_title: str,
                         department: str, avatar_b64: str) -> None:
    with _conn() as conn:
        conn.cursor().execute(
            'UPDATE users SET display_name=%s, job_title=%s, department=%s, avatar_b64=%s '
            'WHERE username=%s',
            (display_name or None, job_title or None, department or None,
             avatar_b64 or None, username),
        )


# ─── Sessions ─────────────────────────────────────────────────────────────────

def create_session_record(session_id: str, username: str,
                           user_agent: str, ip_address: str) -> None:
    with _conn() as conn:
        conn.cursor().execute(
            'INSERT INTO user_sessions (id, username, user_agent, ip_address) '
            'VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO NOTHING',
            (session_id, username, user_agent, ip_address),
        )


def list_sessions(username: str) -> list:
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(
            'SELECT id, user_agent, ip_address, created_at, last_seen_at '
            'FROM user_sessions '
            'WHERE username=%s AND revoked=FALSE '
            'ORDER BY created_at DESC',
            (username,),
        )
        return [
            {
                "session_id":   row[0],
                "user_agent":   row[1] or "",
                "ip_address":   row[2] or "",
                "created_at":   row[3].isoformat() if row[3] else None,
                "last_seen_at": row[4].isoformat() if row[4] else None,
            }
            for row in cur.fetchall()
        ]


def revoke_session(session_id: str, username: str) -> None:
    with _conn() as conn:
        conn.cursor().execute(
            'UPDATE user_sessions SET revoked=TRUE WHERE id=%s AND username=%s',
            (session_id, username),
        )


def revoke_all_sessions_except(username: str, keep_session_id: str | None) -> None:
    with _conn() as conn:
        if keep_session_id:
            conn.cursor().execute(
                'UPDATE user_sessions SET revoked=TRUE WHERE username=%s AND id!=%s',
                (username, keep_session_id),
            )
        else:
            conn.cursor().execute(
                'UPDATE user_sessions SET revoked=TRUE WHERE username=%s', (username,)
            )


def is_session_revoked(session_id: str) -> bool:
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute('SELECT revoked FROM user_sessions WHERE id=%s', (session_id,))
        row = cur.fetchone()
        return bool(row[0]) if row else False


def touch_session(session_id: str) -> None:
    with _conn() as conn:
        conn.cursor().execute(
            'UPDATE user_sessions SET last_seen_at=NOW() WHERE id=%s AND revoked=FALSE',
            (session_id,),
        )
