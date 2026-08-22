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

export const RELAY_DIAGNOSTIC_STAGES = [
  'relay_config',
  'request_build',
  'signing',
  'outbound_fetch',
  'response_read',
  'response_parse',
] as const;
export type RelayDiagnosticStage = (typeof RELAY_DIAGNOSTIC_STAGES)[number];
export type RelayErrorCategory =
  | 'missing_binding'
  | 'invalid_url'
  | 'crypto_failure'
  | 'transport_failure'
  | 'timeout'
  | 'http_failure'
  | 'malformed_response'
  | 'unknown';

export interface RelayDiagnosticContext {
  requestId?: string;
  notificationId?: string;
  attemptId?: string;
}

function isAuthorizedAppsScriptRelayUrl(value: URL): boolean {
  return (
    value.protocol === 'https:' &&
    value.hostname === 'script.google.com' &&
    value.port === '' &&
    value.username === '' &&
    value.password === '' &&
    value.hash === '' &&
    value.search === '' &&
    /^\/macros\/s\/[^/]+\/exec$/.test(value.pathname)
  );
}

function recordRelayDiagnostic(
  stage: RelayDiagnosticStage,
  category: RelayErrorCategory,
  context: RelayDiagnosticContext,
) {
  // This deliberately uses an allowlisted object. Never add the exception, URL, message, or
  // request/response data: relay diagnostics can be inspected by operators with broad access.
  console.error('mail_relay_failure', {
    stage,
    category,
    ...(context.requestId ? { requestId: context.requestId } : {}),
    ...(context.notificationId ? { notificationId: context.notificationId } : {}),
    ...(context.attemptId ? { attemptId: context.attemptId } : {}),
  });
}

function ambiguousFailure(
  stage: RelayDiagnosticStage,
  category: RelayErrorCategory,
  context: RelayDiagnosticContext,
): RelaySubmissionResult {
  recordRelayDiagnostic(stage, category, context);
  return { status: 'ambiguous' };
}

export async function submitRelayMail(
  env: Env,
  message: RelayMessage,
  context: RelayDiagnosticContext = {},
): Promise<RelaySubmissionResult> {
  let url: string;
  let secret: string;
  try {
    url = requireSecret(env.MAIL_RELAY_URL, 'MAIL_RELAY_URL');
    secret = requireSecret(env.MAIL_RELAY_SECRET, 'MAIL_RELAY_SECRET');
  } catch {
    return ambiguousFailure('relay_config', 'missing_binding', context);
  }
  try {
    // Validate the complete trusted endpoint before building or signing attacker-controlled data.
    // The binding must be the canonical HTTPS Apps Script Web App /exec URL.
    const parsedUrl = new URL(url);
    if (!isAuthorizedAppsScriptRelayUrl(parsedUrl)) {
      return ambiguousFailure('relay_config', 'invalid_url', context);
    }
    url = parsedUrl.toString();
  } catch {
    return ambiguousFailure('relay_config', 'invalid_url', context);
  }
  let timestamp: string;
  let nonce: string;
  let body: string;
  try {
    timestamp = String(Math.floor(Date.now() / 1000));
    nonce = crypto.randomUUID();
    body = JSON.stringify(message);
  } catch {
    return ambiguousFailure('request_build', 'unknown', context);
  }
  let signature: string;
  try {
    signature = await signRelayRequest(secret, timestamp, nonce, body);
  } catch {
    return ambiguousFailure('signing', 'crypto_failure', context);
  }
  let authenticatedUrl: string;
  try {
    authenticatedUrl = relayUrlWithAuth(url, timestamp, nonce, signature);
  } catch {
    return ambiguousFailure('request_build', 'invalid_url', context);
  }
  let response: Response;
  try {
    response = await fetch(authenticatedUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
  } catch (error) {
    return ambiguousFailure(
      'outbound_fetch',
      error instanceof DOMException && error.name === 'AbortError'
        ? 'timeout'
        : 'transport_failure',
      context,
    );
  }
  let responseBody: string;
  try {
    responseBody = await response.text();
  } catch {
    return ambiguousFailure('response_read', 'transport_failure', context);
  }
  if (!response.ok) {
    return ambiguousFailure('response_read', 'http_failure', context);
  }
  let json: RelayResponse;
  try {
    json = JSON.parse(responseBody) as RelayResponse;
  } catch {
    return ambiguousFailure('response_parse', 'malformed_response', context);
  }
  if (json?.ok === true) return { status: 'accepted' };
  if (json?.ok === false && PRE_SEND_REJECTION_CODES.has(json.error ?? ''))
    return {
      status: 'rejected_before_send',
      rejectionCode: json.error as SafeRelayRejectionCode,
    };
  return ambiguousFailure('response_parse', 'malformed_response', context);
}

export async function sendRelayMail(env: Env, message: RelayMessage): Promise<void> {
  const result = await submitRelayMail(env, message);
  if (result.status !== 'accepted') {
    throw new Error('Mail relay rejected the message');
  }
}
