import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spinner } from '../../components/ui';
import { useSession } from './SessionProvider';
import { runConsumeFlowOnce } from './consumeRequest';

export function ConsumePage() {
  const location = useLocation();
  const token = new URLSearchParams(location.search).get('token');
  const { refresh } = useSession();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const missingTokenHandled = useRef(false);
  useEffect(() => {
    if (!token) {
      if (missingTokenHandled.current) return;
      missingTokenHandled.current = true;
      navigate('/auth/invalid', { replace: true });
      return;
    }
    void runConsumeFlowOnce(token, refresh, (authenticated) =>
      navigate(authenticated ? '/app' : '/auth/invalid', { replace: true }),
    );
  }, [navigate, refresh, token]);
  return (
    <main className="grid min-h-screen place-items-center">
      <Spinner label={t('auth.consumeLoading')} />
    </main>
  );
}
