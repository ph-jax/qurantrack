import { describe, expect, it } from 'vitest';
import { buildSessionCookie, clearSessionCookie, readCookie } from '../../../worker/auth/cookies';

describe('session cookies', () => {
  it('uses HttpOnly no-JS access attributes and Secure in production', () => {
    const cookie = buildSessionCookie('opaque', new Date('2026-01-01T00:00:00Z'), {
      ENVIRONMENT: 'production',
    } as never);
    expect(cookie).toContain('qurantrack_session=opaque');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(readCookie('x=1; qurantrack_session=opaque', 'qurantrack_session')).toBe('opaque');
    expect(clearSessionCookie({ ENVIRONMENT: 'local' } as never)).toContain(
      'Expires=Thu, 01 Jan 1970',
    );
  });
});
