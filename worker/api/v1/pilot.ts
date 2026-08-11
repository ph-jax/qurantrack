/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Context } from 'hono';
import { submitRelayMail } from '../../email/relay';
import { resolveSender } from '../../email/sender';
import type { Env, Variables } from '../../types/env';

type Ctx = Context<{ Bindings: Env; Variables: Variables }>;
type Auth = Variables['auth'];
const now = () => new Date().toISOString();
const id = (p: string) => `${p}_${crypto.randomUUID()}`;
const json = (
  c: Ctx,
  code: number,
  message = 'The requested record was not found or is unavailable.',
) =>
  c.json(
    {
      ok: false,
      error: {
        code:
          code === 403
            ? 'FORBIDDEN'
            : code === 400
              ? 'VALIDATION_ERROR'
              : code >= 500
                ? 'INTERNAL_ERROR'
                : 'NOT_FOUND',
        message,
      },
      requestId: c.get('requestId'),
    },
    code as never,
  );
const admin = (a: Auth) => a.role === 'organization_admin';
const teacher = (a: Auth) => a.role === 'teacher';
const esc = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>'"]/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[ch]!,
  );
async function audit(
  c: Ctx,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  metadata?: unknown,
) {
  await c.env.DB.prepare(
    'INSERT INTO audit_log (id,organization_id,actor_user_id,action,entity_type,entity_id,summary,metadata_json,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(
      id('audit'),
      c.get('auth').organizationId,
      c.get('auth').userId,
      action,
      entityType,
      entityId,
      summary,
      metadata ? JSON.stringify(metadata) : null,
      c.get('requestId'),
      now(),
    )
    .run();
}
function auditStatement(
  c: Ctx,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  timestamp: string,
  metadata?: unknown,
) {
  return c.env.DB.prepare(
    'INSERT INTO audit_log (id,organization_id,actor_user_id,action,entity_type,entity_id,summary,metadata_json,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).bind(
    id('audit'),
    c.get('auth').organizationId,
    c.get('auth').userId,
    action,
    entityType,
    entityId,
    summary,
    metadata ? JSON.stringify(metadata) : null,
    c.get('requestId'),
    timestamp,
  );
}
async function canSeeStudent(c: Ctx, studentId: string, classId?: string | null) {
  const a = c.get('auth'),
    org = a.organizationId;
  if (admin(a))
    return !!(await c.env.DB.prepare('SELECT 1 FROM students WHERE id=? AND organization_id=?')
      .bind(studentId, org)
      .first());
  if (!teacher(a)) return false;
  const row = await c.env.DB.prepare(
    `SELECT 1 FROM students s JOIN class_enrollments ce ON ce.student_id=s.id AND ce.organization_id=s.organization_id AND ce.active=1 JOIN classes cl ON cl.id=ce.class_id AND cl.organization_id=s.organization_id AND cl.active=1 JOIN class_teachers ct ON ct.class_id=cl.id AND ct.organization_id=s.organization_id AND ct.user_id=? WHERE s.id=? AND s.organization_id=? AND s.active=1 AND (? IS NULL OR cl.id=?)`,
  )
    .bind(a.userId, studentId, org, classId ?? null, classId ?? null)
    .first();
  return !!row;
}
async function requireAdmin(c: Ctx) {
  return admin(c.get('auth')) ? null : json(c, 403, 'Administrators only.');
}
const body = async (c: Ctx): Promise<any> => await c.req.json().catch(() => ({}));
const param = (c: Ctx, name: string) => c.req.param(name) ?? '';
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const opt = (v: unknown, max = 1000) => {
  const s = str(v, max);
  return s || null;
};
const bool = (v: unknown) => v === true || v === 1 || v === '1';
const isoActivityDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

