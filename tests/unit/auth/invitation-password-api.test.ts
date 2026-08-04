import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inspectInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
}));

vi.mock('../../../worker/organizations/memberships', async (original) => ({
  ...(await original<typeof import('../../../worker/organizations/memberships')>()),
  inspectInvitation: mocks.inspectInvitation,
  acceptInvitation: mocks.acceptInvitation,
}));

import app from '../../../worker/index';

const token = 'a'.repeat(43);
const env = { DB: {} } as never;

describe('invitation password API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inspectInvitation.mockResolvedValue({
      organizationName: 'Org',
      locale: 'en',
      role: 'teacher',
      state: 'pending',
      requiresDisplayName: true,
      requiresPassword: true,
    });
  });

  it.each([
    ['PASSWORD_TOO_SHORT', 'Password must contain at least 8 characters.'],
    ['PASSWORD_TOO_LONG', 'Password cannot exceed 128 characters.'],
    ['PASSWORD_EQUALS_EMAIL', 'Password cannot be the same as your email address.'],
  ])('returns exact code and message for %s', async (code, message) => {
    mocks.acceptInvitation.mockResolvedValue({ error: code });
    const response = await app.request(
      'https://app.test/api/v1/invitations/accept',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          displayName: 'New Staff',
          password: 'valid client password',
          passwordConfirmation: 'valid client password',
        }),
      },
      env,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code, message } });
  });

  it('returns a safe correlated 500 and logs an invitation hashing failure', async () => {
    const failure = Object.assign(new Error('Pbkdf2 failed: secret runtime details'), {
      name: 'NotSupportedError',
    });
    mocks.acceptInvitation.mockRejectedValue(failure);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await app.request(
      'https://app.test/api/v1/invitations/accept',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          displayName: 'New Staff',
          password: 'valid client password',
          passwordConfirmation: 'valid client password',
        }),
      },
      env,
    );
    const json = (await response.json()) as { requestId: string };
    expect(response.status).toBe(500);
    expect(JSON.stringify(json)).not.toContain('Pbkdf2');
    expect(logged).toHaveBeenCalledWith(
      'Unexpected request failure',
      expect.objectContaining({ requestId: json.requestId, error: failure }),
    );
    logged.mockRestore();
  });
});
