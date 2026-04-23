# src/engine.py
import os
import re
import traceback

if os.environ.get("SOVEREIGN_OFFLINE_MODE") == "1":
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    os.environ.setdefault("HF_DATASETS_OFFLINE", "1")
    os.environ.setdefault("HF_HUB_OFFLINE", "1")

from llama_index.core import (
    VectorStoreIndex, SimpleDirectoryReader, StorageContext, PromptTemplate,
)
from llama_index.core.query_engine import RetrieverQueryEngine
from llama_index.core.vector_stores import MetadataFilters, ExactMatchFilter
from llama_index.readers.file import PyMuPDFReader
from llama_index.postprocessor.sbert_rerank import SentenceTransformerRerank
from llama_index.vector_stores.qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue

from .privacy import shield
from .image_reader import get_image_file_extractor
from .config import DATA_DIR, QDRANT_URL, QDRANT_API_KEY, setup_ai_settings, _local_model_path, RERANK_MODEL
from src.database import get_metadata_for_file

setup_ai_settings()

SOVEREIGN_PROMPT = PromptTemplate(
    "You are a Sovereign Infrastructure AI.\n"
    "You must answer the user's question using ONLY the context provided below.\n"
    "If the context is completely empty, or if the answer cannot be found in the context, "
    "you MUST explicitly reply with: 'I cannot find the answer to this in the currently uploaded documents.'\n"
    "Do NOT leave your response blank under any circumstances.\n"
    "---------------------\n"
    "Context:\n{context_str}\n"
    "---------------------\n"
    "Question: {query_str}\n"
    "Technical Answer:"
)

# ── Qdrant singleton ──────────────────────────────────────────────────────────
_qdrant: QdrantClient | None = None


def _qdrant_client() -> QdrantClient:
    global _qdrant
    if _qdrant is None:
        _qdrant = QdrantClient(
            url=QDRANT_URL,
            api_key=QDRANT_API_KEY or None,
            timeout=30,
        )
    return _qdrant


def _collection(username: str) -> str:
    """One Qdrant collection per user — sanitised to match Qdrant's naming rules."""
    safe = re.sub(r'[^a-zA-Z0-9_]', '_', username)
    return f"sovereign_{safe}"


def _vector_store(username: str) -> QdrantVectorStore:
    return QdrantVectorStore(
        client=_qdrant_client(),
        collection_name=_collection(username),
        stores_text=True,   # embeds text in Qdrant payload; no separate docstore needed
    )


# ── File-level helpers ────────────────────────────────────────────────────────

def safe_get_metadata(filepath):
    try:
        return get_metadata_for_file(filepath)
    except Exception:
        return {"filename": os.path.basename(filepath)}


def index_file(file_path: str, username: str, project: str):
    """Incrementally add one file's chunks to Qdrant. Called after every upload."""
    vs = _vector_store(username)
    sc = StorageContext.from_defaults(vector_store=vs)

    try:
        reader = SimpleDirectoryReader(
            input_files=[file_path],
            file_extractor={".pdf": PyMuPDFReader(), **get_image_file_extractor()},
            file_metadata=safe_get_metadata,
        )
        docs = reader.load_data()
    except Exception as e:
        print(f"⚠️  Failed to read {file_path}: {e}")
        return

    for doc in docs:
        doc.metadata["project_name"] = project
        doc.metadata["username"]     = username
        doc.set_content(shield.redact(doc.get_content()))

    if docs:
        VectorStoreIndex.from_documents(docs, storage_context=sc, show_progress=False)
        print(f"✅ Indexed {os.path.basename(file_path)} → {_collection(username)}/{project}")