export async function listClasses(c: Ctx) {
  const a = c.get('auth'),
    org = a.organizationId;
  if (admin(a)) {
    const rows = await c.env.DB.prepare(
      `SELECT c.*, group_concat(u.display_name, ', ') teacher_names FROM classes c LEFT JOIN class_teachers ct ON ct.class_id=c.id AND ct.organization_id=c.organization_id LEFT JOIN users u ON u.id=ct.user_id WHERE c.organization_id=? GROUP BY c.id ORDER BY c.active DESC,c.name`,
    )
      .bind(org)
      .all();
    return c.json({ ok: true, classes: rows.results });
  }
  if (teacher(a)) {
    const rows = await c.env.DB.prepare(
      `SELECT c.id,c.name,c.description,c.meeting_schedule,c.active FROM classes c JOIN class_teachers ct ON ct.class_id=c.id AND ct.organization_id=c.organization_id AND ct.user_id=? WHERE c.organization_id=? AND c.active=1 ORDER BY c.name`,
    )
      .bind(a.userId, org)
      .all();
    return c.json({ ok: true, classes: rows.results });
  }
  return c.json({ ok: true, classes: [] });
}
export async function setupOptions(c: Ctx) {
  const no = await requireAdmin(c);
  if (no) return no;
  const org = c.get('auth').organizationId;
  const [teachers, students, guardians, assignments, enrollments, links] = await Promise.all([
    c.env.DB.prepare(
      `SELECT u.id,u.display_name FROM users u JOIN organization_memberships om ON om.user_id=u.id WHERE om.organization_id=? AND om.role='teacher' AND om.active=1 AND u.active=1 ORDER BY u.display_name`,
    )
      .bind(org)
      .all(),
    c.env.DB.prepare(
      'SELECT id,display_name,active FROM students WHERE organization_id=? ORDER BY display_name',
    )
      .bind(org)
      .all(),
    c.env.DB.prepare(
      'SELECT id,name,email,phone,active,preferred_locale FROM guardians WHERE organization_id=? ORDER BY name',
    )
      .bind(org)
      .all(),
    c.env.DB.prepare(
      `SELECT ct.class_id,ct.user_id,u.display_name FROM class_teachers ct JOIN users u ON u.id=ct.user_id WHERE ct.organization_id=? ORDER BY u.display_name`,
    )
      .bind(org)
      .all(),
    c.env.DB.prepare(
      `SELECT ce.id,ce.class_id,ce.student_id,ce.active,ce.enrolled_at,ce.withdrawn_at,s.display_name FROM class_enrollments ce JOIN students s ON s.id=ce.student_id AND s.organization_id=ce.organization_id WHERE ce.organization_id=? ORDER BY ce.created_at DESC`,
    )
      .bind(org)
      .all(),
    c.env.DB.prepare(
      `SELECT sg.id,sg.student_id,sg.guardian_id,sg.relationship,sg.primary_contact,sg.receive_notifications,g.name,g.email FROM student_guardians sg JOIN guardians g ON g.id=sg.guardian_id AND g.organization_id=sg.organization_id WHERE sg.organization_id=? ORDER BY g.name`,
    )
      .bind(org)
      .all(),
  ]);
  return c.json({
    ok: true,
    teachers: teachers.results,
    students: students.results,
    guardians: guardians.results,
    assignments: assignments.results,
    enrollments: enrollments.results,
    guardianLinks: links.results,
  });
}
export async function saveClass(c: Ctx) {
  const no = await requireAdmin(c);
  if (no) return no;
  const b = await body(c),
    org = c.get('auth').organizationId,
    cid = str(b.id) || id('class'),
    t = now();
  if (!str(b.name, 120)) return json(c, 400);
  const exists = await c.env.DB.prepare('SELECT 1 FROM classes WHERE id=? AND organization_id=?')
    .bind(cid, org)
    .first();
  if (str(b.id) && !exists) return json(c, 404);
  await c.env.DB.prepare(
    exists
      ? 'UPDATE classes SET name=?,description=?,meeting_schedule=?,active=?,updated_at=? WHERE id=? AND organization_id=?'
      : 'INSERT INTO classes (name,description,meeting_schedule,active,updated_at,id,organization_id,created_at) VALUES (?,?,?,?,?,?,?,?)',
  )
    .bind(
      ...(exists
        ? [
            str(b.name, 120),
            opt(b.description),
            opt(b.meeting_schedule),
            bool(b.active) ? 1 : 0,
            t,
            cid,
            org,
          ]
        : [
            str(b.name, 120),
            opt(b.description),
            opt(b.meeting_schedule),
            bool(b.active) ? 1 : 0,
            t,
            cid,
            org,
            t,
          ]),
    )
    .run();
  await audit(c, exists ? 'class.update' : 'class.create', 'class', cid, 'Class saved');
  return c.json({ ok: true, id: cid });
}
export async function classTeachers(c: Ctx) {
  const no = await requireAdmin(c);
  if (no) return no;
  const b = await body(c),
    org = c.get('auth').organizationId,
    classId = param(c, 'id'),
    userId = str(b.user_id);
  const ok = await c.env.DB.prepare(
    "SELECT 1 FROM classes c JOIN organization_memberships om ON om.organization_id=c.organization_id AND om.user_id=? AND om.role='teacher' AND om.active=1 JOIN users u ON u.id=om.user_id AND u.active=1 WHERE c.id=? AND c.organization_id=? AND c.active=1",
  )
    .bind(userId, classId, org)
    .first();
  if (!ok) return json(c, 404);
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO class_teachers (class_id,user_id,organization_id,primary_teacher,created_at) VALUES (?,?,?,?,?)',
  )
    .bind(classId, userId, org, bool(b.primary_teacher) ? 1 : 0, now())
    .run();
  await audit(c, 'class.teacher.assign', 'class', classId, 'Teacher assigned');
  return c.json({ ok: true });
}
export async function removeClassTeacher(c: Ctx) {
  const no = await requireAdmin(c);
  if (no) return no;
  const exists = await c.env.DB.prepare(
    'SELECT 1 FROM class_teachers WHERE class_id=? AND user_id=? AND organization_id=?',
  )
    .bind(param(c, 'id'), param(c, 'userId'), c.get('auth').organizationId)
    .first();
  if (!exists) return json(c, 404);
  await c.env.DB.prepare(
    'DELETE FROM class_teachers WHERE class_id=? AND user_id=? AND organization_id=?',
  )
    .bind(param(c, 'id'), param(c, 'userId'), c.get('auth').organizationId)
    .run();
  await audit(c, 'class.teacher.remove', 'class', param(c, 'id'), 'Teacher removed');
  return c.json({ ok: true });
}
export async function classRoster(c: Ctx) {
  const a = c.get('auth'),
    org = a.organizationId,
    classId = param(c, 'id');
  const scopedClass = await c.env.DB.prepare(
    'SELECT name,active FROM classes WHERE id=? AND organization_id=?',
  )
    .bind(classId, org)
    .first();
  if (!scopedClass) return json(c, 404);
  if (teacher(a)) {
    const ok = await c.env.DB.prepare(
      'SELECT 1 FROM classes c JOIN class_teachers ct ON ct.class_id=c.id AND ct.user_id=? AND ct.organization_id=c.organization_id WHERE c.id=? AND c.organization_id=? AND c.active=1',
    )
      .bind(a.userId, classId, org)
      .first();
    if (!ok) return json(c, 404);
  } else if (!admin(a)) return json(c, 403);
  const rows = await c.env.DB.prepare(
    `SELECT s.id,s.display_name,s.active,ce.id enrollment_id FROM students s JOIN class_enrollments ce ON ce.student_id=s.id AND ce.organization_id=s.organization_id AND ce.active=1 WHERE ce.class_id=? AND s.organization_id=? AND s.active=1 ORDER BY s.display_name`,
  )
    .bind(classId, org)
    .all();
  return c.json({ ok: true, class: scopedClass, students: rows.results });
}
export async function listStudents(c: Ctx) {
  const a = c.get('auth'),
    org = a.organizationId;
  let sql =
      'SELECT id,external_id,first_name,last_name,display_name,active,notes FROM students WHERE organization_id=? ORDER BY active DESC,display_name',
    binds = [org] as unknown[];
  if (teacher(a)) {
    sql = `SELECT DISTINCT s.id,s.display_name,s.active FROM students s JOIN class_enrollments ce ON ce.student_id=s.id AND ce.organization_id=s.organization_id AND ce.active=1 JOIN classes c ON c.id=ce.class_id AND c.active=1 JOIN class_teachers ct ON ct.class_id=c.id AND ct.user_id=? AND ct.organization_id=s.organization_id WHERE s.organization_id=? AND s.active=1 ORDER BY s.display_name`;
    binds = [a.userId, org];
  } else if (!admin(a)) return c.json({ ok: true, students: [] });
  const rows = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all();
  return c.json({ ok: true, students: rows.results });
}
export async function saveStudent(c: Ctx) {
  const no = await requireAdmin(c);
  if (no) return no;
  const b = await body(c),
    org = c.get('auth').organizationId,
    sid = str(b.id) || id('stu'),
    t = now();
  if (!str(b.display_name, 160)) return json(c, 400);
  const exists = await c.env.DB.prepare('SELECT 1 FROM students WHERE id=? AND organization_id=?')
    .bind(sid, org)
    .first();
  if (str(b.id) && !exists) return json(c, 404);
  await c.env.DB.prepare(
    exists
      ? 'UPDATE students SET external_id=?,first_name=?,last_name=?,display_name=?,active=?,notes=?,updated_at=? WHERE id=? AND organization_id=?'
      : 'INSERT INTO students (external_id,first_name,last_name,display_name,active,notes,updated_at,id,organization_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(
      ...(exists
        ? [
            opt(b.external_id, 80),
            opt(b.first_name, 80),
            opt(b.last_name, 80),
            str(b.display_name, 160),
            bool(b.active) ? 1 : 0,
            opt(b.notes, 1000),
            t,
            sid,
            org,
          ]
        : [
            opt(b.external_id, 80),
            opt(b.first_name, 80),
            opt(b.last_name, 80),
            str(b.display_name, 160),
            bool(b.active) ? 1 : 0,
            opt(b.notes, 1000),
            t,
            sid,
            org,
            t,
          ]),
    )
    .run();
  await audit(c, exists ? 'student.update' : 'student.create', 'student', sid, 'Student saved');
  return c.json({ ok: true, id: sid });
}
export async function enroll(c: Ctx) {
  const no = await requireAdmin(c);
  if (no) return no;
  const b = await body(c),
    org = c.get('auth').organizationId,
    classId = str(b.class_id),
    studentId = str(b.student_id),
    t = now();
  const ok = await c.env.DB.prepare(
    'SELECT 1 FROM classes c, students s WHERE c.id=? AND s.id=? AND c.organization_id=? AND s.organization_id=? AND c.active=1 AND s.active=1',
  )
    .bind(classId, studentId, org, org)
    .first();
  if (!ok) return json(c, 404);
  await c.env.DB.prepare(
    'INSERT INTO class_enrollments (id,organization_id,class_id,student_id,active,enrolled_at,created_at,updated_at) VALUES (?,?,?,?,1,?,?,?) ON CONFLICT DO NOTHING',
  )
    .bind(id('enr'), org, classId, studentId, t, t, t)
    .run();
  await audit(c, 'enrollment.upsert', 'student', studentId, 'Student enrolled');
  return c.json({ ok: true });
}
export async function withdraw(c: Ctx) {
  const no = await requireAdmin(c);
  if (no) return no;
  const t = now();
  const enrollment = await c.env.DB.prepare(
    'SELECT 1 FROM class_enrollments WHERE id=? AND organization_id=? AND active=1',
  )
    .bind(param(c, 'id'), c.get('auth').organizationId)
    .first();
  if (!enrollment) return json(c, 404);
  await c.env.DB.prepare(
    'UPDATE class_enrollments SET active=0, withdrawn_at=?, updated_at=? WHERE id=? AND organization_id=?',
  )
    .bind(t, t, param(c, 'id'), c.get('auth').organizationId)
    .run();
  await audit(c, 'enrollment.withdraw', 'enrollment', param(c, 'id'), 'Student withdrawn');
  return c.json({ ok: true });
}
export async function saveGuardian(c: Ctx) {
  const no = await requireAdmin(c);
  if (no) return no;
  const b = await body(c),
    org = c.get('auth').organizationId,
    gid = str(b.id) || id('gua'),
    t = now(),
    locale = ['en', 'tr'].includes(str(b.preferred_locale)) ? str(b.preferred_locale) : null;
  if (!str(b.name, 120) || !str(b.email, 254).includes('@')) return json(c, 400);
  const exists = await c.env.DB.prepare('SELECT 1 FROM guardians WHERE id=? AND organization_id=?')
    .bind(gid, org)
    .first();
  if (str(b.id) && !exists) return json(c, 404);
  await c.env.DB.prepare(
    exists
      ? 'UPDATE guardians SET name=?,email=?,phone=?,active=?,preferred_locale=?,updated_at=? WHERE id=? AND organization_id=?'
      : 'INSERT INTO guardians (name,email,phone,active,preferred_locale,updated_at,id,organization_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
  )
    .bind(
      ...(exists
        ? [
            str(b.name, 120),
            str(b.email, 254).toLowerCase(),
            opt(b.phone, 40),
            bool(b.active) ? 1 : 0,
            locale,
            t,
            gid,
            org,
          ]
        : [
            str(b.name, 120),
            str(b.email, 254).toLowerCase(),
            opt(b.phone, 40),
            bool(b.active) ? 1 : 0,
            locale,
            t,
            gid,
            org,
            t,
          ]),
    )
    .run();
  await audit(c, exists ? 'guardian.update' : 'guardian.create', 'guardian', gid, 'Guardian saved');
  return c.json({ ok: true, id: gid });
}
export async function linkGuardian(c: Ctx) {
  const no = await requireAdmin(c);
  if (no) return no;
  const b = await body(c),
    org = c.get('auth').organizationId,
    t = now(),
    studentId = str(b.student_id),
    guardianId = str(b.guardian_id);
  const ok = await c.env.DB.prepare(
    'SELECT 1 FROM students s, guardians g WHERE s.id=? AND g.id=? AND s.organization_id=? AND g.organization_id=?',
  )
    .bind(studentId, guardianId, org, org)
    .first();
  if (!ok) return json(c, 404);
  await c.env.DB.prepare(
    'INSERT INTO student_guardians (id,organization_id,student_id,guardian_id,relationship,primary_contact,receive_notifications,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(student_id,guardian_id) DO UPDATE SET relationship=excluded.relationship, primary_contact=excluded.primary_contact, receive_notifications=excluded.receive_notifications, updated_at=excluded.updated_at',
  )
    .bind(
      id('sg'),
      org,
      studentId,
      guardianId,
      opt(b.relationship, 80),
      bool(b.primary_contact) ? 1 : 0,
      bool(b.receive_notifications) ? 1 : 0,
      t,
      t,
    )
    .run();
  await audit(c, 'guardian.link', 'student', studentId, 'Guardian linked');
  return c.json({ ok: true });
}
export async function unlinkGuardian(c: Ctx) {
  const no = await requireAdmin(c);
  if (no) return no;
  const org = c.get('auth').organizationId;
  const linkId = param(c, 'id');
  const link = await c.env.DB.prepare(
    'SELECT student_id,guardian_id FROM student_guardians WHERE id=? AND organization_id=?',
  )
    .bind(linkId, org)
    .first<{ student_id: string; guardian_id: string }>();
  if (!link) return json(c, 404);
  const timestamp = now();
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM student_guardians WHERE id=? AND organization_id=?').bind(
      linkId,
      org,
    ),
    auditStatement(
      c,
      'guardian.unlink',
      'student',
      link.student_id,
      'Guardian unlinked',
      timestamp,
      { guardianId: link.guardian_id },
    ),
  ]);
  return c.json({ ok: true });
}
export async function curriculum(c: Ctx) {
  const auth = c.get('auth');
  const org = auth.organizationId;
  if (!admin(auth) && !teacher(auth)) return json(c, 403);
  const teacherTrackFilter = teacher(auth)
    ? ` AND EXISTS (SELECT 1 FROM student_track_levels stl JOIN class_enrollments ce ON ce.student_id=stl.student_id AND ce.organization_id=stl.organization_id AND ce.active=1 JOIN classes c ON c.id=ce.class_id AND c.organization_id=ce.organization_id AND c.active=1 JOIN class_teachers ct ON ct.class_id=c.id AND ct.organization_id=c.organization_id WHERE stl.track_id=program_tracks.id AND stl.organization_id=program_tracks.organization_id AND ct.user_id=?)`
    : '';
  const tracks = await c.env.DB.prepare(
    `SELECT * FROM program_tracks WHERE organization_id=?${teacherTrackFilter} ORDER BY sort_order,name`,
  )
    .bind(...(teacher(auth) ? [org, auth.userId] : [org]))
    .all();
  const levels = await c.env.DB.prepare(
    `SELECT levels.* FROM levels JOIN program_tracks ON program_tracks.id=levels.track_id AND program_tracks.organization_id=levels.organization_id WHERE levels.organization_id=?${teacherTrackFilter} ORDER BY levels.sort_order,levels.name`,
  )
    .bind(...(teacher(auth) ? [org, auth.userId] : [org]))
    .all();
  const lessons = await c.env.DB.prepare(
    `SELECT lessons.* FROM lessons JOIN levels ON levels.id=lessons.level_id AND levels.organization_id=lessons.organization_id JOIN program_tracks ON program_tracks.id=levels.track_id AND program_tracks.organization_id=levels.organization_id WHERE lessons.organization_id=?${teacherTrackFilter} ORDER BY lessons.sort_order,lessons.name`,
  )
    .bind(...(teacher(auth) ? [org, auth.userId] : [org]))
    .all();
  return c.json({
    ok: true,
    tracks: tracks.results,
    levels: levels.results,
    lessons: lessons.results,
  });
}
export async function saveTrack(c: Ctx) {
  const no = await requireAdmin(c);
  if (no) return no;
  const b = await body(c),
    org = c.get('auth').organizationId,
    rid = str(b.id) || id('trk'),
    t = now();
  if (!str(b.code, 40) || !str(b.name, 120)) return json(c, 400);
  const ex = await c.env.DB.prepare('SELECT 1 FROM program_tracks WHERE id=? AND organization_id=?')
    .bind(rid, org)
    .first();
  if (str(b.id) && !ex) return json(c, 404);
  await c.env.DB.prepare(
    ex
      ? 'UPDATE program_tracks SET code=?,name=?,description=?,sort_order=?,active=?,updated_at=? WHERE id=? AND organization_id=?'
      : 'INSERT INTO program_tracks (code,name,description,sort_order,active,updated_at,id,organization_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
  )
    .bind(
      ...(ex
        ? [
            str(b.code, 40),
            str(b.name, 120),
            opt(b.description),
            Number(b.sort_order) || 0,
            bool(b.active) ? 1 : 0,
            t,
            rid,
            org,
          ]
        : [
            str(b.code, 40),
            str(b.name, 120),
            opt(b.description),
            Number(b.sort_order) || 0,
            bool(b.active) ? 1 : 0,
            t,
            rid,
            org,
            t,
          ]),
    )
    .run();
  return c.json({ ok: true, id: rid });
}
export async function saveLevel(c: Ctx) {
  const no = await requireAdmin(c);
  if (no) return no;
  const b = await body(c),
    org = c.get('auth').organizationId,
    rid = str(b.id) || id('lvl'),
    t = now();
  const ok = await c.env.DB.prepare('SELECT 1 FROM program_tracks WHERE id=? AND organization_id=?')
    .bind(str(b.track_id), org)
    .first();
  if (!ok || !str(b.code, 40) || !str(b.name, 120)) return json(c, 404);
  const ex = await c.env.DB.prepare('SELECT track_id FROM levels WHERE id=? AND organization_id=?')
    .bind(rid, org)
    .first<{ track_id: string }>();
  if (str(b.id) && !ex) return json(c, 404);
  if (ex && ex.track_id !== str(b.track_id)) return json(c, 400);
  await c.env.DB.prepare(
    ex
      ? 'UPDATE levels SET code=?,name=?,description=?,sort_order=?,active=?,updated_at=? WHERE id=? AND organization_id=?'
      : 'INSERT INTO levels (track_id,code,name,description,sort_order,active,updated_at,id,organization_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(
      ...(ex
        ? [
            str(b.code, 40),
            str(b.name, 120),
            opt(b.description),
            Number(b.sort_order) || 0,
            bool(b.active) ? 1 : 0,
            t,
            rid,
            org,
          ]
        : [
            str(b.track_id),
            str(b.code, 40),
            str(b.name, 120),
            opt(b.description),
            Number(b.sort_order) || 0,
            bool(b.active) ? 1 : 0,
            t,
            rid,
            org,
            t,
          ]),
    )
    .run();
  return c.json({ ok: true, id: rid });
}
export async function saveLesson(c: Ctx) {
  const no = await requireAdmin(c);
  if (no) return no;
  const b = await body(c),
    org = c.get('auth').organizationId,
    rid = str(b.id) || id('les'),
    t = now();
  const ok = await c.env.DB.prepare('SELECT 1 FROM levels WHERE id=? AND organization_id=?')
    .bind(str(b.level_id), org)
    .first();
  if (!ok || !str(b.code, 40) || !str(b.name, 160)) return json(c, 404);
  const ex = await c.env.DB.prepare('SELECT level_id FROM lessons WHERE id=? AND organization_id=?')
    .bind(rid, org)
    .first<{ level_id: string }>();
  if (str(b.id) && !ex) return json(c, 404);
  if (ex && ex.level_id !== str(b.level_id)) return json(c, 400);
  await c.env.DB.prepare(
    ex
      ? 'UPDATE lessons SET level_id=?,code=?,name=?,description=?,sort_order=?,default_homework=?,active=?,updated_at=? WHERE id=? AND organization_id=?'
      : 'INSERT INTO lessons (level_id,code,name,description,sort_order,default_homework,active,updated_at,id,organization_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(
      ...(ex
        ? [
            str(b.level_id),
            str(b.code, 40),
            str(b.name, 160),
            opt(b.description),
            Number(b.sort_order) || 0,
            opt(b.default_homework),
            bool(b.active) ? 1 : 0,
            t,
            rid,
            org,
          ]
        : [
            str(b.level_id),
            str(b.code, 40),
            str(b.name, 160),
            opt(b.description),
            Number(b.sort_order) || 0,
            opt(b.default_homework),
            bool(b.active) ? 1 : 0,
            t,
            rid,
            org,
            t,
          ]),
    )
    .run();
  return c.json({ ok: true, id: rid });
}
export async function assignTrack(c: Ctx) {
  const b = await body(c),
    org = c.get('auth').organizationId,
    studentId = str(b.student_id);
  const scopedStudent = await c.env.DB.prepare(
    'SELECT 1 FROM students WHERE id=? AND organization_id=? AND active=1',
  )
    .bind(studentId, org)
    .first();
  if (!scopedStudent) return json(c, 404);
  if (!admin(c.get('auth')) && !(teacher(c.get('auth')) && (await canSeeStudent(c, studentId))))
    return json(c, 404);
  if (teacher(c.get('auth'))) {
    const assigned = await c.env.DB.prepare(
      'SELECT 1 FROM student_track_levels WHERE organization_id=? AND student_id=? AND track_id=?',
    )
      .bind(org, studentId, str(b.track_id))
      .first();
    if (!assigned) return json(c, 404);
  }
  const ok = await c.env.DB.prepare(
    'SELECT 1 FROM program_tracks t JOIN levels l ON l.track_id=t.id AND l.organization_id=t.organization_id WHERE t.id=? AND l.id=? AND t.organization_id=? AND t.active=1 AND l.active=1',
  )
    .bind(str(b.track_id), str(b.current_level_id), org)
    .first();
  if (!ok) return json(c, 404);
  const t = now();
  await c.env.DB.prepare(
    'INSERT INTO student_track_levels (id,organization_id,student_id,track_id,current_level_id,started_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(organization_id,student_id,track_id) DO UPDATE SET current_level_id=excluded.current_level_id, updated_at=excluded.updated_at',
  )
    .bind(id('stl'), org, studentId, str(b.track_id), str(b.current_level_id), t, t)
    .run();
  return c.json({ ok: true });
}
export async function studentSummary(c: Ctx) {
  const org = c.get('auth').organizationId,
    studentId = param(c, 'id');
  if (!(await canSeeStudent(c, studentId))) return json(c, 404);
  const student = await c.env.DB.prepare(
    'SELECT id,display_name,active FROM students WHERE id=? AND organization_id=?',
  )
    .bind(studentId, org)
    .first();
  const tracks = await c.env.DB.prepare(
    `SELECT stl.track_id,t.name track_name,l.id level_id,l.name level_name FROM student_track_levels stl JOIN program_tracks t ON t.id=stl.track_id AND t.organization_id=stl.organization_id JOIN levels l ON l.id=stl.current_level_id AND l.organization_id=stl.organization_id AND l.track_id=t.id WHERE stl.student_id=? AND stl.organization_id=? ORDER BY t.sort_order,t.name`,
  )
    .bind(studentId, org)
    .all();
  const passed = await c.env.DB.prepare(
    `SELECT l.id,l.name FROM student_lesson_status sls JOIN lessons l ON l.id=sls.lesson_id AND l.organization_id=sls.organization_id WHERE sls.student_id=? AND sls.organization_id=? AND sls.first_passed_at IS NOT NULL ORDER BY sls.last_activity_at DESC`,
  )
    .bind(studentId, org)
    .all();
  const updates = await c.env.DB.prepare(
    `SELECT pu.*, c.name class_name, u.display_name teacher_name FROM progress_updates pu LEFT JOIN classes c ON c.id=pu.class_id AND c.organization_id=pu.organization_id LEFT JOIN users u ON u.id=pu.teacher_user_id WHERE pu.student_id=? AND pu.organization_id=? ORDER BY pu.update_date DESC, pu.created_at DESC LIMIT 10`,
  )
    .bind(studentId, org)
    .all();
  const guardians = await c.env.DB.prepare(
    admin(c.get('auth'))
      ? `SELECT g.id,g.name,g.email,sg.relationship,sg.primary_contact,sg.receive_notifications FROM guardians g JOIN student_guardians sg ON sg.guardian_id=g.id AND sg.organization_id=g.organization_id WHERE sg.student_id=? AND g.organization_id=? AND g.active=1`
      : `SELECT g.id,g.name,g.email,sg.receive_notifications FROM guardians g JOIN student_guardians sg ON sg.guardian_id=g.id AND sg.organization_id=g.organization_id WHERE sg.student_id=? AND g.organization_id=? AND g.active=1`,
  )
    .bind(studentId, org)
    .all();
  const notifications = await c.env.DB.prepare(
    `SELECT nl.id,nl.progress_update_id,nl.notification_type,nl.status,nl.recipient_email,g.name guardian_name,nl.attempted_at,nl.sent_at,CASE WHEN nl.status='failed' THEN nl.error_message ELSE NULL END failure_reference,(SELECT count(*) FROM notification_attempts na WHERE na.notification_log_id=nl.id AND na.organization_id=nl.organization_id) attempt_count FROM notification_log nl JOIN guardians g ON g.id=nl.guardian_id AND g.organization_id=nl.organization_id WHERE nl.student_id=? AND nl.organization_id=? ORDER BY nl.created_at DESC LIMIT 50`,
  )
    .bind(studentId, org)
    .all();
  const classes = await c.env.DB.prepare(
    `SELECT c.id,c.name FROM classes c JOIN class_enrollments ce ON ce.class_id=c.id AND ce.organization_id=c.organization_id AND ce.active=1 WHERE ce.student_id=? AND c.organization_id=? AND c.active=1 AND (?='organization_admin' OR EXISTS (SELECT 1 FROM class_teachers ct WHERE ct.class_id=c.id AND ct.organization_id=c.organization_id AND ct.user_id=?)) ORDER BY c.name`,
  )
    .bind(studentId, org, c.get('auth').role, c.get('auth').userId)
    .all();
  const lessons = await c.env.DB.prepare(
    `SELECT les.id,les.name,les.default_homework,l.id level_id,l.name level_name,t.id track_id,t.name track_name FROM student_track_levels stl JOIN program_tracks t ON t.id=stl.track_id AND t.organization_id=stl.organization_id JOIN levels l ON l.track_id=t.id AND l.organization_id=t.organization_id JOIN lessons les ON les.level_id=l.id AND les.organization_id=l.organization_id WHERE stl.student_id=? AND stl.organization_id=? AND t.active=1 AND l.active=1 AND les.active=1 ORDER BY t.sort_order,l.sort_order,les.sort_order`,
  )
    .bind(studentId, org)
    .all();
  const updateItems = await c.env.DB.prepare(
    `SELECT pui.progress_update_id,pui.lesson_id,pui.outcome,pui.item_comment FROM progress_update_items pui JOIN progress_updates pu ON pu.id=pui.progress_update_id AND pu.organization_id=pui.organization_id WHERE pu.student_id=? AND pui.organization_id=? ORDER BY pui.created_at`,
  )
    .bind(studentId, org)
    .all();
  return c.json({
    ok: true,
    student,
    tracks: tracks.results,
    passed: passed.results,
    updates: updates.results,
    guardians: guardians.results,
    notifications: notifications.results,
    classes: classes.results,
    lessons: lessons.results,
    updateItems: updateItems.results,
  });
}
type ValidProgressItem = {
  lessonId: string;
  levelId: string;
  trackId: string;
  outcome: 'passed' | 'practiced' | 'needs_practice' | 'assigned';
  comment: string | null;
};

