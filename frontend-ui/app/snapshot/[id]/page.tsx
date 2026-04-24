import { Shield, FileText, Calendar, User, Hash, Lock } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";

interface Message { role: string; content: string; }

interface Snapshot {
  id: string;
  project_name: string;
  project_owner: string;
  thread_id: string;
  title: string;
  created_by: string;
  created_at: string;
  messages: Message[];
  files: string[];
}

async function fetchSnapshot(id: string): Promise<Snapshot | null> {
  try {
    const res = await fetch(`http://127.0.0.1:8000/api/snapshots/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function SnapshotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snap = await fetchSnapshot(id);

  if (!snap) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0b", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔒</div>
          <div style={{ fontSize: "18px", fontWeight: 600, color: "#F0F3FA", marginBottom: "8px" }}>Snapshot not found</div>
          <div style={{ fontSize: "14px", color: "#6B7290" }}>This snapshot may have been deleted or the link is invalid.</div>
        </div>
      </div>
    );
  }

  const date = snap.created_at
    ? new Date(snap.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Unknown";

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0b", fontFamily: "'DM Sans', -apple-system, sans-serif", color: "#F0F3FA" }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />

      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "#131314", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Shield size={18} style={{ color: "#F59E0B" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "#F0F3FA", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{snap.title}</div>
            <div style={{ fontSize: "11px", color: "#6B7290", marginTop: "2px", fontFamily: "monospace" }}>{snap.project_name}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: "20px" }}>
            <Lock size={10} style={{ color: "#10B981" }} />
            <span style={{ fontSize: "10px", color: "#10B981", fontWeight: 600, letterSpacing: "0.06em" }}>READ-ONLY SNAPSHOT</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Meta card */}
        <div style={{ background: "#1e1f20", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", padding: "18px 20px", display: "flex", flexWrap: "wrap", gap: "20px" }}>
          {[
            { icon: User, label: "Created by", value: snap.created_by },
            { icon: Calendar, label: "Captured on", value: date },
            { icon: Hash, label: "Thread", value: snap.thread_id },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "30px", height: "30px", borderRadius: "7px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={13} style={{ color: "#F59E0B" }} />
              </div>
              <div>
                <div style={{ fontSize: "9px", color: "#6B7290", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "monospace" }}>{label}</div>
                <div style={{ fontSize: "13px", color: "#F0F3FA", marginTop: "2px" }}>{value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Documents */}
        {snap.files.length > 0 && (
          <div style={{ background: "#1e1f20", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", overflow: "hidden" }}>
            <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: "8px" }}>
              <FileText size={13} style={{ color: "#22D3EE" }} />
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#A8AEBF", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "monospace" }}>Documents ({snap.files.length})</span>
            </div>
            <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {snap.files.map((f) => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "#252628", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "7px" }}>
                  <FileText size={11} style={{ color: "#F59E0B", flexShrink: 0 }} />
                  <span style={{ fontSize: "13px", color: "#A8AEBF" }}>{f}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conversation */}
        <div style={{ background: "#1e1f20", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#A8AEBF", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "monospace" }}>Conversation ({snap.messages.length} messages)</span>
          </div>
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
            {snap.messages.length === 0 && (
              <div style={{ textAlign: "center", color: "#6B7290", fontSize: "13px", padding: "20px 0" }}>No messages in this thread.</div>
            )}
            {snap.messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", gap: "14px", alignItems: "flex-start", paddingRight: msg.role === "assistant" ? "10%" : 0, paddingLeft: msg.role === "user" ? "10%" : 0 }}>
                {msg.role === "assistant" && (
                  <div style={{ width: "28px", height: "28px", flexShrink: 0, borderRadius: "8px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "2px" }}>
                    <Shield size={12} style={{ color: "#F59E0B" }} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "9px", fontFamily: "monospace", letterSpacing: "0.12em", color: msg.role === "user" ? "#22D3EE" : "#F59E0B", marginBottom: "7px", opacity: 0.7, textAlign: msg.role === "user" ? "right" : "left" }}>
                    {msg.role === "user" ? "USER" : "S · AI"}
                  </div>
                  {msg.role === "user" ? (
                    <div style={{ background: "#252628", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "12px 16px", fontSize: "14px", lineHeight: "1.7", color: "#F0F3FA", textAlign: "right" }}>
                      {msg.content}
                    </div>
                  ) : (
                    <div className="ai-prose" style={{ fontSize: "14px", lineHeight: "1.78", color: "#F0F3FA" }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div style={{ width: "28px", height: "28px", flexShrink: 0, borderRadius: "8px", background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "2px" }}>
                    <User size={12} style={{ color: "#22D3EE" }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "8px 0 24px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: "20px" }}>
            <Shield size={10} style={{ color: "#F59E0B" }} />
            <span style={{ fontSize: "11px", color: "rgba(245,158,11,0.6)", letterSpacing: "0.05em" }}>Sovereign Intelligence System — Read-only snapshot</span>
          </div>
        </div>

      </div>
    </div>
  );
}
