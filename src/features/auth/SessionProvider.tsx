import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type Role = 'system_admin' | 'organization_admin' | 'teacher' | 'read_only';
export type Organization = { id: string; name: string; slug: string; role: Role };
export type Session = {
  user: { id: string; email: string };
  activeOrganizationId: string;
  role: Role;
  organizations: Organization[];
};
type Status =
  'checking' | 'authenticated' | 'unauthenticated' | 'expired' | 'no_membership' | 'error';
type SessionContextValue = {
  status: Status;
  session: Session | null;
  organizationSwitching: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  switchOrganization: (id: string) => Promise<void>;
};
const SessionContext = createContext<SessionContextValue | null>(null);
const HINT = 'qurantrack-had-session';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('checking');
  const [session, setSession] = useState<Session | null>(null);
  const [organizationSwitching, setOrganizationSwitching] = useState(false);
  const refreshGeneration = useRef(0);
  const organizationSwitchingRef = useRef(false);
  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    setStatus('checking');
    try {
      let response = await fetch('/api/v1/me', { cache: 'no-store' });
      if (generation !== refreshGeneration.current) return;
      if (response.status === 401) {
        const recovery = await fetch('/api/v1/me/organizations', { cache: 'no-store' });
        if (generation !== refreshGeneration.current) return;
        if (recovery.ok) {
          const available = (await recovery.json()) as { organizations: Organization[] };
          const destination = available.organizations[0];
          if (destination) {
            const switched = await fetch('/api/v1/me/organizations/switch', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ organizationId: destination.id }),
              cache: 'no-store',
            });
            if (!switched.ok) throw new Error('organization recovery failed');
            response = await fetch('/api/v1/me', { cache: 'no-store' });
            if (generation !== refreshGeneration.current) return;
          }
        }
        if (!response.ok) {
          const recoveryBody = (await recovery.json().catch(() => null)) as {
            error?: { code?: string };
          } | null;
          setSession(null);
          setStatus(
            recoveryBody?.error?.code === 'NO_ACTIVE_MEMBERSHIP'
              ? 'no_membership'
              : localStorage.getItem(HINT)
                ? 'expired'
                : 'unauthenticated',
          );
          localStorage.removeItem(HINT);
          return;
        }
      }
      if (!response.ok) throw new Error('session service');
      const me = (await response.json()) as Omit<Session, 'organizations'>;
      const orgResponse = await fetch('/api/v1/me/organizations', { cache: 'no-store' });
      if (generation !== refreshGeneration.current) return;
      if (orgResponse.status === 401) {
        setSession(null);
        setStatus('expired');
        localStorage.removeItem(HINT);
        return;
      }
      if (!orgResponse.ok) throw new Error('organization service');
      const orgs = (await orgResponse.json()) as { organizations: Organization[] };
      setSession({ ...me, organizations: orgs.organizations });
      setStatus('authenticated');
      localStorage.setItem(HINT, 'true');
    } catch {
      if (generation !== refreshGeneration.current) return;
      setSession(null);
      setStatus('error');
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  const logout = async () => {
    refreshGeneration.current += 1;
    const response = await fetch('/api/v1/auth/logout', { method: 'POST', cache: 'no-store' });
    if (!response.ok && response.status !== 401) throw new Error('logout failed');
    localStorage.removeItem(HINT);
    setSession(null);
    setStatus('unauthenticated');
  };
  const switchOrganization = async (id: string) => {
    if (organizationSwitchingRef.current) return;
    organizationSwitchingRef.current = true;
    refreshGeneration.current += 1;
    setOrganizationSwitching(true);
    setSession(null);
    setStatus('checking');
    try {
      const response = await fetch('/api/v1/me/organizations/switch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationId: id }),
        cache: 'no-store',
      });
      if (response.status === 401) {
        setSession(null);
        setStatus('expired');
        localStorage.removeItem(HINT);
        return;
      }
      if (!response.ok) throw new Error('organization switch failed');
      await refresh();
    } catch (error) {
      await refresh();
      throw error;
    } finally {
      organizationSwitchingRef.current = false;
      setOrganizationSwitching(false);
    }
  };
  return (
    <SessionContext.Provider
      value={{ status, session, organizationSwitching, refresh, logout, switchOrganization }}
    >
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
