import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <p className="eyebrow">404</p>
        <h1 className="mt-2 text-3xl font-bold">{t('common.notFound')}</h1>
        <Link className="mt-4 inline-block text-brand underline" to="/">
          {t('common.returnHome')}
        </Link>
      </div>
    </main>
  );
}
