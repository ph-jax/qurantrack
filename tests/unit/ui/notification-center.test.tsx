import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../../src/i18n';
import {
  NotificationCenterPage,
  notificationRetryMessage,
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
  ])('uses dedicated English and Turkish retry wording for %s', async (code, english) => {
    expect(i18n.t(notificationRetryMessage(code))).toContain(english);
    await i18n.changeLanguage('tr');
    expect(i18n.t(notificationRetryMessage(code))).not.toMatch(/Published|Retry submitted|failed/i);
    expect(i18n.t(notificationRetryMessage(code))).toBeTruthy();
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
});
