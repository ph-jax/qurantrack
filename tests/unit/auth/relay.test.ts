import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  relayResponseSucceeded,
  relayUrlWithAuth,
  SAFE_RELAY_REJECTION_CODES,
  sendRelayMail,
  submitRelayMail,
  signRelayRequest,
  verifyRelayRequest,
} from '../../../worker/email/relay';

const message = {
  to: 'staff@example.com',
  fromAlias: 'sender@example.com',
  senderName: 'Example Center',
  replyTo: 'reply@example.com',
  subject: 'Sign in',
  text: 'Open QuranTrack.',
};

describe('mail relay protocol', () => {
  afterEach(() => vi.restoreAllMocks());

  it('places timestamp nonce and signature in query parameters for Apps Script', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000123');
    vi.spyOn(Date, 'now').mockReturnValue(1_784_851_200_000);
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      const parsed = new URL(url);
      expect(parsed.searchParams.get('timestamp')).toBe('1784851200');
      expect(parsed.searchParams.get('nonce')).toBe('00000000-0000-4000-8000-000000000123');
      expect(parsed.searchParams.get('signature')).toBe(
        await signRelayRequest(
          'relay-secret',
          '1784851200',
          '00000000-0000-4000-8000-000000000123',
          init.body as string,
        ),
      );
      expect(init.headers).toEqual({ 'content-type': 'application/json' });
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      sendRelayMail(
        {
          MAIL_RELAY_URL: 'https://script.google.com/macros/s/demo/exec',
          MAIL_RELAY_SECRET: 'relay-secret',
        } as never,
        message,
      ),
    ).resolves.toBeUndefined();
  });

  it('treats JSON responses other than ok true as relay failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ok: false, error: 'invalid_recipient' })),
    );
    await expect(
      sendRelayMail(
        {
          MAIL_RELAY_URL: 'https://script.google.com/macros/s/demo/exec',
          MAIL_RELAY_SECRET: 'relay-secret',
        } as never,
        message,
      ),
    ).rejects.toThrow('Mail relay rejected');
    expect(relayResponseSucceeded({ ok: true })).toBe(true);
    expect(relayResponseSucceeded({ ok: false, error: 'expired' })).toBe(false);
  });

  it.each([
    ['timeout', new TypeError('network timeout')],
    ['aborted transport', new DOMException('aborted', 'AbortError')],
  ])('classifies %s as ambiguous', async (_label, error) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(error)),
    );
    await expect(
      submitRelayMail(
        {
          MAIL_RELAY_URL: 'https://script.google.com/macros/s/demo/exec',
          MAIL_RELAY_SECRET: 'relay-secret',
        } as never,
        message,
      ),
    ).resolves.toEqual({ status: 'ambiguous' });
  });

  it('distinguishes valid acceptance, explicit rejection, and malformed protocol responses', async () => {
    const env = {
      MAIL_RELAY_URL: 'https://script.google.com/macros/s/demo/exec',
      MAIL_RELAY_SECRET: 'relay-secret',
    } as never;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ok: true })),
    );
    await expect(submitRelayMail(env, message)).resolves.toEqual({ status: 'accepted' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ok: false, error: 'invalid_recipient' })),
    );
    await expect(submitRelayMail(env, message)).resolves.toEqual({
      status: 'rejected_before_send',
      rejectionCode: 'invalid_recipient',
    });
    for (const error of ['relay_unavailable', 'replay', 'unknown_code']) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({ ok: false, error })),
      );
      await expect(submitRelayMail(env, message)).resolves.toEqual({ status: 'ambiguous' });
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ok: false, error: 'invalid_recipient' }, { status: 500 })),
    );
    await expect(submitRelayMail(env, message)).resolves.toEqual({ status: 'ambiguous' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not-json', { status: 200 })),
    );
    await expect(submitRelayMail(env, message)).resolves.toEqual({ status: 'ambiguous' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ok: false })),
    );
    await expect(submitRelayMail(env, message)).resolves.toEqual({ status: 'ambiguous' });
  });

  it.each(SAFE_RELAY_REJECTION_CODES)(
    'preserves the exact allowlisted pre-send rejection %s',
    async (rejectionCode) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({ ok: false, error: rejectionCode })),
      );
      await expect(
        submitRelayMail(
          {
            MAIL_RELAY_URL: 'https://script.google.com/macros/s/demo/exec',
            MAIL_RELAY_SECRET: 'relay-secret',
          } as never,
          message,
        ),
      ).resolves.toEqual({ status: 'rejected_before_send', rejectionCode });
    },
  );

  it('keeps Apps Script auth parameters reliably outside custom headers', () => {
    const url = relayUrlWithAuth('https://example.com/relay', '10', 'nonce', 'sig');
    expect(url).toBe('https://example.com/relay?timestamp=10&nonce=nonce&signature=sig');
  });

  it('enforces authenticated atomic nonce claiming before message and sender processing', () => {
    const script = readFileSync('apps-script-mail-relay/Code.gs', 'utf8');
    const doPost = script.slice(
      script.indexOf('function doPost'),
      script.indexOf('function claimAuthenticatedNonce_'),
    );
    const orderedCalls = [
      'getStaticRelayConfig_()',
      'constantTimeEqual_',
      'claimAuthenticatedNonce_(nonce)',
      'JSON.parse(body)',
      'validateMessage_(message)',
      'getSenderConfig_(staticConfig.approved)',
      'authorizeSender_',
      'GmailApp.sendEmail',
    ];
    const positions = orderedCalls.map((call) => doPost.indexOf(call));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));

    // A replay or lock failure returns before parsing and can never reach delivery.
    expect(doPost).toContain(
      'const nonceError = claimAuthenticatedNonce_(nonce);\n    if (nonceError) return json_({ ok: false, error: nonceError });',
    );

    const nonceHelper = script.slice(
      script.indexOf('function claimAuthenticatedNonce_'),
      script.indexOf('function getStaticRelayConfig_'),
    );
    expect(nonceHelper).toContain('LockService.getScriptLock()');
    expect(nonceHelper).toContain("if (!lock.tryLock(5000)) return 'relay_busy'");
    expect(nonceHelper.indexOf('try {')).toBeLessThan(nonceHelper.indexOf('cache.get(nonce)'));
    expect(nonceHelper.indexOf('cache.get(nonce)')).toBeLessThan(
      nonceHelper.indexOf('cache.put(nonce'),
    );
    expect(nonceHelper.indexOf('cache.put(nonce')).toBeLessThan(nonceHelper.indexOf('} finally {'));
    expect(nonceHelper.indexOf('} finally {')).toBeLessThan(
      nonceHelper.indexOf('lock.releaseLock()'),
    );

    const staticConfig = script.slice(
      script.indexOf('function getStaticRelayConfig_'),
      script.indexOf('function getSenderConfig_'),
    );
    expect(staticConfig).not.toContain('Session.');
    expect(staticConfig).not.toContain('GmailApp.');
  });

  it('maps optional HTML to htmlBody while retaining required text fallback', () => {
    const script = readFileSync('apps-script-mail-relay/Code.gs', 'utf8');
    expect(script).toContain('options.htmlBody = message.html');
    expect(script).toContain(
      'GmailApp.sendEmail(normalizeEmail_(message.to), message.subject, message.text, options)',
    );
    expect(script).toContain("typeof message.text !== 'string'");
    expect(script).toContain("typeof message.html !== 'string'");
  });

  it('verifies and rejects relay auth for missing, expiry, replay, bad signature, and alias failures', async () => {
    const body = JSON.stringify(message);
    const signature = await signRelayRequest('relay-secret', '1000', 'nonce-1', body);
    await expect(
      verifyRelayRequest({
        secret: 'relay-secret',
        timestamp: '1000',
        nonce: 'nonce-1',
        signature,
        body,
        nowSeconds: 1000,
        nonceSeen: () => false,
        approvedAliases: ['sender@example.com'],
        fromAlias: 'sender@example.com',
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      verifyRelayRequest({
        secret: 'relay-secret',
        timestamp: null,
        nonce: 'nonce-1',
        signature,
        body,
        nowSeconds: 1000,
        nonceSeen: () => false,
        approvedAliases: ['sender@example.com'],
        fromAlias: 'sender@example.com',
      }),
    ).resolves.toMatchObject({ ok: false, error: 'missing_auth' });
    await expect(
      verifyRelayRequest({
        secret: 'relay-secret',
        timestamp: '1000',
        nonce: 'nonce-1',
        signature,
        body,
        nowSeconds: 1401,
        nonceSeen: () => false,
        approvedAliases: ['sender@example.com'],
        fromAlias: 'sender@example.com',
      }),
    ).resolves.toMatchObject({ ok: false, error: 'expired' });
    await expect(
      verifyRelayRequest({
        secret: 'relay-secret',
        timestamp: '1000',
        nonce: 'nonce-1',
        signature,
        body,
        nowSeconds: 1000,
        nonceSeen: () => true,
        approvedAliases: ['sender@example.com'],
        fromAlias: 'sender@example.com',
      }),
    ).resolves.toMatchObject({ ok: false, error: 'replay' });
    await expect(
      verifyRelayRequest({
        secret: 'relay-secret',
        timestamp: '1000',
        nonce: 'nonce-1',
        signature: 'bad',
        body,
        nowSeconds: 1000,
        nonceSeen: () => false,
        approvedAliases: ['sender@example.com'],
        fromAlias: 'sender@example.com',
      }),
    ).resolves.toMatchObject({ ok: false, error: 'bad_signature' });
    await expect(
      verifyRelayRequest({
        secret: 'relay-secret',
        timestamp: '1000',
        nonce: 'nonce-1',
        signature,
        body,
        nowSeconds: 1000,
        nonceSeen: () => false,
        approvedAliases: ['other@example.com'],
        fromAlias: 'sender@example.com',
      }),
    ).resolves.toMatchObject({ ok: false, error: 'alias_not_allowed' });
  });
});
