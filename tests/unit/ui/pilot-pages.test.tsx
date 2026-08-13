import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClassesPage,
  FamiliesPage,
  ProgressForm,
  StudentsPage,
  homeworkResultCode,
  HomeworkEditor,
} from '../../../src/pages/PilotPages';
import {
  pilotResultPresentation,
  requestNotificationAction,
} from '../../../src/features/pilot/results';
import { i18n } from '../../../src/i18n';

vi.mock('../../../src/features/auth/SessionProvider', () => ({
  useSession: () => ({ session: { role: 'organization_admin' } }),
}));

describe('Pilot administrator editors', () => {
  const classes = [
    {
      id: 'class-one',
      name: 'First Class',
      description: 'First description',
      meeting_schedule: 'Monday',
      active: 1,
    },
    {
      id: 'class-two',
      name: 'Second Class',
      description: 'Second description',
      meeting_schedule: 'Tuesday',
      active: 1,
    },
  ];
  const requests: Record<string, unknown>[] = [];
  beforeEach(() => {
    void i18n.changeLanguage('en');
    requests.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/v1/classes') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          requests.push(body);
          const selected = classes.find((item) => item.id === body.id);
          if (selected) Object.assign(selected, body);
          return new Response(JSON.stringify({ ok: true, id: body.id }), { status: 200 });
        }
        if (url.endsWith('/api/v1/classes'))
          return new Response(JSON.stringify({ ok: true, classes }), { status: 200 });
        if (url.endsWith('/api/v1/pilot/setup-options'))
          return new Response(
            JSON.stringify({
              ok: true,
              teachers: [],
              students: [],
              guardians: [],
              assignments: [],
              enrollments: [],
              guardianLinks: [],
            }),
            { status: 200 },
          );
        return new Response('{}', { status: 404 });
      }),
    );
  });

  it('remounts shared form for create, each selected edit, cancel, and activation update', async () => {
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <ClassesPage />
        </MemoryRouter>
      </I18nextProvider>,
    );
    const name = await screen.findByLabelText('Name');
    expect(name).toHaveValue('');

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    expect(screen.getByLabelText('Name')).toHaveValue('First Class');
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
    expect(screen.getByLabelText('Name')).toHaveValue('Second Class');

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Second Class Updated');
    await user.click(screen.getByLabelText('Active'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      id: 'class-two',
      name: 'Second Class Updated',
      active: false,
    });
    expect(classes).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Name')).toHaveValue('');
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    expect(screen.getByLabelText('Name')).toHaveValue('First Class');
  });
});

