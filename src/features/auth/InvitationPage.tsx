import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Spinner } from '../../components/ui';
type State =
  'loading' | 'pending' | 'expired' | 'revoked' | 'used' | 'invalid' | 'network' | 'success';
type Invitation = {
  organizationName: string;
  locale: 'en' | 'tr';
  role: string;
  state: Exclude<State, 'loading' | 'invalid' | 'network' | 'success'>;
};
export function InvitationPage() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    token = params.get('token') ?? '';
  const [state, setState] = useState<State>('loading'),
    [invitation, setInvitation] = useState<Invitation | null>(null),
    [busy, setBusy] = useState(false);
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
  const accept = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/v1/invitations/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as {
          error?: { code?: string };
        } | null;
        setState(json?.error?.code === 'INVITATION_USED' ? 'used' : 'invalid');
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
            <Button loading={busy} disabled={busy} onClick={() => void accept()}>
              {t('invitation.accept')}
            </Button>
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
