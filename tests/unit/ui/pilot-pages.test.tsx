import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassesPage } from '../../../src/pages/PilotPages';
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
