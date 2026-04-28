'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, MessageSquare, Network, ChevronRight, Folder, Hash, User,
  Settings, LogOut, Keyboard, Sun, Moon, Bell, Activity, DatabaseZap,
} from 'lucide-react';
import { useCommand } from '@/contexts/CommandContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useSession } from '@/contexts/SessionContext';

interface TopBarProps {
  activeProject: string;
  activeThread: string;
  viewMode: 'chat' | 'graph';
  onViewModeChange: (m: 'chat' | 'graph') => void;
  onOpenDocs: () => void;
  onOpenShortcuts: () => void;
  onReindex?: () => void;
  pendingNotifications?: number;
}

export default function TopBar({
  activeProject, activeThread, viewMode, onViewModeChange,
  onOpenDocs, onOpenShortcuts, onReindex, pendingNotifications = 0,
}: TopBarProps) {
  const router = useRouter();
  const { open: openCmd } = useCommand();
  const { theme, toggle: toggleTheme } = useTheme();
  const { session, refresh } = useSession();
  const toast = useToast();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMac(typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac'));
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
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
    } catch {
      toast.error('Sign out failed');
    }
  }

  return (
    <header style={{
      display: 'flex', alignItems: 'center',
      height: '46px', flexShrink: 0,
      padding: '0 14px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--b1)',
      gap: '12px',
      position: 'relative', zIndex: 30,
    }}>
      {/* ── Breadcrumb ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        fontSize: '13px', color: 'var(--t1)', minWidth: 0, flexShrink: 1,
      }}>
        {activeProject ? (
          <>
            <Folder size={13} style={{ color: 'var(--t2)', flexShrink: 0 }} />
            <span style={{
              color: 'var(--t1)', fontWeight: 600,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: '200px',
            }}>
              {activeProject}
            </span>
            <ChevronRight size={12} style={{ color: 'var(--t2)', flexShrink: 0 }} />
            <Hash size={12} style={{ color: 'var(--t2)', flexShrink: 0 }} />
            <span style={{
              color: 'var(--t1)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: '180px',
            }}>
              {activeThread}
            </span>
          </>
        ) : (
          <span style={{ color: 'var(--t2)', fontStyle: 'italic' }}>
            No workspace selected
          </span>
        )}
      </div>

      {/* ── View tabs ── */}
      <div style={{
        display: 'flex', gap: '2px', padding: '3px',
        background: 'var(--deep)', border: '1px solid var(--b1)',
        borderRadius: '8px', marginLeft: '4px',
      }}>
        {([
          { id: 'chat',  Icon: MessageSquare, label: 'Chat'  },
          { id: 'graph', Icon: Network,       label: 'Graph' },
        ] as const).map(({ id, Icon, label }) => {
          const active = viewMode === id;
          return (
            <button
              key={id}
              onClick={() => onViewModeChange(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '4px 10px', borderRadius: '5px', cursor: 'pointer',
                border: 'none',
                background: active ? 'var(--raised)' : 'transparent',
                color: active ? 'var(--t1)' : 'var(--t3)',
                fontSize: '12px', fontWeight: active ? 600 : 500,
                boxShadow: active ? '0 1px 2px rgba(0,0,0,0.18)' : 'none',
                transition: 'all 0.12s ease',
              }}
            >
              <Icon size={12} />
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Spacer ── */}
      <div style={{ flex: 1 }} />

      {/* ── Search trigger (Cmd+K) ── */}
      <button
        onClick={openCmd}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '5px 8px 5px 10px', borderRadius: '7px',
          background: 'var(--deep)', border: '1px solid var(--b1)',
          color: 'var(--t3)', fontSize: '12px', cursor: 'pointer',
          minWidth: '220px',
          transition: 'all 0.12s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--b2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--b1)'; }}
      >
        <Search size={12} />
        <span style={{ flex: 1, textAlign: 'left' }}>Quick search…</span>
        <span style={{ display: 'flex', gap: '3px' }}>
          <kbd style={kbd}>{isMac ? '⌘' : 'Ctrl'}</kbd>
          <kbd style={kbd}>K</kbd>
        </span>
      </button>

      {/* ── Reindex button ── */}
      {session && onReindex && (
        <button
          onClick={onReindex}
          title="Reindex Documents"
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '5px 11px', borderRadius: '7px', cursor: 'pointer',
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.28)',
            color: 'var(--amber)', fontSize: '11.5px', fontWeight: 600,
            letterSpacing: '0.01em', transition: 'all 0.15s ease', flexShrink: 0,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(245,158,11,0.15)';
            e.currentTarget.style.borderColor = 'rgba(245,158,11,0.50)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(245,158,11,0.08)';
            e.currentTarget.style.borderColor = 'rgba(245,158,11,0.28)';
          }}
        >
          <DatabaseZap size={12} />
          Reindex
        </button>
      )}

      {/* ── Notifications ── */}
      <IconButton
        title="Notifications"
        onClick={() => toast.info('Notifications', `${pendingNotifications} pending events`)}
      >
        <div style={{ position: 'relative' }}>
          <Bell size={14} />
          {pendingNotifications > 0 && (
            <span style={{
              position: 'absolute', top: '-3px', right: '-3px',
              minWidth: '8px', height: '8px', borderRadius: '50%',
              background: 'var(--amber)',
              boxShadow: '0 0 0 2px var(--surface)',
            }} />
          )}
        </div>
      </IconButton>

      {/* ── Keyboard shortcuts ── */}
      <IconButton title="Keyboard shortcuts (?)" onClick={onOpenShortcuts}>
        <Keyboard size={14} />
      </IconButton>

      {/* ── Theme toggle ── */}
      <IconButton title={theme === 'dark' ? 'Light mode' : 'Dark mode'} onClick={toggleTheme}>
        {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
      </IconButton>

      {/* ── Status pill ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '5px',
        padding: '3px 8px', borderRadius: '999px',
        background: 'rgba(16,185,129,0.10)',
        border: '1px solid rgba(16,185,129,0.25)',
        fontSize: '10.5px', fontWeight: 600, color: 'var(--green)',
      }}>
        <span className="pulse-green" style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: 'var(--green)',
        }} />
        Live
      </div>

      {/* ── User menu ── */}
      <div ref={userMenuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setUserMenuOpen((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '3px 8px 3px 3px', borderRadius: '999px',
            background: userMenuOpen ? 'var(--raised)' : 'transparent',
            border: '1px solid var(--b1)',
            cursor: 'pointer', transition: 'all 0.12s ease',
          }}
        >
          <div style={{
            width: '24px', height: '24px', borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--amber) 0%, var(--amber-dark) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '11px', fontWeight: 700,
            fontFamily: 'var(--font-display, "Syne", sans-serif)',
          }}>
            {(session?.username ?? 'U').charAt(0).toUpperCase()}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--t1)', fontWeight: 500 }}>
            {session?.username ?? 'Guest'}
          </span>
        </button>

        {userMenuOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0,
            minWidth: '220px', padding: '6px',
            background: 'var(--raised)',
            border: '1px solid var(--b2)', borderRadius: '10px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)',
            zIndex: 50,
            animation: 'fadeUp 0.14s cubic-bezier(0.16,1,0.3,1)',
          }}>
            <div style={{
              padding: '10px 12px 8px', borderBottom: '1px solid var(--b1)',
              marginBottom: '4px',
            }}>
              <div style={{ fontSize: '13px', color: 'var(--t1)', fontWeight: 600 }}>
                {session?.username ?? 'Guest'}
              </div>
              <div style={{
                fontSize: '11px', color: 'var(--t3)', marginTop: '2px',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}>
                <span style={{
                  padding: '1px 6px', borderRadius: '4px',
                  background: 'var(--amber-10)', color: 'var(--amber)',
                  fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}>
                  {session?.role ?? 'user'}
                </span>
              </div>
            </div>

            <MenuItem icon={<User size={13} />} onClick={() => { setUserMenuOpen(false); router.push('/admin'); }}>
              Profile
            </MenuItem>
            <MenuItem icon={<Settings size={13} />} onClick={() => { setUserMenuOpen(false); router.push('/admin'); }}>
              Settings
            </MenuItem>
            <MenuItem icon={<Activity size={13} />} onClick={() => { setUserMenuOpen(false); toast.info('System health', 'All services nominal'); }}>
              System health
            </MenuItem>
            <MenuItem icon={<Keyboard size={13} />} shortcut="?" onClick={() => { setUserMenuOpen(false); onOpenShortcuts(); }}>
              Keyboard shortcuts
            </MenuItem>
            <div style={{ height: '1px', background: 'var(--b1)', margin: '4px 0' }} />
            <MenuItem icon={<LogOut size={13} />} danger onClick={() => { setUserMenuOpen(false); logout(); }}>
              Sign out
            </MenuItem>
          </div>
        )}
      </div>
    </header>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────────
