"""
Conftest — runs before any test file is imported.

1. Stubs all heavy ML + Qdrant packages so they never need to be installed.
2. Redirects file paths (DATA_DIR / LOG_DIR) to an isolated temp directory.
3. Points DATABASE_URL at a real PostgreSQL test database.
4. Provides session-scoped TestClient fixtures (unauthenticated + admin).
"""
import sys
import os
import types
import tempfile
import pytest
from unittest.mock import MagicMock


# ── Module stub helper ────────────────────────────────────────────────────────
class _StubModule(types.ModuleType):
    """Behaves as a real package (has __path__) and returns MagicMock for attrs."""
    __path__ = []

    def __getattr__(self, name):
        value = MagicMock(name=f"{self.__name__}.{name}")
        object.__setattr__(self, name, value)
        return value


def _stub(dotted_name: str) -> _StubModule:
    if dotted_name not in sys.modules:
        sys.modules[dotted_name] = _StubModule(dotted_name)
    return sys.modules[dotted_name]  # type: ignore[return-value]


# ── Stub every ML / Qdrant submodule BEFORE any project import ────────────────
for _path in [
    # LlamaIndex core
    "llama_index",
    "llama_index.core", "llama_index.core.settings",
    "llama_index.core.schema",
    "llama_index.core.readers", "llama_index.core.readers.base",
    "llama_index.core.storage", "llama_index.core.storage.storage_context",
    "llama_index.core.retrievers",
    "llama_index.core.query_engine",
    "llama_index.core.indices", "llama_index.core.indices.vector_store",
    "llama_index.core.vector_stores",
    # LlamaIndex extras
    "llama_index.llms", "llama_index.llms.ollama",
    "llama_index.embeddings", "llama_index.embeddings.huggingface",
    "llama_index.retrievers", "llama_index.retrievers.bm25",
    "llama_index.readers", "llama_index.readers.file",
    "llama_index.postprocessor",
    "llama_index.postprocessor.sbert_rerank",
    "llama_index.postprocessor.flag_embedding_reranker",
    "llama_index.vector_stores", "llama_index.vector_stores.qdrant",
    # Qdrant client
    "qdrant_client",
    "qdrant_client.models",
    "qdrant_client.http", "qdrant_client.http.models",
    # ML / numeric
    "sentence_transformers",
    "torch", "torch.nn",
    "transformers",
    "rank_bm25",
    "pandas",
    "fitz", "pymupdf",
    "pytesseract",
    "PIL", "PIL.Image",
]:
    _stub(_path)


# ── Temp workspace for file-system operations ─────────────────────────────────
_TMPDIR = tempfile.mkdtemp(prefix="sovereign_test_")
os.environ["SOVEREIGN_DATA_DIR"]    = os.path.join(_TMPDIR, "data")
os.environ["SOVEREIGN_LOG_DIR"]     = _TMPDIR
os.environ["SOVEREIGN_STORAGE_DIR"] = os.path.join(_TMPDIR, "storage")
os.makedirs(os.environ["SOVEREIGN_DATA_DIR"],    exist_ok=True)
os.makedirs(os.environ["SOVEREIGN_STORAGE_DIR"], exist_ok=True)

# ── PostgreSQL test database ──────────────────────────────────────────────────
# CI: DATABASE_URL is set via the GitHub Actions `env:` block.
# Local: spin up `docker-compose up postgres -d` and export the var, or
#        accept the default pointing at a local sovereign_test DB.
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql://sovereign:sovereign@localhost:5432/sovereign_test",
)
os.environ.setdefault("QDRANT_URL", "")   # never actually called in tests


# ── Database bootstrap fixture (runs once per session) ───────────────────────
@pytest.fixture(scope="session", autouse=True)
def _bootstrap_db():
    """Create schema + clean slate before the test session starts."""
    from src.database import init_db, _conn
    from src.auth import init_auth_db, check_and_create_default_admin

    init_db()
    init_auth_db()

    with _conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "TRUNCATE TABLE users, chat_history, file_metadata, custom_projects, "
            "project_shares, project_group_shares, groups, group_members, snapshots, "
            "indexing_jobs, redaction_events"
        )

    check_and_create_default_admin()
    yield


# ── TestClient fixtures ───────────────────────────────────────────────────────
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def client(_bootstrap_db):
    """Unauthenticated TestClient."""
    from main import app
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture(scope="session")
def auth_client(_bootstrap_db):
    """TestClient pre-logged-in as the default admin."""
    from main import app
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.post("/api/auth/login", json={"username": "admin", "password": "Admin2026!"})
        assert r.status_code == 200, f"Admin login failed: {r.text}"
        yield c
