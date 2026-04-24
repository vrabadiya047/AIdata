"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Shield, Plus, Hash, ChevronDown, ChevronUp, ChevronRight,
  Terminal, Archive, Zap, LogOut, Trash2,
  Globe, Lock, Users, Share2, MoreHorizontal, Pencil, Check, X, Camera,
} from "lucide-react";
import { useSession } from "@/contexts/SessionContext";
import { getWorkspaces, getProjectThreads } from "@/app/actions";
import { Workspace } from "@/types/sovereign";
import ShareModal from "@/components/ShareModal";
import SnapshotModal from "@/components/SnapshotModal";
import ThemeToggle from "@/components/ThemeToggle";
import QueryLogPanel from "@/components/QueryLogPanel";

interface SidebarProps {
  activeProject: string;
  activeThread: string;
  onSelectProject: (project: string) => void;
  onSelectThread: (thread: string) => void;
  onOpenDocs: () => void;
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "18px 12px 6px" }}>
      <span className="font-mono" style={{
        fontSize: "9px", letterSpacing: "0.2em", color: "var(--t2)",
        textTransform: "uppercase", flexShrink: 0,
      }}>{children}</span>
      <div style={{ flex: 1, height: "1px", background: "linear-gradient(90deg, var(--b1) 0%, transparent 100%)" }} />
    </div>
  );
}

// ─── NavItem ─────────────────────────────────────────────────────────────────
function NavItem({
  active, children, onClick,
}: {
  active?: boolean; children: React.ReactNode; onClick?: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: "10px",
        padding: "8px 12px", borderRadius: "8px", cursor: "pointer",
        border: active ? "1px solid var(--amber-25)" : "1px solid transparent",
        marginBottom: "2px",
        background: active
          ? "linear-gradient(90deg, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0.04) 100%)"
          : hov ? "var(--hover-bg)" : "transparent",
        transition: "all 0.15s ease", textAlign: "left",
      }}
    >
      {children}
    </button>
  );
}

// ─── ContextMenu ──────────────────────────────────────────────────────────────
function ContextMenu({
  items,
  onClose,
}: {
  items: { label: string; icon: React.ReactNode; danger?: boolean; onClick: () => void }[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} style={{
      position: "absolute", right: 0, top: "calc(100% + 2px)",
      background: "var(--surface)", border: "1px solid var(--b1)",
      borderRadius: "8px", padding: "4px", zIndex: 200,
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)", minWidth: "148px",
    }}>
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.onClick(); onClose(); }}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: "8px",
            padding: "7px 10px", background: "none", border: "none", cursor: "pointer",
            borderRadius: "6px", color: item.danger ? "#ef4444" : "var(--t2)",
            fontSize: "12px", textAlign: "left",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ─── ActionButtons ────────────────────────────────────────────────────────────
function ActionButtons({
  onNewChat, onNewWorkspace,
}: { onNewChat: () => void; onNewWorkspace: () => void }) {
  const [hovChat, setHovChat] = useState(false);
  const [hovWs, setHovWs] = useState(false);
  return (
    <div style={{ display: "flex", gap: "6px" }}>
      {/* New Chat — primary */}
      <button
        onClick={onNewChat}
        onMouseEnter={() => setHovChat(true)}
        onMouseLeave={() => setHovChat(false)}
        style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
          padding: "9px 12px", borderRadius: "10px", cursor: "pointer",
          border: "1px solid", borderColor: hovChat ? "var(--amber-40)" : "var(--amber-25)",
          background: hovChat
            ? "linear-gradient(135deg, rgba(245,158,11,0.22) 0%, rgba(245,158,11,0.10) 100%)"
            : "linear-gradient(135deg, rgba(245,158,11,0.13) 0%, rgba(245,158,11,0.05) 100%)",
          color: "var(--amber)", fontSize: "12.5px", fontWeight: 600,
          transition: "all 0.2s ease",
          boxShadow: hovChat ? "0 0 18px rgba(245,158,11,0.12), inset 0 1px 0 rgba(245,158,11,0.1)" : "none",
        }}
      >
        <Plus size={13} strokeWidth={2.5} />
        <span>New Chat</span>
      </button>
      {/* New Workspace — secondary */}
      <button
        onClick={onNewWorkspace}
        onMouseEnter={() => setHovWs(true)}
        onMouseLeave={() => setHovWs(false)}
        title="New Workspace"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
          padding: "9px 11px", borderRadius: "10px", cursor: "pointer",
          border: "1px solid", borderColor: hovWs ? "var(--b1)" : "var(--b2)",
          background: hovWs ? "var(--hover-bg)" : "var(--raised)",
          color: hovWs ? "var(--t1)" : "var(--t2)", fontSize: "11px", fontWeight: 500,
          transition: "all 0.2s ease", whiteSpace: "nowrap",
        }}
      >
        <Plus size={11} />
        <span>Workspace</span>
      </button>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
