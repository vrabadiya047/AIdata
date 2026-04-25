'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import ChatInterface from '@/components/ChatInterface';
import DocumentPanel from '@/components/DocumentPanel';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useSession } from '@/contexts/SessionContext';

export default function Home() {
  const { session } = useSession();
  const [activeProject, setActiveProject] = useState('');
  const [activeThread, setActiveThread] = useState('General');
  const [showDocs, setShowDocs] = useState(false);
  const [wsRefreshKey, setWsRefreshKey] = useState(0);

  return (
    <div
      className="grain-overlay"
      style={{
        display: 'flex',
        height: '100svh',
        width: '100%',
        background: 'var(--void)',
        overflow: 'hidden',
      }}
    >
      <ErrorBoundary name="Sidebar">
        <Sidebar
          activeProject={activeProject}
          activeThread={activeThread}
          wsRefreshKey={wsRefreshKey}
          onSelectProject={(p) => { setActiveProject(p); setActiveThread('General'); }}
          onSelectThread={setActiveThread}
          onOpenDocs={() => setShowDocs(true)}
        />
      </ErrorBoundary>

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
        <div style={{
          position: 'absolute', top: '-100px', right: '-100px',
          width: '400px', height: '400px',
          background: 'radial-gradient(circle, rgba(245,158,11,0.04) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />
        <div style={{
          position: 'absolute', bottom: '0', left: '30%',
          width: '500px', height: '300px',
          background: 'radial-gradient(ellipse, rgba(34,211,238,0.025) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        <ErrorBoundary name="Chat">
          <ChatInterface
            activeProject={activeProject}
            activeThread={activeThread}
            username={session?.username ?? ''}
            onNewThread={(t) => setActiveThread(t)}
            onRenameProject={(oldName, newName) => {
              setActiveProject(newName);
              setWsRefreshKey(k => k + 1);
            }}
            onRenameThread={(_oldId, newId) => {
              setActiveThread(newId);
            }}
          />
        </ErrorBoundary>
      </main>

      {showDocs && (
        <ErrorBoundary name="Documents" inline>
          <DocumentPanel
            activeProject={activeProject}
            onClose={() => setShowDocs(false)}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
