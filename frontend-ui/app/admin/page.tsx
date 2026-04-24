'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/contexts/SessionContext';
import {
  Shield, Plus, Trash2, RefreshCw, ArrowLeft,
  Users, Activity, Eye, FileText, Search, Hash,
} from 'lucide-react';

interface User { id: number; username: string; role: string; }
interface AuditEntry { [key: string]: string | number; }

interface PrivacySummary {
  total_redactions: number;
  unique_pii_types: number;
  affected_users: number;
  query_hits: number;
  document_hits: number;
}
interface ByType   { pii_type: string; count: number; }
interface ByUser   { username: string; count: number; }
interface ByDay    { date: string; count: number; }
interface RecentEvent {
  id: number; username: string; pii_type: string;
  count: number; context: string; project: string; created_at: string;
}
interface PrivacyStats {
  summary: PrivacySummary;
  by_type: ByType[];
  by_user: ByUser[];
  by_day:  ByDay[];
  recent:  RecentEvent[];
}

// ── Colour map for PII types ──────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  EMAIL:        '#38bdf8',
  PHONE:        '#a78bfa',
  CREDIT_CARD:  '#f87171',
  SSN:          '#fb923c',
  IP_ADDRESS:   '#34d399',
  TFN:          '#fbbf24',
  ABN:          '#e879f9',
  PASSPORT:     '#60a5fa',
  DATE_OF_BIRTH:'#f472b6',
};
function typeColor(t: string) { return TYPE_COLORS[t] ?? '#94a3b8'; }

// ── Small stat card ───────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number | string; icon: React.ElementType; color: string;
}) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--b2)',
      borderRadius: '12px', padding: '18px 20px',
      display: 'flex', alignItems: 'center', gap: '14px',
    }}>
      <div style={{
        width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
        background: `${color}18`, border: `1px solid ${color}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--t1)', lineHeight: 1 }}>
          {value.toLocaleString()}
        </div>
        <div className="font-mono" style={{ fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.08em', marginTop: '4px' }}>
          {label}
        </div>
      </div>
    </div>
  );
}

// ── Horizontal bar chart ──────────────────────────────────────────────────────
function BarChart({ data, max }: { data: ByType[]; max: number }) {
  if (!data.length) return (
    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--t3)', fontSize: '13px' }}>
      No redactions recorded yet.
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {data.map(({ pii_type, count }) => {
        const pct = max > 0 ? (count / max) * 100 : 0;
        const col = typeColor(pii_type);
        return (
          <div key={pii_type} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="font-mono" style={{
              width: '110px', fontSize: '10px', color: col,
              letterSpacing: '0.06em', flexShrink: 0, textAlign: 'right',
            }}>{pii_type}</span>
            <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'var(--raised)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`, borderRadius: '4px',
                background: col, transition: 'width 0.5s ease',
              }} />
            </div>
            <span className="font-mono" style={{ width: '32px', fontSize: '11px', color: 'var(--t2)', textAlign: 'right', flexShrink: 0 }}>
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Sparkline (30-day daily bar chart) ───────────────────────────────────────
function Sparkline({ data }: { data: ByDay[] }) {
  if (!data.length) return (
    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--t3)', fontSize: '13px' }}>
      No data in the last 30 days.
    </div>
  );
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '56px' }}>
      {data.map(({ date, count }) => (
        <div key={date} title={`${date}: ${count}`} style={{
          flex: 1, minWidth: '4px',
          height: `${Math.max((count / max) * 100, 4)}%`,
          borderRadius: '2px 2px 0 0',
          background: 'var(--amber)',
          opacity: 0.7,
          cursor: 'default',
          transition: 'opacity 0.15s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.7'; }}
        />
      ))}
    </div>
  );
}

