import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from '../../../src/pages/DashboardPage';
import { i18n } from '../../../src/i18n';

vi.mock('../../../src/features/auth/SessionProvider', () => ({
  useSession: () => ({
    session: {
      role: 'organization_admin',
      user: { id: 'admin', email: 'samet@example.test' },
    },
  }),
}));

describe('role-aware daily workspace', () => {
  beforeEach(() => {
    void i18n.changeLanguage('en');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/classes'))
          return Response.json({
            ok: true,
            classes: [{ id: 'class-a', name: 'Cedar Class', meeting_schedule: '16:00' }],
          });
        if (url.endsWith('/students'))
          return Response.json({
            ok: true,
            students: [{ id: 'student-a', display_name: 'Ayla Demir', active: 1 }],
          });
        if (url.endsWith('/pilot/setup-options'))
          return Response.json({
            ok: true,
            enrollments: [],
            guardianLinks: [],
            guardians: [],
          });
        return Response.json({}, { status: 404 });
      }),
    );
  });

  it('turns live class and student data into actionable work', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Welcome, samet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ayla Demir/ })).toHaveAttribute(
      'href',
      '/app/students/student-a',
    );
    expect(screen.getByRole('link', { name: /Cedar Class/ })).toHaveAttribute(
      'href',
      '/app/classes/class-a',
    );
    expect(screen.getByText('Complete class or family setup')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Record progress/ })).toHaveAttribute(
      'href',
      '/app/students',
    );
  });
});
