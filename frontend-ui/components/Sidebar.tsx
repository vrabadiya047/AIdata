"use client";

import { useState } from "react";
import {
  Shield,
  Plus,
  Hash,
  Layers,
  Settings,
  ChevronRight,
  Terminal,
  Archive,
  Zap,
} from "lucide-react";

const recentChats = [
  { id: 0, title: "Database Integration", time: "now", active: true },
  { id: 1, title: "Bridge Structural Specs", time: "2h", active: false },
  { id: 2, title: "Compliance Audit 2025", time: "1d", active: false },
  { id: 3, title: "Thermal Dynamics", time: "3d", active: false },
];

const workspaces = [
  { name: "Vivek Rameshbhai", slug: "VR", active: true, count: 47 },
  { name: "Main Roads WA", slug: "MR", active: false, count: 12 },
  { name: "General Specs", slug: "GS", active: false, count: 8 },
  { name: "Metronet", slug: "MT", active: false, count: 5 },
];

/* ─── Tiny sub-components ──────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-mono"
      style={{
        fontSize: "9px",
        letterSpacing: "0.18em",
        color: "var(--t3)",
        padding: "18px 12px 7px",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function NavItem({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: "9px",
        padding: "8px 10px",
        borderRadius: "8px",
        cursor: "pointer",
        border: "none",
        marginBottom: "1px",
        background: active
          ? "linear-gradient(90deg, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0.04) 100%)"
          : hov
          ? "rgba(255,255,255,0.04)"
          : "transparent",
        transition: "background 0.15s ease",
        textAlign: "left",
      }}
    >
      {children}
    </button>
  );
}

/* ─── Main Sidebar ──────────────────────────────── */

