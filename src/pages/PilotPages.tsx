/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Badge, Button, Card, FormField, Input, Spinner, Textarea } from '../components/ui';
import { useSession } from '../features/auth/SessionProvider';

type Any = Record<string, any>;
async function api<T = Any>(url: string, init?: RequestInit) {
  const r = await fetch(url, {
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as T;
}
function MiniForm({
  title,
  fields,
  onSave,
}: {
  title: string;
  fields: string[];
  onSave: (v: Any) => Promise<void>;
}) {
  const [v, setV] = useState<Any>({ active: true });
  const [s, setS] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setS('saving');
    try {
      await onSave(v);
      setV({ active: true });
      setS('saved');
    } catch {
      setS('error');
    }
  }
  return (
    <Card>
      <form className="grid gap-3" onSubmit={submit}>
        <h3 className="text-lg font-bold">{title}</h3>
        {fields.map((f) => (
          <FormField key={f} id={`${title}-${f}`} label={f.replaceAll('_', ' ')}>
            <Input
              id={`${title}-${f}`}
              value={v[f] ?? ''}
              onChange={(e) => setV({ ...v, [f]: e.target.value })}
            />
          </FormField>
        ))}
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!v.active}
            onChange={(e) => setV({ ...v, active: e.target.checked })}
          />{' '}
          Active
        </label>
        <Button>{s === 'saving' ? 'Saving…' : 'Save'}</Button>
        {s === 'saved' && <Alert tone="success" title="Saved" />}
        {s === 'error' && <Alert tone="error" title="Could not save" />}
      </form>
    </Card>
  );
}
function useLoad(url: string) {
  const [data, setData] = useState<Any | null>(null),
    [err, setErr] = useState(false);
  useEffect(() => {
    let ok = true;
    api(url)
      .then((d) => ok && setData(d))
      .catch(() => ok && setErr(true));
    return () => {
      ok = false;
    };
  }, [url]);
  return { data, err, reload: () => api(url).then(setData) };
}
export function ClassesPage() {
  const { session } = useSession();
  const { data, err, reload } = useLoad('/api/v1/classes');
  if (err) return <Alert tone="error" title="Classes could not be loaded" />;
  if (!data) return <Spinner label="Loading classes" />;
  const admin = session?.role === 'organization_admin';
  return (
    <div className="space-y-5">
      <Header title="Classes" desc="Manage classes and open assigned rosters." />
      {admin && (
        <MiniForm
          title="Class"
          fields={['name', 'description', 'meeting_schedule']}
          onSave={(v) =>
            api('/api/v1/classes', { method: 'POST', body: JSON.stringify(v) }).then(reload)
          }
        />
      )}
      <div className="grid gap-3">
        {data.classes.map((c: Any) => (
          <Card key={c.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold">{c.name}</h3>
                <p className="text-sm text-text-secondary">{c.meeting_schedule}</p>
                <p className="text-xs">{c.teacher_names}</p>
              </div>
              <div className="flex gap-2">
                <Badge tone={c.active ? 'success' : 'neutral'}>
                  {c.active ? 'Active' : 'Inactive'}
                </Badge>
                <Link className="btn" to={`/app/classes/${c.id}`}>
                  Roster
                </Link>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
export function StudentsPage() {
  const { session } = useSession();
  const { data, err, reload } = useLoad('/api/v1/students');
  if (err) return <Alert tone="error" title="Students could not be loaded" />;
  if (!data) return <Spinner label="Loading students" />;
  const admin = session?.role === 'organization_admin';
  return (
    <div className="space-y-5">
      <Header title="Students" desc="Manage student records and open progress summaries." />
      {admin && (
        <>
          <MiniForm
            title="Student"
            fields={['display_name', 'first_name', 'last_name', 'external_id', 'notes']}
            onSave={(v) =>
              api('/api/v1/students', { method: 'POST', body: JSON.stringify(v) }).then(reload)
            }
          />
          <MiniForm
            title="Guardian"
            fields={['name', 'email', 'phone', 'preferred_locale']}
            onSave={(v) => api('/api/v1/guardians', { method: 'POST', body: JSON.stringify(v) })}
          />
        </>
      )}
      <div className="grid gap-3">
        {data.students.map((s: Any) => (
          <Card key={s.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h3 className="font-bold">{s.display_name}</h3>
                {admin && <p className="text-xs text-text-secondary">{s.notes}</p>}
              </div>
              <Link className="btn" to={`/app/students/${s.id}`}>
                Progress
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
export function ProgramPage() {
  const { data, err, reload } = useLoad('/api/v1/program');
  if (err) return <Alert tone="error" title="Program could not be loaded" />;
  if (!data) return <Spinner label="Loading program" />;
  return (
    <div className="space-y-5">
      <Header
        title="Program"
        desc="Manually administer tracks, levels, lessons, order, status, and default homework."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <MiniForm
          title="Track"
          fields={['code', 'name', 'description', 'sort_order']}
          onSave={(v) =>
            api('/api/v1/program/tracks', { method: 'POST', body: JSON.stringify(v) }).then(reload)
          }
        />
        <MiniForm
          title="Level"
          fields={['track_id', 'code', 'name', 'description', 'sort_order']}
          onSave={(v) =>
            api('/api/v1/program/levels', { method: 'POST', body: JSON.stringify(v) }).then(reload)
          }
        />
        <MiniForm
          title="Lesson"
          fields={['level_id', 'code', 'name', 'description', 'sort_order', 'default_homework']}
          onSave={(v) =>
            api('/api/v1/program/lessons', { method: 'POST', body: JSON.stringify(v) }).then(reload)
          }
        />
      </div>
      <Card>
        <h3 className="font-bold">Curriculum</h3>
        {data.tracks.map((t: Any) => (
          <div key={t.id} className="mt-4">
            <h4 className="font-semibold">
              {t.sort_order}. {t.name} <code className="text-xs">{t.id}</code>
            </h4>
            {data.levels
              .filter((l: Any) => l.track_id === t.id)
              .map((l: Any) => (
                <div key={l.id} className="ms-4 mt-2">
                  <p>
                    {l.sort_order}. {l.name} <code className="text-xs">{l.id}</code>
                  </p>
                  <ul className="ms-6 list-disc text-sm">
                    {data.lessons
                      .filter((x: Any) => x.level_id === l.id)
                      .map((x: Any) => (
                        <li key={x.id}>
                          {x.sort_order}. {x.name} — {x.default_homework} <code>{x.id}</code>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
          </div>
        ))}
      </Card>
    </div>
  );
}
export function RosterPage() {
  const { id } = useParams();
  const { data, err } = useLoad(`/api/v1/classes/${id}/roster`);
  if (err) return <Alert tone="error" title="Roster unavailable" />;
  if (!data) return <Spinner label="Loading roster" />;
  return (
    <div className="space-y-5">
      <Header title="Class roster" desc="Active enrolled students only." />
      <div className="grid gap-3">
        {data.students.map((s: Any) => (
          <Card key={s.id}>
            <Link to={`/app/students/${s.id}`} className="font-bold">
              {s.display_name}
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
export function StudentProgressPage() {
  const { id } = useParams();
  const { data, err, reload } = useLoad(`/api/v1/students/${id}/summary`);
  if (err) return <Alert tone="error" title="Progress unavailable" />;
  if (!data) return <Spinner label="Loading progress" />;
  return (
    <div className="space-y-5">
      <Header
        title={data.student.display_name}
        desc="Tracks, completed lessons, homework, comments, and notification status."
      />
      <Card>
        <h3 className="font-bold">Assigned tracks</h3>
        {data.tracks.map((t: Any) => (
          <p key={t.track_id}>
            {t.track_name}: {t.level_name}
          </p>
        ))}
      </Card>
      <ProgressForm studentId={id!} onDone={reload} />
      <Card>
        <h3 className="font-bold">Passed lessons</h3>
        {data.passed.map((p: Any) => (
          <Badge key={p.id} tone="success">
            {p.name}
          </Badge>
        ))}
      </Card>
      <Card>
        <h3 className="font-bold">Recent updates</h3>
        {data.updates.map((u: Any) => (
          <div key={u.id} className="border-b border-border py-3">
            <p className="font-semibold">
              {u.update_date} · {u.status}
            </p>
            <p>{u.overall_comment}</p>
            <p className="text-sm text-text-secondary">Homework: {u.homework}</p>
            {u.status === 'published' && (
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  api(`/api/v1/progress-updates/${u.id}/notify`, { method: 'POST' }).then(reload)
                }
              >
                Send Progress Update
              </Button>
            )}
          </div>
        ))}
      </Card>
      <Card>
        <h3 className="font-bold">Guardians and notifications</h3>
        {data.guardians.map((g: Any) => (
          <p key={g.email}>
            {g.name} · {g.email} · {g.receive_notifications ? 'enabled' : 'disabled'}
          </p>
        ))}
        {data.notifications.map((n: Any) => (
          <p key={n.created_at} className="text-sm">
            {n.status}: {n.error_message || n.sent_at}
          </p>
        ))}
      </Card>
    </div>
  );
}
function ProgressForm({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const { data } = useLoad('/api/v1/program');
  const [v, setV] = useState<Any>({
    student_id: studentId,
    update_date: new Date().toISOString().slice(0, 10),
    status: 'draft',
    items: [{}],
  });
  const lessons = data?.lessons || [];
  async function save(status: string, notify = false) {
    await api('/api/v1/progress-updates', {
      method: 'POST',
      body: JSON.stringify({
        ...v,
        status,
        notify,
        items: v.items.filter((i: Any) => i.lesson_id),
      }),
    });
    onDone();
  }
  return (
    <Card>
      <h3 className="font-bold">Record Progress</h3>
      <div className="grid gap-3">
        <FormField id="date" label="Date">
          <Input
            id="date"
            type="date"
            value={v.update_date}
            onChange={(e) => setV({ ...v, update_date: e.target.value })}
          />
        </FormField>
        {v.items.map((it: Any, i: number) => (
          <div key={i} className="grid gap-2 rounded border border-border p-3">
            <select
              className="settings-select"
              value={it.lesson_id || ''}
              onChange={(e) => {
                const a = [...v.items];
                a[i] = { ...it, lesson_id: e.target.value };
                setV({ ...v, items: a });
              }}
            >
              <option value="">Lesson</option>
              {lessons.map((l: Any) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select
              className="settings-select"
              value={it.outcome || 'practiced'}
              onChange={(e) => {
                const a = [...v.items];
                a[i] = { ...it, outcome: e.target.value };
                setV({ ...v, items: a });
              }}
            >
              <option value="passed">Passed</option>
              <option value="practiced">Practiced</option>
              <option value="needs_practice">Needs practice</option>
              <option value="assigned">Assigned</option>
            </select>
            <Input
              placeholder="Item comment"
              value={it.item_comment || ''}
              onChange={(e) => {
                const a = [...v.items];
                a[i] = { ...it, item_comment: e.target.value };
                setV({ ...v, items: a });
              }}
            />
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() => setV({ ...v, items: [...v.items, {}] })}
        >
          Add lesson item
        </Button>
        <Textarea
          aria-label="Teacher comment"
          placeholder="Teacher comment"
          value={v.overall_comment || ''}
          onChange={(e) => setV({ ...v, overall_comment: e.target.value })}
        />
        <Textarea
          aria-label="Homework"
          placeholder="Homework/current assignment"
          value={v.homework || ''}
          onChange={(e) => setV({ ...v, homework: e.target.value })}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => save('draft')}>
            Save Draft
          </Button>
          <Button type="button" onClick={() => save('published')}>
            Publish
          </Button>
          <Button type="button" onClick={() => save('published', true)}>
            Publish & Notify Guardians
          </Button>
        </div>
      </div>
    </Card>
  );
}
function Header({ title, desc }: { title: string; desc: string }) {
  const { t } = useTranslation();
  return (
    <div className="page-header">
      <div>
        <h2>{title}</h2>
        <p>{desc || t('brand.tagline')}</p>
      </div>
    </div>
  );
}
