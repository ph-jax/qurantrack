import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu as MenuIcon, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Menu, MenuItem, Select, Sheet } from '../components/ui';
import { OrganizationIdentity } from '../components/OrganizationIdentity';
import { useSession, type Role } from '../features/auth/SessionProvider';
import { previewDestination, visibleNavigation } from './navigation';

function Nav({
  close,
  role,
  prefix = '/app',
  label,
}: {
  close?: () => void;
  role: Role;
  prefix?: string;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <nav aria-label={label} className="mt-5 space-y-1">
      {visibleNavigation(role).map(({ key, to, icon: Icon }) => (
        <NavLink
          end
          key={key}
          to={prefix === '/ui-preview' ? previewDestination(key) : to}
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
  const [actionError, setActionError] = useState(false);
  const [previewOrganizationId, setPreviewOrganizationId] = useState('fictional-1');
  const location = useLocation();
  if (!session && !preview) return null;
  const previewSession = {
    user: { id: 'fictional-user', email: 'preview.staff@example.test' },
    activeOrganizationId: previewOrganizationId,
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
        name: t('showcase.secondOrganization'),
        slug: 'second',
        role: 'organization_admin' as const,
      },
    ],
  };
  const displaySession = preview ? previewSession : session!;
  const current =
    displaySession.organizations.find(
      (organization) => organization.id === displaySession.activeOrganizationId,
    ) ?? displaySession.organizations[0];
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
          {displaySession.organizations.length > 1 && (
            <Select
              label={t('shell.switchOrg')}
              value={current.id}
              onValueChange={(id) => {
                setActionError(false);
                if (preview) {
                  setPreviewOrganizationId(id);
                  return;
                }
                void switchOrganization(id).catch(() => setActionError(true));
              }}
              items={displaySession.organizations.map((o) => ({ value: o.id, label: o.name }))}
            />
          )}
          <p className="mt-1 text-xs text-text-secondary">{t(`roles.${current.role}`)}</p>
        </div>
        <Nav
          label={t('nav.primaryLabel')}
          role={displaySession.role}
          prefix={preview ? '/ui-preview' : '/app'}
        />
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
            <MenuItem>{displaySession.user.email}</MenuItem>
            {preview ? (
              <MenuItem>{t('shell.previewAccountAction')}</MenuItem>
            ) : (
              <MenuItem
                onSelect={() => {
                  setActionError(false);
                  void logout().catch(() => setActionError(true));
                }}
              >
                {t('shell.logout')}
              </MenuItem>
            )}
          </Menu>
        </header>
        <main className="content">
          {actionError && <Alert tone="error" title={t('shell.actionError')} />}
          <Outlet />
        </main>
      </div>
      <Sheet open={mobile} onOpenChange={setMobile} title="QuranTrack" closeLabel={t('nav.close')}>
        <OrganizationIdentity name={current.name} />
        <Nav
          label={t('nav.primaryLabel')}
          role={displaySession.role}
          prefix={preview ? '/ui-preview' : '/app'}
          close={() => setMobile(false)}
        />
      </Sheet>
    </div>
  );
}
