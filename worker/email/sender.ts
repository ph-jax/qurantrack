import type { Env } from '../types/env';

export interface OrganizationMailSettings {
  email_sender_alias?: string | null;
  email_sender_name: string;
  email_reply_to: string;
}

export interface ResolvedSender {
  fromAlias: string;
  senderName: string;
  replyTo: string;
}

const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmailAddress(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  return normalized.length <= 254 && EMAIL_ADDRESS.test(normalized) ? normalized : null;
}

export function approvedFromAliases(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map(normalizeEmailAddress)
      .filter((alias): alias is string => alias !== null),
  );
}

export function resolveSender(
  env: Pick<Env, 'MAIL_DEFAULT_FROM_ALIAS' | 'MAIL_APPROVED_FROM_ALIASES'>,
  organization: OrganizationMailSettings,
): ResolvedSender {
  const approved = approvedFromAliases(env.MAIL_APPROVED_FROM_ALIASES);
  const defaultAlias = normalizeEmailAddress(env.MAIL_DEFAULT_FROM_ALIAS);
  if (!defaultAlias || !approved.has(defaultAlias)) {
    throw new Error('Mail sender configuration is unavailable');
  }

  const requestedAlias = normalizeEmailAddress(organization.email_sender_alias);
  const fromAlias = requestedAlias && approved.has(requestedAlias) ? requestedAlias : defaultAlias;
  const replyTo = normalizeEmailAddress(organization.email_reply_to);
  const senderName = organization.email_sender_name.trim();
  if (!replyTo || !senderName || senderName.length > 120) {
    throw new Error('Organization mail configuration is invalid');
  }
  return { fromAlias, senderName, replyTo };
}
