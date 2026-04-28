'use client';

import {
  createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef,
} from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration: number;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  show: (t: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
  trackInBackground: (jobIds: string[], title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastContextValue['show']>(({ duration = 4500, ...rest }) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, duration, ...rest }]);
    return id;
  }, []);

  const trackInBackground = useCallback((jobIds: string[], title: string, description?: string) => {
    if (!jobIds.length) return;
    const ids = [...jobIds];
    const interval = setInterval(async () => {
      try {
        const statuses = await Promise.all(
          ids.map(id => fetch(`/api/jobs/${id}`).then(r => r.ok ? r.json() : null))
        );
        const done = statuses.filter(j => j && (j.status === 'done' || j.status === 'failed')).length;
        if (done === ids.length) {
          clearInterval(interval);
          show({ type: 'success', title, description, duration: 6000 });
        }
      } catch { /* ignore transient network errors */ }
    }, 2000);
  }, [show]);

  const value: ToastContextValue = {
    show,
    success: (title, description) => show({ type: 'success', title, description }),
    error:   (title, description) => show({ type: 'error',   title, description, duration: 6500 }),
    info:    (title, description) => show({ type: 'info',    title, description }),
    warning: (title, description) => show({ type: 'warning', title, description }),
    dismiss,
    trackInBackground,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
};

// ─── Viewport ──────────────────────────────────────────────────────────────
function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div
      style={{
        position: 'fixed', bottom: '20px', right: '20px',
        zIndex: 10000, display: 'flex', flexDirection: 'column-reverse', gap: '8px',
        maxWidth: '380px', pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.30)',  icon: 'var(--green)'  },
  error:   { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.30)',   icon: '#ef4444'       },
  info:    { bg: 'rgba(34,211,238,0.08)',  border: 'rgba(34,211,238,0.30)',  icon: 'var(--cyan)'   },
  warning: { bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.35)',  icon: 'var(--amber)'  },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [exiting, setExiting] = useState(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (toast.duration <= 0) return;
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => dismissRef.current(), 180);
    }, toast.duration);
    return () => clearTimeout(timer);
  }, [toast.duration]);

  const Icon = ICONS[toast.type];
  const c = COLORS[toast.type];

  return (
    <div
      role="status"
      style={{
        pointerEvents: 'auto',
        display: 'flex', gap: '10px', padding: '12px 14px',
        background: 'var(--frosted-heavy)',
        backdropFilter: 'blur(20px) saturate(140%)',
        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
        border: `1px solid ${c.border}`,
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.30), 0 2px 8px rgba(0,0,0,0.15)',
        opacity: exiting ? 0 : 1,
        transform: exiting ? 'translateX(20px)' : 'translateX(0)',
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        animation: exiting ? 'none' : 'fadeUp 0.22s cubic-bezier(0.16,1,0.3,1)',
        position: 'relative', overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute', inset: 0, background: c.bg, pointerEvents: 'none',
      }} />
      <Icon size={18} style={{ color: c.icon, flexShrink: 0, position: 'relative', marginTop: '1px' }} />
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <div style={{
          fontSize: '13px', fontWeight: 600, color: 'var(--t1)', lineHeight: 1.35,
        }}>
          {toast.title}
        </div>
        {toast.description && (
          <div style={{
            fontSize: '12px', color: 'var(--t2)', marginTop: '3px', lineHeight: 1.45,
          }}>
            {toast.description}
          </div>
        )}
        {toast.action && (
          <button
            onClick={() => { toast.action!.onClick(); onDismiss(); }}
            style={{
              marginTop: '8px', padding: '4px 10px',
              fontSize: '11px', fontWeight: 600,
              background: 'transparent', color: c.icon,
              border: `1px solid ${c.border}`, borderRadius: '6px', cursor: 'pointer',
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={() => { setExiting(true); setTimeout(onDismiss, 180); }}
        aria-label="Dismiss"
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--t3)', padding: 0, display: 'flex',
          alignItems: 'flex-start', position: 'relative',
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
