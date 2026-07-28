export type OrganizationSettings = {
  id: string;
  name: string;
  primaryColor: string;
  defaultLocale: 'en' | 'tr';
  timezone: string;
  emailSenderName: string;
  emailReplyTo: string;
  emailSenderAlias: string | null;
  reportTitle: string;
  missingUpdateDays: number;
  guardianTokenLifetimeDays: number;
  logoUrl: string | null;
  logoDataUrl: string | null;
  updatedAt: string;
};

export const canEditSettings = (role: string) =>
  role === 'system_admin' || role === 'organization_admin';
