import { Hono } from 'hono';

import { healthHandler } from './api/v1/health';
import { consumeLogin, logout, me, organizations, requestLogin, switchOrg } from './api/v1/auth';
import { bootstrapAdmin } from './api/v1/bootstrap';
import {
  patchOrganizationSettings,
  readOrganizationSettings,
} from './api/v1/organization-settings';
import { noStore, requireAuth, requireRecoverySession } from './middleware/auth';
import {
  invitationAccept,
  invitationCreate,
  invitationInspect,
  invitationResend,
  invitationRevoke,
  membershipUpdate,
  staffList,
} from './api/v1/memberships';
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

app.use('/api/v1/*', noStore);
app.get('/api/v1/health', healthHandler);
app.post('/api/v1/auth/magic-link/request', requestLogin);
app.post('/api/v1/auth/magic-link/consume', consumeLogin);
app.post('/api/v1/auth/bootstrap/system-admin', bootstrapAdmin);
app.get('/api/v1/invitations/inspect', invitationInspect);
app.post('/api/v1/invitations/accept', invitationAccept);
app.post('/api/v1/auth/logout', requireAuth(), logout);
app.get('/api/v1/me', requireAuth(), me);
app.get('/api/v1/me/organizations', requireRecoverySession(), organizations);
app.post('/api/v1/me/organizations/switch', requireRecoverySession(), switchOrg);
app.get(
  '/api/v1/organization/staff',
  requireAuth(['system_admin', 'organization_admin']),
  staffList,
);
app.patch(
  '/api/v1/organization/memberships/:id',
  requireAuth(['system_admin', 'organization_admin']),
  membershipUpdate,
);
app.post(
  '/api/v1/organization/invitations',
  requireAuth(['system_admin', 'organization_admin']),
  invitationCreate,
);
app.post(
  '/api/v1/organization/invitations/:id/resend',
  requireAuth(['system_admin', 'organization_admin']),
  invitationResend,
);
app.post(
  '/api/v1/organization/invitations/:id/revoke',
  requireAuth(['system_admin', 'organization_admin']),
  invitationRevoke,
);
app.get('/api/v1/organization/settings', requireAuth(), readOrganizationSettings);
app.patch(
  '/api/v1/organization/settings',
  requireAuth(['system_admin', 'organization_admin']),
  patchOrganizationSettings,
);

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
