"use client";

import { useState, useEffect } from "react";
import { X, Globe, Lock, Users, Plus, Trash2, UserPlus, Shield, FileText, MessageSquare, Upload, Search } from "lucide-react";

interface ShareModalProps {
  project: string;
  owner: string;
  currentVisibility: string;
  onClose: () => void;
  onUpdated: () => void;
}

interface SharedUser {
  username: string;
  permissions: string[];
}

const VISIBILITY_OPTIONS = [
  { value: "private", label: "Private",  icon: Lock,  desc: "Only you can access",          color: "var(--t3)" },
  { value: "public",  label: "Public",   icon: Globe, desc: "Everyone in the system",        color: "var(--green)" },
  { value: "shared",  label: "Shared",   icon: Users, desc: "Specific users or groups",      color: "var(--cyan)" },
];

const PERM_DEFS = [
  { id: "documents", label: "Documents", desc: "View uploaded files",     icon: FileText,      color: "var(--cyan)" },
  { id: "chats",     label: "Chats",     desc: "View & create threads",   icon: MessageSquare, color: "var(--green)" },
  { id: "upload",    label: "Upload",    desc: "Upload new documents",     icon: Upload,        color: "var(--amber)" },
  { id: "query",     label: "Query",     desc: "Ask questions (RAG)",      icon: Search,        color: "#a78bfa" },
] as const;

type PermId = (typeof PERM_DEFS)[number]["id"];

