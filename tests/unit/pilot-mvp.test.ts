/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SqliteD1, base, user, membership, now } from '../helpers/sqliteD1';
import en from '../../src/i18n/locales/en';
import tr from '../../src/i18n/locales/tr';
const { validateSession } = vi.hoisted(() => ({ validateSession: vi.fn() }));
const { submitRelayMail } = vi.hoisted(() => ({ submitRelayMail: vi.fn() }));
vi.mock('../../worker/auth/service', async (orig) => ({
  ...(await orig<typeof import('../../worker/auth/service')>()),
  validateSession,
}));
vi.mock('../../worker/email/relay', async (orig) => ({
  ...(await orig<typeof import('../../worker/email/relay')>()),
  submitRelayMail,
}));
import app from '../../worker/index';
import { aggregateNotificationResults } from '../../worker/api/v1/pilot';
const env = (db: SqliteD1) => ({
  DB: db as unknown as D1Database,
  MAIL_DEFAULT_FROM_ALIAS: 'noreply@example.com',
  MAIL_APPROVED_FROM_ALIASES: 'noreply@example.com',
  MAIL_RELAY_URL: 'https://relay.example.com',
  MAIL_RELAY_SECRET: 'secret',
});
function auth(
  role = 'organization_admin',
  organizationId = 'org-a',
  userId = role === 'teacher' ? 'teacher' : 'admin',
) {
  validateSession.mockResolvedValue({
    userId,
    email: `${userId}@example.com`,
    organizationId,
    role,
    sessionId: 's',
  });
}
function req(path: string, method = 'GET', body?: unknown) {
  const payload =
    path.startsWith('/api/v1/progress-updates') &&
    body &&
    typeof body === 'object' &&
    !Object.prototype.hasOwnProperty.call(body, 'update_date')
      ? { update_date: '2026-08-01', ...(body as Record<string, unknown>) }
      : body;
  return new Request(`http://local${path}`, {
    method,
    headers: { cookie: 'qurantrack_session=t', 'content-type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
}
async function seed(db: SqliteD1) {
  base(db);
  user(db, 'teacher', 'teacher@example.com');
  membership(db, 'teach-a', 'org-a', 'teacher', 'teacher');
  user(db, 'other', 'other@example.com');
  membership(db, 'teach-b', 'org-b', 'other', 'teacher');
  db.db
    .prepare(
      'INSERT INTO classes (id,organization_id,name,active,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    )
    .run('class-a', 'org-a', 'A', 1, now, now);
  db.db
    .prepare(
      'INSERT INTO classes (id,organization_id,name,active,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    )
    .run('class-b', 'org-b', 'B', 1, now, now);
  db.db
    .prepare(
      'INSERT INTO students (id,organization_id,display_name,active,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    )
    .run('stu-a', 'org-a', 'Student A', 1, now, now);
  db.db
    .prepare(
      'INSERT INTO students (id,organization_id,display_name,active,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    )
    .run('stu-b', 'org-b', 'Student B', 1, now, now);
  db.db
    .prepare(
      'INSERT INTO class_teachers (class_id,user_id,organization_id,created_at) VALUES (?,?,?,?)',
    )
    .run('class-a', 'teacher', 'org-a', now);
  db.db
    .prepare(
      'INSERT INTO class_enrollments (id,organization_id,class_id,student_id,active,enrolled_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
    )
    .run('enr-a', 'org-a', 'class-a', 'stu-a', 1, now, now, now);
  db.db
    .prepare(
      'INSERT INTO program_tracks (id,organization_id,code,name,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
    )
    .run('track-a', 'org-a', 'Q', 'Quran', 1, now, now);
  db.db
    .prepare(
      'INSERT INTO levels (id,organization_id,track_id,code,name,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
    )
    .run('level-a', 'org-a', 'track-a', 'L1', 'Level 1', 1, now, now);
  db.db
    .prepare(
      'INSERT INTO lessons (id,organization_id,level_id,code,name,default_homework,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
    )
    .run('lesson-a', 'org-a', 'level-a', '001', 'Lesson <One>', 'Practice & review', 1, now, now);
  db.db
    .prepare(
      'INSERT INTO student_track_levels (id,organization_id,student_id,track_id,current_level_id,started_at,updated_at) VALUES (?,?,?,?,?,?,?)',
    )
    .run('stl-a', 'org-a', 'stu-a', 'track-a', 'level-a', now, now);
}
describe('Pilot MVP API', () => {
  let db: SqliteD1;
  beforeEach(async () => {
    db = new SqliteD1();
    await seed(db);
    validateSession.mockReset();
    submitRelayMail.mockReset();
    submitRelayMail.mockResolvedValue({ status: 'accepted' });
  });
  it('supports admin roster, guardian, curriculum, assignment, and enrollment workflows', async () => {
    auth();
    expect(
      (await app.fetch(req('/api/v1/classes', 'POST', { name: 'New', active: true }), env(db)))
        .status,
    ).toBe(200);
    expect(
      (
        await app.fetch(
          req('/api/v1/students', 'POST', { display_name: 'New Student', active: true }),
          env(db),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await app.fetch(
          req('/api/v1/guardians', 'POST', {
            name: 'Parent',
            email: 'parent@example.com',
            active: true,
            preferred_locale: 'tr',
          }),
          env(db),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await app.fetch(
          req('/api/v1/program/tracks', 'POST', { code: 'A', name: 'A', active: true }),
          env(db),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await app.fetch(
          req('/api/v1/student-track-levels', 'POST', {
            student_id: 'stu-a',
            track_id: 'track-a',
            current_level_id: 'level-a',
          }),
          env(db),
        )
      ).status,
    ).toBe(200);
  });
  it('atomically unlinks and audits a guardian relationship inside the active tenant', async () => {
    auth();
    const guardian = (await (
      await app.fetch(
        req('/api/v1/guardians', 'POST', {
          name: 'Fictional Guardian',
          email: 'guardian@example.com',
          active: true,
          preferred_locale: 'en',
        }),
        env(db),
      )
    ).json()) as any;
    await app.fetch(
      req('/api/v1/student-guardians', 'POST', {
        student_id: 'stu-a',
        guardian_id: guardian.id,
        relationship: 'Guardian',
        receive_notifications: true,
      }),
      env(db),
    );
    const setup = (await (
      await app.fetch(req('/api/v1/pilot/setup-options'), env(db))
    ).json()) as any;
    const link = setup.guardianLinks.find((item: any) => item.guardian_id === guardian.id);
    expect(link.receive_notifications).toBe(1);

    auth('organization_admin', 'org-b', 'other');
    expect(
      (await app.fetch(req(`/api/v1/student-guardians/${link.id}`, 'DELETE'), env(db))).status,
    ).toBe(404);
    auth();
    db.failBatchAt = 2;
    expect(
      (await app.fetch(req(`/api/v1/student-guardians/${link.id}`, 'DELETE'), env(db))).status,
    ).toBe(500);
    expect(
      db.db.prepare('SELECT count(*) count FROM student_guardians WHERE id=?').get(link.id),
    ).toMatchObject({ count: 1 });
    expect(
      db.db.prepare("SELECT count(*) count FROM audit_log WHERE action='guardian.unlink'").get(),
    ).toMatchObject({ count: 0 });

    db.failBatchAt = 0;
    expect(
      (await app.fetch(req(`/api/v1/student-guardians/${link.id}`, 'DELETE'), env(db))).status,
    ).toBe(200);
    expect(db.count('student_guardians')).toBe(0);
    const unlinkAudits = db.db
      .prepare(
        "SELECT entity_id,metadata_json FROM audit_log WHERE action='guardian.unlink' ORDER BY created_at",
      )
      .all() as { entity_id: string; metadata_json: string }[];
    expect(unlinkAudits).toHaveLength(1);
    expect(unlinkAudits[0]).toMatchObject({ entity_id: 'stu-a' });
    expect(JSON.parse(unlinkAudits[0].metadata_json)).toEqual({ guardianId: guardian.id });
  });
  it('blocks teacher admin mutations and hides unauthorized/cross-org records', async () => {
    auth('teacher', 'org-a', 'teacher');
    expect((await app.fetch(req('/api/v1/classes', 'POST', { name: 'No' }), env(db))).status).toBe(
      403,
    );
    expect((await app.fetch(req('/api/v1/students/stu-b/summary'), env(db))).status).toBe(404);
    const students = (await (await app.fetch(req('/api/v1/students'), env(db))).json()) as any;
    expect(students.students).toHaveLength(1);
    expect(
      (
        await app.fetch(
          req('/api/v1/student-track-levels', 'POST', {
            student_id: 'stu-a',
            track_id: 'track-a',
            current_level_id: 'level-a',
          }),
          env(db),
        )
      ).status,
    ).toBe(403);
  });
  it('denies system administrators access to organization-owned Pilot APIs', async () => {
    auth('system_admin', 'org-a', 'admin');
    for (const path of [
      '/api/v1/classes',
      '/api/v1/classes/class-a/roster',
      '/api/v1/students',
      '/api/v1/students/stu-a/summary',
      '/api/v1/pilot/setup-options',
      '/api/v1/program',
    ]) {
      expect((await app.fetch(req(path), env(db))).status, path).toBe(403);
    }
  });
  it('removes teacher visibility immediately after unassignment and withdrawal', async () => {
    auth('teacher', 'org-a', 'teacher');
    expect((await app.fetch(req('/api/v1/students/stu-a/summary'), env(db))).status).toBe(200);
    auth();
    await app.fetch(req('/api/v1/classes/class-a/teachers/teacher', 'DELETE'), env(db));
    auth('teacher', 'org-a', 'teacher');
    expect((await app.fetch(req('/api/v1/students/stu-a/summary'), env(db))).status).toBe(404);
    auth();
    await app.fetch(
      req('/api/v1/classes/class-a/teachers', 'POST', { user_id: 'teacher' }),
      env(db),
    );
    await app.fetch(req('/api/v1/enrollments/enr-a/withdraw', 'POST'), env(db));
    auth('teacher', 'org-a', 'teacher');
    expect((await app.fetch(req('/api/v1/students/stu-a/summary'), env(db))).status).toBe(404);
  });
  it('drafts do not update summaries or send email; publish preserves passed status', async () => {
    auth('teacher', 'org-a', 'teacher');
    await app.fetch(
      req('/api/v1/progress-updates', 'POST', {
        student_id: 'stu-a',
        class_id: 'class-a',
        status: 'draft',
        items: [{ lesson_id: 'lesson-a', outcome: 'passed' }],
        notify: true,
      }),
      env(db),
    );
    expect(db.count('student_lesson_status')).toBe(0);
    expect(submitRelayMail).not.toHaveBeenCalled();
    await app.fetch(
      req('/api/v1/progress-updates', 'POST', {
        student_id: 'stu-a',
        class_id: 'class-a',
        status: 'published',
        items: [{ lesson_id: 'lesson-a', outcome: 'passed' }],
      }),
      env(db),
    );
    await app.fetch(
      req('/api/v1/progress-updates', 'POST', {
        student_id: 'stu-a',
        class_id: 'class-a',
        status: 'published',
        items: [{ lesson_id: 'lesson-a', outcome: 'practiced' }],
      }),
      env(db),
    );
    const row = db.db
      .prepare('SELECT first_passed_at,current_status FROM student_lesson_status')
      .get() as any;
    expect(row.first_passed_at).toBeTruthy();
    expect(row.current_status).toBe('practiced');
  });
  it('emails only eligible guardians, escapes content, records failures, and prevents duplicate success', async () => {
    auth();
    const guardianCreated = (await (
      await app.fetch(
        req('/api/v1/guardians', 'POST', {
          name: 'Parent',
          email: 'parent@example.com',
          active: true,
          preferred_locale: 'tr',
        }),
        env(db),
      )
    ).json()) as any;
    await app.fetch(
      req('/api/v1/student-guardians', 'POST', {
        student_id: 'stu-a',
        guardian_id: guardianCreated.id,
        receive_notifications: true,
      }),
      env(db),
    );
    submitRelayMail
      .mockResolvedValueOnce({ status: 'rejected_before_send', rejectionCode: 'invalid_recipient' })
      .mockResolvedValue({ status: 'accepted' });
    auth('teacher', 'org-a', 'teacher');
    const res = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          notify: true,
          overall_comment: 'Great <job>',
          homework: 'Read & repeat',
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned', item_comment: 'Use <book>' }],
        }),
        env(db),
      )
    ).json()) as any;
    expect(res.ok).toBe(true);
    expect(res.publication).toBe('notification_failed');
    expect(db.db.prepare('SELECT status FROM notification_log').get()).toMatchObject({
      status: 'failed',
    });
    const pu = (db.db.prepare('SELECT id FROM progress_updates').get() as any).id;
    await app.fetch(req(`/api/v1/progress-updates/${pu}/notify?retry=1`, 'POST'), env(db));
    await app.fetch(req(`/api/v1/progress-updates/${pu}/notify`, 'POST'), env(db));
    expect(submitRelayMail).toHaveBeenCalledTimes(2);
    const msg = submitRelayMail.mock.calls[1][1];
    expect(msg.subject).toContain('ilerleme');
    expect(msg.text).toContain('Ödev verildi');
    expect(msg.text).not.toContain('needs_practice');
    expect(msg.html).toContain('&lt;job&gt;');
    expect(db.count('notification_attempts')).toBe(2);
    expect(
      db.db.prepare("SELECT count(*) count FROM notification_attempts WHERE status='failed'").get(),
    ).toMatchObject({ count: 1 });
  });
  it('rejects cross-tenant and mismatched setup relationships without disclosure', async () => {
    auth();
    db.db
      .prepare(
        'INSERT INTO program_tracks (id,organization_id,code,name,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run('track-x', 'org-a', 'X', 'Other Track', 1, now, now);
    db.db
      .prepare(
        'INSERT INTO levels (id,organization_id,track_id,code,name,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run('level-x', 'org-a', 'track-x', 'X1', 'Other Level', 1, now, now);
    db.db
      .prepare(
        'INSERT INTO lessons (id,organization_id,level_id,code,name,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run('lesson-x', 'org-a', 'level-x', 'X1', 'Other Lesson', 1, now, now);
    expect(
      (
        await app.fetch(
          req('/api/v1/student-track-levels', 'POST', {
            student_id: 'stu-a',
            track_id: 'track-a',
            current_level_id: 'level-x',
          }),
          env(db),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await app.fetch(
          req('/api/v1/student-track-levels', 'POST', {
            student_id: 'stu-b',
            track_id: 'track-a',
            current_level_id: 'level-a',
          }),
          env(db),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await app.fetch(
          req('/api/v1/progress-updates', 'POST', {
            student_id: 'stu-a',
            class_id: 'class-a',
            status: 'published',
            items: [{ lesson_id: 'lesson-x', outcome: 'passed' }],
          }),
          env(db),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await app.fetch(
          req('/api/v1/progress-updates', 'POST', {
            student_id: 'stu-a',
            class_id: 'class-b',
            status: 'published',
            items: [{ lesson_id: 'lesson-a', outcome: 'passed' }],
          }),
          env(db),
        )
      ).status,
    ).toBe(404);
    db.db
      .prepare(
        'INSERT INTO guardians (id,organization_id,name,email,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run('guardian-b', 'org-b', 'Guardian B', 'guardian-b@example.com', 1, now, now);
    expect(
      (
        await app.fetch(
          req('/api/v1/student-guardians', 'POST', {
            student_id: 'stu-a',
            guardian_id: 'guardian-b',
            receive_notifications: true,
          }),
          env(db),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await app.fetch(
          req('/api/v1/enrollments', 'POST', { class_id: 'class-b', student_id: 'stu-a' }),
          env(db),
        )
      ).status,
    ).toBe(404);
  });
  it('rolls back every publication write when an atomic batch statement fails', async () => {
    auth('teacher', 'org-a', 'teacher');
    db.failBatchAt = 3;
    const response = await app.fetch(
      req('/api/v1/progress-updates', 'POST', {
        student_id: 'stu-a',
        class_id: 'class-a',
        status: 'published',
        items: [{ lesson_id: 'lesson-a', outcome: 'passed' }],
      }),
      env(db),
    );
    expect(response.status).toBe(500);
    expect(db.count('progress_updates')).toBe(0);
    expect(db.count('progress_update_items')).toBe(0);
    expect(db.count('student_lesson_status')).toBe(0);
    expect(
      db.db.prepare("SELECT count(*) count FROM audit_log WHERE action='progress.publish'").get(),
    ).toMatchObject({ count: 0 });
  });
  it('never treats failed draft publication as idempotent success', async () => {
    auth('teacher', 'org-a', 'teacher');
    const payload = {
      operation_key: 'failed-existing-draft',
      student_id: 'stu-a',
      class_id: 'class-a',
      update_date: '2026-08-02',
      items: [{ lesson_id: 'lesson-a', outcome: 'passed' }],
    };
    const draft = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', { ...payload, status: 'draft' }),
        env(db),
      )
    ).json()) as any;
    db.failBatchAt = 3;
    const failed = await app.fetch(
      req('/api/v1/progress-updates', 'POST', {
        ...payload,
        id: draft.id,
        status: 'published',
      }),
      env(db),
    );
    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
    expect(
      db.db.prepare('SELECT status FROM progress_updates WHERE id=?').get(draft.id),
    ).toMatchObject({
      status: 'draft',
    });
    expect(db.count('student_lesson_status')).toBe(0);
  });
  it('keeps every administrator setup mutation unavailable to teachers', async () => {
    auth('teacher', 'org-a', 'teacher');
    for (const [path, payload] of [
      ['/api/v1/pilot/setup-options', undefined],
      ['/api/v1/students', { display_name: 'No' }],
      ['/api/v1/guardians', { name: 'No', email: 'no@example.com' }],
      ['/api/v1/enrollments', { class_id: 'class-a', student_id: 'stu-a' }],
      ['/api/v1/program/tracks', { code: 'N', name: 'No' }],
    ] as const) {
      const response = await app.fetch(req(path, payload ? 'POST' : 'GET', payload), env(db));
      expect(response.status).toBe(403);
    }
  });
  it('reserves concurrent notifications once and never implicitly retries failure', async () => {
    auth();
    const concurrentGuardian = (await (
      await app.fetch(
        req('/api/v1/guardians', 'POST', {
          name: 'Concurrent Guardian',
          email: 'concurrent@example.com',
          active: true,
        }),
        env(db),
      )
    ).json()) as any;
    await app.fetch(
      req('/api/v1/student-guardians', 'POST', {
        student_id: 'stu-a',
        guardian_id: concurrentGuardian.id,
        receive_notifications: true,
      }),
      env(db),
    );
    auth('teacher', 'org-a', 'teacher');
    const published = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'concurrent-progress',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          items: [{ lesson_id: 'lesson-a', outcome: 'needs_practice' }],
        }),
        env(db),
      )
    ).json()) as any;
    submitRelayMail.mockResolvedValue({ status: 'accepted' });
    await Promise.all([
      app.fetch(req(`/api/v1/progress-updates/${published.id}/notify`, 'POST'), env(db)),
      app.fetch(req(`/api/v1/progress-updates/${published.id}/notify`, 'POST'), env(db)),
    ]);
    expect(submitRelayMail).toHaveBeenCalledTimes(1);
    expect(submitRelayMail.mock.calls[0][1].text).toContain('Needs practice');
    const alreadySubmittedRetries = await Promise.all([
      app.fetch(req(`/api/v1/progress-updates/${published.id}/notify?retry=1`, 'POST'), env(db)),
      app.fetch(req(`/api/v1/progress-updates/${published.id}/notify?retry=1`, 'POST'), env(db)),
    ]);
    expect(submitRelayMail).toHaveBeenCalledTimes(1);
    for (const response of alreadySubmittedRetries) {
      expect(response.status).toBe(400);
    }
  });
  it('does not retry a failed submission without an explicit retry flag', async () => {
    auth();
    const failedGuardian = (await (
      await app.fetch(
        req('/api/v1/guardians', 'POST', {
          name: 'Failed Guardian',
          email: 'failed@example.com',
          active: true,
        }),
        env(db),
      )
    ).json()) as any;
    await app.fetch(
      req('/api/v1/student-guardians', 'POST', {
        student_id: 'stu-a',
        guardian_id: failedGuardian.id,
        receive_notifications: true,
      }),
      env(db),
    );
    auth('teacher', 'org-a', 'teacher');
    submitRelayMail
      .mockResolvedValueOnce({ status: 'rejected_before_send', rejectionCode: 'invalid_recipient' })
      .mockResolvedValue({ status: 'accepted' });
    const published = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          notify: true,
          items: [{ lesson_id: 'lesson-a', outcome: 'needs_practice' }],
        }),
        env(db),
      )
    ).json()) as any;
    await app.fetch(req(`/api/v1/progress-updates/${published.id}/notify`, 'POST'), env(db));
    expect(submitRelayMail).toHaveBeenCalledTimes(1);
    await Promise.all([
      app.fetch(req(`/api/v1/progress-updates/${published.id}/notify?retry=1`, 'POST'), env(db)),
      app.fetch(req(`/api/v1/progress-updates/${published.id}/notify?retry=1`, 'POST'), env(db)),
    ]);
    expect(submitRelayMail).toHaveBeenCalledTimes(2);
    expect(db.count('notification_attempts')).toBe(2);
  });
  it('updates selected administrator records without creating duplicates', async () => {
    auth();
    for (const [path, payload, table, id, expected] of [
      [
        '/api/v1/classes',
        { id: 'class-a', name: 'Edited Class', active: false },
        'classes',
        'class-a',
        'Edited Class',
      ],
      [
        '/api/v1/students',
        { id: 'stu-a', display_name: 'Edited Student', active: false },
        'students',
        'stu-a',
        'Edited Student',
      ],
    ] as const) {
      const before = db.count(table);
      expect((await app.fetch(req(path, 'POST', payload), env(db))).status).toBe(200);
      expect(db.count(table)).toBe(before);
      expect(
        db.db
          .prepare(
            `SELECT ${table === 'classes' ? 'name' : 'display_name'} value,active FROM ${table} WHERE id=?`,
          )
          .get(id),
      ).toMatchObject({ value: expected, active: 0 });
    }
    const created = (await (
      await app.fetch(
        req('/api/v1/guardians', 'POST', {
          name: 'Guardian',
          email: 'edit@example.com',
          active: true,
        }),
        env(db),
      )
    ).json()) as any;
    const before = db.count('guardians');
    expect(
      (
        await app.fetch(
          req('/api/v1/guardians', 'POST', {
            id: created.id,
            name: 'Edited Guardian',
            email: 'edit@example.com',
            active: false,
          }),
          env(db),
        )
      ).status,
    ).toBe(200);
    expect(db.count('guardians')).toBe(before);
    expect(
      db.db.prepare('SELECT name,active FROM guardians WHERE id=?').get(created.id),
    ).toMatchObject({ name: 'Edited Guardian', active: 0 });
  });
  it('saves, publishes, and safely repeats one idempotent progress operation', async () => {
    auth('teacher', 'org-a', 'teacher');
    const payload = {
      operation_key: 'operation-example-1',
      student_id: 'stu-a',
      class_id: 'class-a',
      update_date: '2026-08-01',
      items: [{ lesson_id: 'lesson-a', outcome: 'passed' }],
    };
    const draft = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', { ...payload, status: 'draft' }),
        env(db),
      )
    ).json()) as any;
    const repeatedDraft = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', { ...payload, status: 'draft' }),
        env(db),
      )
    ).json()) as any;
    expect(repeatedDraft.id).toBe(draft.id);
    const publicationRequest = () =>
      app.fetch(
        req('/api/v1/progress-updates', 'POST', { ...payload, id: draft.id, status: 'published' }),
        env(db),
      );
    const [published, repeatedPublish] = await Promise.all([
      publicationRequest(),
      publicationRequest(),
    ]);
    expect(published.status).toBe(200);
    expect(repeatedPublish.status).toBe(200);
    expect(db.count('progress_updates')).toBe(1);
    expect(db.count('progress_update_items')).toBe(1);
  });
  it('resolves a legitimate concurrent create collision only at the requested state', async () => {
    auth('teacher', 'org-a', 'teacher');
    const payload = {
      operation_key: 'concurrent-create-operation',
      student_id: 'stu-a',
      class_id: 'class-a',
      update_date: '2026-08-03',
      status: 'draft',
      items: [{ lesson_id: 'lesson-a', outcome: 'practiced' }],
    };
    const responses = await Promise.all([
      app.fetch(req('/api/v1/progress-updates', 'POST', payload), env(db)),
      app.fetch(req('/api/v1/progress-updates', 'POST', payload), env(db)),
    ]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(db.count('progress_updates')).toBe(1);
  });

  it('strictly validates real ISO activity dates before database writes', async () => {
    auth('teacher', 'org-a', 'teacher');
    const send = (operation_key: string, update_date: unknown) =>
      app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key,
          student_id: 'stu-a',
          class_id: 'class-a',
          update_date,
          status: 'published',
          items: [{ lesson_id: 'lesson-a', outcome: 'practiced' }],
        }),
        env(db),
      );
    expect((await send('normal-date', '2026-08-03')).status).toBe(200);
    expect((await send('leap-date', '2028-02-29')).status).toBe(200);
    const before = db.count('progress_updates');
    for (const [index, value] of [
      null,
      '2027-02-29',
      '2026-02-30',
      '2026-00-10',
      '2026-13-01',
      '2026-08-00',
      '2026-8-03',
      '2026-08-3',
      '2026-08-03T00:00:00Z',
      ' 2026-08-03',
      '2026-08-03 ',
      'x2026-08-03',
    ].entries()) {
      expect((await send(`invalid-date-${index}`, value)).status).toBe(400);
    }
    expect(db.count('progress_updates')).toBe(before);
  });
  it('keeps newer lesson state while an older pass establishes first completion', async () => {
    auth('teacher', 'org-a', 'teacher');
    const publish = (operation_key: string, update_date: string, outcome: string) =>
      app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key,
          student_id: 'stu-a',
          class_id: 'class-a',
          update_date,
          status: 'published',
          items: [{ lesson_id: 'lesson-a', outcome }],
        }),
        env(db),
      );
    await publish('newer-operation', '2026-08-05', 'practiced');
    await publish('older-operation', '2026-07-01', 'passed');
    expect(
      db.db
        .prepare(
          'SELECT current_status,first_passed_at,last_activity_at FROM student_lesson_status',
        )
        .get(),
    ).toMatchObject({
      current_status: 'practiced',
      first_passed_at: '2026-07-01',
      last_activity_at: '2026-08-05',
    });
    expect(db.count('progress_updates')).toBe(2);
  });
  it('rejects moving an existing level to a different track', async () => {
    auth();
    db.db
      .prepare(
        'INSERT INTO program_tracks (id,organization_id,code,name,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run('track-other', 'org-a', 'O', 'Other', 1, now, now);
    const response = await app.fetch(
      req('/api/v1/program/levels', 'POST', {
        id: 'level-a',
        track_id: 'track-other',
        code: 'L1',
        name: 'Moved',
        active: true,
      }),
      env(db),
    );
    expect(response.status).toBe(400);
    expect(
      db.db.prepare('SELECT track_id,name FROM levels WHERE id=?').get('level-a'),
    ).toMatchObject({ track_id: 'track-a', name: 'Level 1' });
  });
  it('does not call the relay when atomic notification reservation fails', async () => {
    auth();
    const guardian = (await (
      await app.fetch(
        req('/api/v1/guardians', 'POST', {
          name: 'Reserve Guardian',
          email: 'reserve@example.com',
          active: true,
        }),
        env(db),
      )
    ).json()) as any;
    await app.fetch(
      req('/api/v1/student-guardians', 'POST', {
        student_id: 'stu-a',
        guardian_id: guardian.id,
        receive_notifications: true,
      }),
      env(db),
    );
    auth('teacher', 'org-a', 'teacher');
    const published = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'reserve-progress',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'draft',
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    db.db
      .prepare("UPDATE progress_updates SET status='published',published_at=? WHERE id=?")
      .run(now, published.id);
    db.failBatchAt = 1;
    const result = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          id: published.id,
          operation_key: 'reserve-progress',
          student_id: 'stu-a',
          class_id: 'class-a',
          update_date: '2026-08-01',
          status: 'published',
          notify: true,
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    expect(submitRelayMail).not.toHaveBeenCalled();
    expect(result.publication).toBe('notification_preparation_failed');
    expect(result.notification[0].status).toBe('not_reserved');
    expect(db.count('notification_log')).toBe(0);
  });
  it('leaves accepted but unfinalized relay submission ambiguous and non-retryable', async () => {
    auth();
    const guardian = (await (
      await app.fetch(
        req('/api/v1/guardians', 'POST', {
          name: 'Ambiguous Guardian',
          email: 'ambiguous@example.com',
          active: true,
        }),
        env(db),
      )
    ).json()) as any;
    await app.fetch(
      req('/api/v1/student-guardians', 'POST', {
        student_id: 'stu-a',
        guardian_id: guardian.id,
        receive_notifications: true,
      }),
      env(db),
    );
    auth('teacher', 'org-a', 'teacher');
    submitRelayMail.mockImplementationOnce(async () => {
      db.failBatchAt = 1;
      return { status: 'accepted' };
    });
    const first = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'ambiguous-progress',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          notify: true,
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    expect(first.publication).toBe('notification_ambiguous');
    expect(first.notification[0].status).toBe('ambiguous');
    expect(db.db.prepare('SELECT status FROM notification_log').get()).toMatchObject({
      status: 'pending',
    });
    db.failBatchAt = 0;
    await app.fetch(req(`/api/v1/progress-updates/${first.id}/notify`, 'POST'), env(db));
    const retry = await app.fetch(
      req(`/api/v1/progress-updates/${first.id}/notify?retry=1`, 'POST'),
      env(db),
    );
    expect(submitRelayMail).toHaveBeenCalledTimes(1);
    expect(retry.status).toBe(400);
  });
  it('reports publish-only and no-recipient outcomes accurately', async () => {
    auth('teacher', 'org-a', 'teacher');
    const publishOnly = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'publish-only',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    expect(publishOnly.publication).toBe('no_recipients');
    const noRecipients = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'publish-notify-empty',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          notify: true,
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    expect(noRecipients.publication).toBe('no_recipients');
    expect(noRecipients.notification).toEqual([]);
  });
  it('localizes every final publication and ambiguous notification result', () => {
    for (const locale of [en, tr]) {
      expect(locale.pilot.messages.notifications_submitted).toBeTruthy();
      expect(locale.pilot.messages.no_recipients).toBeTruthy();
      expect(locale.pilot.messages.notification_failed).toBeTruthy();
      expect(locale.pilot.messages.notification_ambiguous).toBeTruthy();
      expect(locale.pilot.messages.notification_preparation_failed).toBeTruthy();
      expect(locale.pilot.messages.notification_partial).toBeTruthy();
      expect(locale.pilot.messages.notification_not_retryable).toBeTruthy();
      expect(locale.pilot.messages.notification_request_failed).toBeTruthy();
      expect(locale.pilot.messages.already_notified).toBeTruthy();
      expect(locale.pilot.messages.published_only).toBeTruthy();
      expect(locale.pilot.notification.ambiguous).toBeTruthy();
      expect(locale.pilot.notification.preparationFailed).toBeTruthy();
    }
  });
  it('aggregates mixed recipient outcomes without losing successful submissions', () => {
    const result = (status: string, already = false) => ({ guardianId: status, status, already });
    const cases = [
      [[result('submitted')], 'notifications_submitted'],
      [[], 'no_recipients'],
      [[result('submitted', true)], 'already_notified'],
      [[result('submitted'), result('failed')], 'notification_partial'],
      [[result('submitted'), result('ambiguous')], 'notification_partial'],
      [[result('submitted'), result('not_reserved')], 'notification_partial'],
      [[result('submitted', true), result('failed')], 'notification_partial'],
      [[result('failed'), result('failed')], 'notification_failed'],
      [[result('ambiguous'), result('ambiguous')], 'notification_ambiguous'],
      [[result('not_reserved')], 'notification_preparation_failed'],
    ] as const;
    for (const [results, code] of cases) {
      const aggregate = aggregateNotificationResults([...results]);
      expect(aggregate.code).toBe(code);
      expect(
        aggregate.counts.submitted +
          aggregate.counts.alreadySubmitted +
          aggregate.counts.failed +
          aggregate.counts.ambiguous +
          aggregate.counts.notReserved +
          aggregate.counts.notRetryable +
          aggregate.counts.skipped,
      ).toBe(aggregate.counts.total);
      if (results.some((item) => item.status === 'submitted') && results.length > 1)
        expect(aggregate.code).not.toBe('notification_preparation_failed');
    }
  });
  it('does not let retry initiate a first notification for a newly linked guardian', async () => {
    auth('teacher', 'org-a', 'teacher');
    const published = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'retry-first-time',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    auth();
    const guardian = (await (
      await app.fetch(
        req('/api/v1/guardians', 'POST', {
          name: 'Later Guardian',
          email: 'later@example.com',
          active: true,
        }),
        env(db),
      )
    ).json()) as any;
    await app.fetch(
      req('/api/v1/student-guardians', 'POST', {
        student_id: 'stu-a',
        guardian_id: guardian.id,
        receive_notifications: true,
      }),
      env(db),
    );
    auth('teacher', 'org-a', 'teacher');
    const retry = await app.fetch(
      req(`/api/v1/progress-updates/${published.id}/notify?retry=1`, 'POST'),
      env(db),
    );
    expect(retry.status).toBe(400);
    expect(submitRelayMail).not.toHaveBeenCalled();
  });
  it('returns truthful structured counts for mixed guardian submissions', async () => {
    auth();
    for (const [name, email] of [
      ['Submitted Guardian', 'submitted@example.com'],
      ['Rejected Guardian', 'rejected@example.com'],
    ]) {
      const guardian = (await (
        await app.fetch(req('/api/v1/guardians', 'POST', { name, email, active: true }), env(db))
      ).json()) as any;
      await app.fetch(
        req('/api/v1/student-guardians', 'POST', {
          student_id: 'stu-a',
          guardian_id: guardian.id,
          receive_notifications: true,
        }),
        env(db),
      );
    }
    submitRelayMail.mockResolvedValueOnce({ status: 'accepted' }).mockResolvedValueOnce({
      status: 'rejected_before_send',
      rejectionCode: 'invalid_recipient',
    });
    auth('teacher', 'org-a', 'teacher');
    const response = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'mixed-guardians',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          notify: true,
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    expect(response.publication).toBe('notification_partial');
    expect(response.notificationAggregate.counts).toMatchObject({
      total: 2,
      submitted: 1,
      failed: 1,
    });
    expect(response.notification.map((item: any) => item.status).sort()).toEqual([
      'failed',
      'submitted',
    ]);

    submitRelayMail.mockResolvedValueOnce({ status: 'accepted' });
    const retry = (await (
      await app.fetch(
        req(`/api/v1/progress-updates/${response.id}/notify?retry=1`, 'POST'),
        env(db),
      )
    ).json()) as any;
    expect(submitRelayMail).toHaveBeenCalledTimes(3);
    expect(retry.aggregate).toMatchObject({
      code: 'notifications_submitted',
      counts: { total: 1, submitted: 1, alreadySubmitted: 0 },
    });
    expect(retry.results).toEqual([expect.objectContaining({ status: 'submitted' })]);
    expect(db.count('notification_attempts')).toBe(3);
    expect(
      db.db.prepare("SELECT count(*) count FROM notification_attempts WHERE status='failed'").get(),
    ).toMatchObject({ count: 1 });
  });

  it('reports a submitted guardian plus a definitively rejected retry as partial', async () => {
    auth();
    for (const [name, email] of [
      ['Existing Submitted Guardian', 'existing-submitted@example.com'],
      ['Retry Rejected Guardian', 'retry-rejected@example.com'],
    ]) {
      const guardian = (await (
        await app.fetch(req('/api/v1/guardians', 'POST', { name, email, active: true }), env(db))
      ).json()) as any;
      await app.fetch(
        req('/api/v1/student-guardians', 'POST', {
          student_id: 'stu-a',
          guardian_id: guardian.id,
          receive_notifications: true,
        }),
        env(db),
      );
    }
    submitRelayMail.mockResolvedValueOnce({ status: 'accepted' }).mockResolvedValueOnce({
      status: 'rejected_before_send',
      rejectionCode: 'invalid_recipient',
    });
    auth('teacher', 'org-a', 'teacher');
    const published = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'mixed-retry-rejected',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          notify: true,
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    submitRelayMail.mockResolvedValueOnce({
      status: 'rejected_before_send',
      rejectionCode: 'invalid_recipient',
    });
    const retry = (await (
      await app.fetch(
        req(`/api/v1/progress-updates/${published.id}/notify?retry=1`, 'POST'),
        env(db),
      )
    ).json()) as any;
    expect(submitRelayMail).toHaveBeenCalledTimes(3);
    expect(retry.aggregate).toMatchObject({
      code: 'notification_failed',
      counts: { total: 1, submitted: 0, alreadySubmitted: 0, failed: 1 },
    });
    expect(retry.results).toEqual([
      expect.objectContaining({ status: 'failed', retryAvailable: true }),
    ]);
  });

  it('previews only authoritative tenant and teacher scoped recipients with resolved locale', async () => {
    auth();
    const guardian = (await (
      await app.fetch(
        req('/api/v1/guardians', 'POST', {
          name: 'Preview Parent',
          email: 'preview@example.com',
          active: true,
          preferred_locale: 'tr',
        }),
        env(db),
      )
    ).json()) as any;
    await app.fetch(
      req('/api/v1/student-guardians', 'POST', {
        student_id: 'stu-a',
        guardian_id: guardian.id,
        receive_notifications: true,
      }),
      env(db),
    );
    auth('teacher', 'org-a', 'teacher');
    const response = await app.fetch(
      req('/api/v1/students/stu-a/notification-recipients?classId=class-a'),
      env(db),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      count: 1,
      recipients: [{ name: 'Preview Parent', email: 'preview@example.com', resolved_locale: 'tr' }],
    });
    auth('teacher', 'org-b', 'other');
    expect(
      (
        await app.fetch(
          req('/api/v1/students/stu-a/notification-recipients?classId=class-a'),
          env(db),
        )
      ).status,
    ).toBe(404);
  });

  it('stores a material homework revision and audit atomically without notification', async () => {
    auth();
    const guardian = (await (
      await app.fetch(
        req('/api/v1/guardians', 'POST', {
          name: 'No-notification Parent',
          email: 'no-notification@example.com',
          active: true,
        }),
        env(db),
      )
    ).json()) as any;
    await app.fetch(
      req('/api/v1/student-guardians', 'POST', {
        student_id: 'stu-a',
        guardian_id: guardian.id,
        receive_notifications: true,
      }),
      env(db),
    );
    auth('teacher', 'org-a', 'teacher');
    const published = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'homework-base',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          homework: 'Old',
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    submitRelayMail.mockClear();
    db.preparedSql = [];
    let homeworkBatchSql: string[] = [];
    db.beforeBatch = (statements) => {
      homeworkBatchSql = statements.map((statement) => statement.sql);
    };
    const result = (await (
      await app.fetch(
        req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', {
          homework: ' New homework ',
          notifyGuardians: false,
          operationKey: 'homework-op-one',
        }),
        env(db),
      )
    ).json()) as any;
    expect(result.storage.status).toBe('updated');
    expect(
      db.db.prepare('SELECT homework FROM progress_updates WHERE id=?').get(published.id),
    ).toMatchObject({ homework: 'New homework' });
    expect(db.count('homework_revisions')).toBe(1);
    expect(
      db.db
        .prepare("SELECT count(*) count FROM audit_log WHERE action='progress.homework_updated'")
        .get(),
    ).toMatchObject({ count: 1 });
    expect(db.count('homework_revision_recipients')).toBe(0);
    expect(homeworkBatchSql).toHaveLength(3);
    expect(homeworkBatchSql.join('\n')).not.toMatch(
      /homework_revision_recipients|\bguardians\b|student_guardians|recipient_email|preferred_locale|resolved_locale/i,
    );
    expect(db.preparedSql.join('\n')).not.toMatch(
      /homework_revision_recipients|\bguardians\b|student_guardians|recipient_email|preferred_locale|resolved_locale/i,
    );
    db.preparedSql = [];
    const replay = (await (
      await app.fetch(
        req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', {
          homework: 'New homework',
          notifyGuardians: false,
          operationKey: 'homework-op-one',
        }),
        env(db),
      )
    ).json()) as any;
    expect(replay.storage.status).toBe('idempotent');
    expect(db.count('homework_revision_recipients')).toBe(0);
    expect(db.preparedSql.join('\n')).not.toMatch(
      /homework_revision_recipients|\bguardians\b|student_guardians|recipient_email|preferred_locale|resolved_locale/i,
    );
    expect(submitRelayMail).not.toHaveBeenCalled();
  });

  it('rolls back progress, revision, and audit when the homework batch fails', async () => {
    auth('teacher', 'org-a', 'teacher');
    const published = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'rollback-base',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          homework: 'Before',
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    const audits = db.count('audit_log');
    db.failBatchAt = 2;
    const response = await app.fetch(
      req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', {
        homework: 'After',
        notifyGuardians: false,
        operationKey: 'rollback-operation',
      }),
      env(db),
    );
    expect(response.status).toBe(500);
    expect(
      db.db.prepare('SELECT homework FROM progress_updates WHERE id=?').get(published.id),
    ).toMatchObject({ homework: 'Before' });
    expect(db.count('homework_revisions')).toBe(0);
    expect(db.count('audit_log')).toBe(audits);
  });

  it('returns the same revision for same-key retries and rejects different payload reuse', async () => {
    auth('teacher', 'org-a', 'teacher');
    const published = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'idem-base',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          homework: 'Before',
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    const path = `/api/v1/progress-updates/${published.id}/homework`;
    const first = (await (
      await app.fetch(
        req(path, 'PATCH', {
          homework: 'After',
          notifyGuardians: false,
          operationKey: 'stable-operation',
        }),
        env(db),
      )
    ).json()) as any;
    const repeat = (await (
      await app.fetch(
        req(path, 'PATCH', {
          homework: ' After ',
          notifyGuardians: false,
          operationKey: 'stable-operation',
        }),
        env(db),
      )
    ).json()) as any;
    expect(repeat.storage.status).toBe('idempotent');
    expect(repeat.storage.revision.id).toBe(first.storage.revision.id);
    expect(db.count('homework_revisions')).toBe(1);
    expect(
      (
        await app.fetch(
          req(path, 'PATCH', {
            homework: 'Different',
            notifyGuardians: false,
            operationKey: 'stable-operation',
          }),
          env(db),
        )
      ).status,
    ).toBe(409);
  });

  it('sends one escaped localized homework email and reports its aggregate truthfully', async () => {
    auth();
    const guardian = (await (
      await app.fetch(
        req('/api/v1/guardians', 'POST', {
          name: 'Veli',
          email: 'veli@example.com',
          active: true,
          preferred_locale: 'tr',
        }),
        env(db),
      )
    ).json()) as any;
    await app.fetch(
      req('/api/v1/student-guardians', 'POST', {
        student_id: 'stu-a',
        guardian_id: guardian.id,
        receive_notifications: true,
      }),
      env(db),
    );
    auth('teacher', 'org-a', 'teacher');
    const published = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'mail-base',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          homework: 'Before',
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    submitRelayMail.mockClear();
    db.preparedSql = [];
    let notificationBatchSql: string[] = [];
    db.beforeBatch = (statements) => {
      notificationBatchSql = statements.map((statement) => statement.sql);
    };
    const result = (await (
      await app.fetch(
        req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', {
          homework: '<b>Yeni & ödev</b>',
          notifyGuardians: true,
          operationKey: 'mail-operation',
        }),
        env(db),
      )
    ).json()) as any;
    expect(result.notificationAggregate.code).toBe('notifications_submitted');
    expect(notificationBatchSql).toHaveLength(4);
    expect(notificationBatchSql.join('\n')).toContain('homework_revision_recipients');
    expect(db.count('homework_revision_recipients')).toBe(1);
    expect(submitRelayMail).toHaveBeenCalledTimes(1);
    expect(submitRelayMail.mock.calls[0][1].subject).toContain('ödev güncellemesi');
    expect(submitRelayMail.mock.calls[0][1].html).toContain('&lt;b&gt;Yeni &amp; ödev&lt;/b&gt;');
    const repeat = (await (
      await app.fetch(
        req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', {
          homework: '<b>Yeni & ödev</b>',
          notifyGuardians: true,
          operationKey: 'mail-operation',
        }),
        env(db),
      )
    ).json()) as any;
    expect(repeat.notificationAggregate.code).toBe('already_notified');
    expect(submitRelayMail).toHaveBeenCalledTimes(1);
  });

  it('resolves concurrent same-operation-key homework requests to one revision and audit', async () => {
    auth();
    const guardian = (await (
      await app.fetch(
        req('/api/v1/guardians', 'POST', {
          name: 'Concurrent Parent',
          email: 'concurrent-homework@example.com',
          active: true,
        }),
        env(db),
      )
    ).json()) as any;
    await app.fetch(
      req('/api/v1/student-guardians', 'POST', {
        student_id: 'stu-a',
        guardian_id: guardian.id,
        receive_notifications: true,
      }),
      env(db),
    );
    auth('teacher', 'org-a', 'teacher');
    const published = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'concurrent-homework-base',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          homework: 'Before',
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    submitRelayMail.mockClear();
    const payload = {
      homework: 'After',
      notifyGuardians: true,
      operationKey: 'same-concurrent-operation',
    };
    let announceCommit!: () => void;
    let releaseWinner!: () => void;
    const committed = new Promise<void>((resolve) => (announceCommit = resolve));
    const winnerMayNotify = new Promise<void>((resolve) => (releaseWinner = resolve));
    db.afterHomeworkRevisionCommit = async () => {
      announceCommit();
      await winnerMayNotify;
    };
    const winnerRequest = app.fetch(
      req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', payload),
      env(db),
    );
    await committed;
    const loserResponse = await app.fetch(
      req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', payload),
      env(db),
    );
    const loser = (await loserResponse.json()) as any;
    expect(loserResponse.status).toBe(200);
    expect(loser.storage.status).toBe('idempotent');
    expect(loser.notificationAggregate.code).toBe('notifications_submitted');
    expect(
      db.db
        .prepare('SELECT count(*) count FROM notification_log WHERE source_revision_id IS NOT NULL')
        .get(),
    ).toMatchObject({ count: 1 });
    expect(submitRelayMail).toHaveBeenCalledTimes(1);
    releaseWinner();
    const winnerResponse = await winnerRequest;
    const winner = (await winnerResponse.json()) as any;
    const values = [winner, loser];
    expect(new Set(values.map((value) => value.storage.revision.id)).size).toBe(1);
    expect(values.map((value) => value.storage.status).sort()).toEqual(['idempotent', 'updated']);
    expect(db.count('homework_revisions')).toBe(1);
    expect(
      db.db
        .prepare(
          "SELECT count(*) count FROM audit_log WHERE action='progress.homework_updated' AND entity_id IN (SELECT id FROM homework_revisions WHERE progress_update_id=?)",
        )
        .get(published.id),
    ).toMatchObject({ count: 1 });
    expect(
      db.db
        .prepare('SELECT count(*) count FROM notification_log WHERE source_revision_id IS NOT NULL')
        .get(),
    ).toMatchObject({ count: 1 });
    expect(
      db.db
        .prepare(
          'SELECT count(*) count FROM notification_attempts WHERE notification_log_id IN (SELECT id FROM notification_log WHERE source_revision_id IS NOT NULL)',
        )
        .get(),
    ).toMatchObject({ count: 1 });
    expect(submitRelayMail).toHaveBeenCalledTimes(1);
    const replay = (await (
      await app.fetch(
        req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', payload),
        env(db),
      )
    ).json()) as any;
    expect(replay.notificationAggregate.code).toBe('already_notified');
  });

  it('resumes a committed homework notification snapshot after interruption', async () => {
    auth();
    const guardian = (await (
      await app.fetch(
        req('/api/v1/guardians', 'POST', {
          name: 'Snapshot Parent',
          email: 'snapshot@example.com',
          active: true,
        }),
        env(db),
      )
    ).json()) as any;
    await app.fetch(
      req('/api/v1/student-guardians', 'POST', {
        student_id: 'stu-a',
        guardian_id: guardian.id,
        receive_notifications: true,
      }),
      env(db),
    );
    auth('teacher', 'org-a', 'teacher');
    const published = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'interrupted-homework-base',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          homework: 'Before',
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    submitRelayMail.mockClear();
    const payload = {
      homework: 'After interruption',
      notifyGuardians: true,
      operationKey: 'interrupted-homework-operation',
    };
    db.afterHomeworkRevisionCommit = async () => {
      db.afterHomeworkRevisionCommit = undefined;
      throw new Error('simulated_process_interruption');
    };
    expect(
      (
        await app.fetch(
          req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', payload),
          env(db),
        )
      ).status,
    ).toBe(500);
    expect(db.count('homework_revisions')).toBe(1);
    expect(db.count('homework_revision_recipients')).toBe(1);
    expect(db.count('notification_log')).toBe(1); // publication notification only
    auth();
    const laterGuardian = (await (
      await app.fetch(
        req('/api/v1/guardians', 'POST', {
          name: 'Later Parent',
          email: 'later-snapshot@example.com',
          active: true,
        }),
        env(db),
      )
    ).json()) as any;
    await app.fetch(
      req('/api/v1/student-guardians', 'POST', {
        student_id: 'stu-a',
        guardian_id: laterGuardian.id,
        receive_notifications: true,
      }),
      env(db),
    );
    auth('teacher', 'org-a', 'teacher');
    submitRelayMail.mockClear();

    const replay = await app.fetch(
      req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', payload),
      env(db),
    );
    const result = (await replay.json()) as any;
    expect(replay.status).toBe(200);
    expect(result.storage.status).toBe('idempotent');
    expect(result.notificationAggregate.code).toBe('notifications_submitted');
    expect(
      db.db
        .prepare(
          "SELECT count(*) count FROM notification_log WHERE notification_type='homework_update'",
        )
        .get(),
    ).toMatchObject({ count: 1 });
    expect(submitRelayMail).toHaveBeenCalledTimes(1);
    expect(submitRelayMail.mock.calls[0][1].to).toBe('snapshot@example.com');
  });

  it('reports a persisted pending homework reservation as ambiguous', async () => {
    auth();
    const guardian = (await (
      await app.fetch(
        req('/api/v1/guardians', 'POST', {
          name: 'Pending Parent',
          email: 'pending-snapshot@example.com',
          active: true,
        }),
        env(db),
      )
    ).json()) as any;
    await app.fetch(
      req('/api/v1/student-guardians', 'POST', {
        student_id: 'stu-a',
        guardian_id: guardian.id,
        receive_notifications: true,
      }),
      env(db),
    );
    auth('teacher', 'org-a', 'teacher');
    const published = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'pending-homework-base',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          homework: 'Before',
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    let relayStarted!: () => void;
    let releaseRelay!: () => void;
    const started = new Promise<void>((resolve) => (relayStarted = resolve));
    const released = new Promise<void>((resolve) => (releaseRelay = resolve));
    submitRelayMail.mockClear();
    submitRelayMail.mockImplementationOnce(async () => {
      relayStarted();
      await released;
      return { status: 'accepted' };
    });
    const payload = {
      homework: 'Pending homework',
      notifyGuardians: true,
      operationKey: 'pending-homework-operation',
    };
    const winner = app.fetch(
      req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', payload),
      env(db),
    );
    await started;
    const replay = (await (
      await app.fetch(
        req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', payload),
        env(db),
      )
    ).json()) as any;
    expect(replay.storage.status).toBe('idempotent');
    expect(replay.notificationAggregate.code).toBe('notification_ambiguous');
    expect(
      db.db
        .prepare(
          "SELECT count(*) count FROM notification_log WHERE notification_type='homework_update' AND status='pending'",
        )
        .get(),
    ).toMatchObject({ count: 1 });
    releaseRelay();
    expect((await (await winner).json()) as any).toMatchObject({
      notificationAggregate: { code: 'notifications_submitted' },
    });
    expect(submitRelayMail).toHaveBeenCalledTimes(1);
  });

  it('truthfully reports a recoverable homework reservation failure', async () => {
    auth();
    const guardian = (await (
      await app.fetch(
        req('/api/v1/guardians', 'POST', {
          name: 'Recovery Parent',
          email: 'recovery@example.com',
          active: true,
        }),
        env(db),
      )
    ).json()) as any;
    await app.fetch(
      req('/api/v1/student-guardians', 'POST', {
        student_id: 'stu-a',
        guardian_id: guardian.id,
        receive_notifications: true,
      }),
      env(db),
    );
    auth('teacher', 'org-a', 'teacher');
    const published = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'reservation-failure-base',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          homework: 'Before',
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    const payload = {
      homework: 'Recover this',
      notifyGuardians: true,
      operationKey: 'reservation-failure-operation',
    };
    db.afterHomeworkRevisionCommit = async () => {
      db.afterHomeworkRevisionCommit = undefined;
      db.failBatchAt = 1;
    };
    submitRelayMail.mockClear();
    const first = (await (
      await app.fetch(
        req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', payload),
        env(db),
      )
    ).json()) as any;
    expect(first.notificationAggregate.code).toBe('notification_preparation_failed');
    expect(submitRelayMail).not.toHaveBeenCalled();
    db.failBatchAt = 0;
    const replay = (await (
      await app.fetch(
        req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', payload),
        env(db),
      )
    ).json()) as any;
    expect(replay.storage.status).toBe('idempotent');
    expect(replay.notificationAggregate.code).toBe('notifications_submitted');
    expect(submitRelayMail).toHaveBeenCalledTimes(1);
  });

  it('reports true zero-recipient idempotent homework operations as no recipients', async () => {
    auth('teacher', 'org-a', 'teacher');
    const published = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'zero-homework-base',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          homework: 'Before',
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    const payload = {
      homework: 'After',
      notifyGuardians: true,
      operationKey: 'zero-homework-operation',
    };
    const first = (await (
      await app.fetch(
        req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', payload),
        env(db),
      )
    ).json()) as any;
    expect(first.notificationAggregate.code).toBe('no_recipients');
    const replay = (await (
      await app.fetch(
        req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', payload),
        env(db),
      )
    ).json()) as any;
    expect(replay.storage.status).toBe('idempotent');
    expect(replay.notificationAggregate.code).toBe('no_recipients');
  });

  it('reports persisted ambiguous homework notification state without resubmitting', async () => {
    auth();
    const guardian = (await (
      await app.fetch(
        req('/api/v1/guardians', 'POST', {
          name: 'Ambiguous Parent',
          email: 'ambiguous-recovery@example.com',
          active: true,
        }),
        env(db),
      )
    ).json()) as any;
    await app.fetch(
      req('/api/v1/student-guardians', 'POST', {
        student_id: 'stu-a',
        guardian_id: guardian.id,
        receive_notifications: true,
      }),
      env(db),
    );
    auth('teacher', 'org-a', 'teacher');
    const published = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'ambiguous-recovery-base',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          homework: 'Before',
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    submitRelayMail.mockClear();
    submitRelayMail.mockResolvedValue({ status: 'ambiguous' });
    const payload = {
      homework: 'Ambiguous homework',
      notifyGuardians: true,
      operationKey: 'ambiguous-homework-operation',
    };
    const first = (await (
      await app.fetch(
        req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', payload),
        env(db),
      )
    ).json()) as any;
    expect(first.notificationAggregate.code).toBe('notification_ambiguous');
    expect(submitRelayMail).toHaveBeenCalledTimes(1);
    const notifications = db.count('notification_log');
    const attempts = db.count('notification_attempts');
    const audits = db.count('audit_log');
    expect(
      db.db
        .prepare(
          "SELECT nl.status,na.status attempt_status FROM notification_log nl JOIN notification_attempts na ON na.notification_log_id=nl.id WHERE nl.notification_type='homework_update'",
        )
        .get(),
    ).toMatchObject({ status: 'pending', attempt_status: 'pending' });
    const replay = (await (
      await app.fetch(
        req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', payload),
        env(db),
      )
    ).json()) as any;
    expect(replay.storage.status).toBe('idempotent');
    expect(replay.notificationAggregate.code).toBe('notification_ambiguous');
    expect(replay.notification).toEqual([
      expect.objectContaining({ status: 'ambiguous', retryAvailable: false }),
    ]);
    expect(submitRelayMail).toHaveBeenCalledTimes(1);
    expect(db.count('notification_log')).toBe(notifications);
    expect(db.count('notification_attempts')).toBe(attempts);
    expect(db.count('audit_log')).toBe(audits);
  });

  it('leaves no residue when a different operation key loses the concurrent homework race', async () => {
    auth('teacher', 'org-a', 'teacher');
    const published = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'different-race-base',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          homework: 'Before',
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    const auditBefore = db.count('audit_log');
    db.beforeBatch = () => undefined;
    const responses = await Promise.all(
      ['race-operation-one', 'race-operation-two'].map((operationKey) =>
        app.fetch(
          req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', {
            homework: 'After',
            notifyGuardians: false,
            operationKey,
          }),
          env(db),
        ),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(db.count('homework_revisions')).toBe(1);
    expect(db.count('audit_log')).toBe(auditBefore + 1);
    expect(db.count('notification_log')).toBe(0);
    expect(db.count('notification_attempts')).toBe(0);
    expect(submitRelayMail).not.toHaveBeenCalled();
  });

  it('continues notification processing after a concurrent publication collision', async () => {
    auth();
    const guardian = (await (
      await app.fetch(
        req('/api/v1/guardians', 'POST', {
          name: 'Collision Parent',
          email: 'collision@example.com',
          active: true,
        }),
        env(db),
      )
    ).json()) as any;
    await app.fetch(
      req('/api/v1/student-guardians', 'POST', {
        student_id: 'stu-a',
        guardian_id: guardian.id,
        receive_notifications: true,
      }),
      env(db),
    );
    auth('teacher', 'org-a', 'teacher');
    submitRelayMail.mockClear();
    let publicationCommitted!: () => void;
    let releaseWinner!: () => void;
    const committed = new Promise<void>((resolve) => (publicationCommitted = resolve));
    const winnerMayContinue = new Promise<void>((resolve) => (releaseWinner = resolve));
    db.afterProgressPublicationCommit = async () => {
      db.afterProgressPublicationCommit = undefined;
      publicationCommitted();
      await winnerMayContinue;
    };
    const payload = {
      operation_key: 'same-publication-collision-key',
      student_id: 'stu-a',
      class_id: 'class-a',
      status: 'published',
      homework: 'Included homework',
      items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
    };
    const winnerRequest = app.fetch(req('/api/v1/progress-updates', 'POST', payload), env(db));
    await committed;
    const loserResponse = await app.fetch(
      req('/api/v1/progress-updates', 'POST', payload),
      env(db),
    );
    const loser = (await loserResponse.json()) as any;
    expect(loserResponse.status).toBe(200);
    expect(loser.idempotent).toBe(true);
    expect(loser.publication).toBe('notifications_submitted');
    expect(loser.notificationAggregate.code).toBe('notifications_submitted');
    expect(loser.notification).toHaveLength(1);
    expect(loser.publication).not.toBe('already_published');
    releaseWinner();
    const winner = (await (await winnerRequest).json()) as any;
    expect(winner.id).toBe(loser.id);
    expect(winner.notificationAggregate.code).toBe('already_notified');
    expect(submitRelayMail).toHaveBeenCalledTimes(1);
    expect(
      db.db
        .prepare('SELECT count(*) count FROM notification_log WHERE progress_update_id=?')
        .get(loser.id),
    ).toMatchObject({ count: 1 });
    expect(
      db.db
        .prepare(
          'SELECT count(*) count FROM notification_attempts WHERE notification_log_id IN (SELECT id FROM notification_log WHERE progress_update_id=?)',
        )
        .get(loser.id),
    ).toMatchObject({ count: 1 });
    expect(
      db.db.prepare("SELECT count(*) count FROM audit_log WHERE action='progress.publish'").get(),
    ).toMatchObject({ count: 1 });
  });

  it('scopes administrator, teacher, and concurrent retries to the selected notification row', async () => {
    auth();
    for (const [name, email] of [
      ['First', 'first-retry@example.com'],
      ['Second', 'second-retry@example.com'],
      ['Third', 'third-retry@example.com'],
    ]) {
      const guardian = (await (
        await app.fetch(req('/api/v1/guardians', 'POST', { name, email, active: true }), env(db))
      ).json()) as any;
      await app.fetch(
        req('/api/v1/student-guardians', 'POST', {
          student_id: 'stu-a',
          guardian_id: guardian.id,
          receive_notifications: true,
        }),
        env(db),
      );
    }
    submitRelayMail.mockResolvedValue({
      status: 'rejected_before_send',
      rejectionCode: 'invalid_recipient',
    });
    auth('teacher', 'org-a', 'teacher');
    const published = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'row-retry-base',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    const logs = db.db
      .prepare(
        'SELECT id,guardian_id,recipient_email FROM notification_log WHERE progress_update_id=? ORDER BY recipient_email',
      )
      .all(published.id) as any[];
    expect(logs).toHaveLength(3);
    submitRelayMail.mockClear();
    submitRelayMail.mockResolvedValue({ status: 'accepted' });
    db.db
      .prepare('UPDATE guardians SET email=? WHERE id=?')
      .run('changed@example.com', logs[0].guardian_id);
    auth();
    expect(
      (await app.fetch(req(`/api/v1/notifications/${logs[0].id}/retry`, 'POST'), env(db))).status,
    ).toBe(200);
    expect(submitRelayMail).toHaveBeenCalledTimes(1);
    expect(submitRelayMail.mock.calls[0][1].to).toBe(logs[0].recipient_email);
    expect(
      db.db.prepare('SELECT status FROM notification_log WHERE id=?').get(logs[1].id),
    ).toMatchObject({ status: 'failed' });
    const later = (await (
      await app.fetch(
        req('/api/v1/guardians', 'POST', {
          name: 'Later',
          email: 'later-retry@example.com',
          active: true,
        }),
        env(db),
      )
    ).json()) as any;
    await app.fetch(
      req('/api/v1/student-guardians', 'POST', {
        student_id: 'stu-a',
        guardian_id: later.id,
        receive_notifications: true,
      }),
      env(db),
    );
    auth('teacher', 'org-a', 'teacher');
    expect(
      (
        await app.fetch(
          req(
            `/api/v1/progress-updates/${published.id}/notify?retry=1&notificationId=${logs[1].id}`,
            'POST',
          ),
          env(db),
        )
      ).status,
    ).toBe(200);
    expect(submitRelayMail).toHaveBeenCalledTimes(2);
    expect(submitRelayMail.mock.calls.map((call) => call[1].to)).not.toContain(
      'later-retry@example.com',
    );
    auth();
    const concurrent = await Promise.all([
      app.fetch(req(`/api/v1/notifications/${logs[2].id}/retry`, 'POST'), env(db)),
      app.fetch(req(`/api/v1/notifications/${logs[2].id}/retry`, 'POST'), env(db)),
    ]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([200, 200]);
    expect(submitRelayMail).toHaveBeenCalledTimes(3);
    expect(db.count('notification_attempts')).toBe(6);
    expect(
      db.db
        .prepare(
          "SELECT count(*) count FROM audit_log WHERE action IN ('notification.retry_reserved','notification.retry_requested')",
        )
        .get(),
    ).toMatchObject({ count: 3 });
    expect(
      (await app.fetch(req(`/api/v1/notifications/${logs[0].id}/retry`, 'POST'), env(db))).status,
    ).toBe(404);
    auth('organization_admin', 'org-b', 'admin-b');
    expect(
      (await app.fetch(req(`/api/v1/notifications/${logs[0].id}/retry`, 'POST'), env(db))).status,
    ).toBe(404);
  });

  it.each([
    ['progress_update', 'pending', 'notification_in_progress'],
    ['progress_update', 'sent', 'already_notified'],
    ['homework_update', 'pending', 'notification_in_progress'],
    ['homework_update', 'sent', 'already_notified'],
  ])(
    'returns %s concurrent retry losers as %s without duplicate side effects',
    async (notificationType, ordering, expectedCode) => {
      auth();
      for (const suffix of ['selected', 'other']) {
        const guardian = (await (
          await app.fetch(
            req('/api/v1/guardians', 'POST', {
              name: `${suffix} concurrent parent`,
              email: `${suffix}-${notificationType}-${ordering}@example.com`,
              active: true,
            }),
            env(db),
          )
        ).json()) as any;
        await app.fetch(
          req('/api/v1/student-guardians', 'POST', {
            student_id: 'stu-a',
            guardian_id: guardian.id,
            receive_notifications: true,
          }),
          env(db),
        );
      }
      auth('teacher', 'org-a', 'teacher');
      submitRelayMail.mockResolvedValue(
        notificationType === 'progress_update'
          ? { status: 'rejected_before_send', rejectionCode: 'invalid_recipient' }
          : { status: 'accepted' },
      );
      const published = (await (
        await app.fetch(
          req('/api/v1/progress-updates', 'POST', {
            operation_key: `concurrent-${notificationType}-${ordering}`,
            student_id: 'stu-a',
            class_id: 'class-a',
            status: 'published',
            homework: 'Before',
            items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
          }),
          env(db),
        )
      ).json()) as any;
      if (notificationType === 'homework_update') {
        submitRelayMail.mockResolvedValue({
          status: 'rejected_before_send',
          rejectionCode: 'invalid_recipient',
        });
        await app.fetch(
          req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', {
            homework: 'After',
            notifyGuardians: true,
            operationKey: `homework-concurrent-${ordering}`,
          }),
          env(db),
        );
      }
      const logs = db.db
        .prepare(
          'SELECT id,status FROM notification_log WHERE progress_update_id=? AND notification_type=? ORDER BY recipient_email',
        )
        .all(published.id, notificationType) as { id: string; status: string }[];
      expect(logs).toHaveLength(2);
      expect(logs.every((log) => log.status === 'failed')).toBe(true);
      const selectedId = logs[0].id;
      const otherId = logs[1].id;
      const attemptsBefore = db.count('notification_attempts');
      const retryAuditsBefore = Number(
        (
          db.db
            .prepare(
              "SELECT count(*) count FROM audit_log WHERE action IN ('notification.retry_reserved','notification.retry_requested')",
            )
            .get() as { count: number }
        ).count,
      );

      let firstPaused!: () => void;
      let bothSelected!: () => void;
      let releaseLoser!: () => void;
      const firstIsPaused = new Promise<void>((resolve) => (firstPaused = resolve));
      const bothAreSelected = new Promise<void>((resolve) => (bothSelected = resolve));
      const loserMayContinue = new Promise<void>((resolve) => (releaseLoser = resolve));
      let selections = 0;
      db.afterRetrySelection = async () => {
        selections += 1;
        if (selections === 1) {
          firstPaused();
          await bothAreSelected;
        } else {
          bothSelected();
          await loserMayContinue;
        }
      };
      let relayStarted!: () => void;
      let releaseRelay!: () => void;
      const relayHasStarted = new Promise<void>((resolve) => (relayStarted = resolve));
      const relayMayComplete = new Promise<void>((resolve) => (releaseRelay = resolve));
      submitRelayMail.mockClear();
      submitRelayMail.mockImplementationOnce(async () => {
        relayStarted();
        if (ordering === 'pending') await relayMayComplete;
        return { status: 'accepted' };
      });
      auth();
      const winnerRequest = app.fetch(
        req(`/api/v1/notifications/${selectedId}/retry`, 'POST'),
        env(db),
      );
      await firstIsPaused;
      const loserRequest = app.fetch(
        req(`/api/v1/notifications/${selectedId}/retry`, 'POST'),
        env(db),
      );
      await relayHasStarted;
      if (ordering === 'sent') await winnerRequest;
      releaseLoser();
      const loser = (await (await loserRequest).json()) as any;
      expect(loser.aggregate.code).toBe(expectedCode);
      if (ordering === 'pending') releaseRelay();
      await winnerRequest;
      db.afterRetrySelection = undefined;

      expect(submitRelayMail).toHaveBeenCalledTimes(1);
      expect(db.count('notification_attempts')).toBe(attemptsBefore + 1);
      expect(
        db.db.prepare('SELECT status FROM notification_log WHERE id=?').get(otherId),
      ).toMatchObject({ status: 'failed' });
      expect(
        db.db
          .prepare(
            "SELECT count(*) count FROM audit_log WHERE action IN ('notification.retry_reserved','notification.retry_requested')",
          )
          .get(),
      ).toMatchObject({ count: retryAuditsBefore + 1 });
    },
  );

  it.each(['progress_update', 'homework_update'])(
    'recovers %s relay-rejection finalization without resubmitting',
    async (notificationType) => {
      auth();
      for (const suffix of ['recovery-selected', 'recovery-other']) {
        const guardian = (await (
          await app.fetch(
            req('/api/v1/guardians', 'POST', {
              name: suffix,
              email: `${suffix}-${notificationType}@example.com`,
              active: true,
            }),
            env(db),
          )
        ).json()) as any;
        await app.fetch(
          req('/api/v1/student-guardians', 'POST', {
            student_id: 'stu-a',
            guardian_id: guardian.id,
            receive_notifications: true,
          }),
          env(db),
        );
      }
      auth('teacher', 'org-a', 'teacher');
      submitRelayMail.mockResolvedValue(
        notificationType === 'progress_update'
          ? { status: 'rejected_before_send', rejectionCode: 'invalid_recipient' }
          : { status: 'accepted' },
      );
      if (notificationType === 'progress_update') db.failRejectionFinalizationOnce = true;
      const published = (await (
        await app.fetch(
          req('/api/v1/progress-updates', 'POST', {
            operation_key: `rejection-recovery-${notificationType}`,
            student_id: 'stu-a',
            class_id: 'class-a',
            status: 'published',
            homework: 'Before',
            items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
          }),
          env(db),
        )
      ).json()) as any;
      let initialResult = published;
      if (notificationType === 'homework_update') {
        submitRelayMail.mockClear();
        submitRelayMail.mockResolvedValue({
          status: 'rejected_before_send',
          rejectionCode: 'invalid_recipient',
        });
        db.failRejectionFinalizationOnce = true;
        initialResult = (await (
          await app.fetch(
            req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', {
              homework: 'After rejection',
              notifyGuardians: true,
              operationKey: 'homework-rejection-recovery',
            }),
            env(db),
          )
        ).json()) as any;
      }
      expect(initialResult.notificationAggregate.code).toBe('notification_failed');
      expect(submitRelayMail).toHaveBeenCalledTimes(2);
      const logs = db.db
        .prepare(
          `SELECT id,status,error_code FROM notification_log
           WHERE progress_update_id=? AND notification_type=? ORDER BY recipient_email`,
        )
        .all(published.id, notificationType) as {
        id: string;
        status: string;
        error_code: string;
      }[];
      expect(logs).toHaveLength(2);
      expect(logs).toEqual([
        expect.objectContaining({ status: 'failed', error_code: 'RELAY_REJECTED' }),
        expect.objectContaining({ status: 'failed', error_code: 'RELAY_REJECTED' }),
      ]);
      const selectedId = logs[0].id;
      const otherId = logs[1].id;
      expect(
        db.db
          .prepare(
            `SELECT count(*) count FROM notification_attempts
             WHERE notification_log_id IN (?,?) AND status='failed' AND error_code='RELAY_REJECTED'`,
          )
          .get(selectedId, otherId),
      ).toMatchObject({ count: 2 });
      expect(
        db.db
          .prepare(
            "SELECT count(*) count FROM audit_log WHERE action='notification.relay_failed' AND entity_id IN (?,?)",
          )
          .get(selectedId, otherId),
      ).toMatchObject({ count: 2 });

      submitRelayMail.mockClear();
      submitRelayMail.mockResolvedValue({
        status: 'rejected_before_send',
        rejectionCode: 'invalid_recipient',
      });
      db.throwAfterRejectionFinalizationCommitOnce = true;
      auth();
      const retry = (await (
        await app.fetch(req(`/api/v1/notifications/${selectedId}/retry`, 'POST'), env(db))
      ).json()) as any;
      expect(retry.aggregate.code).toBe('notification_failed');
      expect(retry.results).toEqual([
        expect.objectContaining({ status: 'failed', retryAvailable: true }),
      ]);
      expect(submitRelayMail).toHaveBeenCalledTimes(1);
      expect(
        db.db
          .prepare('SELECT count(*) count FROM notification_attempts WHERE notification_log_id=?')
          .get(selectedId),
      ).toMatchObject({ count: 2 });
      expect(
        db.db
          .prepare(
            "SELECT count(*) count FROM audit_log WHERE action='notification.relay_failed' AND entity_id=?",
          )
          .get(selectedId),
      ).toMatchObject({ count: 2 });
      expect(
        db.db.prepare('SELECT status FROM notification_log WHERE id=?').get(otherId),
      ).toMatchObject({ status: 'failed' });
      expect(
        db.db
          .prepare('SELECT count(*) count FROM notification_attempts WHERE notification_log_id=?')
          .get(otherId),
      ).toMatchObject({ count: 1 });

      submitRelayMail.mockResolvedValue({ status: 'accepted' });
      expect(
        (await app.fetch(req(`/api/v1/notifications/${selectedId}/retry`, 'POST'), env(db))).status,
      ).toBe(200);
      expect(submitRelayMail).toHaveBeenCalledTimes(2);
      auth('organization_admin', 'org-b', 'admin-b');
      expect(
        (await app.fetch(req(`/api/v1/notifications/${otherId}/retry`, 'POST'), env(db))).status,
      ).toBe(404);
    },
  );

  it.each([
    ['pending', 'accepted', 'notification_in_progress'],
    ['sent', 'accepted', 'already_notified'],
    ['failed', 'rejected_before_send', 'notification_failed'],
  ])(
    're-reads a homework reservation loser after the winner becomes %s',
    async (winnerState, relayOutcome, loserCode) => {
      auth();
      const guardian = (await (
        await app.fetch(
          req('/api/v1/guardians', 'POST', {
            name: 'Reservation Parent',
            email: `reservation-${winnerState}@example.com`,
            active: true,
          }),
          env(db),
        )
      ).json()) as any;
      await app.fetch(
        req('/api/v1/student-guardians', 'POST', {
          student_id: 'stu-a',
          guardian_id: guardian.id,
          receive_notifications: true,
        }),
        env(db),
      );
      auth('teacher', 'org-a', 'teacher');
      const published = (await (
        await app.fetch(
          req('/api/v1/progress-updates', 'POST', {
            operation_key: `reservation-base-${winnerState}`,
            student_id: 'stu-a',
            class_id: 'class-a',
            status: 'published',
            homework: 'Before',
            items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
          }),
          env(db),
        )
      ).json()) as any;
      submitRelayMail.mockResolvedValue({
        status: 'rejected_before_send',
        rejectionCode: 'invalid_recipient',
      });
      await app.fetch(
        req(`/api/v1/progress-updates/${published.id}/homework`, 'PATCH', {
          homework: 'After',
          notifyGuardians: true,
          operationKey: `reservation-homework-${winnerState}`,
        }),
        env(db),
      );
      const log = db.db
        .prepare(
          "SELECT id FROM notification_log WHERE progress_update_id=? AND notification_type='homework_update'",
        )
        .get(published.id) as { id: string };
      const attemptsBefore = db.count('notification_attempts');
      const auditsBefore = Number(
        (
          db.db
            .prepare(
              "SELECT count(*) count FROM audit_log WHERE action='notification.retry_requested'",
            )
            .get() as { count: number }
        ).count,
      );
      let firstRead!: () => void;
      let bothRead!: () => void;
      let releaseLoser!: () => void;
      const firstHasRead = new Promise<void>((resolve) => (firstRead = resolve));
      const bothHaveRead = new Promise<void>((resolve) => (bothRead = resolve));
      const loserMayReserve = new Promise<void>((resolve) => (releaseLoser = resolve));
      let reads = 0;
      db.afterHomeworkRetryPriorRead = async () => {
        reads += 1;
        if (reads === 1) {
          firstRead();
          await bothHaveRead;
        } else {
          bothRead();
          await loserMayReserve;
        }
      };
      let relayStarted!: () => void;
      let releaseRelay!: () => void;
      const relayHasStarted = new Promise<void>((resolve) => (relayStarted = resolve));
      const relayMayFinish = new Promise<void>((resolve) => (releaseRelay = resolve));
      submitRelayMail.mockClear();
      submitRelayMail.mockImplementationOnce(async () => {
        relayStarted();
        if (winnerState === 'pending') await relayMayFinish;
        return { status: relayOutcome };
      });
      auth();
      const winnerRequest = app.fetch(
        req(`/api/v1/notifications/${log.id}/retry`, 'POST'),
        env(db),
      );
      await firstHasRead;
      const loserRequest = app.fetch(req(`/api/v1/notifications/${log.id}/retry`, 'POST'), env(db));
      await relayHasStarted;
      if (winnerState !== 'pending') await winnerRequest;
      releaseLoser();
      const loser = (await (await loserRequest).json()) as any;
      expect(loser.aggregate.code).toBe(loserCode);
      if (winnerState === 'pending') releaseRelay();
      await winnerRequest;
      expect(submitRelayMail).toHaveBeenCalledTimes(1);
      expect(db.count('notification_attempts')).toBe(attemptsBefore + 1);
      expect(
        db.db
          .prepare(
            "SELECT count(*) count FROM audit_log WHERE action='notification.retry_requested'",
          )
          .get(),
      ).toMatchObject({ count: auditsBefore + 1 });
      db.afterHomeworkRetryPriorRead = undefined;
    },
  );

  it('rejects retries when the selected guardian is no longer eligible', async () => {
    auth();
    const guardians: any[] = [];
    for (const suffix of ['disabled', 'unlinked', 'inactive']) {
      const guardian = (await (
        await app.fetch(
          req('/api/v1/guardians', 'POST', {
            name: suffix,
            email: `${suffix}@example.com`,
            active: true,
          }),
          env(db),
        )
      ).json()) as any;
      guardians.push(guardian);
      await app.fetch(
        req('/api/v1/student-guardians', 'POST', {
          student_id: 'stu-a',
          guardian_id: guardian.id,
          receive_notifications: true,
        }),
        env(db),
      );
    }
    submitRelayMail.mockResolvedValue({
      status: 'rejected_before_send',
      rejectionCode: 'invalid_recipient',
    });
    auth('teacher', 'org-a', 'teacher');
    const published = (await (
      await app.fetch(
        req('/api/v1/progress-updates', 'POST', {
          operation_key: 'eligibility-retry-base',
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          items: [{ lesson_id: 'lesson-a', outcome: 'assigned' }],
        }),
        env(db),
      )
    ).json()) as any;
    const logs = db.db
      .prepare('SELECT id,guardian_id FROM notification_log WHERE progress_update_id=?')
      .all(published.id) as any[];
    db.db
      .prepare(
        'UPDATE student_guardians SET receive_notifications=0 WHERE organization_id=? AND student_id=? AND guardian_id=?',
      )
      .run('org-a', 'stu-a', guardians[0].id);
    db.db
      .prepare(
        'DELETE FROM student_guardians WHERE organization_id=? AND student_id=? AND guardian_id=?',
      )
      .run('org-a', 'stu-a', guardians[1].id);
    db.db.prepare('UPDATE guardians SET active=0 WHERE id=?').run(guardians[2].id);
    submitRelayMail.mockClear();
    const attempts = db.count('notification_attempts');
    const audits = db.count('audit_log');

    for (let index = 0; index < logs.length; index++) {
      const log = logs.find((value) => value.guardian_id === guardians[index].id)!;
      const response =
        index === 1
          ? await app.fetch(
              req(
                `/api/v1/progress-updates/${published.id}/notify?retry=1&notificationId=${log.id}`,
                'POST',
              ),
              env(db),
            )
          : (auth(),
            await app.fetch(req(`/api/v1/notifications/${log.id}/retry`, 'POST'), env(db)));
      expect(response.status).toBe(200);
      expect((await response.json()) as any).toMatchObject({
        aggregate: { code: 'notification_not_retryable' },
      });
      auth('teacher', 'org-a', 'teacher');
    }
    expect(submitRelayMail).not.toHaveBeenCalled();
    expect(db.count('notification_attempts')).toBe(attempts);
    expect(db.count('audit_log')).toBe(audits);
  });
});
