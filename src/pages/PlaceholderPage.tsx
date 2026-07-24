import { Construction } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '../components/ui';
export function PlaceholderPage() {
  const { t } = useTranslation();
  return (
    <Card className="empty-state">
      <span className="empty-icon">
        <Construction />
      </span>
      <h2>{t('shell.next')}</h2>
      <p>{t('shell.nextBody')}</p>
    </Card>
  );
}
