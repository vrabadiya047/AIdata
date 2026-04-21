"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Shield, Plus, Hash,
  ChevronRight, Terminal, Archive, Zap, LogOut, Trash2,
  Globe, Lock, Users, Share2,
} from "lucide-react";
import { useSession } from "@/contexts/SessionContext";
import { getWorkspaces, getProjectThreads } from "@/app/actions";
import { Workspace } from "@/types/sovereign";
import ShareModal from "@/components/ShareModal";

interface SidebarProps {
  activeProject: string;
  activeThread: string;
  onSelectProject: (project: string) => void;
  onSelectThread: (thread: string) => void;
  onOpenDocs: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono" style={{
      fontSize: "9px", letterSpacing: "0.18em", color: "var(--t3)",
      padding: "18px 12px 7px", textTransform: "uppercase",
    }}>
      {children}
    </div>
  );
}

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
        width: "100%", display: "flex", alignItems: "center", gap: "9px",
        padding: "8px 10px", borderRadius: "8px", cursor: "pointer",
        border: "none", marginBottom: "1px",
        background: active
          ? "linear-gradient(90deg, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0.04) 100%)"
          : hov ? "rgba(255,255,255,0.04)" : "transparent",
        transition: "background 0.15s ease", textAlign: "left",
      }}
    >
      {children}
    </button>
  );
}

