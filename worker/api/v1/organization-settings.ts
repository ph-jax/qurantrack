import type { Context } from 'hono';
import type { Env, Variables } from '../../types/env';
import {
  getOrganizationSettings,
  updateOrganizationSettings,
  validateSettings,
} from '../../organizations/settings';

type Ctx = Context<{ Bindings: Env; Variables: Variables }>;

export async function readOrganizationSettings(c: Ctx) {
  const settings = await getOrganizationSettings(c.env.DB, c.get('auth').organizationId);
  if (!settings)
    return c.json(
      { ok: false, error: { code: 'NOT_FOUND', message: 'Organization not found.' } },
      404,
    );
  return c.json({ ok: true, settings });
}

export async function patchOrganizationSettings(c: Ctx) {
  const body = await c.req.json<unknown>().catch(() => null);
  if (
    !body ||
    typeof body !== 'object' ||
    !('organizationId' in body) ||
    typeof body.organizationId !== 'string'
  )
    return c.json(
      {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Review the settings and try again.' },
      },
      400,
    );
  const trustedOrganizationId = c.get('auth').organizationId;
  if (body.organizationId !== trustedOrganizationId)
    return c.json(
      {
        ok: false,
        error: {
          code: 'STALE_ORGANIZATION',
          message: 'The active organization changed. Reload settings and try again.',
        },
      },
      409,
    );
  const parsed = validateSettings(body, c.env);
  if (!parsed.ok)
    return c.json(
      {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Review the settings and try again.' },
      },
      400,
    );
  const settings = await updateOrganizationSettings(c.env.DB, trustedOrganizationId, parsed.data);
  if (!settings)
    return c.json(
      { ok: false, error: { code: 'NOT_FOUND', message: 'Organization not found.' } },
      404,
    );
  return c.json({ ok: true, settings });
}
