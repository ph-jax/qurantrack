import {
  ArrowUpRight,
  BookOpenCheck,
  CircleAlert,
  GraduationCap,
  NotebookTabs,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge, Card } from '../components/ui';
function Stat({
  label,
  value,
  icon: Icon,
  detail,
}: {
  label: string;
  value: string;
  icon: typeof GraduationCap;
  detail: string;
}) {
  return (
    <Card className="stat-card">
      <div className="stat-icon">
        <Icon className="size-5" />
      </div>
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      <p className="mt-2 flex items-center gap-1 text-xs text-text-muted">
        <ArrowUpRight className="size-3" />
        {detail}
      </p>
    </Card>
  );
}
export function DashboardPage({ preview = false }: { preview?: boolean }) {
  const { t } = useTranslation();
  if (!preview)
    return (
      <>
        <header className="page-header">
          <div>
            <h2>{t('dashboard.title')}</h2>
            <p>{t('dashboard.description')}</p>
          </div>
        </header>
        <Card className="empty-state">
          <span className="empty-icon">
            <GraduationCap />
          </span>
          <h2>{t('common.emptyTitle')}</h2>
          <p>{t('common.emptyBody')}</p>
        </Card>
      </>
    );
  return (
    <>
      <header className="page-header">
        <div>
          <h2>{t('dashboard.title')}</h2>
          <p>{t('dashboard.description')}</p>
        </div>
      </header>
      <div className="stats-grid">
        <Stat
          label={t('dashboard.students')}
          value="128"
          icon={GraduationCap}
          detail="Fictional preview"
        />
        <Stat
          label={t('dashboard.updates')}
          value="42"
          icon={NotebookTabs}
          detail="12 more than last week"
        />
        <Stat
          label={t('dashboard.attention')}
          value="3"
          icon={CircleAlert}
          detail="Review suggested"
        />
        <Stat
          label={t('dashboard.completion')}
          value="84%"
          icon={BookOpenCheck}
          detail="Across active tracks"
        />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <h3 className="text-lg font-bold">{t('dashboard.recent')}</h3>
          <div className="mt-4 divide-y divide-border">
            {['Ayla Demir', 'Mert Kaya', 'Leyla Arslan'].map((name, i) => (
              <div className="flex items-center justify-between gap-3 py-4" key={name}>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{name}</p>
                  <p className="text-sm text-text-secondary">
                    {i === 1 ? 'Connected letters' : 'Surah review'} · Fictional
                  </p>
                </div>
                <Badge tone={i === 1 ? 'warning' : 'success'}>
                  {i === 1 ? t('common.review') : t('common.passed')}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
        <Card className="quran-card">
          <p className="eyebrow">{t('dashboard.arabic')}</p>
          <p lang="ar" dir="rtl" className="quran-text">
            اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ
          </p>
          <p className="mt-4 text-sm text-text-secondary">
            Arabic content uses a readable local system font stack and an explicit direction
            boundary.
          </p>
        </Card>
      </div>
    </>
  );
}
