"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Shield, Lock, ChevronRight, Cpu, Layers } from "lucide-react";
import { getThreadHistory } from "@/app/actions";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatInterfaceProps {
  activeProject: string;
  activeThread: string;
  username: string;
  onNewThread: (threadId: string) => void;
}

const SUGGESTIONS = [
  "Summarise all uploaded documents",
  "What are the key findings in my files?",
  "Generate a compliance report",
  "Compare documents and highlight differences",
];

function makeThreadName(prompt: string): string {
  const words = prompt.trim().split(/\s+/);
  const name = words.slice(0, 5).join(" ");
  return name.length > 3
    ? name.slice(0, 44)
    : `Session · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/* ─── Atoms ─────────────────────────────────────── */

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

function UserMessage({ content }: { content: string }) {
  return (
    <div className="fade-up" style={{ display: "flex", justifyContent: "flex-end", paddingLeft: "16%" }}>
      <div style={{
        background: "var(--raised)",
        border: "1px solid var(--b2)",
        borderRadius: "18px 18px 4px 18px",
        padding: "13px 18px",
        fontSize: "14px",
        lineHeight: "1.7",
        color: "var(--t1)",
        wordBreak: "break-word",
        boxShadow: "var(--card-shadow)",
        maxWidth: "540px",
      }}>{content}</div>
    </div>
  );
}

function AIMessage({ content, thinking, streaming }: {
  content: string; thinking?: boolean; streaming?: boolean;
}) {
  return (
    <div className="fade-up" style={{ display: "flex", gap: "14px", alignItems: "flex-start", paddingRight: "12%" }}>
      {/* Avatar */}
      <div style={{
        width: "30px", height: "30px", flexShrink: 0, borderRadius: "9px", marginTop: "1px",
        background: "linear-gradient(135deg, var(--amber-15) 0%, var(--amber-5) 100%)",
        border: "1px solid var(--amber-25)",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "box-shadow 0.3s ease",
        boxShadow: thinking ? "0 0 16px rgba(245,158,11,0.28)" : "none",
      }}>
        <Shield size={14} style={{ color: "var(--amber)" }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {thinking ? (
          <>
            <ThinkingDots />
            <div style={{
              height: "2px", width: "52px", marginTop: "10px", borderRadius: "2px",
              background: "linear-gradient(90deg, var(--amber-25) 0%, transparent 100%)",
              backgroundSize: "200% 100%",
              animation: "shimmer-track 1.5s linear infinite",
            }} />
          </>
        ) : (
          <>
            <div className="font-mono" style={{
              fontSize: "9px", letterSpacing: "0.14em", color: "var(--amber)",
              marginBottom: "9px", opacity: 0.6,
            }}>S · AI</div>
            <div
              className={streaming ? "typing-stream" : ""}
              style={{
                fontSize: "14px", lineHeight: "1.78", color: "var(--t1)",
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}
            >{content}</div>
          </>
        )}
      </div>
    </div>
  );
}

function SuggestionPill({ text, delay, onClick }: { text: string; delay: number; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      className="fade-up"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 18px", borderRadius: "12px",
        background: hov ? "var(--raised)" : "transparent",
        border: `1px solid ${hov ? "var(--amber-25)" : "var(--b1)"}`,
        transition: "all 0.18s ease",
        cursor: "pointer",
        boxShadow: hov ? "0 2px 12px rgba(245,158,11,0.07)" : "none",
      }}>
        <span style={{
          fontSize: "13px", color: hov ? "var(--t1)" : "var(--t2)",
          transition: "color 0.18s", textAlign: "left",
        }}>{text}</span>
        <ChevronRight size={13} style={{
          color: hov ? "var(--amber)" : "var(--t3)",
          transition: "color 0.18s", flexShrink: 0, marginLeft: "12px",
        }} />
      </div>
    </button>
  );
}

function EmptyState({ project, onSelect }: { project: string; onSelect: (t: string) => void }) {
  return (
    <div className="fade-up" style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100%",
      padding: "40px 32px", textAlign: "center",
      maxWidth: "680px", margin: "0 auto", width: "100%",
    }}>
      {/* Glow + Icon */}
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
          boxShadow: "0 4px 28px rgba(245,158,11,0.1)",
          position: "relative",
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

      <p style={{
        fontSize: "14px", color: "var(--t2)", marginBottom: "36px",
        lineHeight: 1.65, maxWidth: "380px",
      }}>
        {project
          ? "Ask anything about your documents. Processing is fully local and private."
          : "Select a workspace from the sidebar to begin your session."}
      </p>

      {/* Capability badges */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "32px", flexWrap: "wrap", justifyContent: "center" }}>
        {[
          { icon: Lock, label: "End-to-end encrypted" },
          { icon: Cpu, label: "Local inference" },
          { icon: Shield, label: "Data sovereign" },
        ].map(({ icon: Icon, label }) => (
          <div key={label} style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "6px 13px", borderRadius: "20px",
            background: "var(--raised)", border: "1px solid var(--b2)",
            fontSize: "12px", color: "var(--t2)",
          }}>
            <Icon size={11} style={{ color: "var(--t3)" }} />
            {label}
          </div>
        ))}
      </div>

      {/* Suggestion pills */}
      {project && (
        <div style={{ display: "flex", flexDirection: "column", gap: "7px", width: "100%" }}>
          {SUGGESTIONS.map((s, i) => (
            <SuggestionPill key={i} text={s} delay={i * 45} onClick={() => onSelect(s)} />
          ))}
        </div>
      )}
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

/* ─── Main component ─────────────────────────────── */

export default function ChatInterface({ activeProject, activeThread, username, onNewThread }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentThread, setCurrentThread] = useState(activeThread);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);

  useEffect(() => {
    if (!activeProject || !username) { setMessages([]); return; }
    setCurrentThread(activeThread);
    if (streamingRef.current) return;
    let cancelled = false;
    getThreadHistory(activeProject, username, activeThread).then(history => {
      if (cancelled) return;
      setMessages(history.map(m => ({ role: m.role, content: m.content })));
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

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    if (!activeProject) {
      setMessages(prev => [...prev, { role: "assistant", content: "⚠ Please select a workspace in the sidebar first." }]);
      setInput("");
      return;
    }

    const prompt = input.trim();
    let threadId = currentThread;

    if (messages.length === 0 && threadId === "General") {
      threadId = makeThreadName(prompt);
      setCurrentThread(threadId);
      onNewThread(threadId);
    }

    setMessages(prev => [...prev, { role: "user", content: prompt }]);
    setInput("");
    streamingRef.current = true;
    setIsLoading(true);
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    abortRef.current = new AbortController();
    const timeoutId = setTimeout(() => abortRef.current?.abort(), 120_000);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, project: activeProject, username, thread_id: threadId }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

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
              const { token } = JSON.parse(data);
              accumulated += token;
              setMessages(prev => {
                const next = [...prev];
                next[next.length - 1] = { role: "assistant", content: accumulated };
                return next;
              });
            } catch (_) {}
          }
        }
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      const errMsg = isAbort
        ? "⚠ Request timed out (2 min). Please try again."
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
    } finally {
      clearTimeout(timeoutId);
      streamingRef.current = false;
      setIsLoading(false);
    }
  };

  const hasMessages = messages.length > 0;
  const displayProject = activeProject || "No workspace selected";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative", zIndex: 1 }}>

      {/* ── Header ─────────────────────────────────── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 28px",
        borderBottom: "1px solid var(--b1)",
        background: "var(--frosted-light)",
        backdropFilter: "blur(16px)",
        flexShrink: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <Layers size={12} style={{ color: "var(--t3)" }} />
          <span style={{ fontSize: "12px", color: "var(--t3)" }}>Workspace</span>
          <ChevronRight size={11} style={{ color: "var(--b2)" }} />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--t1)" }}>{displayProject}</span>
          {activeThread && activeThread !== "General" && (
            <>
              <ChevronRight size={11} style={{ color: "var(--b2)" }} />
              <span style={{
                fontSize: "12px", color: "var(--t2)",
                maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{activeThread}</span>
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

      {/* ── Messages ───────────────────────────────── */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: "auto", overflowX: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        {!hasMessages ? (
          <EmptyState project={activeProject} onSelect={t => setInput(t)} />
        ) : (
          <div style={{
            maxWidth: "780px", width: "100%", margin: "0 auto",
            padding: "40px 32px 56px",
            display: "flex", flexDirection: "column", gap: "28px",
          }}>
            {messages.map((msg, i) =>
              msg.role === "user" ? (
                <UserMessage key={i} content={msg.content} />
              ) : (
                <AIMessage key={i} content={msg.content}
                  thinking={isLoading && i === messages.length - 1 && !msg.content}
                  streaming={isLoading && i === messages.length - 1 && !!msg.content}
                />
              )
            )}
          </div>
        )}
      </div>

      {/* ── Input ──────────────────────────────────── */}
      <div style={{
        padding: "14px 28px 20px",
        background: "var(--frosted-heavy)", backdropFilter: "blur(16px)",
        borderTop: "1px solid var(--b1)", flexShrink: 0,
      }}>
        <div style={{ maxWidth: "780px", margin: "0 auto" }}>
          <div className="sovereign-input" style={{
            background: "var(--raised)",
            border: "1px solid var(--b2)",
            borderRadius: "16px",
            boxShadow: "var(--card-shadow)",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", padding: "13px 14px 11px" }}>
              <span className="font-mono" style={{
                fontSize: "15px", color: "var(--amber-40)",
                paddingBottom: "3px", flexShrink: 0, userSelect: "none",
              }}>›</span>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={activeProject ? "Ask anything about your documents…" : "Select a workspace to begin…"}
                disabled={isLoading}
                rows={1}
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  resize: "none", color: "var(--t1)", fontSize: "14px", lineHeight: "1.6",
                  fontFamily: "inherit", minHeight: "24px", maxHeight: "160px",
                  overflowY: "auto", paddingTop: "1px",
                }}
              />
              <SendButton onClick={handleSend} disabled={isLoading || !input.trim()} />
            </div>
          </div>

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
