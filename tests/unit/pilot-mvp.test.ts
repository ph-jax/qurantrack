/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SqliteD1, base, user, membership, now } from '../helpers/sqliteD1';
const { validateSession } = vi.hoisted(() => ({ validateSession: vi.fn() }));
const { sendRelayMail } = vi.hoisted(() => ({ sendRelayMail: vi.fn() }));
vi.mock('../../worker/auth/service', async (orig) => ({
  ...(await orig<typeof import('../../worker/auth/service')>()),
  validateSession,
}));
vi.mock('../../worker/email/relay', async (orig) => ({
  ...(await orig<typeof import('../../worker/email/relay')>()),
  sendRelayMail,
}));
import app from '../../worker/index';
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
  return new Request(`http://local${path}`, {
    method,
    headers: { cookie: 'qurantrack_session=t', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
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
    sendRelayMail.mockReset();
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
  it('blocks teacher admin mutations and hides unauthorized/cross-org records', async () => {
    auth('teacher', 'org-a', 'teacher');
    expect((await app.fetch(req('/api/v1/classes', 'POST', { name: 'No' }), env(db))).status).toBe(
      403,
    );
    expect((await app.fetch(req('/api/v1/students/stu-b/summary'), env(db))).status).toBe(404);
    const students = (await (await app.fetch(req('/api/v1/students'), env(db))).json()) as any;
    expect(students.students).toHaveLength(1);
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
    expect(sendRelayMail).not.toHaveBeenCalled();
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
    sendRelayMail.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
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
    expect(db.db.prepare('SELECT status FROM notification_log').get()).toMatchObject({
      status: 'failed',
    });
    const pu = (db.db.prepare('SELECT id FROM progress_updates').get() as any).id;
    await app.fetch(req(`/api/v1/progress-updates/${pu}/notify?retry=1`, 'POST'), env(db));
    await app.fetch(req(`/api/v1/progress-updates/${pu}/notify`, 'POST'), env(db));
    expect(sendRelayMail).toHaveBeenCalledTimes(2);
    const msg = sendRelayMail.mock.calls[1][1];
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
          student_id: 'stu-a',
          class_id: 'class-a',
          status: 'published',
          items: [{ lesson_id: 'lesson-a', outcome: 'needs_practice' }],
        }),
        env(db),
      )
    ).json()) as any;
    sendRelayMail.mockResolvedValue(undefined);
    await Promise.all([
      app.fetch(req(`/api/v1/progress-updates/${published.id}/notify`, 'POST'), env(db)),
      app.fetch(req(`/api/v1/progress-updates/${published.id}/notify`, 'POST'), env(db)),
    ]);
    expect(sendRelayMail).toHaveBeenCalledTimes(1);
    expect(sendRelayMail.mock.calls[0][1].text).toContain('Needs practice');
    await app.fetch(
      req(`/api/v1/progress-updates/${published.id}/notify?retry=1`, 'POST'),
      env(db),
    );
    expect(sendRelayMail).toHaveBeenCalledTimes(1);
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
    sendRelayMail.mockRejectedValueOnce(new Error('relay')).mockResolvedValue(undefined);
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
    expect(sendRelayMail).toHaveBeenCalledTimes(1);
    await app.fetch(
      req(`/api/v1/progress-updates/${published.id}/notify?retry=1`, 'POST'),
      env(db),
    );
    expect(sendRelayMail).toHaveBeenCalledTimes(2);
    expect(db.count('notification_attempts')).toBe(2);
  });
});
