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
      id: 'queued',
      email: 'queued@example.test',
      role: 'teacher',
      expiresAt: '2999-01-01',
      acceptedAt: null,
      revokedAt: null,
      deliveryStatus: 'pending',
    },
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
const openInvite = async () =>
  userEvent.click(await screen.findByRole('button', { name: 'Invite Staff' }));
const openManualTeacher = async () =>
  userEvent.click(await screen.findByRole('button', { name: 'Add Teacher Manually' }));
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
  it('uses readable secondary text and separates all email states from lifecycle state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)));
    renderStaff();
    expect(
      await screen.findByText('Manage staff access for the current organization.'),
    ).toHaveClass('text-text-secondary');
    expect(screen.getAllByText('Invitation state: Pending')).toHaveLength(2);
    expect(screen.getByText('Invitation state: Accepted')).toBeInTheDocument();
    expect(screen.getByText('Email submission: Pending — not yet submitted')).toBeInTheDocument();
    expect(screen.getByText('Email submission: Submitted to email service')).toBeInTheDocument();
    expect(screen.getByText('Email submission: Failed — resend available')).toBeInTheDocument();
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
    await openInvite();
    const input = await screen.findByLabelText('Email address');
    await userEvent.type(input, 'new@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
    expect(await screen.findByText(/Email delivery failed/)).toBeInTheDocument();
    expect(input).toHaveValue('new@example.test');
    expect(screen.getByText('pending@example.test')).toBeInTheDocument();
    expect(screen.getByText('Email submission: Failed — resend available')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getAllByRole('button', { name: 'Resend' }).length).toBeGreaterThan(0);
  });
  it('keeps manual teacher creation separate, fixed-role, and validates password matching locally', async () => {
    const fetch = vi.fn().mockResolvedValue(response(data));
    vi.stubGlobal('fetch', fetch);
    renderStaff();
    await screen.findByText('Teacher');
    expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
    await openManualTeacher();
    expect(screen.getByRole('heading', { name: 'Add Teacher Manually' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Role')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Display name'), 'New Teacher');
    await userEvent.type(screen.getByLabelText('Teacher email address'), 'new@example.test');
    await userEvent.type(screen.getByLabelText('Initial password'), 'password1');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'password2');
    await userEvent.click(screen.getByRole('button', { name: 'Create Teacher' }));
    expect(await screen.findByText('The passwords do not match.')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('submits once, reloads before success, shows the active teacher, and clears secrets', async () => {
    const refreshed = {
      ...data,
      members: [
        ...data.members,
        {
          id: 'new',
          displayName: 'New Teacher',
          email: 'new@example.test',
          role: 'teacher',
          active: 1,
          isSelf: 0,
        },
      ],
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(data))
      .mockResolvedValueOnce(
        response({ ok: true, teacher: { membershipId: 'new', role: 'teacher' } }, 201),
      )
      .mockResolvedValueOnce(response(refreshed));
    vi.stubGlobal('fetch', fetch);
    renderStaff();
    await screen.findByText('Teacher');
    await openManualTeacher();
    const name = screen.getByLabelText('Display name');
    const email = screen.getByLabelText('Teacher email address');
    const password = screen.getByLabelText('Initial password');
    const confirmation = screen.getByLabelText('Confirm password');
    await userEvent.type(name, 'New Teacher');
    await userEvent.type(email, ' NEW@EXAMPLE.TEST ');
    await userEvent.type(password, 'password1');
    await userEvent.type(confirmation, 'password1');
    await userEvent.click(screen.getByRole('button', { name: 'Create Teacher' }));
    expect(
      await screen.findByText('Teacher created and verified in the active staff list.'),
    ).toBeInTheDocument();
    expect(screen.getByText('new@example.test')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toMatchObject({
      email: 'new@example.test',
    });
    expect(name).toHaveValue('');
    expect(email).toHaveValue('');
    expect(password).toHaveValue('');
    expect(confirmation).toHaveValue('');
  });
  it.each([
    ['missing', data],
    [
      'inconsistent',
      {
        ...data,
        members: [
          ...data.members,
          {
            id: 'created',
            displayName: 'New',
            email: 'wrong@example.test',
            role: 'teacher',
            active: 1,
            isSelf: 0,
          },
        ],
      },
    ],
  ])('does not claim verification for a %s refreshed membership', async (_case, refreshed) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response(data))
        .mockResolvedValueOnce(response({ ok: true, teacher: { membershipId: 'created' } }, 201))
        .mockResolvedValueOnce(response(refreshed)),
    );
    renderStaff();
    await screen.findByText('Teacher');
    await openManualTeacher();
    await userEvent.type(screen.getByLabelText('Display name'), 'New');
    await userEvent.type(screen.getByLabelText('Teacher email address'), 'new@example.test');
    await userEvent.type(screen.getByLabelText('Initial password'), 'password1');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'password1');
    await userEvent.click(screen.getByRole('button', { name: 'Create Teacher' }));
    expect(await screen.findByText(/updated staff list could not be verified/)).toBeInTheDocument();
    expect(
      screen.queryByText('Teacher created and verified in the active staff list.'),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Initial password')).toHaveValue('password1');
    expect(screen.getByRole('button', { name: 'Create Teacher' })).toBeEnabled();
  });
  it('reports API and post-creation reload failures without false success or stuck controls', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(data))
      .mockResolvedValueOnce(response({ error: { code: 'GENERAL' } }, 500));
    vi.stubGlobal('fetch', fetch);
    renderStaff();
    await screen.findByText('Teacher');
    await openManualTeacher();
    const fill = async () => {
      await userEvent.clear(screen.getByLabelText('Display name'));
      await userEvent.type(screen.getByLabelText('Display name'), 'New');
      await userEvent.clear(screen.getByLabelText('Teacher email address'));
      await userEvent.type(screen.getByLabelText('Teacher email address'), 'new@example.test');
      await userEvent.clear(screen.getByLabelText('Initial password'));
      await userEvent.type(screen.getByLabelText('Initial password'), 'password1');
      await userEvent.clear(screen.getByLabelText('Confirm password'));
      await userEvent.type(screen.getByLabelText('Confirm password'), 'password1');
    };
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Create Teacher' }));
    expect(await screen.findByText('The change could not be completed.')).toBeInTheDocument();
    expect(
      screen.queryByText('Teacher created and verified in the active staff list.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Teacher' })).toBeEnabled();
    fetch
      .mockResolvedValueOnce(response({ ok: true, teacher: { membershipId: 'created' } }, 201))
      .mockRejectedValueOnce(new Error('reload'));
    await userEvent.click(screen.getByRole('button', { name: 'Create Teacher' }));
    expect(await screen.findByText(/updated staff list could not be verified/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Teacher' })).toBeEnabled();
  });
  it('shows success, empty states, and disables controls while switching', async () => {
    sessionState.switching = true;
    const fetch = vi.fn().mockResolvedValue(response({ members: [], invitations: [] }));
    vi.stubGlobal('fetch', fetch);
    renderStaff();
    expect(await screen.findByText('No matching members.')).toBeInTheDocument();
    expect(screen.getByText('No matching invitations.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite Staff' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add Teacher Manually' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Send invitation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Teacher' })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledOnce();
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
      expect(screen.getByText('You do not have permission to view this page.')).toBeInTheDocument();
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
  it('shows natural Turkish lifecycle and email submission labels', async () => {
    await i18n.changeLanguage('tr');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)));
    renderStaff();
    expect(await screen.findAllByText('Davet durumu: Bekliyor')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Öğretmeni Manuel Olarak Ekle' }));
    expect(
      screen.getByRole('heading', { name: 'Öğretmeni Manuel Olarak Ekle' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('İlk parola')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByText('Davet durumu: Kabul edildi')).toBeInTheDocument();
    expect(
      screen.getByText('E-posta gönderimi: Bekliyor — henüz gönderilmedi'),
    ).toBeInTheDocument();
    expect(screen.getByText('E-posta gönderimi: E-posta hizmetine gönderildi')).toBeInTheDocument();
    expect(
      screen.getByText('E-posta gönderimi: Başarısız — yeniden gönderilebilir'),
    ).toBeInTheDocument();
  });
});