export default function Sidebar({
  activeProject, activeThread, onSelectProject, onSelectThread, onOpenDocs,
}: SidebarProps) {
  const { session } = useSession();
  const router = useRouter();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [threads, setThreads] = useState<string[]>([]);
  const [newWsName, setNewWsName] = useState("");
  const [showNewWs, setShowNewWs] = useState(false);
  const [creating, setCreating] = useState(false);
  const [shareTarget, setShareTarget] = useState<Workspace | null>(null);

  const username = session?.username ?? "";

  const loadWorkspaces = useCallback(async () => {
    if (!username) return;
    const ws = await getWorkspaces(username);
    setWorkspaces(ws);
    if (!activeProject && ws.length > 0) onSelectProject(ws[0].name);
  }, [username]);

  const loadThreads = useCallback(async () => {
    if (!username || !activeProject) return;
    const t = await getProjectThreads(activeProject, username);
    setThreads(t);
  }, [username, activeProject]);

  useEffect(() => { loadWorkspaces(); }, [loadWorkspaces]);
  useEffect(() => { loadThreads(); }, [loadThreads]);

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

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const initials = username.slice(0, 2).toUpperCase() || "??";

  return (
    <>
    <aside style={{
      width: "268px", minWidth: "268px",
      background: "var(--surface)", borderRight: "1px solid var(--b1)",
      display: "flex", flexDirection: "column", height: "100%",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: "-80px", left: "-80px",
        width: "240px", height: "240px",
        background: "radial-gradient(circle, rgba(245,158,11,0.07) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Logo */}
      <div style={{ padding: "22px 18px 18px", borderBottom: "1px solid var(--b1)" }}>
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

      {/* New Session */}
      <div style={{ padding: "14px 14px 8px" }}>
        <NewSessionButton onClick={() => {
          if (activeProject) onSelectThread(`Thread-${Date.now()}`);
        }} />
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
        {/* Threads */}
        {activeProject && (
          <>
            <SectionLabel>Recent Sessions</SectionLabel>
            {threads.map((t) => (
              <NavItem key={t} active={activeThread === t} onClick={() => onSelectThread(t)}>
                {activeThread === t ? (
                  <div style={{ width: "3px", height: "16px", borderRadius: "2px", background: "var(--amber)", flexShrink: 0, boxShadow: "0 0 6px var(--amber-40)" }} />
                ) : (
                  <Hash size={12} style={{ color: "var(--t3)", flexShrink: 0 }} />
                )}
                <span style={{
                  fontSize: "13px",
                  color: activeThread === t ? "var(--t1)" : "var(--t2)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  flex: 1, fontWeight: activeThread === t ? 500 : 400,
                }}>{t}</span>
              </NavItem>
            ))}
          </>
        )}

        {/* Workspaces */}
        <SectionLabel>Workspaces</SectionLabel>

        {workspaces.map((ws) => {
          const isActive = activeProject === ws.name;
          const isOwn = ws.access === "own";
          const VisIcon = ws.visibility === "public" ? Globe : ws.visibility === "shared" ? Users : Lock;
          const visColor = ws.visibility === "public" ? "var(--green)" : ws.visibility === "shared" ? "var(--cyan)" : "var(--t3)";
          return (
            <div key={`${ws.owner}/${ws.name}`} style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <NavItem active={isActive} onClick={() => onSelectProject(ws.name)}>
                  <div style={{
                    width: "22px", height: "22px", borderRadius: "5px", flexShrink: 0,
                    background: isActive ? "var(--amber-15)" : "rgba(255,255,255,0.06)",
                    border: isActive ? "1px solid var(--amber-25)" : "1px solid var(--b1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span className="font-mono" style={{ fontSize: "8px", fontWeight: 700, color: isActive ? "var(--amber)" : "var(--t3)", letterSpacing: "0.04em" }}>
                      {ws.name.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <span style={{
                    fontSize: "13px", color: isActive ? "var(--t1)" : "var(--t2)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    flex: 1, fontWeight: isActive ? 500 : 400,
                  }}>{ws.name}</span>
                  <span title={ws.visibility} style={{ display: "flex", flexShrink: 0 }}><VisIcon size={10} style={{ color: visColor }} /></span>
                </NavItem>
              </div>
              {isOwn && (
                <button onClick={() => setShareTarget(ws)} title="Share" style={{ flexShrink: 0, padding: "4px", background: "none", border: "none", cursor: "pointer", color: "var(--t3)", borderRadius: "4px" }}>
                  <Share2 size={11} />
                </button>
              )}
              {isOwn && (
                <button onClick={() => deleteWorkspace(ws.name)} title="Delete" style={{ flexShrink: 0, padding: "4px", background: "none", border: "none", cursor: "pointer", color: "var(--t3)", borderRadius: "4px" }}>
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          );
        })}

        {/* Empty state CTA */}
        {workspaces.length === 0 && !showNewWs && (
          <div style={{
            margin: "8px 4px", padding: "12px", borderRadius: "8px",
            background: "rgba(245,158,11,0.06)", border: "1px dashed rgba(245,158,11,0.25)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: "12px", color: "var(--t2)", marginBottom: "8px" }}>No workspaces yet</div>
            <button
              onClick={() => setShowNewWs(true)}
              style={{
                padding: "6px 14px", background: "rgba(245,158,11,0.85)", border: "none",
                borderRadius: "6px", color: "var(--void)", fontSize: "12px",
                fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "5px",
              }}
            >
              <Plus size={11} /> Create workspace
            </button>
          </div>
        )}

        {/* New workspace input */}
        {showNewWs ? (
          <div style={{ padding: "6px 4px", display: "flex", gap: "6px" }}>
            <input
              autoFocus
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createWorkspace(); if (e.key === "Escape") setShowNewWs(false); }}
              placeholder="Workspace name"
              style={{
                flex: 1, padding: "6px 10px",
                background: "var(--raised)", border: "1px solid var(--amber-25)",
                borderRadius: "6px", color: "var(--t1)", fontSize: "12px", outline: "none",
              }}
            />
            <button onClick={createWorkspace} disabled={creating} style={{
              padding: "6px 10px", background: "rgba(245,158,11,0.85)", border: "none",
              borderRadius: "6px", color: "var(--void)", fontSize: "11px",
              fontWeight: 600, cursor: creating ? "not-allowed" : "pointer",
            }}>{creating ? "..." : "Add"}</button>
          </div>
        ) : workspaces.length > 0 ? (
          <NavItem onClick={() => setShowNewWs(true)}>
            <Plus size={12} style={{ color: "var(--t3)", flexShrink: 0 }} />
            <span style={{ fontSize: "12px", color: "var(--t3)" }}>New workspace</span>
          </NavItem>
        ) : null}

        {/* Tools */}
        <SectionLabel>Tools</SectionLabel>
        <NavItem onClick={onOpenDocs}>
          <Archive size={13} style={{ color: "var(--t3)", flexShrink: 0 }} />
          <span style={{ fontSize: "13px", color: "var(--t2)" }}>Documents</span>
        </NavItem>
        <NavItem>
          <Terminal size={13} style={{ color: "var(--t3)", flexShrink: 0 }} />
          <span style={{ fontSize: "13px", color: "var(--t2)" }}>Query Log</span>
        </NavItem>
        {session?.role === "Admin" && (
          <NavItem onClick={() => router.push("/admin")}>
            <Zap size={13} style={{ color: "var(--amber)", flexShrink: 0 }} />
            <span style={{ fontSize: "13px", color: "var(--amber)" }}>Admin</span>
          </NavItem>
        )}

        <div style={{ height: "16px" }} />
      </nav>

      {/* Bottom user panel */}
      <div style={{ borderTop: "1px solid var(--b1)", padding: "10px 8px" }}>
        <NavItem onClick={handleLogout}>
          <LogOut size={13} style={{ color: "var(--t3)", flexShrink: 0 }} />
          <span style={{ fontSize: "13px", color: "var(--t3)" }}>Sign out</span>
        </NavItem>

        <div style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "10px 10px", borderRadius: "10px",
          background: "var(--raised)", border: "1px solid var(--b2)", marginTop: "6px",
        }}>
          <div style={{
            width: "32px", height: "32px", borderRadius: "8px", flexShrink: 0,
            background: "linear-gradient(135deg, rgba(34,211,238,0.2) 0%, rgba(6,182,212,0.1) 100%)",
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
        project={shareTarget!.name}
        owner={shareTarget!.owner}
        currentVisibility={shareTarget!.visibility}
        onClose={() => setShareTarget(null)}
        onUpdated={() => { setShareTarget(null); loadWorkspaces(); }}
      />
    )}
  </>
  );
}

function NewSessionButton({ onClick }: { onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderRadius: "10px", cursor: "pointer",
        border: "1px solid", borderColor: hov ? "var(--amber-40)" : "var(--amber-25)",
        background: hov
          ? "linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(245,158,11,0.08) 100%)"
          : "linear-gradient(135deg, rgba(245,158,11,0.10) 0%, rgba(245,158,11,0.04) 100%)",
        color: "var(--amber)", fontSize: "13px", fontWeight: 500,
        transition: "all 0.2s ease",
        boxShadow: hov ? "0 0 16px rgba(245,158,11,0.1)" : "none",
      }}
    >
      <span>New Session</span>
      <Plus size={14} />
    </button>
  );
}
