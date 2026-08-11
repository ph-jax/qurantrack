import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../../src/i18n';
import {
  NotificationCenterPage,
  notificationRetryMessage,
  notificationRetryTone,
} from '../../../src/pages/NotificationCenterPage';

let organizationId = 'org-a';
let switching = false;
vi.mock('../../../src/features/auth/SessionProvider', () => ({
  useSession: () => ({
    session: { activeOrganizationId: organizationId },
    organizationSwitching: switching,
  }),
}));

const page = (notifications: Record<string, unknown>[] = [], current = 1, pages = 1) =>
  Response.json({
    ok: true,
    notifications,
    students: [{ id: 'stu-a', display_name: 'Student A' }],
    pagination: { page: current, pages },
  });
const failed = {
  id: 'notification-a',
  student_name: 'Student A',
  guardian_name: 'Guardian',
  recipient_email: 'g@example.com',
  notification_type: 'progress_update',
  update_date: '2026-08-01',
  subject: 'Subject',
  status: 'failed',
  attempt_count: 1,
  attempted_at: '2026-08-01',
  failure_reference: 'Reference safe',
};

describe('Notification Center', () => {
  beforeEach(() => {
    organizationId = 'org-a';
    switching = false;
    void i18n.changeLanguage('en');
  });

  it.each([
    ['notifications_submitted', 'Retry submitted to the email relay'],
    ['notification_failed', 'Retry submission definitively failed'],
    ['notification_ambiguous', 'Retry status is pending or uncertain'],
    ['notification_preparation_failed', 'Retry preparation failed'],
    ['notification_not_retryable', 'not eligible for retry'],
    ['notification_partial', 'Retry results were mixed'],
    ['notification_in_progress', 'Another retry is being processed'],
    ['already_notified', 'Another request already submitted or handled'],
  ])('uses dedicated English and Turkish retry wording for %s', async (code, english) => {
    expect(i18n.t(notificationRetryMessage(code))).toContain(english);
    await i18n.changeLanguage('tr');
    expect(i18n.t(notificationRetryMessage(code))).not.toMatch(/Published|Retry submitted|failed/i);
    expect(i18n.t(notificationRetryMessage(code))).toBeTruthy();
  });

  it('uses the mixed fallback for unknown retry outcomes', () => {
    expect(notificationRetryMessage('unknown_result')).toBe(
      'notificationCenter.retryResults.notification_partial',
    );
    expect(notificationRetryTone('unknown_result')).toBe('warning');
  });

  it('exposes filters, resets the page, paginates, and shows retry only for failed rows', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return page(
        [failed, { ...failed, id: 'sent', status: 'sent', failure_reference: null }],
        1,
        2,
      );
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <NotificationCenterPage />
      </I18nextProvider>,
    );
    expect(await screen.findByText('Reference safe')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Retry submission' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(String(fetcher.mock.calls.at(-1)?.[0])).toContain('page=2'));
    await user.selectOptions(screen.getByLabelText('Student'), 'stu-a');
    await waitFor(() => expect(String(fetcher.mock.calls.at(-1)?.[0])).toContain('page=1'));
    expect(screen.getByLabelText('Guardian or email')).toBeVisible();
    expect(screen.getByLabelText('From date')).toBeVisible();
    expect(screen.getByLabelText('To date')).toBeVisible();
  });

  it('ignores a stale list response after organization switching', async () => {
    let resolve!: (value: Response) => void;
    const deferred = new Promise<Response>((done) => {
      resolve = done;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => deferred),
    );
    const view = render(
      <I18nextProvider i18n={i18n}>
        <NotificationCenterPage />
      </I18nextProvider>,
    );
    organizationId = 'org-b';
    switching = true;
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <NotificationCenterPage />
      </I18nextProvider>,
    );
    resolve(page([failed]));
    await Promise.resolve();
    expect(screen.queryByText('Guardian')).not.toBeInTheDocument();
  });

  it('ignores stale retry results and prevents their reload in a new organization', async () => {
    let resolveRetry!: (value: Response) => void;
    const retry = new Promise<Response>((done) => {
      resolveRetry = done;
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/retry') ? retry : page([failed]),
    );
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    const view = render(
      <I18nextProvider i18n={i18n}>
        <NotificationCenterPage />
      </I18nextProvider>,
    );
    await user.click(await screen.findByRole('button', { name: 'Retry submission' }));
    organizationId = 'org-b';
    switching = true;
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <NotificationCenterPage />
      </I18nextProvider>,
    );
    const callsBefore = fetcher.mock.calls.length;
    resolveRetry(Response.json({ ok: true, aggregate: { code: 'notifications_submitted' } }));
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText(/Retry submitted to the email relay/)).not.toBeInTheDocument();
    expect(fetcher.mock.calls.length).toBe(callsBefore);
  });

  it.each([
    ['notifications_submitted', 'Retry submitted to the email relay'],
    ['notification_failed', 'Retry submission definitively failed'],
    ['notification_ambiguous', 'Retry status is pending or uncertain'],
    ['notification_in_progress', 'Another retry is being processed'],
    ['already_notified', 'Another request already submitted or handled'],
    ['unknown_result', 'Retry results were mixed'],
  ])('clears busy after %s and renders the actual English retry notice', async (code, message) => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/retry')
        ? Response.json({ ok: true, aggregate: { code } })
        : page([failed]),
    );
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <NotificationCenterPage />
      </I18nextProvider>,
    );
    const button = await screen.findByRole('button', { name: 'Retry submission' });
    await user.click(button);
    const notice = await screen.findByText(new RegExp(message));
    expect(notice).toBeVisible();
    expect(notice.closest('.alert')).toHaveClass(
      code === 'already_notified' || code === 'notifications_submitted'
        ? 'alert-success'
        : 'alert-warning',
    );
    await waitFor(() => expect(button).toBeEnabled());
  });

  it.each([
    [
      'notification_in_progress',
      'Başka bir yeniden deneme işleniyor veya gönderim durumu bekliyor.',
      'alert-warning',
    ],
    [
      'already_notified',
      'Başka bir istek bu bildirimi zaten gönderdi veya işledi.',
      'alert-success',
    ],
  ])('renders %s truthfully in Turkish through the component', async (code, message, tone) => {
    await i18n.changeLanguage('tr');
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/retry')
        ? Response.json({ ok: true, aggregate: { code } })
        : page([failed]),
    );
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <NotificationCenterPage />
      </I18nextProvider>,
    );
    const button = await screen.findByRole('button', { name: 'Gönderimi yeniden dene' });
    await user.click(button);
    const notice = await screen.findByText(new RegExp(message));
    expect(notice.closest('.alert')).toHaveClass(tone);
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('preserves retry feedback and restores controls when the following list refresh fails', async () => {
    let lists = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/retry'))
        return Response.json({ ok: true, aggregate: { code: 'notification_failed' } });
      return ++lists === 1 ? page([failed]) : new Response('{}', { status: 500 });
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <NotificationCenterPage />
      </I18nextProvider>,
    );
    const button = await screen.findByRole('button', { name: 'Retry submission' });
    await user.click(button);
    expect(await screen.findByText('Retry submission definitively failed.')).toBeVisible();
    expect(await screen.findByText('Notification history could not be loaded.')).toBeVisible();
    expect(button).toBeEnabled();
  });

  it('maps stale and failed retry requests without replacing them with list errors', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/retry') ? new Response('{}', { status: 404 }) : page([failed]),
    );
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <NotificationCenterPage />
      </I18nextProvider>,
    );
    const button = await screen.findByRole('button', { name: 'Retry submission' });
    await user.click(button);
    expect(await screen.findByText('This notification is not eligible for retry.')).toBeVisible();
    expect(button).toBeEnabled();
  });

  it('prevents duplicate retry posts and disables every retry while one is active', async () => {
    let resolve!: (value: Response) => void;
    const pending = new Promise<Response>((done) => {
      resolve = done;
    });
    const second = { ...failed, id: 'notification-b', recipient_email: 'b@example.com' };
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/retry') ? pending : page([failed, second]),
    );
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <NotificationCenterPage />
      </I18nextProvider>,
    );
    const buttons = await screen.findAllByRole('button', { name: 'Retry submission' });
    await user.click(buttons[0]);
    await user.click(buttons[0]);
    expect(fetcher.mock.calls.filter(([input]) => String(input).includes('/retry'))).toHaveLength(
      1,
    );
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
    resolve(Response.json({ ok: true, aggregate: { code: 'notification_ambiguous' } }));
    await waitFor(() => expect(buttons[0]).toBeEnabled());
  });

  it('renders Turkish retry feedback through the component flow', async () => {
    await i18n.changeLanguage('tr');
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/retry')
        ? Response.json({ ok: true, aggregate: { code: 'notification_preparation_failed' } })
        : page([failed]),
    );
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <NotificationCenterPage />
      </I18nextProvider>,
    );
    await user.click(await screen.findByRole('button', { name: 'Gönderimi yeniden dene' }));
    expect(
      await screen.findByText('Yeniden deneme hazırlanamadı. E-posta gönderilmedi.'),
    ).toBeVisible();
  });
});
