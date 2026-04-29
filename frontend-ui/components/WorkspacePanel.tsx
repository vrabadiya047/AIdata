'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Share2, Camera, Trash2, RotateCcw, Clock, FileText,
  MessageSquare, AlertCircle, CheckCircle, RefreshCw,
  ChevronDown, ChevronRight, Folder, User,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'sharing' | 'snapshots';

interface ShareEntry {
  project: string;
  shared_with: string;
  permissions: string[];
  valid_until: string | null;
  expired: boolean;
}

interface SnapshotEntry {
  id: string;
  project_name: string;
  thread_id: string;
  title: string;
  created_at: string | null;
  files: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countdown(validUntil: string | null): { text: string; color: string; urgent: boolean } {
  if (!validUntil) return { text: 'Never expires', color: 'var(--green)', urgent: false };
  const diff = new Date(validUntil).getTime() - Date.now();
  if (diff <= 0) return { text: 'Expired', color: 'var(--t3)', urgent: false };

  const totalSec = Math.floor(diff / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (d > 0) return { text: `${d}d ${h}h`, color: 'var(--green)', urgent: false };
  if (h > 1) return { text: `${h}h ${m}m`, color: 'var(--green)', urgent: false };
  if (h === 1 || m > 30) return { text: `${h > 0 ? h + 'h ' : ''}${m}m`, color: 'var(--amber)', urgent: false };
  if (m > 0) return { text: `${m}m ${s}s`, color: 'var(--amber)', urgent: true };
  return { text: `${s}s`, color: '#ef4444', urgent: true };
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Sharing Tab ──────────────────────────────────────────────────────────────

function SharingTab() {
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // tick every second for live countdowns
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/user/shares');
      if (res.ok) setShares((await res.json()).shares ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function revoke(project: string, sharedWith: string) {
    const key = `${project}::${sharedWith}`;
    setRevoking(key);
    try {
      await fetch('/api/user/shares', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, shared_with: sharedWith }),
      });
      setShares(s => s.filter(x => !(x.project === project && x.shared_with === sharedWith)));
    } finally { setRevoking(null); }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', color: 'var(--t3)' }}>
      <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', marginRight: '10px' }} /> Loading shares…
    </div>
  );

  // Group by project
  const byProject: Record<string, ShareEntry[]> = {};
  for (const s of shares) {
    if (!byProject[s.project]) byProject[s.project] = [];
    byProject[s.project].push(s);
  }

  const projectNames = Object.keys(byProject).sort();

  return (
    <div>
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)' }}>
            {shares.length} active {shares.length === 1 ? 'share' : 'shares'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '2px' }}>
            Projects you have shared with other users. Ephemeral shares count down in real-time.
          </div>
        </div>
        <button
          onClick={load}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '6px', background: 'var(--raised)', border: '1px solid var(--b2)', color: 'var(--t2)', fontSize: '11px', cursor: 'pointer' }}
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      {shares.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', border: '1px dashed var(--b2)', borderRadius: '12px', color: 'var(--t3)', fontSize: '13px' }}>
          No shares found. Share a project from the workspace sidebar to see it here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {projectNames.map(proj => (
            <ProjectShareGroup
              key={proj}
              project={proj}
              shares={byProject[proj]}
              revoking={revoking}
              tick={tick}
              onRevoke={revoke}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectShareGroup({ project, shares, revoking, tick, onRevoke }: {
  project: string;
  shares: ShareEntry[];
  revoking: string | null;
  tick: number;
  onRevoke: (p: string, u: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const expiredCount = shares.filter(s => s.expired).length;

  return (
    <div style={{ border: '1px solid var(--b1)', borderRadius: '10px', overflow: 'hidden' }}>
      {/* Project header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
          padding: '10px 14px', background: 'var(--raised)', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        {open ? <ChevronDown size={13} style={{ color: 'var(--t3)', flexShrink: 0 }} /> : <ChevronRight size={13} style={{ color: 'var(--t3)', flexShrink: 0 }} />}
        <Folder size={13} style={{ color: 'var(--amber)', flexShrink: 0 }} />
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)', flex: 1 }}>{project}</span>
        <span style={{ fontSize: '11px', color: 'var(--t3)' }}>
          {shares.length} {shares.length === 1 ? 'share' : 'shares'}
          {expiredCount > 0 && <span style={{ color: '#ef4444', marginLeft: '6px' }}>• {expiredCount} expired</span>}
        </span>
      </button>

      {open && (
        <div>
          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 120px 1fr 36px',
            padding: '6px 14px 6px 38px', gap: '8px',
            borderBottom: '1px solid var(--b1)',
          }}>
            {['Shared With', 'Permissions', 'Time Remaining', ''].map(h => (
              <div key={h} className="font-mono" style={{ fontSize: '9.5px', letterSpacing: '0.07em', color: 'var(--t3)', textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>

          {shares.map(share => {
            const key = `${project}::${share.shared_with}`;
            const cd = countdown(share.valid_until);
            const isRevoking = revoking === key;
            return (
              <div
                key={share.shared_with}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 120px 1fr 36px',
                  alignItems: 'center', gap: '8px',
                  padding: '9px 14px 9px 38px',
                  borderBottom: '1px solid var(--b0)',
                  opacity: share.expired ? 0.55 : 1,
                  background: share.expired ? 'rgba(239,68,68,0.02)' : 'transparent',
                }}
              >
                {/* Shared with */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={11} style={{ color: 'var(--t2)' }} />
                  </div>
                  <span style={{ fontSize: '13px', color: 'var(--t1)', fontWeight: 500 }}>@{share.shared_with}</span>
                </div>

                {/* Permissions */}
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {share.permissions.includes('documents') && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 6px', borderRadius: '4px', background: 'var(--cyan-10)', color: 'var(--cyan)', fontSize: '9.5px', fontWeight: 600 }}>
                      <FileText size={9} /> Docs
                    </span>
                  )}
                  {share.permissions.includes('chats') && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 6px', borderRadius: '4px', background: 'var(--green-10)', color: 'var(--green)', fontSize: '9.5px', fontWeight: 600 }}>
                      <MessageSquare size={9} /> Chats
                    </span>
                  )}
                </div>

                {/* Countdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={11} style={{ color: cd.urgent ? '#ef4444' : 'var(--t3)', flexShrink: 0 }} />
                  <span className={cd.urgent ? 'font-mono' : ''} style={{ fontSize: '12px', color: cd.color, fontWeight: cd.urgent ? 700 : 400 }}>
                    {cd.text}
                    {/* force re-render via tick when counting down */}
                    {tick > -1 && null}
                  </span>
                </div>

                {/* Revoke */}
                <button
                  onClick={() => onRevoke(project, share.shared_with)}
                  disabled={isRevoking}
                  title={`Revoke ${share.shared_with}'s access`}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer',
                    background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)',
                    color: '#f87171',
                  }}
                >
                  {isRevoking ? <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <X size={11} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Snapshots Tab ────────────────────────────────────────────────────────────

function SnapshotsTab({ onRestored }: { onRestored: (project: string, thread: string) => void }) {
  const [snaps, setSnaps] = useState<SnapshotEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/snapshots');
      if (res.ok) setSnaps((await res.json()).snapshots ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function restore(snap: SnapshotEntry) {
    if (!confirm(
      `Restore snapshot "${snap.title}" from ${timeAgo(snap.created_at)}?\n\nThis will replace the current conversation in thread "${snap.thread_id}" of project "${snap.project_name}". This cannot be undone.`
    )) return;

    setRestoring(snap.id);
    setMsg(null);
    try {
      const res = await fetch(`/api/snapshots/${snap.id}/restore`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMsg({ type: 'ok', text: `Thread "${snap.thread_id}" restored in project "${snap.project_name}".` });
      onRestored(data.project, data.thread_id);
    } catch {
      setMsg({ type: 'err', text: 'Restore failed. The snapshot may no longer be accessible.' });
    } finally { setRestoring(null); }
  }

  async function deleteSnap(id: string) {
    setDeleting(id);
    try {
      await fetch(`/api/snapshots/${id}`, { method: 'DELETE' });
      setSnaps(s => s.filter(x => x.id !== id));
    } finally { setDeleting(null); }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', color: 'var(--t3)' }}>
      <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', marginRight: '10px' }} /> Loading snapshots…
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)' }}>
            {snaps.length} {snaps.length === 1 ? 'snapshot' : 'snapshots'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '2px' }}>
            Point-in-time captures of project conversations and file manifests.
          </div>
        </div>
        <button
          onClick={load}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '6px', background: 'var(--raised)', border: '1px solid var(--b2)', color: 'var(--t2)', fontSize: '11px', cursor: 'pointer' }}
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      {msg && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 14px', borderRadius: '8px', marginBottom: '14px',
          background: msg.type === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${msg.type === 'ok' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
          fontSize: '13px', color: msg.type === 'ok' ? '#22c55e' : '#f87171',
        }}>
          {msg.type === 'ok' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
          {msg.text}
        </div>
      )}

      {snaps.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', border: '1px dashed var(--b2)', borderRadius: '12px', color: 'var(--t3)', fontSize: '13px' }}>
          No snapshots yet. Create one from the chat menu to capture a project state.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {snaps.map(snap => (
            <SnapshotCard
              key={snap.id}
              snap={snap}
              isRestoring={restoring === snap.id}
              isDeleting={deleting === snap.id}
              onRestore={() => restore(snap)}
              onDelete={() => deleteSnap(snap.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SnapshotCard({ snap, isRestoring, isDeleting, onRestore, onDelete }: {
  snap: SnapshotEntry;
  isRestoring: boolean;
  isDeleting: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: '10px',
      background: 'var(--raised)', border: '1px solid var(--b1)',
      display: 'flex', gap: '14px', alignItems: 'flex-start',
    }}>
      {/* Icon */}
      <div style={{
        width: '38px', height: '38px', borderRadius: '9px', flexShrink: 0,
        background: 'var(--amber-10)', border: '1px solid var(--amber-25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--amber)',
      }}>
        <Camera size={16} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t1)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {snap.title || snap.thread_id}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '11px', color: 'var(--t3)', marginBottom: '8px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Folder size={10} style={{ color: 'var(--amber)' }} />
            {snap.project_name}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <MessageSquare size={10} style={{ color: 'var(--cyan)' }} />
            {snap.thread_id}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FileText size={10} style={{ color: 'var(--green)' }} />
            {snap.files.length} {snap.files.length === 1 ? 'file' : 'files'} in manifest
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={10} />
            {timeAgo(snap.created_at)}
          </span>
        </div>

        {/* File manifest preview */}
        {snap.files.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
            {snap.files.slice(0, 5).map(f => (
              <span key={f} style={{
                padding: '2px 7px', borderRadius: '4px',
                background: 'var(--elevated)', border: '1px solid var(--b1)',
                fontSize: '10px', color: 'var(--t3)', fontFamily: 'monospace',
                maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{f}</span>
            ))}
            {snap.files.length > 5 && (
              <span style={{ padding: '2px 7px', borderRadius: '4px', background: 'var(--elevated)', border: '1px solid var(--b1)', fontSize: '10px', color: 'var(--t3)' }}>
                +{snap.files.length - 5} more
              </span>
            )}
          </div>
        )}

        {/* Warning note */}
        <div style={{ fontSize: '10.5px', color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <AlertCircle size={10} style={{ color: 'var(--amber)', flexShrink: 0 }} />
          Restore replaces thread conversation. File contents are not reverted (manifest only).
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        <button
          onClick={onRestore}
          disabled={isRestoring || isDeleting}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '7px 12px', borderRadius: '7px', cursor: isRestoring ? 'wait' : 'pointer',
            background: 'rgba(245,158,11,0.85)', border: 'none',
            color: 'var(--void)', fontSize: '12px', fontWeight: 600,
            opacity: isRestoring || isDeleting ? 0.6 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {isRestoring
            ? <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Restoring…</>
            : <><RotateCcw size={12} /> Restore</>
          }
        </button>
        <button
          onClick={onDelete}
          disabled={isDeleting || isRestoring}
          title="Delete snapshot"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '32px', height: '32px', borderRadius: '7px', cursor: 'pointer',
            background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)',
            color: '#f87171',
          }}
        >
          {isDeleting ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={12} />}
        </button>
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface WorkspacePanelProps {
  onClose: () => void;
  onRestored?: (project: string, thread: string) => void;
}

export default function WorkspacePanel({ onClose, onRestored }: WorkspacePanelProps) {
  const [tab, setTab] = useState<Tab>('sharing');

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'sharing',   label: 'Sharing',   icon: Share2 },
    { id: 'snapshots', label: 'Snapshots', icon: Camera },
  ];

  function handleRestored(project: string, thread: string) {
    onRestored?.(project, thread);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '720px', maxWidth: '96vw', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', border: '1px solid var(--b2)',
          borderRadius: '16px', overflow: 'hidden',
          boxShadow: '0 32px 100px rgba(0,0,0,0.6), 0 4px 20px rgba(0,0,0,0.35)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--b1)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--raised)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '8px',
              background: 'linear-gradient(135deg, var(--cyan) 0%, #0891b2 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Folder size={14} style={{ color: '#fff' }} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--t1)' }}>Workspace Governance</div>
              <div style={{ fontSize: '11px', color: 'var(--t3)' }}>Manage shares and restore snapshots</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '28px', height: '28px', borderRadius: '7px',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--t1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--t3)'; }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: '2px', padding: '10px 20px',
          borderBottom: '1px solid var(--b1)', flexShrink: 0,
        }}>
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '7px',
                  padding: '7px 14px', borderRadius: '8px', cursor: 'pointer',
                  border: 'none',
                  background: active ? 'var(--raised)' : 'transparent',
                  color: active ? 'var(--t1)' : 'var(--t3)',
                  fontSize: '13px', fontWeight: active ? 600 : 500,
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
                  transition: 'all 0.12s ease', position: 'relative',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.color = 'var(--t1)'; e.currentTarget.style.background = 'var(--hover-bg)'; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.color = 'var(--t3)'; e.currentTarget.style.background = 'transparent'; } }}
              >
                <Icon size={14} />
                {label}
                {active && (
                  <span style={{
                    position: 'absolute', bottom: '-11px', left: '50%',
                    transform: 'translateX(-50%)',
                    width: '24px', height: '2px', borderRadius: '1px',
                    background: 'var(--cyan)',
                  }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {tab === 'sharing' && <SharingTab />}
          {tab === 'snapshots' && <SnapshotsTab onRestored={handleRestored} />}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
