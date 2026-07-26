import { describe, expect, it } from 'vitest';
import { resolveSender } from '../../../worker/email/sender';

const organization = {
  email_sender_alias: null,
  email_sender_name: 'Example Center',
  email_reply_to: 'help@example.org',
};

describe('sender resolution', () => {
  it('uses the deployment default and keeps From separate from Reply-To', () => {
    expect(
      resolveSender(
        {
          MAIL_DEFAULT_FROM_ALIAS: ' Default@Example.com ',
          MAIL_APPROVED_FROM_ALIASES: 'default@example.com,org@example.com',
        },
        organization,
      ),
    ).toEqual({
      fromAlias: 'default@example.com',
      senderName: 'Example Center',
      replyTo: 'help@example.org',
    });
  });

  it('uses a normalized approved organization override', () => {
    expect(
      resolveSender(
        {
          MAIL_DEFAULT_FROM_ALIAS: 'default@example.com',
          MAIL_APPROVED_FROM_ALIASES: 'default@example.com, org@example.com',
        },
        { ...organization, email_sender_alias: ' ORG@EXAMPLE.COM ' },
      ).fromAlias,
    ).toBe('org@example.com');
  });

  it('falls back for an unapproved or malformed organization override', () => {
    const env = {
      MAIL_DEFAULT_FROM_ALIAS: 'default@example.com',
      MAIL_APPROVED_FROM_ALIASES: 'default@example.com',
    };
    expect(
      resolveSender(env, { ...organization, email_sender_alias: 'other@example.com' }),
    ).toMatchObject({ fromAlias: 'default@example.com' });
    expect(
      resolveSender(env, { ...organization, email_sender_alias: 'not an email' }),
    ).toMatchObject({ fromAlias: 'default@example.com' });
  });

  it.each([
    [{ MAIL_APPROVED_FROM_ALIASES: 'default@example.com' }],
    [{ MAIL_DEFAULT_FROM_ALIAS: 'not-an-email', MAIL_APPROVED_FROM_ALIASES: 'not-an-email' }],
    [{ MAIL_DEFAULT_FROM_ALIAS: 'default@example.com', MAIL_APPROVED_FROM_ALIASES: '' }],
  ])('fails safely for missing or invalid deployment defaults', (env) => {
    expect(() => resolveSender(env, organization)).toThrow(
      'Mail sender configuration is unavailable',
    );
  });
});
