import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Badge, Button, Card, FormField, Input, Spinner } from '../components/ui';
import { useSession } from '../features/auth/SessionProvider';

type Row = Record<string, string | number | null>;

// eslint-disable-next-line react-refresh/only-export-components
export function notificationRetryMessage(code: string) {
  const known = [
    'notifications_submitted',
    'notification_failed',
    'notification_ambiguous',
    'notification_preparation_failed',
    'notification_not_retryable',
    'notification_partial',
    'notification_in_progress',
    'already_notified',
  ];
  return `notificationCenter.retryResults.${known.includes(code) ? code : 'notification_partial'}`;
}

// eslint-disable-next-line react-refresh/only-export-components
export function notificationRetryTone(code: string) {
  if (code === 'notifications_submitted' || code === 'already_notified') return 'success' as const;
  return 'warning' as const;
}

export function NotificationCenterPage() {
  const { t } = useTranslation();
  const { session, organizationSwitching } = useSession();
  const organizationId = session?.activeOrganizationId ?? '';
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [studentId, setStudentId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [students, setStudents] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const tenantGeneration = useRef(0);
  const listGeneration = useRef(0);
  const previousOrganization = useRef(organizationId);
  const load = useCallback(async () => {
    if (!organizationId || organizationSwitching) return;
    const currentTenant = tenantGeneration.current;
    const currentList = ++listGeneration.current;
    setLoading(true);
    setError(false);
    const query = new URLSearchParams({
      page: String(page),
      pageSize: '20',
      status,
      type,
      search,
      studentId,
      from,
      to,
    });
    try {
      const response = await fetch(`/api/v1/notifications?${query}`, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const value = (await response.json()) as {
        notifications: Row[];
        pagination: { pages: number };
      };
      if (currentTenant !== tenantGeneration.current || currentList !== listGeneration.current)
        return;
      setRows(value.notifications);
      setStudents((value as typeof value & { students: Row[] }).students);
      setPages(value.pagination.pages);
    } catch {
      if (currentTenant !== tenantGeneration.current || currentList !== listGeneration.current)
        return;
      setError(true);
    } finally {
      if (currentTenant === tenantGeneration.current && currentList === listGeneration.current)
        setLoading(false);
    }
  }, [from, organizationId, organizationSwitching, page, search, status, studentId, to, type]);
  useEffect(() => {
    if (previousOrganization.current !== organizationId || organizationSwitching) {
      previousOrganization.current = organizationId;
      tenantGeneration.current += 1;
      listGeneration.current += 1;
      // Organization-specific data and filters cannot survive a tenant change.
      setRows([]);
      setStudents([]);
      setBusy('');
      setNotice('');
      setStatus('');
      setType('');
      setSearch('');
      setStudentId('');
      setFrom('');
      setTo('');
      setPage(1);
      setPages(1);
    }
  }, [organizationId, organizationSwitching]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  async function retry(id: string) {
    if (busy || organizationSwitching || !organizationId) return;
    const startedOrganization = organizationId;
    const startedTenantGeneration = tenantGeneration.current;
    setBusy(id);
    try {
      const response = await fetch(`/api/v1/notifications/${id}/retry`, { method: 'POST' });
      if (
        startedTenantGeneration !== tenantGeneration.current ||
        startedOrganization !== previousOrganization.current
      )
        return;
      const value = (await response.json().catch(() => null)) as {
        aggregate?: { code: string };
      } | null;
      if (!response.ok) {
        if (
          startedTenantGeneration === tenantGeneration.current &&
          startedOrganization === previousOrganization.current
        )
          setNotice(
            response.status === 404
              ? 'notification_not_retryable'
              : value?.aggregate?.code || 'notification_preparation_failed',
          );
        return;
      }
      if (
        startedTenantGeneration !== tenantGeneration.current ||
        startedOrganization !== previousOrganization.current
      )
        return;
      setNotice(value?.aggregate?.code || 'notification_partial');
      await load();
    } catch {
      if (
        startedTenantGeneration !== tenantGeneration.current ||
        startedOrganization !== previousOrganization.current
      )
        return;
      setNotice('notification_preparation_failed');
    } finally {
      if (
        startedTenantGeneration === tenantGeneration.current &&
        startedOrganization === previousOrganization.current
      )
        setBusy('');
    }
  }
  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h2>{t('notificationCenter.title')}</h2>
          <p>{t('notificationCenter.description')}</p>
        </div>
      </div>
      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <FormField id="notification-search" label={t('notificationCenter.search')}>
            <Input
              id="notification-search"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
            />
          </FormField>
          <FormField id="notification-student" label={t('notificationCenter.student')}>
            <select
              id="notification-student"
              className="settings-select"
              value={studentId}
              onChange={(e) => {
                setPage(1);
                setStudentId(e.target.value);
              }}
            >
              <option value="">{t('notificationCenter.all')}</option>
              {students.map((student) => (
                <option key={String(student.id)} value={String(student.id)}>
                  {student.display_name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="notification-from" label={t('notificationCenter.from')}>
            <Input
              id="notification-from"
              type="date"
              value={from}
              onChange={(e) => {
                setPage(1);
                setFrom(e.target.value);
              }}
            />
          </FormField>
          <FormField id="notification-to" label={t('notificationCenter.to')}>
            <Input
              id="notification-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => {
                setPage(1);
                setTo(e.target.value);
              }}
            />
          </FormField>
          <FormField id="notification-status" label={t('notificationCenter.status')}>
            <select
              id="notification-status"
              className="settings-select"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            >
              <option value="">{t('notificationCenter.all')}</option>
              <option value="sent">{t('notificationCenter.statuses.sent')}</option>
              <option value="failed">{t('notificationCenter.statuses.failed')}</option>
              <option value="pending">{t('notificationCenter.statuses.pending')}</option>
            </select>
          </FormField>
          <FormField id="notification-type" label={t('notificationCenter.type')}>
            <select
              id="notification-type"
              className="settings-select"
              value={type}
              onChange={(e) => {
                setPage(1);
                setType(e.target.value);
              }}
            >
              <option value="">{t('notificationCenter.all')}</option>
              <option value="progress_update">
                {t('notificationCenter.types.progress_update')}
              </option>
              <option value="homework_update">
                {t('notificationCenter.types.homework_update')}
              </option>
            </select>
          </FormField>
        </div>
      </Card>
      {error && <Alert tone="error" title={t('notificationCenter.error')} />}
      {notice && (
        <Alert tone={notificationRetryTone(notice)} title={t(notificationRetryMessage(notice))} />
      )}
      {loading ? (
        <Spinner label={t('pilot.loading')} />
      ) : (
        <Card>
          <div className="space-y-4" aria-live="polite">
            {rows.map((row) => (
              <article key={String(row.id)} className="border-b border-border pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>
                    {row.student_name} · {row.guardian_name}
                  </strong>
                  <Badge
                    tone={
                      row.status === 'sent'
                        ? 'success'
                        : row.status === 'failed'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {t(`notificationCenter.statuses.${row.status}`)}
                  </Badge>
                </div>
                <p>
                  {row.recipient_email} · {t(`notificationCenter.types.${row.notification_type}`)} ·{' '}
                  {row.update_date}
                </p>
                <p>{row.subject}</p>
                <p className="text-sm text-text-secondary">
                  {t('notificationCenter.attempts', { count: row.attempt_count })} ·{' '}
                  {row.attempted_at}
                </p>
                {row.failure_reference && <p className="text-sm">{row.failure_reference}</p>}
                {row.status === 'failed' && (
                  <Button
                    className="mt-2"
                    type="button"
                    disabled={organizationSwitching || Boolean(busy)}
                    onClick={() => retry(String(row.id))}
                  >
                    {t('notificationCenter.retry')}
                  </Button>
                )}
              </article>
            ))}
            {!rows.length && <p>{t('notificationCenter.empty')}</p>}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              {t('common.previous')}
            </Button>
            <span>{t('common.page', { page, pages })}</span>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
            >
              {t('common.next')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
