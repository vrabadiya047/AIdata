"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { Search, X, Network, Info, ZoomIn, RotateCcw } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GNode {
  id: string;
  name: string;
  type: string;
  connections: number;
  // injected by force-graph at runtime
  x?: number;
  y?: number;
  z?: number;
}

interface GLink {
  source: string | GNode;
  target: string | GNode;
  relation: string;
}

interface GraphData {
  nodes: GNode[];
  links: GLink[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  Person:         "#22d3ee",
  Organization:   "#a78bfa",
  Location:       "#34d399",
  Material:       "#f59e0b",
  Project:        "#f87171",
  Product:        "#fb923c",
  Equipment:      "#60a5fa",
  Date:           "#94a3b8",
  Event:          "#e879f9",
  Concept:        "#4ade80",
  Entity:         "#6b7280",
};

function nodeColor(type: string): string {
  return TYPE_COLORS[type] ?? "#6b7280";
}

function nodeSize(n: GNode): number {
  return 3 + Math.min(Math.sqrt(n.connections) * 2.5, 14);
}

function nodeId(n: string | GNode): string {
  return typeof n === "string" ? n : n.id;
}

function nodeName(n: string | GNode, nodes: GNode[]): string {
  if (typeof n === "string") return nodes.find(x => x.id === n)?.name ?? n;
  return n.name;
}

// ── Dynamic import (Three.js cannot run on server) ────────────────────────────

const ForceGraph3D = dynamic(
  () => import("react-force-graph-3d").then(m => m.default),
  {
    ssr: false,
    loading: () => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#f59e0b", gap: "10px", fontFamily: "monospace", fontSize: "13px" }}>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f59e0b", animation: "pulse 1s ease-in-out infinite" }} />
        Initialising 3D engine…
      </div>
    ),
  }
);

// ── Sub-components ────────────────────────────────────────────────────────────

function Legend({ types }: { types: string[] }) {
  if (types.length === 0) return null;
  return (
    <div style={{
      position: "absolute", bottom: "24px", left: "20px", zIndex: 10,
      background: "rgba(10,10,20,0.85)", backdropFilter: "blur(8px)",
      border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px",
      padding: "10px 14px", display: "flex", flexDirection: "column", gap: "6px",
    }}>
      <span style={{ fontSize: "9px", letterSpacing: "0.15em", color: "rgba(255,255,255,0.35)", fontFamily: "monospace", textTransform: "uppercase" }}>
        Entity Types
      </span>
      {types.map(t => (
        <div key={t} style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: nodeColor(t), boxShadow: `0 0 6px ${nodeColor(t)}88`, flexShrink: 0 }} />
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.65)", fontFamily: "monospace" }}>{t}</span>
        </div>
      ))}
    </div>
  );
}

