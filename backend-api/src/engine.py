# src/engine.py
import os
import streamlit as st
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

# Replace this near the top of src/engine.py

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

def get_index(project_filter=None, username=None):
    """Loads targeted data from the user's PRIVATE physical subfolders."""
    if not username:
        return None, None # Security block: No user, no data.

    if project_filter and project_filter != "All Projects":
        target_data_dir = os.path.join(DATA_DIR, username, project_filter)
        target_storage_dir = os.path.join(STORAGE_DIR, username, project_filter)
    else:
        # Global view, but ONLY for this user's folders
        target_data_dir = os.path.join(DATA_DIR, username)
        target_storage_dir = os.path.join(STORAGE_DIR, username, "all_projects")

    if not os.path.exists(target_data_dir): 
        os.makedirs(target_data_dir, exist_ok=True)

    if os.path.exists(target_storage_dir) and os.listdir(target_storage_dir):
        sc = StorageContext.from_defaults(persist_dir=target_storage_dir)
        v_index = load_index_from_storage(sc)
        s_dir = os.path.join(target_storage_dir, "summary")
        s_index = load_index_from_storage(StorageContext.from_defaults(persist_dir=s_dir)) if os.path.exists(s_dir) else None
        return v_index, s_index
    
    # If no folders/files exist yet
    if not os.path.exists(target_data_dir) or not os.listdir(target_data_dir): 
        return None, None
        
    # Load documents
    reader = SimpleDirectoryReader(
        input_dir=target_data_dir, 
        recursive=True, 
        file_extractor={".pdf": PyMuPDFReader()}, 
        file_metadata=get_metadata_for_file
    )
    documents = reader.load_data()
    
    # NEW: Redact PII from every document before indexing
    for doc in documents:
        doc.text = shield.redact(doc.text)
    
    v_index = VectorStoreIndex.from_documents(documents)
    v_index.storage_context.persist(persist_dir=target_storage_dir)
    s_index = SummaryIndex.from_documents(documents)
    s_index.storage_context.persist(persist_dir=os.path.join(target_storage_dir, "summary"))
    
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

        filters = MetadataFilters(filters=[ExactMatchFilter(key="project", value=project_filter)]) if project_filter != "All Projects" else None
        
        vector_retriever = v_index.as_retriever(similarity_top_k=10, filters=filters)
        all_nodes = list(v_index.docstore.docs.values())
        filtered_nodes = [n for n in all_nodes if n.metadata.get('project') == project_filter] if project_filter != "All Projects" else all_nodes
        
        if not filtered_nodes: 
            return v_index.as_query_engine(streaming=streaming, filters=filters)

        bm25 = BM25Retriever.from_defaults(nodes=filtered_nodes, similarity_top_k=10)
        hybrid = QueryFusionRetriever([vector_retriever, bm25], similarity_top_k=10, num_queries=3, mode="reciprocal_rerank")
        reranker = SentenceTransformerRerank(model="BAAI/bge-reranker-base", top_n=3)

        engine = RetrieverQueryEngine.from_args(retriever=hybrid, streaming=streaming, node_postprocessors=[reranker])
        engine.update_prompts({"response_synthesizer:text_qa_template": SOVEREIGN_PROMPT})
        
        return engine
    except Exception as e:
        st.error(f"⚠️ Engine Error: {e}")
        return None