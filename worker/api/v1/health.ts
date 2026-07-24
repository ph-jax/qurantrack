import type { Context } from 'hono';

import type { Env, Variables } from '../../types/env';

export function healthHandler(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const requestId = c.get('requestId');

  return c.json({
    ok: true,
    data: {
      status: 'healthy',
      version: c.env.APP_VERSION ?? '0.1.0',
    },
    requestId,
  });
}
