import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, FormField, Input, Select, Spinner } from '../../components/ui';
import { useSession } from './SessionProvider';
import { PasswordInput } from './PasswordPages';
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
  reset: (widgetId?: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}
const siteKey = (import.meta as ImportMeta & { env: { readonly VITE_TURNSTILE_SITE_KEY?: string } })
  .env.VITE_TURNSTILE_SITE_KEY;

export function LoginPage({
  preview = false,
  turnstileSiteKey = siteKey,
}: {
  preview?: boolean;
  turnstileSiteKey?: string;
}) {
  const { t, i18n } = useTranslation();
  const { status, refresh } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [method, setMethod] = useState<'password' | 'magic-link'>('password');
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requested, setRequested] = useState(false);
  const [serviceError, setServiceError] = useState(false);
  const [credentialError, setCredentialError] = useState(false);
  const [turnstile, setTurnstile] = useState<TurnstileStatus>(
    preview ? 'verified' : turnstileSiteKey ? 'loading' : 'missing-key',
  );
  const widget = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);
  const widgetId = useRef<string | undefined>(undefined);
  const slug = useMemo(
    () => location.pathname.match(/^\/o\/([^/]+)\/login/)?.[1],
    [location.pathname],
  );
  useEffect(() => {
    if (preview || !turnstileSiteKey || rendered.current) return;
    const render = () => {
      if (!widget.current || !window.turnstile || rendered.current) return;
      rendered.current = true;
      widgetId.current = window.turnstile.render(widget.current, {
        sitekey: turnstileSiteKey,
        callback: (v) => {
          setToken(v);
          setTurnstile('verified');
        },
        'error-callback': () => {
          setToken('');
          setTurnstile('failed');
        },
        'expired-callback': () => {
          setToken('');
          setTurnstile('ready');
        },
      });
      setTurnstile('ready');
    };
    if (window.turnstile) {
      render();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = render;
    script.onerror = () => setTurnstile('failed');
    document.head.appendChild(script);
  }, [preview, turnstileSiteKey, status]);
  if (status === 'authenticated' && !preview) return <Navigate to="/app" replace />;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preview) {
      setRequested(true);
      return;
    }
    if (!token) return setTurnstile(turnstileSiteKey ? 'failed' : 'missing-key');
    setSubmitting(true);
    setServiceError(false);
    setCredentialError(false);
    try {
      const response = await fetch(
        method === 'password' ? '/api/v1/auth/password/login' : '/api/v1/auth/magic-link/request',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password, organizationSlug: slug, turnstileToken: token }),
          cache: 'no-store',
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { code?: string };
        } | null;
        if (body?.error?.code === 'INVALID_CREDENTIALS') setCredentialError(true);
        else setServiceError(true);
        return;
      }
      if (method === 'magic-link') setRequested(true);
      else {
        await refresh();
        navigate('/app', { replace: true });
      }
    } catch {
      setServiceError(true);
    } finally {
      if (method === 'password') {
        setToken('');
        setTurnstile('ready');
        window.turnstile?.reset(widgetId.current);
      }
      setSubmitting(false);
    }
  };
  const invalid = location.pathname === '/auth/invalid';
  const expired = Boolean((location.state as { expired?: boolean } | null)?.expired);
  const noMembership = Boolean((location.state as { noMembership?: boolean } | null)?.noMembership);
  if (!preview && status === 'checking')
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <Spinner label={t('auth.loading')} />
      </main>
    );
  if (!preview && status === 'error')
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="max-w-md">
          <Alert tone="error" title={t('auth.service')} />
          <Button className="mt-4" onClick={() => void refresh()}>
            {t('auth.retry')}
          </Button>
        </div>
      </main>
    );
  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="login-title">
        <div className="wordmark">
          <span className="monogram" aria-hidden>
            QT
          </span>
          QuranTrack
        </div>
        <p className="mt-8 text-sm font-semibold text-brand">{t('brand.tagline')}</p>
        <h1 id="login-title" className="mt-2 text-3xl font-bold tracking-tight">
          {t('auth.welcome')}
        </h1>
        <p className="mt-2 text-text-secondary">{t('auth.intro')}</p>
        <div className="absolute end-5 top-5">
          <Select
            label={t('common.language')}
            value={i18n.language}
            onValueChange={(v) => void i18n.changeLanguage(v)}
            items={[
              { value: 'en', label: t('common.english') },
              { value: 'tr', label: t('common.turkish') },
            ]}
          />
        </div>
        <div className="mt-5 space-y-3">
          {expired && <Alert tone="warning" title={t('auth.expired')} />}{' '}
          {noMembership && <Alert tone="warning" title={t('auth.noMembership')} />}{' '}
          {invalid && <Alert tone="error" title={t('auth.invalid')} />}{' '}
          {requested && <Alert tone="success" title={t('auth.generic')} />}{' '}
          {serviceError && <Alert tone="error" title={t('auth.service')} />}
          {credentialError && <Alert tone="error" title={t('auth.invalidCredentials')} />}
        </div>
        <form className="mt-6 space-y-5" onSubmit={submit}>
          <FormField
            id="email"
            label={t('auth.email')}
            description={t('auth.emailHelp')}
            required
            requiredLabel={t('common.required')}
          >
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby="email-description"
            />
          </FormField>
          {method === 'password' && (
            <PasswordInput
              id="password"
              label={t('auth.password')}
              value={password}
              onChange={setPassword}
              autocomplete="current-password"
            />
          )}
          <Card className="bg-muted p-3 shadow-none">
            <div ref={widget} />
            {turnstile === 'loading' && (
              <p className="text-sm text-text-secondary">{t('auth.turnstileLoading')}</p>
            )}
            {turnstile === 'missing-key' && (
              <p className="text-sm text-warning-strong">{t('auth.turnstileMissing')}</p>
            )}
            {turnstile === 'failed' && (
              <p role="alert" className="text-sm text-error">
                {t('auth.turnstileFailed')}
              </p>
            )}
            {preview && <p className="text-xs text-text-muted">{t('auth.turnstilePreview')}</p>}
          </Card>
          <Button className="w-full" loading={submitting} disabled={!preview && !token}>
            {method === 'password' ? t('auth.signIn') : t('auth.send')}
          </Button>
        </form>
        <div className="mt-4 flex flex-wrap justify-between gap-3 text-sm">
          <button
            className="text-brand underline-offset-4 hover:underline"
            type="button"
            onClick={() => setMethod(method === 'password' ? 'magic-link' : 'password')}
          >
            {method === 'password' ? t('auth.useMagicLink') : t('auth.usePassword')}
          </button>
          {method === 'password' && (
            <button
              className="text-brand underline-offset-4 hover:underline"
              type="button"
              onClick={() => navigate('/auth/forgot-password')}
            >
              {t('auth.forgot')}
            </button>
          )}
        </div>
        {preview && (
          <button
            className="mt-6 text-sm text-brand underline-offset-4 hover:underline"
            onClick={() => navigate('/ui-preview')}
          >
            {t('showcase.title')}
          </button>
        )}
      </section>
      <aside className="auth-aside">
        <p className="max-w-md text-3xl font-semibold leading-tight">{t('auth.asideTitle')}</p>
        <p className="mt-4 max-w-md text-teal-100">{t('auth.asideBody')}</p>
      </aside>
    </main>
  );
}
