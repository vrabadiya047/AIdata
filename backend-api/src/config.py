# src/config.py
import os

def _local_model_path(model_name: str) -> str:
    """
    Returns the local HuggingFace cache path if the model is already downloaded.
    Falls back to the original model name so it auto-downloads on first run.

    This makes the app fully offline after the first internet-connected startup —
    no env vars, no HF_HUB_OFFLINE flag, no network calls ever needed again.
    """
    folder = "models--" + model_name.replace("/", "--")
    cache_dir = os.environ.get(
        "HF_HUB_CACHE",
        os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub"),
    )
    # Prefer refs/main to get the exact snapshot hash
    refs_main = os.path.join(cache_dir, folder, "refs", "main")
    if os.path.isfile(refs_main):
        with open(refs_main) as f:
            commit = f.read().strip()
        path = os.path.join(cache_dir, folder, "snapshots", commit)
        if os.path.isdir(path) and os.listdir(path):
            return path
    # Fallback: pick any non-empty snapshot
    snapshots_dir = os.path.join(cache_dir, folder, "snapshots")
    if os.path.isdir(snapshots_dir):
        for commit in sorted(os.listdir(snapshots_dir)):
            path = os.path.join(snapshots_dir, commit)
            if os.path.isdir(path) and os.listdir(path):
                return path
    return model_name  # not cached yet → download on first run


EMBED_MODEL  = "sentence-transformers/all-MiniLM-L6-v2"
RERANK_MODEL = "BAAI/bge-reranker-base"

from llama_index.core import Settings
from llama_index.llms.ollama import Ollama
from llama_index.embeddings.huggingface import HuggingFaceEmbedding

BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR   = os.path.join(BASE_DIR, "data")
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
LOG_DIR    = os.path.join(BASE_DIR, "logs")
AUDIT_LOG  = os.path.join(LOG_DIR, "sovereign_audit_log.json")
DB_PATH    = os.path.join(LOG_DIR, "sovereign_projects.db")

CHUNK_SIZE    = 512
CHUNK_OVERLAP = 50

PROJECT_CATEGORIES = ["General Specs", "Main Roads WA", "Metronet", "Private Development"]

def setup_ai_settings():
    embed_path = _local_model_path(EMBED_MODEL)
    Settings.llm = Ollama(model="llama3.2:1b", request_timeout=600.0)
    Settings.embed_model = HuggingFaceEmbedding(model_name=embed_path)
    Settings.chunk_size    = CHUNK_SIZE
    Settings.chunk_overlap = CHUNK_OVERLAP
