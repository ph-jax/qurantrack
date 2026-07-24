import type { Env } from '../types/env';
import { hmacSha256Base64Url } from '../../shared/auth/crypto';
import { requireSecret } from '../auth/config';

export interface RelayMessage {
  to: string;
  fromAlias: string;
  replyTo: string;
  subject: string;
  text: string;
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

export async function sendRelayMail(env: Env, message: RelayMessage): Promise<void> {
  const url = requireSecret(env.MAIL_RELAY_URL, 'MAIL_RELAY_URL');
  const secret = requireSecret(env.MAIL_RELAY_SECRET, 'MAIL_RELAY_SECRET');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const body = JSON.stringify(message);
  const signature = await signRelayRequest(secret, timestamp, nonce, body);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-qurantrack-timestamp': timestamp,
      'x-qurantrack-nonce': nonce,
      'x-qurantrack-signature': signature,
    },
    body,
  });
  if (!response.ok) throw new Error(`Mail relay failed with status ${response.status}`);
}
