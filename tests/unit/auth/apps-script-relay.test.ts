import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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
