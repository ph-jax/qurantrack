import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateTurnstile } from '../../../worker/auth/turnstile';

describe('Turnstile validation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rejects accidental local bypass in production', async () => {
    await expect(
      validateTurnstile(
        {
          ENVIRONMENT: 'production',
          TURNSTILE_LOCAL_BYPASS: 'true',
          TURNSTILE_SECRET_KEY: 'secret',
        } as never,
        'local-dev-bypass-token',
      ),
    ).rejects.toThrow('cannot be enabled in production');
  });

  it('does not accept the local bypass token in production server verification', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ success: false })),
    );
    await expect(
      validateTurnstile(
        {
          ENVIRONMENT: 'production',
          TURNSTILE_LOCAL_BYPASS: 'false',
          TURNSTILE_SECRET_KEY: 'secret',
        } as never,
        'local-dev-bypass-token',
      ),
    ).resolves.toBe(false);
  });
});
