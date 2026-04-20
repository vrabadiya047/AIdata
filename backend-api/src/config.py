# src/config.py
import os
from llama_index.core import Settings
from llama_index.llms.ollama import Ollama
from llama_index.embeddings.huggingface import HuggingFaceEmbedding

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
LOG_DIR = os.path.join(BASE_DIR, "logs")
AUDIT_LOG = os.path.join(LOG_DIR, "sovereign_audit_log.json")
DB_PATH = os.path.join(LOG_DIR, "sovereign_projects.db")

# PROFESSIONAL TUNING
CHUNK_SIZE = 512
CHUNK_OVERLAP = 50

PROJECT_CATEGORIES = ["General Specs", "Main Roads WA", "Metronet", "Private Development"]

def setup_ai_settings():
    """Sets up local LLM and high-precision embedding."""
    # Increased timeout for 1B model stability
    Settings.llm = Ollama(model="llama3.2:1b", request_timeout=600.0)
    Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")
    Settings.chunk_size = CHUNK_SIZE
    Settings.chunk_overlap = CHUNK_OVERLAP