import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { SessionProvider, useSession } from '../../../src/features/auth/SessionProvider';
import { ProtectedRoute } from '../../../src/features/auth/ProtectedRoute';
import { visibleNavigation } from '../../../src/app/navigation';
import { i18n, LANGUAGE_KEY } from '../../../src/i18n';
import { Dialog, Button, FormField, Input } from '../../../src/components/ui';
import { isUiPreviewEnabled, showcasePaths } from '../../../src/app/showcaseGate';

function Probe() {
  const { status, session } = useSession();
  return (
    <div>
      <span>{status}</span>
      {session && <strong>Protected content</strong>}
    </div>
  );
}
function renderSession() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <SessionProvider>
          <Probe />
        </SessionProvider>
      </MemoryRouter>
    </I18nextProvider>,
  );
}
describe('session and protected routing foundation', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => vi.unstubAllGlobals());
  it('shows initial checking state without protected content, then unauthenticated', async () => {
    let resolve!: (v: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((r) => {
            resolve = r;
          }),
      ),
    );
    renderSession();
    expect(screen.getByText('checking')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    await waitFor(() => expect(resolve).toBeTypeOf('function'));
    resolve(new Response('{}', { status: 401 }));
    await screen.findByText('unauthenticated');
  });
  it('restores an authenticated session and organizations', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: { id: 'u', email: 'staff@example.test' },
            activeOrganizationId: 'o',
            role: 'teacher',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            organizations: [
              { id: 'o', name: 'Fictional Center', slug: 'fictional', role: 'teacher' },
            ],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetch);
    renderSession();
    await screen.findByText('authenticated');
    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(localStorage.getItem('qurantrack-had-session')).toBe('true');
  });
  it('distinguishes revoked or expired sessions', async () => {
    localStorage.setItem('qurantrack-had-session', 'true');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    renderSession();
    await screen.findByText('expired');
  });
  it('distinguishes session service failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    renderSession();
    await screen.findByText('error');
  });
  it('does not render a protected child while checking', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <SessionProvider>
            <ProtectedRoute>
              <div>Secret dashboard</div>
            </ProtectedRoute>
          </SessionProvider>
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(screen.getByText(/checking your secure session/i)).toBeInTheDocument();
    expect(screen.queryByText('Secret dashboard')).not.toBeInTheDocument();
  });
});
describe('navigation, language and shared accessibility', () => {
  it('filters administrative routes using trusted session roles', () => {
    expect(visibleNavigation('teacher').map((x) => x.key)).not.toContain('settings');
    expect(visibleNavigation('organization_admin').map((x) => x.key)).toContain('settings');
  });
  it('does not configure development showcase routes in production', () => {
    expect(showcasePaths(false)).toEqual([]);
    expect(showcasePaths(true)).toContain('/ui-preview');
  });
  it.each([
    ['development', true, undefined, true],
    ['explicitly enabled', false, 'true', true],
    ['missing', false, undefined, false],
    ['disabled', false, 'false', false],
    ['invalid', false, 'TRUE', false],
  ])('handles the %s preview flag', (_case, development, flag, expected) => {
    expect(isUiPreviewEnabled(development, flag)).toBe(expected);
  });
  it('persists language choice and renders Turkish shared UI', async () => {
    await i18n.changeLanguage('tr');
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('tr');
    expect(i18n.t('common.save')).toBe('Önizlemeyi kaydet');
    expect(document.documentElement.lang).toBe('tr');
  });
  it('traps focus in an accessible Radix dialog and restores it', async () => {
    const user = userEvent.setup();
    render(
      <Dialog
        trigger={<Button>Open</Button>}
        title="Confirm"
        description="Fictional action"
        closeLabel="Close"
      >
        <Button>Inside</Button>
      </Dialog>,
    );
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    expect(screen.getByRole('button', { name: 'Inside' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it('associates form descriptions and validation errors', () => {
    render(
      <FormField id="name" label="Name" description="Helpful text" error="Required" required>
        <Input id="name" aria-describedby="name-description name-error" aria-invalid />
      </FormField>,
    );
    const input = screen.getByLabelText(/Name/);
    expect(input).toHaveAccessibleDescription('Helpful text Required');
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });
});