function IconButton({ children, title, onClick }: {
  children: React.ReactNode; title: string; onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '30px', height: '30px', borderRadius: '7px',
        background: 'transparent', border: 'none',
        color: 'var(--t2)', cursor: 'pointer',
        transition: 'all 0.12s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--hover-bg)';
        e.currentTarget.style.color = 'var(--t1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--t2)';
      }}
    >
      {children}
    </button>
  );
}

function MenuItem({ icon, children, shortcut, onClick, danger }: {
  icon?: React.ReactNode; children: React.ReactNode; shortcut?: string;
  onClick: () => void; danger?: boolean;
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
        background: hov ? (danger ? 'rgba(239,68,68,0.08)' : 'var(--hover-bg)') : 'transparent',
        border: 'none',
        color: danger ? '#ef4444' : 'var(--t1)',
        fontSize: '12.5px', fontWeight: 500, textAlign: 'left',
        transition: 'all 0.1s ease',
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{children}</span>
      {shortcut && <kbd style={kbd}>{shortcut}</kbd>}
    </button>
  );
}

const kbd: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '1px 5px', fontSize: '10px', fontWeight: 600,
  fontFamily: '"JetBrains Mono", monospace',
  background: 'var(--surface)', border: '1px solid var(--b2)',
  borderRadius: '3px', color: 'var(--t2)',
  minWidth: '18px', height: '16px',
};
