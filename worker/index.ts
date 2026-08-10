import { Hono } from 'hono';
import { administrativeRoles } from '../shared/roles';

import { healthHandler } from './api/v1/health';
import {
  authMethods,
  consumeLogin,
  logout,
  me,
  organizations,
  passwordLoginHandler,
  passwordResetConsume,
  passwordResetRequest,
  passwordSet,
  requestLogin,
  switchOrg,
} from './api/v1/auth';
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
  teacherCreate,
} from './api/v1/memberships';
import type { Env, Variables } from './types/env';
import {
  listClasses,
  saveClass,
  classTeachers,
  removeClassTeacher,
  classRoster,
  listStudents,
  saveStudent,
  enroll,
  withdraw,
  saveGuardian,
  linkGuardian,
  unlinkGuardian,
  curriculum,
  saveTrack,
  saveLevel,
  saveLesson,
  assignTrack,
  studentSummary,
  saveProgress,
  notifyProgress,
  setupOptions,
  previewProgressRecipients,
  updatePublishedHomework,
  listNotifications,
  retryNotification,
} from './api/v1/pilot';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.onError((error, c) => {
  const requestId = c.get('requestId') ?? crypto.randomUUID();
  // Keep the exception in server logs while returning only an opaque correlation identifier.
  console.error('Unexpected request failure', { requestId, error });
  return c.json(
    {
      ok: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'The request could not be completed.' },
      requestId,
    },
    500,
  );
});

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
app.post('/api/v1/auth/password/login', passwordLoginHandler);
app.post('/api/v1/auth/password/reset/request', passwordResetRequest);
app.post('/api/v1/auth/password/reset/consume', passwordResetConsume);
app.post('/api/v1/auth/bootstrap/system-admin', bootstrapAdmin);
app.get('/api/v1/invitations/inspect', invitationInspect);
app.post('/api/v1/invitations/accept', invitationAccept);
app.post('/api/v1/auth/logout', requireAuth(), logout);
app.get('/api/v1/me', requireAuth(), me);
app.get('/api/v1/me/authentication-methods', requireAuth(), authMethods);
app.post('/api/v1/me/password', requireAuth(), passwordSet);
app.get('/api/v1/me/organizations', requireRecoverySession(), organizations);
app.post('/api/v1/me/organizations/switch', requireRecoverySession(), switchOrg);
app.get(
  '/api/v1/organization/staff',
  requireAuth(['system_admin', 'organization_admin']),
  staffList,
);
app.post(
  '/api/v1/organization/teachers',
  requireAuth(['system_admin', 'organization_admin']),
  teacherCreate,
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
app.get(
  '/api/v1/organization/settings',
  requireAuth(administrativeRoles),
  readOrganizationSettings,
);
app.patch(
  '/api/v1/organization/settings',
  requireAuth(administrativeRoles),
  patchOrganizationSettings,
);
app.get('/api/v1/classes', requireAuth(['organization_admin', 'teacher']), listClasses);
app.get('/api/v1/pilot/setup-options', requireAuth(['organization_admin']), setupOptions);
app.post('/api/v1/classes', requireAuth(['organization_admin']), saveClass);
app.post('/api/v1/classes/:id/teachers', requireAuth(['organization_admin']), classTeachers);
app.delete(
  '/api/v1/classes/:id/teachers/:userId',
  requireAuth(['organization_admin']),
  removeClassTeacher,
);
app.get('/api/v1/classes/:id/roster', requireAuth(['organization_admin', 'teacher']), classRoster);
app.get('/api/v1/students', requireAuth(['organization_admin', 'teacher']), listStudents);
app.post('/api/v1/students', requireAuth(['organization_admin']), saveStudent);
app.post('/api/v1/enrollments', requireAuth(['organization_admin']), enroll);
app.post('/api/v1/enrollments/:id/withdraw', requireAuth(['organization_admin']), withdraw);
app.post('/api/v1/guardians', requireAuth(['organization_admin']), saveGuardian);
app.post('/api/v1/student-guardians', requireAuth(['organization_admin']), linkGuardian);
app.delete('/api/v1/student-guardians/:id', requireAuth(['organization_admin']), unlinkGuardian);
app.get('/api/v1/program', requireAuth(['organization_admin', 'teacher']), curriculum);
app.post('/api/v1/program/tracks', requireAuth(['organization_admin']), saveTrack);
app.post('/api/v1/program/levels', requireAuth(['organization_admin']), saveLevel);
app.post('/api/v1/program/lessons', requireAuth(['organization_admin']), saveLesson);
app.post('/api/v1/student-track-levels', requireAuth(['organization_admin']), assignTrack);
app.get(
  '/api/v1/students/:id/summary',
  requireAuth(['organization_admin', 'teacher']),
  studentSummary,
);
app.post('/api/v1/progress-updates', requireAuth(['organization_admin', 'teacher']), saveProgress);
app.get(
  '/api/v1/progress-updates/:id/recipients',
  requireAuth(['organization_admin', 'teacher']),
  previewProgressRecipients,
);
app.patch(
  '/api/v1/progress-updates/:id/homework',
  requireAuth(['organization_admin', 'teacher']),
  updatePublishedHomework,
);
app.post(
  '/api/v1/progress-updates/:id/notify',
  requireAuth(['organization_admin', 'teacher']),
  notifyProgress,
);
app.get('/api/v1/notifications', requireAuth(['organization_admin']), listNotifications);
app.post('/api/v1/notifications/:id/retry', requireAuth(['organization_admin']), retryNotification);

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
