import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { LoginPage } from '../features/auth/LoginPage';
import { ConsumePage } from '../features/auth/ConsumePage';
import { DashboardPage } from '../pages/DashboardPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { SettingsPage } from '../pages/SettingsPage';
import { StaffPage } from '../pages/StaffPage';
import { InvitationPage } from '../features/auth/InvitationPage';
import { RoleProtectedRoute } from '../features/auth/RoleProtectedRoute';
import { showcasePaths } from './showcaseGate';
const uiPreviewEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_UI_PREVIEW === 'true';
const appChildren = [
  { index: true, element: <DashboardPage /> },
  ...['students', 'classes', 'program', 'reports', 'families', 'notifications'].map((path) => ({
    path,
    element: <PlaceholderPage />,
  })),
  {
    path: 'teachers',
    element: (
      <RoleProtectedRoute roles={['system_admin', 'organization_admin']}>
        <StaffPage />
      </RoleProtectedRoute>
    ),
  },
  { path: 'settings', element: <SettingsPage /> },
];
export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/app" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/o/:organizationSlug/login', element: <LoginPage /> },
  { path: '/auth/consume', element: <ConsumePage /> },
  { path: '/auth/invalid', element: <LoginPage /> },
  { path: '/invitations/accept', element: <InvitationPage /> },
  {
    path: '/app',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: appChildren,
  },
  ...(uiPreviewEnabled && showcasePaths(true).length
    ? [
        {
          path: '/ui-preview',
          element: <AppLayout preview />,
          children: [
            { index: true, element: <Navigate to="dashboard" replace /> },
            {
              path: ':section',
              lazy: async () => ({
                Component: (await import('../pages/ShowcasePage')).ShowcasePage,
              }),
            },
          ],
        },
        { path: '/ui-preview/login', element: <LoginPage preview /> },
      ]
    : []),
  { path: '*', element: <NotFoundPage /> },
]);
