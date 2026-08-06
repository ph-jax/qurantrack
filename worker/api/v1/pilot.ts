/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Context } from 'hono';
import { sendRelayMail } from '../../email/relay';
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
        code: code === 403 ? 'FORBIDDEN' : code === 400 ? 'VALIDATION_ERROR' : 'NOT_FOUND',
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
  await c.env.DB.prepare(
    exists
      ? 'UPDATE classes SET name=?,description=?,meeting_schedule=?,active=?,updated_at=? WHERE id=? AND organization_id=?'
      : 'INSERT INTO classes (name,description,meeting_schedule,active,updated_at,id,organization_id,created_at) VALUES (?,?,?,?,?,?,?,?)',
  )
    .bind(
      str(b.name, 120),
      opt(b.description),
      opt(b.meeting_schedule),
      bool(b.active) ? 1 : 0,
      t,
      cid,
      org,
      t,
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
  return c.json({ ok: true, students: rows.results });
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
  await c.env.DB.prepare(
    exists
      ? 'UPDATE students SET external_id=?,first_name=?,last_name=?,display_name=?,active=?,notes=?,updated_at=? WHERE id=? AND organization_id=?'
      : 'INSERT INTO students (external_id,first_name,last_name,display_name,active,notes,updated_at,id,organization_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(
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
  await c.env.DB.prepare(
    exists
      ? 'UPDATE guardians SET name=?,email=?,phone=?,active=?,preferred_locale=?,updated_at=? WHERE id=? AND organization_id=?'
      : 'INSERT INTO guardians (name,email,phone,active,preferred_locale,updated_at,id,organization_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
  )
    .bind(
      str(b.name, 120),
      str(b.email, 254).toLowerCase(),
      opt(b.phone, 40),
      bool(b.active) ? 1 : 0,
      locale,
      t,
      gid,
      org,
      t,
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
export async function curriculum(c: Ctx) {
  const org = c.get('auth').organizationId;
  const tracks = await c.env.DB.prepare(
    'SELECT * FROM program_tracks WHERE organization_id=? ORDER BY sort_order,name',
  )
    .bind(org)
    .all();
  const levels = await c.env.DB.prepare(
    'SELECT * FROM levels WHERE organization_id=? ORDER BY sort_order,name',
  )
    .bind(org)
    .all();
  const lessons = await c.env.DB.prepare(
    'SELECT * FROM lessons WHERE organization_id=? ORDER BY sort_order,name',
  )
    .bind(org)
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
  await c.env.DB.prepare(
    ex
      ? 'UPDATE program_tracks SET code=?,name=?,description=?,sort_order=?,active=?,updated_at=? WHERE id=? AND organization_id=?'
      : 'INSERT INTO program_tracks (code,name,description,sort_order,active,updated_at,id,organization_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
  )
    .bind(
      str(b.code, 40),
      str(b.name, 120),
      opt(b.description),
      Number(b.sort_order) || 0,
      bool(b.active) ? 1 : 0,
      t,
      rid,
      org,
      t,
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
  const ex = await c.env.DB.prepare('SELECT 1 FROM levels WHERE id=? AND organization_id=?')
    .bind(rid, org)
    .first();
  await c.env.DB.prepare(
    ex
      ? 'UPDATE levels SET track_id=?,code=?,name=?,description=?,sort_order=?,active=?,updated_at=? WHERE id=? AND organization_id=?'
      : 'INSERT INTO levels (track_id,code,name,description,sort_order,active,updated_at,id,organization_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(
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
  const ex = await c.env.DB.prepare('SELECT 1 FROM lessons WHERE id=? AND organization_id=?')
    .bind(rid, org)
    .first();
  await c.env.DB.prepare(
    ex
      ? 'UPDATE lessons SET level_id=?,code=?,name=?,description=?,sort_order=?,default_homework=?,active=?,updated_at=? WHERE id=? AND organization_id=?'
      : 'INSERT INTO lessons (level_id,code,name,description,sort_order,default_homework,active,updated_at,id,organization_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(
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
    )
    .run();
  return c.json({ ok: true, id: rid });
}
export async function assignTrack(c: Ctx) {
  const b = await body(c),
    org = c.get('auth').organizationId,
    studentId = str(b.student_id);
  if (!admin(c.get('auth')) && !(teacher(c.get('auth')) && (await canSeeStudent(c, studentId))))
    return json(c, 404);
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
    `SELECT stl.track_id,t.name track_name,l.id level_id,l.name level_name FROM student_track_levels stl JOIN program_tracks t ON t.id=stl.track_id JOIN levels l ON l.id=stl.current_level_id WHERE stl.student_id=? AND stl.organization_id=? ORDER BY t.sort_order,t.name`,
  )
    .bind(studentId, org)
    .all();
  const passed = await c.env.DB.prepare(
    `SELECT l.id,l.name FROM student_lesson_status sls JOIN lessons l ON l.id=sls.lesson_id WHERE sls.student_id=? AND sls.organization_id=? AND sls.first_passed_at IS NOT NULL ORDER BY sls.last_activity_at DESC`,
  )
    .bind(studentId, org)
    .all();
  const updates = await c.env.DB.prepare(
    `SELECT pu.*, c.name class_name, u.display_name teacher_name FROM progress_updates pu LEFT JOIN classes c ON c.id=pu.class_id LEFT JOIN users u ON u.id=pu.teacher_user_id WHERE pu.student_id=? AND pu.organization_id=? ORDER BY pu.update_date DESC, pu.created_at DESC LIMIT 10`,
  )
    .bind(studentId, org)
    .all();
  const guardians = await c.env.DB.prepare(
    `SELECT g.name,g.email,sg.receive_notifications FROM guardians g JOIN student_guardians sg ON sg.guardian_id=g.id AND sg.organization_id=g.organization_id WHERE sg.student_id=? AND g.organization_id=? AND g.active=1`,
  )
    .bind(studentId, org)
    .all();
  const notifications = await c.env.DB.prepare(
    `SELECT progress_update_id,status,error_code,error_message,created_at,sent_at FROM notification_log WHERE student_id=? AND organization_id=? ORDER BY created_at DESC LIMIT 20`,
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
  });
}
async function applyLessonStatus(c: Ctx, updateId: string) {
  const org = c.get('auth').organizationId;
  const pu = await c.env.DB.prepare(
    "SELECT student_id,update_date FROM progress_updates WHERE id=? AND organization_id=? AND status='published'",
  )
    .bind(updateId, org)
    .first<{ student_id: string; update_date: string }>();
  if (!pu) return;
  const items = await c.env.DB.prepare(
    'SELECT lesson_id,outcome FROM progress_update_items WHERE progress_update_id=? AND organization_id=?',
  )
    .bind(updateId, org)
    .all<{ lesson_id: string; outcome: string }>();
  for (const it of items.results ?? []) {
    const existing = await c.env.DB.prepare(
      'SELECT first_passed_at FROM student_lesson_status WHERE organization_id=? AND student_id=? AND lesson_id=?',
    )
      .bind(org, pu.student_id, it.lesson_id)
      .first<{ first_passed_at: string | null }>();
    const first = existing?.first_passed_at || (it.outcome === 'passed' ? pu.update_date : null);
    await c.env.DB.prepare(
      'INSERT INTO student_lesson_status (id,organization_id,student_id,lesson_id,current_status,first_passed_at,last_activity_at,last_progress_update_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,student_id,lesson_id) DO UPDATE SET current_status=excluded.current_status, first_passed_at=COALESCE(student_lesson_status.first_passed_at, excluded.first_passed_at), last_activity_at=excluded.last_activity_at, last_progress_update_id=excluded.last_progress_update_id, updated_at=excluded.updated_at',
    )
      .bind(
        id('sls'),
        org,
        pu.student_id,
        it.lesson_id,
        it.outcome,
        first,
        pu.update_date,
        updateId,
        now(),
        now(),
      )
      .run();
  }
}
export async function saveProgress(c: Ctx) {
  const b = await body(c),
    org = c.get('auth').organizationId,
    a = c.get('auth'),
    sid = str(b.student_id),
    classId = opt(b.class_id, 80);
  if (!(await canSeeStudent(c, sid, classId))) return json(c, 404);
  const status = str(b.status) === 'published' ? 'published' : 'draft';
  if (status === 'draft' && !admin(a) && !teacher(a)) return json(c, 403);
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) return json(c, 400);
  const puid = str(b.id) || id('pu'),
    t = now(),
    ex = await c.env.DB.prepare(
      'SELECT status,teacher_user_id FROM progress_updates WHERE id=? AND organization_id=?',
    )
      .bind(puid, org)
      .first<{ status: string; teacher_user_id: string }>();
  if (ex?.status === 'published')
    return json(c, 400, 'Published updates are historical. Create a new correction update.');
  if (ex && !admin(a) && ex.teacher_user_id !== a.userId) return json(c, 404);
  await c.env.DB.prepare(
    ex
      ? 'UPDATE progress_updates SET student_id=?,class_id=?,update_date=?,overall_comment=?,homework=?,status=?,published_at=?,updated_at=? WHERE id=? AND organization_id=?'
      : 'INSERT INTO progress_updates (student_id,class_id,update_date,overall_comment,homework,status,published_at,updated_at,id,organization_id,teacher_user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(
      sid,
      classId,
      str(b.update_date, 20) || t.slice(0, 10),
      opt(b.overall_comment, 1000),
      opt(b.homework, 1000),
      status,
      status === 'published' ? t : null,
      t,
      puid,
      org,
      a.userId,
      t,
    )
    .run();
  await c.env.DB.prepare(
    'DELETE FROM progress_update_items WHERE progress_update_id=? AND organization_id=?',
  )
    .bind(puid, org)
    .run();
  for (const item of items as Record<string, unknown>[]) {
    const lesson = await c.env.DB.prepare(
      'SELECT l.id lesson_id,l.level_id,lv.track_id FROM lessons l JOIN levels lv ON lv.id=l.level_id AND lv.organization_id=l.organization_id WHERE l.id=? AND l.organization_id=?',
    )
      .bind(str(item.lesson_id), org)
      .first<{ lesson_id: string; level_id: string; track_id: string }>();
    if (!lesson) return json(c, 404);
    const outcome = ['passed', 'practiced', 'needs_practice', 'assigned'].includes(
      str(item.outcome),
    )
      ? str(item.outcome)
      : 'practiced';
    await c.env.DB.prepare(
      'INSERT INTO progress_update_items (id,organization_id,progress_update_id,track_id,level_id,lesson_id,outcome,item_comment,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    )
      .bind(
        id('pui'),
        org,
        puid,
        lesson.track_id,
        lesson.level_id,
        lesson.lesson_id,
        outcome,
        opt(item.item_comment, 500),
        t,
        t,
      )
      .run();
  }
  if (status === 'published') await applyLessonStatus(c, puid);
  await audit(
    c,
    status === 'published' ? 'progress.publish' : 'progress.draft',
    'progress_update',
    puid,
    'Progress saved',
  );
  if (status === 'published' && b.notify === true) await notify(c, puid, false);
  return c.json({ ok: true, id: puid });
}
function emailText(locale: string, data: any) {
  const tr = locale === 'tr';
  const lines = data.items
    .map(
      (i: any) => `- ${i.lesson_name}: ${i.outcome}${i.item_comment ? ` (${i.item_comment})` : ''}`,
    )
    .join('\n');
  return `${data.org_name}\n${tr ? 'Öğrenci' : 'Student'}: ${data.student_name}\n${tr ? 'Tarih' : 'Date'}: ${data.update_date}\n${tr ? 'Sınıf' : 'Class'}: ${data.class_name || ''}\n${tr ? 'Öğretmen' : 'Teacher'}: ${data.teacher_name}\n${lines}\n${tr ? 'Yorum' : 'Comment'}: ${data.overall_comment || ''}\n${tr ? 'Ödev' : 'Homework'}: ${data.homework || ''}`;
}
function emailHtml(locale: string, data: any) {
  return `<h1>${esc(data.org_name)}</h1><p><strong>${locale === 'tr' ? 'Öğrenci' : 'Student'}:</strong> ${esc(data.student_name)}</p><p><strong>${locale === 'tr' ? 'Tarih' : 'Date'}:</strong> ${esc(data.update_date)}</p><p><strong>${locale === 'tr' ? 'Sınıf' : 'Class'}:</strong> ${esc(data.class_name || '')}<br><strong>${locale === 'tr' ? 'Öğretmen' : 'Teacher'}:</strong> ${esc(data.teacher_name)}</p><ul>${data.items.map((i: any) => `<li>${esc(i.lesson_name)}: ${esc(i.outcome)}${i.item_comment ? ` — ${esc(i.item_comment)}` : ''}</li>`).join('')}</ul><p><strong>${locale === 'tr' ? 'Yorum' : 'Comment'}:</strong> ${esc(data.overall_comment || '')}</p><p><strong>${locale === 'tr' ? 'Ödev' : 'Homework'}:</strong> ${esc(data.homework || '')}</p>`;
}
export async function notifyProgress(c: Ctx) {
  return notify(c, param(c, 'id'), c.req.query('retry') === '1');
}
export async function notify(c: Ctx, progressId: string, retry = false) {
  const org = c.get('auth').organizationId;
  const pu = await c.env.DB.prepare(
    `SELECT pu.*, s.display_name student_name, cls.name class_name, u.display_name teacher_name, o.name org_name,o.default_locale,o.email_sender_name,o.email_reply_to,o.email_sender_alias FROM progress_updates pu JOIN students s ON s.id=pu.student_id JOIN organizations o ON o.id=pu.organization_id LEFT JOIN classes cls ON cls.id=pu.class_id LEFT JOIN users u ON u.id=pu.teacher_user_id WHERE pu.id=? AND pu.organization_id=? AND pu.status='published'`,
  )
    .bind(progressId, org)
    .first<any>();
  if (!pu || !(await canSeeStudent(c, pu.student_id, pu.class_id))) return json(c, 404);
  const items = (
    await c.env.DB.prepare(
      'SELECT l.name lesson_name,pui.outcome,pui.item_comment FROM progress_update_items pui JOIN lessons l ON l.id=pui.lesson_id WHERE pui.progress_update_id=? AND pui.organization_id=?',
    )
      .bind(progressId, org)
      .all()
  ).results;
  const rec = (
    await c.env.DB.prepare(
      `SELECT g.id guardian_id,g.name,g.email,g.preferred_locale FROM guardians g JOIN student_guardians sg ON sg.guardian_id=g.id AND sg.organization_id=g.organization_id WHERE sg.student_id=? AND g.organization_id=? AND g.active=1 AND sg.receive_notifications=1`,
    )
      .bind(pu.student_id, org)
      .all<any>()
  ).results;
  const sender = resolveSender(c.env, pu);
  const results = [];
  for (const r of rec) {
    const dedup = `progress:${progressId}:guardian:${r.guardian_id}`;
    const prior = await c.env.DB.prepare(
      'SELECT id,status FROM notification_log WHERE organization_id=? AND deduplication_key=? ORDER BY created_at DESC LIMIT 1',
    )
      .bind(org, dedup)
      .first<any>();
    if (prior?.status === 'sent' || (prior && prior.status !== 'failed' && !retry)) {
      results.push({ guardianId: r.guardian_id, status: 'skipped' });
      continue;
    }
    const locale = ['en', 'tr'].includes(r.preferred_locale)
      ? r.preferred_locale
      : pu.default_locale;
    const subject =
      locale === 'tr'
        ? `${pu.student_name} için ilerleme güncellemesi`
        : `Progress update for ${pu.student_name}`;
    const logId = id('not');
    await c.env.DB.prepare(
      'INSERT OR REPLACE INTO notification_log (id,organization_id,guardian_id,student_id,progress_update_id,recipient_email,notification_type,subject,status,created_at,deduplication_key,attempted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    )
      .bind(
        logId,
        org,
        r.guardian_id,
        pu.student_id,
        progressId,
        r.email,
        'progress_update',
        subject,
        'pending',
        now(),
        dedup,
        now(),
      )
      .run();
    try {
      const data = { ...pu, items };
      await sendRelayMail(c.env, {
        to: r.email,
        fromAlias: sender.fromAlias,
        senderName: sender.senderName,
        replyTo: sender.replyTo,
        subject,
        text: emailText(locale, data),
        html: emailHtml(locale, data),
      });
      await c.env.DB.prepare(
        "UPDATE notification_log SET status='sent',sent_at=?,error_code=NULL,error_message=NULL WHERE id=? AND organization_id=?",
      )
        .bind(now(), logId, org)
        .run();
      results.push({ guardianId: r.guardian_id, status: 'sent' });
    } catch {
      await c.env.DB.prepare(
        "UPDATE notification_log SET status='failed',error_code=?,error_message=? WHERE id=? AND organization_id=?",
      )
        .bind(
          'RELAY_REJECTED',
          `Email relay submission failed. Reference ${c.get('requestId')}`,
          logId,
          org,
        )
        .run();
      results.push({ guardianId: r.guardian_id, status: 'failed', requestId: c.get('requestId') });
    }
  }
  await audit(
    c,
    'notification.progress',
    'progress_update',
    progressId,
    'Progress notification submitted',
    { count: results.length },
  );
  return c.json({ ok: true, results });
}
