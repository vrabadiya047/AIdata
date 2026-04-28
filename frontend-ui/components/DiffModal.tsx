"use client";

import { useState, useEffect } from "react";
import { X, GitCompare, FileText, Loader, Tag } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface FileInfo {
  name: string;
  version?: string | null;
  upload_date?: string | null;
}

interface DiffModalProps {
  project: string;
  onClose: () => void;
}

export default function DiffModal({ project, onClose }: DiffModalProps) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [fileA, setFileA] = useState("");
  const [fileB, setFileB] = useState("");
  const [result, setResult] = useState("");
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState("");

  // Version editing
  const [editingVersion, setEditingVersion] = useState<string | null>(null);
  const [versionDraft, setVersionDraft] = useState("");

  useEffect(() => { fetchFiles(); }, [project]);

  async function fetchFiles() {
    const res = await fetch(`/api/files?project=${encodeURIComponent(project)}`);
    if (res.ok) {
      const data = await res.json();
      setFiles((data.files as FileInfo[]) ?? []);
    }
  }

  async function saveVersion(fname: string) {
    await fetch(`/api/files/${encodeURIComponent(fname)}/version`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project, version: versionDraft }),
    });
    setEditingVersion(null);
    setVersionDraft("");
    await fetchFiles();
  }

  async function compare() {
    if (!fileA || !fileB || fileA === fileB) return;
    setResult("");
    setError("");
    setComparing(true);

    const response = await fetch("/api/diff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_a: fileA, file_b: fileB, project }),
    });

    if (!response.ok) {
      const text = await response.text();
      let detail = text;
      try { detail = JSON.parse(text).detail ?? text; } catch (_) {}
      setError(detail);
      setComparing(false);
      return;
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      for (const line of decoder.decode(value).split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") break;
        try {
          const parsed = JSON.parse(data);
          if (parsed.token !== undefined) {
            accumulated += parsed.token;
            setResult(accumulated);
          }
        } catch (_) {}
      }
    }
    setComparing(false);
  }

  function fileLabel(f: FileInfo) {
    const ver = f.version ? ` · v${f.version}` : "";
    return `${f.name}${ver}`;
  }

  const canCompare = fileA && fileB && fileA !== fileB && !comparing;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "680px", maxHeight: "88vh",
          background: "var(--surface)", border: "1px solid var(--b2)",
          borderRadius: "16px", overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "18px 24px", borderBottom: "1px solid var(--b1)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
            <GitCompare size={15} style={{ color: "var(--amber)" }} />
            <div>
              <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--t1)" }}>Document Compare</div>
              <div className="font-mono" style={{ fontSize: "9px", color: "var(--t3)", letterSpacing: "0.08em", marginTop: "2px" }}>
                {project}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* File list with version tags */}
          <div>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--t3)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "8px" }}>
              Files in workspace
            </div>
            {files.length === 0 ? (
              <div style={{ fontSize: "13px", color: "var(--t3)", textAlign: "center", padding: "12px" }}>No files uploaded yet</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {files.map(f => (
                  <div key={f.name} style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "7px 10px", borderRadius: "8px",
                    background: "var(--raised)", border: "1px solid var(--b1)",
                  }}>
                    <FileText size={11} style={{ color: "var(--amber)", flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: "12px", color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.name}
                    </span>
                    {editingVersion === f.name ? (
                      <>
                        <input
                          value={versionDraft}
                          onChange={e => setVersionDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveVersion(f.name); if (e.key === "Escape") setEditingVersion(null); }}
                          placeholder="e.g. v2.1"
                          autoFocus
                          style={{
                            padding: "3px 8px", borderRadius: "5px", border: "1px solid var(--amber)",
                            background: "var(--surface)", color: "var(--t1)", fontSize: "11px", width: "90px", outline: "none",
                          }}
                        />
                        <button onClick={() => saveVersion(f.name)} style={{ padding: "3px 8px", borderRadius: "5px", background: "rgba(245,158,11,0.85)", border: "none", color: "var(--void)", fontSize: "10px", fontWeight: 600, cursor: "pointer" }}>Save</button>
                        <button onClick={() => setEditingVersion(null)} style={{ padding: "3px 6px", borderRadius: "5px", background: "none", border: "1px solid var(--b2)", color: "var(--t3)", fontSize: "10px", cursor: "pointer" }}>✕</button>
                      </>
                    ) : (
                      <>
                        {f.version ? (
                          <span style={{
                            fontSize: "9px", padding: "2px 7px", borderRadius: "4px",
                            background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.35)",
                            color: "var(--amber)", display: "flex", alignItems: "center", gap: "3px",
                          }}>
                            <Tag size={8} /> {f.version}
                          </span>
                        ) : (
                          <span style={{ fontSize: "9px", color: "var(--t3)" }}>no version</span>
                        )}
                        <button
                          onClick={() => { setEditingVersion(f.name); setVersionDraft(f.version ?? ""); }}
                          style={{ padding: "2px 8px", borderRadius: "5px", background: "none", border: "1px solid var(--b2)", color: "var(--t3)", fontSize: "10px", cursor: "pointer" }}
                        >
                          Tag
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* File selectors */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {(["A", "B"] as const).map(side => {
              const selected = side === "A" ? fileA : fileB;
              const setSelected = side === "A" ? setFileA : setFileB;
              return (
                <div key={side}>
                  <div style={{ fontSize: "11px", color: "var(--t3)", marginBottom: "5px", display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{
                      width: "16px", height: "16px", borderRadius: "4px", fontSize: "9px", fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: side === "A" ? "rgba(34,211,238,0.15)" : "rgba(167,139,250,0.15)",
                      color: side === "A" ? "var(--cyan)" : "#a78bfa",
                      border: `1px solid ${side === "A" ? "rgba(34,211,238,0.3)" : "rgba(167,139,250,0.3)"}`,
                    }}>{side}</span>
                    Document {side}
                  </div>
                  <select
                    value={selected}
                    onChange={e => setSelected(e.target.value)}
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: "8px",
                      background: "var(--raised)", border: `1px solid ${selected ? "var(--b2)" : "var(--b1)"}`,
                      color: selected ? "var(--t1)" : "var(--t3)", fontSize: "12px", outline: "none", cursor: "pointer",
                    }}
                  >
                    <option value="">Select file…</option>
                    {files.map(f => (
                      <option key={f.name} value={f.name}>{fileLabel(f)}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          {/* Compare button */}
          <button
            onClick={compare}
            disabled={!canCompare}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
              padding: "11px", borderRadius: "10px", border: "none", cursor: canCompare ? "pointer" : "not-allowed",
              background: canCompare ? "rgba(245,158,11,0.85)" : "var(--raised)",
              color: canCompare ? "var(--void)" : "var(--t3)",
              fontSize: "13px", fontWeight: 600, transition: "all 0.15s ease",
            }}
          >
            {comparing
              ? <><Loader size={13} style={{ animation: "spin 1s linear infinite" }} /> Analysing…</>
              : <><GitCompare size={13} /> Compare Documents</>
            }
          </button>

          {/* Error */}
          {error && (
            <div style={{
              padding: "10px 14px", borderRadius: "8px",
              background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)",
              color: "#f87171", fontSize: "12px",
            }}>
              {error}
            </div>
          )}

          {/* Streaming result */}
          {result && (
            <div style={{
              padding: "16px", borderRadius: "10px",
              background: "var(--raised)", border: "1px solid var(--b2)",
            }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--t3)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                <GitCompare size={10} />
                {comparing ? "Generating comparison…" : "Comparison result"}
                {comparing && <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--amber)", display: "inline-block", animation: "pulse 1s ease-in-out infinite" }} />}
              </div>
              <div className="ai-prose" style={{ fontSize: "13px" }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
