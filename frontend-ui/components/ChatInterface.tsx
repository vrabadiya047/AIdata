"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  Shield,
  Paperclip,
  Mic,
  Lock,
  ChevronRight,
  Cpu,
  FileText,
  Database,
  Layers,
  Search,
  BarChart2,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────── */
interface Message {
  role: "user" | "assistant";
  content: string;
}

/* ─── Empty state quick-actions ─────────────────── */
const QUICK_ACTIONS = [
  {
    icon: FileText,
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.18)",
    title: "Analyse documents",
    sub: "Summarize uploaded PDFs",
  },
  {
    icon: Database,
    color: "#22D3EE",
    bg: "rgba(34,211,238,0.06)",
    border: "rgba(34,211,238,0.14)",
    title: "Query applications",
    sub: "Search the job tracker CSV",
  },
  {
    icon: BarChart2,
    color: "#A78BFA",
    bg: "rgba(167,139,250,0.06)",
    border: "rgba(167,139,250,0.14)",
    title: "Generate report",
    sub: "Extract key metrics",
  },
  {
    icon: Search,
    color: "#34D399",
    bg: "rgba(52,211,153,0.06)",
    border: "rgba(52,211,153,0.14)",
    title: "Verify compliance",
    sub: "Cross-check regulations",
  },
];

/* ─── Dot thinking indicator ─────────────────────── */
function ThinkingDots() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "5px",
        padding: "4px 2px",
      }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`dot-${i + 1}`}
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: "var(--amber)",
          }}
        />
      ))}
    </div>
  );
}

