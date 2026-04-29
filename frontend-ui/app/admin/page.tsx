'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/contexts/SessionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useCommand } from '@/contexts/CommandContext';
import {
  Shield, Plus, Trash2, RefreshCw, ArrowLeft,
  Users, Activity, Eye, FileText, Search, Hash, Smartphone,
  Copy, Check, RotateCw, KeyRound, X as XIcon, DatabaseZap,
  Cpu, MemoryStick, Server, Wifi, WifiOff, Brain, Database,
  ChevronRight, Lock, SlidersHorizontal, Zap, AlertTriangle,
  Sun, Moon, Bell, Keyboard, LogOut, Settings, User,
} from 'lucide-react';
import ReindexModal from '@/components/ReindexModal';
import AvatarBubble from '@/components/AvatarBubble';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface User { id: number; username: string; role: string; mfa_enabled: boolean; }
interface AuditEntry { [key: string]: string | number; }

interface SystemStats {
  cpu_percent: number;
  ram: { used_gb: number; total_gb: number; percent: number };
  vram: { available: boolean; used_gb: number; total_gb: number; percent: number; name: string };
  air_gap: boolean;
  pii_this_month: number;
}

interface PrivacySummary {
  total_redactions: number; unique_pii_types: number;
  affected_users: number; query_hits: number; document_hits: number;
}
interface ByType  { pii_type: string; count: number; }
interface ByUser  { username: string; count: number; }
interface ByDay   { date: string; count: number; }
interface RecentEvent {
  id: number; username: string; pii_type: string;
  count: number; context: string; project: string; created_at: string;
}
interface PrivacyStats {
  summary: PrivacySummary; by_type: ByType[];
  by_user: ByUser[]; by_day: ByDay[]; recent: RecentEvent[];
}

interface AIPrefs {
  autoSummary: boolean;
  streaming: boolean;
  voiceInput: boolean;
  knowledgeGraph: boolean;
  sbertRerank: boolean;
}

interface IntelligenceSettings {
  llm_model:          string;
  critic_model:       string;
  similarity_top_k:   string;
  reranker_top_n:     string;
  self_rag_retries:   string;
  semantic_threshold: string;
  ocr_enabled:        string;
  ocr_min_chars:      string;
}

const INTEL_DEFAULTS: IntelligenceSettings = {
  llm_model: 'llama3.2:3b', critic_model: 'llama3.2:1b',
  similarity_top_k: '10', reranker_top_n: '3',
  self_rag_retries: '2', semantic_threshold: '95',
  ocr_enabled: 'true', ocr_min_chars: '50',
};

const DEFAULT_AI_PREFS: AIPrefs = {
  autoSummary:    true,
  streaming:      true,
  voiceInput:     false,
  knowledgeGraph: true,
  sbertRerank:    true,
};

// ─── PII type colours ─────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  EMAIL: '#38bdf8', PHONE: '#a78bfa', CREDIT_CARD: '#f87171',
  SSN: '#fb923c', IP_ADDRESS: '#34d399', TFN: '#fbbf24',
  ABN: '#e879f9', PASSPORT: '#60a5fa', DATE_OF_BIRTH: '#f472b6',
};
function typeColor(t: string) { return TYPE_COLORS[t] ?? '#94a3b8'; }

// ─── Password generator ───────────────────────────────────────────────────────

const _PWD_LOWER   = 'abcdefghijkmnpqrstuvwxyz';
const _PWD_UPPER   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const _PWD_DIGIT   = '23456789';
const _PWD_SYMBOL  = '!@#$%^&*-_=+';
const _PWD_ALPHABET = _PWD_LOWER + _PWD_UPPER + _PWD_DIGIT + _PWD_SYMBOL;

