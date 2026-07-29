import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card } from '../../components/ui';
export function InvitationPage() {
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    token = params.get('token') ?? '';
  const [valid, setValid] = useState<boolean | null>(null),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(`/api/v1/invitations/inspect?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (r) => {
        setValid(r.ok);
        if (r.ok) {
          const j = (await r.json()) as { invitation: { organizationName: string } };
          setName(j.invitation.organizationName);
        }
      })
      .catch(() => setValid(false));
  }, [token]);
  if (valid === null)
    return (
      <main className="auth-page">
        <p role="status">Checking invitation…</p>
      </main>
    );
  return (
    <main className="auth-page">
      <Card className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold">QuranTrack invitation</h1>
        {!valid ? (
          <Alert tone="error" title="This invitation is invalid or no longer usable." />
        ) : (
          <>
            <p>You have been invited to join {name}.</p>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await fetch('/api/v1/invitations/accept', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ token }),
                });
                if (r.ok) {
                  localStorage.setItem('qurantrack-had-session', 'true');
                  navigate('/app?invitation=accepted', { replace: true });
                  window.location.reload();
                } else {
                  setValid(false);
                  setBusy(false);
                }
              }}
            >
              Accept invitation
            </Button>
          </>
        )}
      </Card>
    </main>
  );
}
