import type { Context } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../../types/env';
import { buildSessionCookie, readCookie } from '../../auth/cookies';
import { SESSION_COOKIE } from '../../auth/config';
import { validateSessionForRecovery } from '../../auth/service';
import {
  acceptInvitation,
  ASSIGNABLE_ROLES,
  createInvitation,
  inspectInvitation,
  listStaff,
  resendInvitation,
  revokeInvitation,
  updateMembership,
} from '../../organizations/memberships';

type Ctx = Context<{ Bindings: Env; Variables: Variables }>;
const role = z.enum(ASSIGNABLE_ROLES);
const invite = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.trim().toLowerCase()),
  role,
  expectedOrganizationId: z.string().min(1),
});
const update = z
  .object({
    role: role.optional(),
    active: z.boolean().optional(),
    expectedOrganizationId: z.string().min(1),
  })
  .refine((v) => v.role !== undefined || v.active !== undefined);
const mutationContext = z.object({ expectedOrganizationId: z.string().min(1) });
const token = z.object({ token: z.string().min(40).max(100) });
const failure = (c: Ctx, code: string, message: string, status: 400 | 403 | 404 | 409 | 502) =>
  c.json({ ok: false, error: { code, message } }, status);
const stale = (c: Ctx, expectedOrganizationId: string) =>
  expectedOrganizationId !== c.get('auth').organizationId
    ? failure(
        c,
        'STALE_ORGANIZATION',
        'The active organization changed. Reload and try again.',
        409,
      )
    : null;

export async function staffList(c: Ctx) {
  return c.json({ ok: true, ...(await listStaff(c.env, c.get('auth'))) });
}
export async function invitationCreate(c: Ctx) {
  const parsed = invite.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return failure(c, 'BAD_REQUEST', 'Enter a valid email and role.', 400);
  const staleResponse = stale(c, parsed.data.expectedOrganizationId);
  if (staleResponse) return staleResponse;
  const result = await createInvitation(
    c.env,
    c.get('auth'),
    parsed.data.email,
    parsed.data.role,
    c.get('requestId'),
  );
  if ('conflict' in result)
    return failure(c, 'CONFLICT', 'A membership or pending invitation already exists.', 409);
  if ('deliveryFailed' in result)
    return failure(
      c,
      'DELIVERY_FAILED',
      'Invitation saved, but email delivery failed. Retry by resending.',
      502,
    );
  return c.json({ ok: true }, 201);
}
export async function invitationResend(c: Ctx) {
  const parsed = mutationContext.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return failure(c, 'BAD_REQUEST', 'Invalid organization context.', 400);
  const staleResponse = stale(c, parsed.data.expectedOrganizationId);
  if (staleResponse) return staleResponse;
  const result = await resendInvitation(
    c.env,
    c.get('auth'),
    c.req.param('id')!,
    c.get('requestId'),
  );
  if ('missing' in result) return failure(c, 'NOT_FOUND', 'Pending invitation not found.', 404);
  if ('deliveryFailed' in result)
    return failure(
      c,
      'DELIVERY_FAILED',
      'The new link was saved, but email delivery failed. Retry again.',
      502,
    );
  return c.json({ ok: true });
}
export async function invitationRevoke(c: Ctx) {
  const parsed = mutationContext.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return failure(c, 'BAD_REQUEST', 'Invalid organization context.', 400);
  const staleResponse = stale(c, parsed.data.expectedOrganizationId);
  if (staleResponse) return staleResponse;
  return (await revokeInvitation(c.env, c.get('auth'), c.req.param('id')!, c.get('requestId')))
    ? c.json({ ok: true })
    : failure(c, 'NOT_FOUND', 'Pending invitation not found.', 404);
}
export async function membershipUpdate(c: Ctx) {
  const parsed = update.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return failure(c, 'BAD_REQUEST', 'Invalid membership update.', 400);
  const staleResponse = stale(c, parsed.data.expectedOrganizationId);
  if (staleResponse) return staleResponse;
  const result = await updateMembership(
    c.env,
    c.get('auth'),
    c.req.param('id')!,
    parsed.data,
    c.get('requestId'),
  );
  if (result === 'ok') return c.json({ ok: true });
  if (result === 'missing') return failure(c, 'NOT_FOUND', 'Membership not found.', 404);
  if (result === 'last_admin')
    return failure(c, 'LAST_ADMIN', 'The organization must retain an active administrator.', 409);
  return failure(
    c,
    result === 'self' ? 'SELF_CHANGE' : 'FORBIDDEN',
    result === 'self'
      ? 'You cannot change your own membership.'
      : 'This membership cannot be managed.',
    403,
  );
}
export async function invitationInspect(c: Ctx) {
  const parsed = token.safeParse({ token: c.req.query('token') });
  const value = parsed.success ? await inspectInvitation(c.env, parsed.data.token) : null;
  return value
    ? c.json({ ok: true, invitation: value })
    : failure(c, 'INVALID_INVITATION', 'This invitation is invalid or no longer usable.', 404);
}
export async function invitationAccept(c: Ctx) {
  const parsed = token.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return failure(c, 'INVALID_INVITATION', 'This invitation is invalid or no longer usable.', 400);
  const inspected = await inspectInvitation(c.env, parsed.data.token);
  if (!inspected || inspected.state !== 'pending') {
    const code =
      inspected?.state === 'used'
        ? 'INVITATION_USED'
        : inspected?.state === 'expired'
          ? 'INVITATION_EXPIRED'
          : inspected?.state === 'revoked'
            ? 'INVITATION_REVOKED'
            : 'INVALID_INVITATION';
    return failure(c, code, 'This invitation is invalid or no longer usable.', 400);
  }
  const current = readCookie(c.req.header('cookie'), SESSION_COOKIE);
  let priorSessionId: string | undefined;
  if (current) {
    const auth = await validateSessionForRecovery(c.env, current);
    priorSessionId = auth?.sessionId;
  }
  const session = await acceptInvitation(c.env, parsed.data.token, c.req.raw, priorSessionId);
  if (!session)
    return failure(c, 'INVALID_INVITATION', 'This invitation is invalid or no longer usable.', 400);
  c.header('Set-Cookie', buildSessionCookie(session.sessionToken, session.expires, c.env));
  return c.json({ ok: true });
}
