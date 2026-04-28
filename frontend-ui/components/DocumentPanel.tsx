"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Upload, FileText, Image, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".gif", ".webp"]);

function fileIcon(name: string) {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTS.has(ext) ? Image : FileText;
}

interface DocumentPanelProps {
  activeProject: string;
  onClose: () => void;
}

interface UploadState {
  phase: "uploading" | "indexing" | "done" | null;
  // uploading phase
  filesDone: number;
  filesTotal: number;
  filePct: number;       // 0-100 within current file (XHR upload bytes)
  // indexing phase
  jobsDone: number;
  jobsTotal: number;
}

function ProgressBar({ pct, color = "var(--amber)" }: { pct: number; color?: string }) {
  return (
    <div style={{
      height: "4px", borderRadius: "2px",
      background: "var(--raised)", overflow: "hidden",
    }}>
      <div style={{
        height: "100%", width: `${Math.min(100, Math.max(0, pct))}%`,
        background: color, borderRadius: "2px",
        transition: "width 0.3s ease",
      }} />
    </div>
  );
}

function uploadXHR(
  url: string,
  formData: FormData,
  onProgress: (pct: number) => void,
  xhrRef?: React.MutableRefObject<XMLHttpRequest | null>,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    if (xhrRef) xhrRef.current = xhr;
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload  = () => resolve(new Response(xhr.responseText, { status: xhr.status }));
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onabort = () => reject(new Error("Cancelled"));
    xhr.send(formData);
  });
}

