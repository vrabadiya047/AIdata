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
import shutil

from src.engine import get_query_engine
from src.database import (
    get_all_projects, get_chat_history, save_chat_message,
    add_custom_project, delete_project_data, get_project_threads,
    save_file_project, delete_file_metadata,
    set_project_visibility, share_project_with_user, unshare_project_from_user,
    get_project_shares, share_project_with_group, unshare_project_from_group,
    create_group, delete_group, add_group_member, remove_group_member, get_user_groups,
    rename_project, rename_thread, delete_thread,
)
from src.manager import (
    handle_create_project, handle_delete_project,
    handle_file_upload, handle_delete_file, list_files_in_project
)
from src.privacy import shield
from src.logger import log_query
from src.auth import verify_user, add_user, delete_user, get_all_users, update_user_password, check_and_create_default_admin
from src.analytics import get_audit_trail
from src.config import DATA_DIR, STORAGE_DIR, LOG_DIR

_DEFAULT_SECRET = "sovereign-dev-secret-2026-change-in-prod"
JWT_SECRET = os.environ.get("SOVEREIGN_JWT_SECRET", _DEFAULT_SECRET)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 8


@asynccontextmanager
async def lifespan(_: FastAPI):
    if JWT_SECRET == _DEFAULT_SECRET:
        print(
            "\n⚠️  SOVEREIGN SECURITY WARNING ──────────────────────────────\n"
            "   JWT secret is set to the insecure development default.\n"
            "   Set SOVEREIGN_JWT_SECRET env var before production deployment.\n"
            "─────────────────────────────────────────────────────────────\n"
        )
    check_and_create_default_admin()
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

def invalidate_project_index(username: str, project: str):
    """Deletes the cached vector index so it is rebuilt on the next query."""
    storage_path = os.path.join(STORAGE_DIR, username, project)
    if os.path.exists(storage_path):
        shutil.rmtree(storage_path)
    # Also clear the all-projects aggregate index so stale data doesn't linger
    all_idx = os.path.join(STORAGE_DIR, username, "all_projects")
    if os.path.exists(all_idx):
        shutil.rmtree(all_idx)


# ─── Auth helpers ────────────────────────────────────────────────────────────

