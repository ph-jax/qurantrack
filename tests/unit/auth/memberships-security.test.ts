import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(),
  createInvitation: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  updateMembership: vi.fn(),
  listStaff: vi.fn(),
}));
vi.mock('../../../worker/auth/service', async (original) => ({
  ...(await original<typeof import('../../../worker/auth/service')>()),
  validateSession: mocks.validateSession,
}));
vi.mock('../../../worker/organizations/memberships', async (original) => ({
  ...(await original<typeof import('../../../worker/organizations/memberships')>()),
  createInvitation: mocks.createInvitation,
  resendInvitation: mocks.resendInvitation,
  revokeInvitation: mocks.revokeInvitation,
  updateMembership: mocks.updateMembership,
  listStaff: mocks.listStaff,
}));
import app from '../../../worker/index';
const env = { DB: {} as D1Database };
const auth = (role: string, organizationId = 'org-a') =>
  mocks.validateSession.mockResolvedValue({
    userId: 'u1',
    email: 'admin@example.test',
    organizationId,
    role,
    sessionId: 's1',
  });
const send = (path: string, body: unknown, method = 'POST') =>
  app.request(
    path,
    {
      method,
      headers: { cookie: 'qurantrack_session=x', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    env,
  );
describe('membership administration behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createInvitation.mockResolvedValue({ ok: true });
    mocks.resendInvitation.mockResolvedValue({ ok: true });
    mocks.revokeInvitation.mockResolvedValue(true);
    mocks.updateMembership.mockResolvedValue('ok');
    mocks.listStaff.mockResolvedValue({ members: [], invitations: [] });
  });
  it('rejects unauthenticated, teacher, and read-only administration', async () => {
    mocks.validateSession.mockResolvedValue(null);
    expect(
      (
        await app.request(
          '/api/v1/organization/staff',
          { headers: { cookie: 'qurantrack_session=x' } },
          env,
        )
      ).status,
    ).toBe(401);
    for (const role of ['teacher', 'read_only']) {
      auth(role);
      expect(
        (
          await app.request(
            '/api/v1/organization/staff',
            { headers: { cookie: 'qurantrack_session=x' } },
            env,
          )
        ).status,
      ).toBe(403);
    }
  });
  it.each([
    [
      '/api/v1/organization/invitations',
      { email: 'staff@example.test', role: 'teacher', expectedOrganizationId: 'org-a' },
      'POST',
    ],
    ['/api/v1/organization/invitations/i1/resend', { expectedOrganizationId: 'org-a' }, 'POST'],
    ['/api/v1/organization/invitations/i1/revoke', { expectedOrganizationId: 'org-a' }, 'POST'],
    [
      '/api/v1/organization/memberships/m1',
      { active: false, expectedOrganizationId: 'org-a' },
      'PATCH',
    ],
  ])('rejects stale tenant context before mutation: %s', async (path, body, method) => {
    auth('organization_admin', 'org-b');
    const response = await send(path, body, method);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'STALE_ORGANIZATION' } });
    expect(mocks.createInvitation).not.toHaveBeenCalled();
    expect(mocks.resendInvitation).not.toHaveBeenCalled();
    expect(mocks.revokeInvitation).not.toHaveBeenCalled();
    expect(mocks.updateMembership).not.toHaveBeenCalled();
  });
  it('does not accept system_admin through invitation or membership input', async () => {
    auth('organization_admin');
    expect(
      (
        await send('/api/v1/organization/invitations', {
          email: 'x@example.test',
          role: 'system_admin',
          expectedOrganizationId: 'org-a',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send(
          '/api/v1/organization/memberships/m1',
          { role: 'system_admin', expectedOrganizationId: 'org-a' },
          'PATCH',
        )
      ).status,
    ).toBe(400);
  });
});
