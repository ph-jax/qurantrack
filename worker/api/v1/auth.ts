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
