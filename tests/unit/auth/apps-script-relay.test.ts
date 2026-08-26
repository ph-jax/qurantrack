import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { relaySigningPayload, signRelayRequest } from '../../../worker/email/relay';

type RelayHelpers = {
  buildGmailOptions_: (
    message: { replyTo: string; senderName: string; html?: string },
    sender: string,
    config: { primarySender: string },
  ) => Record<string, string>;
  classifyRelayError_: (error: unknown) => string;
};

const source = readFileSync(`${process.cwd()}/apps-script-mail-relay/Code.gs`, 'utf8');
const helpers = Function(
  `${source}; return { buildGmailOptions_, classifyRelayError_ };`,
)() as RelayHelpers;

describe('Apps Script relay privacy-safe diagnostics', () => {
  it('matches Worker and Apps Script UTF-8 HMAC signatures for Turkish Unicode', async () => {
    const timestamp = '1787745600';
    const nonce = 'unicode-test-nonce';
    const secret = 'deterministic-test-secret';
    const body = JSON.stringify({ subject: 'Türkçe ğüşöçıİ', text: 'Türkçe ğüşöçıİ' });
    const appsScriptUtf8Signature = createHmac('sha256', Buffer.from(secret, 'utf8'))
      .update(Buffer.from(relaySigningPayload(timestamp, nonce, body), 'utf8'))
      .digest('base64url');

    await expect(signRelayRequest(secret, timestamp, nonce, body)).resolves.toBe(
      appsScriptUtf8Signature,
    );
    expect(source).toMatch(
      /computeHmacSha256Signature\([\s\S]*?staticConfig\.secret,[\s\S]*?Utilities\.Charset\.UTF_8[\s\S]*?\)/,
    );
  });

  it.each([
    ['Authorization is required', 'gmail_authorization'],
    ['Service invoked too many times: email quota', 'gmail_quota'],
    ['Too many requests; try again later', 'gmail_rate_limit'],
    ['Invalid sender alias', 'gmail_sender'],
    ['Invalid recipient address', 'gmail_recipient'],
    ['Invalid argument', 'gmail_invalid_argument'],
    ['Service unavailable', 'gmail_service_unavailable'],
    ['Sensitive unexpected detail', 'unknown'],
  ])('maps an exception to the safe allowlist', (message, category) => {
    expect(helpers.classifyRelayError_(new Error(message))).toBe(category);
  });

  it('constructs identical alias, reply-to, display-name, and HTML options', () => {
    expect(
      helpers.buildGmailOptions_(
        {
          replyTo: ' Reply@Example.com ',
          senderName: ' QuranTrack ',
          html: '<p>safe fixture</p>',
        },
        'alias@example.com',
        { primarySender: 'owner@example.com' },
      ),
    ).toEqual({
      replyTo: 'reply@example.com',
      name: 'QuranTrack',
      htmlBody: '<p>safe fixture</p>',
      from: 'alias@example.com',
    });
  });
});
