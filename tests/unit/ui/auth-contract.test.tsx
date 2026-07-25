import { StrictMode, useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { SessionProvider, useSession } from '../../../src/features/auth/SessionProvider';
import { ConsumePage } from '../../../src/features/auth/ConsumePage';
import { LoginPage } from '../../../src/features/auth/LoginPage';
import {
  resetConsumeRequestsForTests,
  runConsumeFlowOnce,
} from '../../../src/features/auth/consumeRequest';
import { AppLayout } from '../../../src/app/AppLayout';
import { navigation, previewDestination } from '../../../src/app/navigation';
import { i18n } from '../../../src/i18n';
import { ShowcasePage } from '../../../src/pages/ShowcasePage';

const me = {
  user: { id: 'u', email: 'staff@example.test' },
  activeOrganizationId: 'o1',
  role: 'organization_admin',
};
const organizations = [
  { id: 'o1', name: 'Fictional Center', slug: 'fictional', role: 'organization_admin' },
];
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function ContractProbe() {
  const value = useSession();
  const [failure, setFailure] = useState(false);
  return (
    <>
      <span>{value.status}</span>
      {failure && <span>switch-failed</span>}
      <button onClick={() => void value.switchOrganization('o1').catch(() => setFailure(true))}>
        switch
      </button>
      <button onClick={() => void value.logout()}>logout</button>
    </>
  );
}
function provider(ui: React.ReactNode) {
  return (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <SessionProvider>{ui}</SessionProvider>
      </MemoryRouter>
    </I18nextProvider>
  );
}

describe('frontend authentication API contract', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    resetConsumeRequestsForTests();
  });
  it('requests the exact me and organization-list URLs during restoration', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/v1/me' ? response(me) : response({ organizations }),
    );
    vi.stubGlobal('fetch', fetch);
    render(provider(<ContractProbe />));
    await screen.findByText('authenticated');
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      '/api/v1/me',
      '/api/v1/me/organizations',
    ]);
  });
  it('treats a 401 while loading organizations as expired and clears stale state', async () => {
    localStorage.setItem('qurantrack-had-session', 'true');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(me))
      .mockResolvedValueOnce(response({}, 401));
    vi.stubGlobal('fetch', fetch);
    render(provider(<ContractProbe />));
    await screen.findByText('expired');
    expect(localStorage.getItem('qurantrack-had-session')).toBeNull();
    expect(fetch.mock.calls[1]?.[0]).toBe('/api/v1/me/organizations');
  });
  it('switches through the authorized endpoint and refreshes authoritative session data', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(me))
      .mockResolvedValueOnce(response({ organizations }))
      .mockResolvedValueOnce(response({ ok: true }))
      .mockResolvedValueOnce(response(me))
      .mockResolvedValueOnce(response({ organizations }));
    vi.stubGlobal('fetch', fetch);
    render(provider(<ContractProbe />));
    await screen.findByText('authenticated');
    await userEvent.click(screen.getByRole('button', { name: 'switch' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(5));
    expect(fetch.mock.calls[2]?.[0]).toBe('/api/v1/me/organizations/switch');
    expect(JSON.parse(String((fetch.mock.calls[2]?.[1] as RequestInit).body))).toEqual({
      organizationId: 'o1',
    });
  });
  it('surfaces a failed organization switch instead of refreshing', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(me))
      .mockResolvedValueOnce(response({ organizations }))
      .mockResolvedValueOnce(response({}, 403));
    vi.stubGlobal('fetch', fetch);
    render(provider(<ContractProbe />));
    await screen.findByText('authenticated');
    await userEvent.click(screen.getByRole('button', { name: 'switch' }));
    await screen.findByText('switch-failed');
    expect(fetch.mock.calls[2]?.[0]).toBe('/api/v1/me/organizations/switch');
  });
  it('logs out using the exact route and clears session state', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(me))
      .mockResolvedValueOnce(response({ organizations }))
      .mockResolvedValueOnce(response({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    render(provider(<ContractProbe />));
    await screen.findByText('authenticated');
    await userEvent.click(screen.getByRole('button', { name: 'logout' }));
    await screen.findByText('unauthenticated');
    expect(fetch.mock.calls[2]?.[0]).toBe('/api/v1/auth/logout');
  });
});

function consumeTree(path: string) {
  return (
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[path]}>
          <SessionProvider>
            <Routes>
              <Route path="/auth/consume" element={<ConsumePage />} />
              <Route path="/auth/invalid" element={<div>Invalid state</div>} />
              <Route path="/app" element={<div>Authenticated app</div>} />
            </Routes>
          </SessionProvider>
        </MemoryRouter>
      </I18nextProvider>
    </StrictMode>
  );
}

