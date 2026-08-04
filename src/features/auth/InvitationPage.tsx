import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, FormField, Input, Spinner } from '../../components/ui';
import { PasswordInput, PasswordRules } from './PasswordPages';
import {
  passwordPolicyTranslationKey,
  validatePasswordPolicy,
} from '../../../shared/auth/password-policy';
type State =
  'loading' | 'pending' | 'expired' | 'revoked' | 'used' | 'invalid' | 'network' | 'success';
type Invitation = {
  organizationName: string;
  locale: 'en' | 'tr';
  role: string;
  state: Exclude<State, 'loading' | 'invalid' | 'network' | 'success'>;
  requiresDisplayName?: boolean;
  requiresPassword?: boolean;
};
export function InvitationPage() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    token = params.get('token') ?? '';
  const [state, setState] = useState<State>('loading'),
    [invitation, setInvitation] = useState<Invitation | null>(null),
    [busy, setBusy] = useState(false),
    [displayName, setDisplayName] = useState(''),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [formError, setFormError] = useState('');
  const inspectedToken = useRef('');
  const inspect = useCallback(async () => {
    setState('loading');
    try {
      const response = await fetch(
        `/api/v1/invitations/inspect?token=${encodeURIComponent(token)}`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        setState('invalid');
        return;
      }
      const json = (await response.json()) as { invitation: Invitation };
      setInvitation(json.invitation);
      await i18n.changeLanguage(json.invitation.locale);
      setState(json.invitation.state);
    } catch {
      setState('network');
    }
  }, [token, i18n]);
  useEffect(() => {
    if (inspectedToken.current === token) return;
    inspectedToken.current = token;
    const timer = window.setTimeout(() => void inspect(), 0);
    return () => window.clearTimeout(timer);
  }, [inspect, token]);
  const accept = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setFormError('');
    if (invitation?.requiresPassword && password !== confirmation) {
      setFormError(t('invitation.passwordMismatch'));
      return;
    }
    if (invitation?.requiresPassword) {
      const policy = validatePasswordPolicy(password);
      if (policy) {
        setFormError(t(passwordPolicyTranslationKey(policy)));
        return;
      }
    }
    setBusy(true);
    try {
      const response = await fetch('/api/v1/invitations/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          displayName: invitation?.requiresDisplayName ? displayName : undefined,
          password: invitation?.requiresPassword ? password : undefined,
          passwordConfirmation: invitation?.requiresPassword ? confirmation : undefined,
        }),
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as {
          error?: { code?: string };
        } | null;
        if (
          json?.error?.code === 'PASSWORD_TOO_SHORT' ||
          json?.error?.code === 'PASSWORD_TOO_LONG' ||
          json?.error?.code === 'PASSWORD_EQUALS_EMAIL' ||
          json?.error?.code === 'PASSWORD_CONFIRMATION'
        ) {
          setFormError(
            json.error.code === 'PASSWORD_CONFIRMATION'
              ? t('invitation.passwordMismatch')
              : t(passwordPolicyTranslationKey(json.error.code)),
          );
          return;
        }
        setState(
          json?.error?.code === 'INVITATION_USED'
            ? 'used'
            : json?.error?.code === 'INVITATION_EXPIRED'
              ? 'expired'
              : json?.error?.code === 'INVITATION_REVOKED'
                ? 'revoked'
                : 'invalid',
        );
        return;
      }
      setState('success');
      localStorage.setItem('qurantrack-had-session', 'true');
      window.setTimeout(() => {
        navigate('/app?invitation=accepted', { replace: true });
        window.location.reload();
      }, 300);
    } catch {
      setState('network');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page">
      <Card className="mx-auto max-w-lg space-y-4">
        <h1 className="text-2xl font-bold">{t('invitation.title')}</h1>
        {state === 'loading' ? (
          <Spinner label={t('invitation.loading')} />
        ) : state === 'pending' && invitation ? (
          <>
            <p>
              {t('invitation.description', {
                organization: invitation.organizationName,
                role: t(`roles.${invitation.role}`),
              })}
            </p>
            <form className="space-y-4" onSubmit={accept}>
              {invitation.requiresDisplayName && (
                <FormField
                  id="display-name"
                  label={t('invitation.displayName')}
                  required
                  requiredLabel={t('common.required')}
                >
                  <Input
                    id="display-name"
                    autoComplete="name"
                    required
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </FormField>
              )}
              {invitation.requiresPassword && (
                <>
                  <PasswordRules />
                  <PasswordInput
                    id="invitation-password"
                    label={t('security.new')}
                    value={password}
                    onChange={setPassword}
                  />
                  <PasswordInput
                    id="invitation-password-confirmation"
                    label={t('security.confirm')}
                    value={confirmation}
                    onChange={setConfirmation}
                  />
                </>
              )}
              {formError && (
                <p role="alert" className="text-sm text-error">
                  {formError}
                </p>
              )}
              <Button loading={busy} disabled={busy}>
                {t('invitation.accept')}
              </Button>
            </form>
          </>
        ) : state === 'success' ? (
          <Alert tone="success" title={t('invitation.success')} />
        ) : (
          <>
            <Alert tone="error" title={t(`invitation.${state}`)} />
            {state === 'network' && (
              <Button variant="secondary" onClick={() => void inspect()}>
                {t('invitation.retry')}
              </Button>
            )}
          </>
        )}
      </Card>
    </main>
  );
}
