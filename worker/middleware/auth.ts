import { createMiddleware } from 'hono/factory';
import type { Env, Variables } from '../types/env';
import { SESSION_COOKIE } from '../auth/config';
import { readCookie } from '../auth/cookies';
import { validateSession, type Role } from '../auth/service';

export const noStore = createMiddleware<{ Bindings: Env; Variables: Variables }>(
  async (c, next) => {
    await next();
    if (c.req.path.startsWith('/api/v1/auth') || c.req.path.startsWith('/api/v1/me'))
      c.header('Cache-Control', 'no-store');
  },
);

export function requireAuth(roles?: Role[]) {
  return createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
    const token = readCookie(c.req.header('cookie'), SESSION_COOKIE);
    if (!token)
      return c.json(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Sign in required.' } },
        401,
      );
    const auth = await validateSession(c.env, token);
    if (!auth)
      return c.json(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Session expired.' } },
        401,
      );
    if (roles && !roles.includes(auth.role))
      return c.json(
        { ok: false, error: { code: 'FORBIDDEN', message: 'Insufficient role.' } },
        403,
      );
    c.set('auth', auth);
    await next();
  });
}
