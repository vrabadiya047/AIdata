'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import ChatInterface from '@/components/ChatInterface';
import DocumentPanel from '@/components/DocumentPanel';
import KnowledgeGraph from '@/components/KnowledgeGraph';
import ErrorBoundary from '@/components/ErrorBoundary';
import TopBar from '@/components/TopBar';
import ShortcutsOverlay from '@/components/ShortcutsOverlay';
import ReindexModal from '@/components/ReindexModal';
import QueryLogPanel from '@/components/QueryLogPanel';
import ProfilePanel from '@/components/ProfilePanel';
import WorkspacePanel from '@/components/WorkspacePanel';
import { useSession } from '@/contexts/SessionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useRegisterCommands, CommandItem } from '@/contexts/CommandContext';
import { getWorkspaces, getProjectThreads } from '@/app/actions';
import {
  MessageSquare, Network, FileText, Plus, Sun, Moon, LogOut, Keyboard,
  Folder, Hash, Settings, ChevronRight,
} from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const { session, refresh } = useSession();
  const { theme, toggle: toggleTheme } = useTheme();
  const toast = useToast();

  const [activeProject, setActiveProject] = useState('');
  const [activeThread, setActiveThread] = useState('General');
  const [showDocs, setShowDocs] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showReindex, setShowReindex] = useState(false);
  const [showQueryLog, setShowQueryLog] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [wsRefreshKey, setWsRefreshKey] = useState(0);
  const [viewMode, setViewMode] = useState<'chat' | 'graph'>('chat');
  const [isMac, setIsMac] = useState(false);

  // Registry for the palette
  const [projects, setProjects] = useState<{ name: string; visibility: string }[]>([]);
  const [threads, setThreads] = useState<string[]>([]);

  useEffect(() => {
    setIsMac(typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac'));
  }, []);

  // Load workspaces for command palette
  useEffect(() => {
    if (!session?.username) return;
    getWorkspaces(session.username)
      .then((ws) => setProjects(ws.map((w) => ({ name: w.name, visibility: w.visibility }))))
      .catch(() => {});
  }, [session?.username, wsRefreshKey]);

  // Load threads for active project
  useEffect(() => {
    if (!session?.username || !activeProject) { setThreads([]); return; }
    getProjectThreads(activeProject, session.username)
      .then(setThreads)
      .catch(() => {});
  }, [session?.username, activeProject]);

  // ── Logout helper ──
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      toast.success('Signed out');
      refresh();
      router.push('/login');
    } catch {
      toast.error('Sign out failed');
    }
  }, [toast, refresh, router]);

  // ── Global keyboard shortcuts ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isInput =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
                   target.isContentEditable);

      const meta = e.metaKey || e.ctrlKey;

      // ? — open shortcuts overlay (only when not typing)
      if (e.key === '?' && !isInput && !meta) {
        e.preventDefault();
        setShowShortcuts(true);
        return;
      }

      if (!meta) return;

      switch (e.key.toLowerCase()) {
        case '1':
          e.preventDefault();
          setViewMode('chat');
          break;
        case '2':
          e.preventDefault();
          setViewMode('graph');
          break;
        case 'd':
          if (!e.shiftKey) {
            e.preventDefault();
            setShowDocs((v) => !v);
          }
          break;
        case 'b':
          e.preventDefault();
          setSidebarCollapsed((v) => !v);
          break;
        case '/':
          e.preventDefault();
          toggleTheme();
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleTheme]);

  // ── Register palette commands ──
  const projectCommands: CommandItem[] = projects.map((p) => ({
    id: `proj_${p.name}`,
    group: 'Projects',
    label: p.name,
    description: `Open project • ${p.visibility}`,
    icon: <Folder size={14} />,
    onSelect: () => {
      setActiveProject(p.name);
      setActiveThread('General');
      setViewMode('chat');
      toast.info(`Switched to ${p.name}`);
    },
  }));

  const threadCommands: CommandItem[] = threads.map((t) => ({
    id: `thread_${activeProject}_${t}`,
    group: 'Threads',
    label: t,
    description: `Open thread in ${activeProject}`,
    icon: <Hash size={14} />,
    onSelect: () => setActiveThread(t),
  }));

  const actionCommands: CommandItem[] = [
    {
      id: 'act_chat', group: 'Actions', label: 'Switch to Chat',
      icon: <MessageSquare size={14} />, shortcut: [isMac ? '⌘' : 'Ctrl', '1'],
      onSelect: () => setViewMode('chat'),
    },
    {
      id: 'act_graph', group: 'Actions', label: 'Switch to Knowledge Graph',
      icon: <Network size={14} />, shortcut: [isMac ? '⌘' : 'Ctrl', '2'],
      onSelect: () => setViewMode('graph'),
    },
    {
      id: 'act_docs', group: 'Actions', label: 'Toggle Documents panel',
      icon: <FileText size={14} />, shortcut: [isMac ? '⌘' : 'Ctrl', 'D'],
      onSelect: () => setShowDocs((v) => !v),
    },
    {
      id: 'act_sidebar', group: 'Actions', label: 'Toggle Sidebar',
      shortcut: [isMac ? '⌘' : 'Ctrl', 'B'],
      onSelect: () => setSidebarCollapsed((v) => !v),
    },
    {
      id: 'act_theme', group: 'Actions',
      label: theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme',
      icon: theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />,
      shortcut: [isMac ? '⌘' : 'Ctrl', '/'],
      onSelect: toggleTheme,
    },
    {
      id: 'act_shortcuts', group: 'Actions', label: 'Show keyboard shortcuts',
      icon: <Keyboard size={14} />, shortcut: ['?'],
      onSelect: () => setShowShortcuts(true),
    },
    {
      id: 'act_admin', group: 'Actions', label: 'Open Admin / Settings',
      icon: <Settings size={14} />,
      onSelect: () => router.push('/admin'),
    },
    {
      id: 'act_logout', group: 'Actions', label: 'Sign out',
      icon: <LogOut size={14} />,
      onSelect: logout,
    },
    {
      id: 'act_new_thread', group: 'Actions', label: 'New thread in current project',
      icon: <Plus size={14} />, shortcut: [isMac ? '⌘' : 'Ctrl', 'N'],
      onSelect: () => {
        if (!activeProject) {
          toast.warning('No project selected', 'Pick a project first');
          return;
        }
        setActiveThread(`thread-${Date.now()}`);
        toast.success('New thread started');
      },
    },
  ];

  useRegisterCommands(
    [...projectCommands, ...threadCommands, ...actionCommands],
    [projects, threads, activeProject, theme, isMac, logout, toggleTheme, router, toast]
  );

  return (
    <div
      style={{
        display: 'flex',
        height: '100svh',
        width: '100%',
        background: 'var(--void)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {sidebarCollapsed ? (
        <button
          onClick={() => setSidebarCollapsed(false)}
          title="Expand sidebar"
          style={{
            position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
            zIndex: 40, width: '18px', height: '48px',
            borderRadius: '0 8px 8px 0',
            background: 'var(--surface)', border: '1px solid var(--b1)', borderLeft: 'none',
            cursor: 'pointer', color: 'var(--t3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'var(--amber)';
            e.currentTarget.style.borderColor = 'rgba(245,158,11,0.4)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--t3)';
            e.currentTarget.style.borderColor = 'var(--b1)';
          }}
        >
          <ChevronRight size={11} />
        </button>
      ) : (
        <ErrorBoundary name="Sidebar">
          <Sidebar
            activeProject={activeProject}
            activeThread={activeThread}
            wsRefreshKey={wsRefreshKey}
            onSelectProject={(p) => { setActiveProject(p); setActiveThread('General'); setViewMode('chat'); }}
            onSelectThread={(t) => { setActiveThread(t); setViewMode('chat'); }}
            onOpenDocs={() => setShowDocs(true)}
            onCollapse={() => setSidebarCollapsed(true)}
          />
        </ErrorBoundary>
      )}

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--deep)',
        }}
      >
        <TopBar
          activeProject={activeProject}
          activeThread={activeThread}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onOpenDocs={() => setShowDocs(true)}
          onOpenShortcuts={() => setShowShortcuts(true)}
          onReindex={() => setShowReindex(true)}
          onOpenProfile={() => setShowSecurity(true)}
          onOpenWorkspace={() => setShowWorkspace(true)}
        />

        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {viewMode === 'chat' ? (
            <ErrorBoundary name="Chat">
              <ChatInterface
                activeProject={activeProject}
                activeThread={activeThread}
                username={session?.username ?? ''}
                onNewThread={(t) => setActiveThread(t)}
                onRenameProject={(_oldName, newName) => {
                  setActiveProject(newName);
                  setWsRefreshKey((k) => k + 1);
                }}
                onRenameThread={(_oldId, newId) => {
                  setActiveThread(newId);
                }}
                onOpenDocs={() => setShowDocs(true)}
                onOpenQueryLog={() => setShowQueryLog(true)}
                onOpenSecurity={() => setShowSecurity(true)}
              />
            </ErrorBoundary>
          ) : (
            <ErrorBoundary name="KnowledgeGraph">
              <KnowledgeGraph project={activeProject} />
            </ErrorBoundary>
          )}
        </div>
      </main>

      {showDocs && (
        <ErrorBoundary name="Documents" inline>
          <DocumentPanel
            activeProject={activeProject}
            onClose={() => setShowDocs(false)}
          />
        </ErrorBoundary>
      )}

      <ShortcutsOverlay
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
        isMac={isMac}
      />

      {showReindex && <ReindexModal onClose={() => setShowReindex(false)} isAdmin={session?.role === 'Admin'} />}
      {showQueryLog && <QueryLogPanel onClose={() => setShowQueryLog(false)} />}
      {showSecurity && <ProfilePanel onClose={() => setShowSecurity(false)} />}
      {showWorkspace && (
        <WorkspacePanel
          onClose={() => setShowWorkspace(false)}
          onRestored={(project, thread) => {
            setActiveProject(project);
            setActiveThread(thread);
            setViewMode('chat');
            setShowWorkspace(false);
          }}
        />
      )}
    </div>
  );
}
