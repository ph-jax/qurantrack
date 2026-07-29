import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Badge, Button, Card } from '../components/ui';
import { useSession } from '../features/auth/SessionProvider';

type Role = 'system_admin' | 'organization_admin' | 'teacher' | 'read_only';
type Member = {
  id: string;
  displayName: string;
  email: string;
  role: Role;
  active: number;
  isSelf: number;
};
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
  const { session, organizationSwitching } = useSession();
  const organizationId = session?.activeOrganizationId ?? '';
  const [members, setMembers] = useState<Member[]>([]),
    [invitations, setInvitations] = useState<Invitation[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(''),
    [search, setSearch] = useState(''),
    [email, setEmail] = useState(''),
    [role, setRole] = useState<Role>('teacher'),
    [roleFilter, setRoleFilter] = useState('all'),
    [statusFilter, setStatusFilter] = useState('all'),
    [invitationFilter, setInvitationFilter] = useState('all');
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
  const mutate = async (
    key: string,
    url: string,
    successKey: string,
    method = 'POST',
    body: Record<string, unknown> = {},
  ) => {
    if (busy || organizationSwitching) return false;
    setBusy(key);
    setError('');
    setSuccess('');
    try {
      const r = await fetch(url, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: JSON.stringify({ ...body, expectedOrganizationId: organizationId }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as {
          error?: { code?: string; message?: string };
        } | null;
        if (j?.error?.code === 'DELIVERY_FAILED') await load();
        const knownCodes = [
          'STALE_ORGANIZATION',
          'DELIVERY_FAILED',
          'LAST_ADMIN',
          'SELF_CHANGE',
          'CONFLICT',
          'FORBIDDEN',
        ] as const;
        const code = knownCodes.includes(j?.error?.code as (typeof knownCodes)[number])
          ? j?.error?.code
          : 'GENERAL';
        throw new Error(t(`staff.errors.${code}`));
      }
      await load();
      setSuccess(t(`staff.${successKey}`));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : t('staff.actionError'));
      return false;
    } finally {
      setBusy('');
    }
  };
  const shown = useMemo(
    () =>
      members.filter(
        (m) =>
          `${m.displayName} ${m.email}`.toLowerCase().includes(search.toLowerCase()) &&
          (roleFilter === 'all' || m.role === roleFilter) &&
          (statusFilter === 'all' || Boolean(m.active) === (statusFilter === 'active')),
      ),
    [members, search, roleFilter, statusFilter],
  );
  const invitationState = (i: Invitation) =>
    i.acceptedAt
      ? 'accepted'
      : i.revokedAt
        ? 'revoked'
        : new Date(i.expiresAt) <= new Date()
          ? 'expired'
          : 'pending';
  const shownInvitations = invitations.filter(
    (i) => invitationFilter === 'all' || invitationState(i) === invitationFilter,
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
      {success && <Alert tone="success" title={success} />}
      <Card>
        <form
          className="grid gap-3 md:grid-cols-[1fr_14rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void mutate('invite', '/api/v1/organization/invitations', 'inviteSuccess', 'POST', {
              email,
              role,
            }).then((ok) => {
              if (ok) setEmail('');
            });
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
          <Button className="self-end" disabled={!!busy || organizationSwitching} type="submit">
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
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          {t('staff.roleFilter')}
          <select
            className="input mt-1 w-full"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">{t('staff.all')}</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {label(r)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('staff.statusFilter')}
          <select
            className="input mt-1 w-full"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">{t('staff.all')}</option>
            <option value="active">{t('staff.active')}</option>
            <option value="inactive">{t('staff.inactive')}</option>
          </select>
        </label>
      </div>
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
                      disabled={
                        m.role === 'system_admin' || !!m.isSelf || !!busy || organizationSwitching
                      }
                      onChange={(e) => {
                        if (confirm(t('staff.confirmRole')))
                          void mutate(
                            m.id,
                            `/api/v1/organization/memberships/${m.id}`,
                            'roleSuccess',
                            'PATCH',
                            {
                              role: e.target.value,
                            },
                          );
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
                    {m.role !== 'system_admin' && !m.isSelf && (
                      <Button
                        variant="secondary"
                        disabled={!!busy || organizationSwitching}
                        onClick={() => {
                          if (confirm(t('staff.confirmStatus')))
                            void mutate(
                              m.id,
                              `/api/v1/organization/memberships/${m.id}`,
                              m.active ? 'deactivateSuccess' : 'reactivateSuccess',
                              'PATCH',
                              {
                                active: !m.active,
                              },
                            );
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
        <label className="mb-3 block max-w-xs">
          {t('staff.invitationFilter')}
          <select
            className="input mt-1 w-full"
            value={invitationFilter}
            onChange={(e) => setInvitationFilter(e.target.value)}
          >
            <option value="all">{t('staff.all')}</option>
            {['pending', 'expired', 'accepted', 'revoked'].map((s) => (
              <option key={s} value={s}>
                {t(`staff.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3">
          {!shownInvitations.length && <p>{t('staff.invitationsEmpty')}</p>}
          {shownInvitations.map((i) => {
            const state = invitationState(i);
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
                  {(state === 'pending' || state === 'expired') && (
                    <div className="flex gap-2">
                      <Button
                        disabled={!!busy || organizationSwitching}
                        variant="secondary"
                        onClick={() =>
                          void mutate(
                            i.id,
                            `/api/v1/organization/invitations/${i.id}/resend`,
                            'resendSuccess',
                          )
                        }
                      >
                        {t('staff.resend')}
                      </Button>
                      <Button
                        disabled={!!busy || organizationSwitching}
                        variant="danger"
                        onClick={() =>
                          void mutate(
                            i.id,
                            `/api/v1/organization/invitations/${i.id}/revoke`,
                            'revokeSuccess',
                          )
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
