import { z } from 'zod';
import type { Context } from 'hono';
import type { Env, Variables } from '../../types/env';
import { requireSecret } from '../../auth/config';
const schema = z.object({
  email: z.email().trim().toLowerCase(),
  displayName: z.string().min(1),
  organizationId: z.string().min(1),
  secret: z.string().min(16),
});
type Ctx = Context<{ Bindings: Env; Variables: Variables }>;
export async function bootstrapAdmin(c: Ctx) {
  if (c.env.ENABLE_BOOTSTRAP_ADMIN !== 'true')
    return c.json(
      { ok: false, error: { code: 'NOT_FOUND', message: 'Bootstrap is disabled.' } },
      404,
    );
  if (c.env.ENVIRONMENT === 'production' && !c.env.BOOTSTRAP_SECRET)
    return c.json(
      { ok: false, error: { code: 'MISCONFIGURED', message: 'Bootstrap secret required.' } },
      500,
    );
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json(
      { ok: false, error: { code: 'BAD_REQUEST', message: 'Invalid bootstrap request.' } },
      400,
    );
  if (parsed.data.secret !== requireSecret(c.env.BOOTSTRAP_SECRET, 'BOOTSTRAP_SECRET'))
    return c.json(
      { ok: false, error: { code: 'FORBIDDEN', message: 'Invalid bootstrap secret.' } },
      403,
    );
  const existing = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM organization_memberships WHERE role='system_admin'",
  ).first<{ count: number }>();
  if ((existing?.count ?? 0) > 0)
    return c.json(
      {
        ok: false,
        error: { code: 'BOOTSTRAP_CLOSED', message: 'A system administrator already exists.' },
      },
      409,
    );
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO users (id,email,display_name,active,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    ).bind(userId, parsed.data.email, parsed.data.displayName, 1, now, now),
    c.env.DB.prepare(
      'INSERT INTO organization_memberships (id,organization_id,user_id,role,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
    ).bind(membershipId, parsed.data.organizationId, userId, 'system_admin', 1, now, now),
  ]);
  return c.json({ ok: true });
}
