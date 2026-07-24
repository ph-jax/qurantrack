import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession } from './SessionProvider';
import { Alert, Button, Spinner } from '../../components/ui';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status, refresh } = useSession();
  const { t } = useTranslation();
  const location = useLocation();
  if (status === 'checking')
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <Spinner label={t('auth.loading')} />
      </main>
    );
  if (status === 'error')
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="max-w-md">
          <Alert tone="error" title={t('auth.service')} />
          <Button className="mt-4" onClick={() => void refresh()}>
            {t('auth.retry')}
          </Button>
        </div>
      </main>
    );
  if (status === 'expired')
    return <Navigate to="/login" replace state={{ expired: true, from: location.pathname }} />;
  if (status !== 'authenticated') return <Navigate to="/login" replace />;
  return children;
}
