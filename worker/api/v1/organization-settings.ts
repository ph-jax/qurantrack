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
  const parsed = validateSettings(await c.req.json().catch(() => null), c.env);
  if (!parsed.ok)
    return c.json(
      {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Review the settings and try again.' },
      },
      400,
    );
  const settings = await updateOrganizationSettings(
    c.env.DB,
    c.get('auth').organizationId,
    parsed.data,
  );
  if (!settings)
    return c.json(
      { ok: false, error: { code: 'NOT_FOUND', message: 'Organization not found.' } },
      404,
    );
  return c.json({ ok: true, settings });
}
