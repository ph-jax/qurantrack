import { Hono } from 'hono';

import { healthHandler } from './api/v1/health';
import type { Env, Variables } from './types/env';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set('requestId', requestId);
  await next();
  c.header('X-Request-Id', requestId);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

app.get('/api/v1/health', healthHandler);

app.notFound((c) =>
  c.json(
    {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested API route was not found.',
      },
      requestId: c.get('requestId'),
    },
    404,
  ),
);

export default app;
