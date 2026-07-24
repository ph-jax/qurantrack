import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Spinner } from '../../components/ui';
import { useSession } from './SessionProvider';
export function ConsumePage() {
  const token = new URLSearchParams(location.search).get('token');
  const [state, setState] = useState<'loading' | 'done' | 'invalid'>(token ? 'loading' : 'invalid');
  const { refresh } = useSession();
  useEffect(() => {
    if (!token) return;
    void fetch('/api/v1/auth/magic-link/consume', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        await refresh();
        setState('done');
      })
      .catch(() => setState('invalid'));
  }, [refresh, token]);
  if (state === 'done') return <Navigate to="/app" replace />;
  if (state === 'invalid') return <Navigate to="/auth/invalid" replace />;
  return (
    <main className="grid min-h-screen place-items-center">
      <Spinner label="Validating secure link…" />
    </main>
  );
}
