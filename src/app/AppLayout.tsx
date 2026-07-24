import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu as MenuIcon, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Menu, MenuItem, Select, Sheet } from '../components/ui';
import { OrganizationIdentity } from '../components/OrganizationIdentity';
import { useSession, type Role } from '../features/auth/SessionProvider';
import { visibleNavigation } from './navigation';

function Nav({
  close,
  role,
  prefix = '/app',
}: {
  close?: () => void;
  role: Role;
  prefix?: string;
}) {
  const { t } = useTranslation();
  return (
    <nav aria-label="Primary navigation" className="mt-5 space-y-1">
      {visibleNavigation(role).map(({ key, to, icon: Icon }) => (
        <NavLink
          end
          key={key}
          to={prefix === '/ui-preview' ? prefix : to}
          onClick={close}
          className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
        >
          <Icon className="size-5 shrink-0" aria-hidden />
          <span>{t(`nav.${key}`)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
export function AppLayout({ preview = false }: { preview?: boolean }) {
  const { session, logout, switchOrganization } = useSession();
  const { t, i18n } = useTranslation();
  const [mobile, setMobile] = useState(false);
  const location = useLocation();
  if (!session && !preview) return null;
  const fake = session ?? {
    user: { email: 'staff@example.test' },
    activeOrganizationId: 'fictional-1',
    role: 'organization_admin' as const,
    organizations: [
      {
        id: 'fictional-1',
        name: t('showcase.organizationName'),
        slug: 'fictional',
        role: 'organization_admin' as const,
      },
      {
        id: 'fictional-2',
        name: 'Second Fictional Learning Center',
        slug: 'second',
        role: 'organization_admin' as const,
      },
    ],
  };
  const current =
    fake.organizations.find((o) => o.id === fake.activeOrganizationId) ?? fake.organizations[0];
  const key = location.pathname.split('/').pop() || 'dashboard';
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="wordmark">
          <span className="monogram" aria-hidden>
            QT
          </span>
          QuranTrack
        </div>
        <div className="mt-6">
          <p className="eyebrow">{t('shell.organization')}</p>
          <OrganizationIdentity name={current.name} />
          {fake.organizations.length > 1 && (
            <Select
              label={t('shell.switchOrg')}
              value={current.id}
              onValueChange={(id) => void switchOrganization(id)}
              items={fake.organizations.map((o) => ({ value: o.id, label: o.name }))}
            />
          )}
        </div>
        <Nav role={fake.role} prefix={preview ? '/ui-preview' : '/app'} />
        <p className="sidebar-note">{t('shell.phase')}</p>
      </aside>
      <div className="min-w-0">
        <header className="topbar">
          <Button
            className="lg:hidden"
            variant="ghost"
            size="icon"
            aria-label={t('nav.more')}
            onClick={() => setMobile(true)}
          >
            <MenuIcon className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">{preview && t('shell.preview')}</p>
            <h1 className="truncate text-xl font-bold">
              {t(`nav.${key}`, { defaultValue: t('dashboard.title') })}
            </h1>
          </div>
          <Select
            label={t('common.language')}
            value={i18n.language}
            onValueChange={(v) => void i18n.changeLanguage(v)}
            items={[
              { value: 'en', label: 'EN' },
              { value: 'tr', label: 'TR' },
            ]}
          />
          <Menu
            label={t('shell.account')}
            trigger={
              <Button variant="ghost" size="icon" aria-label={t('shell.account')}>
                <UserRound className="size-5" />
              </Button>
            }
          >
            <MenuItem>{fake.user.email}</MenuItem>
            <MenuItem onSelect={() => void logout()}>{t('shell.logout')}</MenuItem>
          </Menu>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
      <Sheet open={mobile} onOpenChange={setMobile} title="QuranTrack">
        <OrganizationIdentity name={current.name} />
        <Nav
          role={fake.role}
          prefix={preview ? '/ui-preview' : '/app'}
          close={() => setMobile(false)}
        />
      </Sheet>
    </div>
  );
}
