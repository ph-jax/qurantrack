import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { InvitationPage } from '../../../src/features/auth/InvitationPage';
import { i18n } from '../../../src/i18n';
const renderPage = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/invitations/accept?token=' + 'a'.repeat(43)]}>
        <InvitationPage />
      </MemoryRouter>
    </I18nextProvider>,
  );
describe('public invitation states', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => vi.unstubAllGlobals());
  it('keeps a network failure distinct and offers retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    renderPage();
    expect(await screen.findByText(/could not be reached/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeEnabled();
  });
  it('localizes from the inviting organization and re-enables acceptance after a network failure', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            invitation: {
              organizationName: 'Test Kurumu',
              locale: 'tr',
              role: 'teacher',
              state: 'pending',
            },
          }),
          { status: 200 },
        ),
      )
      .mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetch);
    renderPage();
    const button = await screen.findByRole('button', { name: 'Daveti kabul et' });
    expect(screen.getByText(/Test Kurumu kurumuna Öğretmen \/ Mentor/)).toBeInTheDocument();
    await userEvent.click(button);
    await screen.findByText(/ulaşılamadı/);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeEnabled());
  });
  it.each([
    ['en', 'INVITATION_EXPIRED', /has expired/],
    ['en', 'INVITATION_REVOKED', /was revoked/],
    ['tr', 'INVITATION_EXPIRED', /süresi dolmuş/],
    ['tr', 'INVITATION_REVOKED', /iptal edilmiş/],
  ])('maps acceptance %s errors in %s', async (locale, code, message) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              invitation: { organizationName: 'Org', locale, role: 'teacher', state: 'pending' },
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code } }), { status: 400 })),
    );
    renderPage();
    await userEvent.click(
      await screen.findByRole('button', {
        name: locale === 'tr' ? 'Daveti kabul et' : 'Accept invitation',
      }),
    );
    expect(await screen.findByText(message)).toBeInTheDocument();
  });
  it('requires display name and matching visible password confirmation for a new user', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            invitation: {
              organizationName: 'Org',
              locale: 'en',
              role: 'teacher',
              state: 'pending',
              requiresDisplayName: true,
              requiresPassword: true,
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    renderPage();
    await userEvent.type(await screen.findByLabelText(/display name/i), 'New Staff');
    const password = screen.getByLabelText(/^New password/);
    await userEvent.type(password, 'a secure invitation password');
    await userEvent.type(
      screen.getByLabelText(/^Confirm new password/),
      'different password value',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The passwords do not match.');
    expect(fetch).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getAllByRole('button', { name: 'Show password' })[0]);
    expect(password).toHaveAttribute('type', 'text');
  });
  it('does not render password setup for an existing credential', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            invitation: {
              organizationName: 'Org',
              locale: 'en',
              role: 'teacher',
              state: 'pending',
              requiresDisplayName: false,
              requiresPassword: false,
            },
          }),
          { status: 200 },
        ),
      ),
    );
    renderPage();
    await screen.findByRole('button', { name: 'Accept invitation' });
    expect(screen.queryByLabelText(/^New password/)).not.toBeInTheDocument();
  });
});
