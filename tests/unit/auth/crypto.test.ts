import { describe, expect, it } from 'vitest';
import {
  hashSecret,
  hmacSha256Base64Url,
  randomToken,
  timingSafeEqual,
} from '../../../shared/auth/crypto';
import { relaySigningPayload, signRelayRequest } from '../../../worker/email/relay';

describe('auth crypto', () => {
  it('creates high-entropy tokens and stores only hashes', async () => {
    const token = randomToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    const hash = await hashSecret(token, 'pepper');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
  });
  it('signs relay requests with timestamp and nonce payloads', async () => {
    const body = JSON.stringify({ to: 'staff@example.com' });
    const signature = await signRelayRequest('secret', '1784851200', 'nonce-1', body);
    const expected = await hmacSha256Base64Url(
      'secret',
      relaySigningPayload('1784851200', 'nonce-1', body),
    );
    expect(await timingSafeEqual(signature, expected)).toBe(true);
    expect(
      await timingSafeEqual(
        signature,
        await signRelayRequest('secret', '1784851201', 'nonce-1', body),
      ),
    ).toBe(false);
  });
});