export default function DocumentPanel({ activeProject, onClose }: DocumentPanelProps) {
  const toast = useToast();
  const [files, setFiles] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [upload, setUpload] = useState<UploadState>({
    phase: null, filesDone: 0, filesTotal: 0, filePct: 0, jobsDone: 0, jobsTotal: 0,
  });
  const inputRef  = useRef<HTMLInputElement>(null);
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobIdsRef = useRef<string[]>([]);
  const xhrRef    = useRef<XMLHttpRequest | null>(null);
  const cancelRef = useRef(false);

  async function loadFiles() {
    if (!activeProject) return;
    try {
      const res = await fetch(`/api/files?project=${encodeURIComponent(activeProject)}`);
      const data = await res.json();
      setFiles(
        (data.files ?? []).map((f: string | { name: string }) =>
          typeof f === "string" ? f : f.name
        )
      );
    } catch { setFiles([]); }
  }

  useEffect(() => { loadFiles(); }, [activeProject]);

  const pollJobs = useCallback(async () => {
    const ids = jobIdsRef.current;
    if (!ids.length) return;
    try {
      const statuses = await Promise.all(
        ids.map(id => fetch(`/api/jobs/${id}`).then(r => r.ok ? r.json() : null))
      );
      const done = statuses.filter(j => j && (j.status === "done" || j.status === "failed")).length;
      setUpload(prev => ({ ...prev, jobsDone: done }));

      if (done === ids.length) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setUpload(prev => ({ ...prev, phase: "done" }));
        await loadFiles();
        setTimeout(() => setUpload(p => ({ ...p, phase: null })), 2000);
      }
    } catch { /* ignore transient */ }
  }, []);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  function runInBackground() {
    if (jobIdsRef.current.length > 0) {
      const count = jobIdsRef.current.length;
      toast.trackInBackground(
        jobIdsRef.current,
        'Indexing complete',
        `${count} file${count !== 1 ? 's' : ''} indexed successfully.`,
      );
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    onClose();
  }

  function cancelOperation() {
    cancelRef.current = true;
    if (xhrRef.current) { xhrRef.current.abort(); xhrRef.current = null; }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    jobIdsRef.current = [];
    setUpload({ phase: null, filesDone: 0, filesTotal: 0, filePct: 0, jobsDone: 0, jobsTotal: 0 });
  }

  async function uploadFiles(fileList: FileList) {
    if (!fileList.length) return;
    if (!activeProject) { setError("Please select a workspace first."); return; }
    setError("");
    cancelRef.current = false;
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }

    const allFiles = Array.from(fileList);
    setUpload({ phase: "uploading", filesDone: 0, filesTotal: allFiles.length, filePct: 0, jobsDone: 0, jobsTotal: 0 });

    const jobIds: string[] = [];
    for (let i = 0; i < allFiles.length; i++) {
      if (cancelRef.current) break;
      const file = allFiles[i];
      const fd = new FormData();
      fd.append("file", file);
      fd.append("project", activeProject);

      setUpload(prev => ({ ...prev, filesDone: i, filePct: 0 }));

      try {
        const res = await uploadXHR("/api/upload", fd, (pct) => {
          setUpload(prev => ({ ...prev, filePct: pct }));
        }, xhrRef);
        if (cancelRef.current) break;
        if (!res.ok) {
          const d = JSON.parse(await res.text());
          setError(d.error ?? "Upload failed");
        } else {
          const d = JSON.parse(await res.text());
          if (d.job_id) jobIds.push(d.job_id);
        }
      } catch (e) {
        if (cancelRef.current) break;
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    }

    if (cancelRef.current) return;

    if (jobIds.length > 0) {
      jobIdsRef.current = jobIds;
      setUpload(prev => ({
        ...prev, phase: "indexing",
        filesDone: allFiles.length, filePct: 100,
        jobsDone: 0, jobsTotal: jobIds.length,
      }));
      pollRef.current = setInterval(pollJobs, 2000);
    } else {
      setUpload(prev => ({ ...prev, phase: "done" }));
      await loadFiles();
      setTimeout(() => setUpload(p => ({ ...p, phase: null })), 2000);
    }
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

  // ── Derived display values ──────────────────────────────────────────────
  const { phase, filesDone, filesTotal, filePct, jobsDone, jobsTotal } = upload;
  const isActive = phase === "uploading" || phase === "indexing";

  let statusLabel = "";
  let statusPct = 0;
  let statusColor = "var(--amber)";

  if (phase === "uploading") {
    // Overall upload progress: files done so far + current file fraction
    const overallPct = filesTotal > 0
      ? Math.round(((filesDone + filePct / 100) / filesTotal) * 100)
      : 0;
    statusPct = overallPct;
    statusLabel = filesTotal > 1
      ? `Uploading file ${filesDone + 1} of ${filesTotal} — ${overallPct}%`
      : `Uploading — ${filePct}%`;
    statusColor = "var(--amber)";
  } else if (phase === "indexing") {
    const pct = jobsTotal > 0 ? Math.round((jobsDone / jobsTotal) * 100) : 0;
    statusPct = pct;
    statusLabel = `Indexing — ${jobsDone} / ${jobsTotal} file${jobsTotal !== 1 ? "s" : ""} (${pct}%)`;
    statusColor = "var(--cyan)";
  } else if (phase === "done") {
    statusPct = 100;
    statusLabel = "Complete";
    statusColor = "var(--green)";
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
            onClick={() => !isActive && inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? "var(--amber)" : isActive ? "var(--b2)" : "var(--b2)"}`,
              borderRadius: "12px",
              padding: "28px 20px",
              textAlign: "center",
              cursor: isActive ? "default" : "pointer",
              background: dragging ? "rgba(245,158,11,0.05)" : "var(--raised)",
              transition: "all 0.2s ease",
            }}
          >
            <Upload size={22} style={{
              color: isActive ? "var(--t3)" : dragging ? "var(--amber)" : "var(--t2)",
              margin: "0 auto 10px", display: "block",
            }} />
            <div style={{ fontSize: "13px", color: isActive ? "var(--t3)" : "var(--t1)", marginBottom: "4px" }}>
              {isActive ? "Processing…" : "Drop files here or click to browse"}
            </div>
            <div className="font-mono" style={{ fontSize: "10px", color: "var(--t2)", letterSpacing: "0.06em" }}>
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

          {/* Progress card */}
          {phase && (
            <div style={{
              padding: "14px 16px", borderRadius: "10px",
              background: phase === "done"
                ? "rgba(16,185,129,0.06)"
                : phase === "indexing"
                ? "rgba(34,211,238,0.06)"
                : "rgba(245,158,11,0.06)",
              border: `1px solid ${phase === "done"
                ? "rgba(16,185,129,0.20)"
                : phase === "indexing"
                ? "rgba(34,211,238,0.18)"
                : "rgba(245,158,11,0.20)"}`,
              display: "flex", flexDirection: "column", gap: "10px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: statusColor }}>
                  {statusLabel}
                </span>
                {phase === "done" && <CheckCircle2 size={14} style={{ color: "var(--green)" }} />}
              </div>
              <ProgressBar pct={statusPct} color={statusColor} />
              {isActive && (
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={runInBackground}
                    style={{
                      flex: 1, padding: "5px 0", borderRadius: "6px",
                      background: "rgba(255,255,255,0.05)", border: "1px solid var(--b2)",
                      color: "var(--t2)", fontSize: "11px", fontWeight: 500, cursor: "pointer",
                    }}
                  >
                    Run in background
                  </button>
                  <button
                    onClick={cancelOperation}
                    style={{
                      flex: 1, padding: "5px 0", borderRadius: "6px",
                      background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)",
                      color: "#f87171", fontSize: "11px", fontWeight: 500, cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
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
              <div className="font-mono" style={{ fontSize: "9px", color: "var(--t2)", letterSpacing: "0.12em", marginBottom: "10px" }}>
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

          {files.length === 0 && !isActive && (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ fontSize: "13px", color: "var(--t2)" }}>No documents indexed yet.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
