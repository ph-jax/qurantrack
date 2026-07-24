import { BookMarked, ChevronRight, Layers3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  FormField,
  Input,
  SearchInput,
  Select,
  Skeleton,
  Switch,
  Textarea,
} from '../components/ui';
import { OrganizationIdentity } from '../components/OrganizationIdentity';
import { DashboardPage } from './DashboardPage';
const learners = [
  { name: 'Ayla Demir', class: 'Cedar Class', track: 'Quran Reading', status: 'active' },
  { name: 'Mert Kaya', class: 'Olive Class', track: 'Memorization', status: 'review' },
  { name: 'Leyla Arslan', class: 'Cedar Class', track: 'Tajweed', status: 'active' },
];
export function ShowcasePage() {
  const { t } = useTranslation();
  return (
    <>
      <header className="page-header">
        <div>
          <Badge tone="info">{t('shell.preview')}</Badge>
          <h2 className="mt-3">{t('showcase.title')}</h2>
          <p>{t('showcase.description')}</p>
        </div>
      </header>
      <DashboardPage preview />
      <div className="grid gap-4 md:grid-cols-3">
        <Alert tone="success" title={t('common.success')} />
        <Alert tone="warning" title={t('common.warning')} />
        <Alert tone="error" title={t('common.error')} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <h3 className="text-lg font-bold">{t('showcase.program')}</h3>
          <div className="hierarchy mt-4">
            <div className="hierarchy-row">
              <Layers3 />
              <strong>{t('showcase.track')}</strong>
            </div>
            <div className="hierarchy-row hierarchy-level">
              <ChevronRight />
              <strong>{t('showcase.level')}</strong>
            </div>
            {[t('showcase.lesson1'), t('showcase.lesson2')].map((x, i) => (
              <div className="hierarchy-row hierarchy-lesson" key={x}>
                <BookMarked />
                <span>{x}</span>
                <Badge tone={i ? 'warning' : 'success'}>
                  {i ? t('common.review') : t('common.active')}
                </Badge>
              </div>
            ))}
          </div>
          <p lang="ar" dir="rtl" className="quran-text mt-5 rounded-lg bg-muted p-4">
            بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
          </p>
        </Card>
        <Card>
          <h3 className="text-lg font-bold">{t('showcase.form')}</h3>
          <form className="mt-5 space-y-5" onSubmit={(e) => e.preventDefault()}>
            <FormField
              id="program-name"
              label={t('showcase.name')}
              description={t('showcase.help')}
              error={t('showcase.validation')}
              required
            >
              <Input
                id="program-name"
                aria-invalid
                aria-describedby="program-name-description program-name-error"
              />
            </FormField>
            <FormField id="notes" label={t('showcase.notes')}>
              <Textarea id="notes" />
            </FormField>
            <Select
              label={t('showcase.track')}
              items={[
                { value: 'reading', label: t('showcase.track') },
                { value: 'memorization', label: 'Memorization' },
              ]}
            />
            <Checkbox id="public" label="Visible to teachers" />
            <Switch id="active" label={t('showcase.enabled')} />
            <div className="flex flex-wrap gap-2">
              <Button>{t('common.save')}</Button>
              <ConfirmDialog
                trigger={<Button variant="secondary">{t('showcase.openDialog')}</Button>}
                title={t('common.confirm')}
                description={t('common.confirmBody')}
                action={t('common.confirmAction')}
              />
            </div>
          </form>
        </Card>
      </div>
      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-lg font-bold">{t('showcase.studentList')}</h3>
          <SearchInput
            aria-label={t('common.search')}
            placeholder={t('common.search')}
            className="sm:w-64"
          />
        </div>
        <div className="responsive-table mt-4">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Class</th>
                <th>Track</th>
                <th>{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {learners.map((x) => (
                <tr key={x.name}>
                  <td className="font-semibold">{x.name}</td>
                  <td>{x.class}</td>
                  <td>{x.track}</td>
                  <td>
                    <Badge tone={x.status === 'active' ? 'success' : 'warning'}>
                      {x.status === 'active' ? t('common.active') : t('common.review')}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mobile-cards">
            {learners.map((x) => (
              <article key={x.name}>
                <div>
                  <strong>{x.name}</strong>
                  <p>
                    {x.class} · {x.track}
                  </p>
                </div>
                <Badge tone={x.status === 'active' ? 'success' : 'warning'}>
                  {x.status === 'active' ? t('common.active') : t('common.review')}
                </Badge>
              </article>
            ))}
          </div>
        </div>
        <nav aria-label="Pagination" className="mt-5 flex items-center justify-between gap-2">
          <Button variant="secondary">{t('common.previous')}</Button>
          <span className="text-sm text-text-secondary">
            {t('common.page', { page: 1, pages: 4 })}
          </span>
          <Button variant="secondary">{t('common.next')}</Button>
        </nav>
      </Card>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card>
          <h3 className="font-bold">{t('showcase.logo')}</h3>
          <OrganizationIdentity
            name={t('showcase.organizationName')}
            logoUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Crect width='60' height='60' rx='12' fill='%230f766e'/%3E%3Ctext x='30' y='38' text-anchor='middle' font-size='22' fill='white'%3EFL%3C/text%3E%3C/svg%3E"
            accent="#0f766e"
          />
          <h3 className="mt-5 font-bold">{t('showcase.noLogo')}</h3>
          <OrganizationIdentity name={t('showcase.organizationName')} accent="not-css" />
        </Card>
        <Card>
          <h3 className="font-bold">{t('common.loading')}</h3>
          <div className="mt-4 space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-10 w-1/2" />
          </div>
        </Card>
      </div>
    </>
  );
}