function _pickRandom(pool: string, n: number): string[] {
  const out: string[] = [];
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  for (let i = 0; i < n; i++) out.push(pool[buf[i] % pool.length]);
  return out;
}
function generateTempPassword(length = 14): string {
  const required = [
    ..._pickRandom(_PWD_LOWER, 2), ..._pickRandom(_PWD_UPPER, 2),
    ..._pickRandom(_PWD_DIGIT, 2), ..._pickRandom(_PWD_SYMBOL, 1),
  ];
  const rest = _pickRandom(_PWD_ALPHABET, Math.max(0, length - required.length));
  const all  = [...required, ...rest];
  const idx  = new Uint32Array(all.length);
  crypto.getRandomValues(idx);
  for (let i = all.length - 1; i > 0; i--) {
    const j = idx[i] % (i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.join('');
}

// ═════════════════════════════════════════════════════════════════════════════
// Page
// ═════════════════════════════════════════════════════════════════════════════

type Tab = 'users' | 'privacy' | 'intelligence' | 'ai' | 'system' | 'audit';

const NAV: { id: Tab; Icon: React.ElementType; label: string }[] = [
  { id: 'users',        Icon: Users,              label: 'User Management'  },
  { id: 'privacy',      Icon: Shield,             label: 'Privacy Audit'    },
  { id: 'intelligence', Icon: Brain,              label: 'Intelligence'     },
  { id: 'ai',           Icon: SlidersHorizontal,  label: 'AI Preferences'   },
  { id: 'system',       Icon: Database,           label: 'Fortress'         },
  { id: 'audit',        Icon: Activity,           label: 'Audit Trail'      },
];

export default function AdminPage() {
  const { session, loading, refresh } = useSession();
  const router = useRouter();
  const { theme, toggle: toggleTheme } = useTheme();
  const toast = useToast();
  const { open: openCmd } = useCommand();

  const [tab, setTab]         = useState<Tab>('users');
  const [showReindex, setShowReindex] = useState(false);

  // ── TopBar state ──
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const [avatarData, setAvatarData] = useState<{ display_name: string; avatar_b64: string } | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // ── Users state ──
  const [users,   setUsers]   = useState<User[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState(() => generateTempPassword());
  const [newRole,  setNewRole]  = useState('User');
  const [creating, setCreating] = useState(false);
  const [error,    setError]    = useState('');
  const [createdCreds, setCreatedCreds] = useState<{ username: string; password: string; role: string } | null>(null);
  const [copied,   setCopied]   = useState<'pwd' | 'both' | null>(null);

  // ── Audit state ──
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  // ── Privacy state ──
  const [privacy, setPrivacy] = useState<PrivacyStats | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);

  // ── System state ──
  const [system, setSystem]           = useState<SystemStats | null>(null);
  const [systemLoading, setSystemLoading] = useState(false);

  // ── Intelligence state ──
  const [intel, setIntel]               = useState<IntelligenceSettings>(INTEL_DEFAULTS);
  const [intelModels, setIntelModels]   = useState<string[]>([]);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelSaving,  setIntelSaving]  = useState(false);
  const [intelSaved,   setIntelSaved]   = useState(false);
  const [intelError,   setIntelError]   = useState('');

  // ── AI preferences state ──
  const [aiPrefs, setAiPrefs] = useState<AIPrefs>(() => {
    if (typeof window === 'undefined') return DEFAULT_AI_PREFS;
    try {
      const stored = localStorage.getItem('sovereign_ai_prefs');
      return stored ? { ...DEFAULT_AI_PREFS, ...JSON.parse(stored) } : DEFAULT_AI_PREFS;
    } catch { return DEFAULT_AI_PREFS; }
  });

  function setAiPref<K extends keyof AIPrefs>(key: K, val: AIPrefs[K]) {
    setAiPrefs(prev => {
      const next = { ...prev, [key]: val };
      try { localStorage.setItem('sovereign_ai_prefs', JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }

  useEffect(() => {
    if (!loading && session?.role !== 'Admin') router.replace('/');
  }, [session, loading]);

  useEffect(() => {
    if (session?.role === 'Admin') { loadUsers(); loadAudit(); }
  }, [session]);

  useEffect(() => {
    if (tab === 'privacy' && !privacy) loadPrivacy();
    if (tab === 'system') loadSystem();
    if (tab === 'intelligence' && !intelLoading) loadIntelligence();
  }, [tab]);

  useEffect(() => {
    setIsMac(typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac'));
  }, []);

  useEffect(() => {
    if (!session?.username) return;
    fetch('/api/auth/profile')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setAvatarData({ display_name: d.display_name ?? '', avatar_b64: d.avatar_b64 ?? '' }); })
      .catch(() => {});
  }, [session?.username]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    if (userMenuOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      toast.success('Signed out', 'See you next time.');
      refresh();
      router.push('/login');
    } catch { toast.error('Sign out failed'); }
  }

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
    try { const res = await fetch('/api/admin/privacy'); if (res.ok) setPrivacy(await res.json()); }
    finally { setPrivacyLoading(false); }
  }
  async function loadSystem() {
    setSystemLoading(true);
    try { const res = await fetch('/api/admin/system'); if (res.ok) setSystem(await res.json()); }
    finally { setSystemLoading(false); }
  }

  async function loadIntelligence() {
    setIntelLoading(true);
    try {
      const res = await fetch('/api/admin/intelligence');
      if (res.ok) {
        const data = await res.json();
        setIntel({ ...INTEL_DEFAULTS, ...data.settings });
        setIntelModels(data.available_models ?? []);
      }
    } finally { setIntelLoading(false); }
  }

  async function saveIntelligence() {
    setIntelSaving(true); setIntelError(''); setIntelSaved(false);
    try {
      const res = await fetch('/api/admin/intelligence', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: intel }),
      });
      if (res.ok) { setIntelSaved(true); setTimeout(() => setIntelSaved(false), 3000); }
      else setIntelError('Save failed');
    } catch { setIntelError('Network error'); }
    finally { setIntelSaving(false); }
  }

  function setIntelField(key: string, val: string) {
    setIntel(prev => ({ ...prev, [key]: val }));
    setIntelSaved(false);
  }

  async function createUser() {
    if (!newUsername.trim()) { setError('Username required'); return; }
    setCreating(true); setError('');
    const username = newUsername.trim();
    const password = generatedPassword;
    const role = newRole;
    const res = await fetch('/api/admin/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role }),
    });
    setCreating(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Failed'); return; }
    setCreatedCreds({ username, password, role });
    setNewUsername(''); setGeneratedPassword(generateTempPassword()); setNewRole('User');
    await loadUsers();
  }

  async function copyToClipboard(text: string, key: 'pwd' | 'both') {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); }
    catch { setError('Clipboard write blocked by browser'); }
  }

  async function deleteUser(username: string) {
    const res = await fetch('/api/admin/users', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    if (!res.ok) { setError((await res.json()).error ?? 'Failed'); return; }
    await loadUsers();
  }

  async function resetMFA(username: string) {
    if (!confirm(`Reset MFA for ${username}? They will need to re-enroll.`)) return;
    await fetch(`/api/admin/users/${encodeURIComponent(username)}/mfa`, { method: 'DELETE' });
    await loadUsers();
  }

  if (loading || session?.role !== 'Admin') return null;

  const activeNav = NAV.find(n => n.id === tab)!;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--void)', color: 'var(--t1)', overflow: 'hidden' }}>

      {/* ── Top header bar ─────────────────────────────────────────────── */}
      <header style={{
        height: '46px', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '0 14px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--b1)',
        position: 'relative', zIndex: 30,
      }}>
        {/* Left: Back + Admin Console badge */}
        <button
          onClick={() => router.push('/')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', padding: '4px 7px', borderRadius: '6px', flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--t1)'; e.currentTarget.style.background = 'var(--raised)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--t3)'; e.currentTarget.style.background = 'none'; }}
        >
          <ArrowLeft size={13} /> Back
        </button>
        <div style={{ width: '1px', height: '16px', background: 'var(--b2)', flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0 }}>
          <div style={{
            width: '26px', height: '26px', borderRadius: '6px', flexShrink: 0,
            background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Shield size={13} style={{ color: 'var(--amber)' }} />
          </div>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--amber)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Admin Console
          </span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Right: Search + Reindex + Bell + Keyboard + Theme + Live + User */}
        <button
          onClick={openCmd}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '5px 8px 5px 10px', borderRadius: '7px',
            background: 'var(--deep)', border: '1px solid var(--b1)',
            color: 'var(--t3)', fontSize: '12px', cursor: 'pointer',
            minWidth: '200px', transition: 'border-color 0.12s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--b2)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--b1)'; }}
        >
          <Search size={12} />
          <span style={{ flex: 1, textAlign: 'left' }}>Quick search…</span>
          <span style={{ display: 'flex', gap: '3px' }}>
            <kbd style={KBD_STYLE}>{isMac ? '⌘' : 'Ctrl'}</kbd>
            <kbd style={KBD_STYLE}>K</kbd>
          </span>
        </button>

        <button
          onClick={() => setShowReindex(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '5px 11px', borderRadius: '7px', cursor: 'pointer',
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.28)',
            color: 'var(--amber)', fontSize: '11.5px', fontWeight: 600,
            letterSpacing: '0.01em', transition: 'all 0.15s ease', flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.15)'; e.currentTarget.style.borderColor = 'rgba(245,158,11,0.50)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.08)'; e.currentTarget.style.borderColor = 'rgba(245,158,11,0.28)'; }}
        >
          <DatabaseZap size={12} /> Reindex
        </button>

        <AdminIconBtn title="Notifications" onClick={() => toast.info('Notifications', 'No pending events')}>
          <Bell size={14} />
        </AdminIconBtn>

        <AdminIconBtn title="Keyboard shortcuts" onClick={() => {}}>
          <Keyboard size={14} />
        </AdminIconBtn>

        <AdminIconBtn title={theme === 'dark' ? 'Light mode' : 'Dark mode'} onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </AdminIconBtn>

        <div style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '3px 8px', borderRadius: '999px', flexShrink: 0,
          background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.25)',
          fontSize: '10.5px', fontWeight: 600, color: 'var(--green)',
        }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
          Live
        </div>

        {/* User menu */}
        <div ref={userMenuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '3px 8px 3px 3px', borderRadius: '999px',
              background: userMenuOpen ? 'var(--raised)' : 'transparent',
              border: '1px solid var(--b1)', cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
          >
            <AvatarBubble
              username={session?.username ?? '?'}
              displayName={avatarData?.display_name ?? ''}
              avatarB64={avatarData?.avatar_b64 ?? ''}
              size={24}
            />
            <span style={{ fontSize: '12px', color: 'var(--t1)', fontWeight: 500 }}>
              {session?.username ?? 'Guest'}
            </span>
          </button>

          {userMenuOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0,
              minWidth: '200px', padding: '6px',
              background: 'var(--raised)', border: '1px solid var(--b2)',
              borderRadius: '10px', boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
              zIndex: 50,
            }}>
              <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--b1)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AvatarBubble
                  username={session?.username ?? '?'}
                  displayName={avatarData?.display_name ?? ''}
                  avatarB64={avatarData?.avatar_b64 ?? ''}
                  size={32}
                />
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--t1)', fontWeight: 600 }}>
                    {avatarData?.display_name || session?.username || 'Guest'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--t3)' }}>@{session?.username}</span>
                    <span style={{ padding: '1px 5px', borderRadius: '4px', background: 'rgba(245,158,11,0.10)', color: 'var(--amber)', fontSize: '9px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      {session?.role ?? 'user'}
                    </span>
                  </div>
                </div>
              </div>
              <AdminMenuItem icon={<Settings size={13} />} onClick={() => setUserMenuOpen(false)}>
                Workspace Settings
              </AdminMenuItem>
              <div style={{ height: '1px', background: 'var(--b1)', margin: '4px 0' }} />
              <AdminMenuItem icon={<LogOut size={13} />} danger onClick={() => { setUserMenuOpen(false); logout(); }}>
                Sign out
              </AdminMenuItem>
            </div>
          )}
        </div>
      </header>

      {/* ── Body: sidebar + content ─────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', overflow: 'hidden', background: 'var(--void)' }}>

        {/* ── Left sidebar ── */}
        <nav style={{
          width: '220px', flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          padding: '20px 12px',
          background: 'rgba(19,19,20,0.95)',
          borderRight: '1px solid rgba(255,255,255,0.05)',
          gap: '2px',
        }}>
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--t3)', padding: '0 10px', marginBottom: '8px', fontFamily: 'monospace' }}>
            ADMINISTRATION
          </div>
          {NAV.map(({ id, Icon, label }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 12px', borderRadius: '8px', cursor: 'pointer',
                  border: 'none', width: '100%', textAlign: 'left',
                  background: active ? 'rgba(245,158,11,0.10)' : 'transparent',
                  color: active ? 'var(--amber)' : 'var(--t2)',
                  fontSize: '13px', fontWeight: active ? 600 : 400,
                  transition: 'all 0.12s ease',
                  position: 'relative',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                {active && (
                  <span style={{
                    position: 'absolute', left: 0, top: '20%', bottom: '20%',
                    width: '3px', borderRadius: '0 2px 2px 0',
                    background: 'var(--amber)',
                  }} />
                )}
                <Icon size={15} style={{ flexShrink: 0 }} />
                {label}
                {active && <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
              </button>
            );
          })}
        </nav>

        {/* ── Main content ── */}
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '28px 24px', background: 'var(--deep)', color: 'var(--t1)' }}>

          {/* Section heading */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <activeNav.Icon size={16} style={{ color: 'var(--amber)' }} />
              <h1 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--t1)', margin: 0 }}>
                {activeNav.label}
              </h1>
            </div>
            {(tab === 'users') && (
              <button onClick={loadUsers} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                <RefreshCw size={12} /> Refresh
              </button>
            )}
            {tab === 'privacy' && (
              <button onClick={loadPrivacy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                <RefreshCw size={12} /> Refresh
              </button>
            )}
            {tab === 'intelligence' && (
              <button onClick={loadIntelligence} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                <RefreshCw size={12} /> Refresh
              </button>
            )}
            {tab === 'system' && (
              <button onClick={loadSystem} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                <RefreshCw size={12} /> Refresh
              </button>
            )}
            {tab === 'audit' && (
              <button onClick={loadAudit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                <RefreshCw size={12} /> Refresh
              </button>
            )}
          </div>

          {/* ── Users tab ────────────────────────────────────────────── */}
          {tab === 'users' && (
            <>
              {/* Add user card */}
              <GlassCard className="" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.1em' }}>ADD USER</span>
                  <span style={{ fontSize: '10.5px', color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <KeyRound size={11} style={{ color: 'var(--amber)' }} /> Auto-generated temporary password
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <input
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createUser()}
                    placeholder="Username"
                    autoComplete="off"
                    style={{ flex: '1 1 180px', minWidth: '180px', background: 'var(--raised)', border: '1px solid var(--b2)', color: 'var(--t1)', fontSize: '14px', outline: 'none', borderRadius: '8px', padding: '8px 12px' }}
                  />
                  <select
                    value={newRole} onChange={e => setNewRole(e.target.value)}
                    style={{ background: 'var(--raised)', border: '1px solid var(--b2)', color: 'var(--t1)', fontSize: '14px', outline: 'none', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer' }}
                  >
                    <option>User</option>
                    <option>Admin</option>
                  </select>
                  <button
                    onClick={createUser}
                    disabled={creating || !newUsername.trim()}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '8px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
                      background: 'var(--amber)', color: '#000', border: 'none',
                      opacity: creating || !newUsername.trim() ? 0.45 : 1,
                      cursor: creating || !newUsername.trim() ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <Plus size={13} /> Create account
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '8px', padding: '10px 12px', background: 'var(--raised)', border: '1px dashed var(--b2)' }}>
                  <KeyRound size={13} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                  <code style={{ fontFamily: 'monospace', flex: 1, fontSize: '14px', color: 'var(--t1)', letterSpacing: '0.05em', userSelect: 'all' }}>
                    {generatedPassword}
                  </code>
                  <SmallButton onClick={() => copyToClipboard(generatedPassword, 'pwd')}>
                    {copied === 'pwd' ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
                  </SmallButton>
                  <SmallButton onClick={() => setGeneratedPassword(generateTempPassword())}>
                    <RotateCw size={10} /> Regenerate
                  </SmallButton>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '8px', lineHeight: 1.5 }}>
                  The user will be required to change this password on first sign-in. Copy it before clicking Create — it cannot be recovered later.
                </p>
                {error && <p style={{ marginTop: '10px', fontSize: '12px', color: '#f87171' }}>{error}</p>}
              </GlassCard>

              {/* User list */}
              <GlassCard>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.1em' }}>USERS — {users.length}</span>
                </div>
                {users.map(u => (
                  <div key={u.id}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', borderRadius: '8px', padding: '12px 14px', marginBottom: '8px', background: 'var(--raised)', border: '1px solid var(--b1)' }}
                  >
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
                      background: u.role === 'Admin' ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.06)',
                      border: u.role === 'Admin' ? '1px solid rgba(245,158,11,0.25)' : '1px solid rgba(255,255,255,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: 700, color: u.role === 'Admin' ? 'var(--amber)' : 'var(--t3)' }}>
                        {u.username.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', color: 'var(--t1)', fontWeight: 500, marginBottom: '4px' }}>{u.username}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.06em' }}>{u.role}</span>
                        {u.mfa_enabled
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'monospace', fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}><Smartphone size={9} /> 2FA ON</span>
                          : <span style={{ fontFamily: 'monospace', fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(107,114,128,0.1)', border: '1px solid rgba(107,114,128,0.15)', color: 'var(--t3)' }}>NO 2FA</span>
                        }
                      </div>
                    </div>
                    {u.mfa_enabled && (
                      <button onClick={() => resetMFA(u.username)} title="Reset MFA" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                        <Smartphone size={12} />
                      </button>
                    )}
                    <button onClick={() => deleteUser(u.username)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: '4px', borderRadius: '4px' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </GlassCard>

              {/* Credentials reveal modal */}
              {createdCreds && (
                <div onClick={() => setCreatedCreds(null)} style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)' }}>
                  <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '448px', borderRadius: '16px', overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--b2)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: '1px solid var(--b1)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.30)', color: 'var(--green)' }}>
                          <Check size={15} />
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t1)' }}>Account created</div>
                          <div style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '1px' }}>Send these credentials to the user securely</div>
                        </div>
                      </div>
                      <button onClick={() => setCreatedCreds(null)} style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--t2)', cursor: 'pointer' }}>
                        <XIcon size={13} />
                      </button>
                    </div>
                    <div style={{ padding: '20px' }}>
                      <CredRow label="Username" value={createdCreds.username} />
                      <CredRow label="Role"     value={createdCreds.role} />
                      <CredRow label="Password" value={createdCreds.password} mono highlight />
                      <button
                        onClick={() => copyToClipboard(`Username: ${createdCreds.username}\nPassword: ${createdCreds.password}\nRole: ${createdCreds.role}`, 'both')}
                        style={{
                          width: '100%', marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                          borderRadius: '8px', padding: '10px', fontSize: '14px', fontWeight: 600,
                          background: copied === 'both' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.10)',
                          border: copied === 'both' ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(245,158,11,0.25)',
                          color: copied === 'both' ? 'var(--green)' : 'var(--amber)', cursor: 'pointer',
                        }}
                      >
                        {copied === 'both' ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy all credentials</>}
                      </button>
                      <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12px', borderRadius: '8px', padding: '12px', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.20)', color: 'var(--t2)', lineHeight: 1.5 }}>
                        <Shield size={12} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: '1px' }} />
                        <span>This password is shown <strong style={{ color: 'var(--t1)' }}>only once</strong>. Once you close this dialog, it cannot be retrieved — only reset.</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Privacy Audit tab ─────────────────────────────────────── */}
          {tab === 'privacy' && (
            <>
              {privacyLoading && <LoadingSpinner />}
              {!privacyLoading && privacy && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
                    <StatCard label="TOTAL REDACTIONS"  value={privacy.summary.total_redactions}  icon={Shield}   color="#f87171" />
                    <StatCard label="PII TYPES SEEN"    value={privacy.summary.unique_pii_types}  icon={Hash}     color="var(--amber)" />
                    <StatCard label="USERS WITH PII"    value={privacy.summary.affected_users}    icon={Users}    color="#a78bfa" />
                    <StatCard label="QUERY HITS"        value={privacy.summary.query_hits}        icon={Search}   color="#38bdf8" />
                    <StatCard label="DOCUMENT HITS"     value={privacy.summary.document_hits}     icon={FileText} color="#34d399" />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    <GlassCard>
                      <div style={{ fontFamily: 'monospace', marginBottom: '16px', fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.1em' }}>REDACTIONS BY PII TYPE</div>
                      <BarChart data={privacy.by_type} max={privacy.by_type[0]?.count ?? 1} />
                    </GlassCard>
                    <GlassCard>
                      <div style={{ fontFamily: 'monospace', marginBottom: '16px', fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.1em' }}>DAILY REDACTIONS — LAST 30 DAYS</div>
                      <Sparkline data={privacy.by_day} />
                      {privacy.by_day.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '9px', color: 'var(--t3)' }}>{privacy.by_day[0]?.date}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: '9px', color: 'var(--t3)' }}>{privacy.by_day[privacy.by_day.length - 1]?.date}</span>
                        </div>
                      )}
                    </GlassCard>
                  </div>

                  {privacy.by_user.length > 0 && (
                    <GlassCard style={{ marginBottom: '24px' }}>
                      <div style={{ fontFamily: 'monospace', marginBottom: '14px', fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.1em' }}>TOP USERS BY REDACTION COUNT</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {privacy.by_user.slice(0, 10).map(({ username, count }) => {
                          const pct = privacy.by_user[0] ? (count / privacy.by_user[0].count) * 100 : 0;
                          return (
                            <div key={username} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span style={{ width: '120px', fontSize: '13px', color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{username}</span>
                              <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'var(--raised)' }}>
                                <div style={{ height: '100%', width: `${pct}%`, borderRadius: '3px', background: 'var(--amber)', transition: 'width 0.4s ease' }} />
                              </div>
                              <span style={{ fontFamily: 'monospace', width: '32px', fontSize: '12px', color: 'var(--t2)', textAlign: 'right', flexShrink: 0 }}>{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </GlassCard>
                  )}

                  <GlassCard>
                    <div style={{ fontFamily: 'monospace', marginBottom: '12px', fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.1em' }}>RECENT REDACTION EVENTS — {privacy.recent.length}</div>
                    {privacy.recent.length === 0
                      ? <EmptyState>No PII has been detected yet.</EmptyState>
                      : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--b1)' }}>
                                {['Timestamp', 'User', 'PII Type', 'Count', 'Context', 'Project'].map(col => (
                                  <th key={col} className="font-mono" style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--t3)', fontSize: '9px', letterSpacing: '0.08em', fontWeight: 600, whiteSpace: 'nowrap' }}>{col.toUpperCase()}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {privacy.recent.map(ev => (
                                <tr key={ev.id} style={{ borderBottom: '1px solid var(--b1)' }}>
                                  <td className="font-mono" style={{ padding: '8px 12px', color: 'var(--t3)', whiteSpace: 'nowrap', fontSize: '10px' }}>{fmt(ev.created_at)}</td>
                                  <td style={{ padding: '8px 12px', color: 'var(--t2)', whiteSpace: 'nowrap' }}>{ev.username || '—'}</td>
                                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                    <span className="font-mono" style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: `${typeColor(ev.pii_type)}18`, color: typeColor(ev.pii_type), border: `1px solid ${typeColor(ev.pii_type)}33` }}>
                                      {ev.pii_type}
                                    </span>
                                  </td>
                                  <td className="font-mono" style={{ padding: '8px 12px', color: 'var(--t2)', fontSize: '11px' }}>{ev.count}</td>
                                  <td style={{ padding: '8px 12px' }}><ContextBadge context={ev.context} /></td>
                                  <td style={{ padding: '8px 12px', color: 'var(--t2)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.project || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    }
                  </GlassCard>
                </>
              )}
            </>
          )}

          {/* ── Intelligence tab ──────────────────────────────────────── */}
          {tab === 'intelligence' && (
            <>
              {intelLoading && <LoadingSpinner />}
              {!intelLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                  {/* ── Model Selection ── */}
                  <GlassCard>
                    <SectionLabel>Model Selection</SectionLabel>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <ModelSelect
                        label="Primary LLM"
                        description="Used for all chat and RAG responses."
                        value={intel.llm_model}
                        models={intelModels}
                        onChange={v => setIntelField('llm_model', v)}
                      />
                      <ModelSelect
                        label="Critic (Self-RAG)"
                        description="Grades retrieved context quality — lighter model is faster."
                        value={intel.critic_model}
                        models={intelModels}
                        onChange={v => setIntelField('critic_model', v)}
                      />
                    </div>
                    {intelModels.length === 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', padding: '12px', borderRadius: '8px', fontSize: '12px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.20)', color: 'var(--t2)' }}>
                        <AlertTriangle size={12} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                        Ollama is not running or has no models installed. Start Ollama and refresh to populate this list.
                      </div>
                    )}
                  </GlassCard>

                  {/* ── Self-RAG Sensitivity ── */}
                  <GlassCard>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <SectionLabel>Self-RAG Sensitivity</SectionLabel>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {(['Fast', 'Balanced', 'Strict'] as const).map(preset => (
                          <PresetButton
                            key={preset} label={preset}
                            active={sensitivityPreset(intel) === preset}
                            onClick={() => applyPreset(preset, setIntelField)}
                          />
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <SliderRow
                        label="Retrieval Depth (Top-K)"
                        description="How many chunks to pull from Qdrant before re-ranking."
                        value={parseInt(intel.similarity_top_k)}
                        min={3} max={20} step={1}
                        formatValue={v => `${v} chunks`}
                        color="#38bdf8"
                        onChange={v => setIntelField('similarity_top_k', String(v))}
                      />
                      <SliderRow
                        label="Precision (Reranker Top-N)"
                        description="Chunks passed to the LLM after SBERT cross-encoder re-ranking."
                        value={parseInt(intel.reranker_top_n)}
                        min={1} max={8} step={1}
                        formatValue={v => `${v} chunks`}
                        color="#a78bfa"
                        onChange={v => setIntelField('reranker_top_n', String(v))}
                      />
                      <SliderRow
                        label="Critic Retries"
                        description="How many times the critic LLM can expand the search if context is insufficient."
                        value={parseInt(intel.self_rag_retries)}
                        min={0} max={3} step={1}
                        formatValue={v => v === 0 ? 'Off' : `${v} ${v === 1 ? 'retry' : 'retries'}`}
                        color="#34d399"
                        onChange={v => setIntelField('self_rag_retries', String(v))}
                      />
                      <SliderRow
                        label="Semantic Chunk Threshold"
                        description="Percentile of embedding-similarity drops that trigger a chunk boundary (higher = larger, coherent chunks)."
                        value={parseInt(intel.semantic_threshold)}
                        min={70} max={99} step={1}
                        formatValue={v => `${v}th percentile`}
                        color="var(--amber)"
                        onChange={v => setIntelField('semantic_threshold', String(v))}
                      />
                    </div>
                  </GlassCard>

                  {/* ── Local Vision Controls ── */}
                  <GlassCard>
                    <SectionLabel>Local Vision Controls</SectionLabel>
                    <ToggleRow
                      label="OCR Fallback"
                      description="Use Tesseract OCR to extract text from images and scanned PDFs during indexing. Disable to save CPU on image-heavy workloads."
                      checked={intel.ocr_enabled === 'true'}
                      onChange={v => setIntelField('ocr_enabled', v ? 'true' : 'false')}
                    />
                    {intel.ocr_enabled === 'true' && (
                      <>
                        <Divider />
                        <SliderRow
                          label="Min Characters for OCR Trigger"
                          description="PDF pages with fewer extracted characters than this threshold are sent to Tesseract for OCR."
                          value={parseInt(intel.ocr_min_chars)}
                          min={10} max={200} step={5}
                          formatValue={v => `${v} chars`}
                          color="#fb923c"
                          onChange={v => setIntelField('ocr_min_chars', String(v))}
                        />
                      </>
                    )}
                  </GlassCard>

                  {/* ── Save bar ── */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--b2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--t3)' }}>
                      <AlertTriangle size={12} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                      Model changes and chunk settings apply on next backend restart.
                      RAG sensitivity and OCR settings apply immediately to new queries.
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {intelError && <span style={{ fontSize: '12px', color: '#f87171' }}>{intelError}</span>}
                      {intelSaved && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--green)' }}><Check size={11} /> Saved</span>}
                      <button
                        onClick={saveIntelligence}
                        disabled={intelSaving}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          padding: '8px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
                          background: 'var(--amber)', color: '#000',
                          border: 'none', cursor: intelSaving ? 'not-allowed' : 'pointer',
                          opacity: intelSaving ? 0.6 : 1,
                        }}
                      >
                        {intelSaving ? <><RefreshCw size={12} /> Saving…</> : <><Zap size={12} /> Apply Settings</>}
                      </button>
                    </div>
                  </div>

                </div>
              )}
            </>
          )}

          {/* ── AI Preferences tab ────────────────────────────────────── */}
          {tab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <GlassCard>
                <SectionLabel>Conversation</SectionLabel>
                <ToggleRow
                  label="Auto-Summary"
                  description="Automatically generate a title and brief summary for new threads after the first exchange."
                  checked={aiPrefs.autoSummary}
                  onChange={v => setAiPref('autoSummary', v)}
                />
                <Divider />
                <ToggleRow
                  label="Streaming Responses"
                  description="Display tokens as they are generated rather than waiting for the full response."
                  checked={aiPrefs.streaming}
                  onChange={v => setAiPref('streaming', v)}
                />
                <Divider />
                <ToggleRow
                  label="Voice Input"
                  description="Enable the microphone button in the chat bar to submit queries via speech-to-text."
                  checked={aiPrefs.voiceInput}
                  onChange={v => setAiPref('voiceInput', v)}
                />
              </GlassCard>

              <GlassCard>
                <SectionLabel>Retrieval Pipeline</SectionLabel>
                <ToggleRow
                  label="Knowledge Graph Enrichment"
                  description="Use the Neo4j graph layer to augment answers with entity relationships and linked concepts."
                  checked={aiPrefs.knowledgeGraph}
                  onChange={v => setAiPref('knowledgeGraph', v)}
                />
                <Divider />
                <ToggleRow
                  label="SBERT Re-ranking"
                  description="Run a cross-encoder re-ranker over retrieved chunks before passing them to the LLM. Slower but more accurate."
                  checked={aiPrefs.sbertRerank}
                  onChange={v => setAiPref('sbertRerank', v)}
                />
              </GlassCard>

              <GlassCard>
                <SectionLabel>Data Sovereignty</SectionLabel>
                <ToggleRow
                  label="PII Auto-Redact"
                  description="Intercept and anonymise personally identifiable information in every query and document before it reaches the model."
                  checked={true}
                  onChange={() => {}}
                  locked
                />
                <Divider />
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginTop: '16px', padding: '12px', borderRadius: '8px', fontSize: '12px', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.18)', color: 'var(--t2)', lineHeight: 1.6 }}>
                  <Shield size={13} style={{ color: 'var(--green)', flexShrink: 0, marginTop: '1px' }} />
                  <span>
                    These preferences are stored locally in your browser and applied client-side.
                    The <strong style={{ color: 'var(--t1)' }}>PII Auto-Redact</strong> setting is permanently enforced at the server level and cannot be disabled.
                  </span>
                </div>
              </GlassCard>
            </div>
          )}

          {/* ── Fortress (System) tab ─────────────────────────────────── */}
          {tab === 'system' && (
            <>
              {systemLoading && <LoadingSpinner />}
              {!systemLoading && system && (
                <>
                  {/* Air-Gap banner */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', borderRadius: '12px', padding: '20px', marginBottom: '24px',
                    background: system.air_gap
                      ? 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03))'
                      : 'linear-gradient(135deg, rgba(239,68,68,0.10), rgba(239,68,68,0.03))',
                    border: system.air_gap ? '1px solid rgba(16,185,129,0.28)' : '1px solid rgba(239,68,68,0.32)',
                    backdropFilter: 'blur(12px)',
                  }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      background: system.air_gap ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                      border: system.air_gap ? '1px solid rgba(16,185,129,0.28)' : '1px solid rgba(239,68,68,0.28)',
                    }}>
                      {system.air_gap
                        ? <WifiOff size={22} style={{ color: 'var(--green)' }} />
                        : <Wifi size={22} style={{ color: '#ef4444' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: system.air_gap ? 'var(--green)' : '#ef4444', letterSpacing: '0.03em' }}>
                        {system.air_gap ? 'Sovereign Mode Active' : 'Network Connection Detected'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--t2)', marginTop: '3px' }}>
                        {system.air_gap
                          ? 'No external internet route detected — system is operating fully offline and air-gapped.'
                          : 'An active internet connection was detected. Verify network policy compliance.'}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, padding: '6px 12px', borderRadius: '999px',
                      background: system.air_gap ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)',
                      border: system.air_gap ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(239,68,68,0.35)',
                      color: system.air_gap ? 'var(--green)' : '#ef4444',
                      letterSpacing: '0.08em',
                    }}>
                      {system.air_gap ? 'AIR-GAPPED' : 'CONNECTED'}
                    </div>
                  </div>

                  {/* Hardware gauges */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                    <GaugeCard label="CPU USAGE"  icon={<Cpu size={14} />}        percent={system.cpu_percent}  subtitle={`${system.cpu_percent}%`}                                                    color={gaugeColor(system.cpu_percent)} />
                    <GaugeCard label="RAM USAGE"  icon={<MemoryStick size={14} />} percent={system.ram.percent}  subtitle={`${system.ram.used_gb} / ${system.ram.total_gb} GB`}                       color={gaugeColor(system.ram.percent)} />
                    <GaugeCard label="VRAM USAGE" icon={<Server size={14} />}      percent={system.vram.available ? system.vram.percent : 0}
                      subtitle={system.vram.available ? `${system.vram.used_gb} / ${system.vram.total_gb} GB` : 'No GPU'}
                      color={system.vram.available ? gaugeColor(system.vram.percent) : 'var(--t3)'}
                      dimmed={!system.vram.available} gpuName={system.vram.name}
                    />
                  </div>

                  {/* PII Shield summary */}
                  <GlassCard>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.25)' }}>
                        <Shield size={15} style={{ color: '#f87171' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)' }}>PII Shield — All-Time Statistics</div>
                        <div style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '1px' }}>Sensitive data intercepted and redacted locally — never left this machine.</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                      <PiiStatCard label="TOTAL REDACTIONS" value={system.pii_this_month} color="#f87171" Icon={Shield} />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginTop: '16px', padding: '12px', borderRadius: '8px', fontSize: '12px', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.18)', color: 'var(--t2)', lineHeight: 1.6 }}>
                      <Shield size={13} style={{ color: 'var(--green)', flexShrink: 0, marginTop: '1px' }} />
                      <span>
                        Every PII item counted here was <strong style={{ color: 'var(--t1)' }}>detected and anonymised on-device</strong> before reaching the language model.
                        Visit <strong style={{ color: 'var(--t1)' }}>Privacy Audit</strong> for the full breakdown by type, user and day.
                      </span>
                    </div>
                  </GlassCard>
                </>
              )}
            </>
          )}

          {/* ── Audit Trail tab ───────────────────────────────────────── */}
          {tab === 'audit' && (
            <GlassCard>
              <div style={{ fontFamily: 'monospace', marginBottom: '12px', fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.1em' }}>AUDIT TRAIL — {audit.length} EVENTS</div>
              {audit.length === 0
                ? <EmptyState>No audit events recorded.</EmptyState>
                : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--b1)' }}>
                          {Object.keys(audit[0]).map(col => (
                            <th key={col} className="font-mono" style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--t3)', fontSize: '9px', letterSpacing: '0.08em', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              {col.toUpperCase()}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {audit.map((row, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--b1)' }}>
                            {Object.values(row).map((val, j) => (
                              <td key={j} style={{ padding: '9px 14px', color: 'var(--t2)', whiteSpace: 'nowrap', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {String(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </GlassCard>
          )}

        </main>
      </div>

      {showReindex && <ReindexModal onClose={() => setShowReindex(false)} isAdmin={true} />}
    </div>
  );
}

// ─── Layout primitives ────────────────────────────────────────────────────────

function GlassCard({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={className}
      style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface)', border: '1px solid var(--b2)', borderRadius: '12px', padding: '20px', ...style }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'monospace', marginBottom: '16px', fontSize: '9.5px', color: 'var(--t3)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: '1px', background: 'var(--b1)', margin: '16px 0' }} />;
}

function LoadingSpinner() {
  return <div style={{ padding: '48px', textAlign: 'center', color: 'var(--t3)', fontSize: '13px' }}>Loading…</div>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '32px', textAlign: 'center', color: 'var(--t3)', fontSize: '13px' }}>{children}</div>;
}

function SmallButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '5px 8px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--t2)', cursor: 'pointer' }}>
      {children}
    </button>
  );
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, locked }: { checked: boolean; onChange: (v: boolean) => void; locked?: boolean }) {
  return (
    <button
      onClick={() => !locked && onChange(!checked)}
      style={{
        position: 'relative', width: '38px', height: '22px', borderRadius: '11px',
        border: 'none', cursor: locked ? 'not-allowed' : 'pointer', flexShrink: 0,
        background: checked ? 'var(--amber)' : 'rgba(255,255,255,0.10)',
        transition: 'background 0.2s ease',
        opacity: locked ? 0.6 : 1,
      }}
      title={locked ? 'This setting is permanently enforced' : undefined}
    >
      <span style={{
        position: 'absolute', top: '3px',
        left: checked ? '19px' : '3px',
        width: '16px', height: '16px', borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
        transition: 'left 0.2s cubic-bezier(0.4,0,0.2,1)',
        display: 'block',
      }} />
    </button>
  );
}