/* ─── Message bubbles ────────────────────────────── */
function UserMessage({ content }: { content: string }) {
  return (
    <div
      className="fade-up"
      style={{
        display: "flex",
        justifyContent: "flex-end",
        gap: "10px",
        alignItems: "flex-end",
        paddingLeft: "80px",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.05) 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "16px 16px 4px 16px",
          padding: "12px 16px",
          fontSize: "14px",
          lineHeight: "1.6",
          color: "var(--t1)",
          maxWidth: "600px",
          wordBreak: "break-word",
        }}
      >
        {content}
      </div>

      {/* User avatar */}
      <div
        style={{
          width: "28px",
          height: "28px",
          flexShrink: 0,
          borderRadius: "50%",
          background:
            "linear-gradient(135deg, rgba(34,211,238,0.2) 0%, rgba(6,182,212,0.1) 100%)",
          border: "1px solid rgba(34,211,238,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          className="font-mono"
          style={{ fontSize: "9px", fontWeight: 700, color: "var(--cyan)" }}
        >
          AD
        </span>
      </div>
    </div>
  );
}

function AIMessage({
  content,
  thinking,
}: {
  content: string;
  thinking?: boolean;
}) {
  return (
    <div
      className="fade-up"
      style={{
        display: "flex",
        gap: "14px",
        alignItems: "flex-start",
        paddingRight: "80px",
      }}
    >
      {/* AI Avatar */}
      <div
        style={{
          width: "32px",
          height: "32px",
          flexShrink: 0,
          borderRadius: "9px",
          background:
            "linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(245,158,11,0.06) 100%)",
          border: "1px solid rgba(245,158,11,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: "2px",
          boxShadow: thinking
            ? "0 0 12px rgba(245,158,11,0.2)"
            : "none",
          transition: "box-shadow 0.3s ease",
        }}
      >
        <Shield size={15} style={{ color: "var(--amber)" }} />
      </div>

      {/* Bubble */}
      <div
        style={{
          flex: 1,
          background: "var(--raised)",
          border: "1px solid var(--b2)",
          borderLeft: "3px solid rgba(245,158,11,0.5)",
          borderRadius: "4px 14px 14px 14px",
          padding: "14px 18px",
          fontSize: "14px",
          lineHeight: "1.75",
          color: "var(--t1)",
          wordBreak: "break-word",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {thinking ? (
          <ThinkingDots />
        ) : (
          <>
            <div
              className="font-mono"
              style={{
                fontSize: "9px",
                color: "var(--amber)",
                letterSpacing: "0.12em",
                marginBottom: "8px",
                opacity: 0.7,
              }}
            >
              S·AI RESPONSE
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{content}</div>
          </>
        )}

        {/* Subtle scan decoration */}
        {thinking && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(to right, transparent, rgba(245,158,11,0.03), transparent)",
              backgroundSize: "200% 100%",
              animation: "shimmer-track 1.8s linear infinite",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Empty state ───────────────────────────────── */
function EmptyState({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <div
      className="fade-up"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: "48px 40px",
        textAlign: "center",
        maxWidth: "760px",
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* Big logo mark */}
      <div
        style={{
          width: "64px",
          height: "64px",
          borderRadius: "18px",
          background:
            "linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0.04) 100%)",
          border: "1px solid rgba(245,158,11,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "28px",
          boxShadow:
            "0 0 40px rgba(245,158,11,0.08), inset 0 1px 0 rgba(245,158,11,0.15)",
        }}
      >
        <Shield size={28} style={{ color: "var(--amber)" }} />
      </div>

      <h1
        className="font-display"
        style={{
          fontSize: "26px",
          fontWeight: 700,
          color: "var(--t1)",
          marginBottom: "8px",
          letterSpacing: "-0.01em",
        }}
      >
        How can I help you today?
      </h1>
      <p
        className="font-mono"
        style={{
          fontSize: "11px",
          color: "var(--t3)",
          letterSpacing: "0.06em",
          marginBottom: "40px",
        }}
      >
        PRIVATE · LOCAL INFERENCE · DATA SOVEREIGN
      </p>

      {/* Quick action grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px",
          width: "100%",
        }}
      >
        {QUICK_ACTIONS.map(
          ({ icon: Icon, color, bg, border, title, sub }, i) => (
            <QuickCard
              key={i}
              Icon={Icon}
              color={color}
              bg={bg}
              border={border}
              title={title}
              sub={sub}
              delay={i * 50}
              onClick={() => onSelect(title)}
            />
          )
        )}
      </div>
    </div>
  );
}

function QuickCard({
  Icon,
  color,
  bg,
  border,
  title,
  sub,
  delay,
  onClick,
}: {
  Icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  title: string;
  sub: string;
  delay: number;
  onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      className="fade-up"
      style={{ animationDelay: `${delay}ms` }}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div
        style={{
          padding: "16px",
          borderRadius: "12px",
          background: hov ? "var(--elevated)" : "var(--raised)",
          border: `1px solid ${hov ? border : "var(--b2)"}`,
          cursor: "pointer",
          textAlign: "left",
          transition: "all 0.2s ease",
          boxShadow: hov ? `0 0 20px ${bg}` : "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: "10px",
        }}
      >
        <div
          style={{
            width: "34px",
            height: "34px",
            borderRadius: "9px",
            background: bg,
            border: `1px solid ${border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={16} style={{ color }} />
        </div>
        <div>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--t1)",
              marginBottom: "3px",
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: "12px", color: "var(--t2)" }}>{sub}</div>
        </div>
      </div>
    </button>
  );
}

/* ─── Main Chat Interface ────────────────────────── */

export default function ChatInterface({
  activeProject,
}: {
  activeProject: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* Auto-scroll */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  /* Auto-resize textarea */
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const prompt = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: prompt }]);
    setInput("");
    setIsLoading(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          project: activeProject,
          username: "admin",
          thread_id: "General",
        }),
      });

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
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  role: "assistant",
                  content: accumulated,
                };
                return next;
              });
            } catch (_) {}
          }
        }
      }
    } catch (err) {
      console.error("Stream error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "relative",
        zIndex: 1,
      }}
    >
      {/* ── Header bar ────────────────────────── */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 24px",
          borderBottom: "1px solid var(--b1)",
          background: "rgba(7, 10, 18, 0.8)",
          backdropFilter: "blur(12px)",
          flexShrink: 0,
        }}
      >
        {/* Breadcrumb */}
        <div
          style={{ display: "flex", alignItems: "center", gap: "6px" }}
        >
          <Layers size={13} style={{ color: "var(--t3)" }} />
          <span
            className="font-mono"
            style={{ fontSize: "11px", color: "var(--t3)" }}
          >
            Workspace
          </span>
          <ChevronRight size={11} style={{ color: "var(--t3)" }} />
          <span
            className="font-mono"
            style={{
              fontSize: "11px",
              color: "var(--amber)",
              fontWeight: 500,
            }}
          >
            {activeProject}
          </span>
        </div>

        {/* Status badges */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <StatusBadge
            icon={Lock}
            label="ENCRYPTED"
            color="var(--green)"
            bg="var(--green-10)"
          />
          <StatusBadge
            icon={Cpu}
            label="LOCAL INFERENCE"
            color="var(--cyan)"
            bg="var(--cyan-10)"
          />
          <StatusBadge
            icon={Shield}
            label="SOVEREIGN"
            color="var(--amber)"
            bg="var(--amber-5)"
          />
        </div>
      </header>

      {/* ── Messages area ─────────────────────── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {!hasMessages ? (
          <EmptyState onSelect={(text) => setInput(text)} />
        ) : (
          <div
            style={{
              maxWidth: "800px",
              width: "100%",
              margin: "0 auto",
              padding: "32px 32px 48px",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
            }}
          >
            {messages.map((msg, i) =>
              msg.role === "user" ? (
                <UserMessage key={i} content={msg.content} />
              ) : (
                <AIMessage
                  key={i}
                  content={msg.content}
                  thinking={isLoading && i === messages.length - 1 && !msg.content}
                />
              )
            )}
          </div>
        )}
      </div>

      {/* ── Input footer ──────────────────────── */}
      <div
        style={{
          borderTop: "1px solid var(--b1)",
          padding: "16px 24px 20px",
          background: "rgba(7, 10, 18, 0.9)",
          backdropFilter: "blur(16px)",
          flexShrink: 0,
        }}
      >
        <div
          style={{ maxWidth: "800px", margin: "0 auto", width: "100%" }}
        >
          {/* Input card */}
          <div
            className="sovereign-input"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--b2)",
              borderRadius: "14px",
              overflow: "hidden",
              transition: "all 0.2s ease",
            }}
          >
            {/* Prompt line */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                padding: "14px 16px 8px",
              }}
            >
              <span
                className="font-mono"
                style={{
                  fontSize: "14px",
                  color: "rgba(245,158,11,0.5)",
                  paddingTop: "2px",
                  flexShrink: 0,
                  userSelect: "none",
                }}
              >
                &gt;
              </span>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Query the Sovereign system..."
                disabled={isLoading}
                rows={1}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  resize: "none",
                  color: "var(--t1)",
                  fontSize: "14px",
                  lineHeight: "1.6",
                  fontFamily: "inherit",
                  minHeight: "24px",
                  maxHeight: "160px",
                  overflowY: "auto",
                }}
              />
            </div>

            {/* Toolbar row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 12px 10px",
              }}
            >
              <div style={{ display: "flex", gap: "4px" }}>
                <IconButton icon={Paperclip} title="Attach file" />
                <IconButton icon={Mic} title="Voice input" />
              </div>

              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <span
                  className="font-mono"
                  style={{
                    fontSize: "9px",
                    color: "var(--t3)",
                    letterSpacing: "0.08em",
                  }}
                >
                  ENCRYPTED CHANNEL
                </span>

                <SendButton onClick={handleSend} disabled={isLoading || !input.trim()} />
              </div>
            </div>
          </div>

          {/* Footer note */}
          <p
            className="font-mono"
            style={{
              textAlign: "center",
              fontSize: "9px",
              color: "var(--t3)",
              marginTop: "10px",
              letterSpacing: "0.06em",
            }}
          >
            DATA RESIDENCY CONFIRMED · PROCESSING ON LOCAL HARDWARE · VERIFY
            CRITICAL INFORMATION
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Small reusable pieces ─────────────────────── */