export default function Sidebar({
  activeProject, activeThread, onSelectProject, onSelectThread, onOpenDocs,
}: SidebarProps) {
  const { session } = useSession();
  const router = useRouter();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [threads, setThreads] = useState<string[]>([]);

  // Workspace dropdown
  const [wsOpen, setWsOpen] = useState(false);
  const wsDropdownRef = useRef<HTMLDivElement>(null);

  // Context menus — track by key
  const [wsMenu, setWsMenu] = useState<string | null>(null);
  const [threadMenu, setThreadMenu] = useState<string | null>(null);

  // Inline rename state
  const [renamingWs, setRenamingWs] = useState<{ key: string; value: string } | null>(null);
  const [renamingThread, setRenamingThread] = useState<{ id: string; value: string } | null>(null);

  // Create workspace
  const [showNewWs, setShowNewWs] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [creating, setCreating] = useState(false);

  const [shareTarget, setShareTarget] = useState<Workspace | null>(null);
  const [showQueryLog, setShowQueryLog] = useState(false);
  const [snapshotThread, setSnapshotThread] = useState<string | null>(null);

  const username = session?.username ?? "";

  // Close workspace dropdown on outside click
  useEffect(() => {
    if (!wsOpen) return;
    function handler(e: MouseEvent) {
      if (wsDropdownRef.current && !wsDropdownRef.current.contains(e.target as Node)) {
        setWsOpen(false);
        setWsMenu(null);
        setShowNewWs(false);
        setNewWsName("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [wsOpen]);

  const loadWorkspaces = useCallback(async () => {
    if (!username) return;
    const ws = await getWorkspaces(username);
    setWorkspaces(ws);
    if (!activeProject && ws.length > 0) onSelectProject(ws[0].name);
  }, [username]);

  const loadThreads = useCallback(async () => {
    if (!username || !activeProject) { setThreads([]); return; }
    const t = await getProjectThreads(activeProject, username);
    setThreads(t);
  }, [username, activeProject]);

  useEffect(() => { loadWorkspaces(); }, [loadWorkspaces]);
  useEffect(() => { loadThreads(); }, [loadThreads]);

  const activeWs = workspaces.find((w) => w.name === activeProject);

  // ── Workspace CRUD ────────────────────────────────────────────────────────
  async function createWorkspace() {
    if (!newWsName.trim() || creating) return;
    setCreating(true);
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newWsName.trim() }),
    });
    setNewWsName("");
    setShowNewWs(false);
    setCreating(false);
    await loadWorkspaces();
  }

  async function deleteWorkspace(name: string) {
    await fetch("/api/projects", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (activeProject === name) onSelectProject("");
    await loadWorkspaces();
  }

  async function commitRenameWs(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) { setRenamingWs(null); return; }
    await fetch("/api/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ old_name: oldName, new_name: trimmed }),
    });
    if (activeProject === oldName) onSelectProject(trimmed);
    setRenamingWs(null);
    await loadWorkspaces();
  }

  // ── Thread CRUD ───────────────────────────────────────────────────────────
  async function deleteThread(threadId: string) {
    await fetch("/api/threads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: activeProject, thread_id: threadId }),
    });
    if (activeThread === threadId) onSelectThread("");
    await loadThreads();
  }

  async function commitRenameThread(oldId: string, newId: string) {
    const trimmed = newId.trim();
    if (!trimmed || trimmed === oldId) { setRenamingThread(null); return; }
    await fetch("/api/threads", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: activeProject, old_id: oldId, new_id: trimmed }),
    });
    if (activeThread === oldId) onSelectThread(trimmed);
    setRenamingThread(null);
    await loadThreads();
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const initials = username.slice(0, 2).toUpperCase() || "??";

  function visIcon(vis: string) {
    return vis === "public" ? Globe : vis === "shared" ? Users : Lock;
  }
  function visColor(vis: string) {
    return vis === "public" ? "var(--green)" : vis === "shared" ? "var(--cyan)" : "var(--t3)";
  }

  return (
    <>
      <aside style={{
        width: "268px", minWidth: "268px",
        background: "var(--surface)", borderRight: "1px solid var(--b1)",
        display: "flex", flexDirection: "column", height: "100%",
        position: "relative", overflow: "hidden",
      }}>
        {/* Background glow */}
        <div style={{
          position: "absolute", top: "-80px", left: "-80px",
          width: "240px", height: "240px",
          background: "radial-gradient(circle, rgba(245,158,11,0.07) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Logo */}
        <div style={{ padding: "22px 18px 18px", borderBottom: "1px solid var(--b1)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div className="pulse-amber" style={{
              width: "38px", height: "38px", flexShrink: 0,
              background: "linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0.05) 100%)",
              border: "1px solid var(--amber-40)", borderRadius: "10px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Shield size={18} style={{ color: "var(--amber)" }} />
            </div>
            <div>
              <div className="font-display" style={{
                fontSize: "14px", fontWeight: 800, letterSpacing: "0.06em",
                color: "var(--amber)", lineHeight: 1, textTransform: "uppercase",
              }}>Sovereign</div>
              <div className="font-mono" style={{
                fontSize: "9px", letterSpacing: "0.12em",
                color: "rgba(245,158,11,0.45)", lineHeight: 1, marginTop: "4px",
              }}>Intelligence System</div>
            </div>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: "8px", marginTop: "14px",
            padding: "7px 10px", background: "var(--green-10)", borderRadius: "6px",
            border: "1px solid rgba(16,185,129,0.12)",
          }}>
            <div className="pulse-green" style={{
              width: "6px", height: "6px", flexShrink: 0,
              borderRadius: "50%", background: "var(--green)",
            }} />
            <span className="font-mono" style={{ fontSize: "9px", color: "var(--green)", letterSpacing: "0.08em" }}>
              SYS ONLINE · LOCAL INFERENCE
            </span>
          </div>
        </div>

        {/* Scrollable nav */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>

          {/* ── Workspace Dropdown ────────────────────────────────────────── */}
          <SectionLabel>Workspace</SectionLabel>
          <div ref={wsDropdownRef}>
            {/* Trigger */}
            <button
              onClick={() => { setWsOpen(!wsOpen); setWsMenu(null); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: "9px",
                padding: "8px 10px", borderRadius: "8px", cursor: "pointer",
                border: "1px solid var(--b1)", marginBottom: "4px",
                background: wsOpen ? "var(--hover-bg)" : "var(--raised)",
                transition: "background 0.15s ease", textAlign: "left",
              }}
            >
              {activeWs ? (
                <div style={{
                  width: "22px", height: "22px", borderRadius: "5px", flexShrink: 0,
                  background: "var(--amber-15)", border: "1px solid var(--amber-25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span className="font-mono" style={{ fontSize: "8px", fontWeight: 700, color: "var(--amber)" }}>
                    {activeWs.name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
              ) : (
                <div style={{
                  width: "22px", height: "22px", borderRadius: "5px", flexShrink: 0,
                  background: "var(--icon-bg)", border: "1px solid var(--b1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span className="font-mono" style={{ fontSize: "10px", color: "var(--t3)" }}>—</span>
                </div>
              )}
              <span style={{
                flex: 1, fontSize: "13px",
                color: activeWs ? "var(--t1)" : "var(--t3)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                fontWeight: activeWs ? 500 : 400,
              }}>
                {activeWs ? activeWs.name : "Select workspace"}
              </span>
              {wsOpen
                ? <ChevronUp size={12} style={{ color: "var(--t3)", flexShrink: 0 }} />
                : <ChevronDown size={12} style={{ color: "var(--t3)", flexShrink: 0 }} />}
            </button>

            {/* Dropdown list */}
            {wsOpen && (
              <div style={{
                marginBottom: "4px",
                background: "var(--raised)", border: "1px solid var(--b1)",
                borderRadius: "8px",
              }}>
                {workspaces.length === 0 && !showNewWs && (
                  <div style={{ padding: "12px", textAlign: "center", fontSize: "12px", color: "var(--t3)" }}>
                    No workspaces yet
                  </div>
                )}

                {workspaces.map((ws) => {
                  const key = `${ws.owner}/${ws.name}`;
                  const isActive = activeProject === ws.name;
                  const isOwn = ws.access === "own";
                  const VIcon = visIcon(ws.visibility);
                  const vColor = visColor(ws.visibility);

                  return (
                    <div key={key}>
                      {renamingWs?.key === key ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "6px 8px" }}>
                          <input
                            autoFocus
                            value={renamingWs.value}
                            onChange={(e) => setRenamingWs({ key, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRenameWs(ws.name, renamingWs.value);
                              if (e.key === "Escape") setRenamingWs(null);
                            }}
                            style={{
                              flex: 1, padding: "4px 8px",
                              background: "var(--surface)", border: "1px solid var(--amber-25)",
                              borderRadius: "5px", color: "var(--t1)", fontSize: "12px", outline: "none",
                            }}
                          />
                          <button
                            onClick={() => commitRenameWs(ws.name, renamingWs.value)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--green)", padding: "2px" }}
                          ><Check size={12} /></button>
                          <button
                            onClick={() => setRenamingWs(null)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", padding: "2px" }}
                          ><X size={12} /></button>
                        </div>
                      ) : (
                        <div style={{
                          display: "flex", alignItems: "center", gap: "2px",
                          padding: "6px 8px",
                          background: isActive ? "var(--amber-10)" : "transparent",
                          borderRadius: "6px", margin: "2px 4px",
                        }}>
                          <button
                            onClick={() => { onSelectProject(ws.name); setWsOpen(false); setWsMenu(null); }}
                            style={{
                              flex: 1, display: "flex", alignItems: "center", gap: "8px",
                              background: "none", border: "none", cursor: "pointer", textAlign: "left", minWidth: 0,
                            }}
                          >
                            <div style={{
                              width: "20px", height: "20px", borderRadius: "4px", flexShrink: 0,
                              background: isActive ? "var(--amber-15)" : "var(--icon-bg)",
                              border: isActive ? "1px solid var(--amber-25)" : "1px solid var(--b1)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              <span className="font-mono" style={{ fontSize: "7px", fontWeight: 700, color: isActive ? "var(--amber)" : "var(--t3)" }}>
                                {ws.name.slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <span style={{
                              fontSize: "12.5px",
                              color: isActive ? "var(--t1)" : "var(--t2)",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              flex: 1, fontWeight: isActive ? 500 : 400,
                            }}>{ws.name}</span>
                            <VIcon size={9} style={{ color: vColor, flexShrink: 0 }} />
                          </button>

                          {/* Context menu trigger */}
                          <div style={{ position: "relative", flexShrink: 0 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setWsMenu(wsMenu === key ? null : key); }}
                              style={{
                                background: "none", border: "none", cursor: "pointer",
                                color: "var(--t3)", padding: "3px 4px", borderRadius: "4px",
                                display: "flex", alignItems: "center",
                              }}
                            >
                              <MoreHorizontal size={12} />
                            </button>
                            {wsMenu === key && isOwn && (
                              <ContextMenu
                                onClose={() => setWsMenu(null)}
                                items={[
                                  {
                                    label: "Rename",
                                    icon: <Pencil size={11} />,
                                    onClick: () => { setRenamingWs({ key, value: ws.name }); },
                                  },
                                  {
                                    label: "Share & Visibility",
                                    icon: <Share2 size={11} />,
                                    onClick: () => { setShareTarget(ws); setWsOpen(false); },
                                  },
                                  {
                                    label: "Delete",
                                    icon: <Trash2 size={11} />,
                                    danger: true,
                                    onClick: () => deleteWorkspace(ws.name),
                                  },
                                ]}
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* New workspace row */}
                <div style={{ borderTop: workspaces.length > 0 ? "1px solid var(--b1)" : "none", padding: "4px" }}>
                  {showNewWs ? (
                    <div style={{ display: "flex", gap: "4px", padding: "4px" }}>
                      <input
                        autoFocus
                        value={newWsName}
                        onChange={(e) => setNewWsName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") createWorkspace();
                          if (e.key === "Escape") { setShowNewWs(false); setNewWsName(""); }
                        }}
                        placeholder="Workspace name"
                        style={{
                          flex: 1, padding: "5px 8px",
                          background: "var(--surface)", border: "1px solid var(--amber-25)",
                          borderRadius: "5px", color: "var(--t1)", fontSize: "11px", outline: "none",
                        }}
                      />
                      <button
                        onClick={createWorkspace}
                        disabled={creating}
                        style={{
                          padding: "5px 10px", background: "rgba(245,158,11,0.85)", border: "none",
                          borderRadius: "5px", color: "var(--void)", fontSize: "11px",
                          fontWeight: 600, cursor: creating ? "not-allowed" : "pointer",
                        }}
                      >{creating ? "..." : "Add"}</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowNewWs(true)}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: "7px",
                        padding: "7px 10px", background: "none", border: "none", cursor: "pointer",
                        color: "var(--t3)", fontSize: "12px", borderRadius: "5px",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                    >
                      <Plus size={11} />
                      <span>New workspace</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── New Chat + New Workspace ──────────────────────────────────── */}
          <div style={{ padding: "6px 2px 2px" }}>
            <ActionButtons
              onNewChat={() => { if (activeProject) onSelectThread(`Thread-${Date.now()}`); }}
              onNewWorkspace={() => { setWsOpen(true); setTimeout(() => setShowNewWs(true), 50); }}
            />
          </div>

          {/* ── Tools — always visible ────────────────────────────────────── */}
          <SectionLabel>Tools</SectionLabel>
          <NavItem onClick={onOpenDocs}>
            <div style={{
              width: "26px", height: "26px", borderRadius: "7px", flexShrink: 0,
              background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Archive size={12} style={{ color: "var(--cyan)" }} />
            </div>
            <span style={{ fontSize: "13px", color: "var(--t1)", fontWeight: 500 }}>Documents</span>
          </NavItem>
          <NavItem onClick={() => setShowQueryLog(true)}>
            <div style={{
              width: "26px", height: "26px", borderRadius: "7px", flexShrink: 0,
              background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Terminal size={12} style={{ color: "var(--green)" }} />
            </div>
            <span style={{ fontSize: "13px", color: "var(--t1)", fontWeight: 500 }}>Query Log</span>
          </NavItem>
          {session?.role === "Admin" && (
            <NavItem onClick={() => router.push("/admin")}>
              <div style={{
                width: "26px", height: "26px", borderRadius: "7px", flexShrink: 0,
                background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Zap size={12} style={{ color: "var(--amber)" }} />
              </div>
              <span style={{ fontSize: "13px", color: "var(--amber)", fontWeight: 500 }}>Admin</span>
            </NavItem>
          )}

          {/* ── History ──────────────────────────────────────────────────── */}
          {activeProject && threads.length > 0 && (
            <>
              <SectionLabel>History</SectionLabel>
              {threads.map((t) => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                  {renamingThread?.id === t ? (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "4px", padding: "4px 6px" }}>
                      <input
                        autoFocus
                        value={renamingThread.value}
                        onChange={(e) => setRenamingThread({ id: t, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRenameThread(t, renamingThread.value);
                          if (e.key === "Escape") setRenamingThread(null);
                        }}
                        style={{
                          flex: 1, padding: "4px 8px",
                          background: "var(--raised)", border: "1px solid var(--amber-25)",
                          borderRadius: "5px", color: "var(--t1)", fontSize: "12px", outline: "none",
                        }}
                      />
                      <button onClick={() => commitRenameThread(t, renamingThread.value)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--green)", padding: "2px" }}
                      ><Check size={12} /></button>
                      <button onClick={() => setRenamingThread(null)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", padding: "2px" }}
                      ><X size={12} /></button>
                    </div>
                  ) : (
                    <>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <NavItem active={activeThread === t} onClick={() => onSelectThread(t)}>
                          {activeThread === t ? (
                            <div style={{ width: "3px", height: "16px", borderRadius: "2px", background: "var(--amber)", flexShrink: 0, boxShadow: "0 0 8px rgba(245,158,11,0.5)" }} />
                          ) : (
                            <Hash size={11} style={{ color: "var(--t3)", flexShrink: 0 }} />
                          )}
                          <span style={{
                            fontSize: "12.5px",
                            color: activeThread === t ? "var(--t1)" : "var(--t1)",
                            opacity: activeThread === t ? 1 : 0.7,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            flex: 1, fontWeight: activeThread === t ? 600 : 400,
                          }}>{t}</span>
                        </NavItem>
                      </div>
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setThreadMenu(threadMenu === t ? null : t); }}
                          style={{
                            background: "none", border: "none", cursor: "pointer",
                            color: "var(--t3)", padding: "5px 4px", borderRadius: "4px",
                            display: "flex", alignItems: "center",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--t2)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--t3)")}
                        >
                          <MoreHorizontal size={12} />
                        </button>
                        {threadMenu === t && (
                          <ContextMenu
                            onClose={() => setThreadMenu(null)}
                            items={[
                              { label: "Rename", icon: <Pencil size={11} />, onClick: () => setRenamingThread({ id: t, value: t }) },
                              { label: "Snapshot", icon: <Camera size={11} />, onClick: () => { setSnapshotThread(t); setThreadMenu(null); } },
                              { label: "Delete", icon: <Trash2 size={11} />, danger: true, onClick: () => deleteThread(t) },
                            ]}
                          />
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </>
          )}

          <div style={{ height: "16px" }} />
        </nav>

        {/* Bottom user panel */}
        <div style={{ borderTop: "1px solid var(--b1)", padding: "10px 8px", flexShrink: 0 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "4px 10px 10px",
          }}>
            <span className="font-mono" style={{ fontSize: "9px", color: "var(--t3)", letterSpacing: "0.14em" }}>
              APPEARANCE
            </span>
            <ThemeToggle />
          </div>

          <NavItem onClick={handleLogout}>
            <LogOut size={13} style={{ color: "#ef4444", flexShrink: 0 }} />
            <span style={{ fontSize: "13px", color: "var(--t2)", fontWeight: 500 }}>Sign out</span>
          </NavItem>

          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "10px 10px", borderRadius: "10px",
            background: "var(--raised)", border: "1px solid var(--b2)", marginTop: "6px",
          }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "8px", flexShrink: 0,
              background: "linear-gradient(135deg, var(--cyan-10) 0%, rgba(6,182,212,0.08) 100%)",
              border: "1px solid var(--cyan-25)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span className="font-mono" style={{ fontSize: "11px", fontWeight: 700, color: "var(--cyan)", letterSpacing: "0.04em" }}>
                {initials}
              </span>
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {username || "Loading..."}
              </div>
              <div className="font-mono" style={{ fontSize: "9px", color: "var(--t3)", marginTop: "2px", letterSpacing: "0.04em" }}>
                {session?.role ?? "—"}
              </div>
            </div>
            <ChevronRight size={13} style={{ color: "var(--t3)", flexShrink: 0 }} />
          </div>
        </div>
      </aside>

      {shareTarget && (
        <ShareModal
          project={shareTarget.name}
          owner={shareTarget.owner}
          currentVisibility={shareTarget.visibility}
          onClose={() => setShareTarget(null)}
          onUpdated={() => { setShareTarget(null); loadWorkspaces(); }}
        />
      )}

      {showQueryLog && <QueryLogPanel onClose={() => setShowQueryLog(false)} />}

      {snapshotThread && (
        <SnapshotModal
          project={activeProject}
          threadId={snapshotThread}
          onClose={() => setSnapshotThread(null)}
        />
      )}
    </>
  );
}
