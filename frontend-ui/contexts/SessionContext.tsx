'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session } from '@/types/sovereign';

interface SessionContextValue {
  session: Session | null;
  loading: boolean;
  refresh: () => void;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  loading: true,
  refresh: () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setSession(data))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <SessionContext.Provider value={{ session, loading, refresh: load }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