function StatusBadge({
  icon: Icon,
  label,
  color,
  bg,
}: {
  icon: React.ElementType;
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "5px",
        padding: "4px 9px",
        borderRadius: "6px",
        background: bg,
        border: `1px solid ${color}22`,
      }}
    >
      <Icon size={10} style={{ color }} />
      <span
        className="font-mono"
        style={{ fontSize: "9px", color, letterSpacing: "0.08em" }}
      >
        {label}
      </span>
    </div>
  );
}

function IconButton({
  icon: Icon,
  title,
}: {
  icon: React.ElementType;
  title: string;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "30px",
        height: "30px",
        borderRadius: "8px",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: hov ? "rgba(255,255,255,0.07)" : "transparent",
        color: hov ? "var(--t1)" : "var(--t3)",
        transition: "all 0.15s ease",
      }}
    >
      <Icon size={14} />
    </button>
  );
}

function SendButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => !disabled && setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "34px",
        height: "34px",
        borderRadius: "9px",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: disabled
          ? "rgba(255,255,255,0.05)"
          : hov
          ? "var(--amber)"
          : "rgba(245,158,11,0.85)",
        color: disabled ? "var(--t3)" : "var(--void)",
        transition: "all 0.2s ease",
        boxShadow:
          !disabled && hov ? "0 0 16px rgba(245,158,11,0.35)" : "none",
        transform: !disabled && hov ? "scale(1.05)" : "scale(1)",
      }}
    >
      <Send size={14} style={{ marginLeft: "1px" }} />
    </button>
  );
}