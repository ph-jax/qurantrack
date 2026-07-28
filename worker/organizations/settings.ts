import { z } from 'zod';
import type { Env } from '../types/env';
import { approvedFromAliases, normalizeEmailAddress } from '../email/sender';

export const MAX_LOGO_DATA_URL_BYTES = 200 * 1024;
const imagePrefix = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function validImage(value: string) {
  if (new TextEncoder().encode(value).byteLength > MAX_LOGO_DATA_URL_BYTES) return false;
  const match = imagePrefix.exec(value);
  if (!match) return false;
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(match[3]), (character) => character.charCodeAt(0));
  } catch {
    return false;
  }
  if (match[2] === 'png')
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (byte, index) => bytes[index] === byte,
    );
  if (match[2] === 'jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

const optionalEmail = z
  .preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
    z.union([z.literal(''), z.email().max(254)]),
  )
  .transform((v) => v || null);
export const organizationSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  defaultLocale: z.enum(['en', 'tr']),
  timezone: z.string().min(1).max(100).refine(isTimeZone),
  emailSenderName: z.string().trim().min(1).max(120),
  emailReplyTo: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
    z.email().max(254),
  ),
  emailSenderAlias: optionalEmail,
  reportTitle: z.string().trim().min(1).max(160),
  missingUpdateDays: z.number().int().min(1).max(365),
  guardianTokenLifetimeDays: z.number().int().min(1).max(365),
  logoUrl: z
    .union([z.literal(''), z.url().startsWith('https://').max(2048)])
    .transform((v) => v || null),
  logoDataUrl: z.union([z.null(), z.string().refine(validImage)]),
});
export type OrganizationSettingsInput = z.infer<typeof organizationSettingsSchema>;

export interface OrganizationSettings extends OrganizationSettingsInput {
  id: string;
  updatedAt: string;
}

interface Row {
  id: string;
  name: string;
  primary_color: string;
  default_locale: 'en' | 'tr';
  timezone: string;
  email_sender_name: string;
  email_reply_to: string;
  email_sender_alias: string | null;
  report_title: string;
  missing_update_days: number;
  guardian_token_lifetime_days: number;
  logo_url: string | null;
  logo_data_url: string | null;
  updated_at: string;
}

const columns = `id,name,primary_color,default_locale,timezone,email_sender_name,email_reply_to,email_sender_alias,report_title,missing_update_days,guardian_token_lifetime_days,logo_url,logo_data_url,updated_at`;
function map(row: Row): OrganizationSettings {
  return {
    id: row.id,
    name: row.name,
    primaryColor: row.primary_color,
    defaultLocale: row.default_locale,
    timezone: row.timezone,
    emailSenderName: row.email_sender_name,
    emailReplyTo: row.email_reply_to,
    emailSenderAlias: row.email_sender_alias,
    reportTitle: row.report_title,
    missingUpdateDays: row.missing_update_days,
    guardianTokenLifetimeDays: row.guardian_token_lifetime_days,
    logoUrl: row.logo_url,
    logoDataUrl: row.logo_data_url,
    updatedAt: row.updated_at,
  };
}

export async function getOrganizationSettings(db: D1Database, trustedOrganizationId: string) {
  const row = await db
    .prepare(`SELECT ${columns} FROM organizations WHERE id = ? AND active = 1 LIMIT 1`)
    .bind(trustedOrganizationId)
    .first<Row>();
  return row ? map(row) : null;
}

export async function updateOrganizationSettings(
  db: D1Database,
  trustedOrganizationId: string,
  value: OrganizationSettingsInput,
) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE organizations SET name=?,primary_color=?,default_locale=?,timezone=?,email_sender_name=?,email_reply_to=?,email_sender_alias=?,report_title=?,missing_update_days=?,guardian_token_lifetime_days=?,logo_url=?,logo_data_url=?,updated_at=? WHERE id=? AND active=1`,
    )
    .bind(
      value.name,
      value.primaryColor.toLowerCase(),
      value.defaultLocale,
      value.timezone,
      value.emailSenderName,
      value.emailReplyTo,
      value.emailSenderAlias,
      value.reportTitle,
      value.missingUpdateDays,
      value.guardianTokenLifetimeDays,
      value.logoUrl,
      value.logoDataUrl,
      now,
      trustedOrganizationId,
    )
    .run();
  return getOrganizationSettings(db, trustedOrganizationId);
}

export function validateSettings(value: unknown, env: Pick<Env, 'MAIL_APPROVED_FROM_ALIASES'>) {
  const parsed = organizationSettingsSchema.safeParse(value);
  if (!parsed.success) return { ok: false as const };
  const alias = normalizeEmailAddress(parsed.data.emailSenderAlias);
  if (
    parsed.data.emailSenderAlias &&
    (!alias || !approvedFromAliases(env.MAIL_APPROVED_FROM_ALIASES).has(alias))
  )
    return { ok: false as const };
  return { ok: true as const, data: { ...parsed.data, emailSenderAlias: alias } };
}
