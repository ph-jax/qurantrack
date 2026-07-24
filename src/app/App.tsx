import { useEffect, useMemo, useRef, useState } from 'react';

type View = 'login' | 'requested' | 'invalid' | 'app';
type TurnstileStatus = 'missing-key' | 'loading' | 'ready' | 'verified' | 'failed';

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'error-callback': () => void;
      'expired-callback': () => void;
    },
  ) => string;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const isProduction = import.meta.env.PROD;

export function App() {
  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileStatus, setTurnstileStatus] = useState<TurnstileStatus>(
    turnstileSiteKey ? 'loading' : 'missing-key',
  );
  const [view, setView] = useState<View>('login');
  const [message, setMessage] = useState('');
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const renderedTurnstileRef = useRef(false);
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

  useEffect(() => {
    if (!turnstileSiteKey || renderedTurnstileRef.current) return;
    const renderWidget = () => {
      if (!turnstileRef.current || !window.turnstile || renderedTurnstileRef.current) return;
      renderedTurnstileRef.current = true;
      window.turnstile.render(turnstileRef.current, {
        sitekey: turnstileSiteKey,
        callback: (token) => {
          setTurnstileToken(token);
          setTurnstileStatus('verified');
        },
        'error-callback': () => {
          setTurnstileToken('');
          setTurnstileStatus('failed');
        },
        'expired-callback': () => {
          setTurnstileToken('');
          setTurnstileStatus('ready');
        },
      });
      setTurnstileStatus('ready');
    };
    if (window.turnstile) {
      renderWidget();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = renderWidget;
    script.onerror = () => setTurnstileStatus('failed');
    document.head.append(script);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!turnstileToken) {
      setTurnstileStatus(turnstileSiteKey ? 'failed' : 'missing-key');
      return;
    }
    if (isProduction && turnstileToken === 'local-dev-bypass-token') {
      setTurnstileStatus('failed');
      return;
    }
    await fetch('/api/v1/auth/magic-link/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, organizationSlug: orgSlug, turnstileToken }),
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
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
              <div ref={turnstileRef} />
              {turnstileStatus === 'missing-key' && (
                <p className="text-sm text-amber-700">
                  Turnstile is not configured. Set VITE_TURNSTILE_SITE_KEY for staff sign-in.
                </p>
              )}
              {turnstileStatus === 'loading' && (
                <p className="text-sm text-slate-600">Loading anti-abuse check…</p>
              )}
              {turnstileStatus === 'failed' && (
                <p className="text-sm text-red-700">
                  Turnstile could not verify this request. Refresh and try again.
                </p>
              )}
            </div>
            <button
              disabled={!turnstileToken}
              className="w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Send secure sign-in link
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
