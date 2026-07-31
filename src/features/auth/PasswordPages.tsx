import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, FormField, Input, Spinner } from '../../components/ui';

export function PasswordInput({
  id,
  label,
  value,
  onChange,
  autocomplete = 'new-password',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autocomplete?: string;
}) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <FormField id={id} label={label} required requiredLabel={t('common.required')}>
      <div className="flex gap-2">
        <Input
          id={id}
          type={shown ? 'text' : 'password'}
          autoComplete={autocomplete}
          value={value}
          required
          onChange={(e) => onChange(e.target.value)}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => setShown(!shown)}
          aria-label={shown ? t('security.hide') : t('security.show')}
        >
          {shown ? t('security.hide') : t('security.show')}
        </Button>
      </div>
    </FormField>
  );
}
export function SecurityPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true),
    [hasPassword, setHasPassword] = useState(false),
    [current, setCurrent] = useState(''),
    [next, setNext] = useState(''),
    [confirm, setConfirm] = useState(''),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<'ok' | 'error' | null>(null),
    [confirmationError, setConfirmationError] = useState(false);
  useEffect(() => {
    void fetch('/api/v1/me/authentication-methods', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: unknown) => setHasPassword(Boolean((j as { hasPassword?: boolean }).hasPassword)))
      .finally(() => setLoading(false));
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    setConfirmationError(false);
    if (next !== confirm) {
      setConfirmationError(true);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/v1/me/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword: hasPassword ? current : undefined,
          newPassword: next,
        }),
      });
      if (!r.ok) throw new Error();
      setHasPassword(true);
      setCurrent('');
      setNext('');
      setConfirm('');
      setResult('ok');
    } catch {
      setResult('error');
    } finally {
      setBusy(false);
    }
  };
  if (loading) return <Spinner label={t('common.loading')} />;
  return (
    <Card className="max-w-xl">
      <h2 className="text-2xl font-bold">{t('security.title')}</h2>
      <p className="mt-2 text-text-secondary">{t('security.policy')}</p>
      {result && (
        <div className="mt-4" aria-live="polite">
          <Alert tone={result === 'ok' ? 'success' : 'error'} title={t(`security.${result}`)} />
        </div>
      )}
      <form className="mt-6 space-y-4" onSubmit={submit}>
        {hasPassword && (
          <PasswordInput
            id="current-password"
            label={t('security.current')}
            value={current}
            onChange={setCurrent}
            autocomplete="current-password"
          />
        )}
        <PasswordInput
          id="new-password"
          label={t('security.new')}
          value={next}
          onChange={setNext}
        />
        <PasswordInput
          id="confirm-password"
          label={t('security.confirm')}
          value={confirm}
          onChange={setConfirm}
        />
        {confirmationError && (
          <p role="alert" className="text-sm text-error">
            {t('security.passwordMismatch')}
          </p>
        )}
        <Button loading={busy} disabled={busy}>
          {hasPassword ? t('security.change') : t('security.create')}
        </Button>
      </form>
    </Card>
  );
}
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState(''),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false),
    [turnstileToken, setTurnstileToken] = useState(''),
    [serviceError, setServiceError] = useState(false);
  const widget = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sitekey = (
      import.meta as ImportMeta & { env: { readonly VITE_TURNSTILE_SITE_KEY?: string } }
    ).env.VITE_TURNSTILE_SITE_KEY;
    if (!sitekey) return;
    const render = () => {
      if (widget.current && window.turnstile)
        window.turnstile.render(widget.current, {
          sitekey,
          callback: setTurnstileToken,
          'error-callback': () => setTurnstileToken(''),
          'expired-callback': () => setTurnstileToken(''),
        });
    };
    if (window.turnstile) render();
    else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setServiceError(false);
    try {
      const response = await fetch('/api/v1/auth/password/reset/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, turnstileToken }),
      });
      if (!response.ok) throw new Error();
      setDone(true);
    } catch {
      setServiceError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page">
      <Card className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold">{t('security.forgotTitle')}</h1>
        {serviceError && <Alert tone="error" title={t('auth.service')} />}
        {done ? (
          <Alert tone="success" title={t('security.resetGeneric')} />
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <FormField
              id="reset-email"
              label={t('auth.email')}
              required
              requiredLabel={t('common.required')}
            >
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormField>
            <div ref={widget} />
            <p className="text-sm text-text-secondary">{t('security.turnstileRequired')}</p>
            <Button loading={busy} disabled={!turnstileToken}>
              {t('security.sendReset')}
            </Button>
          </form>
        )}
        <Link className="mt-5 inline-block text-brand" to="/login">
          {t('security.back')}
        </Link>
      </Card>
    </main>
  );
}
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [next, setNext] = useState(''),
    [confirm, setConfirm] = useState(''),
    [state, setState] = useState<'form' | 'success' | 'invalid'>('form'),
    [busy, setBusy] = useState(false),
    [confirmationError, setConfirmationError] = useState(false),
    [serviceError, setServiceError] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfirmationError(false);
    setServiceError(false);
    if (next !== confirm) {
      setConfirmationError(true);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/v1/auth/password/reset/consume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: params.get('token'), newPassword: next }),
      });
      setState(r.ok ? 'success' : 'invalid');
    } catch {
      setServiceError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page">
      <Card className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold">{t('security.resetTitle')}</h1>
        {state === 'success' ? (
          <>
            <Alert tone="success" title={t('security.resetSuccess')} />
            <Link to="/login">{t('security.signInAgain')}</Link>
          </>
        ) : state === 'invalid' ? (
          <Alert tone="error" title={t('security.resetInvalid')} />
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submit}>
            {serviceError && <Alert tone="error" title={t('auth.service')} />}
            <PasswordInput
              id="reset-password"
              label={t('security.new')}
              value={next}
              onChange={setNext}
            />
            <PasswordInput
              id="reset-confirm"
              label={t('security.confirm')}
              value={confirm}
              onChange={setConfirm}
            />
            {confirmationError && (
              <p role="alert" className="text-sm text-error">
                {t('security.passwordMismatch')}
              </p>
            )}
            <Button loading={busy}>{t('security.reset')}</Button>
          </form>
        )}
      </Card>
    </main>
  );
}
