import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
const sessionState = vi.hoisted(() => ({ role: 'organization_admin', switching: false }));
vi.mock('../../../src/features/auth/SessionProvider', async (original) => ({
  ...(await original<typeof import('../../../src/features/auth/SessionProvider')>()),
  useSession: () => ({
    session: {
      user: { id: 'admin', email: 'admin@example.test' },
      activeOrganizationId: 'org-a',
      role: sessionState.role,
      organizations: [],
    },
    organizationSwitching: sessionState.switching,
  }),
}));
import { StaffPage } from '../../../src/pages/StaffPage';
import { RoleProtectedRoute } from '../../../src/features/auth/RoleProtectedRoute';
import { i18n } from '../../../src/i18n';
const data = {
  members: [
    {
      id: 'self',
      displayName: 'Admin',
      email: 'admin@example.test',
      role: 'organization_admin',
      active: 1,
      isSelf: 1,
    },
    {
      id: 'teacher',
      displayName: 'Teacher',
      email: 'teacher@example.test',
      role: 'teacher',
      active: 1,
      isSelf: 0,
    },
    {
      id: 'inactive',
      displayName: 'Reader',
      email: 'reader@example.test',
      role: 'read_only',
      active: 0,
      isSelf: 0,
    },
  ],
  invitations: [
    {
      id: 'pending',
      email: 'pending@example.test',
      role: 'teacher',
      expiresAt: '2999-01-01',
      acceptedAt: null,
      revokedAt: null,
      deliveryStatus: 'failed',
    },
    {
      id: 'used',
      email: 'used@example.test',
      role: 'read_only',
      expiresAt: '2999-01-01',
      acceptedAt: '2026-01-01',
      revokedAt: null,
      deliveryStatus: 'sent',
    },
  ],
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const renderStaff = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <StaffPage />
    </I18nextProvider>,
  );
describe('Staff administration UI', () => {
  beforeEach(async () => {
    sessionState.role = 'organization_admin';
    sessionState.switching = false;
    await i18n.changeLanguage('en');
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
  });
  afterEach(() => vi.unstubAllGlobals());
  it('filters members by role/status and invitations by state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)));
    renderStaff();
    await screen.findByText('Teacher');
    await userEvent.selectOptions(screen.getByLabelText('Filter by role'), 'read_only');
    expect(screen.queryByText('Teacher')).not.toBeInTheDocument();
    expect(screen.getByText('Reader')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'active');
    expect(screen.queryByText('Reader')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Filter invitation state'), 'accepted');
    expect(screen.getByText('used@example.test')).toBeInTheDocument();
    expect(screen.queryByText('pending@example.test')).not.toBeInTheDocument();
  });
  it('reloads a failed delivery, retains email, and localizes the error', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(data))
      .mockResolvedValueOnce(
        response({ error: { code: 'DELIVERY_FAILED', message: 'English server message' } }, 502),
      )
      .mockResolvedValueOnce(response(data));
    vi.stubGlobal('fetch', fetch);
    renderStaff();
    const input = await screen.findByLabelText('Email address');
    await userEvent.type(input, 'new@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
    expect(await screen.findByText(/Email delivery failed/)).toBeInTheDocument();
    expect(input).toHaveValue('new@example.test');
    expect(screen.getByText('pending@example.test')).toBeInTheDocument();
  });
  it('shows success, empty states, and disables controls while switching', async () => {
    sessionState.switching = true;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ members: [], invitations: [] })));
    renderStaff();
    expect(await screen.findByText('No matching members.')).toBeInTheDocument();
    expect(screen.getByText('No matching invitations.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send invitation' })).toBeDisabled();
  });
  it('shows localized success after a completed membership mutation', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response(data))
        .mockResolvedValueOnce(response({ ok: true }))
        .mockResolvedValueOnce(response(data)),
    );
    renderStaff();
    await screen.findByText('Teacher');
    await userEvent.click(screen.getAllByRole('button', { name: 'Deactivate' })[0]);
    expect(await screen.findByText('Membership deactivated.')).toBeInTheDocument();
  });
  it.each([
    ['system_admin', true],
    ['organization_admin', true],
    ['teacher', false],
    ['read_only', false],
  ] as const)('protects the direct route for %s', async (role, allowed) => {
    sessionState.role = role;
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <RoleProtectedRoute roles={['system_admin', 'organization_admin']}>
            <div>staff-secret</div>
          </RoleProtectedRoute>
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(Boolean(screen.queryByText('staff-secret'))).toBe(allowed);
    if (!allowed)
      expect(screen.getByText('You do not have permission to manage staff.')).toBeInTheDocument();
  });
  it('maps stale errors in Turkish without exposing server English', async () => {
    await i18n.changeLanguage('tr');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(data))
      .mockResolvedValueOnce(
        response({ error: { code: 'STALE_ORGANIZATION', message: 'English server message' } }, 409),
      );
    vi.stubGlobal('fetch', fetch);
    renderStaff();
    await screen.findByText('Teacher');
    await userEvent.click(screen.getByRole('button', { name: 'Pasifleştir' }));
    expect(await screen.findByText(/Etkin kurum değişti/)).toBeInTheDocument();
    expect(screen.queryByText('English server message')).not.toBeInTheDocument();
  });
});
