import { z } from 'zod';
import type { Context } from 'hono';
import { buildSessionCookie, clearSessionCookie } from '../../auth/cookies';
import {
  consumeMagicLink,
  listOrganizations,
  requestMagicLink,
  revokeSession,
  switchOrganization,
} from '../../auth/service';
import { validateTurnstile } from '../../auth/turnstile';
import type { Env, Variables } from '../../types/env';
import { rateLimit } from '../../auth/rate-limit';

const requestSchema = z.object({
  email: z.email().trim().toLowerCase(),
  turnstileToken: z.string().min(1),
  organizationSlug: z.string().min(2).max(64).optional(),
});
const consumeSchema = z.object({ token: z.string().min(32) });
const switchSchema = z.object({ organizationId: z.string().min(1) });
const safe = {
  ok: true,
  message: 'If this email is eligible, a QuranTrack sign-in link will be sent.',
};

type Ctx = Context<{ Bindings: Env; Variables: Variables }>;
export async function requestLogin(c: Ctx) {
  const parsed = requestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(safe);
  const turnstileOk = await validateTurnstile(
    c.env,
    parsed.data.turnstileToken,
    c.req.header('cf-connecting-ip'),
  );
  if (!turnstileOk)
    return c.json(
      {
        ok: false,
        error: { code: 'TURNSTILE_FAILED', message: 'Please complete the anti-abuse check.' },
      },
      400,
    );
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  if (
    !(await rateLimit(c.env, 'magic_link_account', parsed.data.email, 5)) ||
    !(await rateLimit(c.env, 'magic_link_ip', ip, 25))
  )
    return c.json(safe);
  await requestMagicLink(c.env, parsed.data.email, parsed.data.organizationSlug, c.req.raw).catch(
    () => undefined,
  );
  return c.json(safe);
}
export async function consumeLogin(c: Ctx) {
  const parsed = consumeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json(
      {
        ok: false,
        error: { code: 'INVALID_LINK', message: 'This sign-in link is invalid or expired.' },
      },
      400,
    );
  const session = await consumeMagicLink(c.env, parsed.data.token, c.req.raw);
  if (!session)
    return c.json(
      {
        ok: false,
        error: { code: 'INVALID_LINK', message: 'This sign-in link is invalid or expired.' },
      },
      400,
    );
  c.header('Set-Cookie', buildSessionCookie(session.sessionToken, session.expires, c.env));
  return c.json({ ok: true });
}
export async function logout(c: Ctx) {
  await revokeSession(c.env, c.get('auth').sessionId);
  c.header('Set-Cookie', clearSessionCookie(c.env));
  return c.json({ ok: true });
}
export async function me(c: Ctx) {
  const auth = c.get('auth');
  return c.json({
    ok: true,
    user: { id: auth.userId, email: auth.email },
    activeOrganizationId: auth.organizationId,
    role: auth.role,
  });
}
export async function organizations(c: Ctx) {
  const auth = c.get('auth');
  const orgs = await listOrganizations(c.env, auth.userId);
  if (orgs.length === 0) {
    await revokeSession(c.env, auth.sessionId);
    c.header('Set-Cookie', clearSessionCookie(c.env));
    return c.json(
      {
        ok: false,
        error: {
          code: 'NO_ACTIVE_MEMBERSHIP',
          message: 'No active organization membership remains.',
        },
      },
      401,
    );
  }
  return c.json({
    ok: true,
    organizations: orgs.map((o) => ({
      id: o.organization_id,
      name: o.org_name,
      slug: o.org_slug,
      role: o.role,
    })),
  });
}
export async function switchOrg(c: Ctx) {
  const parsed = switchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json(
      { ok: false, error: { code: 'BAD_REQUEST', message: 'Invalid organization.' } },
      400,
    );
  const auth = c.get('auth');
  const ok = await switchOrganization(
    c.env,
    auth.userId,
    auth.sessionId,
    parsed.data.organizationId,
  );
  return ok
    ? c.json({ ok: true })
    : c.json(
        { ok: false, error: { code: 'FORBIDDEN', message: 'Organization is not available.' } },
        403,
      );
}

const passwordLoginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().max(128),
  turnstileToken: z.string().min(1),
  organizationSlug: z.string().min(2).max(64).optional(),
});
const passwordSetSchema = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: z.string().max(128),
});
const resetRequestSchema = z.object({
  email: z.email().trim().toLowerCase(),
  turnstileToken: z.string().min(1),
});
const resetConsumeSchema = z.object({
  token: z.string().min(32).max(100),
  newPassword: z.string().max(128),
});
const invalidCredentials = {
  ok: false,
  error: {
    code: 'INVALID_CREDENTIALS',
    message: 'The email or password is incorrect, or this account cannot sign in.',
  },
} as const;

export async function passwordLoginHandler(c: Ctx) {
  const parsed = passwordLoginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(invalidCredentials, 401);
  if (
    !(await validateTurnstile(c.env, parsed.data.turnstileToken, c.req.header('cf-connecting-ip')))
  )
    return c.json(
      {
        ok: false,
        error: { code: 'TURNSTILE_FAILED', message: 'Please complete the anti-abuse check.' },
      },
      400,
    );
  const { password, ...safeInput } = parsed.data;
  const session = await import('../../auth/password-service').then(({ passwordLogin }) =>
    passwordLogin(c.env, safeInput.email, password, safeInput.organizationSlug, c.req.raw),
  );
  if (!session) return c.json(invalidCredentials, 401);
  c.header('Set-Cookie', buildSessionCookie(session.sessionToken, session.expires, c.env));
  return c.json({ ok: true });
}
export async function authMethods(c: Ctx) {
  const { hasPassword } = await import('../../auth/password-service');
  return c.json({ ok: true, hasPassword: await hasPassword(c.env, c.get('auth').userId) });
}
function sameOrigin(c: Ctx) {
  const origin = c.req.header('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(c.req.url).origin;
  } catch {
    return false;
  }
}
export async function passwordSet(c: Ctx) {
  if (!sameOrigin(c))
    return c.json(
      { ok: false, error: { code: 'INVALID_ORIGIN', message: 'The request origin is invalid.' } },
      403,
    );
  const parsed = passwordSetSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json(
      {
        ok: false,
        error: {
          code: 'INVALID_PASSWORD',
          message: 'Choose a password between 15 and 128 characters.',
        },
      },
      400,
    );
  const result = await import('../../auth/password-service').then(({ setPassword }) =>
    setPassword(
      c.env,
      c.get('auth'),
      parsed.data.currentPassword,
      parsed.data.newPassword,
      c.req.raw,
    ),
  );
  if ('error' in result)
    return c.json(
      {
        ok: false,
        error: {
          code: result.error,
          message:
            result.error === 'INVALID_CURRENT_PASSWORD'
              ? 'The current password is incorrect.'
              : 'The password does not meet the requirements.',
        },
      },
      400,
    );
  c.header(
    'Set-Cookie',
    buildSessionCookie(result.session.sessionToken, result.session.expires, c.env),
  );
  return c.json({ ok: true, created: result.created });
}
const resetSafe = {
  ok: true,
  message: 'If this email is eligible, password reset instructions will be sent.',
};
export async function passwordResetRequest(c: Ctx) {
  const parsed = resetRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(resetSafe);
  if (
    !(await validateTurnstile(c.env, parsed.data.turnstileToken, c.req.header('cf-connecting-ip')))
  )
    return c.json(
      {
        ok: false,
        error: { code: 'TURNSTILE_FAILED', message: 'Please complete the anti-abuse check.' },
      },
      400,
    );
  await import('../../auth/password-service')
    .then(({ requestPasswordReset }) => requestPasswordReset(c.env, parsed.data.email, c.req.raw))
    .catch(() => undefined);
  return c.json(resetSafe);
}
export async function passwordResetConsume(c: Ctx) {
  const parsed = resetConsumeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json(
      {
        ok: false,
        error: {
          code: 'INVALID_RESET',
          message: 'This password reset link is invalid or expired.',
        },
      },
      400,
    );
  const result = await import('../../auth/password-service').then(({ consumePasswordReset }) =>
    consumePasswordReset(c.env, parsed.data.token, parsed.data.newPassword),
  );
  if (result !== 'OK')
    return c.json(
      {
        ok: false,
        error: {
          code: result,
          message:
            result === 'INVALID'
              ? 'This password reset link is invalid or expired.'
              : 'The password does not meet the requirements.',
        },
      },
      400,
    );
  c.header('Set-Cookie', clearSessionCookie(c.env));
  return c.json({ ok: true });
}
