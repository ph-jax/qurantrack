import { Link } from 'react-router-dom';
import { Bell, BookOpen, Settings, Users, UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const destinations = [
  { key: 'teachers', icon: Users },
  { key: 'families', icon: UsersRound },
  { key: 'program', icon: BookOpen },
  { key: 'notifications', icon: Bell },
  { key: 'settings', icon: Settings },
] as const;

export function ManagePage() {
  const { t } = useTranslation();
  return (
    <div className="workspace-page">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{t('nav.administration')}</p>
          <h1>{t('manage.title')}</h1>
          <p>{t('manage.description')}</p>
        </div>
      </header>
      <div className="manage-grid">
        {destinations.map(({ key, icon: Icon }) => (
          <Link className="manage-link" key={key} to={`/app/${key}`}>
            <span className="manage-icon" aria-hidden>
              <Icon />
            </span>
            <span>
              <strong>{t(`nav.${key}`)}</strong>
              <span>{t(`manage.items.${key}`)}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
