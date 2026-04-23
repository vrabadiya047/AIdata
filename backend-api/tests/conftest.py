"""
Conftest — runs before any test file is imported.
1. Stubs heavy ML packages using a proper types.ModuleType subclass so Python's
   import system treats them as valid packages (no 'is not a package' errors).
2. Redirects DB / file paths to an isolated temp directory.
3. Provides session-scoped TestClient fixtures.
"""
import sys
import os
import types
import tempfile
import pytest
from unittest.mock import MagicMock


# ── Module stub class ─────────────────────────────────────────────────────────
class _StubModule(types.ModuleType):
    """Acts as both a real package (has __path__) and a MagicMock for attribute access."""
    __path__ = []  # required for Python's import system to treat it as a package

    def __getattr__(self, name):
        value = MagicMock(name=f"{self.__name__}.{name}")
        object.__setattr__(self, name, value)
        return value


def _stub(dotted_name: str) -> _StubModule:
    if dotted_name not in sys.modules:
        sys.modules[dotted_name] = _StubModule(dotted_name)
    return sys.modules[dotted_name]  # type: ignore[return-value]


# ── Stub every ML submodule path that engine.py / config.py import ────────────
for _path in [
    "llama_index",
    "llama_index.core",
    "llama_index.core.settings",
    "llama_index.core.schema",
    "llama_index.core.readers",
    "llama_index.core.readers.base",
    "llama_index.core.storage",
    "llama_index.core.storage.storage_context",
    "llama_index.core.retrievers",
    "llama_index.core.query_engine",
    "llama_index.core.indices",
    "llama_index.core.indices.vector_store",
    "llama_index.core.vector_stores",
    "llama_index.llms",
    "llama_index.llms.ollama",
    "llama_index.embeddings",
    "llama_index.embeddings.huggingface",
    "llama_index.retrievers",
    "llama_index.retrievers.bm25",
    "llama_index.readers",
    "llama_index.readers.file",
    "llama_index.postprocessor",
    "llama_index.postprocessor.sbert_rerank",
    "llama_index.postprocessor.flag_embedding_reranker",
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


# ── Isolated temp workspace — set BEFORE config.py is ever imported ───────────
_TMPDIR = tempfile.mkdtemp(prefix="sovereign_test_")
os.environ["SOVEREIGN_DB_PATH"]     = os.path.join(_TMPDIR, "test.db")
os.environ["SOVEREIGN_LOG_DIR"]     = _TMPDIR
os.environ["SOVEREIGN_DATA_DIR"]    = os.path.join(_TMPDIR, "data")
os.environ["SOVEREIGN_STORAGE_DIR"] = os.path.join(_TMPDIR, "storage")
os.makedirs(os.environ["SOVEREIGN_DATA_DIR"],    exist_ok=True)
os.makedirs(os.environ["SOVEREIGN_STORAGE_DIR"], exist_ok=True)


# ── Fixtures ──────────────────────────────────────────────────────────────────
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def client():
    """Unauthenticated TestClient."""
    from main import app
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture(scope="session")
def auth_client():
    """TestClient pre-logged-in as the default admin."""
    from main import app
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.post("/api/auth/login", json={"username": "admin", "password": "Admin2026!"})
        assert r.status_code == 200, f"Admin login failed: {r.text}"
        yield c