def create_token(username: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    return jwt.encode({"sub": username, "role": role, "exp": expire}, JWT_SECRET, algorithm=JWT_ALGORITHM)

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
    valid, role, requires_change = verify_user(data.username, data.password)
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(data.username, role)
    response = JSONResponse({"username": data.username, "role": role, "requires_change": requires_change})
    response.set_cookie(
        key="sovereign_session",
        value=token,
        httponly=True,
        max_age=JWT_EXPIRE_HOURS * 3600,
        samesite="lax",
        path="/",
    )
    return response

@app.post("/api/auth/logout")
async def logout():
    response = JSONResponse({"status": "logged out"})
    response.delete_cookie("sovereign_session", path="/")
    return response

@app.get("/api/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

class ChangePasswordRequest(BaseModel):
    new_password: str

@app.post("/api/auth/change-password")
async def change_password(data: ChangePasswordRequest, user: dict = Depends(get_current_user)):
    update_user_password(user["username"], data.new_password)
    return {"status": "password updated"}


# ─── Workspaces ───────────────────────────────────────────────────────────────

@app.get("/api/workspaces/{username}")
async def get_workspaces(username: str, user: dict = Depends(get_current_user)):
    if user["username"] != username and user["role"] != "Admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    projects = get_all_projects(username)
    return {"workspaces": projects}

class ProjectRequest(BaseModel):
    name: str
    username: str

@app.post("/api/projects")
async def create_project(data: ProjectRequest, user: dict = Depends(get_current_user)):
    if user["username"] != data.username and user["role"] != "Admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    ok = handle_create_project(data.name, data.username)
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid project name")
    return {"status": "created", "name": data.name}

@app.delete("/api/projects/{name}")
async def delete_project(name: str, user: dict = Depends(get_current_user)):
    handle_delete_project(name, user["username"])
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
        os.rename(old_data, new_data)
    # Wipe both the per-project and the all-projects aggregate index
    invalidate_project_index(username, name)
    rename_project(name, new_name, username)
    return {"status": "renamed", "name": new_name}

class VisibilityRequest(BaseModel):
    visibility: str  # 'private' | 'public' | 'shared'

@app.put("/api/projects/{name}/visibility")
async def update_visibility(name: str, data: VisibilityRequest, user: dict = Depends(get_current_user)):
    if data.visibility not in ("private", "public", "shared"):
        raise HTTPException(status_code=400, detail="Invalid visibility")
    set_project_visibility(name, user["username"], data.visibility)
    return {"status": "updated"}

class ShareUserRequest(BaseModel):
    shared_with: str

@app.post("/api/projects/{name}/share")
async def share_with_user(name: str, data: ShareUserRequest, user: dict = Depends(get_current_user)):
    share_project_with_user(name, user["username"], data.shared_with)
    return {"status": "shared"}

@app.delete("/api/projects/{name}/share/{target}")
async def unshare_from_user(name: str, target: str, user: dict = Depends(get_current_user)):
    unshare_project_from_user(name, user["username"], target)
    return {"status": "unshared"}

@app.get("/api/projects/{name}/shares")
async def get_shares(name: str, user: dict = Depends(get_current_user)):
    users = get_project_shares(name, user["username"])
    return {"shared_with": users}

class ShareGroupRequest(BaseModel):
    group_name: str
    group_owner: str

@app.post("/api/projects/{name}/share-group")
async def share_with_group(name: str, data: ShareGroupRequest, user: dict = Depends(get_current_user)):
    share_project_with_group(name, user["username"], data.group_name, data.group_owner)
    return {"status": "shared"}

@app.delete("/api/projects/{name}/share-group/{group_owner}/{group_name}")
async def unshare_from_group(name: str, group_owner: str, group_name: str, user: dict = Depends(get_current_user)):
    unshare_project_from_group(name, user["username"], group_name, group_owner)
    return {"status": "unshared"}


# ─── Groups ───────────────────────────────────────────────────────────────────

class GroupRequest(BaseModel):
    name: str

@app.get("/api/groups")
async def list_groups(user: dict = Depends(get_current_user)):
    groups = get_user_groups(user["username"])
    return {"groups": groups}

@app.post("/api/groups")
async def create_new_group(data: GroupRequest, user: dict = Depends(get_current_user)):
    create_group(data.name, user["username"])
    return {"status": "created"}

@app.delete("/api/groups/{name}")
async def remove_group(name: str, user: dict = Depends(get_current_user)):
    delete_group(name, user["username"])
    return {"status": "deleted"}

class GroupMemberRequest(BaseModel):
    username: str

@app.post("/api/groups/{name}/members")
async def add_member(name: str, data: GroupMemberRequest, user: dict = Depends(get_current_user)):
    add_group_member(name, user["username"], data.username)
    return {"status": "added"}

@app.delete("/api/groups/{name}/members/{member}")
async def remove_member(name: str, member: str, user: dict = Depends(get_current_user)):
    remove_group_member(name, user["username"], member)
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

    save_file_project(clean_name, project, username)
    invalidate_project_index(username, project)

    return {"status": "uploaded", "file": clean_name}

@app.delete("/api/files/{filename}")
async def delete_file(filename: str, project: str, user: dict = Depends(get_current_user)):
    handle_delete_file(project, filename, user["username"])
    invalidate_project_index(user["username"], project)
    return {"status": "deleted"}

@app.get("/api/files")
async def list_files(project: str, user: dict = Depends(get_current_user)):
    files = list_files_in_project(project, user["username"])
    return {"files": files}


# ─── Threads ──────────────────────────────────────────────────────────────────

@app.get("/api/threads")
async def get_threads(project: str, user: dict = Depends(get_current_user)):
    threads = get_project_threads(project, user["username"])
    return {"threads": threads}

class RenameThreadRequest(BaseModel):
    project: str
    old_id: str
    new_id: str

@app.put("/api/threads")
async def rename_thread_endpoint(data: RenameThreadRequest, user: dict = Depends(get_current_user)):
    rename_thread(data.project, user["username"], data.old_id, data.new_id)
    return {"status": "renamed"}

@app.delete("/api/threads")
async def delete_thread_endpoint(project: str, thread_id: str, user: dict = Depends(get_current_user)):
    delete_thread(project, user["username"], thread_id)
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
    history = get_chat_history(project, username, thread_id)
    return {"history": history}


# ─── Admin ────────────────────────────────────────────────────────────────────

@app.get("/api/admin/users")
async def admin_get_users(admin: dict = Depends(require_admin)):
    rows = get_all_users()
    return {"users": [{"id": r[0], "username": r[1], "role": r[2]} for r in rows]}

class AddUserRequest(BaseModel):
    username: str
    password: str
    role: str

@app.post("/api/admin/users")
async def admin_add_user(data: AddUserRequest, admin: dict = Depends(require_admin)):
    ok = add_user(data.username, data.password, data.role)
    if not ok:
        raise HTTPException(status_code=400, detail="Username already exists")
    return {"status": "created"}

@app.delete("/api/admin/users/{username}")
async def admin_delete_user(username: str, admin: dict = Depends(require_admin)):
    ok = delete_user(username)
    if not ok:
        raise HTTPException(status_code=400, detail="Cannot delete last admin")
    return {"status": "deleted"}

@app.get("/api/admin/audit")
async def admin_audit(admin: dict = Depends(require_admin)):
    df = get_audit_trail()
    if df.empty:
        return {"entries": []}
    return {"entries": df.to_dict(orient="records")}


# ─── Core RAG query ───────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    prompt: str
    project: str
    username: str
    thread_id: str = "General"

@app.post("/api/query")
async def stream_query(data: QueryRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    safe_prompt = shield.redact(data.prompt)

    # NOTE: LlamaIndex calls asyncio.get_event_loop() internally — cannot run in to_thread
    engine = get_query_engine(project_filter=data.project, username=data.username)

    if not engine:
        raise HTTPException(status_code=404, detail="Workspace index not found.")

    save_chat_message(data.project, data.username, data.thread_id, "user", safe_prompt)

    response = engine.query(safe_prompt)

    async def generate_tokens():
        full_response = ""

        # Emit source citations before any tokens so the UI can show them immediately
        if hasattr(response, 'source_nodes') and response.source_nodes:
            sources = []
            seen: set[str] = set()
            for sn in response.source_nodes:
                meta = getattr(sn.node, 'metadata', {}) or {}
                fname = (
                    meta.get("file_name") or
                    meta.get("filename") or
                    (meta.get("file_path", "").replace("\\", "/").split("/")[-1]) or
                    "Unknown"
                )
                if fname and fname not in seen:
                    seen.add(fname)
                    sources.append({
                        "file": fname,
                        "score": round(float(sn.score or 0), 3),
                    })
            if sources:
                yield f"data: {json.dumps({'sources': sources})}\n\n"

        if not hasattr(response, 'response_gen') or response.response_gen is None:
            static_text = str(response)
            if not static_text.strip():
                static_text = "Error: The local LLM returned an empty response. Is Ollama running?"
            yield f"data: {json.dumps({'token': static_text})}\n\n"
            save_chat_message(data.project, data.username, data.thread_id, "assistant", static_text)
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

        save_chat_message(data.project, data.username, data.thread_id, "assistant", full_response)
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