function FlowProbe({
  refresh,
  decide,
}: {
  refresh: () => Promise<void>;
  decide: (authenticated: boolean) => void;
}) {
  useEffect(() => {
    void runConsumeFlowOnce('delayed-token', refresh, decide);
  }, [decide, refresh]);
  return null;
}
describe('single-use magic-link consumption', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    resetConsumeRequestsForTests();
  });
  it('posts exactly once under StrictMode and replaces token history on success', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/consume')) return response({ ok: true });
      if (url === '/api/v1/me') return response(me);
      return response({ organizations });
    });
    vi.stubGlobal('fetch', fetch);
    render(consumeTree('/auth/consume?token=secure-token-value'));
    await screen.findByText('Authenticated app');
    expect(fetch.mock.calls.filter(([u]) => String(u).includes('/consume'))).toHaveLength(1);
  });
  it('runs delayed completion, refresh, and navigation decisions exactly once under StrictMode', async () => {
    let resolveConsume!: (value: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveConsume = resolve;
        }),
    );
    const refresh = vi.fn().mockResolvedValue(undefined);
    const decide = vi.fn();
    vi.stubGlobal('fetch', fetch);
    render(
      <StrictMode>
        <FlowProbe refresh={refresh} decide={decide} />
      </StrictMode>,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    resolveConsume(response({ ok: true }));
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(decide).toHaveBeenCalledWith(true);
  });
  it('prevents a stale initial session response from replacing post-consumption authentication', async () => {
    let resolveConsume!: (value: Response) => void;
    let resolveStaleMe!: (value: Response) => void;
    let meCalls = 0;
    const fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/consume'))
        return new Promise<Response>((resolve) => {
          resolveConsume = resolve;
        });
      if (url === '/api/v1/me' && ++meCalls === 1)
        return new Promise<Response>((resolve) => {
          resolveStaleMe = resolve;
        });
      if (url === '/api/v1/me') return Promise.resolve(response(me));
      return Promise.resolve(response({ organizations }));
    });
    vi.stubGlobal('fetch', fetch);
    render(consumeTree('/auth/consume?token=stale-race-token'));
    await waitFor(() => expect(resolveConsume).toBeTypeOf('function'));
    await waitFor(() => expect(resolveStaleMe).toBeTypeOf('function'));
    resolveConsume(response({ ok: true }));
    await screen.findByText('Authenticated app');
    resolveStaleMe(response({}, 401));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText('Authenticated app')).toBeInTheDocument();
    expect(fetch.mock.calls.filter(([url]) => String(url) === '/api/v1/me')).toHaveLength(2);
    expect(
      fetch.mock.calls.filter(([url]) => String(url) === '/api/v1/me/organizations'),
    ).toHaveLength(1);
  });
  it.each([
    ['invalid', response({}, 400)],
    ['network', null],
  ])('routes %s consumption to the invalid state', async (_case, result) => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/consume')) {
        if (!result) throw new Error('offline');
        return result;
      }
      return response({}, 401);
    });
    vi.stubGlobal('fetch', fetch);
    render(consumeTree('/auth/consume?token=bad-token'));
    await screen.findByText('Invalid state');
    expect(fetch.mock.calls.filter(([u]) => String(u).includes('/consume'))).toHaveLength(1);
  });
  it('handles a missing token without a consume request', async () => {
    const fetch = vi.fn().mockResolvedValue(response({}, 401));
    vi.stubGlobal('fetch', fetch);
    render(consumeTree('/auth/consume'));
    await screen.findByText('Invalid state');
    expect(fetch.mock.calls.some(([u]) => String(u).includes('/consume'))).toBe(false);
  });
});