function ToggleRow({ label, description, checked, onChange, locked }: {
  label: string; description: string; checked: boolean;
  onChange: (v: boolean) => void; locked?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', fontWeight: 500, color: 'var(--t1)', marginBottom: '4px' }}>
          {label}
          {locked && <Lock size={10} style={{ color: 'var(--amber)', opacity: 0.7 }} />}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--t3)', lineHeight: 1.5 }}>{description}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} locked={locked} />
    </div>
  );
}

// ─── Chart / stat helpers ─────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number | string; icon: React.ElementType; color: string;
}) {
  return (
    <GlassCard>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: `${color}18`, border: `1px solid ${color}33` }}>
          <Icon size={15} style={{ color }} />
        </div>
        <div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--t1)', lineHeight: 1 }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
          <div style={{ fontFamily: 'monospace', marginTop: '4px', fontSize: '9px', color: 'var(--t3)', letterSpacing: '0.08em' }}>{label}</div>
        </div>
      </div>
    </GlassCard>
  );
}

function BarChart({ data, max }: { data: ByType[]; max: number }) {
  if (!data.length) return <EmptyState>No redactions recorded yet.</EmptyState>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {data.map(({ pii_type, count }) => {
        const pct = max > 0 ? (count / max) * 100 : 0;
        const col = typeColor(pii_type);
        return (
          <div key={pii_type} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontFamily: 'monospace', textAlign: 'right', flexShrink: 0, width: '110px', fontSize: '10px', color: col, letterSpacing: '0.06em' }}>{pii_type}</span>
            <div style={{ flex: 1, height: '8px', borderRadius: '4px', overflow: 'hidden', background: 'var(--raised)' }}>
              <div style={{ height: '100%', width: `${pct}%`, borderRadius: '4px', background: col, transition: 'width 0.5s ease' }} />
            </div>
            <span style={{ fontFamily: 'monospace', textAlign: 'right', flexShrink: 0, width: '28px', fontSize: '11px', color: 'var(--t2)' }}>{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function Sparkline({ data }: { data: ByDay[] }) {
  if (!data.length) return <EmptyState>No data in the last 30 days.</EmptyState>;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '56px' }}>
      {data.map(({ date, count }) => (
        <div
          key={date} title={`${date}: ${count}`}
          style={{ flex: 1, minWidth: '4px', height: `${Math.max((count / max) * 100, 4)}%`, background: 'var(--amber)', opacity: 0.7, borderRadius: '2px 2px 0 0', cursor: 'default', transition: 'opacity 0.12s ease' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.7'; }}
        />
      ))}
    </div>
  );
}

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

function CredRow({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      borderRadius: '8px', padding: '10px 12px', marginBottom: '6px',
      background: highlight ? 'rgba(245,158,11,0.08)' : 'var(--raised)',
      border: highlight ? '1px solid rgba(245,158,11,0.30)' : '1px solid var(--b1)',
    }}>
      <span style={{ fontFamily: 'monospace', flexShrink: 0, fontSize: '9.5px', color: 'var(--t3)', letterSpacing: '0.08em', textTransform: 'uppercase', width: '80px' }}>{label}</span>
      <code style={{ fontFamily: mono ? 'monospace' : 'inherit', flex: 1, fontSize: mono ? '13px' : '12.5px', color: 'var(--t1)', fontWeight: highlight ? 600 : 400, userSelect: 'all', wordBreak: 'break-all', letterSpacing: mono ? '0.05em' : 0 }}>
        {value}
      </code>
    </div>
  );
}

function fmt(ts: string) { try { return new Date(ts).toLocaleString(); } catch { return ts; } }

// ─── Gauge helpers ────────────────────────────────────────────────────────────

function gaugeColor(pct: number): string {
  if (pct >= 85) return '#ef4444';
  if (pct >= 65) return 'var(--amber)';
  return 'var(--green)';
}

function GaugeCard({ label, icon, percent, subtitle, color, dimmed, gpuName }: {
  label: string; icon: React.ReactNode; percent: number; subtitle: string;
  color: string; dimmed?: boolean; gpuName?: string;
}) {
  const R = 46, CIRC = 2 * Math.PI * R;
  const dash = dimmed ? 0 : (percent / 100) * CIRC;
  const gap  = CIRC - dash;

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--b2)',
      borderRadius: '14px', padding: '22px 16px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
      opacity: dimmed ? 0.5 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--t3)' }}>
        {icon}
        <span className="font-mono" style={{ fontSize: '9.5px', letterSpacing: '0.1em' }}>{label}</span>
      </div>
      <div style={{ position: 'relative', width: '110px', height: '110px', flexShrink: 0 }}>
        <svg width="110" height="110" viewBox="0 0 110 110">
          <circle cx="55" cy="55" r={R} fill="none" stroke="var(--raised)" strokeWidth="8" />
          <circle cx="55" cy="55" r={R} fill="none" stroke={color} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={CIRC * 0.25}
            style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.4,0,0.2,1)' }}
          />
        </svg>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: '22px', fontWeight: 700, color: dimmed ? 'var(--t3)' : color, lineHeight: 1 }}>
            {dimmed ? '—' : `${Math.round(percent)}%`}
          </span>
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div className="font-mono" style={{ fontSize: '11px', color: 'var(--t2)', fontWeight: 500 }}>{subtitle}</div>
        {gpuName && <div style={{ fontSize: '10px', color: 'var(--t3)', marginTop: '3px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gpuName}</div>}
      </div>
    </div>
  );
}

// ─── Intelligence helpers ─────────────────────────────────────────────────────

type Preset = 'Fast' | 'Balanced' | 'Strict';

const PRESETS: Record<Preset, Partial<Record<string, string>>> = {
  Fast:     { similarity_top_k: '5',  reranker_top_n: '2', self_rag_retries: '0' },
  Balanced: { similarity_top_k: '10', reranker_top_n: '3', self_rag_retries: '2' },
  Strict:   { similarity_top_k: '18', reranker_top_n: '6', self_rag_retries: '3' },
};

function sensitivityPreset(s: { similarity_top_k: string; reranker_top_n: string; self_rag_retries: string }): Preset | null {
  for (const [name, vals] of Object.entries(PRESETS)) {
    if (
      s.similarity_top_k  === vals.similarity_top_k  &&
      s.reranker_top_n    === vals.reranker_top_n    &&
      s.self_rag_retries  === vals.self_rag_retries
    ) return name as Preset;
  }
  return null;
}

function applyPreset(preset: Preset, set: (k: string, v: string) => void) {
  const vals = PRESETS[preset];
  for (const [k, v] of Object.entries(vals)) set(k, v!);
}

function PresetButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
      style={{
        background: active ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)',
        border: active ? '1px solid rgba(245,158,11,0.40)' : '1px solid rgba(255,255,255,0.08)',
        color: active ? 'var(--amber)' : 'var(--t3)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function ModelSelect({ label, description, value, models, onChange }: {
  label: string; description: string; value: string;
  models: string[]; onChange: (v: string) => void;
}) {
  const allOptions = models.includes(value) ? models : (value ? [value, ...models] : models);
  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--t1)', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '11.5px', color: 'var(--t3)', marginBottom: '8px', lineHeight: 1.4 }}>{description}</div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full text-sm rounded-lg px-3 py-2 outline-none"
        style={{
          background: 'var(--raised)',
          border: '1px solid var(--b2)',
          color: 'var(--t1)', cursor: 'pointer',
        }}
      >
        {allOptions.length === 0 && (
          <option value={value}>{value || 'No models available'}</option>
        )}
        {allOptions.map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
}

