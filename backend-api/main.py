from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, UploadFile, File, Form, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pydantic import BaseModel
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
import json
import asyncio
import os
import io
import re
import uuid
from fastapi.concurrency import run_in_threadpool
from src import adb
from src.engine import (
    get_query_engine,
    get_query_components,
    index_file, remove_file_from_index, rename_project_index, delete_project_index,
)
from src.database import (
    init_db,
    get_all_projects, get_chat_history, save_chat_message,
    add_custom_project, delete_project_data, get_project_threads,
    save_file_project, delete_file_metadata,
    set_project_visibility, share_project_with_user, unshare_project_from_user,
    get_project_shares, share_project_with_group, unshare_project_from_group,
    create_group, delete_group, add_group_member, remove_group_member, get_user_groups,
    rename_project, rename_thread, delete_thread,
    get_project_owner, get_user_permissions, update_share_permissions,
    create_snapshot, get_snapshot, list_user_snapshots, delete_snapshot,
    enqueue_job, get_job, get_project_jobs,
    log_redaction_event, get_redaction_stats,
)
from src.manager import (
    handle_create_project, handle_delete_project,
    handle_file_upload, handle_delete_file, list_files_in_project
)
from src.privacy import shield
from src.logger import log_query
from src.auth import (
    verify_user, add_user, delete_user, get_all_users, update_user_password,
    check_and_create_default_admin, get_user_info,
    mfa_generate_secret, mfa_provisioning_uri, mfa_confirm,
    mfa_verify, mfa_is_enabled, mfa_disable,
)
from src.analytics import get_audit_trail
from src.config import DATA_DIR, LOG_DIR

_ENV_SECRET = os.environ.get("SOVEREIGN_JWT_SECRET")
_FALLBACK_SECRET = "sovereign-test-secret-not-for-production"
JWT_SECRET = _ENV_SECRET or _FALLBACK_SECRET
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 8
MFA_PENDING_MINUTES = 5


def _start_worker():
    """Background indexing worker — runs as a daemon thread alongside the API server."""
    import time as _time
    from src.database import claim_next_job, mark_job_done, mark_job_failed
    poll = int(os.environ.get("WORKER_POLL_INTERVAL", "2"))
    print(f"[worker] Started (embedded). Polling every {poll}s.", flush=True)
    while True:
        try:
            job = claim_next_job()
            if job is None:
                _time.sleep(poll)
                continue
            print(f"[worker] Processing {job['file_path']}", flush=True)
            index_file(job["file_path"], job["username"], job["project"])
            mark_job_done(job["id"])
            print(f"[worker] Done {job['id']}", flush=True)
        except Exception as exc:
            try:
                mark_job_failed(job["id"], str(exc))
            except Exception:
                pass
            print(f"[worker] Error: {exc}", flush=True)
            _time.sleep(poll)


@asynccontextmanager
async def lifespan(_: FastAPI):
    is_production = os.environ.get("SOVEREIGN_ENV", "").lower() == "production"
    if not _ENV_SECRET:
        if is_production:
            raise RuntimeError(
                "SOVEREIGN_JWT_SECRET environment variable is not set. "
                "Refusing to start in production without a secure secret."
            )
        print(
            "\n⚠️  SOVEREIGN SECURITY WARNING ──────────────────────────────\n"
            "   SOVEREIGN_JWT_SECRET is not set.\n"
            "   Running with an insecure fallback — NOT safe for production.\n"
            "   Set SOVEREIGN_ENV=production to enforce this check at startup.\n"
            "─────────────────────────────────────────────────────────────\n"
        )
    init_db()
    check_and_create_default_admin()

    import threading
    threading.Thread(target=_start_worker, daemon=True, name="indexing-worker").start()

    yield


