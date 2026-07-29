import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/ui';
import { useSession, type Role } from './SessionProvider';
export function RoleProtectedRoute({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { session } = useSession();
  const { t } = useTranslation();
  if (!session) return <Navigate to="/login" replace />;
  return roles.includes(session.role) ? (
    children
  ) : (
    <Alert tone="error" title={t('auth.permissionDenied')} />
  );
}