function SliderRow({ label, description, value, min, max, step, formatValue, color, onChange }: {
  label: string; description: string; value: number; min: number; max: number;
  step: number; formatValue: (v: number) => string; color: string; onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--t1)' }}>{label}</div>
        <span style={{ fontFamily: 'monospace', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', background: `${color}18`, color, border: `1px solid ${color}30` }}>
          {formatValue(value)}
        </span>
      </div>
      <div style={{ fontSize: '11.5px', color: 'var(--t3)', marginBottom: '10px', lineHeight: 1.4 }}>{description}</div>
      <div style={{ position: 'relative', height: '6px', borderRadius: '3px', background: 'var(--raised)' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: '3px', background: color, transition: 'width 0.15s ease' }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            opacity: 0, cursor: 'pointer', margin: 0,
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
        <span style={{ fontFamily: 'monospace', fontSize: '9px', color: 'var(--t3)' }}>{formatValue(min)}</span>
        <span style={{ fontFamily: 'monospace', fontSize: '9px', color: 'var(--t3)' }}>{formatValue(max)}</span>
      </div>
    </div>
  );
}

function PiiStatCard({ label, value, color, Icon }: { label: string; value: number; color: string; Icon: React.ElementType }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderRadius: '12px', padding: '16px', background: 'var(--raised)', border: `1px solid ${color}44` }}>
      <div style={{ width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: `${color}14`, border: `1px solid ${color}30` }}>
        <Icon size={15} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--t1)', lineHeight: 1 }}>{value.toLocaleString()}</div>
        <div style={{ fontFamily: 'monospace', marginTop: '4px', fontSize: '9px', color: 'var(--t3)', letterSpacing: '0.08em' }}>{label}</div>
      </div>
    </div>
  );
}

// ─── Admin header helpers ─────────────────────────────────────────────────────

const KBD_STYLE: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '1px 5px', fontSize: '10px', fontWeight: 600,
  fontFamily: '"JetBrains Mono", monospace',
  background: 'var(--surface)', border: '1px solid var(--b2)',
  borderRadius: '3px', color: 'var(--t2)',
  minWidth: '18px', height: '16px',
};

function AdminIconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '30px', height: '30px', borderRadius: '7px', flexShrink: 0,
        background: 'transparent', border: 'none',
        color: 'var(--t2)', cursor: 'pointer', transition: 'all 0.12s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--raised)'; e.currentTarget.style.color = 'var(--t1)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--t2)'; }}
    >
      {children}
    </button>
  );
}

function AdminMenuItem({ icon, children, onClick, danger }: {
  icon?: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
        padding: '7px 10px', borderRadius: '6px', cursor: 'pointer',
        background: hov ? (danger ? 'rgba(239,68,68,0.08)' : 'var(--raised)') : 'transparent',
        border: 'none', color: danger ? '#ef4444' : 'var(--t1)',
        fontSize: '12.5px', fontWeight: 500, textAlign: 'left',
        transition: 'all 0.1s ease',
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{children}</span>
    </button>
  );
}
