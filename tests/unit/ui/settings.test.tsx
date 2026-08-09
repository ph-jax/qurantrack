import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { i18n } from '../../../src/i18n';
import { SettingsPage } from '../../../src/pages/SettingsPage';
import { OrganizationIdentity } from '../../../src/components/OrganizationIdentity';
import type { Role, Session } from '../../../src/features/auth/SessionProvider';
import { canEditSettings } from '../../../src/features/settings/types';
import { RoleProtectedRoute } from '../../../src/features/auth/RoleProtectedRoute';
import { administrativeRoles } from '../../../shared/roles';

const { prepareLogo, useSession } = vi.hoisted(() => ({
  prepareLogo: vi.fn(),
  useSession: vi.fn(),
}));
vi.mock('../../../src/features/settings/image', () => ({ prepareLogo }));
vi.mock('../../../src/features/auth/SessionProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/auth/SessionProvider')>()),
  useSession,
}));

const settings = {
  id: 'org-a',
  name: 'Organization A',
  primaryColor: '#0f766e',
  defaultLocale: 'en' as const,
  timezone: 'UTC',
  emailSenderName: 'Organization A',
  emailReplyTo: 'reply@example.test',
  emailSenderAlias: null,
  reportTitle: 'Progress report',
  missingUpdateDays: 14,
  guardianTokenLifetimeDays: 30,
  logoUrl: null,
  logoDataUrl: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function session(role: Role = 'organization_admin', organizationId = 'org-a'): Session {
  return {
    user: { id: 'user', email: 'staff@example.test' },
    activeOrganizationId: organizationId,
    role,
    organizations: [{ id: organizationId, name: organizationId, slug: organizationId, role }],
  };
}

function response(value = settings) {
  return new Response(JSON.stringify({ ok: true, settings: value }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function renderPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <SettingsPage />
    </I18nextProvider>,
  );
}

function renderGuardedPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <RoleProtectedRoute roles={administrativeRoles}>
          <SettingsPage />
        </RoleProtectedRoute>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('settings UI behavior', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    prepareLogo.mockReset();
    useSession.mockReturnValue({ session: session(), organizationSwitching: false });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
  });

  it('only enables mutations for administrator roles', () => {
    expect(canEditSettings('system_admin')).toBe(true);
    expect(canEditSettings('organization_admin')).toBe(true);
    expect(canEditSettings('teacher')).toBe(false);
    expect(canEditSettings('read_only')).toBe(false);
  });

  it.each(['system_admin', 'organization_admin'] as Role[])(
    'allows %s to open and read guarded Settings',
    async (role) => {
      useSession.mockReturnValue({ session: session(role), organizationSwitching: false });
      renderGuardedPage();
      expect(await screen.findByLabelText(/organization name/i)).toHaveValue('Organization A');
      expect(screen.getByRole('button', { name: /save settings/i })).toBeEnabled();
    },
  );

  it.each(['teacher', 'read_only'] as Role[])('denies %s direct Settings navigation', (role) => {
    useSession.mockReturnValue({ session: session(role), organizationSwitching: false });
    renderGuardedPage();
    expect(screen.getByText('You do not have permission to view this page.')).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each(['teacher', 'read_only'] as Role[])('renders %s settings read-only', async (role) => {
    useSession.mockReturnValue({ session: session(role), organizationSwitching: false });
    renderPage();
    expect(await screen.findByText(/do not have permission/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save settings/i })).toBeDisabled();
    expect(screen.getByLabelText(/organization name/i)).toBeDisabled();
  });

  it('visibly reports client image preparation failures', async () => {
    prepareLogo.mockRejectedValue(new Error('invalid image'));
    renderPage();
    const upload = await screen.findByLabelText(/upload logo/i);
    fireEvent.change(upload, {
      target: { files: [new File(['bad'], 'bad.svg', { type: 'image/svg+xml' })] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(/valid PNG, JPEG, or WebP/i);
  });

  it('clears a stale save success message as soon as the form is edited', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response({ ...settings, name: 'Saved' }));
    const user = userEvent.setup();
    renderPage();
    const name = await screen.findByLabelText(/organization name/i);
    await user.clear(name);
    await user.type(name, 'Saved');
    await user.click(screen.getByRole('button', { name: /save settings/i }));
    expect(await screen.findByText(/settings saved/i)).toBeInTheDocument();
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toMatchObject({
      organizationId: 'org-a',
      emailSenderAlias: null,
      logoUrl: null,
    });
    await user.type(name, ' again');
    expect(screen.queryByText(/settings saved/i)).not.toBeInTheDocument();
  });

  it('prevents duplicate save submissions while a request is pending', async () => {
    let resolveSave!: (value: Response) => void;
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(response()).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const user = userEvent.setup();
    renderPage();
    const save = await screen.findByRole('button', { name: /save settings/i });
    await user.click(save);
    expect(save).toBeDisabled();
    expect(screen.getByLabelText(/organization name/i)).toBeDisabled();
    await user.click(save);
    expect(fetch).toHaveBeenCalledTimes(2);
    resolveSave(response());
    expect(await screen.findByText(/settings saved/i)).toBeInTheDocument();
  });

  it('shows a specific stale-organization message for a 409 response', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'STALE_ORGANIZATION' } }), { status: 409 }),
      );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /save settings/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/active organization changed/i);
  });

  it('disables Save while an organization switch is pending', async () => {
    useSession.mockReturnValue({ session: session(), organizationSwitching: true });
    renderPage();
    expect(await screen.findByRole('button', { name: /save settings/i })).toBeDisabled();
  });

  it('reloads settings when the active organization changes', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response({ ...settings, id: 'org-b', name: 'Organization B' }));
    const view = renderPage();
    expect(await screen.findByLabelText(/organization name/i)).toHaveValue('Organization A');
    useSession.mockReturnValue({
      session: session('organization_admin', 'org-b'),
      organizationSwitching: false,
    });
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <SettingsPage />
      </I18nextProvider>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText(/organization name/i)).toHaveValue('Organization B'),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('organization logo recovery', () => {
  it('retries image rendering when the URL changes after an image error', async () => {
    const view = render(
      <OrganizationIdentity name="Example" logoUrl="https://example.test/one.png" />,
    );
    fireEvent.error(view.container.querySelector('img')!);
    expect(view.container.querySelector('img')).not.toBeInTheDocument();
    view.rerender(<OrganizationIdentity name="Example" logoUrl="https://example.test/two.png" />);
    await waitFor(() =>
      expect(view.container.querySelector('img')).toHaveAttribute(
        'src',
        'https://example.test/two.png',
      ),
    );
  });
});