export async function saveProgress(c: Ctx) {
  const b = await body(c);
  const auth = c.get('auth');
  const org = auth.organizationId;
  const studentId = str(b.student_id);
  const classId = str(b.class_id);
  const requestedStatus = str(b.status) === 'published' ? 'published' : 'draft';
  const requestedId = str(b.id);
  const operationKey = str(b.operation_key, 120) || (requestedId ? `record:${requestedId}` : null);
  const payloadItems = Array.isArray(b.items) ? (b.items as Record<string, unknown>[]) : [];
  if (!studentId || !classId || !payloadItems.length || !isoActivityDate(b.update_date))
    return json(c, 400);

  const relationship = await c.env.DB.prepare(
    `SELECT 1 FROM students s JOIN class_enrollments ce ON ce.student_id=s.id AND ce.organization_id=s.organization_id AND ce.active=1 JOIN classes cl ON cl.id=ce.class_id AND cl.organization_id=s.organization_id AND cl.active=1 WHERE s.id=? AND cl.id=? AND s.organization_id=? AND s.active=1`,
  )
    .bind(studentId, classId, org)
    .first();
  if (!relationship || !(await canSeeStudent(c, studentId, classId))) return json(c, 404);

  const existing = await c.env.DB.prepare(
    `SELECT id,student_id,class_id,status,teacher_user_id,idempotency_key FROM progress_updates WHERE organization_id=? AND (${requestedId ? 'id=?' : 'idempotency_key=?'})`,
  )
    .bind(org, requestedId || operationKey)
    .first<{
      id: string;
      student_id: string;
      class_id: string | null;
      status: string;
      teacher_user_id: string;
      idempotency_key: string | null;
    }>();
  if (requestedId && !existing) return json(c, 404);
  if (existing && (existing.student_id !== studentId || existing.class_id !== classId))
    return json(c, 404);
  if (existing && !admin(auth) && existing.teacher_user_id !== auth.userId) return json(c, 404);
  if (existing?.status === 'published') {
    const notification = await submitNotifications(c, existing.id, false);
    if (notification instanceof Response) return notification;
    return c.json({
      ok: true,
      id: existing.id,
      idempotent: true,
      publication: aggregateNotificationResults(notification).code,
      notification,
      notificationAggregate: aggregateNotificationResults(notification),
    });
  }

  const validItems: ValidProgressItem[] = [];
  for (const item of payloadItems) {
    const lesson = await c.env.DB.prepare(
      `SELECT l.id lesson_id,l.level_id,lv.track_id FROM lessons l JOIN levels lv ON lv.id=l.level_id AND lv.organization_id=l.organization_id JOIN program_tracks pt ON pt.id=lv.track_id AND pt.organization_id=lv.organization_id JOIN student_track_levels stl ON stl.track_id=pt.id AND stl.organization_id=pt.organization_id AND stl.student_id=? WHERE l.id=? AND l.organization_id=? AND l.active=1 AND lv.active=1 AND pt.active=1`,
    )
      .bind(studentId, str(item.lesson_id), org)
      .first<{ lesson_id: string; level_id: string; track_id: string }>();
    const outcome = str(item.outcome) as ValidProgressItem['outcome'];
    if (!lesson || !['passed', 'practiced', 'needs_practice', 'assigned'].includes(outcome))
      return json(c, lesson ? 400 : 404);
    validItems.push({
      lessonId: lesson.lesson_id,
      levelId: lesson.level_id,
      trackId: lesson.track_id,
      outcome,
      comment: opt(item.item_comment, 500),
    });
  }

  const updateId = existing?.id ?? id('pu');
  const timestamp = now();
  const updateDate = b.update_date;
  const statements: D1PreparedStatement[] = [
    existing
      ? c.env.DB.prepare(
          "UPDATE progress_updates SET update_date=?,overall_comment=?,homework=?,status=?,published_at=?,updated_at=? WHERE id=? AND organization_id=? AND status='draft'",
        ).bind(
          updateDate,
          opt(b.overall_comment, 1000),
          opt(b.homework, 1000),
          requestedStatus,
          requestedStatus === 'published' ? timestamp : null,
          timestamp,
          updateId,
          org,
        )
      : c.env.DB.prepare(
          'INSERT INTO progress_updates (id,organization_id,student_id,class_id,teacher_user_id,update_date,overall_comment,homework,status,published_at,created_at,updated_at,idempotency_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        ).bind(
          updateId,
          org,
          studentId,
          classId,
          auth.userId,
          updateDate,
          opt(b.overall_comment, 1000),
          opt(b.homework, 1000),
          requestedStatus,
          requestedStatus === 'published' ? timestamp : null,
          timestamp,
          timestamp,
          operationKey,
        ),
  ];
  if (requestedStatus === 'published') {
    // The unique claim makes concurrent draft-to-published batches mutually exclusive. A losing
    // batch rolls back before it can remove or replace the winning publication's items.
    statements.push(
      c.env.DB.prepare(
        'INSERT INTO progress_publication_claims (progress_update_id,organization_id,claimed_at) VALUES (?,?,?)',
      ).bind(updateId, org, timestamp),
    );
  }
  statements.push(
    c.env.DB.prepare(
      'DELETE FROM progress_update_items WHERE progress_update_id=? AND organization_id=?',
    ).bind(updateId, org),
  );
  for (const item of validItems) {
    statements.push(
      c.env.DB.prepare(
        'INSERT INTO progress_update_items (id,organization_id,progress_update_id,track_id,level_id,lesson_id,outcome,item_comment,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).bind(
        id('pui'),
        org,
        updateId,
        item.trackId,
        item.levelId,
        item.lessonId,
        item.outcome,
        item.comment,
        timestamp,
        timestamp,
      ),
    );
    if (requestedStatus === 'published') {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO student_lesson_status (id,organization_id,student_id,lesson_id,current_status,first_passed_at,last_activity_at,last_progress_update_id,created_at,updated_at,latest_published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,student_id,lesson_id) DO UPDATE SET
          first_passed_at=CASE WHEN excluded.first_passed_at IS NULL THEN student_lesson_status.first_passed_at WHEN student_lesson_status.first_passed_at IS NULL OR excluded.first_passed_at < student_lesson_status.first_passed_at THEN excluded.first_passed_at ELSE student_lesson_status.first_passed_at END,
          current_status=CASE WHEN excluded.last_activity_at > student_lesson_status.last_activity_at OR (excluded.last_activity_at=student_lesson_status.last_activity_at AND (excluded.latest_published_at > COALESCE(student_lesson_status.latest_published_at,'') OR (excluded.latest_published_at=COALESCE(student_lesson_status.latest_published_at,'') AND excluded.last_progress_update_id > student_lesson_status.last_progress_update_id))) THEN excluded.current_status ELSE student_lesson_status.current_status END,
          last_activity_at=CASE WHEN excluded.last_activity_at > student_lesson_status.last_activity_at OR (excluded.last_activity_at=student_lesson_status.last_activity_at AND (excluded.latest_published_at > COALESCE(student_lesson_status.latest_published_at,'') OR (excluded.latest_published_at=COALESCE(student_lesson_status.latest_published_at,'') AND excluded.last_progress_update_id > student_lesson_status.last_progress_update_id))) THEN excluded.last_activity_at ELSE student_lesson_status.last_activity_at END,
          last_progress_update_id=CASE WHEN excluded.last_activity_at > student_lesson_status.last_activity_at OR (excluded.last_activity_at=student_lesson_status.last_activity_at AND (excluded.latest_published_at > COALESCE(student_lesson_status.latest_published_at,'') OR (excluded.latest_published_at=COALESCE(student_lesson_status.latest_published_at,'') AND excluded.last_progress_update_id > student_lesson_status.last_progress_update_id))) THEN excluded.last_progress_update_id ELSE student_lesson_status.last_progress_update_id END,
          latest_published_at=CASE WHEN excluded.last_activity_at > student_lesson_status.last_activity_at OR (excluded.last_activity_at=student_lesson_status.last_activity_at AND (excluded.latest_published_at > COALESCE(student_lesson_status.latest_published_at,'') OR (excluded.latest_published_at=COALESCE(student_lesson_status.latest_published_at,'') AND excluded.last_progress_update_id > student_lesson_status.last_progress_update_id))) THEN excluded.latest_published_at ELSE student_lesson_status.latest_published_at END,
          updated_at=excluded.updated_at`,
        ).bind(
          id('sls'),
          org,
          studentId,
          item.lessonId,
          item.outcome,
          item.outcome === 'passed' ? updateDate : null,
          updateDate,
          updateId,
          timestamp,
          timestamp,
          timestamp,
        ),
      );
    }
  }
  statements.push(
    auditStatement(
      c,
      requestedStatus === 'published' ? 'progress.publish' : 'progress.draft',
      'progress_update',
      updateId,
      'Progress saved',
      timestamp,
      { operationKey },
    ),
  );
  try {
    await c.env.DB.batch(statements);
  } catch {
    // Collision recovery is limited to a concurrent create or publication claim. Existing-draft
    // failures are successful only when another request actually reached the published state.
    if ((!existing || requestedStatus === 'published') && operationKey) {
      const raced = await c.env.DB.prepare(
        'SELECT id,status,student_id,class_id,teacher_user_id FROM progress_updates WHERE organization_id=? AND idempotency_key=?',
      )
        .bind(org, operationKey)
        .first<{
          id: string;
          status: string;
          student_id: string;
          class_id: string;
          teacher_user_id: string;
        }>();
      if (
        raced?.status === requestedStatus &&
        raced.student_id === studentId &&
        raced.class_id === classId &&
        raced.teacher_user_id === (existing?.teacher_user_id ?? auth.userId)
      )
        return c.json({
          ok: true,
          id: raced.id,
          idempotent: true,
          publication: raced.status === 'published' ? 'already_published' : 'draft_saved',
          notification: null,
        });
    }
    return json(c, 500, `Progress could not be saved. Reference ${c.get('requestId')}`);
  }

  let notification: AnyNotificationResult[] | null = null;
  if (requestedStatus === 'published') {
    const result = await submitNotifications(c, updateId, false);
    if (result instanceof Response) return result;
    notification = result;
  }
  return c.json({
    ok: true,
    id: updateId,
    idempotent: false,
    publication:
      requestedStatus === 'published'
        ? aggregateNotificationResults(notification).code
        : 'draft_saved',
    notification,
    notificationAggregate:
      requestedStatus === 'published' ? aggregateNotificationResults(notification) : null,
  });
}

export function aggregateNotificationResults(results: AnyNotificationResult[] | null) {
  const counts = {
    total: results?.length ?? 0,
    submitted: 0,
    alreadySubmitted: 0,
    failed: 0,
    ambiguous: 0,
    inProgress: 0,
    notReserved: 0,
    notRetryable: 0,
    skipped: 0,
  };
  for (const result of results ?? []) {
    if (result.status === 'submitted') counts[result.already ? 'alreadySubmitted' : 'submitted']++;
    else if (result.status === 'failed') counts.failed++;
    else if (result.status === 'ambiguous') counts.ambiguous++;
    else if (result.status === 'in_progress') counts.inProgress++;
    else if (result.status === 'not_reserved') counts.notReserved++;
    else if (result.status === 'not_retryable') counts.notRetryable++;
    else counts.skipped++;
  }
  let code = 'notification_partial';
  if (!counts.total) code = 'no_recipients';
  else if (counts.inProgress === counts.total) code = 'notification_in_progress';
  else if (counts.ambiguous === counts.total) code = 'notification_ambiguous';
  else if (counts.failed === counts.total) code = 'notification_failed';
  else if (counts.notReserved === counts.total) code = 'notification_preparation_failed';
  else if (counts.notRetryable === counts.total) code = 'notification_not_retryable';
  else if (counts.alreadySubmitted === counts.total) code = 'already_notified';
  else if (counts.submitted + counts.alreadySubmitted === counts.total)
    code = 'notifications_submitted';
  return { code, counts };
}

const outcomeLabels: Record<string, Record<string, string>> = {
  en: {
    passed: 'Passed',
    practiced: 'Practiced',
    needs_practice: 'Needs practice',
    assigned: 'Assigned',
  },
  tr: {
    passed: 'Geçti',
    practiced: 'Çalıştı',
    needs_practice: 'Pratik gerekli',
    assigned: 'Ödev verildi',
  },
};
function outcomeLabel(locale: string, outcome: string) {
  return (outcomeLabels[locale] ?? outcomeLabels.en)[outcome] ?? outcome;
}
function emailText(locale: string, data: any) {
  const tr = locale === 'tr';
  const lines = data.items
    .map(
      (i: any) =>
        `- ${i.lesson_name}: ${outcomeLabel(locale, i.outcome)}${i.item_comment ? ` (${i.item_comment})` : ''}`,
    )
    .join('\n');
  return `${data.org_name}\n${tr ? 'Öğrenci' : 'Student'}: ${data.student_name}\n${tr ? 'Tarih' : 'Date'}: ${data.update_date}\n${tr ? 'Sınıf' : 'Class'}: ${data.class_name || ''}\n${tr ? 'Öğretmen' : 'Teacher'}: ${data.teacher_name}\n${lines}\n${tr ? 'Yorum' : 'Comment'}: ${data.overall_comment || ''}\n${tr ? 'Ödev' : 'Homework'}: ${data.homework || ''}`;
}
function emailHtml(locale: string, data: any) {
  const tr = locale === 'tr';
  return `<h1>${esc(data.org_name)}</h1><p><strong>${tr ? 'Öğrenci' : 'Student'}:</strong> ${esc(data.student_name)}</p><p><strong>${tr ? 'Tarih' : 'Date'}:</strong> ${esc(data.update_date)}</p><p><strong>${tr ? 'Sınıf' : 'Class'}:</strong> ${esc(data.class_name || '')}<br><strong>${tr ? 'Öğretmen' : 'Teacher'}:</strong> ${esc(data.teacher_name)}</p><ul>${data.items.map((i: any) => `<li>${esc(i.lesson_name)}: ${esc(outcomeLabel(locale, i.outcome))}${i.item_comment ? ` — ${esc(i.item_comment)}` : ''}</li>`).join('')}</ul><p><strong>${tr ? 'Yorum' : 'Comment'}:</strong> ${esc(data.overall_comment || '')}</p><p><strong>${tr ? 'Ödev' : 'Homework'}:</strong> ${esc(data.homework || '')}</p>`;
}
export async function notifyProgress(c: Ctx) {
  const retry = c.req.query('retry') === '1';
  let notificationId = str(c.req.query('notificationId'), 120);
  if (retry && !notificationId) {
    const failed = await c.env.DB.prepare(
      "SELECT id FROM notification_log WHERE organization_id=? AND progress_update_id=? AND notification_type='progress_update' AND status='failed' LIMIT 2",
    )
      .bind(c.get('auth').organizationId, param(c, 'id'))
      .all<any>();
    if (failed.results.length !== 1)
      return json(c, 400, 'A notification ID is required for retry.');
    notificationId = failed.results[0].id;
  }
  let sourceRevisionId: string | null = null;
  if (retry && notificationId) {
    const selected = await c.env.DB.prepare(
      "SELECT source_revision_id FROM notification_log WHERE id=? AND organization_id=? AND progress_update_id=? AND status='failed'",
    )
      .bind(notificationId, c.get('auth').organizationId, param(c, 'id'))
      .first<{ source_revision_id: string | null }>();
    if (!selected) return json(c, 404);
    sourceRevisionId = selected.source_revision_id;
  }
  const results = sourceRevisionId
    ? await submitHomeworkNotifications(c, sourceRevisionId, notificationId)
    : await submitNotifications(c, param(c, 'id'), retry, notificationId || undefined);
  if (results instanceof Response) return results;
  return c.json({ ok: true, results, aggregate: aggregateNotificationResults(results) });
}

export async function previewProgressRecipients(c: Ctx) {
  const org = c.get('auth').organizationId;
  const studentId = param(c, 'id');
  const classId = str(c.req.query('classId'), 120);
  if (!classId || !(await canSeeStudent(c, studentId, classId))) return json(c, 404);
  const relationship = await c.env.DB.prepare(
    `SELECT 1 FROM class_enrollments ce JOIN classes cl ON cl.id=ce.class_id AND cl.organization_id=ce.organization_id AND cl.active=1 JOIN students s ON s.id=ce.student_id AND s.organization_id=ce.organization_id AND s.active=1 WHERE ce.student_id=? AND ce.class_id=? AND ce.organization_id=? AND ce.active=1`,
  )
    .bind(studentId, classId, org)
    .first();
  if (!relationship) return json(c, 404);
  const recipients = await eligibleRecipients(c, studentId);
  return c.json({ ok: true, count: recipients.length, recipients });
}

async function eligibleRecipients(c: Ctx, studentId: string) {
  const rows = await c.env.DB.prepare(
    `SELECT g.id,g.name,g.email,g.preferred_locale,CASE WHEN g.preferred_locale IN ('en','tr') THEN g.preferred_locale WHEN o.default_locale IN ('en','tr') THEN o.default_locale ELSE 'en' END resolved_locale FROM guardians g JOIN organizations o ON o.id=g.organization_id JOIN student_guardians sg ON sg.guardian_id=g.id AND sg.organization_id=g.organization_id JOIN students s ON s.id=sg.student_id AND s.organization_id=sg.organization_id WHERE sg.student_id=? AND g.organization_id=? AND g.active=1 AND s.active=1 AND sg.receive_notifications=1 AND trim(g.email)<>'' ORDER BY g.name`,
  )
    .bind(studentId, c.get('auth').organizationId)
    .all<any>();
  return rows.results;
}

export async function updatePublishedHomework(c: Ctx) {
  const b = await body(c);
  const auth = c.get('auth');
  const org = auth.organizationId;
  const progressId = param(c, 'id');
  const operationKey = str(b.operationKey, 120);
  if (
    !operationKey ||
    operationKey.length < 8 ||
    typeof b.homework !== 'string' ||
    b.homework.length > 1000
  )
    return json(c, 400);
  const progress = await c.env.DB.prepare(
    "SELECT id,student_id,class_id,teacher_user_id,homework FROM progress_updates WHERE id=? AND organization_id=? AND status='published'",
  )
    .bind(progressId, org)
    .first<any>();
  if (
    !progress ||
    (!admin(auth) && progress.teacher_user_id !== auth.userId) ||
    !(await canSeeStudent(c, progress.student_id, progress.class_id))
  )
    return json(c, 404);
  const prior = await c.env.DB.prepare(
    'SELECT * FROM homework_revisions WHERE organization_id=? AND progress_update_id=? AND operation_key=?',
  )
    .bind(org, progressId, operationKey)
    .first<any>();
  if (prior) {
    if (
      (prior.new_homework ?? '').trim() !== normalizedHomework(b.homework) ||
      Boolean(prior.notification_requested) !== (b.notifyGuardians === true)
    )
      return json(c, 409, 'This operation key was already used with different homework data.');
    const state = prior.notification_requested
      ? await resumeHomeworkNotifications(c, prior.id)
      : null;
    return c.json({
      ok: true,
      storage: { status: 'idempotent', revision: prior },
      notification: state?.notification ?? null,
      notificationAggregate: state?.aggregate ?? null,
    });
  }
  const normalized = normalizedHomework(b.homework);
  if ((progress.homework ?? '').trim() === normalized)
    return c.json({
      ok: true,
      storage: { status: 'unchanged', revision: null },
      notification: null,
    });
  const revisionId = id('hwr');
  const timestamp = now();
  const requested = b.notifyGuardians === true;
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE progress_updates SET homework=?,updated_at=? WHERE id=? AND organization_id=? AND status='published' AND COALESCE(trim(homework),'')=?",
      ).bind(normalized || null, timestamp, progressId, org, (progress.homework ?? '').trim()),
      c.env.DB.prepare(
        `INSERT INTO homework_revisions (id,organization_id,progress_update_id,previous_homework,new_homework,changed_by_user_id,notification_requested,operation_key,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1`,
      ).bind(
        revisionId,
        org,
        progressId,
        progress.homework,
        normalized || null,
        auth.userId,
        requested ? 1 : 0,
        operationKey,
        timestamp,
      ),
      c.env.DB.prepare(
        `INSERT INTO homework_revision_recipients (organization_id,homework_revision_id,guardian_id,recipient_name,recipient_email,resolved_locale,created_at)
         SELECT g.organization_id,?,g.id,g.name,g.email,CASE WHEN g.preferred_locale IN ('en','tr') THEN g.preferred_locale WHEN o.default_locale IN ('en','tr') THEN o.default_locale ELSE 'en' END,?
         FROM guardians g
         JOIN organizations o ON o.id=g.organization_id
         JOIN student_guardians sg ON sg.guardian_id=g.id AND sg.organization_id=g.organization_id
         JOIN students s ON s.id=sg.student_id AND s.organization_id=sg.organization_id
         WHERE EXISTS (SELECT 1 FROM homework_revisions WHERE id=? AND organization_id=? AND notification_requested=1)
           AND sg.student_id=? AND g.organization_id=? AND g.active=1 AND s.active=1 AND sg.receive_notifications=1 AND trim(g.email)<>''`,
      ).bind(revisionId, timestamp, revisionId, org, progress.student_id, org),
      c.env.DB.prepare(
        `INSERT INTO audit_log (id,organization_id,actor_user_id,action,entity_type,entity_id,summary,metadata_json,request_id,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM homework_revisions WHERE id=? AND organization_id=?)`,
      ).bind(
        id('audit'),
        org,
        auth.userId,
        'progress.homework_updated',
        'homework_revision',
        revisionId,
        'Published homework updated',
        JSON.stringify({ progressUpdateId: progressId, notificationRequested: requested }),
        c.get('requestId'),
        timestamp,
        revisionId,
        org,
      ),
    ]);
  } catch {
    const raced = await c.env.DB.prepare(
      'SELECT * FROM homework_revisions WHERE organization_id=? AND progress_update_id=? AND operation_key=?',
    )
      .bind(org, progressId, operationKey)
      .first<any>();
    if (raced) {
      if (
        (raced.new_homework ?? '').trim() !== normalized ||
        Boolean(raced.notification_requested) !== requested
      )
        return json(c, 409, 'This operation key was already used with different homework data.');
      const state = requested ? await resumeHomeworkNotifications(c, raced.id) : null;
      return c.json({
        ok: true,
        storage: { status: 'idempotent', revision: raced },
        notification: state?.notification ?? null,
        notificationAggregate: state?.aggregate ?? null,
      });
    }
    return json(c, 500, `Homework could not be updated. Reference ${c.get('requestId')}`);
  }
  const revision = await c.env.DB.prepare(
    'SELECT id,progress_update_id,new_homework,notification_requested,operation_key,created_at FROM homework_revisions WHERE id=? AND organization_id=?',
  )
    .bind(revisionId, org)
    .first<any>();
  if (!revision) {
    const winner = await c.env.DB.prepare(
      'SELECT * FROM homework_revisions WHERE organization_id=? AND progress_update_id=? AND operation_key=?',
    )
      .bind(org, progressId, operationKey)
      .first<any>();
    if (winner) {
      if (
        (winner.new_homework ?? '').trim() !== normalized ||
        Boolean(winner.notification_requested) !== requested
      )
        return json(c, 409, 'This operation key was already used with different homework data.');
      const state = requested ? await resumeHomeworkNotifications(c, winner.id) : null;
      return c.json({
        ok: true,
        storage: { status: 'idempotent', revision: winner },
        notification: state?.notification ?? null,
        notificationAggregate: state?.aggregate ?? null,
      });
    }
    return json(c, 409, 'Homework changed before this request could be stored.');
  }
  await (
    c.env.DB as D1Database & {
      afterHomeworkRevisionCommit?: (revisionId: string) => Promise<void>;
    }
  ).afterHomeworkRevisionCommit?.(revisionId);
  const notification = requested ? await submitHomeworkNotifications(c, revisionId) : null;
  if (notification instanceof Response) return notification;
  return c.json({
    ok: true,
    storage: { status: 'updated', revision },
    notification,
    notificationAggregate: requested ? aggregateNotificationResults(notification) : null,
  });
}

function normalizedHomework(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

async function homeworkRevisionNotificationState(c: Ctx, revisionId: string) {
  const rows = await c.env.DB.prepare(
    `SELECT nl.status,nl.guardian_id,g.name guardian_name FROM notification_log nl JOIN guardians g ON g.id=nl.guardian_id AND g.organization_id=nl.organization_id WHERE nl.organization_id=? AND nl.source_revision_id=? AND nl.notification_type='homework_update' ORDER BY nl.created_at`,
  )
    .bind(c.get('auth').organizationId, revisionId)
    .all<any>();
  const notification = rows.results.map((row: any) => ({
    guardianId: row.guardian_id,
    guardianName: row.guardian_name,
    status:
      row.status === 'sent' ? 'submitted' : row.status === 'failed' ? 'failed' : 'in_progress',
    already: row.status === 'sent',
    retryAvailable: row.status === 'failed',
  }));
  const snapshot = await c.env.DB.prepare(
    'SELECT count(*) count FROM homework_revision_recipients WHERE homework_revision_id=? AND organization_id=?',
  )
    .bind(revisionId, c.get('auth').organizationId)
    .first<any>();
  return {
    notification,
    aggregate: aggregateNotificationResults(notification),
    snapshotCount: Number(snapshot?.count ?? 0),
  };
}

async function resumeHomeworkNotifications(c: Ctx, revisionId: string) {
  const before = await homeworkRevisionNotificationState(c, revisionId);
  if (before.snapshotCount === 0 || before.notification.length === before.snapshotCount)
    return before;
  const notification = await submitHomeworkNotifications(c, revisionId);
  if (notification instanceof Response)
    return {
      notification: [],
      aggregate: {
        ...aggregateNotificationResults([{ guardianId: '', status: 'not_reserved' }]),
        code: 'notification_preparation_failed',
      },
    };
  return { notification, aggregate: aggregateNotificationResults(notification) };
}

export async function listNotifications(c: Ctx) {
  if (!admin(c.get('auth'))) return json(c, 403);
  const org = c.get('auth').organizationId;
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(c.req.query('pageSize')) || 20));
  const status = str(c.req.query('status'), 20),
    type = str(c.req.query('type'), 30),
    search = str(c.req.query('search'), 100),
    studentId = str(c.req.query('studentId'), 100),
    from = str(c.req.query('from'), 10),
    to = str(c.req.query('to'), 10);
  if ((from && !isoActivityDate(from)) || (to && !isoActivityDate(to)) || (from && to && from > to))
    return json(c, 400, 'The notification date range is invalid.');
  if (status && !['sent', 'failed', 'pending', 'skipped'].includes(status)) return json(c, 400);
  if (type && !['progress_update', 'homework_update'].includes(type)) return json(c, 400);
  const where = [`nl.organization_id=?`];
  const binds: unknown[] = [org];
  if (status) {
    where.push('nl.status=?');
    binds.push(status);
  }
  if (type) {
    where.push('nl.notification_type=?');
    binds.push(type);
  }
  if (studentId) {
    where.push('nl.student_id=?');
    binds.push(studentId);
  }
  if (from) {
    where.push('pu.update_date>=?');
    binds.push(from);
  }
  if (to) {
    where.push('pu.update_date<=?');
    binds.push(to);
  }
  if (search) {
    where.push('(g.name LIKE ? OR nl.recipient_email LIKE ?)');
    binds.push(`%${search}%`, `%${search}%`);
  }
  const clause = where.join(' AND ');
  const total = await c.env.DB.prepare(
    `SELECT count(*) count FROM notification_log nl JOIN guardians g ON g.id=nl.guardian_id AND g.organization_id=nl.organization_id JOIN progress_updates pu ON pu.id=nl.progress_update_id AND pu.organization_id=nl.organization_id WHERE ${clause}`,
  )
    .bind(...binds)
    .first<any>();
  const rows = await c.env.DB.prepare(
    `SELECT nl.id,nl.notification_type,nl.subject,nl.status,nl.attempted_at,nl.sent_at,CASE WHEN nl.status='failed' THEN nl.error_message ELSE NULL END failure_reference,nl.recipient_email,nl.progress_update_id,nl.source_revision_id,s.display_name student_name,g.name guardian_name,pu.update_date,(SELECT count(*) FROM notification_attempts na WHERE na.notification_log_id=nl.id AND na.organization_id=nl.organization_id) attempt_count FROM notification_log nl JOIN guardians g ON g.id=nl.guardian_id AND g.organization_id=nl.organization_id JOIN students s ON s.id=nl.student_id AND s.organization_id=nl.organization_id JOIN progress_updates pu ON pu.id=nl.progress_update_id AND pu.organization_id=nl.organization_id WHERE ${clause} ORDER BY nl.created_at DESC,nl.id DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, (page - 1) * pageSize)
    .all();
  const students = await c.env.DB.prepare(
    'SELECT id,display_name FROM students WHERE organization_id=? ORDER BY display_name',
  )
    .bind(org)
    .all();
  return c.json({
    ok: true,
    notifications: rows.results,
    students: students.results,
    pagination: {
      page,
      pageSize,
      total: Number(total?.count ?? 0),
      pages: Math.max(1, Math.ceil(Number(total?.count ?? 0) / pageSize)),
    },
  });
}

export async function retryNotification(c: Ctx) {
  if (!admin(c.get('auth'))) return json(c, 403);
  const row = await c.env.DB.prepare(
    "SELECT id,progress_update_id,source_revision_id,status FROM notification_log WHERE id=? AND organization_id=? AND status='failed'",
  )
    .bind(param(c, 'id'), c.get('auth').organizationId)
    .first<any>();
  if (!row) return json(c, 404);
  const results = row.source_revision_id
    ? await submitHomeworkNotifications(c, row.source_revision_id, row.id)
    : await submitNotifications(c, row.progress_update_id, true, row.id);
  if (results instanceof Response) return results;
  return c.json({ ok: true, results, aggregate: aggregateNotificationResults(results) });
}

async function submitHomeworkNotifications(c: Ctx, revisionId: string, onlyLogId?: string) {
  const org = c.get('auth').organizationId;
  const revision = await c.env.DB.prepare(
    `SELECT hr.*,pu.student_id,pu.class_id,pu.teacher_user_id,pu.update_date,s.display_name student_name,cl.name class_name,u.display_name teacher_name,o.name org_name,o.default_locale,o.email_sender_name,o.email_reply_to,o.email_sender_alias FROM homework_revisions hr JOIN progress_updates pu ON pu.id=hr.progress_update_id AND pu.organization_id=hr.organization_id JOIN students s ON s.id=pu.student_id AND s.organization_id=pu.organization_id JOIN organizations o ON o.id=pu.organization_id LEFT JOIN classes cl ON cl.id=pu.class_id AND cl.organization_id=pu.organization_id LEFT JOIN users u ON u.id=pu.teacher_user_id WHERE hr.id=? AND hr.organization_id=? AND hr.notification_requested=1 AND pu.status='published'`,
  )
    .bind(revisionId, org)
    .first<any>();
  if (!revision || !(await canSeeStudent(c, revision.student_id, revision.class_id)))
    return json(c, 404);
  let recipients = (
    await c.env.DB.prepare(
      `SELECT guardian_id id,recipient_name name,recipient_email email,resolved_locale preferred_locale
       FROM homework_revision_recipients WHERE homework_revision_id=? AND organization_id=? ORDER BY guardian_id`,
    )
      .bind(revisionId, org)
      .all<any>()
  ).results;
  if (onlyLogId) {
    const original = await c.env.DB.prepare(
      `SELECT nl.guardian_id id,g.name,nl.recipient_email email,hrr.resolved_locale preferred_locale
       FROM notification_log nl
       JOIN guardians g ON g.id=nl.guardian_id AND g.organization_id=nl.organization_id AND g.active=1
       JOIN student_guardians sg ON sg.guardian_id=nl.guardian_id AND sg.student_id=nl.student_id AND sg.organization_id=nl.organization_id AND sg.receive_notifications=1
       JOIN students s ON s.id=nl.student_id AND s.organization_id=nl.organization_id AND s.active=1
       JOIN homework_revision_recipients hrr ON hrr.homework_revision_id=nl.source_revision_id AND hrr.guardian_id=nl.guardian_id AND hrr.organization_id=nl.organization_id
       WHERE nl.id=? AND nl.organization_id=? AND nl.source_revision_id=? AND nl.progress_update_id=? AND nl.student_id=? AND nl.notification_type='homework_update' AND nl.status='failed' AND trim(g.email)<>''`,
    )
      .bind(onlyLogId, org, revisionId, revision.progress_update_id, revision.student_id)
      .first<any>();
    if (!original) {
      const historical = await c.env.DB.prepare(
        "SELECT guardian_id FROM notification_log WHERE id=? AND organization_id=? AND source_revision_id=? AND progress_update_id=? AND student_id=? AND notification_type='homework_update' AND status='failed'",
      )
        .bind(onlyLogId, org, revisionId, revision.progress_update_id, revision.student_id)
        .first<any>();
      if (historical) return [{ guardianId: historical.guardian_id, status: 'not_retryable' }];
      return json(c, 404);
    }
    recipients = [original];
  }
  const sender = resolveSender(c.env, revision);
  const results: AnyNotificationResult[] = [];
  for (const recipient of recipients) {
    const dedup = `homework-revision:${revisionId}:guardian:${recipient.id}`;
    const prior = await c.env.DB.prepare(
      'SELECT id,status FROM notification_log WHERE organization_id=? AND deduplication_key=?',
    )
      .bind(org, dedup)
      .first<any>();
    if (prior && prior.status !== 'failed') {
      results.push({
        guardianId: recipient.id,
        guardianName: recipient.name,
        status: prior.status === 'sent' ? 'submitted' : 'ambiguous',
        already: true,
      });
      continue;
    }
    if (prior?.status === 'failed' && !onlyLogId) {
      results.push({
        guardianId: recipient.id,
        guardianName: recipient.name,
        status: 'failed',
        retryAvailable: true,
      });
      continue;
    }
    const timestamp = now();
    const locale = ['en', 'tr'].includes(recipient.preferred_locale)
      ? recipient.preferred_locale
      : ['en', 'tr'].includes(revision.default_locale)
        ? revision.default_locale
        : 'en';
    const subject =
      locale === 'tr'
        ? `${revision.student_name} için ödev güncellemesi`
        : `Homework update for ${revision.student_name}`;
    const logId = prior?.id ?? id('not'),
      attemptId = id('nat');
    const count = prior
      ? await c.env.DB.prepare(
          'SELECT count(*) count FROM notification_attempts WHERE notification_log_id=? AND organization_id=?',
        )
          .bind(logId, org)
          .first<any>()
      : { count: 0 };
    const attemptNumber = Number(count?.count ?? 0) + 1;
    try {
      await c.env.DB.batch(
        prior
          ? [
              c.env.DB.prepare(
                "UPDATE notification_log SET status='pending',attempted_at=?,error_code=NULL,error_message=NULL WHERE id=? AND organization_id=? AND status='failed'",
              ).bind(timestamp, logId, org),
              c.env.DB.prepare(
                'INSERT INTO notification_attempts (id,notification_log_id,organization_id,attempt_number,status,request_id,attempted_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1',
              ).bind(
                attemptId,
                logId,
                org,
                attemptNumber,
                'pending',
                c.get('requestId'),
                timestamp,
              ),
              c.env.DB.prepare(
                `INSERT INTO audit_log (id,organization_id,actor_user_id,action,entity_type,entity_id,summary,metadata_json,request_id,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM notification_attempts WHERE id=? AND organization_id=?)`,
              ).bind(
                id('audit'),
                org,
                c.get('auth').userId,
                'notification.retry_requested',
                'notification',
                logId,
                'Notification retry requested',
                JSON.stringify({ revisionId, attemptNumber }),
                c.get('requestId'),
                timestamp,
                attemptId,
                org,
              ),
            ]
          : [
              c.env.DB.prepare(
                'INSERT OR IGNORE INTO notification_log (id,organization_id,guardian_id,student_id,progress_update_id,recipient_email,notification_type,subject,status,attempted_at,created_at,deduplication_key,source_revision_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
              ).bind(
                logId,
                org,
                recipient.id,
                revision.student_id,
                revision.progress_update_id,
                recipient.email,
                'homework_update',
                subject,
                'pending',
                timestamp,
                timestamp,
                dedup,
                revisionId,
              ),
              c.env.DB.prepare(
                'INSERT INTO notification_attempts (id,notification_log_id,organization_id,attempt_number,status,request_id,attempted_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1',
              ).bind(attemptId, logId, org, 1, 'pending', c.get('requestId'), timestamp),
              c.env.DB.prepare(
                `INSERT INTO audit_log (id,organization_id,actor_user_id,action,entity_type,entity_id,summary,metadata_json,request_id,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM notification_attempts WHERE id=? AND organization_id=?)`,
              ).bind(
                id('audit'),
                org,
                c.get('auth').userId,
                'homework.notification_requested',
                'homework_revision',
                revisionId,
                'Homework-update notification requested',
                JSON.stringify({ guardianId: recipient.id }),
                c.get('requestId'),
                timestamp,
                attemptId,
                org,
              ),
            ],
      );
    } catch {
      results.push({
        guardianId: recipient.id,
        guardianName: recipient.name,
        status: 'not_reserved',
        requestId: c.get('requestId'),
      });
      continue;
    }
    const owned = await c.env.DB.prepare(
      "SELECT 1 FROM notification_attempts WHERE id=? AND organization_id=? AND status='pending'",
    )
      .bind(attemptId, org)
      .first();
    if (!owned) {
      results.push({
        guardianId: recipient.id,
        guardianName: recipient.name,
        status: 'in_progress',
      });
      continue;
    }
    const tr = locale === 'tr';
    const labels = tr
      ? {
          heading: 'Ödev güncellemesi',
          student: 'Öğrenci',
          date: 'İlerleme tarihi',
          class: 'Sınıf',
          teacher: 'Öğretmen',
          homework: 'Yeni ödev',
        }
      : {
          heading: 'Homework update',
          student: 'Student',
          date: 'Progress date',
          class: 'Class',
          teacher: 'Teacher',
          homework: 'New homework',
        };
    const textBody = `${revision.org_name}\n${labels.heading}\n${labels.student}: ${revision.student_name}\n${labels.date}: ${revision.update_date}\n${labels.class}: ${revision.class_name || ''}\n${labels.teacher}: ${revision.teacher_name || ''}\n${labels.homework}: ${revision.new_homework || ''}`;
    const htmlBody = `<h1>${esc(labels.heading)}</h1><p>${esc(revision.org_name)}</p><p><strong>${esc(labels.student)}:</strong> ${esc(revision.student_name)}</p><p><strong>${esc(labels.date)}:</strong> ${esc(revision.update_date)}</p><p><strong>${esc(labels.class)}:</strong> ${esc(revision.class_name || '')}</p><p><strong>${esc(labels.teacher)}:</strong> ${esc(revision.teacher_name || '')}</p><p><strong>${esc(labels.homework)}:</strong> ${esc(revision.new_homework || '')}</p>`;
    let relay: Awaited<ReturnType<typeof submitRelayMail>>;
    try {
      relay = await submitRelayMail(c.env, {
        to: recipient.email,
        fromAlias: sender.fromAlias,
        senderName: sender.senderName,
        replyTo: sender.replyTo,
        subject,
        text: textBody,
        html: htmlBody,
      });
    } catch {
      relay = { status: 'ambiguous' };
    }
    if (relay.status === 'ambiguous') {
      results.push({
        guardianId: recipient.id,
        guardianName: recipient.name,
        status: 'ambiguous',
        requestId: c.get('requestId'),
      });
      continue;
    }
    const completed = now();
    if (relay.status === 'rejected_before_send') {
      const safe = `Email relay submission failed. Reference ${c.get('requestId')}`;
      await c.env.DB.batch([
        c.env.DB.prepare(
          "UPDATE notification_log SET status='failed',error_code='RELAY_REJECTED',error_message=? WHERE id=? AND organization_id=? AND status='pending'",
        ).bind(safe, logId, org),
        c.env.DB.prepare(
          "UPDATE notification_attempts SET status='failed',error_code='RELAY_REJECTED',error_message=?,completed_at=? WHERE id=? AND organization_id=? AND status='pending'",
        ).bind(safe, completed, attemptId, org),
        auditStatement(
          c,
          'notification.relay_failed',
          'notification',
          logId,
          'Notification relay submission failed',
          completed,
          { revisionId, attemptNumber },
        ),
      ]);
      results.push({
        guardianId: recipient.id,
        guardianName: recipient.name,
        status: 'failed',
        retryAvailable: true,
        requestId: c.get('requestId'),
      });
      continue;
    }
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(
          "UPDATE notification_log SET status='sent',sent_at=?,error_code=NULL,error_message=NULL WHERE id=? AND organization_id=? AND status='pending'",
        ).bind(completed, logId, org),
        c.env.DB.prepare(
          "UPDATE notification_attempts SET status='sent',completed_at=? WHERE id=? AND organization_id=? AND status='pending'",
        ).bind(completed, attemptId, org),
        auditStatement(
          c,
          'notification.relay_accepted',
          'notification',
          logId,
          'Notification accepted by relay',
          completed,
          { revisionId, attemptNumber },
        ),
      ]);
      results.push({ guardianId: recipient.id, guardianName: recipient.name, status: 'submitted' });
    } catch {
      results.push({
        guardianId: recipient.id,
        guardianName: recipient.name,
        status: 'ambiguous',
        requestId: c.get('requestId'),
      });
    }
  }
  return results;
}
async function submitNotifications(c: Ctx, progressId: string, retry: boolean, onlyLogId?: string) {
  const org = c.get('auth').organizationId;
  const pu = await c.env.DB.prepare(
    `SELECT pu.*,s.display_name student_name,cls.name class_name,u.display_name teacher_name,o.name org_name,o.default_locale,o.email_sender_name,o.email_reply_to,o.email_sender_alias FROM progress_updates pu JOIN students s ON s.id=pu.student_id AND s.organization_id=pu.organization_id JOIN organizations o ON o.id=pu.organization_id LEFT JOIN classes cls ON cls.id=pu.class_id AND cls.organization_id=pu.organization_id LEFT JOIN users u ON u.id=pu.teacher_user_id WHERE pu.id=? AND pu.organization_id=? AND pu.status='published'`,
  )
    .bind(progressId, org)
    .first<any>();
  if (!pu || !(await canSeeStudent(c, pu.student_id, pu.class_id))) return json(c, 404);
  const items = (
    await c.env.DB.prepare(
      `SELECT l.name lesson_name,pui.outcome,pui.item_comment FROM progress_update_items pui JOIN lessons l ON l.id=pui.lesson_id AND l.organization_id=pui.organization_id WHERE pui.progress_update_id=? AND pui.organization_id=?`,
    )
      .bind(progressId, org)
      .all()
  ).results;
  let recipients = (
    await c.env.DB.prepare(
      `SELECT g.id guardian_id,g.name guardian_name,g.email,g.preferred_locale FROM guardians g JOIN student_guardians sg ON sg.guardian_id=g.id AND sg.organization_id=g.organization_id JOIN students s ON s.id=sg.student_id AND s.organization_id=sg.organization_id WHERE sg.student_id=? AND g.organization_id=? AND g.active=1 AND s.active=1 AND sg.receive_notifications=1 AND trim(g.email)<>''`,
    )
      .bind(pu.student_id, org)
      .all<any>()
  ).results;
  if (onlyLogId) {
    const original = await c.env.DB.prepare(
      `SELECT nl.guardian_id,g.name guardian_name,nl.recipient_email email,g.preferred_locale
       FROM notification_log nl
       JOIN guardians g ON g.id=nl.guardian_id AND g.organization_id=nl.organization_id AND g.active=1
       JOIN student_guardians sg ON sg.guardian_id=nl.guardian_id AND sg.student_id=nl.student_id AND sg.organization_id=nl.organization_id AND sg.receive_notifications=1
       JOIN students s ON s.id=nl.student_id AND s.organization_id=nl.organization_id AND s.active=1
       WHERE nl.id=? AND nl.organization_id=? AND nl.progress_update_id=? AND nl.student_id=? AND nl.notification_type='progress_update' AND nl.source_revision_id IS NULL AND nl.status='failed' AND trim(g.email)<>''`,
    )
      .bind(onlyLogId, org, progressId, pu.student_id)
      .first<any>();
    if (!original) {
      const historical = await c.env.DB.prepare(
        "SELECT guardian_id FROM notification_log WHERE id=? AND organization_id=? AND progress_update_id=? AND student_id=? AND notification_type='progress_update' AND source_revision_id IS NULL AND status='failed'",
      )
        .bind(onlyLogId, org, progressId, pu.student_id)
        .first<any>();
      if (historical) return [{ guardianId: historical.guardian_id, status: 'not_retryable' }];
      return json(c, 404);
    }
    recipients = [original];
  }
  const sender = resolveSender(c.env, pu);
  const results: AnyNotificationResult[] = [];
  for (const recipient of recipients) {
    const dedup = `progress:${progressId}:guardian:${recipient.guardian_id}`;
    const prior = await c.env.DB.prepare(
      "SELECT id,status FROM notification_log WHERE organization_id=? AND deduplication_key=? AND guardian_id=? AND progress_update_id=? AND notification_type='progress_update'",
    )
      .bind(org, dedup, recipient.guardian_id, progressId)
      .first<{ id: string; status: string }>();
    if (prior?.status === 'sent') {
      results.push({
        guardianId: recipient.guardian_id,
        guardianName: recipient.guardian_name,
        status: 'submitted',
        already: true,
      });
      continue;
    }
    if (retry && !prior) {
      results.push({
        guardianId: recipient.guardian_id,
        guardianName: recipient.guardian_name,
        status: 'not_retryable',
      });
      continue;
    }
    if (prior?.status === 'pending') {
      results.push({
        guardianId: recipient.guardian_id,
        guardianName: recipient.guardian_name,
        status: 'ambiguous',
      });
      continue;
    }
    if (prior?.status === 'failed' && !retry) {
      results.push({
        guardianId: recipient.guardian_id,
        guardianName: recipient.guardian_name,
        status: 'failed',
        retryAvailable: true,
      });
      continue;
    }

    const timestamp = now();
    const locale = ['en', 'tr'].includes(recipient.preferred_locale)
      ? recipient.preferred_locale
      : ['en', 'tr'].includes(pu.default_locale)
        ? pu.default_locale
        : 'en';
    const subject =
      locale === 'tr'
        ? `${pu.student_name} için ilerleme güncellemesi`
        : `Progress update for ${pu.student_name}`;
    const logId = prior?.id ?? id('not');
    const attemptId = id('nat');
    const count = prior
      ? await c.env.DB.prepare(
          'SELECT count(*) count FROM notification_attempts WHERE notification_log_id=? AND organization_id=?',
        )
          .bind(logId, org)
          .first<{ count: number }>()
      : { count: 0 };
    const attemptNumber = Number(count?.count ?? 0) + 1;
    try {
      if (prior) {
        await c.env.DB.batch([
          c.env.DB.prepare(
            "UPDATE notification_log SET status='pending',attempted_at=?,error_code=NULL,error_message=NULL WHERE id=? AND organization_id=? AND status='failed'",
          ).bind(timestamp, logId, org),
          c.env.DB.prepare(
            'INSERT INTO notification_attempts (id,notification_log_id,organization_id,attempt_number,status,request_id,attempted_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1',
          ).bind(attemptId, logId, org, attemptNumber, 'pending', c.get('requestId'), timestamp),
          c.env.DB.prepare(
            `INSERT INTO audit_log (id,organization_id,actor_user_id,action,entity_type,entity_id,summary,metadata_json,request_id,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM notification_attempts WHERE id=? AND organization_id=?)`,
          ).bind(
            id('audit'),
            org,
            c.get('auth').userId,
            'notification.retry_reserved',
            'notification',
            logId,
            'Notification retry reserved',
            JSON.stringify({ attemptNumber }),
            c.get('requestId'),
            timestamp,
            attemptId,
            org,
          ),
        ]);
      } else {
        // Reservation, initial attempt, and audit commit together before the external relay call.
        // D1 and the relay cannot share a transaction, so a post-acceptance D1 failure intentionally
        // leaves this pending/submitting reservation ambiguous and non-retryable.
        await c.env.DB.batch([
          c.env.DB.prepare(
            'INSERT OR IGNORE INTO notification_log (id,organization_id,guardian_id,student_id,progress_update_id,recipient_email,notification_type,subject,status,attempted_at,created_at,deduplication_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
          ).bind(
            logId,
            org,
            recipient.guardian_id,
            pu.student_id,
            progressId,
            recipient.email,
            'progress_update',
            subject,
            'pending',
            timestamp,
            timestamp,
            dedup,
          ),
          c.env.DB.prepare(
            'INSERT INTO notification_attempts (id,notification_log_id,organization_id,attempt_number,status,request_id,attempted_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM notification_log WHERE id=? AND organization_id=?)',
          ).bind(attemptId, logId, org, 1, 'pending', c.get('requestId'), timestamp, logId, org),
          c.env.DB.prepare(
            `INSERT INTO audit_log (id,organization_id,actor_user_id,action,entity_type,entity_id,summary,request_id,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM notification_attempts WHERE id=? AND organization_id=?)`,
          ).bind(
            id('audit'),
            org,
            c.get('auth').userId,
            'notification.reserved',
            'notification',
            logId,
            'Notification submission reserved',
            c.get('requestId'),
            timestamp,
            attemptId,
            org,
          ),
        ]);
      }
    } catch {
      results.push({
        guardianId: recipient.guardian_id,
        guardianName: recipient.guardian_name,
        status: 'not_reserved',
        requestId: c.get('requestId'),
      });
      continue;
    }
    const owned = await c.env.DB.prepare(
      "SELECT 1 FROM notification_attempts WHERE id=? AND organization_id=? AND status='pending'",
    )
      .bind(attemptId, org)
      .first();
    if (!owned) {
      const state = await c.env.DB.prepare(
        'SELECT status FROM notification_log WHERE organization_id=? AND deduplication_key=?',
      )
        .bind(org, dedup)
        .first<{ status: string }>();
      results.push({
        guardianId: recipient.guardian_id,
        guardianName: recipient.guardian_name,
        status:
          state?.status === 'sent'
            ? 'submitted'
            : state?.status === 'failed'
              ? 'failed'
              : 'ambiguous',
        retryAvailable: state?.status === 'failed',
      });
      continue;
    }

    const data = { ...pu, items };
    let relayResult: Awaited<ReturnType<typeof submitRelayMail>>;
    try {
      relayResult = await submitRelayMail(c.env, {
        to: recipient.email,
        fromAlias: sender.fromAlias,
        senderName: sender.senderName,
        replyTo: sender.replyTo,
        subject,
        text: emailText(locale, data),
        html: emailHtml(locale, data),
      });
    } catch {
      relayResult = { status: 'ambiguous' };
    }
    if (relayResult.status === 'ambiguous') {
      // Transport/protocol uncertainty may occur after the relay accepted the message. Preserve
      // pending as non-retryable rather than risk sending a duplicate guardian email.
      results.push({
        guardianId: recipient.guardian_id,
        guardianName: recipient.guardian_name,
        status: 'ambiguous',
        requestId: c.get('requestId'),
      });
      continue;
    }
    if (relayResult.status === 'rejected_before_send') {
      const completed = now();
      const safeMessage = `Email relay submission failed. Reference ${c.get('requestId')}`;
      try {
        await c.env.DB.batch([
          c.env.DB.prepare(
            "UPDATE notification_log SET status='failed',error_code='RELAY_REJECTED',error_message=? WHERE id=? AND organization_id=? AND status='pending'",
          ).bind(safeMessage, logId, org),
          c.env.DB.prepare(
            "UPDATE notification_attempts SET status='failed',error_code='RELAY_REJECTED',error_message=?,completed_at=? WHERE id=? AND organization_id=? AND status='pending'",
          ).bind(safeMessage, completed, attemptId, org),
          auditStatement(
            c,
            'notification.relay_failed',
            'notification',
            logId,
            'Notification relay submission failed',
            completed,
            { attemptNumber },
          ),
        ]);
        results.push({
          guardianId: recipient.guardian_id,
          guardianName: recipient.guardian_name,
          status: 'failed',
          retryAvailable: true,
          requestId: c.get('requestId'),
        });
      } catch {
        results.push({
          guardianId: recipient.guardian_id,
          guardianName: recipient.guardian_name,
          status: 'ambiguous',
          requestId: c.get('requestId'),
        });
      }
      continue;
    }

    const completed = now();
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(
          "UPDATE notification_log SET status='sent',sent_at=?,error_code=NULL,error_message=NULL WHERE id=? AND organization_id=? AND status='pending'",
        ).bind(completed, logId, org),
        c.env.DB.prepare(
          "UPDATE notification_attempts SET status='sent',completed_at=? WHERE id=? AND organization_id=? AND status='pending'",
        ).bind(completed, attemptId, org),
        auditStatement(
          c,
          'notification.relay_accepted',
          'notification',
          logId,
          'Notification accepted by relay',
          completed,
          { attemptNumber },
        ),
      ]);
      results.push({
        guardianId: recipient.guardian_id,
        guardianName: recipient.guardian_name,
        status: 'submitted',
      });
    } catch {
      // Relay acceptance is known, but persistence is not. Keep pending as a non-retryable
      // ambiguous state rather than risk a duplicate guardian email.
      results.push({
        guardianId: recipient.guardian_id,
        guardianName: recipient.guardian_name,
        status: 'ambiguous',
        requestId: c.get('requestId'),
      });
    }
  }
  return results;
}
export type AnyNotificationResult = {
  guardianId: string;
  guardianName?: string;
  status: string;
  retryAvailable?: boolean;
  requestId?: string;
  already?: boolean;
};
