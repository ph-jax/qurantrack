import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spinner } from '../../components/ui';
import { useSession } from './SessionProvider';
import { consumeMagicLinkOnce } from './consumeRequest';

export function ConsumePage() {
  const location = useLocation();
  const token = new URLSearchParams(location.search).get('token');
  const { refresh } = useSession();
  const navigate = useNavigate();
  const { t } = useTranslation();
  useEffect(() => {
    if (!token) {
      navigate('/auth/invalid', { replace: true });
      return;
    }
    void consumeMagicLinkOnce(token).then(async (ok) => {
      if (!ok) {
        navigate('/auth/invalid', { replace: true });
        return;
      }
      await refresh();
      navigate('/app', { replace: true });
    });
  }, [navigate, refresh, token]);
  return (
    <main className="grid min-h-screen place-items-center">
      <Spinner label={t('auth.consumeLoading')} />
    </main>
  );
}
