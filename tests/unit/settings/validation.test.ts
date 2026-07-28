import { describe, expect, it } from 'vitest';
import { validateSettings } from '../../../worker/organizations/settings';

const valid = {
  name: 'Example Center',
  primaryColor: '#0F766E',
  defaultLocale: 'en',
  timezone: 'Europe/Istanbul',
  emailSenderName: 'Example Center',
  emailReplyTo: 'reply@example.test',
  emailSenderAlias: '',
  reportTitle: 'Progress Update',
  missingUpdateDays: 14,
  guardianTokenLifetimeDays: 30,
  logoUrl: 'https://example.test/logo.png',
  logoDataUrl: null,
};
const env = { MAIL_APPROVED_FROM_ALIASES: 'approved@example.test' };

describe('organization settings validation', () => {
  it('accepts supported settings and normalizes an approved alias', () => {
    expect(
      validateSettings({ ...valid, emailSenderAlias: ' APPROVED@example.test ' }, env),
    ).toMatchObject({ ok: true, data: { emailSenderAlias: 'approved@example.test' } });
  });

  it.each([
    { primaryColor: 'red' },
    { defaultLocale: 'de' },
    { timezone: 'Not/AZone' },
    { logoUrl: 'http://example.test/logo.png' },
    { emailReplyTo: 'invalid' },
    { missingUpdateDays: 0 },
    { guardianTokenLifetimeDays: 366 },
    { emailSenderAlias: 'unapproved@example.test' },
  ])('rejects invalid settings without producing an update value: %o', (change) => {
    expect(validateSettings({ ...valid, ...change }, env)).toEqual({ ok: false });
  });

  it('checks the declared image type and file signature and rejects SVG', () => {
    const png = `data:image/png;base64,${btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))}`;
    expect(validateSettings({ ...valid, logoDataUrl: png }, env).ok).toBe(true);
    expect(
      validateSettings({ ...valid, logoDataUrl: 'data:image/png;base64,PHN2Zz4=' }, env).ok,
    ).toBe(false);
    expect(
      validateSettings({ ...valid, logoDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }, env).ok,
    ).toBe(false);
  });
});
