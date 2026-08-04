import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, FormField, Input, Spinner } from '../../components/ui';
import {
  passwordPolicyTranslationKey,
  validatePasswordPolicy,
  type PasswordPolicyError,
} from '../../../shared/auth/password-policy';

export function PasswordRules() {
  const { t } = useTranslation();
  return (
    <div className="text-sm text-text-secondary">
      <p>{t('security.policyIntro')}</p>
      <ul className="ml-5 list-disc">
        <li>{t('security.policyLength')}</li>
        <li>{t('security.policyEmail')}</li>
        <li>{t('security.policyComplexity')}</li>
      </ul>
    </div>
  );
}

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
    [policyError, setPolicyError] = useState<PasswordPolicyError | null>(null),
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
    setPolicyError(null);
    setConfirmationError(false);
    if (next !== confirm) {
      setConfirmationError(true);
      return;
    }
    const localPolicy = validatePasswordPolicy(next);
    if (localPolicy) {
      setPolicyError(localPolicy);
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
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { error?: { code?: string } } | null;
        const code = body?.error?.code;
        if (
          code === 'PASSWORD_TOO_SHORT' ||
          code === 'PASSWORD_TOO_LONG' ||
          code === 'PASSWORD_EQUALS_EMAIL'
        ) {
          setPolicyError(code);
          return;
        }
        throw new Error();
      }
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
      <div className="mt-2">
        <PasswordRules />
      </div>
      {result && (
        <div className="mt-4" aria-live="polite">
          <Alert tone={result === 'ok' ? 'success' : 'error'} title={t(`security.${result}`)} />
        </div>
      )}
      {policyError && <Alert tone="error" title={t(passwordPolicyTranslationKey(policyError))} />}
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
type TurnstileStatus = 'missing-key' | 'loading' | 'ready' | 'verified' | 'failed';

const configuredTurnstileSiteKey = (
  import.meta as ImportMeta & { env: { readonly VITE_TURNSTILE_SITE_KEY?: string } }
).env.VITE_TURNSTILE_SITE_KEY;

export function ForgotPasswordPage({
  turnstileSiteKey = configuredTurnstileSiteKey,
}: {
  turnstileSiteKey?: string;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState(''),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false),
    [turnstileToken, setTurnstileToken] = useState(''),
    [serviceError, setServiceError] = useState(false),
    [turnstileStatus, setTurnstileStatus] = useState<TurnstileStatus>(
      turnstileSiteKey ? 'loading' : 'missing-key',
    );
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const rendered = useRef(false);
  useEffect(() => {
    if (!turnstileSiteKey || rendered.current) return;
    const render = () => {
      if (!widget.current || !window.turnstile || rendered.current) return;
      rendered.current = true;
      widgetId.current = window.turnstile.render(widget.current, {
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
    if (window.turnstile) render();
    else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = render;
      script.onerror = () => setTurnstileStatus('failed');
      document.head.appendChild(script);
    }
  }, [turnstileSiteKey]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setServiceError(false);
    let accepted = false;
    try {
      const response = await fetch('/api/v1/auth/password/reset/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, turnstileToken }),
      });
      if (!response.ok) throw new Error();
      accepted = true;
      setDone(true);
    } catch {
      setServiceError(true);
    } finally {
      if (!accepted) {
        setTurnstileToken('');
        setTurnstileStatus('ready');
        window.turnstile?.reset(widgetId.current);
      }
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
            <Card className="bg-muted p-3 shadow-none">
              <div ref={widget} />
              {turnstileStatus === 'loading' && (
                <p className="text-sm text-text-secondary">{t('auth.turnstileLoading')}</p>
              )}
              {turnstileStatus === 'missing-key' && (
                <p role="alert" className="text-sm text-warning-strong">
                  {t('auth.turnstileMissing')}
                </p>
              )}
              {turnstileStatus === 'failed' && (
                <p role="alert" className="text-sm text-error">
                  {t('auth.turnstileFailed')}
                </p>
              )}
              {turnstileStatus === 'ready' && (
                <p className="text-sm text-text-secondary">{t('security.turnstileRequired')}</p>
              )}
            </Card>
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
    [serviceError, setServiceError] = useState(false),
    [policyError, setPolicyError] = useState<PasswordPolicyError | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfirmationError(false);
    setServiceError(false);
    setPolicyError(null);
    if (next !== confirm) {
      setConfirmationError(true);
      return;
    }
    const localPolicy = validatePasswordPolicy(next);
    if (localPolicy) {
      setPolicyError(localPolicy);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/v1/auth/password/reset/consume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: params.get('token'), newPassword: next }),
      });
      if (r.ok) {
        setState('success');
      } else {
        const body = (await r.json().catch(() => null)) as { error?: { code?: string } } | null;
        const code = body?.error?.code;
        if (code === 'INVALID' || code === 'INVALID_RESET') setState('invalid');
        else if (
          code === 'PASSWORD_TOO_SHORT' ||
          code === 'PASSWORD_TOO_LONG' ||
          code === 'PASSWORD_EQUALS_EMAIL'
        )
          setPolicyError(code);
        else setServiceError(true);
      }
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
            {policyError && (
              <Alert tone="error" title={t(passwordPolicyTranslationKey(policyError))} />
            )}
            <PasswordRules />
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
