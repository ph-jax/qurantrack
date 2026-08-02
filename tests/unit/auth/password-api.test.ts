import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  validateTurnstile: vi.fn(),
  passwordLogin: vi.fn(),
  hasPassword: vi.fn(),
  setPassword: vi.fn(),
  requestPasswordReset: vi.fn(),
  consumePasswordReset: vi.fn(),
  validateSession: vi.fn(),
}));
vi.mock('../../../worker/auth/turnstile', () => ({ validateTurnstile: mocks.validateTurnstile }));
vi.mock('../../../worker/auth/password-service', () => ({
  passwordLogin: mocks.passwordLogin,
  hasPassword: mocks.hasPassword,
  setPassword: mocks.setPassword,
  requestPasswordReset: mocks.requestPasswordReset,
  consumePasswordReset: mocks.consumePasswordReset,
}));
vi.mock('../../../worker/auth/service', async (original) => ({
  ...(await original<typeof import('../../../worker/auth/service')>()),
  validateSession: mocks.validateSession,
}));
import app from '../../../worker/index';
const env = { DB: {}, ENVIRONMENT: 'test' } as never;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(
    `https://app.test${path}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    },
    env,
  );

describe('password authentication API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateTurnstile.mockResolvedValue(true);
    mocks.passwordLogin.mockResolvedValue(null);
    mocks.validateSession.mockResolvedValue({
      userId: 'u',
      email: 'staff@example.test',
      organizationId: 'org',
      role: 'teacher',
      sessionId: 'old',
    });
  });
  it('uses one generic response for every service-level invalid credential result', async () => {
    for (const email of [
      'unknown@example.test',
      'passwordless@example.test',
      'inactive@example.test',
    ]) {
      const response = await post('/api/v1/auth/password/login', {
        email,
        password: 'some invalid password',
        turnstileToken: 'valid',
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
    }
  });
  it('sets the established secure cookie after success', async () => {
    mocks.passwordLogin.mockResolvedValue({
      sessionToken: 'opaque',
      expires: new Date('2999-01-01'),
    });
    const response = await post('/api/v1/auth/password/login', {
      email: 'staff@example.test',
      password: 'correct secure password',
      turnstileToken: 'valid',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).not.toContain('correct secure password');
  });
  it('rejects Turnstile without calling password verification', async () => {
    mocks.validateTurnstile.mockResolvedValue(false);
    const response = await post('/api/v1/auth/password/login', {
      email: 'staff@example.test',
      password: 'correct secure password',
      turnstileToken: 'invalid',
    });
    expect(response.status).toBe(400);
    expect(mocks.passwordLogin).not.toHaveBeenCalled();
  });
  it('accepts 128 Unicode code points even when they occupy 256 UTF-16 code units', async () => {
    mocks.passwordLogin.mockResolvedValue({
      sessionToken: 'opaque',
      expires: new Date('2999-01-01'),
    });
    const password = '🔐'.repeat(128);
    const response = await post('/api/v1/auth/password/login', {
      email: 'staff@example.test',
      password,
      turnstileToken: 'valid',
    });
    expect(response.status).toBe(200);
    expect(mocks.passwordLogin).toHaveBeenCalledWith(
      expect.anything(),
      'staff@example.test',
      password,
      undefined,
      expect.any(Request),
    );
  });
  it('requires authentication and same origin for password mutations', async () => {
    mocks.validateSession.mockResolvedValue(null);
    expect((await post('/api/v1/me/password', { newPassword: 'new secure password' })).status).toBe(
      401,
    );
    mocks.validateSession.mockResolvedValue({
      userId: 'u',
      email: 'staff@example.test',
      organizationId: 'org',
      role: 'teacher',
      sessionId: 'old',
    });
    expect(
      (
        await post(
          '/api/v1/me/password',
          { newPassword: 'new secure password' },
          { cookie: 'qurantrack_session=opaque', origin: 'https://evil.test' },
        )
      ).status,
    ).toBe(403);
  });
  it('keeps reset request generic when the relay/service fails', async () => {
    mocks.requestPasswordReset.mockRejectedValue(new Error('relay'));
    const response = await post('/api/v1/auth/password/reset/request', {
      email: 'staff@example.test',
      turnstileToken: 'valid',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      message: expect.stringMatching(/^If this email is eligible/),
    });
  });
});