app = FastAPI(title="Sovereign AI", redirect_slashes=False, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def safe_filename(filename: str) -> str:
    """Prevents path traversal — strips directory components and sanitizes chars."""
    name = os.path.basename(filename.replace("\\", "/"))
    name = re.sub(r'[^\w\-. ]', '_', name).strip()
    if not name or name.lstrip('.') == '':
        raise HTTPException(status_code=400, detail="Invalid or unsafe filename")
    return name



# ─── Auth helpers ────────────────────────────────────────────────────────────

def create_token(username: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    return jwt.encode({"sub": username, "role": role, "exp": expire}, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_pending_mfa_token(username: str) -> str:
    """Short-lived token issued after correct password but before TOTP is verified.
    Accepted ONLY by /api/auth/mfa/verify — does not grant any other access."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=MFA_PENDING_MINUTES)
    return jwt.encode({"sub": username, "mfa_pending": True, "exp": expire}, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])

def get_current_user(request: Request) -> dict:
    token = request.cookies.get("sovereign_session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
        # Next.js signs with {username, role}; backend signs with {sub, role}
        username = payload.get("username") or payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid session")
        return {"username": username, "role": payload.get("role", "User")}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid session")

def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "Admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ─── Health ──────────────────────────────────────────────────────────────────

@app.get("/")
async def health():
    return {"status": "Sovereign AI Engine is Online"}


# ─── Auth endpoints ───────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/auth/login")
async def login(data: LoginRequest):
    valid, role, requires_change = await adb.verify_user(data.username, data.password)
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if await adb.mfa_is_enabled(data.username):
        pending = create_pending_mfa_token(data.username)
        return JSONResponse({"mfa_required": True, "mfa_token": pending})

    token = create_token(data.username, role)
    response = JSONResponse({
        "username": data.username, "role": role,
        "requires_change": requires_change, "mfa_required": False,
    })
    response.set_cookie(
        key="sovereign_session", value=token,
        httponly=True, max_age=JWT_EXPIRE_HOURS * 3600, samesite="lax", path="/",
    )
    return response

@app.post("/api/auth/logout")
async def logout():
    response = JSONResponse({"status": "logged out"})
    response.delete_cookie("sovereign_session", path="/")
    return response

@app.get("/api/auth/me")
async def me(user: dict = Depends(get_current_user)):
    info = await adb.get_user_info(user["username"])
    return {**user, "mfa_enabled": info["mfa_enabled"] if info else False}

class ChangePasswordRequest(BaseModel):
    new_password: str

@app.post("/api/auth/change-password")
async def change_password(data: ChangePasswordRequest, user: dict = Depends(get_current_user)):
    await adb.update_user_password(user["username"], data.new_password)
    return {"status": "password updated"}


# ─── MFA (TOTP) ───────────────────────────────────────────────────────────────

class MFAVerifyRequest(BaseModel):
    code: str
    mfa_token: str

class MFAConfirmRequest(BaseModel):
    code: str

@app.post("/api/auth/mfa/verify")
async def mfa_verify_endpoint(data: MFAVerifyRequest):
    """Second-factor login: validate pending token + TOTP code, issue full session."""
    try:
        payload = decode_token(data.mfa_token)
        if not payload.get("mfa_pending"):
            raise HTTPException(status_code=400, detail="Invalid token type")
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=400, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="MFA token expired or invalid")

    if not await adb.mfa_verify(username, data.code):
        raise HTTPException(status_code=401, detail="Invalid authenticator code")

    info = await adb.get_user_info(username)
    if info is None:
        raise HTTPException(status_code=401, detail="User not found")

    token = create_token(username, info["role"])
    response = JSONResponse({
        "username": username, "role": info["role"],
        "requires_change": info["requires_change"], "mfa_required": False,
    })
    response.set_cookie(
        key="sovereign_session", value=token,
        httponly=True, max_age=JWT_EXPIRE_HOURS * 3600, samesite="lax", path="/",
    )
    return response

@app.get("/api/auth/mfa/setup")
async def mfa_setup(user: dict = Depends(get_current_user)):
    """Generate a TOTP secret and QR code. MFA stays disabled until confirmed."""
    import qrcode, io, base64 as _b64
    secret = await adb.mfa_generate_secret(user["username"])
    uri    = await adb.mfa_provisioning_uri(user["username"], secret)
    img    = qrcode.make(uri)
    buf    = io.BytesIO()
    img.save(buf, format="PNG")
    qr_data_uri = "data:image/png;base64," + _b64.b64encode(buf.getvalue()).decode()
    return {"secret": secret, "uri": uri, "qr": qr_data_uri}

@app.post("/api/auth/mfa/confirm")
async def mfa_confirm_endpoint(data: MFAConfirmRequest, user: dict = Depends(get_current_user)):
    """Verify the first TOTP code and activate MFA."""
    if not await adb.mfa_confirm(user["username"], data.code):
        raise HTTPException(status_code=401, detail="Invalid authenticator code — try again")
    return {"status": "mfa_enabled"}

@app.delete("/api/auth/mfa")
async def mfa_disable_self(user: dict = Depends(get_current_user)):
    """Let an authenticated user disable their own MFA."""
    await adb.mfa_disable(user["username"])
    return {"status": "mfa_disabled"}

@app.delete("/api/admin/users/{username}/mfa")
async def admin_mfa_reset(username: str, admin: dict = Depends(require_admin)):
    """Admin: reset MFA for any user (e.g. lost authenticator)."""
    await adb.mfa_disable(username)
    return {"status": "mfa_reset"}


# ─── Workspaces ───────────────────────────────────────────────────────────────

@app.get("/api/workspaces/{username}")
async def get_workspaces(username: str, user: dict = Depends(get_current_user)):
    if user["username"] != username and user["role"] != "Admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    projects = await adb.get_all_projects(username)
    return {"workspaces": projects}

class ProjectRequest(BaseModel):
    name: str
    username: str

@app.post("/api/projects")
async def create_project(data: ProjectRequest, user: dict = Depends(get_current_user)):
    if user["username"] != data.username and user["role"] != "Admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    ok = await adb.handle_create_project(data.name, data.username)
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid project name")
    return {"status": "created", "name": data.name}

@app.delete("/api/projects/{name}")
async def delete_project(name: str, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    await adb.handle_delete_project(name, user["username"])
    background_tasks.add_task(delete_project_index, user["username"], name)
    return {"status": "deleted"}

class RenameProjectRequest(BaseModel):
    new_name: str

@app.put("/api/projects/{name}")
async def rename_project_endpoint(name: str, data: RenameProjectRequest, user: dict = Depends(get_current_user)):
    new_name = data.new_name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    username = user["username"]
    old_data = os.path.join(DATA_DIR, username, name)
    new_data = os.path.join(DATA_DIR, username, new_name)
    if os.path.exists(old_data):
        await run_in_threadpool(os.rename, old_data, new_data)
    await run_in_threadpool(rename_project_index, username, name, new_name)
    await adb.rename_project(name, new_name, username)
    return {"status": "renamed", "name": new_name}

class VisibilityRequest(BaseModel):
    visibility: str  # 'private' | 'public' | 'shared'

@app.put("/api/projects/{name}/visibility")
async def update_visibility(name: str, data: VisibilityRequest, user: dict = Depends(get_current_user)):
    if data.visibility not in ("private", "public", "shared"):
        raise HTTPException(status_code=400, detail="Invalid visibility")
    await adb.set_project_visibility(name, user["username"], data.visibility)
    return {"status": "updated"}

class ShareUserRequest(BaseModel):
    shared_with: str
    permissions: list[str] = ["documents", "chats"]

@app.post("/api/projects/{name}/share")
async def share_with_user(name: str, data: ShareUserRequest, user: dict = Depends(get_current_user)):
    perms_str = ",".join(data.permissions) if data.permissions else "documents,chats"
    await adb.share_project_with_user(name, user["username"], data.shared_with, perms_str)
    return {"status": "shared"}

@app.delete("/api/projects/{name}/share/{target}")
async def unshare_from_user(name: str, target: str, user: dict = Depends(get_current_user)):
    await adb.unshare_project_from_user(name, user["username"], target)
    return {"status": "unshared"}

@app.get("/api/projects/{name}/shares")
async def get_shares(name: str, user: dict = Depends(get_current_user)):
    shares = await adb.get_project_shares(name, user["username"])
    return {"shared_with": shares}

class UpdatePermissionsRequest(BaseModel):
    permissions: list[str]

@app.put("/api/projects/{name}/share/{target}/permissions")
async def update_permissions(name: str, target: str, data: UpdatePermissionsRequest, user: dict = Depends(get_current_user)):
    perms_str = ",".join(data.permissions) if data.permissions else ""
    await adb.update_share_permissions(name, user["username"], target, perms_str)
    return {"status": "updated"}

class ShareGroupRequest(BaseModel):
    group_name: str
    group_owner: str

@app.post("/api/projects/{name}/share-group")
async def share_with_group(name: str, data: ShareGroupRequest, user: dict = Depends(get_current_user)):
    await adb.share_project_with_group(name, user["username"], data.group_name, data.group_owner)
    return {"status": "shared"}

@app.delete("/api/projects/{name}/share-group/{group_owner}/{group_name}")
async def unshare_from_group(name: str, group_owner: str, group_name: str, user: dict = Depends(get_current_user)):
    await adb.unshare_project_from_group(name, user["username"], group_name, group_owner)
    return {"status": "unshared"}


# ─── Groups ───────────────────────────────────────────────────────────────────

class GroupRequest(BaseModel):
    name: str

@app.get("/api/groups")
async def list_groups(user: dict = Depends(get_current_user)):
    groups = await adb.get_user_groups(user["username"])
    return {"groups": groups}

@app.post("/api/groups")
async def create_new_group(data: GroupRequest, user: dict = Depends(get_current_user)):
    await adb.create_group(data.name, user["username"])
    return {"status": "created"}

@app.delete("/api/groups/{name}")
async def remove_group(name: str, user: dict = Depends(get_current_user)):
    await adb.delete_group(name, user["username"])
    return {"status": "deleted"}

class GroupMemberRequest(BaseModel):
    username: str

@app.post("/api/groups/{name}/members")
async def add_member(name: str, data: GroupMemberRequest, user: dict = Depends(get_current_user)):
    await adb.add_group_member(name, user["username"], data.username)
    return {"status": "added"}

@app.delete("/api/groups/{name}/members/{member}")
async def remove_member(name: str, member: str, user: dict = Depends(get_current_user)):
    await adb.remove_group_member(name, user["username"], member)
    return {"status": "removed"}


# ─── File upload / listing ───────────────────────────────────────────────────

@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    project: str = Form(...),
    user: dict = Depends(get_current_user),
):
    username = user["username"]
    clean_name = safe_filename(file.filename or "")
    project_dir = os.path.join(DATA_DIR, username, project)
    os.makedirs(project_dir, exist_ok=True)

    file_path = os.path.join(project_dir, clean_name)
    contents = await file.read()
    await asyncio.to_thread(lambda: open(file_path, "wb").write(contents))

    await adb.save_file_project(clean_name, project, username)
    job_id = str(uuid.uuid4())
    await adb.enqueue_job(job_id, file_path, username, project)

    return {"status": "uploaded", "file": clean_name, "job_id": job_id}

@app.delete("/api/files/{filename}")
async def delete_file(filename: str, project: str, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    await adb.handle_delete_file(project, filename, user["username"])
    background_tasks.add_task(remove_file_from_index, filename, user["username"], project)
    return {"status": "deleted"}

@app.get("/api/files")
async def list_files(project: str, user: dict = Depends(get_current_user)):
    files = await adb.list_files_in_project(project, user["username"])
    return {"files": files}


# ─── Indexing Jobs ────────────────────────────────────────────────────────────

@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str, user: dict = Depends(get_current_user)):
    job = await adb.get_job(job_id)
    if job is None or job["username"] != user["username"]:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@app.get("/api/jobs")
async def list_jobs(project: str, user: dict = Depends(get_current_user)):
    return {"jobs": await adb.get_project_jobs(project, user["username"])}


# ─── Threads ──────────────────────────────────────────────────────────────────

@app.get("/api/threads")
async def get_threads(project: str, user: dict = Depends(get_current_user)):
    owner = await adb.get_project_owner(project, user["username"])
    if owner != user["username"]:
        perms = await adb.get_user_permissions(project, owner, user["username"])
        if "chats" not in perms:
            return {"threads": []}
    threads = await adb.get_project_threads(project, owner)
    return {"threads": threads}

class RenameThreadRequest(BaseModel):
    project: str
    old_id: str
    new_id: str

@app.put("/api/threads")
async def rename_thread_endpoint(data: RenameThreadRequest, user: dict = Depends(get_current_user)):
    await adb.rename_thread(data.project, user["username"], data.old_id, data.new_id)
    return {"status": "renamed"}

@app.delete("/api/threads")
async def delete_thread_endpoint(project: str, thread_id: str, user: dict = Depends(get_current_user)):
    await adb.delete_thread(project, user["username"], thread_id)
    return {"status": "deleted"}


# ─── Query Log ────────────────────────────────────────────────────────────────

@app.get("/api/query-log")
async def get_query_log(user: dict = Depends(get_current_user)):
    log_file = os.path.join(LOG_DIR, "query_log.jsonl")
    entries = []
    if os.path.exists(log_file):
        with open(log_file, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        entries.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
    return {"entries": entries[-200:]}


# ─── Chat history ─────────────────────────────────────────────────────────────

@app.get("/api/history")
async def get_history(project: str, username: str, thread_id: str = "General", user: dict = Depends(get_current_user)):
    owner = await adb.get_project_owner(project, username)
    if owner != username:
        perms = await adb.get_user_permissions(project, owner, username)
        if "chats" not in perms:
            return {"history": []}
    history = await adb.get_chat_history(project, owner, thread_id)
    return {"history": history}


# ─── Snapshots ────────────────────────────────────────────────────────────────

class CreateSnapshotRequest(BaseModel):
    project: str
    thread_id: str
    title: str = ""

@app.post("/api/snapshots")
async def create_snapshot_endpoint(data: CreateSnapshotRequest, user: dict = Depends(get_current_user)):
    owner = await adb.get_project_owner(data.project, user["username"])
    perms = await adb.get_user_permissions(data.project, owner, user["username"])
    if owner != user["username"] and "chats" not in perms:
        raise HTTPException(status_code=403, detail="No access to this thread")
    messages = await adb.get_chat_history(data.project, owner, data.thread_id)
    files = await adb.list_files_in_project(data.project, owner)
    snap_id = str(uuid.uuid4())
    title = data.title.strip() or data.thread_id
    await adb.create_snapshot(snap_id, data.project, owner, data.thread_id, title, user["username"], messages, files)
    return {"id": snap_id}

@app.get("/api/snapshots")
async def list_snapshots_endpoint(user: dict = Depends(get_current_user)):
    snaps = await adb.list_user_snapshots(user["username"])
    return {"snapshots": snaps}

@app.get("/api/snapshots/{snap_id}")
async def get_snapshot_endpoint(snap_id: str):
    snap = await adb.get_snapshot(snap_id)
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snap

@app.delete("/api/snapshots/{snap_id}")
async def delete_snapshot_endpoint(snap_id: str, user: dict = Depends(get_current_user)):
    await adb.delete_snapshot(snap_id, user["username"])
    return {"status": "deleted"}


# ─── Admin ────────────────────────────────────────────────────────────────────

@app.get("/api/admin/users")
async def admin_get_users(admin: dict = Depends(require_admin)):
    rows = await adb.get_all_users()
    return {"users": [{"id": r[0], "username": r[1], "role": r[2], "mfa_enabled": bool(r[3])} for r in rows]}

class AddUserRequest(BaseModel):
    username: str
    password: str
    role: str

@app.post("/api/admin/users")
async def admin_add_user(data: AddUserRequest, admin: dict = Depends(require_admin)):
    ok = await adb.add_user(data.username, data.password, data.role)
    if not ok:
        raise HTTPException(status_code=400, detail="Username already exists")
    return {"status": "created"}

@app.delete("/api/admin/users/{username}")
async def admin_delete_user(username: str, admin: dict = Depends(require_admin)):
    ok = await adb.delete_user(username)
    if not ok:
        raise HTTPException(status_code=400, detail="Cannot delete last admin")
    return {"status": "deleted"}

@app.get("/api/admin/audit")
async def admin_audit(admin: dict = Depends(require_admin)):
    df = await run_in_threadpool(get_audit_trail)
    if df.empty:
        return {"entries": []}
    return {"entries": df.to_dict(orient="records")}

@app.get("/api/admin/privacy")
async def admin_privacy(admin: dict = Depends(require_admin)):
    return await adb.get_redaction_stats()


# ─── Core RAG query ───────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    prompt: str
    project: str
    username: str
    thread_id: str = "General"

def _extract_sources(nodes) -> list:
    """Build the sources list from a list of NodeWithScore objects."""
    sources = []
    seen: set[tuple] = set()
    for sn in nodes:
        meta = getattr(sn.node, 'metadata', {}) or {}
        fname = (
            meta.get("file_name") or
            meta.get("filename") or
            (meta.get("file_path", "").replace("\\", "/").split("/")[-1]) or
            "Unknown"
        )
        raw_page = meta.get("page_label") or meta.get("page")
        try:
            page = int(raw_page) if raw_page is not None else None
        except (ValueError, TypeError):
            page = None
        key = (fname, page)
        if fname and key not in seen:
            seen.add(key)
            text = getattr(sn.node, 'text', '') or ''
            sources.append({
                "file": fname,
                "page": page,
                "score": round(float(sn.score or 0), 3),
                "excerpt": text[:280].strip(),
            })
    return sources


@app.post("/api/query")
async def stream_query(data: QueryRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    safe_prompt = shield.redact_and_log(
        data.prompt, username=data.username, project=data.project, context="query"
    )

    # Resolve the actual owner so shared users query the owner's indexed data.
    owner = await adb.get_project_owner(data.project, data.username)
    if owner != data.username:
        perms = await adb.get_user_permissions(data.project, owner, data.username)
        if "documents" not in perms and "query" not in perms:
            raise HTTPException(status_code=403, detail="You don't have query permission on this workspace.")

    # NOTE: LlamaIndex calls asyncio.get_event_loop() internally — cannot run in to_thread.
    # get_query_components() returns (retriever, postprocessors, synthesizer) so we can
    # emit source citations before synthesis starts, building trust while text streams in.
    retriever, postprocessors, synthesizer = await run_in_threadpool(
        get_query_components, project_filter=data.project, username=owner
    )
    if retriever is None:
        raise HTTPException(status_code=404, detail="Workspace index not found.")

    await adb.save_chat_message(data.project, data.username, data.thread_id, "user", safe_prompt)

    async def generate_tokens():
        from llama_index.core.schema import QueryBundle
        query_bundle = QueryBundle(safe_prompt)
        full_response = ""

        # ── Phase 1: retrieve + rerank (synchronous, ~1-3 s) ─────────────────
        # HTTP 200 headers are already sent; sources arrive before any LLM token.
        nodes = []
        try:
            nodes = retriever.retrieve(safe_prompt)
            for pp in postprocessors:
                nodes = pp.postprocess_nodes(nodes, query_bundle=query_bundle)
        except Exception as e:
            print(f"⚠️  Retrieval error: {e}")

        # ── Phase 2: emit sources immediately ─────────────────────────────────
        if nodes:
            sources = _extract_sources(nodes)
            if sources:
                yield f"data: {json.dumps({'sources': sources})}\n\n"

        # ── Phase 2.5: inject Python-computed facts for quantitative questions ──
        try:
            from src.compute import enrich_context
            from llama_index.core.schema import TextNode, NodeWithScore
            node_texts = [str(n.node.get_content()) for n in nodes if n.node]
            computed = enrich_context(safe_prompt, node_texts)
            if computed:
                nodes = [NodeWithScore(node=TextNode(text=computed), score=1.0)] + nodes
        except Exception as _ce:
            print(f"⚠️  Compute enrichment skipped: {_ce}")

        # ── Phase 3: synthesize + stream tokens ───────────────────────────────
        try:
            response = synthesizer.synthesize(query=query_bundle, nodes=nodes)
        except Exception as e:
            err = f" [Synthesis error: {e}]"
            yield f"data: {json.dumps({'token': err})}\n\n"
            yield "data: [DONE]\n\n"
            return

        if not hasattr(response, 'response_gen') or response.response_gen is None:
            static_text = str(response)
            if not static_text.strip():
                static_text = "Error: The local LLM returned an empty response. Is Ollama running?"
            yield f"data: {json.dumps({'token': static_text})}\n\n"
            await adb.save_chat_message(data.project, data.username, data.thread_id, "assistant", static_text)
            background_tasks.add_task(log_query, safe_prompt, static_text)
            yield "data: [DONE]\n\n"
            return

        try:
            for token in response.response_gen:
                full_response += token
                yield f"data: {json.dumps({'token': token})}\n\n"
                await asyncio.sleep(0.01)
        except Exception:
            yield f"data: {json.dumps({'token': ' [Error generating response]'})}\n\n"

        await adb.save_chat_message(data.project, data.username, data.thread_id, "assistant", full_response)
        background_tasks.add_task(log_query, safe_prompt, full_response)
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate_tokens(), media_type="text/event-stream")


class SummaryRequest(BaseModel):
    project: str
    username: str
    prompt: str = "Provide a comprehensive summary of all documents in this workspace."

@app.post("/api/summary")
async def summarize_workspace(data: SummaryRequest, user: dict = Depends(get_current_user)):
    engine = get_query_engine(project_filter=data.project, username=data.username, mode="summary")
    if not engine:
        raise HTTPException(status_code=404, detail="Workspace index not found.")
    response = engine.query(data.prompt)
    return {"summary": str(response)}


# ─── AI thread title generation ───────────────────────────────────────────────

class TitleRequest(BaseModel):
    prompt: str

@app.post("/api/title")
async def generate_title(data: TitleRequest, user: dict = Depends(get_current_user)):
    import httpx
    from llama_index.core import Settings

    ollama_url = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
    model = getattr(Settings.llm, "model", "llama3.2:1b")

    payload = {
        "model": model,
        "system": (
            "You are a chat session title generator. "
            "Given the user's first message, reply with a short title of 3 to 5 words "
            "that captures the main topic. "
            "Rules: no quotes, no punctuation at the end, no explanation — title only."
        ),
        "prompt": f"User message: {data.prompt[:500]}\n\nTitle:",
        "stream": False,
        "options": {"num_predict": 20, "temperature": 0.3},
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(f"{ollama_url}/api/generate", json=payload)
            r.raise_for_status()
            title = r.json().get("response", "").strip()
            title = title.strip("\"'`").strip()
            title = re.sub(r"[.!?,;:]+$", "", title).strip()
            title = title[:52] if len(title) > 52 else title
            return {"title": title or "New Chat"}
    except Exception:
        return {"title": ""}


# ─── Vision query (image → Ollama vision model) ───────────────────────────────

VISION_MODEL = os.environ.get("SOVEREIGN_VISION_MODEL", "llava:7b")

class VisionRequest(BaseModel):
    image_base64: str   # data:image/...;base64,<data>  or raw base64
    prompt: str
    project: str
    username: str
    thread_id: str = "General"

@app.post("/api/vision")
async def vision_query(data: VisionRequest, user: dict = Depends(get_current_user)):
    import httpx, base64

    # Strip the data-URL prefix if present
    raw_b64 = data.image_base64
    if "," in raw_b64:
        raw_b64 = raw_b64.split(",", 1)[1]

    safe_prompt = shield.redact_and_log(
        data.prompt, username=data.username, project=data.project, context="query"
    )
    await adb.save_chat_message(data.project, data.username, data.thread_id, "user", safe_prompt)

    ollama_url = os.environ.get("OLLAMA_HOST", "http://localhost:11434")

    # Check model availability
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            tags = await client.get(f"{ollama_url}/api/tags")
            models = [m["name"] for m in tags.json().get("models", [])]
    except Exception:
        models = []

    if not any(VISION_MODEL in m for m in models):
        msg = (
            f"No vision model found. Run:  ollama pull {VISION_MODEL}\n\n"
            f"Available models: {', '.join(models) or 'none'}"
        )
        save_chat_message(data.project, data.username, data.thread_id, "assistant", msg)
        return JSONResponse({"response": msg})

    payload = {
        "model": VISION_MODEL,
        "prompt": safe_prompt,
        "images": [raw_b64],
        "stream": False,
    }

    async def generate():
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                r = await client.post(f"{ollama_url}/api/generate", json=payload)
                r.raise_for_status()
                text = r.json().get("response", "").strip()
                if not text:
                    text = "The vision model returned an empty response."
        except Exception as e:
            text = f"Vision model error: {e}"
        await adb.save_chat_message(data.project, data.username, data.thread_id, "assistant", text)
        yield f"data: {json.dumps({'token': text})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