function StatsBar({ nodes, links, search, onSearch, onReset }: {
  nodes: number; links: number;
  search: string; onSearch: (v: string) => void;
  onReset: () => void;
}) {
  return (
    <div style={{
      position: "absolute", top: "16px", left: "50%", transform: "translateX(-50%)",
      zIndex: 10, display: "flex", alignItems: "center", gap: "10px",
      background: "rgba(10,10,20,0.9)", backdropFilter: "blur(12px)",
      border: "1px solid rgba(255,255,255,0.08)", borderRadius: "40px",
      padding: "7px 14px",
    }}>
      {/* Search */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <Search size={12} style={{ color: "rgba(255,255,255,0.4)" }} />
        <input
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Search nodes…"
          style={{
            background: "transparent", border: "none", outline: "none",
            color: "#fff", fontSize: "12px", fontFamily: "monospace",
            width: "140px", caretColor: "#f59e0b",
          }}
        />
        {search && (
          <button onClick={() => onSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", padding: 0, display: "flex" }}>
            <X size={10} />
          </button>
        )}
      </div>

      <div style={{ width: "1px", height: "16px", background: "rgba(255,255,255,0.1)" }} />

      {/* Stats */}
      <div style={{ display: "flex", gap: "12px" }}>
        {[["Nodes", nodes], ["Edges", links]].map(([label, val]) => (
          <div key={String(label)} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#f59e0b", fontFamily: "monospace" }}>{val}</div>
            <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.35)", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "monospace" }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ width: "1px", height: "16px", background: "rgba(255,255,255,0.1)" }} />

      <button
        onClick={onReset}
        title="Reset camera"
        style={{
          background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)",
          display: "flex", alignItems: "center", gap: "4px", fontSize: "11px",
          fontFamily: "monospace", padding: "2px 4px", borderRadius: "4px",
          transition: "color 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.color = "#f59e0b")}
        onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
      >
        <RotateCcw size={11} />
        Reset
      </button>
    </div>
  );
}

function NodePanel({ node, links, nodes, onClose, onNavigate }: {
  node: GNode;
  links: GLink[];
  nodes: GNode[];
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const color = nodeColor(node.type);

  const connections = links
    .filter(l => nodeId(l.source) === node.id || nodeId(l.target) === node.id)
    .map(l => {
      const isSource = nodeId(l.source) === node.id;
      const otherId  = isSource ? nodeId(l.target) : nodeId(l.source);
      const other    = nodes.find(n => n.id === otherId);
      return { relation: l.relation, node: other, direction: isSource ? "→" : "←" };
    })
    .filter(c => c.node);

  return (
    <div style={{
      position: "absolute", top: "16px", right: "16px", bottom: "16px",
      width: "280px", zIndex: 20,
      background: "rgba(8,8,16,0.95)", backdropFilter: "blur(16px)",
      border: `1px solid ${color}44`, borderRadius: "14px",
      display: "flex", flexDirection: "column", overflow: "hidden",
      boxShadow: `0 0 40px ${color}22`,
      animation: "fade-up 0.2s ease",
    }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "5px",
              padding: "2px 8px", borderRadius: "4px",
              background: `${color}22`, border: `1px solid ${color}44`,
              marginBottom: "6px",
            }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
              <span style={{ fontSize: "9px", color, fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {node.type}
              </span>
            </div>
            <div style={{
              fontSize: "16px", fontWeight: 700, color: "#fff",
              lineHeight: 1.3, wordBreak: "break-word",
            }}>
              {node.name}
            </div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontFamily: "monospace", marginTop: "4px" }}>
              {node.connections} connection{node.connections !== 1 ? "s" : ""}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "6px", cursor: "pointer", color: "rgba(255,255,255,0.5)",
            padding: "4px", display: "flex", flexShrink: 0,
          }}>
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Connections list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
        {connections.length === 0 ? (
          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", textAlign: "center", paddingTop: "24px", fontFamily: "monospace" }}>
            No connections
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ fontSize: "9px", letterSpacing: "0.15em", color: "rgba(255,255,255,0.3)", fontFamily: "monospace", textTransform: "uppercase", marginBottom: "6px" }}>
              Relationships
            </div>
            {connections.map((c, i) => (
              <button
                key={i}
                onClick={() => c.node && onNavigate(c.node.id)}
                style={{
                  width: "100%", textAlign: "left", background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px",
                  padding: "8px 10px", cursor: "pointer",
                  transition: "all 0.15s ease", display: "flex", flexDirection: "column", gap: "3px",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.07)";
                  e.currentTarget.style.borderColor = `${nodeColor(c.node!.type)}44`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: nodeColor(c.node!.type), flexShrink: 0 }} />
                  <span style={{ fontSize: "12px", color: "#fff", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.node!.name}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", paddingLeft: "10px" }}>
                  <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>{c.direction}</span>
                  <span style={{ fontSize: "9px", color: `${color}cc`, fontFamily: "monospace", letterSpacing: "0.05em" }}>{c.relation}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ enabled, project }: { enabled: boolean; project: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: "100%", gap: "16px", textAlign: "center", padding: "40px",
    }}>
      <div style={{
        width: "72px", height: "72px", borderRadius: "20px",
        background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Network size={30} style={{ color: "#f59e0b", opacity: 0.6 }} />
      </div>
      {!enabled ? (
        <>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>
            Graph not enabled
          </div>
          <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.35)", maxWidth: "320px", lineHeight: 1.6, fontFamily: "monospace" }}>
            Set <code style={{ color: "#f59e0b" }}>SOVEREIGN_GRAPH_ENABLED=1</code> and
            ensure Neo4j is running, then re-index your documents.
          </div>
        </>
      ) : !project ? (
        <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)" }}>Select a workspace to view its knowledge graph.</div>
      ) : (
        <>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>No graph data yet</div>
          <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.35)", maxWidth: "320px", lineHeight: 1.6 }}>
            Upload and index documents in <strong style={{ color: "rgba(255,255,255,0.6)" }}>{project}</strong> to build the knowledge graph.
            Entities and relationships are extracted automatically during indexing.
          </div>
        </>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function KnowledgeGraph({ project }: { project: string }) {
  const fgRef = useRef<any>(null);

  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [enabled,   setEnabled]   = useState(true);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [selected,  setSelected]  = useState<GNode | null>(null);
  const [hovered,   setHovered]   = useState<GNode | null>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure container
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(([e]) => {
      setDimensions({ w: e.contentRect.width, h: e.contentRect.height });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Fetch graph
  useEffect(() => {
    if (!project) { setLoading(false); return; }
    setLoading(true);
    fetch(`/api/graph?project=${encodeURIComponent(project)}`)
      .then(r => r.json())
      .then(data => {
        setEnabled(data.enabled ?? true);
        setGraphData({ nodes: data.nodes ?? [], links: data.edges ?? [] });
        setLoading(false);
      })
      .catch(() => { setLoading(false); });
  }, [project]);

  // Zoom to fit on load
  useEffect(() => {
    if (!loading && graphData.nodes.length > 0) {
      setTimeout(() => fgRef.current?.zoomToFit(800, 80), 400);
    }
  }, [loading, graphData.nodes.length]);

  // Filter nodes by search
  const visibleData = search.trim()
    ? {
        nodes: graphData.nodes.map(n => ({
          ...n,
          _dim: !n.name.toLowerCase().includes(search.toLowerCase()),
        })),
        links: graphData.links,
      }
    : graphData;

  const entityTypes = [...new Set(graphData.nodes.map(n => n.type))].sort();

  const handleNodeClick = useCallback((node: object) => {
    setSelected(node as GNode);
  }, []);

  const handleNodeHover = useCallback((node: object | null) => {
    setHovered(node ? (node as GNode) : null);
    if (typeof document !== "undefined") {
      document.body.style.cursor = node ? "pointer" : "default";
    }
  }, []);

  const handleNavigate = useCallback((id: string) => {
    const target = graphData.nodes.find(n => n.id === id);
    if (target) {
      setSelected(target);
      if (fgRef.current && target.x !== undefined) {
        fgRef.current.cameraPosition(
          { x: target.x, y: target.y, z: (target.z ?? 0) + 120 },
          { x: target.x, y: target.y, z: target.z ?? 0 },
          600,
        );
      }
    }
  }, [graphData.nodes]);

  const handleReset = useCallback(() => {
    setSelected(null);
    setSearch("");
    fgRef.current?.zoomToFit(600, 80);
  }, []);

  const showEmpty = !loading && (!enabled || graphData.nodes.length === 0);

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", height: "100%", background: "#050508", overflow: "hidden" }}
    >
      {/* Ambient background gradient */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at 30% 20%, rgba(245,158,11,0.04) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(34,211,238,0.03) 0%, transparent 50%)",
      }} />

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: "10px", color: "#f59e0b", fontFamily: "monospace", fontSize: "13px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f59e0b", animation: "pulse 1s ease-in-out infinite" }} />
          Loading knowledge graph…
        </div>
      ) : showEmpty ? (
        <EmptyState enabled={enabled} project={project} />
      ) : (
        <>
          <StatsBar
            nodes={graphData.nodes.length}
            links={graphData.links.length}
            search={search}
            onSearch={setSearch}
            onReset={handleReset}
          />

          <ForceGraph3D
            ref={fgRef}
            width={dimensions.w}
            height={dimensions.h}
            graphData={visibleData}
            backgroundColor="#050508"
            showNavInfo={false}
            // Nodes
            nodeLabel={(n: object) => `<div style="background:rgba(0,0,0,0.8);border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:5px 9px;font-family:monospace;font-size:12px;color:#fff">${(n as GNode).name}<br/><span style="color:${nodeColor((n as GNode).type)};font-size:10px">${(n as GNode).type}</span></div>`}
            nodeColor={(n: object) => {
              const node = n as GNode & { _dim?: boolean };
              if (search && node._dim) return "rgba(255,255,255,0.08)";
              if (selected?.id === node.id) return "#fff";
              return nodeColor(node.type);
            }}
            nodeVal={(n: object) => nodeSize(n as GNode) ** 1.4}
            nodeOpacity={0.92}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            // Links
            linkColor={() => "rgba(255,255,255,0.12)"}
            linkWidth={1}
            linkOpacity={0.5}
            linkLabel={(l: object) => {
              const link = l as GLink;
              return `<div style="background:rgba(0,0,0,0.8);border:1px solid rgba(255,255,255,0.12);border-radius:4px;padding:3px 7px;font-family:monospace;font-size:10px;color:rgba(255,255,255,0.7)">${link.relation}</div>`;
            }}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={1.5}
            linkDirectionalParticleSpeed={0.004}
            linkDirectionalParticleColor={() => "rgba(245,158,11,0.6)"}
          />

          <Legend types={entityTypes} />

          {/* Hover label */}
          {hovered && !selected && (
            <div style={{
              position: "absolute", bottom: "24px", right: "20px", zIndex: 10,
              background: "rgba(10,10,20,0.9)", backdropFilter: "blur(8px)",
              border: `1px solid ${nodeColor(hovered.type)}44`,
              borderRadius: "8px", padding: "8px 12px",
            }}>
              <div style={{ fontSize: "13px", color: "#fff", fontWeight: 600 }}>{hovered.name}</div>
              <div style={{ fontSize: "10px", color: nodeColor(hovered.type), fontFamily: "monospace", marginTop: "2px" }}>
                {hovered.type} · {hovered.connections} connections
              </div>
            </div>
          )}

          {/* Node info panel */}
          {selected && (
            <NodePanel
              node={selected}
              links={graphData.links}
              nodes={graphData.nodes}
              onClose={() => setSelected(null)}
              onNavigate={handleNavigate}
            />
          )}

          {/* Tip */}
          {graphData.nodes.length > 0 && !selected && (
            <div style={{
              position: "absolute", bottom: "24px", right: "20px", zIndex: 5,
              display: "flex", alignItems: "center", gap: "5px",
              color: "rgba(255,255,255,0.2)", fontSize: "10px", fontFamily: "monospace",
            }}>
              <Info size={9} />
              Click a node to explore · Drag to rotate · Scroll to zoom
            </div>
          )}
        </>
      )}
    </div>
  );
}