function Section() {
  const { section } = useParams();
  return <div data-testid="section">{section}</div>;
}
describe('development preview navigation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 401)));
  });
  it('uses unique destinations that never enter protected app routes', () => {
    const destinations = navigation.map((x) => previewDestination(x.key));
    expect(new Set(destinations).size).toBe(destinations.length);
    expect(destinations.every((x) => x.startsWith('/ui-preview/'))).toBe(true);
  });
  it('marks only the current item active and changes displayed preview', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/ui-preview/dashboard']}>
          <SessionProvider>
            <Routes>
              <Route path="/ui-preview" element={<AppLayout preview />}>
                <Route path=":section" element={<Section />} />
              </Route>
            </Routes>
          </SessionProvider>
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(
      screen.getAllByRole('link').filter((x) => x.getAttribute('aria-current') === 'page'),
    ).toHaveLength(1);
    await userEvent.click(screen.getByRole('link', { name: i18n.t('nav.students') }));
    expect(screen.getByTestId('section')).toHaveTextContent('students');
    expect(
      screen.getAllByRole('link').filter((x) => x.getAttribute('aria-current') === 'page'),
    ).toHaveLength(1);
  });
  it('isolates fictional preview identity and account actions from a real session', async () => {
    await i18n.changeLanguage('en');
    const realOrganizations = [
      { id: 'real-org', name: 'Real Private Organization', slug: 'real', role: 'system_admin' },
    ];
    const fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/v1/me'
        ? response({
            user: { id: 'real-user', email: 'real@example.test' },
            activeOrganizationId: 'real-org',
            role: 'system_admin',
          })
        : response({ organizations: realOrganizations }),
    );
    vi.stubGlobal('fetch', fetch);
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/ui-preview/dashboard']}>
          <SessionProvider>
            <Routes>
              <Route path="/ui-preview" element={<AppLayout preview />}>
                <Route path=":section" element={<Section />} />
              </Route>
            </Routes>
          </SessionProvider>
        </MemoryRouter>
      </I18nextProvider>,
    );
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => String(url) === '/api/v1/me/organizations')).toBe(
        true,
      ),
    );
    expect(screen.getAllByText(i18n.t('showcase.organizationName')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Real Private Organization')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: i18n.t('shell.switchOrg') }));
    await userEvent.click(
      screen.getByRole('option', { name: i18n.t('showcase.secondOrganization') }),
    );
    expect(screen.getAllByText(i18n.t('showcase.secondOrganization')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: i18n.t('shell.account') }));
    expect(screen.getByText('preview.staff@example.test')).toBeInTheDocument();
    expect(screen.getByText(i18n.t('shell.previewAccountAction'))).toBeInTheDocument();
    expect(
      fetch.mock.calls.some(([url]) => String(url) === '/api/v1/me/organizations/switch'),
    ).toBe(false);
    expect(fetch.mock.calls.some(([url]) => String(url) === '/api/v1/auth/logout')).toBe(false);
  });
});

function loginTree() {
  return (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/login']}>
        <SessionProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/app" element={<div>Existing session app</div>} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    </I18nextProvider>
  );
}
describe('initial login presentation', () => {
  beforeEach(() => {
    localStorage.clear();
    void i18n.changeLanguage('en');
    vi.restoreAllMocks();
  });
  it('shows neutral session loading without login or protected content', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );
    render(loginTree());
    expect(screen.getByText(i18n.t('auth.loading'))).toBeInTheDocument();
    expect(screen.queryByLabelText(i18n.t('auth.email'))).not.toBeInTheDocument();
    expect(screen.queryByText('Existing session app')).not.toBeInTheDocument();
  });
  it('routes a restored session without flashing the login form', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(me))
      .mockResolvedValueOnce(response({ organizations }));
    vi.stubGlobal('fetch', fetch);
    render(loginTree());
    expect(screen.queryByLabelText(i18n.t('auth.email'))).not.toBeInTheDocument();
    await screen.findByText('Existing session app');
  });
  it('shows translated service failure and retry instead of the login form', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(loginTree());
    await screen.findByText(i18n.t('auth.service'));
    expect(screen.getByRole('button', { name: i18n.t('auth.retry') })).toBeInTheDocument();
    expect(screen.queryByLabelText(i18n.t('auth.email'))).not.toBeInTheDocument();
  });
});

describe('complete Turkish interface resources', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 401)));
    await i18n.changeLanguage('tr');
  });
  it('localizes navigation, accessibility, forms, tables, status and dialog controls', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/ui-preview/students']}>
          <SessionProvider>
            <Routes>
              <Route path="/ui-preview" element={<AppLayout preview />}>
                <Route path=":section" element={<ShowcasePage />} />
              </Route>
            </Routes>
          </SessionProvider>
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(screen.getByRole('navigation', { name: 'Ana gezinme' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Öğrenciler' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByLabelText(/Program görünen adı/)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Sınıf' })).toBeInTheDocument();
    expect(screen.getAllByText('İncelenmeli').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Onay iletişim kutusunu aç' }));
    expect(screen.getByRole('button', { name: 'İptal' })).toBeInTheDocument();
  });
});
