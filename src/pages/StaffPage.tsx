import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Badge, Button, Card } from '../components/ui';

type Role = 'system_admin' | 'organization_admin' | 'teacher' | 'read_only';
type Member = { id: string; displayName: string; email: string; role: Role; active: number };
type Invitation = {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  deliveryStatus: string;
};
const roles: Role[] = ['organization_admin', 'teacher', 'read_only'];
export function StaffPage() {
  const { t } = useTranslation();
  const [members, setMembers] = useState<Member[]>([]),
    [invitations, setInvitations] = useState<Invitation[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(''),
    [search, setSearch] = useState(''),
    [email, setEmail] = useState(''),
    [role, setRole] = useState<Role>('teacher');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/v1/organization/staff', { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const j = (await r.json()) as { members: Member[]; invitations: Invitation[] };
      setMembers(j.members);
      setInvitations(j.invitations);
    } catch {
      setError(t('staff.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const mutate = async (key: string, url: string, method = 'POST', body?: unknown) => {
    if (busy) return;
    setBusy(key);
    setError('');
    try {
      const r = await fetch(url, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message || t('staff.actionError'));
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('staff.actionError'));
    } finally {
      setBusy('');
    }
  };
  const shown = useMemo(
    () =>
      members.filter((m) =>
        `${m.displayName} ${m.email}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [members, search],
  );
  const label = (r: Role) => t(`roles.${r}`);
  if (loading) return <p role="status">{t('staff.loading')}</p>;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t('staff.title')}</h2>
        <p className="text-muted">{t('staff.description')}</p>
      </div>
      {error && <Alert tone="error" title={error} />}
      <Card>
        <form
          className="grid gap-3 md:grid-cols-[1fr_14rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void mutate('invite', '/api/v1/organization/invitations', 'POST', { email, role }).then(
              () => setEmail(''),
            );
          }}
        >
          <label>
            {t('staff.email')}
            <input
              className="input mt-1 w-full"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            {t('staff.role')}
            <select
              className="input mt-1 w-full"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {label(r)}
                </option>
              ))}
            </select>
          </label>
          <Button className="self-end" disabled={!!busy} type="submit">
            {t('staff.invite')}
          </Button>
        </form>
      </Card>
      <label className="block max-w-md">
        {t('staff.search')}
        <input
          className="input mt-1 w-full"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <section aria-labelledby="members-title">
        <h3 id="members-title" className="mb-3 text-lg font-bold">
          {t('staff.members')}
        </h3>
        {!shown.length ? (
          <p>{t('staff.empty')}</p>
        ) : (
          <div className="grid gap-3">
            {shown.map((m) => (
              <Card key={m.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <strong>{m.displayName}</strong>
                    <p>{m.email}</p>
                    <Badge tone={m.active ? 'success' : 'neutral'}>
                      {m.active ? t('staff.active') : t('staff.inactive')}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      aria-label={`${t('staff.role')} ${m.displayName}`}
                      className="input"
                      value={m.role}
                      disabled={m.role === 'system_admin' || !!busy}
                      onChange={(e) => {
                        if (confirm(t('staff.confirmRole')))
                          void mutate(m.id, `/api/v1/organization/memberships/${m.id}`, 'PATCH', {
                            role: e.target.value,
                          });
                      }}
                    >
                      {m.role === 'system_admin' && (
                        <option value="system_admin">{label('system_admin')}</option>
                      )}
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {label(r)}
                        </option>
                      ))}
                    </select>
                    {m.role !== 'system_admin' && (
                      <Button
                        variant="secondary"
                        disabled={!!busy}
                        onClick={() => {
                          if (confirm(t('staff.confirmStatus')))
                            void mutate(m.id, `/api/v1/organization/memberships/${m.id}`, 'PATCH', {
                              active: !m.active,
                            });
                        }}
                      >
                        {m.active ? t('staff.deactivate') : t('staff.reactivate')}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
      <section aria-labelledby="invites-title">
        <h3 id="invites-title" className="mb-3 text-lg font-bold">
          {t('staff.invitations')}
        </h3>
        <div className="grid gap-3">
          {invitations.map((i) => {
            const state = i.acceptedAt
              ? 'accepted'
              : i.revokedAt
                ? 'revoked'
                : new Date(i.expiresAt) <= new Date()
                  ? 'expired'
                  : 'pending';
            return (
              <Card key={i.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <strong>{i.email}</strong>
                    <p>
                      {label(i.role)} · {t(`staff.${state}`)}
                      {i.deliveryStatus === 'failed' ? ` · ${t('staff.deliveryFailed')}` : ''}
                    </p>
                  </div>
                  {state === 'pending' && (
                    <div className="flex gap-2">
                      <Button
                        disabled={!!busy}
                        variant="secondary"
                        onClick={() =>
                          void mutate(i.id, `/api/v1/organization/invitations/${i.id}/resend`)
                        }
                      >
                        {t('staff.resend')}
                      </Button>
                      <Button
                        disabled={!!busy}
                        variant="danger"
                        onClick={() =>
                          void mutate(i.id, `/api/v1/organization/invitations/${i.id}/revoke`)
                        }
                      >
                        {t('staff.revoke')}
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
