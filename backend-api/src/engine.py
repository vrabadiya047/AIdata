# src/engine.py
import os
import re
import traceback
from datetime import date as _date
from typing import Optional, Any, List, cast

if os.environ.get("SOVEREIGN_OFFLINE_MODE") == "1":
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    os.environ.setdefault("HF_DATASETS_OFFLINE", "1")
    os.environ.setdefault("HF_HUB_OFFLINE", "1")

from llama_index.core import (
    VectorStoreIndex, SimpleDirectoryReader, StorageContext, PromptTemplate,
)
from llama_index.core.query_engine import RetrieverQueryEngine
from llama_index.core.vector_stores import MetadataFilters, ExactMatchFilter
from .image_reader import get_image_file_extractor, OCRPDFReader
from llama_index.postprocessor.sbert_rerank import SentenceTransformerRerank
from llama_index.vector_stores.qdrant import QdrantVectorStore as _QdrantVectorStore
from pydantic import BaseModel as _PydanticBaseModel
import qdrant_client as _qc_module


# llama-index-vector-stores-qdrant 0.1.4 (only version installable on Python 3.14)
# was built for llama-index-core < 0.11, but 0.14.x uses Pydantic v2 strictly.
# Bug: the original __init__ assigns private attrs BEFORE calling super().__init__(),
# so Pydantic v2's __pydantic_private__ re-initialization (inside super().__init__)
# wipes those values. Fix: call Pydantic's BaseModel.__init__ first to set up
# __pydantic_private__, then assign private attrs safely afterward.
class QdrantVectorStore(_QdrantVectorStore):
    path: Optional[str] = None

    def __init__(
        self,
        collection_name: str,
        client: Optional[Any] = None,
        aclient: Optional[Any] = None,
        url: Optional[str] = None,
        api_key: Optional[str] = None,
        batch_size: int = 64,
        parallel: int = 1,
        max_retries: int = 3,
        client_kwargs: Optional[dict] = None,
        enable_hybrid: bool = False,
        **kwargs: Any,
    ) -> None:
        if (
            client is None
            and aclient is None
            and (url is None or api_key is None or collection_name is None)
        ):
            raise ValueError("Must provide either a QdrantClient instance or a url and api_key.")

        # Step 1: let Pydantic set up __pydantic_private__ by calling BaseModel.__init__.
        # We skip _QdrantVectorStore.__init__ entirely because it sets private attrs
        # before super().__init__(), which Pydantic v2 then wipes.
        _PydanticBaseModel.__init__(
            self,
            collection_name=collection_name,
            path=None,
            url=url,
            api_key=api_key,
            batch_size=batch_size,
            parallel=parallel,
            max_retries=max_retries,
            client_kwargs=client_kwargs or {},
            enable_hybrid=enable_hybrid,
        )

        # Step 2: now __pydantic_private__ exists, assign private attrs safely.
        if client is None and aclient is None:
            kw = client_kwargs or {}
            self._client = _qc_module.QdrantClient(url=url, api_key=api_key, **kw)
            self._aclient = _qc_module.AsyncQdrantClient(url=url, api_key=api_key, **kw)
        else:
            self._client = client
            self._aclient = aclient

        self._collection_initialized = (
            self._collection_exists(collection_name) if self._client is not None else False
        )

    def query(self, query: Any, **kwargs: Any) -> Any:
        # qdrant-client >= 1.14 removed `client.search()`; replaced by `query_points()`.
        # The parent class (0.1.4) still calls the removed method, so we override it here.
        query_embedding = cast(List[float], query.query_embedding)
        qdrant_filters = kwargs.get("qdrant_filters")
        query_filter = (
            qdrant_filters if qdrant_filters is not None
            else self._build_query_filter(query)
        )
        response = self._client.query_points(
            collection_name=self.collection_name,
            query=query_embedding,
            limit=query.similarity_top_k,
            query_filter=query_filter,
            with_payload=True,
        )
        return self.parse_to_query_result(response.points)


from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue

from .privacy import shield
from llama_index.core import Settings
from .config import (
    DATA_DIR, QDRANT_URL, QDRANT_API_KEY, setup_ai_settings, _local_model_path,
    RERANK_MODEL, CHUNK_SIZE, CHUNK_OVERLAP, SEMANTIC_CHUNK_THRESHOLD,
)
from src.database import get_metadata_for_file

setup_ai_settings()


def _build_node_parser():
    """Return a SemanticSplitterNodeParser, falling back to SentenceSplitter.

    Semantic chunking finds natural topic boundaries via embedding similarity
    instead of cutting at a fixed token count.  This avoids splitting formulas,
    code blocks, or multi-sentence definitions mid-thought.
    """
    try:
        from llama_index.core.node_parser import SemanticSplitterNodeParser
        return SemanticSplitterNodeParser(
            buffer_size=1,
            breakpoint_percentile_threshold=SEMANTIC_CHUNK_THRESHOLD,
            embed_model=Settings.embed_model,
        )
    except Exception:
        from llama_index.core.node_parser import SentenceSplitter
        return SentenceSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)

_TODAY = _date.today().strftime("%B %d, %Y")

SOVEREIGN_PROMPT = PromptTemplate(
    "You are a Sovereign Infrastructure AI assistant. Today's date is " + _TODAY + ".\n"
    "Use the context below to answer the user's question. "
    "You may explain, summarize, describe, calculate, or elaborate on information found in the context.\n"
    "When asked about ages, durations, or time differences, calculate them using today's date.\n"
    "Only reply with 'I cannot find the answer to this in the currently uploaded documents.' "
    "if the context is completely empty or contains nothing relevant to the question.\n"
    "Do NOT use that phrase if the context contains any relevant information — use it instead.\n"
    "---------------------\n"
    "Context:\n{context_str}\n"
    "---------------------\n"
    "Question: {query_str}\n"
    "Answer:"
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
            file_extractor={".pdf": OCRPDFReader(), **get_image_file_extractor()},
            file_metadata=safe_get_metadata,
        )
        docs = reader.load_data()
    except Exception as e:
        print(f"⚠️  Failed to read {file_path}: {e}")
        return

    for doc in docs:
        doc.metadata["project_name"] = project
        doc.metadata["username"]     = username
        doc.set_content(shield.redact_and_log(
            doc.get_content(), username=username, project=project, context="document"
        ))

    if docs:
        nodes = _build_node_parser().get_nodes_from_documents(docs)
        VectorStoreIndex(nodes, storage_context=sc, show_progress=False)
        print(f"✅ Indexed {os.path.basename(file_path)} ({len(nodes)} chunks) → {_collection(username)}/{project}")


def _bulk_index_directory(target_dir: str, username: str, project: str | None):
    """Index every file in a directory tree. Used for first-query / migration fallback."""
    vs = _vector_store(username)
    sc = StorageContext.from_defaults(vector_store=vs)

    try:
        reader = SimpleDirectoryReader(
            input_dir=target_dir,
            recursive=True,
            file_extractor={".pdf": OCRPDFReader(), **get_image_file_extractor()},
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
        nodes = _build_node_parser().get_nodes_from_documents(docs)
        VectorStoreIndex(nodes, storage_context=sc, show_progress=False)
        print(f"✅ Bulk indexed {len(nodes)} chunks from {target_dir}")


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


def get_query_components(project_filter=None, username=None):
    """Return (retriever, postprocessors, synthesizer) for two-phase streaming.

    Separating retrieval from synthesis lets the caller emit source citations as
    soon as Qdrant + reranker finish (phase 1) and then stream LLM tokens while
    the user is already reading which documents were consulted (phase 2).

    Returns (None, None, None) when no index exists for the user/project.
    """
    engine = get_query_engine(streaming=True, project_filter=project_filter, username=username)
    if engine is None:
        return None, None, None
    # .retriever is the public property; _node_postprocessors and
    # _response_synthesizer are private but stable across llama-index-core 0.10+.
    return engine.retriever, engine._node_postprocessors, engine._response_synthesizer
