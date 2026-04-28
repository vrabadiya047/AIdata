# src/graph.py
"""
GraphRAG — Property Graph Indexing over Neo4j.

Disabled by default. Enable with:  SOVEREIGN_GRAPH_ENABLED=1

During indexing (index_file / _bulk_index_directory):
  An LLM extracts (subject, relation, object) triples from each chunk and
  stores them as labelled nodes/edges in Neo4j alongside the Qdrant vectors.

During querying (get_query_components):
  A HybridGraphVectorRetriever runs vector search (Qdrant) AND graph traversal
  (Neo4j) in parallel, merges the results by score, and passes the combined
  context to the synthesizer.  This lets the LLM answer relationship queries
  like "How does the safety protocol affect the ventilation system?" that
  pure vector similarity cannot resolve.

Graceful fallback: every function is wrapped so that any Neo4j / import
failure silently falls back to vector-only RAG without breaking the request.
"""
import os
from typing import Optional

_ENABLED  = os.environ.get("SOVEREIGN_GRAPH_ENABLED", "0") == "1"
_NEO4J_URL  = os.environ.get("NEO4J_URL",      "bolt://localhost:7687")
_NEO4J_USER = os.environ.get("NEO4J_USERNAME",  "neo4j")
_NEO4J_PASS = os.environ.get("NEO4J_PASSWORD",  "sovereign2026")

_store = None   # singleton Neo4jPropertyGraphStore


def is_enabled() -> bool:
    return _ENABLED


def _get_store():
    """Return the shared Neo4j graph store, creating it on first call."""
    global _store
    if _store is not None:
        return _store
    if not _ENABLED:
        return None
    try:
        from llama_index.graph_stores.neo4j import Neo4jPropertyGraphStore
        _store = Neo4jPropertyGraphStore(
            url=_NEO4J_URL,
            username=_NEO4J_USER,
            password=_NEO4J_PASS,
        )
        print(f"✅ Neo4j graph store connected at {_NEO4J_URL}")
        return _store
    except Exception as e:
        print(f"⚠️  Neo4j unavailable — graph features disabled: {e}")
        return None


# ── Indexing ──────────────────────────────────────────────────────────────────

def index_nodes_in_graph(nodes: list, username: str, project: str) -> None:
    """Extract entities/relations from nodes and upsert them into Neo4j.

    Called inside the background indexing worker after vector indexing, so
    the extra LLM calls (one per chunk) do not delay the upload response.
    Failures are logged and silently ignored — vector RAG still works.
    """
    if not _ENABLED or not nodes:
        return
    gs = _get_store()
    if gs is None:
        return
    try:
        import asyncio
        from llama_index.core import PropertyGraphIndex, StorageContext, Settings
        from llama_index.core.indices.property_graph import SimpleLLMPathExtractor

        # Tag every node so graph results can be filtered by user/project later.
        for node in nodes:
            node.metadata.setdefault("username",     username)
            node.metadata.setdefault("project_name", project)

        extractor = SimpleLLMPathExtractor(
            llm=Settings.llm,
            max_paths_per_chunk=5,
            num_workers=1,
        )
        sc = StorageContext.from_defaults(property_graph_store=gs)

        # The worker runs in a plain thread with no event loop.
        # llama_index's graph indexing requires one, so create a fresh loop
        # for this call and tear it down when done.
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            PropertyGraphIndex(
                nodes=nodes,
                kg_extractors=[extractor],
                storage_context=sc,
                show_progress=False,
            )
        finally:
            loop.close()
            asyncio.set_event_loop(None)

        print(f"✅ Graph: {len(nodes)} nodes extracted → Neo4j ({username}/{project})")
    except Exception as e:
        print(f"⚠️  Graph indexing skipped: {e}")


def delete_project_from_graph(username: str, project: str) -> None:
    """Remove all graph nodes/edges belonging to a deleted project."""
    if not _ENABLED:
        return
    gs = _get_store()
    if gs is None:
        return
    try:
        # Neo4j Cypher: delete nodes tagged with this user+project
        gs._driver.execute_query(
            "MATCH (n {username: $u, project_name: $p}) DETACH DELETE n",
            u=username, p=project,
        )
    except Exception as e:
        print(f"⚠️  Graph project delete failed: {e}")


# ── Retrieval ─────────────────────────────────────────────────────────────────

def get_graph_retriever(username: str, project: str):
    """Return a graph retriever for the user/project, or None if unavailable.

    Combines:
    • LLMSynonymRetriever — expands query keywords to synonyms, finds matching
      entity nodes in the graph, and returns their text.
    • VectorContextRetriever — embeds the query, finds similar entity nodes by
      vector similarity, and returns surrounding graph context.
    """
    if not _ENABLED:
        return None
    gs = _get_store()
    if gs is None:
        return None
    try:
        from llama_index.core import PropertyGraphIndex, StorageContext, Settings
        from llama_index.core.indices.property_graph import (
            LLMSynonymRetriever,
            VectorContextRetriever,
        )
        sc = StorageContext.from_defaults(property_graph_store=gs)
        index = PropertyGraphIndex.from_existing(
            property_graph_store=gs,
            storage_context=sc,
        )
        return _FilteredGraphRetriever(
            index=index,
            graph_store=gs,
            username=username,
            project=project,
        )
    except Exception as e:
        print(f"⚠️  Graph retriever unavailable: {e}")
        return None


