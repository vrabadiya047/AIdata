'use client';

import { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
  isMac?: boolean;
}

interface ShortcutGroup {
  title: string;
  items: { keys: string[]; label: string }[];
}

export default function ShortcutsOverlay({ open, onClose, isMac = false }: ShortcutsOverlayProps) {
  const cmd = isMac ? '⌘' : 'Ctrl';

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const groups: ShortcutGroup[] = [
    {
      title: 'General',
      items: [
        { keys: [cmd, 'K'],    label: 'Open command palette' },
        { keys: ['?'],         label: 'Show this overlay' },
        { keys: ['ESC'],       label: 'Dismiss any overlay' },
        { keys: [cmd, '/'],    label: 'Toggle theme' },
      ],
    },
    {
      title: 'Navigation',
      items: [
        { keys: [cmd, '1'],    label: 'Switch to Chat view' },
        { keys: [cmd, '2'],    label: 'Switch to Knowledge Graph' },
        { keys: [cmd, 'D'],    label: 'Open Documents panel' },
        { keys: [cmd, 'B'],    label: 'Toggle sidebar' },
      ],
    },
    {
      title: 'Chat',
      items: [
        { keys: ['Enter'],            label: 'Send message' },
        { keys: ['Shift', 'Enter'],   label: 'New line' },
        { keys: [cmd, 'Enter'],       label: 'Send & retain context' },
        { keys: [cmd, 'N'],           label: 'New thread' },
        { keys: [cmd, '↑'],           label: 'Edit last message' },
      ],
    },
    {
      title: 'Search & Selection',
      items: [
        { keys: ['↑', '↓'],    label: 'Move selection in palette' },
        { keys: ['Enter'],     label: 'Select item' },
        { keys: ['Tab'],       label: 'Cycle filters' },
      ],
    },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.14s ease',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '720px', maxHeight: '85vh',
          background: 'var(--surface)', border: '1px solid var(--b2)',
          borderRadius: '14px', overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3)',
          animation: 'fadeUp 0.18s cubic-bezier(0.16,1,0.3,1)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--b1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '8px',
              background: 'var(--amber-10)', border: '1px solid var(--amber-25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--amber)',
            }}>
              <Keyboard size={16} />
            </div>
            <div>
              <div className="font-display" style={{
                fontSize: '15px', fontWeight: 700, color: 'var(--t1)',
              }}>
                Keyboard Shortcuts
              </div>
              <div style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '1px' }}>
                Move faster with these key combos
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '28px', height: '28px', borderRadius: '7px',
              background: 'transparent', border: '1px solid var(--b1)',
              color: 'var(--t2)', cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{
          padding: '18px 20px', overflowY: 'auto',
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px 32px',
        }}>
          {groups.map((g) => (
            <div key={g.title}>
              <div className="font-mono" style={{
                fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: 'var(--amber)',
                marginBottom: '10px',
              }}>
                {g.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {g.items.map((it, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '7px 10px', borderRadius: '7px',
                      background: 'var(--deep)',
                      border: '1px solid var(--b1)',
                    }}
                  >
                    <span style={{ fontSize: '12.5px', color: 'var(--t1)' }}>
                      {it.label}
                    </span>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      {it.keys.map((k, j) => (
                        <kbd key={j} style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          padding: '2px 7px', minWidth: '22px', height: '20px',
                          fontSize: '11px', fontWeight: 600,
                          fontFamily: '"JetBrains Mono", monospace',
                          background: 'var(--raised)', border: '1px solid var(--b2)',
                          borderRadius: '5px', color: 'var(--t1)',
                          boxShadow: '0 1px 0 var(--b2)',
                        }}>
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--b1)',
          background: 'var(--deep)', fontSize: '11px', color: 'var(--t3)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>
            Tip: Most shortcuts work globally — even when not focused on the chat.
          </span>
          <span>
            Press <kbd style={{
              padding: '1px 5px', fontSize: '10px',
              fontFamily: '"JetBrains Mono", monospace',
              background: 'var(--raised)', border: '1px solid var(--b2)',
              borderRadius: '3px', color: 'var(--t2)',
            }}>ESC</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
