"use client";

import { useState } from "react";
import { X, Camera, Copy, Check, Trash2, ExternalLink, FileText, Loader } from "lucide-react";

interface SnapshotModalProps {
  project: string;
  threadId: string;
  onClose: () => void;
}

export default function SnapshotModal({ project, threadId, onClose }: SnapshotModalProps) {
  const [title, setTitle] = useState(threadId);
  const [snapId, setSnapId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const snapUrl = snapId ? `${window.location.origin}/snapshot/${snapId}` : "";

  async function createSnapshot() {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, thread_id: threadId, title: title.trim() || threadId }),
      });
      if (!res.ok) { setError("Failed to create snapshot."); return; }
      const { id } = await res.json();
      setSnapId(id);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(snapUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "460px", background: "var(--surface)", border: "1px solid var(--b2)", borderRadius: "16px", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--b1)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Camera size={16} style={{ color: "var(--amber)" }} />
            </div>
            <div>
              <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--t1)" }}>Create snapshot</div>
              <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "2px", fontFamily: "monospace" }}>{project} · {threadId}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", padding: "2px" }}><X size={16} /></button>
        </div>

        <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>

          {!snapId ? (
            <>
              {/* Info */}
              <div style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: "10px", padding: "12px 14px" }}>
                <p style={{ fontSize: "13px", color: "var(--t2)", lineHeight: 1.6, margin: 0 }}>
                  A snapshot captures this thread's messages and document list at this moment. The link is <strong style={{ color: "var(--t1)" }}>read-only</strong> and can be shared with anyone — no login required.
                </p>
              </div>

              {/* Title input */}
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--t3)", marginBottom: "6px", fontFamily: "monospace", letterSpacing: "0.06em", textTransform: "uppercase" }}>Snapshot title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createSnapshot()}
                  placeholder={threadId}
                  style={{ width: "100%", padding: "9px 12px", background: "var(--raised)", border: "1px solid var(--b2)", borderRadius: "8px", color: "var(--t1)", fontSize: "13px", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              {error && <div style={{ fontSize: "12px", color: "#f87171", padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: "7px", border: "1px solid rgba(239,68,68,0.2)" }}>{error}</div>}

              <button
                onClick={createSnapshot}
                disabled={creating}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "10px", background: creating ? "rgba(245,158,11,0.4)" : "rgba(245,158,11,0.88)", border: "none", borderRadius: "10px", color: "var(--void)", fontSize: "13px", fontWeight: 600, cursor: creating ? "not-allowed" : "pointer" }}
              >
                {creating ? <Loader size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Camera size={14} />}
                {creating ? "Capturing..." : "Create snapshot"}
              </button>
            </>
          ) : (
            <>
              {/* Success */}
              <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: "10px", padding: "14px", display: "flex", alignItems: "center", gap: "10px" }}>
                <Check size={16} style={{ color: "var(--green)", flexShrink: 0 }} />
                <span style={{ fontSize: "13px", color: "var(--green)", fontWeight: 500 }}>Snapshot created successfully</span>
              </div>

              {/* Link box */}
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--t3)", marginBottom: "6px", fontFamily: "monospace", letterSpacing: "0.06em", textTransform: "uppercase" }}>Share link</label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <div style={{ flex: 1, padding: "9px 12px", background: "var(--raised)", border: "1px solid var(--b2)", borderRadius: "8px", fontSize: "12px", color: "var(--t2)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {snapUrl}
                  </div>
                  <button
                    onClick={copyLink}
                    title="Copy link"
                    style={{ display: "flex", alignItems: "center", gap: "5px", padding: "9px 14px", background: copied ? "rgba(16,185,129,0.15)" : "var(--raised)", border: `1px solid ${copied ? "rgba(16,185,129,0.3)" : "var(--b2)"}`, borderRadius: "8px", color: copied ? "var(--green)" : "var(--t2)", fontSize: "12px", cursor: "pointer", flexShrink: 0, transition: "all 0.2s" }}
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Open link */}
              <a
                href={snapUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "10px", background: "transparent", border: "1px solid var(--b2)", borderRadius: "10px", color: "var(--t2)", fontSize: "13px", fontWeight: 500, textDecoration: "none", transition: "all 0.15s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--raised)"; (e.currentTarget as HTMLElement).style.color = "var(--t1)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--t2)"; }}
              >
                <ExternalLink size={13} />
                Open snapshot in new tab
              </a>

              {/* Document count note */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "var(--raised)", borderRadius: "8px", border: "1px solid var(--b1)" }}>
                <FileText size={12} style={{ color: "var(--cyan)", flexShrink: 0 }} />
                <span style={{ fontSize: "12px", color: "var(--t3)" }}>
                  This link works without login and shows a frozen read-only view.
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