export default function Sidebar() {
  const [activeChat, setActiveChat] = useState(0);

  return (
    <aside
      style={{
        width: "268px",
        minWidth: "268px",
        background: "var(--surface)",
        borderRight: "1px solid var(--b1)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Top ambient amber glow */}
      <div
        style={{
          position: "absolute",
          top: "-80px",
          left: "-80px",
          width: "240px",
          height: "240px",
          background:
            "radial-gradient(circle, rgba(245,158,11,0.07) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* ── Logo ───────────────────────────────── */}
      <div
        style={{
          padding: "22px 18px 18px",
          borderBottom: "1px solid var(--b1)",
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: "12px" }}
        >
          {/* Shield icon box */}
          <div
            className="pulse-amber"
            style={{
              width: "38px",
              height: "38px",
              flexShrink: 0,
              background:
                "linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0.05) 100%)",
              border: "1px solid var(--amber-40)",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Shield size={18} style={{ color: "var(--amber)" }} />
          </div>

          <div>
            <div
              className="font-display"
              style={{
                fontSize: "14px",
                fontWeight: 800,
                letterSpacing: "0.06em",
                color: "var(--amber)",
                lineHeight: 1,
                textTransform: "uppercase",
              }}
            >
              Sovereign
            </div>
            <div
              className="font-mono"
              style={{
                fontSize: "9px",
                letterSpacing: "0.12em",
                color: "rgba(245,158,11,0.45)",
                lineHeight: 1,
                marginTop: "4px",
              }}
            >
              Intelligence System
            </div>
          </div>
        </div>

        {/* Status row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginTop: "14px",
            padding: "7px 10px",
            background: "var(--green-10)",
            borderRadius: "6px",
            border: "1px solid rgba(16,185,129,0.12)",
          }}
        >
          <div
            className="pulse-green"
            style={{
              width: "6px",
              height: "6px",
              flexShrink: 0,
              borderRadius: "50%",
              background: "var(--green)",
            }}
          />
          <span
            className="font-mono"
            style={{
              fontSize: "9px",
              color: "var(--green)",
              letterSpacing: "0.08em",
            }}
          >
            SYS ONLINE · LOCAL INFERENCE
          </span>
        </div>
      </div>

      {/* ── New Session button ──────────────────── */}
      <div style={{ padding: "14px 14px 8px" }}>
        <NewSessionButton />
      </div>

      {/* ── Scrollable nav area ─────────────────── */}
      <nav
        style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}
      >
        {/* Recent */}
        <SectionLabel>Recent Sessions</SectionLabel>

        {recentChats.map((chat) => (
          <NavItem
            key={chat.id}
            active={activeChat === chat.id}
            onClick={() => setActiveChat(chat.id)}
          >
            {activeChat === chat.id ? (
              <div
                style={{
                  width: "3px",
                  height: "16px",
                  borderRadius: "2px",
                  background: "var(--amber)",
                  flexShrink: 0,
                  boxShadow: "0 0 6px var(--amber-40)",
                }}
              />
            ) : (
              <Hash
                size={12}
                style={{
                  color: "var(--t3)",
                  flexShrink: 0,
                }}
              />
            )}
            <span
              style={{
                fontSize: "13px",
                color:
                  activeChat === chat.id ? "var(--t1)" : "var(--t2)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                fontWeight: activeChat === chat.id ? 500 : 400,
              }}
            >
              {chat.title}
            </span>
            <span
              className="font-mono"
              style={{ fontSize: "10px", color: "var(--t3)", flexShrink: 0 }}
            >
              {chat.time}
            </span>
          </NavItem>
        ))}

        {/* Workspaces */}
        <SectionLabel>Workspaces</SectionLabel>

        {workspaces.map((ws, i) => (
          <NavItem key={i} active={ws.active}>
            <div
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "5px",
                background: ws.active
                  ? "var(--amber-15)"
                  : "rgba(255,255,255,0.06)",
                border: ws.active
                  ? "1px solid var(--amber-25)"
                  : "1px solid var(--b1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span
                className="font-mono"
                style={{
                  fontSize: "8px",
                  fontWeight: 700,
                  color: ws.active ? "var(--amber)" : "var(--t3)",
                  letterSpacing: "0.04em",
                }}
              >
                {ws.slug}
              </span>
            </div>
            <span
              style={{
                fontSize: "13px",
                color: ws.active ? "var(--t1)" : "var(--t2)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                fontWeight: ws.active ? 500 : 400,
              }}
            >
              {ws.name}
            </span>
            <span
              className="font-mono"
              style={{
                fontSize: "10px",
                color: ws.active ? "var(--amber)" : "var(--t3)",
                flexShrink: 0,
              }}
            >
              {ws.count}
            </span>
          </NavItem>
        ))}

        {/* Quick links */}
        <SectionLabel>Tools</SectionLabel>

        {[
          { icon: Terminal, label: "Query Log" },
          { icon: Archive, label: "Documents" },
          { icon: Zap, label: "Audit Trail" },
        ].map(({ icon: Icon, label }) => (
          <NavItem key={label}>
            <Icon size={13} style={{ color: "var(--t3)", flexShrink: 0 }} />
            <span
              style={{
                fontSize: "13px",
                color: "var(--t2)",
              }}
            >
              {label}
            </span>
          </NavItem>
        ))}

        {/* Spacer */}
        <div style={{ height: "16px" }} />
      </nav>

      {/* ── Bottom user panel ───────────────────── */}
      <div
        style={{
          borderTop: "1px solid var(--b1)",
          padding: "10px 8px",
        }}
      >
        <NavItem>
          <Settings
            size={13}
            style={{ color: "var(--t3)", flexShrink: 0 }}
          />
          <span style={{ fontSize: "13px", color: "var(--t3)" }}>
            Settings
          </span>
        </NavItem>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 10px",
            borderRadius: "10px",
            background: "var(--raised)",
            border: "1px solid var(--b2)",
            marginTop: "6px",
            cursor: "pointer",
            transition: "border-color 0.15s ease",
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              background:
                "linear-gradient(135deg, rgba(34,211,238,0.2) 0%, rgba(6,182,212,0.1) 100%)",
              border: "1px solid var(--cyan-25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span
              className="font-mono"
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "var(--cyan)",
                letterSpacing: "0.04em",
              }}
            >
              AD
            </span>
          </div>

          <div style={{ flex: 1, overflow: "hidden" }}>
            <div
              style={{
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--t1)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Admin Console
            </div>
            <div
              className="font-mono"
              style={{
                fontSize: "9px",
                color: "var(--t3)",
                marginTop: "2px",
                letterSpacing: "0.04em",
              }}
            >
              root · full access
            </div>
          </div>

          <ChevronRight
            size={13}
            style={{ color: "var(--t3)", flexShrink: 0 }}
          />
        </div>
      </div>
    </aside>
  );
}

/* ─── New Session Button ───────────────────────── */
function NewSessionButton() {
  const [hov, setHov] = useState(false);
  return (
    <button
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        borderRadius: "10px",
        cursor: "pointer",
        border: "1px solid",
        borderColor: hov ? "var(--amber-40)" : "var(--amber-25)",
        background: hov
          ? "linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(245,158,11,0.08) 100%)"
          : "linear-gradient(135deg, rgba(245,158,11,0.10) 0%, rgba(245,158,11,0.04) 100%)",
        color: "var(--amber)",
        fontSize: "13px",
        fontWeight: 500,
        transition: "all 0.2s ease",
        boxShadow: hov ? "0 0 16px rgba(245,158,11,0.1)" : "none",
      }}
    >
      <span>New Session</span>
      <Plus size={14} />
    </button>
  );
}