// ── Context badge ─────────────────────────────────────────────────────────────
function ContextBadge({ context }: { context: string }) {
  const isDoc = context === 'document';
  return (
    <span className="font-mono" style={{
      fontSize: '9px', padding: '2px 6px', borderRadius: '4px',
      background: isDoc ? 'rgba(251,191,36,0.10)' : 'rgba(99,102,241,0.10)',
      color: isDoc ? '#fbbf24' : '#818cf8',
      border: `1px solid ${isDoc ? 'rgba(251,191,36,0.2)' : 'rgba(99,102,241,0.2)'}`,
    }}>
      {context.toUpperCase()}
    </span>
  );
}

function fmt(ts: string) {
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

// ═════════════════════════════════════════════════════════════════════════════
// Page
// ═════════════════════════════════════════════════════════════════════════════

export default function AdminPage() {
  const { session, loading } = useSession();
  const router = useRouter();

  const [users,   setUsers]   = useState<User[]>([]);
  const [audit,   setAudit]   = useState<AuditEntry[]>([]);
  const [privacy, setPrivacy] = useState<PrivacyStats | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);

  const [tab, setTab] = useState<'users' | 'audit' | 'privacy'>('users');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('User');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && session?.role !== 'Admin') router.replace('/');
  }, [session, loading]);

  useEffect(() => {
    if (session?.role === 'Admin') { loadUsers(); loadAudit(); }
  }, [session]);

  useEffect(() => {
    if (tab === 'privacy' && !privacy) loadPrivacy();
  }, [tab]);

  async function loadUsers() {
    const res = await fetch('/api/admin/users');
    if (res.ok) setUsers(await res.json().then((d: { users: User[] }) => d.users));
  }

  async function loadAudit() {
    const res = await fetch('/api/admin/audit');
    if (res.ok) setAudit(await res.json().then((d: { entries: AuditEntry[] }) => d.entries));
  }

  async function loadPrivacy() {
    setPrivacyLoading(true);
    try {
      const res = await fetch('/api/admin/privacy');
      if (res.ok) setPrivacy(await res.json());
    } finally {
      setPrivacyLoading(false);
    }
  }

  async function createUser() {
    if (!newUsername || !newPassword) return;
    setCreating(true); setError('');
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
    });
    setCreating(false);
    if (!res.ok) { setError((await res.json()).error ?? 'Failed'); return; }
    setNewUsername(''); setNewPassword(''); setNewRole('User');
    await loadUsers();
  }

  async function deleteUser(username: string) {
    const res = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    if (!res.ok) { setError((await res.json()).error ?? 'Failed'); return; }
    await loadUsers();
  }

  if (loading || session?.role !== 'Admin') return null;

  const tabs = [
    ['users',   Users,    'Users'],
    ['audit',   Activity, 'Audit Trail'],
    ['privacy', Eye,      'Privacy Audit'],
  ] as const;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--void)', color: 'var(--t1)', padding: '32px' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: 0 }}>
            <ArrowLeft size={14} /> Back
          </button>
          <div style={{ width: '1px', height: '16px', background: 'var(--b2)' }} />
          <Shield size={16} style={{ color: 'var(--amber)' }} />
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--amber)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Admin Console
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'var(--surface)', padding: '4px', borderRadius: '10px', border: '1px solid var(--b2)', width: 'fit-content' }}>
          {tabs.map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '7px', border: 'none',
                cursor: 'pointer', fontSize: '13px', fontWeight: 500,
                background: tab === key ? 'var(--raised)' : 'transparent',
                color: tab === key ? 'var(--amber)' : 'var(--t3)',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Users tab ─────────────────────────────────────────────────────── */}
        {tab === 'users' && (
          <>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--b2)', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
              <div className="font-mono" style={{ fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.1em', marginBottom: '14px' }}>ADD USER</div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="Username"
                  style={{ flex: '1 1 140px', padding: '9px 12px', background: 'var(--raised)', border: '1px solid var(--b2)', borderRadius: '8px', color: 'var(--t1)', fontSize: '13px', outline: 'none' }} />
                <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Temp password" type="password"
                  style={{ flex: '1 1 140px', padding: '9px 12px', background: 'var(--raised)', border: '1px solid var(--b2)', borderRadius: '8px', color: 'var(--t1)', fontSize: '13px', outline: 'none' }} />
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)}
                  style={{ padding: '9px 12px', background: 'var(--raised)', border: '1px solid var(--b2)', borderRadius: '8px', color: 'var(--t1)', fontSize: '13px', outline: 'none' }}>
                  <option>User</option>
                  <option>Admin</option>
                </select>
                <button onClick={createUser} disabled={creating} style={{
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px',
                  background: 'rgba(245,158,11,0.85)', border: 'none', borderRadius: '8px',
                  color: 'var(--void)', fontSize: '13px', fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer',
                }}>
                  <Plus size={13} /> Create
                </button>
              </div>
              {error && <div style={{ marginTop: '10px', fontSize: '12px', color: '#f87171' }}>{error}</div>}
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--b2)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--b1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="font-mono" style={{ fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.1em' }}>USERS — {users.length}</div>
                <button onClick={loadUsers} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}><RefreshCw size={13} /></button>
              </div>
              {users.map((u) => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 20px', borderBottom: '1px solid var(--b1)' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                    background: u.role === 'Admin' ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.06)',
                    border: u.role === 'Admin' ? '1px solid rgba(245,158,11,0.25)' : '1px solid var(--b2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span className="font-mono" style={{ fontSize: '10px', fontWeight: 700, color: u.role === 'Admin' ? 'var(--amber)' : 'var(--t3)' }}>
                      {u.username.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', color: 'var(--t1)', fontWeight: 500 }}>{u.username}</div>
                    <div className="font-mono" style={{ fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.06em' }}>{u.role}</div>
                  </div>
                  <button onClick={() => deleteUser(u.username)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: '4px', borderRadius: '4px' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Audit tab ─────────────────────────────────────────────────────── */}
        {tab === 'audit' && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--b2)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--b1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="font-mono" style={{ fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.1em' }}>AUDIT TRAIL — {audit.length} EVENTS</div>
              <button onClick={loadAudit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}><RefreshCw size={13} /></button>
            </div>
            {audit.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--t3)', fontSize: '13px' }}>No audit events recorded.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--b1)' }}>
                      {Object.keys(audit[0]).map((col) => (
                        <th key={col} style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--t3)', fontFamily: 'monospace', fontSize: '10px', letterSpacing: '0.08em', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {col.toUpperCase()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--b1)' }}>
                        {Object.values(row).map((val, j) => (
                          <td key={j} style={{ padding: '10px 16px', color: 'var(--t2)', whiteSpace: 'nowrap', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Privacy Audit tab ─────────────────────────────────────────────── */}
        {tab === 'privacy' && (
          <>
            {privacyLoading && (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--t3)', fontSize: '13px' }}>
                Loading…
              </div>
            )}

            {!privacyLoading && privacy && (
              <>
                {/* Refresh */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                  <button onClick={loadPrivacy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                    <RefreshCw size={12} /> Refresh
                  </button>
                </div>

                {/* Stat cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                  <StatCard label="TOTAL REDACTIONS"  value={privacy.summary.total_redactions}  icon={Shield}   color="#f87171" />
                  <StatCard label="PII TYPES SEEN"    value={privacy.summary.unique_pii_types}  icon={Hash}     color="var(--amber)" />
                  <StatCard label="USERS WITH PII"    value={privacy.summary.affected_users}    icon={Users}    color="#a78bfa" />
                  <StatCard label="QUERY HITS"        value={privacy.summary.query_hits}        icon={Search}   color="#38bdf8" />
                  <StatCard label="DOCUMENT HITS"     value={privacy.summary.document_hits}     icon={FileText} color="#34d399" />
                </div>

                {/* Charts row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                  {/* By type */}
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--b2)', borderRadius: '12px', padding: '18px 20px' }}>
                    <div className="font-mono" style={{ fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.1em', marginBottom: '16px' }}>
                      REDACTIONS BY PII TYPE
                    </div>
                    <BarChart data={privacy.by_type} max={privacy.by_type[0]?.count ?? 1} />
                  </div>

                  {/* 30-day sparkline */}
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--b2)', borderRadius: '12px', padding: '18px 20px' }}>
                    <div className="font-mono" style={{ fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.1em', marginBottom: '16px' }}>
                      DAILY REDACTIONS — LAST 30 DAYS
                    </div>
                    <Sparkline data={privacy.by_day} />
                    {privacy.by_day.length > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                        <span className="font-mono" style={{ fontSize: '9px', color: 'var(--t3)' }}>{privacy.by_day[0]?.date}</span>
                        <span className="font-mono" style={{ fontSize: '9px', color: 'var(--t3)' }}>{privacy.by_day[privacy.by_day.length - 1]?.date}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Top users */}
                {privacy.by_user.length > 0 && (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--b2)', borderRadius: '12px', padding: '18px 20px', marginBottom: '24px' }}>
                    <div className="font-mono" style={{ fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.1em', marginBottom: '14px' }}>
                      TOP USERS BY REDACTION COUNT
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {privacy.by_user.slice(0, 10).map(({ username, count }) => {
                        const pct = privacy.by_user[0] ? (count / privacy.by_user[0].count) * 100 : 0;
                        return (
                          <div key={username} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ width: '110px', fontSize: '12px', color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {username}
                            </span>
                            <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'var(--raised)' }}>
                              <div style={{ height: '100%', width: `${pct}%`, borderRadius: '3px', background: 'var(--amber)', transition: 'width 0.4s ease' }} />
                            </div>
                            <span className="font-mono" style={{ width: '30px', fontSize: '11px', color: 'var(--t2)', textAlign: 'right', flexShrink: 0 }}>{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Recent events table */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--b2)', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--b1)' }}>
                    <div className="font-mono" style={{ fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.1em' }}>
                      RECENT REDACTION EVENTS — {privacy.recent.length}
                    </div>
                  </div>
                  {privacy.recent.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--t3)', fontSize: '13px' }}>
                      No PII has been detected in any query or document yet.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--b1)' }}>
                            {['Timestamp', 'User', 'PII Type', 'Count', 'Context', 'Project'].map(col => (
                              <th key={col} style={{ padding: '9px 14px', textAlign: 'left', color: 'var(--t3)', fontFamily: 'monospace', fontSize: '9px', letterSpacing: '0.08em', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {col.toUpperCase()}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {privacy.recent.map((ev) => (
                            <tr key={ev.id} style={{ borderBottom: '1px solid var(--b1)' }}>
                              <td style={{ padding: '9px 14px', color: 'var(--t3)', whiteSpace: 'nowrap' }} className="font-mono">
                                <span style={{ fontSize: '10px' }}>{fmt(ev.created_at)}</span>
                              </td>
                              <td style={{ padding: '9px 14px', color: 'var(--t2)', whiteSpace: 'nowrap' }}>
                                {ev.username || <span style={{ color: 'var(--t3)' }}>—</span>}
                              </td>
                              <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                                <span className="font-mono" style={{
                                  fontSize: '10px', padding: '2px 7px', borderRadius: '4px',
                                  background: `${typeColor(ev.pii_type)}18`,
                                  color: typeColor(ev.pii_type),
                                  border: `1px solid ${typeColor(ev.pii_type)}33`,
                                }}>
                                  {ev.pii_type}
                                </span>
                              </td>
                              <td style={{ padding: '9px 14px', color: 'var(--t2)' }} className="font-mono">
                                <span style={{ fontSize: '11px' }}>{ev.count}</span>
                              </td>
                              <td style={{ padding: '9px 14px' }}>
                                <ContextBadge context={ev.context} />
                              </td>
                              <td style={{ padding: '9px 14px', color: 'var(--t2)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {ev.project || <span style={{ color: 'var(--t3)' }}>—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
