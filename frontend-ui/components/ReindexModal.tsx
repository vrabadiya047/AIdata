'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/contexts/ToastContext';
import { DatabaseZap, Check, CheckSquare, Square as SquareIcon, Loader2, X as XIcon, CheckCircle2 } from 'lucide-react';

interface Workspace { username: string; project: string; file_count: number; visibility?: string; }
type ReindexPhase = 'loading' | 'ready' | 'queuing' | 'indexing' | 'done' | 'error';

function ActionButtons({ onBackground, onCancel }: { onBackground: () => void; onCancel: () => void }) {
  return (
    <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
      <button
        onClick={onBackground}
        style={{
          flex: 1, padding: '7px 0', borderRadius: '7px', cursor: 'pointer',
          background: 'rgba(255,255,255,0.05)', border: '1px solid var(--b2)',
          color: 'var(--t2)', fontSize: '12px', fontWeight: 500,
        }}
      >
        Run in background
      </button>
      <button
        onClick={onCancel}
        style={{
          flex: 1, padding: '7px 0', borderRadius: '7px', cursor: 'pointer',
          background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#f87171', fontSize: '12px', fontWeight: 500,
        }}
      >
        Cancel
      </button>
    </div>
  );
}

function ProgressBar({ pct, color = 'var(--amber)' }: { pct: number; color?: string }) {
  return (
    <div style={{ height: '5px', borderRadius: '3px', background: 'var(--raised)', overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`,
        background: color, borderRadius: '3px',
        transition: 'width 0.35s ease',
      }} />
    </div>
  );
}

export default function ReindexModal({ onClose, isAdmin = false }: { onClose: () => void; isAdmin?: boolean }) {
  const toast = useToast();
  const [phase, setPhase] = useState<ReindexPhase>('loading');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [errMsg, setErrMsg] = useState('');

  // progress tracking
  const [jobsDone, setJobsDone] = useState(0);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [workspaceCount, setWorkspaceCount] = useState(0);
  const jobIdsRef  = useRef<string[]>([]);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef   = useRef<AbortController | null>(null);

  const listUrl    = isAdmin ? '/api/admin/workspaces' : '/api/user/workspaces';
  const reindexUrl = isAdmin ? '/api/admin/reindex'   : '/api/user/reindex';
  const key = (w: Workspace) => `${w.username}::${w.project}`;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(listUrl);
        if (!res.ok) throw new Error('Failed to load');
        const { workspaces: ws } = await res.json();
        setWorkspaces(ws);
        setPhase('ready');
      } catch {
        setErrMsg('Could not load workspaces.');
        setPhase('error');
      }
    })();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [listUrl]);

  const pollJobs = useCallback(async () => {
    const ids = jobIdsRef.current;
    if (!ids.length) return;
    try {
      const statuses = await Promise.all(
        ids.map(id => fetch(`/api/jobs/${id}`).then(r => r.ok ? r.json() : null))
      );
      const done = statuses.filter(j => j && (j.status === 'done' || j.status === 'failed')).length;
      setJobsDone(done);
      if (done === ids.length) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setPhase('done');
      }
    } catch { /* ignore transient */ }
  }, []);

  function runInBackground() {
    if (jobIdsRef.current.length > 0) {
      const count = jobIdsRef.current.length;
      toast.trackInBackground(
        jobIdsRef.current,
        'Reindex complete',
        `${count} file${count !== 1 ? 's' : ''} across ${workspaceCount} workspace${workspaceCount !== 1 ? 's' : ''} reindexed.`,
      );
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    onClose();
  }

  function cancelOperation() {
    abortRef.current?.abort();
    abortRef.current = null;
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    jobIdsRef.current = [];
    setJobsDone(0);
    setJobsTotal(0);
    setPhase('ready');
  }

  function toggle(w: Workspace) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key(w)) ? next.delete(key(w)) : next.add(key(w));
      return next;
    });
  }

  function selectAll() { setSelected(new Set(workspaces.map(key))); }
  function unselectAll() { setSelected(new Set()); }

  async function startReindex() {
    if (!selected.size) return;
    setPhase('queuing');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const chosen = workspaces.filter(w => selected.has(key(w)));
      setWorkspaceCount(chosen.length);
      const res = await fetch(reindexUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaces: chosen }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error('Reindex request failed');
      const data = await res.json();
      const ids: string[] = data.job_ids ?? [];
      jobIdsRef.current = ids;
      setJobsTotal(ids.length);
      setJobsDone(0);
      if (ids.length === 0) {
        setPhase('done');
      } else {
        setPhase('indexing');
        pollRef.current = setInterval(pollJobs, 2000);
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return; // user cancelled
      setErrMsg(e instanceof Error ? e.message : 'Unknown error');
      setPhase('error');
    }
  }

  const allSelected = workspaces.length > 0 && selected.size === workspaces.length;
  const indexPct = jobsTotal > 0 ? Math.round((jobsDone / jobsTotal) * 100) : 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
        animation: 'fadeIn 0.14s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '520px',
          background: 'var(--surface)', border: '1px solid var(--b2)',
          borderRadius: '14px', overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          animation: 'fadeUp 0.18s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid var(--b1)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '8px',
              background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <DatabaseZap size={15} style={{ color: 'var(--amber)' }} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t1)' }}>Reindex Documents</div>
              <div style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '1px' }}>
                {isAdmin ? 'Rebuild vector index across all user workspaces' : 'Rebuild vector index for your workspaces'}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: '26px', height: '26px', borderRadius: '6px', cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--b2)', color: 'var(--t2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <XIcon size={13} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 22px' }}>

          {/* Loading workspaces */}
          {phase === 'loading' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '32px', color: 'var(--t3)', fontSize: '13px' }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading workspaces…
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div style={{ padding: '24px', textAlign: 'center', color: '#f87171', fontSize: '13px' }}>
              {errMsg}
            </div>
          )}

          {/* Queuing (waiting for backend to set up jobs) */}
          {phase === 'queuing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '20px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--t2)' }}>
                <Loader2 size={15} style={{ animation: 'spin 1s linear infinite', color: 'var(--amber)', flexShrink: 0 }} />
                Preparing reindex jobs for {workspaceCount} workspace{workspaceCount !== 1 ? 's' : ''}…
              </div>
              <ActionButtons onBackground={onClose} onCancel={cancelOperation} />
            </div>
          )}

          {/* Indexing progress */}
          {phase === 'indexing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '8px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: 'var(--t1)', fontWeight: 500 }}>
                  Reindexing {workspaceCount} workspace{workspaceCount !== 1 ? 's' : ''}
                </span>
                <span className="font-mono" style={{ fontSize: '12px', color: 'var(--amber)', fontWeight: 600 }}>
                  {indexPct}%
                </span>
              </div>
              <ProgressBar pct={indexPct} color="var(--amber)" />
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontSize: '11px', color: 'var(--t3)',
              }}>
                <span>{jobsDone} of {jobsTotal} file{jobsTotal !== 1 ? 's' : ''} indexed</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Processing…
                </span>
              </div>
              <ActionButtons onBackground={runInBackground} onCancel={cancelOperation} />
            </div>
          )}

          {/* Done */}
          {phase === 'done' && (
            <div style={{ textAlign: 'center', padding: '24px 16px' }}>
              <div style={{
                width: '52px', height: '52px', borderRadius: '14px', margin: '0 auto 16px',
                background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CheckCircle2 size={22} style={{ color: 'var(--green)' }} />
              </div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--t1)', marginBottom: '6px' }}>
                Reindex complete
              </div>
              <div style={{ fontSize: '13px', color: 'var(--t3)', lineHeight: 1.6, marginBottom: '16px' }}>
                {jobsTotal > 0
                  ? `${jobsTotal} file${jobsTotal !== 1 ? 's' : ''} across ${workspaceCount} workspace${workspaceCount !== 1 ? 's' : ''} reindexed.`
                  : `${workspaceCount} workspace${workspaceCount !== 1 ? 's' : ''} had no files to index.`}
              </div>
              <ProgressBar pct={100} color="var(--green)" />
              <button onClick={onClose} style={{
                marginTop: '20px', padding: '9px 24px', borderRadius: '8px', cursor: 'pointer',
                background: 'var(--raised)', border: '1px solid var(--b2)',
                color: 'var(--t1)', fontSize: '13px', fontWeight: 500,
              }}>
                Close
              </button>
            </div>
          )}

          {/* Ready — workspace picker */}
          {phase === 'ready' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span className="font-mono" style={{ fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.08em' }}>
                  {workspaces.length} WORKSPACE{workspaces.length !== 1 ? 'S' : ''}
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={selectAll} style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '4px 10px', borderRadius: '6px', cursor: 'pointer',
                    background: 'transparent', border: '1px solid var(--b2)',
                    color: allSelected ? 'var(--amber)' : 'var(--t3)', fontSize: '11px',
                  }}>
                    <CheckSquare size={11} /> Select all
                  </button>
                  <button onClick={unselectAll} style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '4px 10px', borderRadius: '6px', cursor: 'pointer',
                    background: 'transparent', border: '1px solid var(--b2)',
                    color: 'var(--t3)', fontSize: '11px',
                  }}>
                    <SquareIcon size={11} /> Unselect all
                  </button>
                </div>
              </div>

              <div style={{
                maxHeight: '260px', overflowY: 'auto',
                border: '1px solid var(--b1)', borderRadius: '8px',
                marginBottom: '14px',
              }}>
                {workspaces.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--t3)', fontSize: '13px' }}>
                    No workspaces found.
                  </div>
                ) : workspaces.map((w, i) => {
                  const k = key(w);
                  const checked = selected.has(k);
                  return (
                    <label key={k} style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '11px 14px', cursor: 'pointer',
                      borderBottom: i < workspaces.length - 1 ? '1px solid var(--b1)' : 'none',
                      background: checked ? 'rgba(245,158,11,0.05)' : 'transparent',
                      transition: 'background 0.12s ease',
                    }}>
                      <input
                        type="checkbox" checked={checked} onChange={() => toggle(w)}
                        style={{ accentColor: 'var(--amber)', width: '14px', height: '14px', flexShrink: 0, cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', color: 'var(--t1)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {w.project}
                        </div>
                        {isAdmin && (
                          <div style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '1px' }}>{w.username}</div>
                        )}
                      </div>
                      {w.visibility && w.visibility !== 'private' && (
                        <span className="font-mono" style={{
                          fontSize: '9px', flexShrink: 0,
                          padding: '2px 7px', borderRadius: '4px',
                          color: w.visibility === 'public' ? 'var(--green)' : 'var(--cyan)',
                          background: w.visibility === 'public' ? 'rgba(16,185,129,0.08)' : 'rgba(34,211,238,0.08)',
                          border: `1px solid ${w.visibility === 'public' ? 'rgba(16,185,129,0.2)' : 'rgba(34,211,238,0.2)'}`,
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                        }}>
                          {w.visibility}
                        </span>
                      )}
                      <span className="font-mono" style={{
                        fontSize: '10px', color: 'var(--t3)',
                        padding: '2px 7px', borderRadius: '4px',
                        background: 'var(--raised)', border: '1px solid var(--b1)', flexShrink: 0,
                      }}>
                        {w.file_count} file{w.file_count !== 1 ? 's' : ''}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div style={{
                padding: '9px 12px', borderRadius: '7px', marginBottom: '14px',
                background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.18)',
                fontSize: '11.5px', color: 'var(--t2)', lineHeight: 1.5,
                display: 'flex', gap: '8px',
              }}>
                <DatabaseZap size={13} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: '1px' }} />
                <span>Reindexing clears the existing vector index and re-processes every file. The workspace remains queryable during indexing.</span>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={onClose} style={{
                  padding: '9px 16px', borderRadius: '8px', cursor: 'pointer',
                  background: 'transparent', border: '1px solid var(--b2)',
                  color: 'var(--t2)', fontSize: '13px',
                }}>
                  Cancel
                </button>
                <button
                  onClick={startReindex}
                  disabled={selected.size === 0}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '9px 18px', borderRadius: '8px',
                    cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                    background: selected.size === 0 ? 'rgba(245,158,11,0.35)' : 'rgba(245,158,11,0.85)',
                    border: 'none', color: '#0a0a0b', fontSize: '13px', fontWeight: 600,
                  }}
                >
                  <DatabaseZap size={13} />
                  Reindex {selected.size > 0 ? `${selected.size} ` : ''}selected
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
