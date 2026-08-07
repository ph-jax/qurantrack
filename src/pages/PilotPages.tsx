/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Badge, Button, Card, FormField, Input, Spinner, Textarea } from '../components/ui';
import { useSession } from '../features/auth/SessionProvider';
import { pilotResultPresentation, requestNotificationAction } from '../features/pilot/results';

type Any = Record<string, any>;
async function api<T = Any>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const value = (await response.json().catch(() => null)) as Any | null;
  if (!response.ok) throw new Error(value?.error?.message || 'request_failed');
  return value as T;
}
function useLoad(url: string | null) {
  const [data, setData] = useState<Any | null>(url ? null : {});
  const [error, setError] = useState(false);
  const reload = useCallback(async () => {
    if (!url) {
      return;
    }
    setError(false);
    try {
      setData(await api(url));
    } catch {
      setError(true);
    }
  }, [url]);
  useEffect(() => {
    if (!url) return;
    let current = true;
    api(url)
      .then((value) => current && setData(value))
      .catch(() => current && setError(true));
    return () => {
      current = false;
    };
  }, [url]);
  return { data, error, reload };
}
function Header({ title, description }: { title: string; description: string }) {
  return (
    <div className="page-header">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}
function SelectField({
  id,
  label,
  value,
  onChange,
  children,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <FormField id={id} label={label}>
      <select
        id={id}
        className="settings-select"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </FormField>
  );
}
function Status({ value }: { value: boolean }) {
  const { t } = useTranslation();
  return (
    <Badge tone={value ? 'success' : 'neutral'}>
      {t(value ? 'pilot.active' : 'pilot.inactive')}
    </Badge>
  );
}
function Editor({
  title,
  initial,
  fields,
  onSave,
  onCancel,
}: {
  title: string;
  initial?: Any;
  fields: {
    key: string;
    label: string;
    type?: string;
    textarea?: boolean;
    options?: { value: string; label: string }[];
    disabled?: boolean;
  }[];
  onSave: (value: Any) => Promise<void>;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState<Any>({ active: true, ...initial });
  const [state, setState] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setState('saving');
    try {
      await onSave(value);
      setState('saved');
    } catch {
      setState('error');
    }
  }
  return (
    <Card>
      <form className="grid gap-3" onSubmit={submit}>
        <h3 className="text-lg font-bold">{title}</h3>
        {fields.map((field) =>
          field.options ? (
            <SelectField
              key={field.key}
              id={`${title}-${field.key}`}
              label={field.label}
              value={value[field.key] ?? ''}
              disabled={field.disabled}
              onChange={(next) => setValue({ ...value, [field.key]: next })}
            >
              <option value="">{t('pilot.select')}</option>
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          ) : (
            <FormField key={field.key} id={`${title}-${field.key}`} label={field.label}>
              {field.textarea ? (
                <Textarea
                  id={`${title}-${field.key}`}
                  value={value[field.key] ?? ''}
                  onChange={(event) => setValue({ ...value, [field.key]: event.target.value })}
                />
              ) : (
                <Input
                  id={`${title}-${field.key}`}
                  type={field.type}
                  value={value[field.key] ?? ''}
                  onChange={(event) => setValue({ ...value, [field.key]: event.target.value })}
                />
              )}
            </FormField>
          ),
        )}
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!value.active}
            onChange={(event) => setValue({ ...value, active: event.target.checked })}
          />
          {t('pilot.active')}
        </label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={state === 'saving'}>
            {state === 'saving' ? t('pilot.saving') : t('pilot.save')}
          </Button>
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              {t('pilot.cancel')}
            </Button>
          )}
        </div>
        {state === 'saved' && <Alert tone="success" title={t('pilot.saved')} />}
        {state === 'error' && <Alert tone="error" title={t('pilot.saveError')} />}
      </form>
    </Card>
  );
}