class _FilteredGraphRetriever:
    """Wraps LlamaIndex graph sub-retrievers and filters results to the requesting user."""

    def __init__(self, index, graph_store, username: str, project: str):
        from llama_index.core import Settings
        from llama_index.core.indices.property_graph import (
            LLMSynonymRetriever, VectorContextRetriever,
        )
        self._username = username
        self._project  = project
        self._retriever = index.as_retriever(
            sub_retrievers=[
                LLMSynonymRetriever(
                    graph_store,
                    include_text=True,
                    llm=Settings.llm,
                ),
                VectorContextRetriever(
                    graph_store,
                    include_text=True,
                    embed_model=Settings.embed_model,
                    similarity_top_k=5,
                ),
            ]
        )

    def retrieve(self, query: str) -> list:
        try:
            nodes = self._retriever.retrieve(query)
        except Exception as e:
            print(f"⚠️  Graph retrieval error: {e}")
            return []
        # Filter to this user's nodes only (Neo4j is shared across all users).
        return [
            n for n in nodes
            if (getattr(n.node, 'metadata', {}) or {}).get("username") in (self._username, None)
        ]


# ── Graph data export (used by /api/graph endpoint) ──────────────────────────

def get_project_graph(username: str, project: str) -> dict:
    """Return all nodes and edges for a project's knowledge graph.

    Returns {"enabled": bool, "nodes": [...], "edges": [...]}
    """
    if not _ENABLED:
        return {"enabled": False, "nodes": [], "edges": []}
    gs = _get_store()
    if gs is None:
        return {"enabled": False, "nodes": [], "edges": []}
    try:
        driver = getattr(gs, "_driver", None) or getattr(gs, "driver", None)
        if driver is None:
            return {"enabled": True, "nodes": [], "edges": [], "error": "Neo4j driver not accessible"}

        records, _, _ = driver.execute_query(
            """
            MATCH (n)-[r]->(m)
            WHERE (n.project_name = $project OR $project = '')
              AND n.id IS NOT NULL AND m.id IS NOT NULL
              AND n <> m
            RETURN
              n.id                           AS sid,
              coalesce(n.name, n.id)         AS sname,
              coalesce(n.label, 'Entity')    AS stype,
              type(r)                        AS relation,
              m.id                           AS tid,
              coalesce(m.name, m.id)         AS tname,
              coalesce(m.label, 'Entity')    AS ttype
            LIMIT 500
            """,
            project=project,
        )

        nodes_map: dict = {}
        edges: list = []

        for rec in records:
            sid, tid = rec["sid"], rec["tid"]
            if not sid or not tid or sid == tid:
                continue
            if sid not in nodes_map:
                nodes_map[sid] = {
                    "id": sid,
                    "name": rec["sname"] or sid,
                    "type": rec["stype"] or "Entity",
                    "connections": 0,
                }
            if tid not in nodes_map:
                nodes_map[tid] = {
                    "id": tid,
                    "name": rec["tname"] or tid,
                    "type": rec["ttype"] or "Entity",
                    "connections": 0,
                }
            nodes_map[sid]["connections"] += 1
            nodes_map[tid]["connections"] += 1
            rel = (rec["relation"] or "RELATED_TO").replace("_", " ").title()
            edges.append({"source": sid, "target": tid, "relation": rel})

        return {"enabled": True, "nodes": list(nodes_map.values()), "edges": edges}
    except Exception as exc:
        print(f"⚠️  Graph export failed: {exc}")
        return {"enabled": True, "nodes": [], "edges": [], "error": str(exc)}


# ── Hybrid retriever (used by engine.get_query_components) ───────────────────

class HybridGraphVectorRetriever:
    """Merges Qdrant vector results with Neo4j graph results.

    Vector search answers "find me chunks about X".
    Graph traversal answers "show me how X relates to Y across documents".
    Together they give the LLM enough context to reason about multi-hop
    relationships in large engineering document sets.
    """

    def __init__(self, vector_retriever, graph_retriever, top_k: int = 15):
        self._vec   = vector_retriever
        self._graph = graph_retriever
        self._top_k = top_k

    def retrieve(self, query: str) -> list:
        results = []
        seen: set = set()

        # Vector results (primary — always present)
        for node in self._vec.retrieve(query):
            key = getattr(node, 'node_id', id(node))
            if key not in seen:
                seen.add(key)
                results.append(node)

        # Graph results (supplementary — may be absent)
        if self._graph:
            for node in self._graph.retrieve(query):
                key = getattr(node, 'node_id', id(node))
                if key not in seen:
                    seen.add(key)
                    results.append(node)

        # Re-sort by score descending and cap at top_k
        results.sort(key=lambda n: getattr(n, 'score', 0) or 0, reverse=True)
        return results[: self._top_k]
