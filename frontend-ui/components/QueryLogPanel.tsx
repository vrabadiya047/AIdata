"use client";

import { useState, useEffect } from "react";
import { X, Terminal, ChevronDown, ChevronUp } from "lucide-react";

interface LogEntry {
  timestamp: string;
  query: string;
  response: string;
  faithful: boolean | null;
  relevant: boolean | null;
}

export default function QueryLogPanel({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/query-log")
      .then((r) => r.json())
      .then((d) => {
        setEntries(((d.entries as LogEntry[]) || []).reverse());
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function fmt(ts: string) {
    try { return new Date(ts).toLocaleString(); } catch { return ts; }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "700px", maxWidth: "95vw", maxHeight: "80vh",
          background: "var(--surface)", border: "1px solid var(--b1)",
          borderRadius: "14px", display: "flex", flexDirection: "column",
          overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid var(--b1)", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Terminal size={15} style={{ color: "var(--amber)" }} />
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--t1)" }}>Query Log</span>
            {!loading && (
              <span className="font-mono" style={{ fontSize: "10px", color: "var(--t3)" }}>
                {entries.length} entries
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", padding: "4px", borderRadius: "4px" }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "48px", color: "var(--t3)", fontSize: "13px" }}>
              Loading...
            </div>
          ) : entries.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px", color: "var(--t3)", fontSize: "13px" }}>
              No queries logged yet.
            </div>
          ) : (
            entries.map((e, i) => (
              <div
                key={i}
                style={{
                  padding: "12px 14px", borderRadius: "8px",
                  background: "var(--raised)", border: "1px solid var(--b1)",
                  marginBottom: "6px", cursor: "pointer",
                  transition: "border-color 0.15s ease",
                }}
                onClick={() => setExpanded(expanded === i ? null : i)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span className="font-mono" style={{ fontSize: "10px", color: "var(--t3)" }}>
                    {fmt(e.timestamp)}
                  </span>
                  {expanded === i ? (
                    <ChevronUp size={12} style={{ color: "var(--t3)" }} />
                  ) : (
                    <ChevronDown size={12} style={{ color: "var(--t3)" }} />
                  )}
                </div>
                <div style={{
                  fontSize: "12.5px", color: "var(--t2)",
                  overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: expanded === i ? "normal" : "nowrap",
                  lineHeight: 1.5,
                }}>
                  <span style={{ color: "var(--amber)", fontWeight: 600 }}>Q: </span>
                  {e.query}
                </div>
                {expanded === i && (
                  <div style={{
                    marginTop: "10px", paddingTop: "10px",
                    borderTop: "1px solid var(--b1)",
                    fontSize: "12px", color: "var(--t2)", lineHeight: 1.6,
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    <span style={{ color: "var(--cyan)", fontWeight: 600 }}>A: </span>
                    {e.response}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
