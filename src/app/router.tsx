import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { LoginPage } from '../features/auth/LoginPage';
import { ConsumePage } from '../features/auth/ConsumePage';
import { DashboardPage } from '../pages/DashboardPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { showcasePaths } from './showcaseGate';
const appChildren = [
  { index: true, element: <DashboardPage /> },
  ...[
    'students',
    'teachers',
    'classes',
    'program',
    'reports',
    'families',
    'notifications',
    'settings',
  ].map((path) => ({ path, element: <PlaceholderPage /> })),
];
export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/app" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/o/:organizationSlug/login', element: <LoginPage /> },
  { path: '/auth/consume', element: <ConsumePage /> },
  { path: '/auth/invalid', element: <LoginPage /> },
  {
    path: '/app',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: appChildren,
  },
  ...(import.meta.env.DEV && showcasePaths(true).length
    ? [
        {
          path: '/ui-preview',
          element: <AppLayout preview />,
          children: [
            {
              index: true,
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
