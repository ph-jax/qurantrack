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
});
