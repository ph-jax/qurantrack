import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Badge, Button, Card, FormField, Input, Spinner } from '../components/ui';

type Row = Record<string, string | number | null>;

export function NotificationCenterPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const query = new URLSearchParams({ page: String(page), pageSize: '20', status, type, search });
    try {
      const response = await fetch(`/api/v1/notifications?${query}`, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const value = (await response.json()) as {
        notifications: Row[];
        pagination: { pages: number };
      };
      setRows(value.notifications);
      setPages(value.pagination.pages);
    } catch {
      setError(true);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, status, type]);
  useEffect(() => {
    // The effect synchronizes server-side filters and pagination.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => setRows([]);
  }, [load]);
  async function retry(id: string) {
    if (busy) return;
    setBusy(id);
    try {
      const response = await fetch(`/api/v1/notifications/${id}/retry`, { method: 'POST' });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      setError(true);
    } finally {
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
                {row.status === 'failed' && (
                  <Button
                    className="mt-2"
                    type="button"
                    disabled={busy === row.id}
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
