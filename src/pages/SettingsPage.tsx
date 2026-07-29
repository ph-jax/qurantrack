import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, FormField, Input, Spinner } from '../components/ui';
import { OrganizationIdentity } from '../components/OrganizationIdentity';
import { useSession, type Session } from '../features/auth/SessionProvider';
import { prepareLogo } from '../features/settings/image';
import { canEditSettings, type OrganizationSettings } from '../features/settings/types';

const zones = ['UTC', 'Europe/Istanbul', 'Europe/London', 'America/New_York', 'Asia/Dubai'];

export function SettingsPage() {
  const { session, organizationSwitching } = useSession();
  return (
    <SettingsForm
      key={session?.activeOrganizationId}
      session={session}
      organizationSwitching={organizationSwitching}
    />
  );
}

function SettingsForm({
  session,
  organizationSwitching,
}: {
  session: Session | null;
  organizationSwitching: boolean;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState<OrganizationSettings | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'success' | 'error'>(
    'loading',
  );
  const [validation, setValidation] = useState('');
  const saving = useRef(false);
  const editable = canEditSettings(session?.role ?? '');
  const controlsDisabled = !editable || organizationSwitching || state === 'saving';

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/v1/organization/settings', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const body = (await response.json()) as { settings: OrganizationSettings };
        if (!controller.signal.aborted) {
          setValue(body.settings);
          setState('ready');
        }
      })
      .catch(() => !controller.signal.aborted && setState('error'));
    return () => {
      controller.abort();
    };
  }, []);

  const set = <K extends keyof OrganizationSettings>(key: K, next: OrganizationSettings[K]) => {
    setState('ready');
    setValidation('');
    setValue((current) => (current ? { ...current, [key]: next } : current));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!value || !editable || organizationSwitching || saving.current) return;
    saving.current = true;
    setValidation('');
    setState('saving');
    try {
      const response = await fetch('/api/v1/organization/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ ...value, organizationId: value.id }),
      });
      if (!response.ok) {
        if (response.status === 400) setValidation(t('settings.validation'));
        if (response.status === 409) setValidation(t('settings.staleOrganization'));
        throw new Error();
      }
      const body = (await response.json()) as { settings: OrganizationSettings };
      setValue(body.settings);
      setState('success');
    } catch {
      setState('error');
    } finally {
      saving.current = false;
    }
  }

  if (state === 'loading') return <Spinner label={t('settings.loading')} />;
  if (!value)
    return (
      <Alert tone="error" title={t('settings.loadError')}>
        <Button className="mt-3" onClick={() => location.reload()}>
          {t('settings.retry')}
        </Button>
      </Alert>
    );

  const logo = value.logoDataUrl || value.logoUrl || undefined;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="page-header">
        <div>
          <h2>{t('settings.title')}</h2>
          <p>{t('settings.description')}</p>
        </div>
      </div>
      {state === 'success' && <Alert tone="success" title={t('settings.saved')} />}
      {state === 'error' && <Alert tone="error" title={validation || t('settings.saveError')} />}
      {!editable && <Alert tone="warning" title={t('settings.readOnly')} />}
      <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <div className="space-y-5">
          <Card className="grid min-w-0 gap-4 sm:grid-cols-2">
            <h3 className="text-lg font-bold sm:col-span-2">{t('settings.branding')}</h3>
            <Field id="org-name" label={t('settings.name')}>
              <Input
                id="org-name"
                required
                maxLength={120}
                disabled={controlsDisabled}
                value={value.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </Field>
            <Field id="color" label={t('settings.color')}>
              <Input
                id="color"
                required
                pattern="#[0-9A-Fa-f]{6}"
                disabled={controlsDisabled}
                value={value.primaryColor}
                onChange={(e) => set('primaryColor', e.target.value)}
              />
            </Field>
            <Field id="logo-url" label={t('settings.logoUrl')}>
              <Input
                id="logo-url"
                type="url"
                placeholder="https://"
                disabled={controlsDisabled}
                value={value.logoUrl ?? ''}
                onChange={(e) => set('logoUrl', e.target.value || null)}
              />
            </Field>
            <Field id="logo-file" label={t('settings.upload')}>
              <Input
                id="logo-file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={controlsDisabled}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    void prepareLogo(file)
                      .then((data) => {
                        set('logoDataUrl', data);
                        setValidation('');
                      })
                      .catch(() => {
                        setValidation(t('settings.imageError'));
                        setState('error');
                      });
                }}
              />
            </Field>
            {value.logoDataUrl && (
              <Button
                className="sm:col-span-2"
                type="button"
                variant="secondary"
                disabled={controlsDisabled}
                onClick={() => set('logoDataUrl', null)}
              >
                {t('settings.removeLogo')}
              </Button>
            )}
          </Card>
          <Card className="grid min-w-0 gap-4 sm:grid-cols-2">
            <h3 className="text-lg font-bold sm:col-span-2">{t('settings.regional')}</h3>
            <Field id="locale" label={t('settings.language')}>
              <select
                id="locale"
                className="settings-select"
                disabled={controlsDisabled}
                value={value.defaultLocale}
                onChange={(e) => set('defaultLocale', e.target.value as 'en' | 'tr')}
              >
                <option value="en">English</option>
                <option value="tr">Türkçe</option>
              </select>
            </Field>
            <Field id="timezone" label={t('settings.timezone')}>
              <Input
                id="timezone"
                required
                list="timezones"
                disabled={controlsDisabled}
                value={value.timezone}
                onChange={(e) => set('timezone', e.target.value)}
              />
              <datalist id="timezones">
                {zones.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
            </Field>
          </Card>
          <Card className="grid min-w-0 gap-4 sm:grid-cols-2">
            <h3 className="text-lg font-bold sm:col-span-2">{t('settings.email')}</h3>
            <Field id="sender" label={t('settings.senderName')}>
              <Input
                id="sender"
                required
                maxLength={120}
                disabled={controlsDisabled}
                value={value.emailSenderName}
                onChange={(e) => set('emailSenderName', e.target.value)}
              />
            </Field>
            <Field id="reply" label={t('settings.replyTo')}>
              <Input
                id="reply"
                required
                type="email"
                disabled={controlsDisabled}
                value={value.emailReplyTo}
                onChange={(e) => set('emailReplyTo', e.target.value)}
              />
            </Field>
            <Field id="alias" label={t('settings.alias')} description={t('settings.aliasHelp')}>
              <Input
                id="alias"
                type="email"
                disabled={controlsDisabled}
                value={value.emailSenderAlias ?? ''}
                onChange={(e) => set('emailSenderAlias', e.target.value || null)}
              />
            </Field>
          </Card>
          <Card className="grid min-w-0 gap-4 sm:grid-cols-2">
            <h3 className="text-lg font-bold sm:col-span-2">{t('settings.reports')}</h3>
            <Field id="report-title" label={t('settings.reportTitle')}>
              <Input
                id="report-title"
                required
                maxLength={160}
                disabled={controlsDisabled}
                value={value.reportTitle}
                onChange={(e) => set('reportTitle', e.target.value)}
              />
            </Field>
            <Field id="missing" label={t('settings.missingDays')}>
              <Input
                id="missing"
                required
                type="number"
                min={1}
                max={365}
                disabled={controlsDisabled}
                value={value.missingUpdateDays}
                onChange={(e) => set('missingUpdateDays', Number(e.target.value))}
              />
            </Field>
            <Field id="lifetime" label={t('settings.guardianDays')}>
              <Input
                id="lifetime"
                required
                type="number"
                min={1}
                max={365}
                disabled={controlsDisabled}
                value={value.guardianTokenLifetimeDays}
                onChange={(e) => set('guardianTokenLifetimeDays', Number(e.target.value))}
              />
            </Field>
          </Card>
          <Button type="submit" loading={state === 'saving'} disabled={controlsDisabled}>
            {t('settings.save')}
          </Button>
        </div>
        <Card className="h-fit min-w-0 lg:sticky lg:top-24">
          <p className="eyebrow">{t('settings.preview')}</p>
          <div
            className="mt-4 rounded-lg border border-border p-4"
            style={{
              borderTop: `6px solid ${/^#[0-9a-f]{6}$/i.test(value.primaryColor) ? value.primaryColor : '#0f766e'}`,
            }}
          >
            <OrganizationIdentity
              name={value.name || t('settings.name')}
              logoUrl={logo}
              accent={value.primaryColor}
            />
            <h4 className="mt-5 break-words text-lg font-bold">{value.reportTitle}</h4>
            <p className="mt-2 text-sm text-text-secondary">{value.emailSenderName}</p>
          </div>
        </Card>
      </form>
    </div>
  );
}

function Field({
  id,
  label,
  description,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <FormField id={id} label={label} description={description}>
      {children}
    </FormField>
  );
}
