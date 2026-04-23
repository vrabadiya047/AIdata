"use client";

import { useState, useEffect, useRef } from "react";
import { X, Upload, FileText, Image, Trash2, RefreshCw, AlertCircle } from "lucide-react";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".gif", ".webp"]);

function fileIcon(name: string) {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTS.has(ext) ? Image : FileText;
}

interface DocumentPanelProps {
  activeProject: string;
  onClose: () => void;
}

export default function DocumentPanel({ activeProject, onClose }: DocumentPanelProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [indexing, setIndexing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function loadFiles() {
    if (!activeProject) return;
    try {
      const res = await fetch(`/api/files?project=${encodeURIComponent(activeProject)}`);
      const data = await res.json();
      setFiles(data.files ?? []);
    } catch {
      setFiles([]);
    }
  }

  useEffect(() => { loadFiles(); }, [activeProject]);

  async function uploadFiles(fileList: FileList) {
    if (!fileList.length) return;
    if (!activeProject) { setError("Please select a workspace first."); return; }
    setUploading(true);
    setError("");
    setIndexing(false);

    for (const file of Array.from(fileList)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("project", activeProject);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Upload failed");
      }
    }
    setUploading(false);
    setIndexing(true);
    setTimeout(() => setIndexing(false), 3000);
    await loadFiles();
  }

  async function deleteFile(filename: string) {
    await fetch("/api/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, project: activeProject }),
    });
    await loadFiles();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "flex-end",
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "440px", height: "100%",
          background: "var(--surface)", borderLeft: "1px solid var(--b2)",
          display: "flex", flexDirection: "column",
          boxShadow: "-8px 0 40px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--b1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--t1)" }}>Documents</div>
            <div className="font-mono" style={{ fontSize: "9px", color: "var(--t3)", letterSpacing: "0.08em", marginTop: "3px" }}>
              {activeProject || "NO WORKSPACE SELECTED"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", padding: "4px", borderRadius: "6px" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? "var(--amber)" : "var(--b2)"}`,
              borderRadius: "12px",
              padding: "32px 20px",
              textAlign: "center",
              cursor: "pointer",
              background: dragging ? "rgba(245,158,11,0.05)" : "var(--raised)",
              transition: "all 0.2s ease",
            }}
          >
            <Upload size={24} style={{ color: dragging ? "var(--amber)" : "var(--t3)", margin: "0 auto 12px", display: "block" }} />
            <div style={{ fontSize: "14px", color: "var(--t2)", marginBottom: "4px" }}>
              {uploading ? "Uploading..." : "Drop files here or click to browse"}
            </div>
            <div className="font-mono" style={{ fontSize: "10px", color: "var(--t3)", letterSpacing: "0.06em" }}>
              PDF · TXT · CSV · DOCX · PNG · JPG · TIFF
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.txt,.csv,.docx,.doc,.png,.jpg,.jpeg,.bmp,.tiff,.tif,.gif,.webp"
              style={{ display: "none" }}
              onChange={(e) => e.target.files && uploadFiles(e.target.files)}
            />
          </div>

          {/* Index status */}
          {indexing && (
            <div style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "10px 14px", borderRadius: "8px",
              background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.15)",
              fontSize: "12px", color: "var(--cyan)",
            }}>
              <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} />
              Rebuilding index…
            </div>
          )}

          {error && (
            <div style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "10px 14px", borderRadius: "8px",
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
              fontSize: "12px", color: "#f87171",
            }}>
              <AlertCircle size={13} />
              {error}
            </div>
          )}

          {/* File list */}
          {files.length > 0 && (
            <div>
              <div className="font-mono" style={{ fontSize: "9px", color: "var(--t3)", letterSpacing: "0.12em", marginBottom: "10px" }}>
                INDEXED FILES — {files.length}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {files.map((f) => {
                  const Icon = fileIcon(f);
                  return (
                    <div key={f} style={{
                      display: "flex", alignItems: "center", gap: "10px",
                      padding: "10px 12px", borderRadius: "8px",
                      background: "var(--raised)", border: "1px solid var(--b1)",
                    }}>
                      <Icon size={13} style={{ color: "var(--amber)", flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: "13px", color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f}
                      </span>
                      <button
                        onClick={() => deleteFile(f)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", padding: "2px", borderRadius: "4px" }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {files.length === 0 && !uploading && (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ fontSize: "13px", color: "var(--t3)" }}>No documents indexed yet.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
