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
const dataUrl = (type: string, bytes: number[]) =>
  `data:${type};base64,${btoa(String.fromCharCode(...bytes))}`;

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

  it.each([
    ['PNG', dataUrl('image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['JPEG', dataUrl('image/jpeg', [0xff, 0xd8, 0xff])],
    ['WebP', dataUrl('image/webp', [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])],
  ])('accepts a valid %s signature', (_name, logoDataUrl) => {
    expect(validateSettings({ ...valid, logoDataUrl }, env).ok).toBe(true);
  });

  it.each([
    ['SVG', 'data:image/svg+xml;base64,PHN2Zz4='],
    ['unsupported GIF', dataUrl('image/gif', [0x47, 0x49, 0x46, 0x38])],
    ['mismatched MIME and signature', dataUrl('image/png', [0xff, 0xd8, 0xff])],
    ['malformed Base64 characters', 'data:image/png;base64,%%%'],
    ['malformed Base64 padding', 'data:image/png;base64,abcde==='],
    ['empty image', 'data:image/png;base64,'],
    ['oversized encoded value', `data:image/png;base64,${'A'.repeat(200 * 1024)}`],
  ])('rejects %s', (_name, logoDataUrl) => {
    expect(validateSettings({ ...valid, logoDataUrl }, env).ok).toBe(false);
  });
});
