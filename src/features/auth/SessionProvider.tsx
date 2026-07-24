import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Role = 'system_admin' | 'organization_admin' | 'teacher' | 'read_only';
export type Organization = { id: string; name: string; slug: string; role: Role };
export type Session = {
  user: { id: string; email: string };
  activeOrganizationId: string;
  role: Role;
  organizations: Organization[];
};
type Status = 'checking' | 'authenticated' | 'unauthenticated' | 'expired' | 'error';
type SessionContextValue = {
  status: Status;
  session: Session | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  switchOrganization: (id: string) => Promise<void>;
};
const SessionContext = createContext<SessionContextValue | null>(null);
const HINT = 'qurantrack-had-session';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('checking');
  const [session, setSession] = useState<Session | null>(null);
  const refresh = useCallback(async () => {
    setStatus('checking');
    try {
      const response = await fetch('/api/v1/me', { cache: 'no-store' });
      if (response.status === 401) {
        setSession(null);
        setStatus(localStorage.getItem(HINT) ? 'expired' : 'unauthenticated');
        localStorage.removeItem(HINT);
        return;
      }
      if (!response.ok) throw new Error('session service');
      const me = (await response.json()) as Omit<Session, 'organizations'>;
      const orgResponse = await fetch('/api/v1/auth/organizations', { cache: 'no-store' });
      if (!orgResponse.ok) throw new Error('organization service');
      const orgs = (await orgResponse.json()) as { organizations: Organization[] };
      setSession({ ...me, organizations: orgs.organizations });
      setStatus('authenticated');
      localStorage.setItem(HINT, 'true');
    } catch {
      setSession(null);
      setStatus('error');
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  const logout = async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST', cache: 'no-store' });
    localStorage.removeItem(HINT);
    setSession(null);
    setStatus('unauthenticated');
  };
  const switchOrganization = async (id: string) => {
    const response = await fetch('/api/v1/auth/organizations/switch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: id }),
      cache: 'no-store',
    });
    if (response.ok) await refresh();
  };
  return (
    <SessionContext.Provider value={{ status, session, refresh, logout, switchOrganization }}>
      {children}
    </SessionContext.Provider>
  );
}
// eslint-disable-next-line react-refresh/only-export-components
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider missing');
  return value;
}
