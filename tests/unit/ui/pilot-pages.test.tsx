import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassesPage, ProgressForm } from '../../../src/pages/PilotPages';
import { pilotResultPresentation } from '../../../src/features/pilot/results';
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
      vi.fn(async () =>
        fail
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
    expect(pilotResultPresentation('notification_preparation_failed').tone).toBe('error');
  });

  it('keeps a successful result visible after the editable form remounts', async () => {
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <ResultHarness />
      </I18nextProvider>,
    );
    await user.selectOptions(screen.getByLabelText('Lesson'), 'lesson-a');
    await user.click(screen.getByRole('button', { name: 'Publish & notify guardians' }));
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
    expect(await screen.findByTestId('result')).toHaveAttribute('data-tone', 'error');
    expect(screen.getByLabelText('Teacher comment')).toHaveValue('Keep this comment');
  });
});
