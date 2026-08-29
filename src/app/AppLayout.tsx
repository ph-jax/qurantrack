import { useState } from 'react';
import { UserRound } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Menu, MenuItem, Select } from '../components/ui';
import { OrganizationIdentity } from '../components/OrganizationIdentity';
import { useSession, type Role } from '../features/auth/SessionProvider';
import { previewDestination, primaryNavigation, type NavigationGroup } from './navigation';

const navigationGroups: NavigationGroup[] = ['daily', 'administration'];

function Nav({ role, prefix = '/app', label }: { role: Role; prefix?: string; label: string }) {
  const { t } = useTranslation();
  const items = primaryNavigation(role);
  return (
    <nav aria-label={label} className="primary-nav">
      {navigationGroups.map((group) => {
        const grouped = items.filter((item) => item.group === group);
        if (!grouped.length) return null;
        return (
          <div className="nav-group" key={group}>
            <p className="nav-group-label">{t(`nav.${group}`)}</p>
            <div className="nav-group-links">
              {grouped.map(({ key, to, icon: Icon }) => (
                <NavLink
                  end
                  key={key}
                  to={prefix === '/ui-preview' ? previewDestination(key) : to}
                  className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                >
                  <Icon className="size-5 shrink-0" aria-hidden />
                  <span>{t(`nav.${key}`)}</span>
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function AppLayout({ preview = false }: { preview?: boolean }) {
  const { session, logout, switchOrganization } = useSession();
  const { t, i18n } = useTranslation();
  const [actionError, setActionError] = useState(false);
  const [previewOrganizationId, setPreviewOrganizationId] = useState('fictional-1');
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
  const userLabel = displaySession.user.email.split('@')[0] || displaySession.user.email;

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="wordmark">
          <span className="monogram" aria-hidden>
            QT
          </span>
          QuranTrack
        </div>
        <Nav
          label={t('nav.primaryLabel')}
          role={displaySession.role}
          prefix={preview ? '/ui-preview' : '/app'}
        />
        <div className="sidebar-footer">
          {preview && <p className="sidebar-note">{t('shell.previewNotice')}</p>}
          <div className="account-summary">
            <span className="account-avatar" aria-hidden>
              {userLabel.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0">
              <strong className="block truncate text-sm">{userLabel}</strong>
              <span className="block truncate text-xs text-text-secondary">
                {t(`roles.${current.role}`)}
              </span>
            </span>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-organization">
            <OrganizationIdentity name={current.name} />
            <p>{preview ? t('shell.preview') : t(`roles.${current.role}`)}</p>
          </div>
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
              items={displaySession.organizations.map((organization) => ({
                value: organization.id,
                label: organization.name,
              }))}
            />
          )}
          <Select
            label={t('common.language')}
            value={i18n.language}
            onValueChange={(value) => void i18n.changeLanguage(value)}
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
            {!preview && (
              <MenuItem
                onSelect={() => {
                  window.location.href = '/app/security';
                }}
              >
                {t('shell.security')}
              </MenuItem>
            )}
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
    </div>
  );
}
