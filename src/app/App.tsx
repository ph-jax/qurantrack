import { useEffect, useMemo, useState } from 'react';

type View = 'login' | 'requested' | 'invalid' | 'app';

export function App() {
  const [email, setEmail] = useState('');
  const [view, setView] = useState<View>('login');
  const [message, setMessage] = useState('');
  const orgSlug = useMemo(() => window.location.pathname.match(/^\/o\/([^/]+)\/login/)?.[1], []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!window.location.pathname.startsWith('/auth/consume') || !token) return;
    fetch('/api/v1/auth/magic-link/consume', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((response) => (response.ok ? setView('app') : setView('invalid')))
      .catch(() => setView('invalid'));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await fetch('/api/v1/auth/magic-link/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        organizationSlug: orgSlug,
        turnstileToken: 'local-dev-bypass-token',
      }),
    });
    setMessage('If this email is eligible, a QuranTrack sign-in link will be sent.');
    setView('requested');
  }
  async function logout() {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    setView('login');
  }
  if (view === 'app')
    return (
      <main className="min-h-screen bg-stone-50 p-5">
        <div className="mx-auto max-w-3xl rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-teal-700">QuranTrack staff</p>
          <h1 className="mt-2 text-3xl font-bold">Authenticated app shell</h1>
          <p className="mt-3 text-slate-600">
            Phase 2 provides secure sign-in, organization context, role checks, and logout.
            Administration features begin in Phase 3.
          </p>
          <button onClick={logout} className="mt-6 rounded-xl bg-slate-900 px-4 py-3 text-white">
            Log out
          </button>
        </div>
      </main>
    );
  return (
    <main className="min-h-screen bg-stone-50 text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">
        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-teal-700">Learn. Practice. Progress.</p>
          <h1 className="mt-3 text-3xl font-bold">Welcome to QuranTrack</h1>
          <p className="mt-2 text-slate-600">
            Staff sign-in for QuranTrack — Quran Learning & Progress Platform.
          </p>
          {view === 'invalid' && (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              This sign-in link is invalid or expired. Request a new link.
            </p>
          )}
          {view === 'requested' && (
            <p className="mt-4 rounded-xl bg-teal-50 p-3 text-sm text-teal-800">{message}</p>
          )}
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-left text-sm font-medium">
              Email address
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                required
                className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3"
              />
            </label>
            <div className="rounded-xl border border-dashed border-stone-300 p-3 text-sm text-slate-600">
              Cloudflare Turnstile widget loads here in production. Local bypass is disabled unless
              explicitly configured.
            </div>
            <button className="w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white">
              Send secure sign-in link
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