describe('Pilot progress result lifecycle', () => {
  beforeEach(() => {
    void i18n.changeLanguage('en');
  });
  it.each([
    ['notifications_submitted', 'homework_updated_notified'],
    ['already_notified', 'homework_updated_already_notified'],
    ['no_recipients', 'homework_updated_no_recipients'],
    ['notification_partial', 'homework_updated_partial'],
    ['notification_failed', 'homework_updated_failed'],
    ['notification_preparation_failed', 'homework_updated_preparation_failed'],
    ['notification_ambiguous', 'homework_updated_ambiguous'],
    ['notification_not_retryable', 'homework_updated_not_retryable'],
    ['notification_in_progress', 'homework_updated_notification_in_progress'],
  ])('maps homework aggregate %s truthfully', (aggregate, expected) => {
    expect(
      homeworkResultCode(
        { storage: { status: 'updated' }, notificationAggregate: { code: aggregate } },
        true,
      ),
    ).toBe(expected);
  });
  it('uses neutral wording for a mixed aggregate without a definitive failure', () => {
    const code = homeworkResultCode(
      {
        storage: { status: 'updated' },
        notificationAggregate: {
          code: 'notification_partial',
          counts: { submitted: 1, ambiguous: 1, failed: 0 },
        },
      },
      true,
    );
    expect(code).toBe('homework_updated_partial');
    expect(i18n.t(`pilot.messages.${code}`)).toBe(
      'Homework updated. Guardian notification results were mixed; review the notification status for details.',
    );
  });
  const summary = {
    classes: [{ id: 'class-a', name: 'Class A' }],
    lessons: [
      {
        id: 'lesson-a',
        name: 'Lesson A',
        track_name: 'Track',
        level_name: 'Level',
        default_homework: '',
      },
    ],
  };
  function ResultHarness({ fail = false }: { fail?: boolean }) {
    const [epoch, setEpoch] = useState(0);
    const [result, setResult] = useState('');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('notification-recipients')
          ? Response.json({ ok: true, count: 0, recipients: [] })
          : fail
            ? new Response(JSON.stringify({ error: { message: 'safe' } }), { status: 500 })
            : Response.json({ ok: true, id: 'progress-a', publication: 'notifications_submitted' }),
      ),
    );
    const presentation = result ? pilotResultPresentation(result) : null;
    return (
      <>
        <ProgressForm
          key={epoch}
          studentId="student-a"
          summary={summary}
          draft={null}
          onDone={async (reset) => {
            if (reset) setEpoch((value) => value + 1);
          }}
          onResult={setResult}
        />
        {presentation && (
          <div data-testid="result" data-tone={presentation.tone}>
            {i18n.t(presentation.key)}
          </div>
        )}
      </>
    );
  }

  it('maps notification outcomes to accurate tones', () => {
    expect(pilotResultPresentation('notifications_submitted').tone).toBe('success');
    expect(pilotResultPresentation('no_recipients').tone).toBe('info');
    expect(pilotResultPresentation('already_notified').tone).toBe('info');
    expect(pilotResultPresentation('notification_failed').tone).toBe('error');
    expect(pilotResultPresentation('notification_ambiguous').tone).toBe('warning');
    expect(pilotResultPresentation('notification_in_progress')).toEqual({
      tone: 'warning',
      key: 'pilot.messages.notification_in_progress',
    });
    expect(pilotResultPresentation('notification_preparation_failed').tone).toBe('error');
    expect(pilotResultPresentation('notification_partial').tone).toBe('warning');
    expect(pilotResultPresentation('notification_request_failed').tone).toBe('error');
  });

  it.each([
    ['homework_updated_no_email', 'success'],
    ['homework_updated_notified', 'success'],
    ['homework_updated_already_notified', 'success'],
    ['homework_unchanged', 'info'],
    ['homework_updated_no_recipients', 'info'],
    ['homework_updated_partial', 'warning'],
    ['homework_updated_ambiguous', 'warning'],
    ['homework_updated_not_retryable', 'warning'],
    ['homework_updated_notification_in_progress', 'warning'],
    ['homework_updated_failed', 'error'],
    ['homework_updated_preparation_failed', 'error'],
  ])('classifies homework result %s as %s with its specific message', (code, tone) => {
    expect(pilotResultPresentation(code)).toEqual({
      tone,
      key: `pilot.messages.${code}`,
    });
  });

  it.each([
    ['notifications_submitted', 'homework_updated_notified', 'success'],
    ['notification_failed', 'homework_updated_failed', 'error'],
    ['notification_preparation_failed', 'homework_updated_preparation_failed', 'error'],
    ['notification_partial', 'homework_updated_partial', 'warning'],
    ['notification_ambiguous', 'homework_updated_ambiguous', 'warning'],
    ['notification_in_progress', 'homework_updated_notification_in_progress', 'warning'],
    ['no_recipients', 'homework_updated_no_recipients', 'info'],
  ])('renders aggregate %s through the real homework result flow', (aggregate, code, tone) => {
    const resultCode = homeworkResultCode(
      { storage: { status: 'updated' }, notificationAggregate: { code: aggregate } },
      true,
    );
    expect(resultCode).toBe(code);
    const presentation = pilotResultPresentation(resultCode);
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <div role="status" className={`alert-${presentation.tone}`}>
          {i18n.t(presentation.key)}
        </div>
      </I18nextProvider>,
    );
    expect(container.querySelector('[role="status"]')).toHaveClass(`alert-${tone}`);
    expect(container.textContent).not.toContain(presentation.key);
  });

  it('renders unchanged informationally and preserves English and Turkish homework messages', async () => {
    const presentation = pilotResultPresentation('homework_unchanged');
    expect(presentation).toEqual({ tone: 'info', key: 'pilot.messages.homework_unchanged' });
    expect(i18n.t(presentation.key)).toBe('No change was detected.');
    await i18n.changeLanguage('tr');
    expect(i18n.t(presentation.key)).toBe('Değişiklik algılanmadı.');
    expect(i18n.t(presentation.key)).not.toBe(presentation.key);
  });

  it('keeps the unknown homework aggregate fallback warning-styled', () => {
    const code = homeworkResultCode(
      { storage: { status: 'updated' }, notificationAggregate: { code: 'future_code' } },
      true,
    );
    expect(code).toBe('homework_updated_partial');
    expect(pilotResultPresentation(code).tone).toBe('warning');
  });

  it.each([
    ['en', 'Another notification retry is being processed or its submission status is pending.'],
    ['tr', 'Başka bir bildirim yeniden denemesi işleniyor veya gönderim durumu bekliyor.'],
  ])('renders the student retry in-progress result truthfully in %s', async (locale, message) => {
    await i18n.changeLanguage(locale);
    let resolveRetry!: (value: Response) => void;
    const retry = new Promise<Response>((resolve) => (resolveRetry = resolve));
    function RetryHarness() {
      const [busy, setBusy] = useState(false);
      const [result, setResult] = useState('');
      const presentation = result ? pilotResultPresentation(result) : null;
      return (
        <>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setResult(await requestNotificationAction('/notify', vi.fn(() => retry) as never));
              } finally {
                setBusy(false);
              }
            }}
          >
            Retry
          </button>
          {presentation && (
            <div role="status" className={`alert-${presentation.tone}`}>
              {i18n.t(presentation.key)}
            </div>
          )}
        </>
      );
    }
    const user = userEvent.setup();
    render(<RetryHarness />);
    const button = screen.getByRole('button', { name: 'Retry' });
    await user.click(button);
    expect(button).toBeDisabled();
    resolveRetry(Response.json({ ok: true, aggregate: { code: 'notification_in_progress' } }));
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent(message);
    expect(notice).not.toHaveTextContent('pilot.messages.notification_in_progress');
    expect(notice).not.toHaveTextContent(/submitted|gönderildi/i);
    expect(notice).toHaveClass('alert-warning');
    expect(notice).not.toHaveClass('alert-success');
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('returns a visible safe error for standalone HTTP, network, and parsing failures', async () => {
    await expect(
      requestNotificationAction(
        '/notify',
        vi.fn(async () => new Response('{}', { status: 500 })) as never,
      ),
    ).resolves.toBe('notification_request_failed');
    await expect(
      requestNotificationAction(
        '/notify',
        vi.fn(async () => Promise.reject(new Error('network'))) as never,
      ),
    ).resolves.toBe('notification_request_failed');
    await expect(
      requestNotificationAction('/notify', vi.fn(async () => new Response('not-json')) as never),
    ).resolves.toBe('notification_request_failed');
  });

  it('uses the server aggregate for standalone success and ambiguous results', async () => {
    await expect(
      requestNotificationAction(
        '/notify',
        vi.fn(async () =>
          Response.json({ ok: true, aggregate: { code: 'notifications_submitted' } }),
        ) as never,
      ),
    ).resolves.toBe('notifications_submitted');
    await expect(
      requestNotificationAction(
        '/notify',
        vi.fn(async () =>
          Response.json({ ok: true, aggregate: { code: 'notification_ambiguous' } }),
        ) as never,
      ),
    ).resolves.toBe('notification_ambiguous');
  });

  it('keeps a successful result visible after the editable form remounts', async () => {
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <ResultHarness />
      </I18nextProvider>,
    );
    await user.selectOptions(screen.getByLabelText('Lesson'), 'lesson-a');
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await user.click(screen.getByRole('button', { name: 'Confirm and publish' }));
    expect(await screen.findByTestId('result')).toHaveAttribute('data-tone', 'success');
    expect(screen.getByTestId('result')).toHaveTextContent('Published and submitted');
  });

  it('retains entered form data and shows an error after publication failure', async () => {
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <ResultHarness fail />
      </I18nextProvider>,
    );
    await user.selectOptions(screen.getByLabelText('Lesson'), 'lesson-a');
    await user.type(screen.getByLabelText('Teacher comment'), 'Keep this comment');
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await user.click(screen.getByRole('button', { name: 'Confirm and publish' }));
    expect(await screen.findByTestId('result')).toHaveAttribute('data-tone', 'error');
    expect(screen.getByLabelText('Teacher comment')).toHaveValue('Keep this comment');
  });

  it('preserves homework, notification choice, and operation key after an uncertain save failure', async () => {
    const user = userEvent.setup();
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes('notification-recipients'))
          return Response.json({
            ok: true,
            count: 1,
            recipients: [
              { id: 'g', name: 'Guardian', email: 'g@example.com', resolved_locale: 'en' },
            ],
          });
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({ error: { message: 'uncertain' } }, { status: 500 });
      }),
    );
    render(
      <I18nextProvider i18n={i18n}>
        <HomeworkEditor
          update={{ id: 'p', student_id: 'student-a', class_id: 'class-a', homework: 'Old' }}
          onCancel={vi.fn()}
          onSaved={vi.fn()}
        />
      </I18nextProvider>,
    );
    const field = screen.getByLabelText('Homework / current assignment');
    await user.clear(field);
    await user.type(field, 'Preserve me');
    const checkbox = screen.getByRole('checkbox', { name: 'Notify guardians about this change' });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm and publish' }));
    expect(await screen.findByText(/changes are preserved/i)).toBeVisible();
    expect(field).toHaveValue('Preserve me');
    expect(checkbox).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Confirm and publish' }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1].operationKey).toBe(bodies[0].operationKey);
  });

  it('selects operation keys by normalized homework and notification payload', async () => {
    const user = userEvent.setup();
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes('notification-recipients'))
          return Response.json({ ok: true, count: 0, recipients: [] });
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({ error: { message: 'uncertain' } }, { status: 500 });
      }),
    );
    render(
      <I18nextProvider i18n={i18n}>
        <HomeworkEditor
          update={{
            id: 'payload-key',
            student_id: 'student-a',
            class_id: 'class-a',
            homework: 'Old',
          }}
          onCancel={vi.fn()}
          onSaved={vi.fn()}
        />
      </I18nextProvider>,
    );
    const field = screen.getByLabelText('Homework / current assignment');
    const checkbox = screen.getByRole('checkbox', { name: 'Notify guardians about this change' });
    const save = screen.getByRole('button', { name: 'Save' });
    await user.clear(field);
    await user.type(field, 'First payload');
    await user.click(save);
    await screen.findByText(/changes are preserved/i);
    const firstKey = bodies[0].operationKey;

    await user.clear(field);
    await user.type(field, '  First payload  ');
    await user.click(save);
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1].operationKey).toBe(firstKey);

    await user.clear(field);
    await user.type(field, 'Changed payload');
    await user.click(save);
    await waitFor(() => expect(bodies).toHaveLength(3));
    const secondKey = bodies[2].operationKey;
    expect(secondKey).not.toBe(firstKey);

    await user.clear(field);
    await user.type(field, 'First payload');
    await user.click(save);
    await waitFor(() => expect(bodies).toHaveLength(4));
    const thirdKey = bodies[3].operationKey;
    expect(thirdKey).not.toBe(firstKey);
    expect(thirdKey).not.toBe(secondKey);

    await user.click(checkbox);
    await user.click(save);
    await user.click(await screen.findByRole('button', { name: 'Confirm and publish' }));
    await waitFor(() => expect(bodies).toHaveLength(5));
    expect(bodies[4]).toMatchObject({ homework: 'First payload', notifyGuardians: true });
    expect(bodies[4].operationKey).not.toBe(thirdKey);
  });

  it('keeps the last key when inputs change and revert before another attempt', async () => {
    const user = userEvent.setup();
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({ error: { message: 'uncertain' } }, { status: 500 });
      }),
    );
    render(
      <I18nextProvider i18n={i18n}>
        <HomeworkEditor
          update={{ id: 'revert-key', student_id: 'student-a', class_id: 'class-a', homework: '' }}
          onCancel={vi.fn()}
          onSaved={vi.fn()}
        />
      </I18nextProvider>,
    );
    const field = screen.getByLabelText('Homework / current assignment');
    const save = screen.getByRole('button', { name: 'Save' });
    await user.type(field, 'Payload A');
    await user.click(save);
    await screen.findByText(/changes are preserved/i);
    const firstKey = bodies[0].operationKey;
    await user.clear(field);
    await user.type(field, 'Payload B');
    await user.clear(field);
    await user.type(field, 'Payload A');
    await user.click(save);
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1].operationKey).toBe(firstKey);
  });

  it('locks non-notification homework controls while one PATCH is pending', async () => {
    const user = userEvent.setup();
    let resolvePatch!: (value: Response) => void;
    const patch = new Promise<Response>((resolve) => (resolvePatch = resolve));
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return patch;
      }),
    );
    const onSaved = vi.fn(async () => undefined);
    const onCancel = vi.fn();
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <HomeworkEditor
          update={{ id: 'busy', student_id: 'student-a', class_id: 'class-a', homework: 'Old' }}
          onCancel={onCancel}
          onSaved={onSaved}
        />
      </I18nextProvider>,
    );
    const field = screen.getByLabelText('Homework / current assignment');
    const checkbox = screen.getByRole('checkbox', { name: 'Notify guardians about this change' });
    await user.clear(field);
    await user.type(field, 'Captured homework');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(bodies).toEqual([
      expect.objectContaining({ homework: 'Captured homework', notifyGuardians: false }),
    ]);
    expect(field).toBeDisabled();
    expect(checkbox).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    await user.type(field, ' ignored');
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(field).toHaveValue('Captured homework');
    expect(checkbox).not.toBeChecked();
    expect(bodies).toHaveLength(1);
    resolvePatch(
      Response.json({
        ok: true,
        storage: { status: 'updated', revision: { id: 'revision' } },
        notificationAggregate: null,
      }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('homework_updated_no_email'));
    expect(bodies).toHaveLength(1);
  });

  it('locks confirmation and editor controls during a notifying PATCH', async () => {
    const user = userEvent.setup();
    let resolvePatch!: (value: Response) => void;
    const patch = new Promise<Response>((resolve) => (resolvePatch = resolve));
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes('notification-recipients'))
          return Response.json({ ok: true, count: 0, recipients: [] });
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return patch;
      }),
    );
    const onSaved = vi.fn(async () => undefined);
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <HomeworkEditor
          update={{
            id: 'notify-busy',
            student_id: 'student-a',
            class_id: 'class-a',
            homework: 'Old',
          }}
          onCancel={vi.fn()}
          onSaved={onSaved}
        />
      </I18nextProvider>,
    );
    const field = screen.getByLabelText('Homework / current assignment');
    const checkbox = screen.getByRole('checkbox', { name: 'Notify guardians about this change' });
    await user.clear(field);
    await user.type(field, 'Notify capture');
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const confirm = await screen.findByRole('button', { name: 'Confirm and publish' });
    await user.click(confirm);
    expect(bodies).toEqual([
      expect.objectContaining({ homework: 'Notify capture', notifyGuardians: true }),
    ]);
    expect(field).toBeDisabled();
    expect(checkbox).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(confirm).toBeDisabled();
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    await user.click(confirm);
    expect(bodies).toHaveLength(1);
    resolvePatch(
      Response.json({
        ok: true,
        storage: { status: 'updated', revision: { id: 'revision' } },
        notificationAggregate: { code: 'no_recipients' },
      }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('homework_updated_no_recipients'));
  });

  it('resets homework editor state and operation key when switching updates', async () => {
    const user = userEvent.setup();
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({
          ok: true,
          storage: { status: 'updated', revision: { id: 'revision' } },
          notificationAggregate: null,
        });
      }),
    );
    const onSaved = vi.fn(async () => undefined);
    const view = render(
      <I18nextProvider i18n={i18n}>
        <HomeworkEditor
          key="first"
          update={{ id: 'first', student_id: 'student-a', class_id: 'class-a', homework: 'First' }}
          onCancel={vi.fn()}
          onSaved={onSaved}
        />
      </I18nextProvider>,
    );
    const firstField = screen.getByLabelText('Homework / current assignment');
    await user.clear(firstField);
    await user.type(firstField, 'Changed first');
    await user.click(screen.getByRole('checkbox', { name: 'Notify guardians about this change' }));

    view.rerender(
      <I18nextProvider i18n={i18n}>
        <HomeworkEditor
          key="second"
          update={{
            id: 'second',
            student_id: 'student-a',
            class_id: 'class-a',
            homework: 'Second',
          }}
          onCancel={vi.fn()}
          onSaved={onSaved}
        />
      </I18nextProvider>,
    );
    expect(screen.getByLabelText('Homework / current assignment')).toHaveValue('Second');
    expect(
      screen.getByRole('checkbox', { name: 'Notify guardians about this change' }),
    ).not.toBeChecked();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    const secondKey = bodies[0].operationKey;

    view.rerender(
      <I18nextProvider i18n={i18n}>
        <HomeworkEditor
          key="third"
          update={{ id: 'third', student_id: 'student-a', class_id: 'class-a', homework: 'Third' }}
          onCancel={vi.fn()}
          onSaved={onSaved}
        />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1].operationKey).not.toBe(secondKey);
  });
});

