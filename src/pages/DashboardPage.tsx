import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  CircleAlert,
  GraduationCap,
  Plus,
  School,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Badge, Card, Skeleton } from '../components/ui';
import { useSession } from '../features/auth/SessionProvider';

type Item = Record<string, unknown>;
type DashboardData = {
  classes: Item[];
  students: Item[];
  setup?: { enrollments?: Item[]; guardianLinks?: Item[]; guardians?: Item[] };
};
type AttentionItem = Item & { reason: 'setup' | 'continue' };

async function loadJson(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('dashboard_load_failed');
  return (await response.json()) as Record<string, unknown>;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function DashboardSkeleton() {
  return (
    <div className="workspace-grid">
      <Card className="space-y-4">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </Card>
      <Card className="space-y-4">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-32 w-full" />
      </Card>
    </div>
  );
}

export function DashboardPage({ preview = false }: { preview?: boolean }) {
  const { t, i18n } = useTranslation();
  const { session } = useSession();
  const role = preview ? 'organization_admin' : session?.role;
  const admin = role === 'organization_admin';
  const educator = admin || role === 'teacher';
  const [data, setData] = useState<DashboardData | null>(
    preview
      ? {
          classes: [
            { id: 'cedar', name: 'Cedar Class', meeting_schedule: '16:00', active: 1 },
            { id: 'olive', name: 'Olive Class', meeting_schedule: '18:00', active: 1 },
          ],
          students: [
            { id: 'ayla', display_name: 'Ayla Demir', active: 1 },
            { id: 'mert', display_name: 'Mert Kaya', active: 1 },
            { id: 'leyla', display_name: 'Leyla Arslan', active: 1 },
          ],
          setup: {
            enrollments: [
              { student_id: 'ayla', active: 1 },
              { student_id: 'leyla', active: 1 },
            ],
            guardianLinks: [{ student_id: 'ayla', receive_notifications: 1 }],
            guardians: [{ id: 'guardian', active: 1 }],
          },
        }
      : educator
        ? null
        : { classes: [], students: [] },
  );
  const [error, setError] = useState(false);

  useEffect(() => {
    if (preview || !educator) return;
    let current = true;
    Promise.all([
      loadJson('/api/v1/classes'),
      loadJson('/api/v1/students'),
      admin ? loadJson('/api/v1/pilot/setup-options') : Promise.resolve({}),
    ])
      .then(([classes, students, setup]) => {
        if (!current) return;
        setData({
          classes: (classes.classes as Item[]) ?? [],
          students: (students.students as Item[]) ?? [],
          setup: setup as DashboardData['setup'],
        });
      })
      .catch(() => current && setError(true));
    return () => {
      current = false;
    };
  }, [admin, educator, preview]);

  const displayName = preview
    ? 'Samet'
    : session?.user.email.split('@')[0].replace(/[._-]+/g, ' ') || t('dashboard.educator');
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }).format(new Date()),
    [i18n.language],
  );
  const attention = useMemo<AttentionItem[]>(() => {
    if (!data) return [];
    if (!admin)
      return data.students
        .slice(0, 3)
        .map((student) => ({ ...student, reason: 'continue' as const }));
    const enrollments = data.setup?.enrollments ?? [];
    const links = data.setup?.guardianLinks ?? [];
    return data.students
      .filter((student) => {
        const id = String(student.id);
        const enrolled = enrollments.some(
          (enrollment) => enrollment.student_id === id && !!enrollment.active,
        );
        const contactable = links.some(
          (link) => link.student_id === id && !!link.receive_notifications,
        );
        return !enrolled || !contactable;
      })
      .slice(0, 3)
      .map((student) => ({ ...student, reason: 'setup' as const }));
  }, [admin, data]);

  return (
    <div className="workspace-page">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{date}</p>
          <h1>{t('dashboard.greeting', { name: displayName })}</h1>
          <p>{t(admin ? 'dashboard.adminDescription' : 'dashboard.teacherDescription')}</p>
        </div>
        {educator && (
          <Link
            className="app-button app-button-primary workspace-primary-action"
            to="/app/students"
          >
            <Plus className="size-4" aria-hidden />
            {t('pilot.recordProgress')}
          </Link>
        )}
      </header>

      {error && <Alert tone="error" title={t('dashboard.loadError')} />}
      {!data ? (
        <DashboardSkeleton />
      ) : !educator ? (
        <Card className="empty-state">
          <span className="empty-icon">
            <BookOpenCheck />
          </span>
          <h2>{t('dashboard.readOnlyTitle')}</h2>
          <p>{t('dashboard.readOnlyBody')}</p>
        </Card>
      ) : (
        <div className="workspace-grid">
          <div className="workspace-stack">
            <Card className="workspace-panel">
              <div className="section-heading">
                <div>
                  <h2>{t(admin ? 'dashboard.attentionSetup' : 'dashboard.continueLearning')}</h2>
                  <p>
                    {t(admin ? 'dashboard.attentionSetupBody' : 'dashboard.continueLearningBody')}
                  </p>
                </div>
                {!!attention.length && <Badge tone="warning">{attention.length}</Badge>}
              </div>
              <div className="workspace-list">
                {attention.map((student) => {
                  const name = String(student.display_name ?? '');
                  return (
                    <Link
                      className="workspace-row"
                      key={String(student.id)}
                      to={`/app/students/${student.id}`}
                    >
                      <span className="entity-avatar" aria-hidden>
                        {initials(name)}
                      </span>
                      <span className="workspace-row-copy">
                        <strong>{name}</strong>
                        <span>
                          {t(
                            student.reason === 'setup'
                              ? 'dashboard.completeSetup'
                              : 'dashboard.openWorkspace',
                          )}
                        </span>
                      </span>
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  );
                })}
                {!attention.length && (
                  <div className="workspace-complete">
                    <Check className="size-5" aria-hidden />
                    <span>{t('dashboard.nothingNeedsAttention')}</span>
                  </div>
                )}
              </div>
            </Card>

            <Card className="workspace-panel">
              <div className="section-heading">
                <div>
                  <h2>{t('dashboard.activeClasses')}</h2>
                  <p>{t('dashboard.activeClassesBody')}</p>
                </div>
                <Link className="text-sm font-semibold text-brand" to="/app/classes">
                  {t('dashboard.viewAll')}
                </Link>
              </div>
              <div className="class-workspace-grid">
                {data.classes.slice(0, 4).map((item) => (
                  <Link
                    className="class-workspace-card"
                    key={String(item.id)}
                    to={`/app/classes/${item.id}`}
                  >
                    <span className="class-workspace-icon" aria-hidden>
                      <School />
                    </span>
                    <span className="min-w-0">
                      <strong className="block truncate">{String(item.name)}</strong>
                      <span className="block truncate text-sm text-text-secondary">
                        {String(item.meeting_schedule || t('dashboard.scheduleNotSet'))}
                      </span>
                    </span>
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                ))}
                {!data.classes.length && (
                  <div className="workspace-empty-inline">
                    <School aria-hidden />
                    <p>{t('pilot.emptyClasses')}</p>
                    {admin && (
                      <Link className="font-semibold text-brand" to="/app/classes">
                        {t('pilot.classes.create')}
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </div>

          <aside className="workspace-stack">
            <Card className="workspace-panel workspace-panel-warm">
              <div className="section-heading">
                <div>
                  <h2>{t(admin ? 'dashboard.setupTitle' : 'dashboard.nextStep')}</h2>
                  <p>{t(admin ? 'dashboard.setupBody' : 'dashboard.nextStepBody')}</p>
                </div>
              </div>
              {admin ? (
                <div className="checklist">
                  <Link to="/app/classes">
                    <span className={data.classes.length ? 'check-done' : 'check-open'}>
                      {data.classes.length ? <Check /> : <CircleAlert />}
                    </span>
                    {t('dashboard.checkClasses')}
                  </Link>
                  <Link to="/app/students">
                    <span className={data.students.length ? 'check-done' : 'check-open'}>
                      {data.students.length ? <Check /> : <CircleAlert />}
                    </span>
                    {t('dashboard.checkStudents')}
                  </Link>
                  <Link to="/app/families">
                    <span
                      className={(data.setup?.guardians?.length ?? 0) ? 'check-done' : 'check-open'}
                    >
                      {(data.setup?.guardians?.length ?? 0) ? <Check /> : <CircleAlert />}
                    </span>
                    {t('dashboard.checkFamilies')}
                  </Link>
                  <Link to="/app/program">
                    <span className="check-open">
                      <BookOpenCheck />
                    </span>
                    {t('dashboard.checkProgram')}
                  </Link>
                </div>
              ) : (
                <Link className="next-step-link" to="/app/students">
                  <span className="class-workspace-icon" aria-hidden>
                    <GraduationCap />
                  </span>
                  <span>
                    <strong>{t('dashboard.chooseStudent')}</strong>
                    <span>{t('dashboard.chooseStudentBody')}</span>
                  </span>
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              )}
              <p className="quran-moment" lang="ar" dir="rtl">
                اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ
              </p>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