export function ClassesPage() {
  const { t } = useTranslation();
  const { session } = useSession();
  const admin = session?.role === 'organization_admin';
  const classes = useLoad('/api/v1/classes');
  const setup = useLoad(admin ? '/api/v1/pilot/setup-options' : null);
  const [editing, setEditing] = useState<Any | null>(null);
  const reload = async () => {
    await Promise.all([classes.reload(), setup.reload()]);
    setEditing(null);
  };
  if (classes.error || (admin && setup.error))
    return <Alert tone="error" title={t('pilot.loadError')} />;
  if (!classes.data || (admin && !setup.data)) return <Spinner label={t('pilot.loading')} />;
  const options = setup.data ?? {};
  return (
    <div className="space-y-5">
      <Header title={t('pilot.classes.title')} description={t('pilot.classes.description')} />
      {admin && (
        <Editor
          key={editing?.id ?? 'create-class'}
          title={editing ? t('pilot.classes.edit') : t('pilot.classes.create')}
          initial={editing ?? undefined}
          fields={[
            { key: 'name', label: t('pilot.name') },
            { key: 'description', label: t('pilot.description'), textarea: true },
            { key: 'meeting_schedule', label: t('pilot.schedule') },
          ]}
          onSave={(value) =>
            api('/api/v1/classes', { method: 'POST', body: JSON.stringify(value) }).then(reload)
          }
          onCancel={editing ? () => setEditing(null) : undefined}
        />
      )}
      <div className="grid gap-3">
        {classes.data.classes.map((item: Any) => (
          <ClassCard
            key={item.id}
            item={item}
            admin={admin}
            options={options}
            reload={reload}
            edit={() => setEditing(item)}
          />
        ))}
        {!classes.data.classes.length && (
          <Card>
            <p>{t('pilot.emptyClasses')}</p>
            {admin && (
              <Button className="mt-3" type="button" onClick={() => window.scrollTo({ top: 0 })}>
                {t('pilot.classes.create')}
              </Button>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
function ClassCard({
  item,
  admin,
  options,
  reload,
  edit,
}: {
  item: Any;
  admin: boolean;
  options: Any;
  reload: () => Promise<void>;
  edit: () => void;
}) {
  const { t } = useTranslation();
  const [teacherId, setTeacherId] = useState('');
  const [studentId, setStudentId] = useState('');
  const assignments = (options.assignments ?? []).filter((x: Any) => x.class_id === item.id);
  const enrollments = (options.enrollments ?? []).filter((x: Any) => x.class_id === item.id);
  return (
    <Card>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-bold">{item.name}</h3>
            <p className="text-sm text-text-secondary">{item.meeting_schedule}</p>
          </div>
          <Status value={!!item.active} />
        </div>
        <Link className="font-semibold text-brand" to={`/app/classes/${item.id}`}>
          {t('pilot.classes.roster')}
        </Link>
        {admin && (
          <>
            <Button type="button" variant="secondary" onClick={edit}>
              {t('pilot.edit')}
            </Button>
            <div className="rounded border border-border p-3">
              <h4 className="font-semibold">{t('pilot.classes.teachers')}</h4>
              {assignments.map((assignment: Any) => (
                <div
                  key={assignment.user_id}
                  className="flex items-center justify-between gap-2 py-1"
                >
                  <span>{assignment.display_name}</span>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      confirm(t('pilot.confirm')) &&
                      api(`/api/v1/classes/${item.id}/teachers/${assignment.user_id}`, {
                        method: 'DELETE',
                      }).then(reload)
                    }
                  >
                    {t('pilot.remove')}
                  </Button>
                </div>
              ))}
              <SelectField
                id={`teacher-${item.id}`}
                label={t('pilot.classes.eligibleTeacher')}
                value={teacherId}
                onChange={setTeacherId}
              >
                <option value="">{t('pilot.select')}</option>
                {(options.teachers ?? [])
                  .filter((teacher: Any) => !assignments.some((x: Any) => x.user_id === teacher.id))
                  .map((teacher: Any) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.display_name}
                    </option>
                  ))}
              </SelectField>
              <Button
                type="button"
                disabled={!teacherId || !item.active}
                onClick={() =>
                  api(`/api/v1/classes/${item.id}/teachers`, {
                    method: 'POST',
                    body: JSON.stringify({ user_id: teacherId }),
                  }).then(reload)
                }
              >
                {t('pilot.classes.assignTeacher')}
              </Button>
            </div>
            <div className="rounded border border-border p-3">
              <h4 className="font-semibold">{t('pilot.classes.enrollments')}</h4>
              {enrollments.map((enrollment: Any) => (
                <div
                  key={enrollment.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-1"
                >
                  <span>
                    {enrollment.display_name} ·{' '}
                    {t(enrollment.active ? 'pilot.active' : 'pilot.withdrawn')}
                  </span>
                  {enrollment.active ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        confirm(t('pilot.confirm')) &&
                        api(`/api/v1/enrollments/${enrollment.id}/withdraw`, {
                          method: 'POST',
                        }).then(reload)
                      }
                    >
                      {t('pilot.withdraw')}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      disabled={
                        !item.active ||
                        !(options.students ?? []).find((s: Any) => s.id === enrollment.student_id)
                          ?.active
                      }
                      onClick={() =>
                        api('/api/v1/enrollments', {
                          method: 'POST',
                          body: JSON.stringify({
                            class_id: item.id,
                            student_id: enrollment.student_id,
                          }),
                        }).then(reload)
                      }
                    >
                      {t('pilot.reEnroll')}
                    </Button>
                  )}
                </div>
              ))}
              <SelectField
                id={`student-${item.id}`}
                label={t('pilot.classes.eligibleStudent')}
                value={studentId}
                onChange={setStudentId}
              >
                <option value="">{t('pilot.select')}</option>
                {(options.students ?? [])
                  .filter(
                    (student: Any) =>
                      student.active &&
                      !enrollments.some((x: Any) => x.student_id === student.id && x.active),
                  )
                  .map((student: Any) => (
                    <option key={student.id} value={student.id}>
                      {student.display_name}
                    </option>
                  ))}
              </SelectField>
              <Button
                type="button"
                disabled={!studentId || !item.active}
                onClick={() =>
                  api('/api/v1/enrollments', {
                    method: 'POST',
                    body: JSON.stringify({ class_id: item.id, student_id: studentId }),
                  }).then(reload)
                }
              >
                {t('pilot.enroll')}
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export function StudentsPage() {
  const { t } = useTranslation();
  const { session } = useSession();
  const admin = session?.role === 'organization_admin';
  const students = useLoad('/api/v1/students');
  const setup = useLoad(admin ? '/api/v1/pilot/setup-options' : null);
  const [studentEdit, setStudentEdit] = useState<Any | null>(null);
  const [guardianEdit, setGuardianEdit] = useState<Any | null>(null);
  const reload = async () => {
    await Promise.all([students.reload(), setup.reload()]);
    setStudentEdit(null);
    setGuardianEdit(null);
  };
  if (students.error || (admin && setup.error))
    return <Alert tone="error" title={t('pilot.loadError')} />;
  if (!students.data || (admin && !setup.data)) return <Spinner label={t('pilot.loading')} />;
  return (
    <div className="space-y-5">
      <Header title={t('pilot.students.title')} description={t('pilot.students.description')} />
      {admin && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Editor
            key={studentEdit?.id ?? 'create-student'}
            title={studentEdit ? t('pilot.students.edit') : t('pilot.students.create')}
            initial={studentEdit ?? undefined}
            fields={[
              { key: 'display_name', label: t('pilot.displayName') },
              { key: 'first_name', label: t('pilot.firstName') },
              { key: 'last_name', label: t('pilot.lastName') },
              { key: 'external_id', label: t('pilot.externalId') },
              { key: 'notes', label: t('pilot.notes'), textarea: true },
            ]}
            onSave={(value) =>
              api('/api/v1/students', { method: 'POST', body: JSON.stringify(value) }).then(reload)
            }
            onCancel={studentEdit ? () => setStudentEdit(null) : undefined}
          />
          <Editor
            key={guardianEdit?.id ?? 'create-guardian'}
            title={guardianEdit ? t('pilot.guardians.edit') : t('pilot.guardians.create')}
            initial={guardianEdit ?? undefined}
            fields={[
              { key: 'name', label: t('pilot.name') },
              { key: 'email', label: t('pilot.email'), type: 'email' },
              { key: 'phone', label: t('pilot.phone') },
              {
                key: 'preferred_locale',
                label: t('pilot.locale'),
                options: [
                  { value: 'en', label: t('common.english') },
                  { value: 'tr', label: t('common.turkish') },
                ],
              },
            ]}
            onSave={(value) =>
              api('/api/v1/guardians', { method: 'POST', body: JSON.stringify(value) }).then(reload)
            }
            onCancel={guardianEdit ? () => setGuardianEdit(null) : undefined}
          />
        </div>
      )}
      {admin && !!setup.data?.guardians.length && (
        <Card>
          <h3 className="font-bold">{t('pilot.guardians.title')}</h3>
          {setup.data.guardians.map((guardian: Any) => (
            <div
              key={guardian.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2"
            >
              <span>
                {guardian.name} · {guardian.email}
              </span>
              <div className="flex gap-2">
                <Status value={!!guardian.active} />
                <Button type="button" variant="secondary" onClick={() => setGuardianEdit(guardian)}>
                  {t('pilot.edit')}
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
      <div className="grid gap-3">
        {students.data.students.map((student: Any) => (
          <Card key={student.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold">{student.display_name}</h3>
                {admin && <Status value={!!student.active} />}
              </div>
              <div className="flex gap-2">
                {admin && (
                  <Button type="button" variant="secondary" onClick={() => setStudentEdit(student)}>
                    {t('pilot.edit')}
                  </Button>
                )}
                <Link className="font-semibold text-brand" to={`/app/students/${student.id}`}>
                  {t('pilot.progress')}
                </Link>
              </div>
            </div>
          </Card>
        ))}
        {!students.data.students.length && (
          <Card>
            <p>{t('pilot.emptyStudents')}</p>
            {admin && (
              <Button className="mt-3" type="button" onClick={() => window.scrollTo({ top: 0 })}>
                {t('pilot.students.create')}
              </Button>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

export function FamiliesPage() {
  const { t } = useTranslation();
  const setup = useLoad('/api/v1/pilot/setup-options');
  const [editing, setEditing] = useState<Any | null>(null);
  const reload = async () => {
    await setup.reload();
    setEditing(null);
  };
  if (setup.error) return <Alert tone="error" title={t('pilot.loadError')} />;
  if (!setup.data) return <Spinner label={t('pilot.loading')} />;
  const data = setup.data;
  return (
    <div className="space-y-5">
      <Header title={t('pilot.guardians.title')} description={t('pilot.guardians.description')} />
      <Editor
        key={editing?.id ?? 'create-guardian'}
        title={editing ? t('pilot.guardians.edit') : t('pilot.guardians.create')}
        initial={editing ?? undefined}
        fields={[
          { key: 'name', label: t('pilot.name') },
          { key: 'email', label: t('pilot.email'), type: 'email' },
          { key: 'phone', label: t('pilot.phone') },
          {
            key: 'preferred_locale',
            label: t('pilot.locale'),
            options: [
              { value: 'en', label: t('common.english') },
              { value: 'tr', label: t('common.turkish') },
            ],
          },
        ]}
        onSave={(value) =>
          api('/api/v1/guardians', { method: 'POST', body: JSON.stringify(value) }).then(reload)
        }
        onCancel={editing ? () => setEditing(null) : undefined}
      />
      <div className="grid gap-3">
        {data.guardians.map((guardian: Any) => {
          const links = data.guardianLinks.filter((link: Any) => link.guardian_id === guardian.id);
          return (
            <Card key={guardian.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold">{guardian.name}</h3>
                  <p className="break-all text-sm text-text-secondary">{guardian.email}</p>
                  <p className="text-sm">{guardian.preferred_locale?.toUpperCase()}</p>
                </div>
                <div className="flex gap-2">
                  <Status value={!!guardian.active} />
                  <Button type="button" variant="secondary" onClick={() => setEditing(guardian)}>
                    {t('pilot.edit')}
                  </Button>
                </div>
              </div>
              <h4 className="mt-3 font-semibold">{t('pilot.guardians.linkedStudents')}</h4>
              {links.map((link: Any) => (
                <div
                  key={link.id}
                  className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2"
                >
                  <span>
                    {
                      data.students.find((student: Any) => student.id === link.student_id)
                        ?.display_name
                    }{' '}
                    · {t(link.receive_notifications ? 'pilot.enabled' : 'pilot.disabled')}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      confirm(t('pilot.confirm')) &&
                      api(`/api/v1/student-guardians/${link.id}`, { method: 'DELETE' }).then(reload)
                    }
                  >
                    {t('pilot.guardians.unlink')}
                  </Button>
                </div>
              ))}
              {!links.length && <p className="text-sm text-text-secondary">{t('pilot.empty')}</p>}
            </Card>
          );
        })}
        {!data.guardians.length && (
          <Card>
            <p>{t('pilot.guardians.empty')}</p>
          </Card>
        )}
      </div>
    </div>
  );
}

export function ProgramPage() {
  const { t } = useTranslation();
  const program = useLoad('/api/v1/program');
  const [kind, setKind] = useState('track');
  const [editing, setEditing] = useState<Any | null>(null);
  if (program.error) return <Alert tone="error" title={t('pilot.loadError')} />;
  if (!program.data) return <Spinner label={t('pilot.loading')} />;
  const tracks = program.data.tracks;
  const levels = program.data.levels;
  const endpoint = kind === 'track' ? 'tracks' : kind === 'level' ? 'levels' : 'lessons';
  const fields =
    kind === 'track'
      ? [
          { key: 'code', label: t('pilot.code') },
          { key: 'name', label: t('pilot.name') },
          { key: 'description', label: t('pilot.description'), textarea: true },
          { key: 'sort_order', label: t('pilot.order'), type: 'number' },
        ]
      : kind === 'level'
        ? [
            {
              key: 'track_id',
              label: t('pilot.track'),
              disabled: !!editing,
              options: tracks.map((x: Any) => ({ value: x.id, label: x.name })),
            },
            { key: 'code', label: t('pilot.code') },
            { key: 'name', label: t('pilot.name') },
            { key: 'description', label: t('pilot.description'), textarea: true },
            { key: 'sort_order', label: t('pilot.order'), type: 'number' },
          ]
        : [
            {
              key: 'level_id',
              label: t('pilot.level'),
              disabled: !!editing,
              options: levels.map((x: Any) => ({
                value: x.id,
                label: `${tracks.find((t: Any) => t.id === x.track_id)?.name} · ${x.name}`,
              })),
            },
            { key: 'code', label: t('pilot.code') },
            { key: 'name', label: t('pilot.name') },
            { key: 'description', label: t('pilot.description'), textarea: true },
            { key: 'sort_order', label: t('pilot.order'), type: 'number' },
            { key: 'default_homework', label: t('pilot.homework'), textarea: true },
          ];
  const begin = (nextKind: string, value?: Any) => {
    setKind(nextKind);
    setEditing(value ?? null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return (
    <div className="space-y-5">
      <Header title={t('pilot.program.title')} description={t('pilot.program.description')} />
      <div className="flex flex-wrap gap-2">
        {['track', 'level', 'lesson'].map((value) => (
          <Button key={value} type="button" variant="secondary" onClick={() => begin(value)}>
            {t(`pilot.program.add.${value}`)}
          </Button>
        ))}
      </div>
      <Editor
        key={`${kind}-${editing?.id ?? 'new'}`}
        title={t(`pilot.program.${editing ? 'edit' : 'create'}.${kind}`)}
        initial={editing ?? undefined}
        fields={fields}
        onSave={(value) =>
          api(`/api/v1/program/${endpoint}`, { method: 'POST', body: JSON.stringify(value) })
            .then(program.reload)
            .then(() => setEditing(null))
        }
        onCancel={editing ? () => setEditing(null) : undefined}
      />
      <Card>
        <h3 className="font-bold">{t('pilot.program.curriculum')}</h3>
        {tracks.map((track: Any) => (
          <div key={track.id} className="mt-4 rounded border border-border p-3">
            <EntityRow
              entity={track}
              label={`${track.sort_order}. ${track.name}`}
              onEdit={() => begin('track', track)}
            />
            {levels
              .filter((level: Any) => level.track_id === track.id)
              .map((level: Any) => (
                <div key={level.id} className="ms-3 mt-2">
                  <EntityRow
                    entity={level}
                    label={`${level.sort_order}. ${level.name}`}
                    onEdit={() => begin('level', level)}
                  />
                  {program
                    .data!.lessons.filter((lesson: Any) => lesson.level_id === level.id)
                    .map((lesson: Any) => (
                      <div key={lesson.id} className="ms-3 mt-2">
                        <EntityRow
                          entity={lesson}
                          label={`${lesson.sort_order}. ${lesson.name}`}
                          onEdit={() => begin('lesson', lesson)}
                        />
                        <p className="text-sm text-text-secondary">{lesson.default_homework}</p>
                      </div>
                    ))}
                </div>
              ))}
          </div>
        ))}
      </Card>
    </div>
  );
}
function EntityRow({ entity, label, onEdit }: { entity: Any; label: string; onEdit: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <strong>{label}</strong>
      <div className="flex gap-2">
        <Status value={!!entity.active} />
        <Button type="button" variant="secondary" onClick={onEdit}>
          {t('pilot.edit')}
        </Button>
      </div>
    </div>
  );
}

export function RosterPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const roster = useLoad(`/api/v1/classes/${id}/roster`);
  if (roster.error) return <Alert tone="error" title={t('pilot.loadError')} />;
  if (!roster.data) return <Spinner label={t('pilot.loading')} />;
  return (
    <div className="space-y-5">
      <Header title={roster.data.class.name} description={t('pilot.classes.activeRoster')} />
      <div className="grid gap-3">
        {roster.data.students.map((student: Any) => (
          <Card key={student.id}>
            <Link className="font-bold text-brand" to={`/app/students/${student.id}`}>
              {student.display_name}
            </Link>
          </Card>
        ))}
        {!roster.data.students.length && <p>{t('pilot.empty')}</p>}
      </div>
    </div>
  );
}

export function StudentProgressPage() {
  const { t } = useTranslation();
  const { session } = useSession();
  const { id } = useParams();
  const admin = session?.role === 'organization_admin';
  const summary = useLoad(`/api/v1/students/${id}/summary`);
  const program = useLoad('/api/v1/program');
  const setup = useLoad(admin ? '/api/v1/pilot/setup-options' : null);
  const [draft, setDraft] = useState<Any | null>(null);
  const [formEpoch, setFormEpoch] = useState(0);
  const [notice, setNotice] = useState('');
  const [operationResult, setOperationResult] = useState('');
  const [notificationBusy, setNotificationBusy] = useState('');
  const notificationBusyRef = useRef(false);
  if (summary.error || program.error || (admin && setup.error))
    return <Alert tone="error" title={t('pilot.loadError')} />;
  if (!summary.data || !program.data || (admin && !setup.data))
    return <Spinner label={t('pilot.loading')} />;
  const refresh = async (resetProgressForm = false) => {
    await Promise.all([summary.reload(), setup.reload()]);
    if (resetProgressForm) {
      setDraft(null);
      setFormEpoch((value) => value + 1);
    }
  };
  return (
    <div className="space-y-5">
      <Header title={summary.data.student.display_name} description={t('pilot.progressSummary')} />
      {notice && (
        <Alert
          tone={pilotResultPresentation(notice).tone}
          title={t(pilotResultPresentation(notice).key)}
        />
      )}
      {admin && (
        <StudentSetup
          studentId={id!}
          summary={summary.data}
          program={program.data}
          setup={setup.data!}
          reload={refresh}
        />
      )}
      {!admin && (
        <TrackLevelControl
          studentId={id!}
          assignedTracks={summary.data.tracks}
          program={program.data}
          reload={summary.reload}
        />
      )}
      <Card>
        <h3 className="font-bold">{t('pilot.assignedTracks')}</h3>
        {summary.data.tracks.map((track: Any) => (
          <p key={track.track_id}>
            {track.track_name}: {track.level_name}
          </p>
        ))}
        {!summary.data.tracks.length && <p>{t('pilot.empty')}</p>}
      </Card>
      <ProgressForm
        key={draft?.id ?? `new-${formEpoch}`}
        studentId={id!}
        summary={summary.data}
        draft={draft}
        onDone={refresh}
        onResult={setOperationResult}
      />
      {operationResult && (
        <Alert
          tone={pilotResultPresentation(operationResult).tone}
          title={t(pilotResultPresentation(operationResult).key)}
        />
      )}
      <Card>
        <h3 className="font-bold">{t('pilot.passedLessons')}</h3>
        <div className="flex flex-wrap gap-2">
          {summary.data.passed.map((lesson: Any) => (
            <Badge key={lesson.id} tone="success">
              {lesson.name}
            </Badge>
          ))}
        </div>
      </Card>
      <Card>
        <h3 className="font-bold">{t('pilot.recentUpdates')}</h3>
        {summary.data.updates.map((update: Any) => (
          <div key={update.id} className="border-b border-border py-3">
            <p className="font-semibold">
              {update.update_date} · {t(`pilot.status.${update.status}`)}
            </p>
            <p>{update.overall_comment}</p>
            <p className="text-sm text-text-secondary">
              {t('pilot.homework')}: {update.homework}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {update.status === 'draft' && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setDraft({
                      ...update,
                      items: summary.data!.updateItems.filter(
                        (item: Any) => item.progress_update_id === update.id,
                      ),
                    })
                  }
                >
                  {t('pilot.editDraft')}
                </Button>
              )}
              {update.status === 'published' && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={notificationBusy === update.id}
                  onClick={async () => {
                    if (notificationBusyRef.current) return;
                    notificationBusyRef.current = true;
                    setNotificationBusy(update.id);
                    try {
                      setNotice(
                        await requestNotificationAction(
                          `/api/v1/progress-updates/${update.id}/notify`,
                        ),
                      );
                      await summary.reload();
                    } finally {
                      notificationBusyRef.current = false;
                      setNotificationBusy('');
                    }
                  }}
                >
                  {t('pilot.sendUpdate')}
                </Button>
              )}
              {update.status === 'published' &&
                summary.data!.notifications.some(
                  (n: Any) => n.progress_update_id === update.id && n.status === 'failed',
                ) && (
                  <Button
                    type="button"
                    disabled={notificationBusy === update.id}
                    onClick={async () => {
                      if (notificationBusyRef.current) return;
                      notificationBusyRef.current = true;
                      setNotificationBusy(update.id);
                      try {
                        setNotice(
                          await requestNotificationAction(
                            `/api/v1/progress-updates/${update.id}/notify?retry=1`,
                          ),
                        );
                        await summary.reload();
                      } finally {
                        notificationBusyRef.current = false;
                        setNotificationBusy('');
                      }
                    }}
                  >
                    {t('pilot.retry')}
                  </Button>
                )}
            </div>
          </div>
        ))}
      </Card>
      <Card>
        <h3 className="font-bold">{t('pilot.guardians.notifications')}</h3>
        {summary.data.guardians.map((guardian: Any) => (
          <p key={guardian.id}>
            {guardian.name} · {guardian.email} ·{' '}
            {t(guardian.receive_notifications ? 'pilot.enabled' : 'pilot.disabled')}
          </p>
        ))}
        {summary.data.notifications.map((notification: Any) => (
          <p
            key={`${notification.progress_update_id}-${notification.created_at}`}
            className="text-sm"
          >
            {t(`pilot.notificationStatus.${notification.status}`)}
            {notification.error_message ? ` · ${notification.error_message}` : ''}
          </p>
        ))}
      </Card>
    </div>
  );
}
function TrackLevelControl({
  studentId,
  assignedTracks,
  program,
  reload,
}: {
  studentId: string;
  assignedTracks: Any[];
  program: Any;
  reload: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [trackId, setTrackId] = useState(assignedTracks[0]?.track_id ?? '');
  const [levelId, setLevelId] = useState('');
  return (
    <Card>
      <h3 className="font-bold">{t('pilot.changeLevel')}</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField
          id="teacher-track"
          label={t('pilot.track')}
          value={trackId}
          onChange={(value) => {
            setTrackId(value);
            setLevelId('');
          }}
        >
          <option value="">{t('pilot.select')}</option>
          {assignedTracks.map((track) => (
            <option key={track.track_id} value={track.track_id}>
              {track.track_name}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="teacher-level"
          label={t('pilot.currentLevel')}
          value={levelId}
          onChange={setLevelId}
        >
          <option value="">{t('pilot.select')}</option>
          {program.levels
            .filter((level: Any) => level.track_id === trackId && level.active)
            .map((level: Any) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
        </SelectField>
      </div>
      <Button
        type="button"
        disabled={!trackId || !levelId}
        onClick={() =>
          api('/api/v1/student-track-levels', {
            method: 'POST',
            body: JSON.stringify({
              student_id: studentId,
              track_id: trackId,
              current_level_id: levelId,
            }),
          }).then(reload)
        }
      >
        {t('pilot.changeLevel')}
      </Button>
    </Card>
  );
}
function StudentSetup({
  studentId,
  summary,
  program,
  setup,
  reload,
}: {
  studentId: string;
  summary: Any;
  program: Any;
  setup: Any;
  reload: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [trackId, setTrackId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [guardianId, setGuardianId] = useState('');
  const [relationship, setRelationship] = useState('');
  const [notifications, setNotifications] = useState(true);
  const levels = program.levels.filter((level: Any) => level.track_id === trackId && level.active);
  const links = setup.guardianLinks.filter((link: Any) => link.student_id === studentId);
  return (
    <Card>
      <h3 className="font-bold">{t('pilot.students.setup')}</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField
          id="student-track"
          label={t('pilot.track')}
          value={trackId}
          onChange={(value) => {
            setTrackId(value);
            setLevelId('');
          }}
        >
          <option value="">{t('pilot.select')}</option>
          {program.tracks
            .filter((track: Any) => track.active)
            .map((track: Any) => (
              <option key={track.id} value={track.id}>
                {track.name}
              </option>
            ))}
        </SelectField>
        <SelectField
          id="student-level"
          label={t('pilot.currentLevel')}
          value={levelId}
          onChange={setLevelId}
        >
          <option value="">{t('pilot.select')}</option>
          {levels.map((level: Any) => (
            <option key={level.id} value={level.id}>
              {level.name}
            </option>
          ))}
        </SelectField>
      </div>
      <Button
        type="button"
        disabled={!trackId || !levelId}
        onClick={() =>
          api('/api/v1/student-track-levels', {
            method: 'POST',
            body: JSON.stringify({
              student_id: studentId,
              track_id: trackId,
              current_level_id: levelId,
            }),
          }).then(reload)
        }
      >
        {t(
          summary.tracks.some((track: Any) => track.track_id === trackId)
            ? 'pilot.changeLevel'
            : 'pilot.assignTrack',
        )}
      </Button>
      <div className="mt-4 border-t border-border pt-3">
        <h4 className="font-semibold">{t('pilot.guardians.links')}</h4>
        {links.map((link: Any) => (
          <div key={link.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              {link.name} · {t(link.receive_notifications ? 'pilot.enabled' : 'pilot.disabled')}
            </span>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                api('/api/v1/student-guardians', {
                  method: 'POST',
                  body: JSON.stringify({
                    student_id: studentId,
                    guardian_id: link.guardian_id,
                    relationship: link.relationship,
                    primary_contact: link.primary_contact,
                    receive_notifications: !link.receive_notifications,
                  }),
                }).then(reload)
              }
            >
              {t(
                link.receive_notifications
                  ? 'pilot.disableNotifications'
                  : 'pilot.enableNotifications',
              )}
            </Button>
          </div>
        ))}
        <SelectField
          id="student-guardian"
          label={t('pilot.guardian')}
          value={guardianId}
          onChange={setGuardianId}
        >
          <option value="">{t('pilot.select')}</option>
          {setup.guardians
            .filter(
              (guardian: Any) =>
                guardian.active && !links.some((link: Any) => link.guardian_id === guardian.id),
            )
            .map((guardian: Any) => (
              <option key={guardian.id} value={guardian.id}>
                {guardian.name} · {guardian.email}
              </option>
            ))}
        </SelectField>
        <FormField id="relationship" label={t('pilot.relationship')}>
          <Input
            id="relationship"
            value={relationship}
            onChange={(event) => setRelationship(event.target.value)}
          />
        </FormField>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={notifications}
            onChange={(event) => setNotifications(event.target.checked)}
          />
          {t('pilot.receiveNotifications')}
        </label>
        <Button
          type="button"
          disabled={!guardianId}
          onClick={() =>
            api('/api/v1/student-guardians', {
              method: 'POST',
              body: JSON.stringify({
                student_id: studentId,
                guardian_id: guardianId,
                relationship,
                receive_notifications: notifications,
              }),
            }).then(reload)
          }
        >
          {t('pilot.linkGuardian')}
        </Button>
      </div>
    </Card>
  );
}
export function ProgressForm({
  studentId,
  summary,
  draft,
  onDone,
  onResult,
}: {
  studentId: string;
  summary: Any;
  draft: Any | null;
  onDone: (resetProgressForm?: boolean) => Promise<void>;
  onResult: (result: string) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState<Any>(
    draft
      ? {
          ...draft,
          student_id: studentId,
          class_id: draft.class_id ?? '',
          items: draft.items.length ? draft.items : [{}],
        }
      : {
          student_id: studentId,
          class_id: summary.classes[0]?.id ?? '',
          update_date: new Date().toISOString().slice(0, 10),
          items: [{}],
          operation_key: crypto.randomUUID(),
        },
  );
  const [busy, setBusy] = useState(false);
  async function save(status: string, notify = false) {
    if (busy) return;
    setBusy(true);
    onResult('');
    try {
      const result = await api('/api/v1/progress-updates', {
        method: 'POST',
        body: JSON.stringify({
          ...value,
          status,
          notify,
          items: value.items.filter((item: Any) => item.lesson_id),
        }),
      });
      setValue((current: Any) => ({ ...current, id: result.id }));
      onResult(result.publication || (status === 'draft' ? 'draft_saved' : 'published_only'));
      await onDone(status === 'published');
    } catch {
      onResult('saveError');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h3 className="font-bold">{draft ? t('pilot.editDraft') : t('pilot.recordProgress')}</h3>
      <div className="grid gap-3">
        <SelectField
          id="progress-class"
          label={t('pilot.class')}
          value={value.class_id}
          onChange={(class_id) => setValue({ ...value, class_id })}
        >
          <option value="">{t('pilot.select')}</option>
          {summary.classes.map((item: Any) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <FormField id="progress-date" label={t('pilot.date')}>
          <Input
            id="progress-date"
            type="date"
            value={value.update_date}
            onChange={(event) => setValue({ ...value, update_date: event.target.value })}
          />
        </FormField>
        {value.items.map((item: Any, index: number) => (
          <div key={index} className="grid gap-2 rounded border border-border p-3">
            <SelectField
              id={`lesson-${index}`}
              label={t('pilot.lesson')}
              value={item.lesson_id ?? ''}
              onChange={(lesson_id) => {
                const items = [...value.items];
                const lesson = summary.lessons.find((x: Any) => x.id === lesson_id);
                items[index] = { ...item, lesson_id };
                setValue({
                  ...value,
                  items,
                  homework: value.homework || lesson?.default_homework || '',
                });
              }}
            >
              <option value="">{t('pilot.select')}</option>
              {summary.lessons.map((lesson: Any) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.track_name} · {lesson.level_name} · {lesson.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              id={`outcome-${index}`}
              label={t('pilot.outcome')}
              value={item.outcome ?? 'practiced'}
              onChange={(outcome) => {
                const items = [...value.items];
                items[index] = { ...item, outcome };
                setValue({ ...value, items });
              }}
            >
              {['passed', 'practiced', 'needs_practice', 'assigned'].map((outcome) => (
                <option key={outcome} value={outcome}>
                  {t(`pilot.outcomes.${outcome}`)}
                </option>
              ))}
            </SelectField>
            <FormField id={`comment-${index}`} label={t('pilot.itemComment')}>
              <Input
                id={`comment-${index}`}
                value={item.item_comment ?? ''}
                onChange={(event) => {
                  const items = [...value.items];
                  items[index] = { ...item, item_comment: event.target.value };
                  setValue({ ...value, items });
                }}
              />
            </FormField>
            {value.items.length > 1 && (
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setValue({
                    ...value,
                    items: value.items.filter((_: Any, i: number) => i !== index),
                  })
                }
              >
                {t('pilot.remove')}
              </Button>
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() => setValue({ ...value, items: [...value.items, {}] })}
        >
          {t('pilot.addLesson')}
        </Button>
        <FormField id="teacher-comment" label={t('pilot.teacherComment')}>
          <Textarea
            id="teacher-comment"
            value={value.overall_comment ?? ''}
            onChange={(event) => setValue({ ...value, overall_comment: event.target.value })}
          />
        </FormField>
        <FormField id="homework" label={t('pilot.homework')}>
          <Textarea
            id="homework"
            value={value.homework ?? ''}
            onChange={(event) => setValue({ ...value, homework: event.target.value })}
          />
        </FormField>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!value.class_id || busy}
            onClick={() => save('draft')}
          >
            {t('pilot.saveDraft')}
          </Button>
          <Button
            type="button"
            disabled={!value.class_id || busy}
            onClick={() => save('published')}
          >
            {t('pilot.publish')}
          </Button>
          <Button
            type="button"
            disabled={!value.class_id || busy}
            onClick={() => save('published', true)}
          >
            {t('pilot.publishNotify')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
