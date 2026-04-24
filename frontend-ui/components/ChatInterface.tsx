"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Square, Paperclip, X, FileText, BookOpen, Shield, Lock, ChevronRight, Cpu, Layers } from "lucide-react";
import { getThreadHistory } from "@/app/actions";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";

interface AttachedFile {
  file: File;
  name: string;
  isImage: boolean;
  preview?: string;
}

interface Source {
  file: string;
  score: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  attachments?: { name: string; preview?: string; isImage: boolean }[];
  sources?: Source[];
}

interface ChatInterfaceProps {
  activeProject: string;
  activeThread: string;
  username: string;
  onNewThread: (threadId: string) => void;
}


function makeThreadName(prompt: string): string {
  const words = prompt.trim().split(/\s+/);
  const name = words.slice(0, 5).join(" ");
  return name.length > 3
    ? name.slice(0, 44)
    : `Session · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "5px 0 3px" }}>
      {[0, 1, 2].map(i => (
        <div key={i} className={`dot-${i + 1}`} style={{
          width: "7px", height: "7px", borderRadius: "50%", background: "var(--amber)",
        }} />
      ))}
    </div>
  );
}

function UserMessage({ content, attachments }: {
  content: string;
  attachments?: { name: string; preview?: string; isImage: boolean }[];
}) {
  return (
    <div className="fade-up" style={{ display: "flex", justifyContent: "flex-end", paddingLeft: "16%" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end", maxWidth: "540px" }}>
        {/* Attachment previews */}
        {attachments && attachments.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "flex-end" }}>
            {attachments.map((a, i) => (
              <div key={i} style={{ borderRadius: "10px", overflow: "hidden", border: "1px solid var(--b2)" }}>
                {a.isImage && a.preview ? (
                  <img src={a.preview} alt={a.name} style={{ maxHeight: "180px", maxWidth: "260px", display: "block", objectFit: "cover" }} />
                ) : (
                  <div style={{
                    display: "flex", alignItems: "center", gap: "6px", padding: "6px 10px",
                    background: "var(--raised)", fontSize: "12px", color: "var(--t2)",
                  }}>
                    <FileText size={12} style={{ color: "var(--amber)" }} />
                    <span style={{ maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {/* Message text */}
        {content && (
          <div style={{
            background: "var(--raised)", border: "1px solid var(--b2)",
            borderRadius: "18px 18px 4px 18px",
            padding: "13px 18px", fontSize: "14px", lineHeight: "1.7",
            color: "var(--t1)", wordBreak: "break-word", boxShadow: "var(--card-shadow)",
          }}>{content}</div>
        )}
      </div>
    </div>
  );
}

function SourcesRow({ sources }: { sources: Source[] }) {
  return (
    <div className="fade-up" style={{ marginBottom: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
        <BookOpen size={10} style={{ color: "var(--t3)" }} />
        <span className="font-mono" style={{ fontSize: "9px", letterSpacing: "0.14em", color: "var(--t3)", textTransform: "uppercase" }}>
          Sources
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
        {sources.map((s, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: "5px",
            padding: "3px 8px", borderRadius: "6px",
            background: "var(--raised)", border: "1px solid var(--b1)",
            fontSize: "11px", color: "var(--t2)",
          }}>
            <FileText size={10} style={{ color: "var(--amber)", flexShrink: 0 }} />
            <span style={{ maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.file}
            </span>
            {s.score > 0 && (
              <span className="font-mono" style={{ fontSize: "9px", color: "var(--t3)", flexShrink: 0 }}>
                {Math.round(s.score * 100)}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="ai-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function AIMessage({ content, thinking, streaming, sources }: {
  content: string; thinking?: boolean; streaming?: boolean; sources?: Source[];
}) {
  return (
    <div className="fade-up" style={{ display: "flex", gap: "14px", alignItems: "flex-start", paddingRight: "12%" }}>
      <div style={{
        width: "30px", height: "30px", flexShrink: 0, borderRadius: "9px", marginTop: "1px",
        background: "linear-gradient(135deg, var(--amber-15) 0%, var(--amber-5) 100%)",
        border: "1px solid var(--amber-25)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: thinking ? "0 0 16px rgba(245,158,11,0.28)" : "none",
        transition: "box-shadow 0.3s ease",
      }}>
        <Shield size={14} style={{ color: "var(--amber)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Sources — shown as soon as they arrive, before text */}
        {sources && sources.length > 0 && <SourcesRow sources={sources} />}

        {thinking && !content ? (
          <>
            <ThinkingDots />
            <div style={{
              height: "2px", width: "52px", marginTop: "10px", borderRadius: "2px",
              background: "linear-gradient(90deg, var(--amber-25) 0%, transparent 100%)",
              animation: "shimmer-track 1.5s linear infinite",
            }} />
          </>
        ) : (
          <>
            <div className="font-mono" style={{
              fontSize: "9px", letterSpacing: "0.14em", color: "var(--amber)",
              marginBottom: "9px", opacity: 0.6,
            }}>S · AI</div>
            <div className={streaming ? "typing-stream" : ""}>
              <MarkdownContent content={content} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ project }: { project: string }) {
  return (
    <div className="fade-up" style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100%",
      padding: "40px 32px", textAlign: "center",
      maxWidth: "680px", margin: "0 auto", width: "100%",
    }}>
      <div style={{ position: "relative", marginBottom: "32px" }}>
        <div style={{
          position: "absolute", inset: "-32px",
          background: "radial-gradient(circle, rgba(245,158,11,0.07) 0%, transparent 70%)",
          borderRadius: "50%", pointerEvents: "none",
        }} />
        <div style={{
          width: "72px", height: "72px", borderRadius: "22px",
          background: "linear-gradient(135deg, var(--amber-15) 0%, var(--amber-5) 100%)",
          border: "1px solid var(--amber-25)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 28px rgba(245,158,11,0.1)", position: "relative",
        }}>
          <Shield size={30} style={{ color: "var(--amber)" }} />
        </div>
      </div>
      <h1 className="font-display" style={{
        fontSize: "27px", fontWeight: 800, color: "var(--t1)",
        marginBottom: "10px", letterSpacing: "-0.02em", lineHeight: 1.2,
      }}>
        {project ? `${project}` : "How can I help today?"}
      </h1>
      <p style={{ fontSize: "14px", color: "var(--t2)", marginBottom: "36px", lineHeight: 1.65, maxWidth: "380px" }}>
        {project
          ? "Ask anything about your documents. Processing is fully local and private."
          : "Select a workspace from the sidebar to begin your session."}
      </p>
    </div>
  );
}

function SendButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => !disabled && setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "34px", height: "34px", borderRadius: "10px", border: "none",
        cursor: disabled ? "not-allowed" : "pointer", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: disabled ? "var(--icon-bg)" : hov ? "var(--amber)" : "rgba(245,158,11,0.88)",
        color: disabled ? "var(--t3)" : "var(--void)",
        transition: "all 0.18s ease",
        boxShadow: !disabled && hov ? "0 0 18px rgba(245,158,11,0.3)" : "none",
        transform: !disabled && hov ? "scale(1.06)" : "scale(1)",
      }}
    >
      <Send size={14} style={{ marginLeft: "1px", marginTop: "1px" }} />
    </button>
  );
}

function StopButton({ onClick }: { onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title="Stop generating"
      style={{
        width: "34px", height: "34px", borderRadius: "10px", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: hov ? "rgba(239,68,68,0.18)" : "rgba(239,68,68,0.10)",
        border: "1px solid rgba(239,68,68,0.3)",
        color: "#ef4444", cursor: "pointer",
        transition: "all 0.15s ease",
        transform: hov ? "scale(1.06)" : "scale(1)",
      }}
    >
      <Square size={13} fill="currentColor" />
    </button>
  );
}

function AttachButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => !disabled && setHov(true)}
      onMouseLeave={() => setHov(false)}
      title="Attach file or image"
      style={{
        width: "28px", height: "28px", borderRadius: "8px", border: "none",
        cursor: disabled ? "not-allowed" : "pointer", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: hov ? "var(--hover-bg)" : "transparent",
        color: disabled ? "var(--t3)" : hov ? "var(--amber)" : "var(--t3)",
        transition: "all 0.15s ease",
      }}
    >
      <Paperclip size={15} />
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ChatInterface({ activeProject, activeThread, username, onNewThread }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [currentThread, setCurrentThread] = useState(activeThread);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  const userStoppedRef = useRef(false);

  useEffect(() => {
    if (!activeProject || !username) { setMessages([]); return; }
    setCurrentThread(activeThread);
    if (streamingRef.current) return;
    let cancelled = false;
    getThreadHistory(activeProject, username, activeThread).then(history => {
      if (cancelled) return;
      setMessages(history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })));
    });
    return () => { cancelled = true; };
  }, [activeProject, activeThread, username]);

  useEffect(() => { return () => { abortRef.current?.abort(); }; }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  // ── Attachment handling ───────────────────────────────────────────────────

  function handleAttachClick() {
    fileInputRef.current?.click();
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    const newAttachments: AttachedFile[] = [];
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith("image/");
      let preview: string | undefined;
      if (isImage) {
        preview = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      }
      newAttachments.push({ file, name: file.name, isImage, preview });
    }
    setAttachedFiles(prev => [...prev, ...newAttachments]);
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  function removeAttachment(index: number) {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  }

  // ── Stop ─────────────────────────────────────────────────────────────────

  function handleStop() {
    userStoppedRef.current = true;
    abortRef.current?.abort();
  }

  // ── Send ─────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    const hasText = input.trim().length > 0;
    const hasFiles = attachedFiles.length > 0;
    if ((!hasText && !hasFiles) || isLoading) return;
    if (!activeProject) {
      setMessages(prev => [...prev, { role: "assistant", content: "⚠ Please select a workspace in the sidebar first." }]);
      setInput("");
      return;
    }

    const prompt = input.trim();
    const filesToUpload = [...attachedFiles];
    let threadId = currentThread;

    const isFirstMessage = messages.length === 0 && (threadId === "General" || /^Thread-\d+$/.test(threadId));
    const rawPrompt = prompt; // capture before any mutation
    if (isFirstMessage) {
      threadId = makeThreadName(prompt || filesToUpload[0]?.name || "New Chat");
      setCurrentThread(threadId);
      onNewThread(threadId);
    }

    // Snapshot attachments for the message bubble, then clear
    const attachmentMeta = filesToUpload.map(f => ({ name: f.name, preview: f.preview, isImage: f.isImage }));
    setAttachedFiles([]);
    setInput("");
    streamingRef.current = true;
    userStoppedRef.current = false;
    setIsLoading(true);

    if (prompt || attachmentMeta.length > 0) {
      setMessages(prev => [...prev, { role: "user", content: prompt, attachments: attachmentMeta.length > 0 ? attachmentMeta : undefined }]);
    }
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    abortRef.current = new AbortController();
    const timeoutId = setTimeout(() => abortRef.current?.abort(), 180_000);

    try {
      // If the user attached images in the chat, send them to the vision endpoint
      // directly instead of indexing + RAG (which can't describe images).
      const imageFiles = filesToUpload.filter(f => f.isImage);
      const docFiles   = filesToUpload.filter(f => !f.isImage);

      // Upload non-image files to the workspace index as usual
      for (const af of docFiles) {
        const fd = new FormData();
        fd.append("file", af.file);
        fd.append("project", activeProject);
        await fetch("/api/upload", { method: "POST", body: fd });
      }

      let response: Response;

      if (imageFiles.length > 0) {
        // Vision path: send the first image + prompt to the vision model
        const firstImage = imageFiles[0];
        const imageBase64: string = firstImage.preview ?? await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(firstImage.file);
        });
        const visionPrompt = prompt || `Describe this image in detail.`;
        response = await fetch("/api/vision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_base64: imageBase64, prompt: visionPrompt, project: activeProject, username, thread_id: threadId }),
          signal: abortRef.current.signal,
        });
      } else {
        // RAG path: text-only query against indexed documents
        response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: prompt || `Describe the attached file(s): ${docFiles.map(f => f.name).join(", ")}`, project: activeProject, username, thread_id: threadId }),
          signal: abortRef.current.signal,
        });
      }

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      // Fire AI title generation in the background — doesn't block streaming.
      if (isFirstMessage && rawPrompt) {
        const placeholderThread = threadId;
        fetch("/api/title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: rawPrompt }),
        })
          .then(r => r.json())
          .then(({ title }: { title: string }) => {
            if (!title || title === placeholderThread) return;
            return fetch("/api/threads", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ project: activeProject, old_id: placeholderThread, new_id: title }),
            }).then(() => {
              setCurrentThread(title);
              onNewThread(title);
            });
          })
          .catch(() => {}); // title generation is best-effort
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.sources) {
                setMessages(prev => {
                  const next = [...prev];
                  next[next.length - 1] = { ...next[next.length - 1], sources: parsed.sources };
                  return next;
                });
              } else if (parsed.token !== undefined) {
                accumulated += parsed.token;
                setMessages(prev => {
                  const next = [...prev];
                  next[next.length - 1] = { ...next[next.length - 1], content: accumulated };
                  return next;
                });
              }
            } catch (_) {}
          }
        }
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (isAbort && userStoppedRef.current) {
        // User manually stopped — remove the empty bubble if nothing was generated
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && !last.content) return prev.slice(0, -1);
          return prev;
        });
      } else {
        const errMsg = isAbort
          ? "⚠ Request timed out. Please try again."
          : "⚠ Connection error. Is the backend running?";
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant" && !last.content) {
            next[next.length - 1] = { role: "assistant", content: errMsg };
          } else {
            next.push({ role: "assistant", content: errMsg });
          }
          return next;
        });
      }
    } finally {
      clearTimeout(timeoutId);
      streamingRef.current = false;
      userStoppedRef.current = false;
      setIsLoading(false);
    }
  };

  const hasMessages = messages.length > 0;
  const canSend = (input.trim().length > 0 || attachedFiles.length > 0) && !isLoading;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative", zIndex: 1 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 28px", borderBottom: "1px solid var(--b1)",
        background: "var(--frosted-light)", backdropFilter: "blur(16px)",
        flexShrink: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <Layers size={12} style={{ color: "var(--t3)" }} />
          <span style={{ fontSize: "12px", color: "var(--t3)" }}>Workspace</span>
          <ChevronRight size={11} style={{ color: "var(--b2)" }} />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--t1)" }}>{activeProject || "No workspace selected"}</span>
          {activeThread && activeThread !== "General" && (
            <>
              <ChevronRight size={11} style={{ color: "var(--b2)" }} />
              <span style={{ fontSize: "12px", color: "var(--t2)", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeThread}</span>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {[
            { icon: Lock, label: "ENCRYPTED", color: "var(--green)", bg: "var(--green-10)" },
            { icon: Cpu, label: "LOCAL", color: "var(--cyan)", bg: "var(--cyan-10)" },
            { icon: Shield, label: "SOVEREIGN", color: "var(--amber)", bg: "var(--amber-5)" },
          ].map(({ icon: Icon, label, color, bg }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: "5px",
              padding: "4px 9px", borderRadius: "6px",
              background: bg, border: `1px solid ${color}22`,
            }}>
              <Icon size={9} style={{ color }} />
              <span className="font-mono" style={{ fontSize: "9px", color, letterSpacing: "0.08em" }}>{label}</span>
            </div>
          ))}
        </div>
      </header>

      {/* ── Messages ───────────────────────────────────────────────────────── */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column" }}>
        {!hasMessages ? (
          <EmptyState project={activeProject} />
        ) : (
          <div style={{
            maxWidth: "780px", width: "100%", margin: "0 auto",
            padding: "40px 32px 56px",
            display: "flex", flexDirection: "column", gap: "28px",
          }}>
            {messages.map((msg, i) =>
              msg.role === "user" ? (
                <UserMessage key={i} content={msg.content} attachments={msg.attachments} />
              ) : (
                <AIMessage key={i} content={msg.content}
                  thinking={isLoading && i === messages.length - 1 && !msg.content}
                  streaming={isLoading && i === messages.length - 1 && !!msg.content}
                  sources={msg.sources}
                />
              )
            )}
          </div>
        )}
      </div>

      {/* ── Input ──────────────────────────────────────────────────────────── */}
      <div style={{
        padding: "14px 28px 20px",
        background: "var(--frosted-heavy)", backdropFilter: "blur(16px)",
        borderTop: "1px solid var(--b1)", flexShrink: 0,
      }}>
        <div style={{ maxWidth: "780px", margin: "0 auto" }}>
          <div className="sovereign-input" style={{
            background: "var(--raised)", border: "1px solid var(--b2)",
            borderRadius: "16px", boxShadow: "var(--card-shadow)",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}>
            {/* Attachment chips */}
            {attachedFiles.length > 0 && (
              <div style={{
                display: "flex", flexWrap: "wrap", gap: "6px",
                padding: "10px 14px 6px",
                borderBottom: "1px solid var(--b1)",
              }}>
                {attachedFiles.map((f, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: "5px",
                    padding: f.isImage && f.preview ? 0 : "4px 4px 4px 8px",
                    borderRadius: "8px", overflow: "hidden",
                    background: "var(--amber-10)", border: "1px solid var(--amber-25)",
                    fontSize: "12px", color: "var(--t2)",
                  }}>
                    {f.isImage && f.preview ? (
                      <>
                        <img src={f.preview} alt={f.name} style={{ width: "32px", height: "32px", objectFit: "cover" }} />
                        <span style={{ padding: "0 4px", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      </>
                    ) : (
                      <>
                        <FileText size={12} style={{ color: "var(--amber)" }} />
                        <span style={{ maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      </>
                    )}
                    <button
                      onClick={() => removeAttachment(i)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", padding: "4px", display: "flex", alignItems: "center" }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input row */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", padding: "11px 12px 10px" }}>
              {/* Attach button */}
              <AttachButton onClick={handleAttachClick} disabled={isLoading} />

              {/* Prompt indicator */}
              <span className="font-mono" style={{
                fontSize: "15px", color: "var(--amber-40)",
                paddingBottom: "3px", flexShrink: 0, userSelect: "none",
              }}>›</span>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={activeProject ? "Ask anything, or attach a file…" : "Select a workspace to begin…"}
                disabled={isLoading}
                rows={1}
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  resize: "none", color: "var(--t1)", fontSize: "14px", lineHeight: "1.6",
                  fontFamily: "inherit", minHeight: "24px", maxHeight: "160px",
                  overflowY: "auto", paddingTop: "1px",
                }}
              />

              {/* Send / Stop */}
              {isLoading
                ? <StopButton onClick={handleStop} />
                : <SendButton onClick={handleSend} disabled={!canSend} />
              }
            </div>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.txt,.csv,.docx,.doc,.png,.jpg,.jpeg,.bmp,.tiff,.tif,.gif,.webp"
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />

          <p className="font-mono" style={{
            textAlign: "center", fontSize: "9px", color: "var(--t3)",
            marginTop: "9px", letterSpacing: "0.07em",
          }}>
            LOCAL INFERENCE · PRIVATE WORKSPACE · SHIFT+ENTER FOR NEW LINE
          </p>
        </div>
      </div>
    </div>
  );
}
