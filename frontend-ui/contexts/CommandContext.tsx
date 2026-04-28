'use client';

import {
  createContext, useContext, useState, useCallback, useEffect, useMemo, useRef,
  ReactNode,
} from 'react';
import { Search, ArrowRight, Hash, Folder, Zap, Clock, CornerDownLeft, ChevronUp, ChevronDown } from 'lucide-react';

export interface CommandItem {
  id: string;
  group: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  shortcut?: string[];
  keywords?: string;
  onSelect: () => void;
}

interface CommandContextValue {
  open: () => void;
  close: () => void;
  toggle: () => void;
  register: (items: CommandItem[]) => () => void;
}

const CommandContext = createContext<CommandContextValue | null>(null);

const RECENT_KEY = 'sovereign-cmd-recent';
const MAX_RECENT = 6;

export function CommandProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [registries, setRegistries] = useState<Record<string, CommandItem[]>>({});

  const open  = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const register = useCallback((items: CommandItem[]) => {
    const key = `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setRegistries((prev) => ({ ...prev, [key]: items }));
    return () => {
      setRegistries((prev) => {
        const { [key]: _, ...rest } = prev;
        return rest;
      });
    };
  }, []);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const allCommands = useMemo(() => {
    const seen = new Set<string>();
    const out: CommandItem[] = [];
    for (const list of Object.values(registries)) {
      for (const item of list) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        out.push(item);
      }
    }
    return out;
  }, [registries]);

  return (
    <CommandContext.Provider value={{ open, close, toggle, register }}>
      {children}
      {isOpen && <CommandPaletteUI commands={allCommands} onClose={close} />}
    </CommandContext.Provider>
  );
}

export const useCommand = () => {
  const ctx = useContext(CommandContext);
  if (!ctx) throw new Error('useCommand must be used inside <CommandProvider>');
  return ctx;
};

/** Register a list of commands with the palette. Re-registers on change. */
export function useRegisterCommands(items: CommandItem[], deps: unknown[] = []) {
  const { register } = useCommand();
  // Re-register only when deps change to avoid infinite loops.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => register(items), deps);
}

// ─── Palette UI ────────────────────────────────────────────────────────────
function CommandPaletteUI({ commands, onClose }: { commands: CommandItem[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load recent on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_KEY);
      if (stored) setRecent(JSON.parse(stored));
    } catch {}
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  // Filter + group commands
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      const recentItems = recent
        .map((id) => commands.find((c) => c.id === id))
        .filter((c): c is CommandItem => Boolean(c))
        .map((c) => ({ ...c, group: 'Recent' }));
      const recentIds = new Set(recentItems.map((c) => c.id));
      const rest = commands.filter((c) => !recentIds.has(c.id));
      return [...recentItems, ...rest];
    }
    return commands
      .map((c) => ({ ...c, _score: scoreMatch(q, c) }))
      .filter((c) => c._score > 0)
      .sort((a, b) => b._score - a._score)
      .map(({ _score, ...c }) => c);
  }, [commands, query, recent]);

  // Reset active index when query changes
  useEffect(() => { setActiveIdx(0); }, [query]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filtered[activeIdx];
        if (item) selectItem(item);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered, activeIdx, onClose]);

  // Scroll active into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  function selectItem(item: CommandItem) {
    // Save to recent
    try {
      const next = [item.id, ...recent.filter((id) => id !== item.id)].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      setRecent(next);
    } catch {}
    onClose();
    setTimeout(() => item.onSelect(), 0);
  }

  // Group rendering
  const grouped = useMemo(() => {
    const groups: { name: string; items: CommandItem[] }[] = [];
    let currentGroup = '';
    let bucket: CommandItem[] = [];
    for (const c of filtered) {
      if (c.group !== currentGroup) {
        if (bucket.length) groups.push({ name: currentGroup, items: bucket });
        currentGroup = c.group;
        bucket = [];
      }
      bucket.push(c);
    }
    if (bucket.length) groups.push({ name: currentGroup, items: bucket });
    return groups;
  }, [filtered]);

  let runningIdx = -1;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '14vh',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        animation: 'fadeIn 0.12s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '640px',
          background: 'var(--surface)',
          border: '1px solid var(--b2)',
          borderRadius: '14px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.50), 0 4px 16px rgba(0,0,0,0.30)',
          overflow: 'hidden',
          animation: 'fadeUp 0.18s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* ── Search input ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '14px 18px', borderBottom: '1px solid var(--b1)',
        }}>
          <Search size={16} style={{ color: 'var(--t3)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, threads, actions…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--t1)', fontSize: '15px',
              fontFamily: 'inherit',
            }}
          />
          <kbd style={kbdStyle}>ESC</kbd>
        </div>

        {/* ── Results ── */}
        <div ref={listRef} style={{
          maxHeight: '420px', overflowY: 'auto', padding: '6px',
        }}>
          {filtered.length === 0 ? (
            <div style={{
              padding: '48px 20px', textAlign: 'center', color: 'var(--t3)', fontSize: '13px',
            }}>
              No matches for &ldquo;{query}&rdquo;
            </div>
          ) : (
            grouped.map((g) => (
              <div key={g.name}>
                <div style={{
                  padding: '10px 12px 6px', fontSize: '10px', fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                  {groupIcon(g.name)}
                  {g.name}
                </div>
                {g.items.map((item) => {
                  runningIdx++;
                  const isActive = runningIdx === activeIdx;
                  const localIdx = runningIdx;
                  return (
                    <div
                      key={item.id}
                      data-idx={localIdx}
                      onMouseEnter={() => setActiveIdx(localIdx)}
                      onClick={() => selectItem(item)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '9px 12px', borderRadius: '8px', cursor: 'pointer',
                        background: isActive ? 'var(--amber-10)' : 'transparent',
                        border: isActive ? '1px solid var(--amber-25)' : '1px solid transparent',
                        marginBottom: '2px',
                      }}
                    >
                      <span style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: '22px', height: '22px', flexShrink: 0,
                        color: isActive ? 'var(--amber)' : 'var(--t2)',
                      }}>
                        {item.icon ?? <ArrowRight size={14} />}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '13px', color: 'var(--t1)', fontWeight: 500,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {item.label}
                        </div>
                        {item.description && (
                          <div style={{
                            fontSize: '11px', color: 'var(--t3)', marginTop: '1px',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {item.description}
                          </div>
                        )}
                      </div>
                      {item.shortcut && (
                        <div style={{ display: 'flex', gap: '3px' }}>
                          {item.shortcut.map((k, i) => (
                            <kbd key={i} style={kbdStyle}>{k}</kbd>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px', borderTop: '1px solid var(--b1)',
          background: 'var(--deep)', fontSize: '11px', color: 'var(--t3)',
        }}>
          <div style={{ display: 'flex', gap: '14px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <ChevronUp size={11} /><ChevronDown size={11} /> navigate
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <CornerDownLeft size={11} /> select
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span>powered by</span>
            <span className="font-display" style={{ color: 'var(--amber)', fontWeight: 600 }}>Sovereign</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────────
function scoreMatch(q: string, item: CommandItem): number {
  const haystack = `${item.label} ${item.description ?? ''} ${item.keywords ?? ''} ${item.group}`.toLowerCase();
  const label = item.label.toLowerCase();

  if (label === q) return 1000;
  if (label.startsWith(q)) return 500 + (100 - Math.min(99, label.length));
  if (label.includes(q)) return 250;
  if (haystack.includes(q)) return 100;

  // Subsequence match (fuzzy)
  let hi = 0;
  for (const ch of q) {
    const idx = haystack.indexOf(ch, hi);
    if (idx === -1) return 0;
    hi = idx + 1;
  }
  return 50;
}

function groupIcon(group: string) {
  const size = 11;
  if (group === 'Projects') return <Folder size={size} />;
  if (group === 'Threads')  return <Hash size={size} />;
  if (group === 'Actions')  return <Zap size={size} />;
  if (group === 'Recent')   return <Clock size={size} />;
  return null;
}

const kbdStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '2px 6px', fontSize: '10px', fontWeight: 600,
  fontFamily: '"JetBrains Mono", monospace',
  background: 'var(--raised)', border: '1px solid var(--b2)',
  borderRadius: '4px', color: 'var(--t2)',
  minWidth: '20px', height: '18px',
};