describe('Pilot first-use and Families workflows', () => {
  const emptySetup = {
    ok: true,
    teachers: [],
    students: [],
    guardians: [],
    assignments: [],
    enrollments: [],
    guardianLinks: [],
  };
  beforeEach(() => {
    void i18n.changeLanguage('en');
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('scrollTo', vi.fn());
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
  });

  it.each([
    [ClassesPage, 'No classes yet.', 'Create class', 'Name'],
    [StudentsPage, 'No students yet.', 'Create student', 'Display name'],
  ])('focuses the creation form from a first-use state', async (Page, empty, action, field) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        Response.json(String(input).endsWith('/classes') ? { ok: true, classes: [] } : emptySetup),
      ),
    );
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <Page />
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(await screen.findByText(new RegExp(empty))).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: action }).at(-1)!);
    expect(screen.getByLabelText(field)).toHaveFocus();
  });

  it('shows Families loading and English and Turkish empty states', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((done) => (resolve = done))),
    );
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <FamiliesPage />
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    resolve(Response.json(emptySetup));
    expect(await screen.findByText(/No guardian contacts yet/)).toBeInTheDocument();
    await i18n.changeLanguage('tr');
    expect(await screen.findByText(/Henüz veli iletişim bilgisi yok/)).toBeInTheDocument();
  });

  it('creates and edits guardians and displays linked students', async () => {
    const setup = {
      ...emptySetup,
      students: [{ id: 'student-a', display_name: 'Fictional Student' }],
      guardians: [
        {
          id: 'guardian-a',
          name: 'Fictional Guardian',
          email: 'guardian@example.com',
          active: 1,
          preferred_locale: 'en',
        },
      ],
      guardianLinks: [
        {
          id: 'link-a',
          guardian_id: 'guardian-a',
          student_id: 'student-a',
          receive_notifications: 1,
        },
      ],
    };
    const saves: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          saves.push(JSON.parse(String(init.body)) as Record<string, unknown>);
          return Response.json({ ok: true, id: 'guardian-a' });
        }
        return Response.json(setup);
      }),
    );
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <FamiliesPage />
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(
      await screen.findByText(
        (_content, element) =>
          element?.tagName === 'SPAN' && !!element.textContent?.includes('Fictional Student'),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/enabled/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage on student' })).toHaveAttribute(
      'href',
      '/app/students/student-a',
    );
    await user.type(screen.getByLabelText('Name'), 'New Guardian');
    await user.type(screen.getByLabelText('Email'), 'new.guardian@example.com');
    await user.selectOptions(screen.getByLabelText('Preferred language'), 'tr');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(saves.at(-1)).toMatchObject({
        name: 'New Guardian',
        email: 'new.guardian@example.com',
        preferred_locale: 'tr',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Updated Guardian');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(saves.at(-1)).toMatchObject({ id: 'guardian-a', name: 'Updated Guardian' }),
    );
  });

  it.each([false, true])(
    'handles unlink outcome and duplicate clicks (failure=%s)',
    async (failure) => {
      let deletes = 0;
      let links = [
        {
          id: 'link-a',
          guardian_id: 'guardian-a',
          student_id: 'student-a',
          receive_notifications: 1,
        },
      ];
      let release!: () => void;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
          if (init?.method === 'DELETE') {
            deletes += 1;
            await new Promise<void>((resolve) => (release = resolve));
            if (failure) return Response.json({ error: { message: 'safe' } }, { status: 500 });
            links = [];
            return Response.json({ ok: true });
          }
          return Response.json({
            ...emptySetup,
            students: [{ id: 'student-a', display_name: 'Fictional Student' }],
            guardians: [
              { id: 'guardian-a', name: 'Guardian', email: 'guardian@example.com', active: 1 },
            ],
            guardianLinks: links,
          });
        }),
      );
      const user = userEvent.setup();
      render(
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <FamiliesPage />
          </MemoryRouter>
        </I18nextProvider>,
      );
      const unlink = await screen.findByRole('button', { name: 'Unlink from student' });
      await user.click(unlink);
      await user.click(unlink);
      expect(deletes).toBe(1);
      release();
      expect(
        await screen.findByText(failure ? /could not be removed/ : 'Guardian link removed.'),
      ).toBeInTheDocument();
      if (!failure)
        expect(
          screen.queryByRole('button', { name: 'Unlink from student' }),
        ).not.toBeInTheDocument();
    },
  );

  it('reports a verification error when DELETE succeeds but stored-state reload fails', async () => {
    let deletes = 0;
    let setupRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          deletes += 1;
          return Response.json({ ok: true });
        }
        setupRequests += 1;
        if (setupRequests > 1)
          return Response.json({ error: { message: 'safe' } }, { status: 500 });
        return Response.json({
          ...emptySetup,
          students: [{ id: 'student-a', display_name: 'Fictional Student' }],
          guardians: [
            { id: 'guardian-a', name: 'Guardian', email: 'guardian@example.com', active: 1 },
          ],
          guardianLinks: [
            {
              id: 'link-a',
              guardian_id: 'guardian-a',
              student_id: 'student-a',
              receive_notifications: 1,
            },
          ],
        });
      }),
    );
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <FamiliesPage />
        </MemoryRouter>
      </I18nextProvider>,
    );
    await user.click(await screen.findByRole('button', { name: 'Unlink from student' }));
    expect(
      await screen.findByText(
        /removal was submitted, but the updated stored state could not be loaded/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Guardian link removed.')).not.toBeInTheDocument();
    expect(deletes).toBe(1);
    expect(setupRequests).toBe(2);
    expect(screen.getByRole('button', { name: 'Unlink from student' })).toBeEnabled();
  });
});
