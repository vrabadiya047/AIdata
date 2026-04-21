'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/contexts/SessionContext';
import { Shield, Plus, Trash2, RefreshCw, ArrowLeft, Users, Activity } from 'lucide-react';

interface User { id: number; username: string; role: string; }
interface AuditEntry { [key: string]: string | number; }

export default function AdminPage() {
  const { session, loading } = useSession();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [tab, setTab] = useState<'users' | 'audit'>('users');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('User');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && session?.role !== 'Admin') router.replace('/');
  }, [session, loading]);

  useEffect(() => { if (session?.role === 'Admin') { loadUsers(); loadAudit(); } }, [session]);

  async function loadUsers() {
    const res = await fetch('/api/admin/users');
    if (res.ok) setUsers(await res.json().then((d) => d.users));
  }

  async function loadAudit() {
    const res = await fetch('/api/admin/audit');
    if (res.ok) setAudit(await res.json().then((d) => d.entries));
  }

  async function createUser() {
    if (!newUsername || !newPassword) return;
    setCreating(true);
    setError('');
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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--void)', color: 'var(--t1)', padding: '32px' }}>
      {/* Header */}
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
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
          {([['users', Users, 'Users'], ['audit', Activity, 'Audit Trail']] as const).map(([key, Icon, label]) => (
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

        {tab === 'users' && (
          <>
            {/* Add user */}
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

            {/* User list */}
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
      </div>
    </div>
  );
}
