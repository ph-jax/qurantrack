/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  GraduationCap,
  MoreHorizontal,
  Plus,
  School,
  UserPlus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Badge,
  Button,
  Card,
  FormField,
  Input,
  SearchInput,
  Sheet,
  Spinner,
  Textarea,
} from '../components/ui';
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
      return {};
    }
    setError(false);
    try {
      const value = await api(url);
      setData(value);
      return value;
    } catch {
      setError(true);
      return null;
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
function Header({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="workspace-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="workspace-actions">{actions}</div>}
    </header>
  );
}
function focusFirstEditor() {
  window.requestAnimationFrame(() => document.querySelector<HTMLElement>('form input')?.focus());
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
function RelationshipEditor({
  studentId,
  guardianId,
  initial,
  onSaved,
  onUnlink,
}: {
  studentId: string;
  guardianId: string;
  initial?: Any;
  onSaved: () => Promise<unknown>;
  onUnlink?: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [relationship, setRelationship] = useState(initial?.relationship ?? '');
  const [primary, setPrimary] = useState(!!initial?.primary_contact);
  const [notifications, setNotifications] = useState(initial?.receive_notifications ?? true);
  const [pending, setPending] = useState<'save' | 'unlink' | ''>('');
  const [failed, setFailed] = useState<'save' | 'unlink' | ''>('');
  const save = async () => {
    if (pending) return;
    const payload = {
      student_id: studentId,
      guardian_id: guardianId,
      relationship,
      primary_contact: primary,
      receive_notifications: notifications,
    };
    setPending('save');
    setFailed('');
    try {
      await api('/api/v1/student-guardians', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await onSaved();
    } catch {
      setFailed('save');
    } finally {
      setPending('');
    }
  };
  const unlink = async () => {
    if (pending || !onUnlink || !confirm(t('pilot.confirm'))) return;
    setPending('unlink');
    setFailed('');
    try {
      await onUnlink();
    } catch {
      setFailed('unlink');
    } finally {
      setPending('');
    }
  };
  const busy = !!pending;
  return (
    <div className="grid gap-2 rounded border border-border p-2">
      <FormField id={`relationship-${studentId}-${guardianId}`} label={t('pilot.relationship')}>
        <Input
          id={`relationship-${studentId}-${guardianId}`}
          value={relationship}
          disabled={busy}
          onChange={(event) => setRelationship(event.target.value)}
        />
      </FormField>
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={primary}
          disabled={busy}
          onChange={(e) => setPrimary(e.target.checked)}
        />
        {t('pilot.primaryContact')}
      </label>
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={notifications}
          disabled={busy}
          onChange={(e) => setNotifications(e.target.checked)}
        />
        {t('pilot.receiveNotifications')}
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => void save()}>
          {busy
            ? t('pilot.saving')
            : initial
              ? t('pilot.guardians.saveRelationship')
              : t('pilot.link')}
        </Button>
        {initial && onUnlink && (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void unlink()}>
            {pending === 'unlink' ? t('pilot.saving') : t('pilot.guardians.unlink')}
          </Button>
        )}
      </div>
      {!!failed && (
        <Alert
          tone="error"
          title={t(failed === 'unlink' ? 'pilot.guardians.unlinkError' : 'pilot.saveError')}
        />
      )}
    </div>
  );
}
function Editor({
  title,
  initial,
  fields,
  onSave,
  onCancel,
  plain = false,
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
  plain?: boolean;
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
  const content = (
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
  );
  return plain ? content : <Card>{content}</Card>;
}

export function ClassesPage() {
  const { t } = useTranslation();
  const { session } = useSession();
  const admin = session?.role === 'organization_admin';
  const classes = useLoad('/api/v1/classes');
  const setup = useLoad(admin ? '/api/v1/pilot/setup-options' : null);
  const [editing, setEditing] = useState<Any | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const reload = async () => {
    await Promise.all([classes.reload(), setup.reload()]);
    setEditing(null);
    setEditorOpen(false);
  };
  if (classes.error || (admin && setup.error))
    return <Alert tone="error" title={t('pilot.loadError')} />;
  if (!classes.data || (admin && !setup.data)) return <Spinner label={t('pilot.loading')} />;
  const options = setup.data ?? {};
  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
    focusFirstEditor();
  };
  return (
    <div className="workspace-page">
      <Header
        title={t('pilot.classes.title')}
        description={t('pilot.classes.description')}
        actions={
          admin ? (
            <Button type="button" onClick={openCreate}>
              <Plus className="size-4" aria-hidden />
              {t('pilot.classes.create')}
            </Button>
          ) : undefined
        }
      />
      {admin && (
        <Sheet
          open={editorOpen}
          onOpenChange={(open) => {
            setEditorOpen(open);
            if (!open) setEditing(null);
          }}
          side="end"
          title={editing ? t('pilot.classes.edit') : t('pilot.classes.create')}
          closeLabel={t('pilot.close')}
        >
          <div className="sheet-form">
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
              onCancel={() => {
                setEditing(null);
                setEditorOpen(false);
              }}
              plain
            />
          </div>
        </Sheet>
      )}
      <div className="entity-grid">
        {classes.data.classes.map((item: Any) => (
          <ClassCard
            key={item.id}
            item={item}
            admin={admin}
            options={options}
            reload={reload}
            edit={() => {
              setEditing(item);
              setEditorOpen(true);
            }}
          />
        ))}
        {!classes.data.classes.length && (
          <Card>
            <p>{t('pilot.emptyClasses')}</p>
            {admin && (
              <Button className="mt-3" type="button" onClick={openCreate}>
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
    <Card className="class-card workspace-panel">
      <div className="grid gap-3">
        <div className="entity-card-header">
          <span className="entity-icon" aria-hidden>
            <School />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold">{item.name}</h2>
            <p className="truncate text-sm text-text-secondary">
              {item.meeting_schedule || t('dashboard.scheduleNotSet')}
            </p>
          </div>
          <Status value={!!item.active} />
        </div>
        <Link className="entity-open-link" to={`/app/classes/${item.id}`}>
          <span>{t('pilot.classes.roster')}</span>
          <ChevronRight className="size-4" aria-hidden />
        </Link>
        {admin && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={edit}>
                {t('pilot.edit')}
              </Button>
            </div>
            <details className="entity-management">
              <summary>
                <MoreHorizontal className="size-4" aria-hidden />
                {t('pilot.classes.manage')}
              </summary>
              <div className="entity-management-content">
                <div className="management-section">
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
                      .filter(
                        (teacher: Any) => !assignments.some((x: Any) => x.user_id === teacher.id),
                      )
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
                <div className="management-section">
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
                            !(options.students ?? []).find(
                              (s: Any) => s.id === enrollment.student_id,
                            )?.active
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
              </div>
            </details>
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
  const [editorOpen, setEditorOpen] = useState(false);
  const [search, setSearch] = useState('');
  const reload = async () => {
    await Promise.all([students.reload(), setup.reload()]);
    setStudentEdit(null);
    setEditorOpen(false);
  };
  if (students.error || (admin && setup.error))
    return <Alert tone="error" title={t('pilot.loadError')} />;
  if (!students.data || (admin && !setup.data)) return <Spinner label={t('pilot.loading')} />;
  const openCreate = () => {
    setStudentEdit(null);
    setEditorOpen(true);
    focusFirstEditor();
  };
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = students.data.students.filter((student: Any) =>
    [student.display_name, student.first_name, student.last_name, student.external_id]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(normalizedSearch)),
  );
  return (
    <div className="workspace-page">
      <Header
        title={t('pilot.students.title')}
        description={t('pilot.students.description')}
        actions={
          admin ? (
            <>
              <Link className="app-button app-button-secondary" to="/app/families">
                <UserPlus className="size-4" aria-hidden />
                {t('nav.families')}
              </Link>
              <Button type="button" onClick={openCreate}>
                <Plus className="size-4" aria-hidden />
                {t('pilot.students.create')}
              </Button>
            </>
          ) : undefined
        }
      />
      {admin && (
        <Sheet
          open={editorOpen}
          onOpenChange={(open) => {
            setEditorOpen(open);
            if (!open) setStudentEdit(null);
          }}
          side="end"
          title={studentEdit ? t('pilot.students.edit') : t('pilot.students.create')}
          closeLabel={t('pilot.close')}
        >
          <div className="sheet-form">
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
                api('/api/v1/students', { method: 'POST', body: JSON.stringify(value) }).then(
                  reload,
                )
              }
              onCancel={() => {
                setStudentEdit(null);
                setEditorOpen(false);
              }}
              plain
            />
          </div>
        </Sheet>
      )}
      {!!students.data.students.length && (
        <SearchInput
          className="workspace-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('pilot.students.search')}
          aria-label={t('pilot.students.search')}
        />
      )}
      <Card className="workspace-panel entity-list">
        {filtered.map((student: Any) => (
          <div className="workspace-row" key={student.id}>
            <span className="entity-avatar" aria-hidden>
              {String(student.display_name)
                .split(/\s+/)
                .map((part) => part[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <Link className="workspace-row-copy" to={`/app/students/${student.id}`}>
              <strong>{student.display_name}</strong>
              <span>{student.external_id || t('pilot.students.openWorkspace')}</span>
            </Link>
            {admin && <Status value={!!student.active} />}
            {admin && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`${t('pilot.edit')} ${student.display_name}`}
                onClick={() => {
                  setStudentEdit(student);
                  setEditorOpen(true);
                }}
              >
                <MoreHorizontal className="size-5" aria-hidden />
              </Button>
            )}
            <Link
              className="entity-row-arrow"
              aria-label={`${student.display_name} · ${t('pilot.progress')}`}
              to={`/app/students/${student.id}`}
            >
              <ChevronRight className="size-5" aria-hidden />
            </Link>
          </div>
        ))}
        {!!students.data.students.length && !filtered.length && (
          <p className="workspace-empty-inline">{t('pilot.students.noResults')}</p>
        )}
        {!students.data.students.length && (
          <div className="empty-state compact-empty-state">
            <span className="empty-icon">
              <GraduationCap />
            </span>
            <p>{t('pilot.emptyStudents')}</p>
            {admin && (
              <Button className="mt-3" type="button" onClick={openCreate}>
                {t('pilot.students.create')}
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

export function FamiliesPage() {
  const { t } = useTranslation();
  const setup = useLoad('/api/v1/pilot/setup-options');
  const [editing, setEditing] = useState<Any | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [unlinking, setUnlinking] = useState('');
  const [unlinkResult, setUnlinkResult] = useState<
    'success' | 'deleteError' | 'verificationError' | ''
  >('');
  const reload = async () => {
    await setup.reload();
    setEditing(null);
    setEditorOpen(false);
  };
  if (setup.error && unlinkResult !== 'verificationError')
    return <Alert tone="error" title={t('pilot.loadError')} />;
  if (!setup.data) return <Spinner label={t('pilot.loading')} />;
  const data = setup.data;
  const unlink = async (linkId: string) => {
    if (unlinking) throw new Error('unlink_pending');
    setUnlinking(linkId);
    setUnlinkResult('');
    try {
      await api(`/api/v1/student-guardians/${linkId}`, { method: 'DELETE' });
      const verified = await setup.reload();
      if (!verified?.guardianLinks?.every((link: Any) => link.id !== linkId)) {
        setUnlinkResult('verificationError');
        throw new Error('unlink_verification_failed');
      }
      setUnlinkResult('success');
    } catch {
      setUnlinkResult((current) => current || 'deleteError');
      throw new Error('unlink_failed');
    } finally {
      setUnlinking('');
    }
  };
  return (
    <div className="workspace-page">
      <Header
        title={t('pilot.guardians.title')}
        description={t('pilot.guardians.description')}
        eyebrow={t('nav.manage')}
        actions={
          <Button
            type="button"
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
          >
            <UserPlus className="size-4" aria-hidden />
            {t('pilot.guardians.create')}
          </Button>
        }
      />
      <Alert tone="info" title={t('pilot.guardians.linkHelp')} />
      {unlinkResult && (
        <Alert
          tone={unlinkResult === 'success' ? 'success' : 'error'}
          title={t(
            unlinkResult === 'success'
              ? 'pilot.guardians.unlinkSuccess'
              : unlinkResult === 'verificationError'
                ? 'pilot.guardians.unlinkVerificationError'
                : 'pilot.guardians.unlinkError',
          )}
        />
      )}
      <Sheet
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditing(null);
        }}
        side="end"
        title={editing ? t('pilot.guardians.edit') : t('pilot.guardians.create')}
        closeLabel={t('pilot.close')}
      >
        <div className="sheet-form">
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
            onCancel={() => {
              setEditing(null);
              setEditorOpen(false);
            }}
            plain
          />
        </div>
      </Sheet>
      <div className="grid gap-3">
        {data.guardians.map((guardian: Any) => (
          <FamilyGuardianCard
            key={guardian.id}
            guardian={guardian}
            data={data}
            reload={reload}
            unlink={unlink}
            edit={() => {
              setEditing(guardian);
              setEditorOpen(true);
            }}
          />
        ))}
        {!data.guardians.length && (
          <Card className="empty-state compact-empty-state">
            <p>{t('pilot.guardians.empty')}</p>
            <Button
              className="mt-3"
              type="button"
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            >
              {t('pilot.guardians.create')}
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}

function FamilyGuardianCard({ guardian, data, reload, unlink, edit }: Any) {
  const { t } = useTranslation();
  const [studentId, setStudentId] = useState('');
  const [relationshipEditor, setRelationshipEditor] = useState<Any | null>(null);
  const links = data.guardianLinks.filter((link: Any) => link.guardian_id === guardian.id);
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold">{guardian.name}</h3>
          <p className="break-all text-sm text-text-secondary">{guardian.email}</p>
          <p className="text-sm">{guardian.preferred_locale?.toUpperCase()}</p>
        </div>
        <div className="flex gap-2">
          <Status value={!!guardian.active} />
          <Button type="button" variant="secondary" onClick={edit}>
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
            {data.students.find((student: Any) => student.id === link.student_id)?.display_name} ·{' '}
            {t(link.receive_notifications ? 'pilot.enabled' : 'pilot.disabled')}
          </span>
          <div className="flex flex-wrap gap-2">
            <Link
              className="app-button app-button-secondary"
              to={`/app/students/${link.student_id}`}
            >
              {t('pilot.guardians.manageLink')}
            </Link>
            <Button type="button" variant="secondary" onClick={() => setRelationshipEditor(link)}>
              {t('pilot.guardians.editRelationship')}
            </Button>
          </div>
        </div>
      ))}
      {!links.length && <p className="text-sm text-text-secondary">{t('pilot.empty')}</p>}
      <Button
        className="mt-3"
        type="button"
        variant="secondary"
        onClick={() => {
          setStudentId('');
          setRelationshipEditor({ new: true });
        }}
      >
        <Plus className="size-4" aria-hidden />
        {t('pilot.guardians.linkStudent')}
      </Button>
      <Sheet
        open={!!relationshipEditor}
        onOpenChange={(open) => {
          if (!open) {
            setRelationshipEditor(null);
            setStudentId('');
          }
        }}
        side="end"
        title={t(
          relationshipEditor?.new
            ? 'pilot.guardians.linkStudent'
            : 'pilot.guardians.editRelationship',
        )}
        closeLabel={t('pilot.close')}
      >
        <div className="sheet-form">
          {relationshipEditor?.new ? (
            <>
              <SelectField
                id={`guardian-student-${guardian.id}`}
                label={t('pilot.students.title')}
                value={studentId}
                onChange={setStudentId}
              >
                <option value="">{t('pilot.select')}</option>
                {data.students
                  .filter(
                    (student: Any) =>
                      student.active && !links.some((link: Any) => link.student_id === student.id),
                  )
                  .map((student: Any) => (
                    <option key={student.id} value={student.id}>
                      {student.display_name}
                    </option>
                  ))}
              </SelectField>
              {studentId && (
                <RelationshipEditor
                  studentId={studentId}
                  guardianId={guardian.id}
                  onSaved={async () => {
                    await reload();
                    setStudentId('');
                    setRelationshipEditor(null);
                  }}
                />
              )}
            </>
          ) : (
            relationshipEditor && (
              <RelationshipEditor
                key={`${relationshipEditor.id}-${relationshipEditor.relationship ?? ''}-${relationshipEditor.primary_contact}-${relationshipEditor.receive_notifications}`}
                studentId={relationshipEditor.student_id}
                guardianId={guardian.id}
                initial={relationshipEditor}
                onSaved={async () => {
                  await reload();
                  setRelationshipEditor(null);
                }}
                onUnlink={async () => {
                  await unlink(relationshipEditor.id);
                  setRelationshipEditor(null);
                }}
              />
            )
          )}
        </div>
      </Sheet>
    </Card>
  );
}

export function ProgramPage() {
  const { t } = useTranslation();
  const program = useLoad('/api/v1/program');
  const [kind, setKind] = useState('track');
  const [editing, setEditing] = useState<Any | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [expandedTracks, setExpandedTracks] = useState<Set<string>>(() => new Set());
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(() => new Set());
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
    setEditorOpen(true);
  };
  const toggleExpanded = (id: string, setter: Dispatch<SetStateAction<Set<string>>>) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const curriculumExpanded = expandedTracks.size > 0;
  const toggleAll = () => {
    if (curriculumExpanded) {
      setExpandedTracks(new Set());
      setExpandedLevels(new Set());
      return;
    }
    setExpandedTracks(new Set(tracks.map((track: Any) => track.id)));
    setExpandedLevels(new Set(levels.map((level: Any) => level.id)));
  };
  return (
    <div className="workspace-page">
      <Header
        title={t('pilot.program.title')}
        description={t('pilot.program.description')}
        eyebrow={t('nav.manage')}
        actions={
          <>
            {['track', 'level', 'lesson'].map((value, index) => (
              <Button
                key={value}
                type="button"
                variant={index ? 'secondary' : 'primary'}
                onClick={() => begin(value)}
              >
                {index === 0 && <Plus className="size-4" aria-hidden />}
                {t(`pilot.program.add.${value}`)}
              </Button>
            ))}
          </>
        }
      />
      <Sheet
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditing(null);
        }}
        side="end"
        title={t(`pilot.program.${editing ? 'edit' : 'create'}.${kind}`)}
        closeLabel={t('pilot.close')}
      >
        <div className="sheet-form">
          <Editor
            key={`${kind}-${editing?.id ?? 'new'}`}
            title={t(`pilot.program.${editing ? 'edit' : 'create'}.${kind}`)}
            initial={editing ?? undefined}
            fields={fields}
            onSave={async (value) => {
              await api(`/api/v1/program/${endpoint}`, {
                method: 'POST',
                body: JSON.stringify(value),
              });
              await program.reload();
              setEditing(null);
              setEditorOpen(false);
            }}
            onCancel={() => {
              setEditing(null);
              setEditorOpen(false);
            }}
            plain
          />
        </div>
      </Sheet>
      <Card className="program-curriculum-card">
        <div className="program-curriculum-heading">
          <h3>{t('pilot.program.curriculum')}</h3>
          {!!tracks.length && (
            <Button type="button" variant="ghost" onClick={toggleAll}>
              {t(`pilot.program.${curriculumExpanded ? 'collapseAll' : 'expandAll'}`)}
            </Button>
          )}
        </div>
        <div className="program-curriculum-list">
          {tracks.map((track: Any) => {
            const trackLevels = levels.filter((level: Any) => level.track_id === track.id);
            const levelIds = new Set(trackLevels.map((level: Any) => level.id));
            const trackLessonCount = program.data!.lessons.filter((lesson: Any) =>
              levelIds.has(lesson.level_id),
            ).length;
            const trackOpen = expandedTracks.has(track.id);
            const trackPanelId = `program-track-${track.id}`;
            return (
              <section key={track.id} className="program-track">
                <div className="program-accordion-row program-track-row">
                  <button
                    type="button"
                    className="program-accordion-toggle"
                    aria-expanded={trackOpen}
                    aria-controls={trackPanelId}
                    aria-label={t(`pilot.program.${trackOpen ? 'collapseTrack' : 'expandTrack'}`, {
                      name: track.name,
                    })}
                    onClick={() => toggleExpanded(track.id, setExpandedTracks)}
                  >
                    <ChevronRight className="program-chevron" aria-hidden />
                    <span className="program-row-copy">
                      <span className="program-kind">{t('pilot.program.trackLabel')}</span>
                      <strong>{`${track.sort_order}. ${track.name}`}</strong>
                    </span>
                  </button>
                  <Status value={!!track.active} />
                  <span className="program-count">
                    {t('pilot.program.levelCount', { count: trackLevels.length })} ·{' '}
                    {t('pilot.program.lessonCount', { count: trackLessonCount })}
                  </span>
                  <Button type="button" variant="secondary" onClick={() => begin('track', track)}>
                    {t('pilot.program.edit.track')}
                  </Button>
                </div>
                {trackOpen && (
                  <div id={trackPanelId} className="program-track-content">
                    {trackLevels.map((level: Any) => {
                      const lessons = program.data!.lessons.filter(
                        (lesson: Any) => lesson.level_id === level.id,
                      );
                      const levelOpen = expandedLevels.has(level.id);
                      const levelPanelId = `program-level-${level.id}`;
                      return (
                        <section key={level.id} className="program-level">
                          <div className="program-accordion-row program-level-row">
                            <button
                              type="button"
                              className="program-accordion-toggle"
                              aria-expanded={levelOpen}
                              aria-controls={levelPanelId}
                              aria-label={t(
                                `pilot.program.${levelOpen ? 'collapseLevel' : 'expandLevel'}`,
                                { name: level.name },
                              )}
                              onClick={() => toggleExpanded(level.id, setExpandedLevels)}
                            >
                              <ChevronRight className="program-chevron" aria-hidden />
                              <span className="program-row-copy">
                                <span className="program-kind">
                                  {t('pilot.program.levelLabel')}
                                </span>
                                <strong>{`${level.sort_order}. ${level.name}`}</strong>
                              </span>
                            </button>
                            <span className="program-count">
                              {t('pilot.program.lessonCount', { count: lessons.length })}
                            </span>
                            <Status value={!!level.active} />
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => begin('level', level)}
                            >
                              {t('pilot.program.edit.level')}
                            </Button>
                          </div>
                          {levelOpen && (
                            <div id={levelPanelId} className="program-lessons">
                              <p className="program-lessons-heading">
                                {t('pilot.program.lessonsLabel')}
                              </p>
                              {lessons.map((lesson: Any) => (
                                <div key={lesson.id} className="program-lesson-row">
                                  <span className="program-lesson-copy">
                                    <strong>{`${lesson.sort_order}. ${lesson.name}`}</strong>
                                    {lesson.default_homework && (
                                      <span>{lesson.default_homework}</span>
                                    )}
                                  </span>
                                  <Status value={!!lesson.active} />
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => begin('lesson', lesson)}
                                  >
                                    {t('pilot.program.edit.lesson')}
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </Card>
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
    <div className="workspace-page">
      <Link className="workspace-back" to="/app/classes">
        <ArrowLeft className="size-4" aria-hidden />
        {t('pilot.classes.back')}
      </Link>
      <Header
        title={roster.data.class.name}
        description={t('pilot.classes.activeRoster')}
        eyebrow={t('nav.classes')}
      />
      <Card className="workspace-panel entity-list">
        {roster.data.students.map((student: Any) => (
          <Link className="workspace-row" key={student.id} to={`/app/students/${student.id}`}>
            <span className="entity-avatar" aria-hidden>
              {String(student.display_name)
                .split(/\s+/)
                .map((part) => part[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <span className="workspace-row-copy">
              <strong>{student.display_name}</strong>
              <span>{t('pilot.students.openWorkspace')}</span>
            </span>
            <ChevronRight className="size-5" aria-hidden />
          </Link>
        ))}
        {!roster.data.students.length && (
          <p className="workspace-empty-inline">{t('pilot.empty')}</p>
        )}
      </Card>
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
  const [homeworkEdit, setHomeworkEdit] = useState<Any | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'progress' | 'curriculum' | 'family'>(
    'overview',
  );
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
  const refreshSetup = async () => {
    const results = await Promise.all([summary.reload(), setup.reload()]);
    return results[0] && results[1] ? results[1] : null;
  };
  const startProgress = () => {
    setDraft(null);
    setFormEpoch((value) => value + 1);
    setProgressOpen(true);
  };
  const studentName = String(summary.data.student.display_name);
  const studentInitials = studentName
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const latestUpdate = summary.data.updates[0];
  const studentTabs: Array<'overview' | 'progress' | 'curriculum' | 'family'> = admin
    ? ['overview', 'progress', 'curriculum', 'family']
    : ['overview', 'progress', 'curriculum'];
  return (
    <div className="workspace-page">
      <Link className="workspace-back" to="/app/students">
        <ArrowLeft className="size-4" aria-hidden />
        {t('pilot.students.back')}
      </Link>
      <header className="student-workspace-header">
        <div className="student-identity">
          <span className="entity-avatar entity-avatar-large" aria-hidden>
            {studentInitials}
          </span>
          <div className="min-w-0">
            <p className="eyebrow">{t('nav.students')}</p>
            <h1>{studentName}</h1>
            <p>
              {summary.data.classes.map((item: Any) => item.name).join(' · ') ||
                t('pilot.students.noClass')}
              {' · '}
              <Status value={!!summary.data.student.active} />
            </p>
          </div>
        </div>
        <div className="workspace-actions">
          <Button type="button" onClick={startProgress}>
            <Plus className="size-4" aria-hidden />
            {t('pilot.recordProgress')}
          </Button>
        </div>
      </header>
      {notice && (
        <Alert
          tone={pilotResultPresentation(notice).tone}
          title={t(pilotResultPresentation(notice).key)}
        />
      )}
      {operationResult && (
        <Alert
          tone={pilotResultPresentation(operationResult).tone}
          title={t(pilotResultPresentation(operationResult).key)}
        />
      )}

      <div className="workspace-tabs" role="tablist" aria-label={t('pilot.students.workspaceTabs')}>
        {studentTabs.map((tab) => (
          <button
            key={tab}
            id={`student-${tab}-tab`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`student-${tab}-panel`}
            onClick={() => setActiveTab(tab)}
          >
            {t(`pilot.students.tabs.${tab}`)}
          </button>
        ))}
      </div>

      <section
        id="student-overview-panel"
        role="tabpanel"
        aria-labelledby="student-overview-tab"
        hidden={activeTab !== 'overview'}
      >
        <div className="workspace-grid">
          <div className="workspace-stack">
            <Card className="workspace-panel workspace-panel-warm">
              <div className="section-heading">
                <div>
                  <h2>{t('pilot.students.currentLearning')}</h2>
                  <p>{t('pilot.students.currentLearningBody')}</p>
                </div>
                <Badge tone="info">{summary.data.tracks.length}</Badge>
              </div>
              {summary.data.tracks.map((track: Any) => (
                <div className="learning-path" key={track.track_id}>
                  <span className="class-workspace-icon" aria-hidden>
                    <GraduationCap />
                  </span>
                  <span>
                    <strong>{track.track_name}</strong>
                    <span>{track.level_name}</span>
                  </span>
                </div>
              ))}
              {!summary.data.tracks.length && <p>{t('pilot.empty')}</p>}
              <Button className="mt-4" type="button" onClick={startProgress}>
                {t('pilot.students.continueProgress')}
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </Card>
            <Card className="workspace-panel">
              <div className="section-heading">
                <div>
                  <h2>{t('pilot.students.latestActivity')}</h2>
                  <p>{t('pilot.students.latestActivityBody')}</p>
                </div>
                <button
                  className="text-sm font-semibold text-brand"
                  type="button"
                  onClick={() => setActiveTab('progress')}
                >
                  {t('dashboard.viewAll')}
                </button>
              </div>
              {latestUpdate ? (
                <div className="timeline-list">
                  <div className="timeline-item">
                    <span aria-hidden />
                    <div>
                      <strong>
                        {latestUpdate.update_date} · {t(`pilot.status.${latestUpdate.status}`)}
                      </strong>
                      <p>{latestUpdate.overall_comment || t('pilot.students.noComment')}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="workspace-empty-inline">{t('pilot.empty')}</p>
              )}
            </Card>
          </div>
          <aside className="workspace-stack">
            <Card className="workspace-panel">
              <h2>{t('pilot.students.quickFacts')}</h2>
              <dl className="workspace-facts">
                <div>
                  <dt>{t('pilot.class')}</dt>
                  <dd>{summary.data.classes.map((item: Any) => item.name).join(', ') || '—'}</dd>
                </div>
                <div>
                  <dt>{t('pilot.assignedTracks')}</dt>
                  <dd>{summary.data.tracks.length}</dd>
                </div>
                <div>
                  <dt>{t('pilot.passedLessons')}</dt>
                  <dd>{summary.data.passed.length}</dd>
                </div>
                <div>
                  <dt>{t('pilot.recentUpdates')}</dt>
                  <dd>{summary.data.updates.length}</dd>
                </div>
              </dl>
            </Card>
          </aside>
        </div>
      </section>

      <section
        id="student-progress-panel"
        role="tabpanel"
        aria-labelledby="student-progress-tab"
        hidden={activeTab !== 'progress'}
      >
        <Card className="workspace-panel">
          <div className="section-heading">
            <div>
              <h2>{t('pilot.recentUpdates')}</h2>
              <p>{t('pilot.students.progressHistoryBody')}</p>
            </div>
            <Button type="button" onClick={startProgress}>
              <Plus className="size-4" aria-hidden />
              {t('pilot.recordProgress')}
            </Button>
          </div>
          {summary.data.updates.map((update: Any) => (
            <article key={update.id} className="progress-update-card">
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
                    onClick={() => {
                      setDraft({
                        ...update,
                        items: summary.data!.updateItems.filter(
                          (item: Any) => item.progress_update_id === update.id,
                        ),
                      });
                      setProgressOpen(true);
                    }}
                  >
                    {t('pilot.editDraft')}
                  </Button>
                )}
                {update.status === 'published' && (
                  <Button type="button" variant="secondary" onClick={() => setHomeworkEdit(update)}>
                    {t('pilot.homeworkEditor.edit')}
                  </Button>
                )}
                {summary
                  .data!.notifications.filter((n: Any) => n.progress_update_id === update.id)
                  .map((notification: Any) => (
                    <div key={notification.id} className="notification-result">
                      <p>
                        {notification.guardian_name} · {notification.recipient_email}
                      </p>
                      <p>
                        {t(`notificationCenter.types.${notification.notification_type}`)} ·{' '}
                        {t(`pilot.notificationStatus.${notification.status}`)}
                      </p>
                      <p>
                        {notification.attempted_at} ·{' '}
                        {t('notificationCenter.attempts', { count: notification.attempt_count })}
                      </p>
                      {notification.failure_reference && <p>{notification.failure_reference}</p>}
                      {notification.status === 'failed' && (
                        <Button
                          type="button"
                          disabled={notificationBusy === notification.id}
                          onClick={async () => {
                            if (notificationBusyRef.current) return;
                            notificationBusyRef.current = true;
                            setNotificationBusy(notification.id);
                            try {
                              setNotice(
                                await requestNotificationAction(
                                  `/api/v1/progress-updates/${update.id}/notify?retry=1&notificationId=${encodeURIComponent(notification.id)}`,
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
                  ))}
              </div>
            </article>
          ))}
          {!summary.data.updates.length && (
            <p className="workspace-empty-inline">{t('pilot.empty')}</p>
          )}
        </Card>
      </section>

      <section
        id="student-curriculum-panel"
        role="tabpanel"
        aria-labelledby="student-curriculum-tab"
        hidden={activeTab !== 'curriculum'}
      >
        <div className="workspace-stack">
          <Card className="workspace-panel">
            <div className="section-heading">
              <div>
                <h2>{t('pilot.assignedTracks')}</h2>
                <p>{t('pilot.students.curriculumBody')}</p>
              </div>
            </div>
            {summary.data.tracks.map((track: Any) => (
              <div className="learning-path" key={track.track_id}>
                <span className="class-workspace-icon" aria-hidden>
                  <GraduationCap />
                </span>
                <span>
                  <strong>{track.track_name}</strong>
                  <span>{track.level_name}</span>
                </span>
              </div>
            ))}
            {!summary.data.tracks.length && <p>{t('pilot.empty')}</p>}
          </Card>
          <Card className="workspace-panel">
            <h2>{t('pilot.passedLessons')}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {summary.data.passed.map((lesson: Any) => (
                <Badge key={lesson.id} tone="success">
                  {lesson.name}
                </Badge>
              ))}
              {!summary.data.passed.length && <p>{t('pilot.empty')}</p>}
            </div>
          </Card>
          {admin && (
            <StudentSetup
              section="curriculum"
              studentId={id!}
              summary={summary.data}
              program={program.data}
              setup={setup.data!}
              reload={refreshSetup}
            />
          )}
        </div>
      </section>

      {admin && (
        <section
          id="student-family-panel"
          role="tabpanel"
          aria-labelledby="student-family-tab"
          hidden={activeTab !== 'family'}
        >
          <StudentSetup
            section="family"
            studentId={id!}
            summary={summary.data}
            program={program.data}
            setup={setup.data!}
            reload={refreshSetup}
          />
        </section>
      )}

      <Sheet
        open={progressOpen}
        onOpenChange={(open) => {
          setProgressOpen(open);
          if (!open) setDraft(null);
        }}
        side="end"
        title={draft ? t('pilot.editDraft') : t('pilot.recordProgress')}
        closeLabel={t('pilot.close')}
      >
        <div className="sheet-form progress-sheet-form">
          <ProgressForm
            key={draft?.id ?? `new-${formEpoch}`}
            studentId={id!}
            summary={summary.data}
            draft={draft}
            onDone={async (reset) => {
              await refresh(reset);
              setProgressOpen(false);
            }}
            onResult={setOperationResult}
            plain
          />
        </div>
      </Sheet>

      <Sheet
        open={!!homeworkEdit}
        onOpenChange={(open) => !open && setHomeworkEdit(null)}
        side="end"
        title={t('pilot.homeworkEditor.title')}
        closeLabel={t('pilot.close')}
      >
        {homeworkEdit && (
          <HomeworkEditor
            key={homeworkEdit.id}
            update={homeworkEdit}
            onCancel={() => setHomeworkEdit(null)}
            onSaved={async (code) => {
              const reloaded = await summary.reload();
              if (!reloaded) throw new Error('reload_failed');
              setOperationResult(code);
              setHomeworkEdit(null);
            }}
            plain
          />
        )}
      </Sheet>
    </div>
  );
}
function StudentSetup({
  section,
  studentId,
  summary,
  program,
  setup,
  reload,
}: {
  section: 'curriculum' | 'family';
  studentId: string;
  summary: Any;
  program: Any;
  setup: Any;
  reload: () => Promise<Any | null>;
}) {
  const { t } = useTranslation();
  const [trackId, setTrackId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [guardianId, setGuardianId] = useState('');
  const [relationshipError, setRelationshipError] = useState(false);
  const levels = program.levels.filter((level: Any) => level.track_id === trackId && level.active);
  const links = setup.guardianLinks.filter((link: Any) => link.student_id === studentId);
  return (
    <Card className="workspace-panel">
      <div className="section-heading">
        <div>
          <h2>
            {t(
              section === 'curriculum' ? 'pilot.students.curriculumSetup' : 'pilot.guardians.links',
            )}
          </h2>
          <p>
            {t(
              section === 'curriculum'
                ? 'pilot.students.curriculumSetupBody'
                : 'pilot.guardians.linkHelp',
            )}
          </p>
        </div>
      </div>
      {section === 'curriculum' && (
        <>
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
            className="mt-3"
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
        </>
      )}
      {section === 'family' && (
        <div className="grid gap-4">
          {links.map((link: Any) => (
            <div key={link.id} className="grid gap-2 py-2">
              <strong>{link.name}</strong>
              <RelationshipEditor
                key={`${link.id}-${link.relationship ?? ''}-${link.primary_contact}-${link.receive_notifications}`}
                studentId={studentId}
                guardianId={link.guardian_id}
                initial={link}
                onSaved={reload}
                onUnlink={async () => {
                  setRelationshipError(false);
                  try {
                    await api(`/api/v1/student-guardians/${link.id}`, { method: 'DELETE' });
                    const verified = await reload();
                    if (!verified?.guardianLinks?.every((value: Any) => value.id !== link.id))
                      throw new Error('unlink_verification_failed');
                  } catch (error) {
                    setRelationshipError(true);
                    throw error;
                  }
                }}
              />
            </div>
          ))}
          {relationshipError && <Alert tone="error" title={t('pilot.guardians.unlinkError')} />}
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
          {guardianId && (
            <RelationshipEditor
              studentId={studentId}
              guardianId={guardianId}
              onSaved={async () => {
                setGuardianId('');
                await reload();
              }}
            />
          )}
        </div>
      )}
    </Card>
  );
}
export function ProgressForm({
  studentId,
  summary,
  draft,
  onDone,
  onResult,
  plain = false,
}: {
  studentId: string;
  summary: Any;
  draft: Any | null;
  onDone: (resetProgressForm?: boolean) => Promise<void>;
  onResult: (result: string) => void;
  plain?: boolean;
}) {
  const { t } = useTranslation();
  const normalizeItem = (item: Any = {}) => ({
    ...item,
    outcome: ['passed', 'practiced', 'needs_practice', 'assigned'].includes(item.outcome)
      ? item.outcome
      : 'practiced',
  });
  const [value, setValue] = useState<Any>(
    draft
      ? {
          ...draft,
          student_id: studentId,
          class_id: draft.class_id ?? '',
          items: draft.items.length ? draft.items.map(normalizeItem) : [normalizeItem()],
        }
      : {
          student_id: studentId,
          class_id: summary.classes[0]?.id ?? '',
          update_date: new Date().toISOString().slice(0, 10),
          items: [normalizeItem()],
          operation_key: crypto.randomUUID(),
        },
  );
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<Any | null>(null);
  const [previewError, setPreviewError] = useState(false);
  async function openConfirmation() {
    setConfirming(true);
    setPreview(null);
    setPreviewError(false);
    try {
      setPreview(
        await api(
          `/api/v1/students/${studentId}/notification-recipients?classId=${encodeURIComponent(value.class_id)}`,
        ),
      );
    } catch {
      setPreviewError(true);
    }
  }
  async function save(status: string, notify = false) {
    if (busy) return;
    // Freeze what the user saw at the instant submission began. Subsequent UI interaction must
    // neither alter an in-flight request nor its operation key.
    const snapshot = structuredClone(value);
    setBusy(true);
    onResult('');
    try {
      const result = await api('/api/v1/progress-updates', {
        method: 'POST',
        body: JSON.stringify({
          ...snapshot,
          status,
          notify,
          items: snapshot.items.filter((item: Any) => item.lesson_id),
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
    <Card className={plain ? 'border-0 p-0 shadow-none' : undefined}>
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
              value={item.outcome}
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
          onClick={() => setValue({ ...value, items: [...value.items, normalizeItem()] })}
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
            onClick={() => void openConfirmation()}
          >
            {t('pilot.publish')}
          </Button>
        </div>
        {confirming && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-confirm-title"
            className="rounded border border-border p-4"
          >
            <h4 id="publish-confirm-title" className="font-bold">
              {t('pilot.publishConfirmation.title')}
            </h4>
            {!preview && !previewError && (
              <Spinner label={t('pilot.publishConfirmation.loading')} />
            )}
            {previewError && <Alert tone="error" title={t('pilot.publishConfirmation.error')} />}
            {preview && <RecipientPreview value={preview} />}
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                disabled={busy || !preview || previewError}
                onClick={() => save('published', true)}
              >
                {t('pilot.publishConfirmation.confirm')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                {t('pilot.cancel')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function RecipientPreview({ value }: { value: Any }) {
  const { t } = useTranslation();
  return (
    <>
      <p>
        {value.count
          ? t('pilot.publishConfirmation.count', { count: value.count })
          : t('pilot.publishConfirmation.none')}
      </p>
      <ul>
        {value.recipients.map((g: Any) => (
          <li key={g.id}>
            {g.name} · {g.email} ·{' '}
            {t(g.resolved_locale === 'tr' ? 'common.turkish' : 'common.english')}
          </li>
        ))}
      </ul>
    </>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function homeworkResultCode(result: Any, notify: boolean) {
  if (result.storage.status === 'unchanged') return 'homework_unchanged';
  if (!notify) return 'homework_updated_no_email';
  const code = result.notificationAggregate?.code;
  return (
    (
      {
        notifications_submitted: 'homework_updated_notified',
        already_notified: 'homework_updated_already_notified',
        no_recipients: 'homework_updated_no_recipients',
        notification_partial: 'homework_updated_partial',
        notification_failed: 'homework_updated_failed',
        notification_preparation_failed: 'homework_updated_preparation_failed',
        notification_ambiguous: 'homework_updated_ambiguous',
        notification_not_retryable: 'homework_updated_not_retryable',
        notification_in_progress: 'homework_updated_notification_in_progress',
      } as Record<string, string>
    )[code] ?? 'homework_updated_partial'
  );
}

export function HomeworkEditor({
  update,
  onCancel,
  onSaved,
  plain = false,
}: {
  update: Any;
  onCancel: () => void;
  onSaved: (code: string) => Promise<void>;
  plain?: boolean;
}) {
  const { t } = useTranslation();
  const [homework, setHomework] = useState(update.homework ?? '');
  const [notify, setNotify] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [preview, setPreview] = useState<Any | null>(null);
  const lastAttempt = useRef<{ semanticPayload: string; operationKey: string } | null>(null);
  async function openConfirmation() {
    setConfirming(true);
    setPreview(null);
    setError(false);
    setPreviewError(false);
    try {
      setPreview(
        await api(
          `/api/v1/students/${update.student_id}/notification-recipients?classId=${encodeURIComponent(update.class_id)}`,
        ),
      );
    } catch {
      setPreviewError(true);
    }
  }
  async function save() {
    if (busy) return;
    const semanticPayload = JSON.stringify({ homework: homework.trim(), notify });
    const operationKey =
      lastAttempt.current?.semanticPayload === semanticPayload
        ? lastAttempt.current.operationKey
        : crypto.randomUUID();
    lastAttempt.current = { semanticPayload, operationKey };
    const submittedHomework = homework;
    const submittedNotify = notify;
    setBusy(true);
    try {
      const result = await api(`/api/v1/progress-updates/${update.id}/homework`, {
        method: 'PATCH',
        body: JSON.stringify({
          homework: submittedHomework,
          notifyGuardians: submittedNotify,
          operationKey,
        }),
      });
      await onSaved(homeworkResultCode(result, submittedNotify));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className={plain ? 'border-0 p-0 shadow-none' : undefined} aria-busy={busy}>
      <h3 className="font-bold">{t('pilot.homeworkEditor.title')}</h3>
      <FormField id={`published-homework-${update.id}`} label={t('pilot.homework')}>
        <Textarea
          id={`published-homework-${update.id}`}
          disabled={busy}
          value={homework}
          onChange={(e) => setHomework(e.target.value)}
        />
      </FormField>
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          disabled={busy}
          checked={notify}
          onChange={(e) => setNotify(e.target.checked)}
        />
        {t('pilot.homeworkEditor.notify')}
      </label>
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() => (notify ? void openConfirmation() : void save())}
        >
          {t('pilot.save')}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
          {t('pilot.cancel')}
        </Button>
      </div>
      {error && <Alert tone="error" title={t('pilot.homeworkEditor.saveError')} />}
      {confirming && (
        <div role="dialog" aria-modal="true" className="mt-3 rounded border border-border p-3">
          {!preview && !previewError && <Spinner label={t('pilot.publishConfirmation.loading')} />}
          {previewError && <Alert tone="error" title={t('pilot.publishConfirmation.error')} />}
          {preview && <RecipientPreview value={preview} />}
          <Button
            type="button"
            disabled={busy || !preview || previewError}
            onClick={() => void save()}
          >
            {t('pilot.publishConfirmation.confirm')}
          </Button>
        </div>
      )}
    </Card>
  );
}