function PermChips({
  selected,
  onChange,
  small = false,
}: {
  selected: string[];
  onChange: (p: string[]) => void;
  small?: boolean;
}) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      {PERM_DEFS.map(({ id, label, icon: Icon, color }) => {
        const active = selected.includes(id);
        return (
          <button
            key={id}
            onClick={() => toggle(id)}
            style={{
              display: "flex", alignItems: "center", gap: small ? "4px" : "5px",
              padding: small ? "3px 8px" : "5px 10px",
              borderRadius: "6px", border: `1px solid ${active ? color : "var(--b2)"}`,
              background: active ? `color-mix(in srgb, ${color} 12%, transparent)` : "transparent",
              color: active ? color : "var(--t3)",
              fontSize: small ? "10px" : "11px", fontWeight: 500, cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <Icon size={small ? 10 : 11} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default function ShareModal({ project, owner, currentVisibility, onClose, onUpdated }: ShareModalProps) {
  const [visibility, setVisibility] = useState(currentVisibility);
  const [sharedWith, setSharedWith] = useState<SharedUser[]>([]);
  const [groups, setGroups] = useState<{ name: string; members: string[] }[]>([]);
  const [newUser, setNewUser] = useState("");
  const [newUserPerms, setNewUserPerms] = useState<string[]>(["documents", "chats"]);
  const [newGroup, setNewGroup] = useState("");
  const [newGroupMember, setNewGroupMember] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"visibility" | "users" | "groups">("visibility");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [editingPerms, setEditingPerms] = useState<Record<string, string[]>>({});

  useEffect(() => {
    fetchShares();
    fetchGroups();
  }, []);

  async function fetchShares() {
    const res = await fetch(`/api/projects/${encodeURIComponent(project)}/shares`);
    if (res.ok) {
      const data = await res.json();
      const list: SharedUser[] = (data.shared_with ?? []).map((item: SharedUser | string) =>
        typeof item === "string" ? { username: item, permissions: ["documents", "chats"] } : item,
      );
      setSharedWith(list);
    }
  }

  async function fetchGroups() {
    const res = await fetch("/api/groups");
    if (res.ok) setGroups((await res.json()).groups ?? []);
  }

  async function saveVisibility(v: string) {
    setSaving(true);
    await fetch(`/api/projects/${encodeURIComponent(project)}/visibility`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: v }),
    });
    setSaving(false);
    setVisibility(v);
    onUpdated();
  }

  async function addUser() {
    if (!newUser.trim()) return;
    await fetch(`/api/projects/${encodeURIComponent(project)}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shared_with: newUser.trim(), permissions: newUserPerms }),
    });
    setNewUser("");
    setNewUserPerms(["documents", "chats"]);
    await fetchShares();
  }

  async function removeUser(u: string) {
    await fetch(`/api/projects/${encodeURIComponent(project)}/share/${encodeURIComponent(u)}`, {
      method: "DELETE",
    });
    setExpandedUser(null);
    await fetchShares();
  }

  async function savePermissions(u: string) {
    const perms = editingPerms[u] ?? [];
    await fetch(`/api/projects/${encodeURIComponent(project)}/share/${encodeURIComponent(u)}/permissions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: perms }),
    });
    await fetchShares();
    setExpandedUser(null);
  }

  async function createGroup() {
    if (!newGroup.trim()) return;
    await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newGroup.trim() }),
    });
    setNewGroup("");
    await fetchGroups();
  }

  async function removeGroup(name: string) {
    await fetch(`/api/groups/${encodeURIComponent(name)}`, { method: "DELETE" });
    await fetchGroups();
  }

  async function addMember(groupName: string) {
    if (!newGroupMember.trim()) return;
    await fetch(`/api/groups/${encodeURIComponent(groupName)}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newGroupMember.trim() }),
    });
    setNewGroupMember("");
    await fetchGroups();
  }

  async function removeMember(groupName: string, member: string) {
    await fetch(`/api/groups/${encodeURIComponent(groupName)}/members/${encodeURIComponent(member)}`, {
      method: "DELETE",
    });
    await fetchGroups();
  }

  async function shareWithGroup(groupName: string) {
    await fetch(`/api/projects/${encodeURIComponent(project)}/share`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_name: groupName, group_owner: owner }),
    });
    onUpdated();
  }

  const tabs = [
    { id: "visibility", label: "Visibility" },
    { id: "users",      label: "Share with users" },
    { id: "groups",     label: "Groups" },
  ] as const;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "500px", maxHeight: "82vh",
          background: "var(--surface)", border: "1px solid var(--b2)",
          borderRadius: "16px", overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--b1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--t1)" }}>Share workspace</div>
            <div className="font-mono" style={{ fontSize: "9px", color: "var(--t3)", letterSpacing: "0.08em", marginTop: "3px" }}>{project}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)" }}>
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--b1)" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                flex: 1, padding: "11px 8px", border: "none", background: "none",
                cursor: "pointer", fontSize: "12px", fontWeight: 500,
                color: activeTab === t.id ? "var(--amber)" : "var(--t3)",
                borderBottom: activeTab === t.id ? "2px solid var(--amber)" : "2px solid transparent",
                transition: "all 0.15s ease",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "12px" }}>

          {/* ── Visibility tab ── */}
          {activeTab === "visibility" && VISIBILITY_OPTIONS.map(({ value, label, icon: Icon, desc, color }) => (
            <button
              key={value}
              onClick={() => saveVisibility(value)}
              style={{
                display: "flex", alignItems: "center", gap: "14px",
                padding: "14px 16px", borderRadius: "10px", cursor: "pointer",
                border: `1px solid ${visibility === value ? "rgba(245,158,11,0.4)" : "var(--b2)"}`,
                background: visibility === value ? "rgba(245,158,11,0.06)" : "var(--raised)",
                textAlign: "left", transition: "all 0.15s ease",
                opacity: saving ? 0.6 : 1,
              }}
            >
              <div style={{
                width: "36px", height: "36px", borderRadius: "9px", flexShrink: 0,
                background: visibility === value ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${visibility === value ? "rgba(245,158,11,0.3)" : "var(--b2)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon size={16} style={{ color: visibility === value ? "var(--amber)" : color }} />
              </div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 500, color: visibility === value ? "var(--t1)" : "var(--t2)" }}>{label}</div>
                <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "2px" }}>{desc}</div>
              </div>
              {visibility === value && (
                <div style={{ marginLeft: "auto", width: "8px", height: "8px", borderRadius: "50%", background: "var(--amber)", flexShrink: 0 }} />
              )}
            </button>
          ))}

          {/* ── Users tab ── */}
          {activeTab === "users" && (
            <>
              {/* Add user form */}
              <div style={{ background: "var(--raised)", border: "1px solid var(--b2)", borderRadius: "10px", padding: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--t3)", marginBottom: "10px", letterSpacing: "0.05em", textTransform: "uppercase" }}>Add user</div>
                <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                  <input
                    value={newUser}
                    onChange={(e) => setNewUser(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addUser()}
                    placeholder="Username"
                    style={{ flex: 1, padding: "8px 12px", background: "var(--surface)", border: "1px solid var(--b2)", borderRadius: "7px", color: "var(--t1)", fontSize: "13px", outline: "none" }}
                  />
                  <button
                    onClick={addUser}
                    style={{
                      display: "flex", alignItems: "center", gap: "5px", padding: "8px 14px",
                      background: "rgba(245,158,11,0.85)", border: "none", borderRadius: "7px",
                      color: "var(--void)", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    <UserPlus size={13} /> Add
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ fontSize: "11px", color: "var(--t3)", marginBottom: "2px" }}>Permissions</div>
                  <PermChips selected={newUserPerms} onChange={setNewUserPerms} />
                </div>
              </div>

              {/* Shared users list */}
              {sharedWith.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px", color: "var(--t3)", fontSize: "13px" }}>
                  <Shield size={28} style={{ margin: "0 auto 8px", opacity: 0.3, display: "block" }} />
                  No users added yet
                </div>
              ) : (
                sharedWith.map((su) => {
                  const isExpanded = expandedUser === su.username;
                  return (
                    <div
                      key={su.username}
                      style={{ borderRadius: "10px", background: "var(--raised)", border: `1px solid ${isExpanded ? "rgba(245,158,11,0.3)" : "var(--b1)"}`, overflow: "hidden", transition: "border-color 0.15s" }}
                    >
                      {/* Row */}
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px" }}>
                        <div style={{ width: "30px", height: "30px", borderRadius: "7px", background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <span className="font-mono" style={{ fontSize: "9px", color: "var(--cyan)", fontWeight: 700 }}>{su.username.slice(0, 2).toUpperCase()}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "13px", color: "var(--t1)", fontWeight: 500 }}>{su.username}</div>
                          <div style={{ display: "flex", gap: "4px", marginTop: "4px", flexWrap: "wrap" }}>
                            {su.permissions.map((p) => {
                              const def = PERM_DEFS.find((d) => d.id === p);
                              return (
                                <span key={p} style={{ fontSize: "9px", padding: "2px 6px", borderRadius: "4px", border: `1px solid ${def?.color ?? "var(--b2)"}`, color: def?.color ?? "var(--t3)", background: `color-mix(in srgb, ${def?.color ?? "transparent"} 10%, transparent)` }}>
                                  {def?.label ?? p}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (isExpanded) { setExpandedUser(null); return; }
                            setExpandedUser(su.username);
                            setEditingPerms((prev) => ({ ...prev, [su.username]: [...su.permissions] }));
                          }}
                          style={{ padding: "4px 8px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "6px", color: "var(--amber)", fontSize: "10px", cursor: "pointer" }}
                        >
                          Edit
                        </button>
                        <button onClick={() => removeUser(su.username)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", padding: "4px" }}>
                          <Trash2 size={12} />
                        </button>
                      </div>

                      {/* Expanded permissions editor */}
                      {isExpanded && (
                        <div style={{ padding: "12px 14px 14px", borderTop: "1px solid var(--b1)", background: "rgba(245,158,11,0.03)" }}>
                          <div style={{ fontSize: "11px", color: "var(--t3)", marginBottom: "8px" }}>Edit permissions</div>
                          <PermChips
                            selected={editingPerms[su.username] ?? su.permissions}
                            onChange={(p) => setEditingPerms((prev) => ({ ...prev, [su.username]: p }))}
                          />
                          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                            <button
                              onClick={() => savePermissions(su.username)}
                              style={{ flex: 1, padding: "7px", background: "rgba(245,158,11,0.85)", border: "none", borderRadius: "7px", color: "var(--void)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setExpandedUser(null)}
                              style={{ padding: "7px 14px", background: "none", border: "1px solid var(--b2)", borderRadius: "7px", color: "var(--t3)", fontSize: "12px", cursor: "pointer" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* ── Groups tab ── */}
          {activeTab === "groups" && (
            <>
              <div style={{ display: "flex", gap: "8px", marginBottom: "4px" }}>
                <input
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createGroup()}
                  placeholder="New group name"
                  style={{ flex: 1, padding: "9px 12px", background: "var(--raised)", border: "1px solid var(--b2)", borderRadius: "8px", color: "var(--t1)", fontSize: "13px", outline: "none" }}
                />
                <button
                  onClick={createGroup}
                  style={{
                    display: "flex", alignItems: "center", gap: "5px", padding: "9px 14px",
                    background: "rgba(245,158,11,0.85)", border: "none", borderRadius: "8px",
                    color: "var(--void)", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                  }}
                >
                  <Plus size={13} /> Create
                </button>
              </div>

              {groups.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px", color: "var(--t3)", fontSize: "13px" }}>No groups yet</div>
              ) : groups.map((g) => (
                <div key={g.name} style={{ borderRadius: "10px", background: "var(--raised)", border: "1px solid var(--b1)", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderBottom: g.members.length > 0 ? "1px solid var(--b1)" : "none" }}>
                    <Users size={13} style={{ color: "var(--cyan)", flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: "13px", fontWeight: 500, color: "var(--t1)" }}>{g.name}</span>
                    <span className="font-mono" style={{ fontSize: "10px", color: "var(--t3)" }}>{g.members.length} members</span>
                    <button
                      onClick={() => shareWithGroup(g.name)}
                      title="Share workspace with this group"
                      style={{ padding: "4px 8px", background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: "5px", color: "var(--cyan)", fontSize: "10px", cursor: "pointer" }}
                    >
                      Share
                    </button>
                    <button onClick={() => removeGroup(g.name)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)" }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div style={{ padding: "8px 14px", display: "flex", flexDirection: "column", gap: "4px" }}>
                    {g.members.map((m) => (
                      <div key={m} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ flex: 1, fontSize: "12px", color: "var(--t2)" }}>{m}</span>
                        <button onClick={() => removeMember(g.name, m)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)" }}>
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                      <input
                        value={newGroupMember}
                        onChange={(e) => setNewGroupMember(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addMember(g.name)}
                        placeholder="Add member..."
                        style={{ flex: 1, padding: "5px 9px", background: "var(--surface)", border: "1px solid var(--b2)", borderRadius: "6px", color: "var(--t1)", fontSize: "11px", outline: "none" }}
                      />
                      <button onClick={() => addMember(g.name)} style={{ padding: "5px 9px", background: "none", border: "1px solid var(--b2)", borderRadius: "6px", color: "var(--t3)", fontSize: "11px", cursor: "pointer" }}>+</button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
