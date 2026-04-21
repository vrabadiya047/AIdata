# src/engine.py
import os
import traceback

# Set SOVEREIGN_OFFLINE_MODE=1 to block all outbound HuggingFace model downloads.
# Models must be pre-cached locally before enabling this in production.
if os.environ.get("SOVEREIGN_OFFLINE_MODE") == "1":
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    os.environ.setdefault("HF_DATASETS_OFFLINE", "1")
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
from llama_index.core import (
    VectorStoreIndex, SimpleDirectoryReader, SummaryIndex,
    StorageContext, load_index_from_storage, PromptTemplate
)
from llama_index.core.retrievers import QueryFusionRetriever
from llama_index.core.query_engine import RetrieverQueryEngine
from llama_index.retrievers.bm25 import BM25Retriever
from llama_index.core.vector_stores import MetadataFilters, ExactMatchFilter
from llama_index.readers.file import PyMuPDFReader
from llama_index.postprocessor.sbert_rerank import SentenceTransformerRerank
from .privacy import shield

from .config import STORAGE_DIR, DATA_DIR, setup_ai_settings
from src.database import get_metadata_for_file

setup_ai_settings()

SOVEREIGN_PROMPT = PromptTemplate(
    "You are a Sovereign Infrastructure AI.\n"
    "You must answer the user's question using ONLY the context provided below.\n"
    "If the context is completely empty, or if the answer cannot be found in the context, you MUST explicitly reply with: 'I cannot find the answer to this in the currently uploaded documents.'\n"
    "Do NOT leave your response blank under any circumstances.\n"
    "---------------------\n"
    "Context:\n{context_str}\n"
    "---------------------\n"
    "Question: {query_str}\n"
    "Technical Answer:"
)

def safe_get_metadata(filepath):
    """A forgiving wrapper that doesn't crash if a file was manually dragged/dropped."""
    try:
        return get_metadata_for_file(filepath)
    except Exception:
        # If the file isn't in SQLite, just return basic metadata
        return {"filename": os.path.basename(filepath)}

def get_index(project_filter=None, username=None):
    """Loads targeted data from the user's PRIVATE physical subfolders."""
    if not username:
        return None, None 

    if project_filter and project_filter != "All Projects":
        target_data_dir = os.path.join(DATA_DIR, username, project_filter)
        target_storage_dir = os.path.join(STORAGE_DIR, username, project_filter)
    else:
        target_data_dir = os.path.join(DATA_DIR, username)
        target_storage_dir = os.path.join(STORAGE_DIR, username, "all_projects")

    if not os.path.exists(target_data_dir): 
        os.makedirs(target_data_dir, exist_ok=True)

    if os.path.exists(target_storage_dir) and os.listdir(target_storage_dir):
        print(f"📦 Loading existing Vector Index from {target_storage_dir}...")
        sc = StorageContext.from_defaults(persist_dir=target_storage_dir)
        v_index = load_index_from_storage(sc)
        s_dir = os.path.join(target_storage_dir, "summary")
        s_index = load_index_from_storage(StorageContext.from_defaults(persist_dir=s_dir)) if os.path.exists(s_dir) else None
        return v_index, s_index
    
    if not os.path.exists(target_data_dir) or not os.listdir(target_data_dir): 
        print(f"⚠️ No documents found in {target_data_dir}")
        return None, None
        
    print(f"⚙️ Building new Vector Index for {target_data_dir}... This may take a moment.")
    
    # Load documents safely
    reader = SimpleDirectoryReader(
        input_dir=target_data_dir, 
        recursive=True, 
        file_extractor={".pdf": PyMuPDFReader()}, 
        file_metadata=safe_get_metadata  # <-- Fixed: Uses our safe wrapper
    )
    documents = reader.load_data()
    
    # NEW: Redact PII using the official LlamaIndex setter
    for doc in documents:
        safe_text = shield.redact(doc.get_content())
        doc.set_content(safe_text)
    
    v_index = VectorStoreIndex.from_documents(documents)
    v_index.storage_context.persist(persist_dir=target_storage_dir)
    
    s_index = SummaryIndex.from_documents(documents)
    s_index.storage_context.persist(persist_dir=os.path.join(target_storage_dir, "summary"))
    
    print(f"✅ Successfully built and saved Vector Index to {target_storage_dir}")
    return v_index, s_index

def get_query_engine(streaming=True, project_filter=None, mode="chat", username=None):
    """Creates the appropriate engine locked to the user's identity."""
    try:
        res = get_index(project_filter, username)
        if not res or res[0] is None: 
            return None
            
        v_index, s_index = res

        if mode == "summary":
            return s_index.as_query_engine(streaming=streaming, response_mode="tree_summarize")

        # 🛠️ THE FIX: Removed strict MetadataFilters. 
        # Since folders are physically isolated, all documents in this index belong to the project.
        vector_retriever = v_index.as_retriever(similarity_top_k=10)
        all_nodes = list(v_index.docstore.docs.values())
        
        if not all_nodes: 
            return v_index.as_query_engine(streaming=streaming)

        bm25 = BM25Retriever.from_defaults(nodes=all_nodes, similarity_top_k=10)
        hybrid = QueryFusionRetriever([vector_retriever, bm25], similarity_top_k=10, num_queries=3, mode="reciprocal_rerank")
        reranker = SentenceTransformerRerank(model="BAAI/bge-reranker-base", top_n=3)

        engine = RetrieverQueryEngine.from_args(retriever=hybrid, streaming=streaming, node_postprocessors=[reranker])
        engine.update_prompts({"response_synthesizer:text_qa_template": SOVEREIGN_PROMPT})
        
        return engine
    except Exception as e:
        import traceback
        print(f"\n❌ FATAL ENGINE ERROR: {e}")
        traceback.print_exc()
        return None