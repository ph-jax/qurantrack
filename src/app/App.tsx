import { RouterProvider } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { router } from './router';
import { i18n } from '../i18n';
import { SessionProvider } from '../features/auth/SessionProvider';

export function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </I18nextProvider>
  );
}