def _bulk_index_directory(target_dir: str, username: str, project: str | None):
    """Index every file in a directory tree. Used for first-query / migration fallback."""
    vs = _vector_store(username)
    sc = StorageContext.from_defaults(vector_store=vs)

    try:
        reader = SimpleDirectoryReader(
            input_dir=target_dir,
            recursive=True,
            file_extractor={".pdf": PyMuPDFReader(), **get_image_file_extractor()},
            file_metadata=safe_get_metadata,
        )
        docs = reader.load_data()
    except Exception as e:
        print(f"⚠️  Bulk read failed for {target_dir}: {e}")
        return

    proj = project if project and project != "All Projects" else None
    for doc in docs:
        if proj:
            doc.metadata["project_name"] = proj
        doc.metadata["username"] = username
        doc.set_content(shield.redact(doc.get_content()))

    if docs:
        VectorStoreIndex.from_documents(docs, storage_context=sc, show_progress=False)
        print(f"✅ Bulk indexed {len(docs)} chunks from {target_dir}")


def remove_file_from_index(file_name: str, username: str, project: str):
    """Delete a file's vectors from Qdrant by metadata filter."""
    try:
        _qdrant_client().delete(
            collection_name=_collection(username),
            points_selector=Filter(must=[
                FieldCondition(key="file_name",    match=MatchValue(value=file_name)),
                FieldCondition(key="project_name", match=MatchValue(value=project)),
            ]),
        )
    except Exception as e:
        print(f"⚠️  Qdrant delete failed for {file_name}: {e}")


def rename_project_index(username: str, old_name: str, new_name: str):
    """Re-tag all of a project's vectors with the new project name (no re-embedding)."""
    try:
        _qdrant_client().set_payload(
            collection_name=_collection(username),
            payload={"project_name": new_name},
            points=Filter(must=[
                FieldCondition(key="project_name", match=MatchValue(value=old_name)),
            ]),
        )
    except Exception as e:
        print(f"⚠️  Qdrant rename failed {old_name}→{new_name}: {e}")


def delete_project_index(username: str, project: str):
    """Remove all vectors for a deleted project."""
    try:
        _qdrant_client().delete(
            collection_name=_collection(username),
            points_selector=Filter(must=[
                FieldCondition(key="project_name", match=MatchValue(value=project)),
            ]),
        )
    except Exception as e:
        print(f"⚠️  Qdrant project delete failed for {project}: {e}")


# ── Query engine ──────────────────────────────────────────────────────────────

def get_index(project_filter=None, username=None):
    if not username:
        return None, None

    client = _qdrant_client()
    coll   = _collection(username)

    # Check if Qdrant has any vectors for this project
    try:
        pf = Filter(must=[FieldCondition(key="project_name", match=MatchValue(value=project_filter))]) \
            if project_filter and project_filter != "All Projects" else None
        count = client.count(collection_name=coll, count_filter=pf, exact=False).count
    except Exception:
        count = 0

    if count == 0:
        # Fallback: bulk-index files from disk (handles first-run and migration)
        target = (os.path.join(DATA_DIR, username, project_filter)
                  if project_filter and project_filter != "All Projects"
                  else os.path.join(DATA_DIR, username))
        if not os.path.exists(target):
            return None, None
        has_files = any(
            fname for _, _, files in os.walk(target)
            for fname in files if not fname.startswith('.')
        )
        if not has_files:
            return None, None
        _bulk_index_directory(target, username, project_filter)

    vs = _vector_store(username)
    return VectorStoreIndex.from_vector_store(vs), None


def get_query_engine(streaming=True, project_filter=None, mode="chat", username=None):
    try:
        v_index, _ = get_index(project_filter, username)
        if v_index is None:
            return None

        if project_filter and project_filter != "All Projects":
            filters   = MetadataFilters(filters=[ExactMatchFilter(key="project_name", value=project_filter)])
            retriever = v_index.as_retriever(similarity_top_k=10, filters=filters)
        else:
            retriever = v_index.as_retriever(similarity_top_k=10)

        reranker = SentenceTransformerRerank(model=_local_model_path(RERANK_MODEL), top_n=3)

        kwargs = dict(streaming=streaming, node_postprocessors=[reranker])
        if mode == "summary":
            kwargs["response_mode"] = "tree_summarize"

        engine = RetrieverQueryEngine.from_args(retriever=retriever, **kwargs)
        engine.update_prompts({"response_synthesizer:text_qa_template": SOVEREIGN_PROMPT})
        return engine

    except Exception as e:
        print(f"\n❌ FATAL ENGINE ERROR: {e}")
        traceback.print_exc()
        return None
