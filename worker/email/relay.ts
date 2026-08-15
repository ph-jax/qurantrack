import type { Env } from '../types/env';
import { hmacSha256Base64Url, timingSafeEqual } from '../../shared/auth/crypto';
import { requireSecret } from '../auth/config';

export interface RelayMessage {
  to: string;
  fromAlias: string;
  senderName: string;
  replyTo: string;
  subject: string;
  text: string;
  html?: string;
}

export interface RelayResponse {
  ok?: boolean;
  error?: string;
}

export function relaySigningPayload(timestamp: string, nonce: string, body: string): string {
  return `${timestamp}.${nonce}.${body}`;
}

export async function signRelayRequest(
  secret: string,
  timestamp: string,
  nonce: string,
  body: string,
) {
  return hmacSha256Base64Url(secret, relaySigningPayload(timestamp, nonce, body));
}

export function relayUrlWithAuth(url: string, timestamp: string, nonce: string, signature: string) {
  const relayUrl = new URL(url);
  relayUrl.searchParams.set('timestamp', timestamp);
  relayUrl.searchParams.set('nonce', nonce);
  relayUrl.searchParams.set('signature', signature);
  return relayUrl.toString();
}

export interface RelayVerificationInput {
  secret: string;
  timestamp: string | null;
  nonce: string | null;
  signature: string | null;
  body: string;
  nowSeconds: number;
  nonceSeen: (nonce: string) => boolean;
  approvedAliases: string[];
  fromAlias: string;
  maxAgeSeconds?: number;
}

export async function verifyRelayRequest(input: RelayVerificationInput): Promise<RelayResponse> {
  if (!input.timestamp || !input.nonce || !input.signature || !input.body) {
    return { ok: false, error: 'missing_auth' };
  }
  const timestamp = Number(input.timestamp);
  if (!Number.isFinite(timestamp)) return { ok: false, error: 'missing_auth' };
  if (Math.abs(input.nowSeconds - timestamp) > (input.maxAgeSeconds ?? 300)) {
    return { ok: false, error: 'expired' };
  }
  if (input.nonceSeen(input.nonce)) return { ok: false, error: 'replay' };
  const expected = await signRelayRequest(input.secret, input.timestamp, input.nonce, input.body);
  if (!(await timingSafeEqual(expected, input.signature)))
    return { ok: false, error: 'bad_signature' };
  if (!input.approvedAliases.includes(input.fromAlias))
    return { ok: false, error: 'alias_not_allowed' };
  return { ok: true };
}

export function relayResponseSucceeded(value: RelayResponse): boolean {
  return value.ok === true;
}

export type RelaySubmissionResult =
  | { status: 'accepted' }
  | { status: 'rejected_before_send'; rejectionCode: SafeRelayRejectionCode }
  | { status: 'ambiguous' };

// Only errors returned before GmailApp.sendEmail is reached are safe to retry. Replay is excluded:
// it may describe an earlier request whose delivery result is unknown.
export const SAFE_RELAY_REJECTION_CODES = [
  'missing_auth',
  'expired',
  'invalid_nonce',
  'bad_signature',
  'malformed_json',
  'invalid_message',
  'invalid_recipient',
  'invalid_from',
  'invalid_reply_to',
  'invalid_sender_name',
  'invalid_subject',
  'invalid_body',
  'invalid_html_body',
  'alias_not_allowed',
] as const;
export type SafeRelayRejectionCode = (typeof SAFE_RELAY_REJECTION_CODES)[number];
const PRE_SEND_REJECTION_CODES = new Set<string>(SAFE_RELAY_REJECTION_CODES);

export async function submitRelayMail(
  env: Env,
  message: RelayMessage,
): Promise<RelaySubmissionResult> {
  const url = requireSecret(env.MAIL_RELAY_URL, 'MAIL_RELAY_URL');
  const secret = requireSecret(env.MAIL_RELAY_SECRET, 'MAIL_RELAY_SECRET');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const body = JSON.stringify(message);
  const signature = await signRelayRequest(secret, timestamp, nonce, body);
  let response: Response;
  try {
    response = await fetch(relayUrlWithAuth(url, timestamp, nonce, signature), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
  } catch {
    return { status: 'ambiguous' };
  }
  const json = (await response.json().catch(() => null)) as RelayResponse | null;
  if (response.ok && json?.ok === true) return { status: 'accepted' };
  if (response.ok && json?.ok === false && PRE_SEND_REJECTION_CODES.has(json.error ?? ''))
    return {
      status: 'rejected_before_send',
      rejectionCode: json.error as SafeRelayRejectionCode,
    };
  return { status: 'ambiguous' };
}

export async function sendRelayMail(env: Env, message: RelayMessage): Promise<void> {
  const result = await submitRelayMail(env, message);
  if (result.status !== 'accepted') {
    throw new Error('Mail relay rejected the message');
  }
}
