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
const validRelayUrl = 'https://script.google.com/macros/s/test-deployment/exec';

describe('mail relay protocol', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ['missing URL binding', {}, 'relay_config', 'missing_binding'],
    [
      'missing secret binding',
      { MAIL_RELAY_URL: validRelayUrl },
      'relay_config',
      'missing_binding',
    ],
    [
      'invalid URL binding',
      { MAIL_RELAY_URL: 'not a relay URL', MAIL_RELAY_SECRET: 'relay-secret' },
      'relay_config',
      'invalid_url',
    ],
  ])('diagnoses %s without fetching', async (_label, env, stage, category) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitRelayMail(env as never, message, {
        requestId: 'req-safe',
        notificationId: 'ntf-safe',
        attemptId: 'nat-safe',
      }),
    ).resolves.toEqual({ status: 'ambiguous' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('mail_relay_failure', {
      stage,
      category,
      requestId: 'req-safe',
      notificationId: 'ntf-safe',
      attemptId: 'nat-safe',
    });
  });

  it.each([
    ['HTTP', 'http://script.google.com/macros/s/test-deployment/exec'],
    ['data', 'data:text/plain,relay'],
    ['JavaScript', 'javascript:alert(1)'],
    ['malformed', 'not a relay URL'],
    ['untrusted HTTPS host', 'https://relay.example/macros/s/test-deployment/exec'],
    ['non-exec Apps Script path', 'https://script.google.com/macros/s/test-deployment/dev'],
  ])('rejects an invalid %s relay URL before signing or fetching', async (_label, relayUrl) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const signMock = vi.spyOn(crypto.subtle, 'sign');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitRelayMail(
        { MAIL_RELAY_URL: relayUrl, MAIL_RELAY_SECRET: 'relay-secret' } as never,
        message,
        { requestId: 'req-invalid-url' },
      ),
    ).resolves.toEqual({ status: 'ambiguous' });

    expect(signMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('mail_relay_failure', {
      stage: 'relay_config',
      category: 'invalid_url',
      requestId: 'req-invalid-url',
    });
  });

  it('diagnoses request construction failure before fetching', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const circular = { ...message } as typeof message & { cycle?: unknown };
    circular.cycle = circular;

    await expect(
      submitRelayMail(
        { MAIL_RELAY_URL: validRelayUrl, MAIL_RELAY_SECRET: 'relay-secret' } as never,
        circular,
        { requestId: 'req-build' },
      ),
    ).resolves.toEqual({ status: 'ambiguous' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('mail_relay_failure', {
      stage: 'request_build',
      category: 'unknown',
      requestId: 'req-build',
    });
  });

  it('diagnoses signing failure before fetching', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(crypto.subtle, 'sign').mockRejectedValue(new Error('sensitive crypto detail'));

    await expect(
      submitRelayMail(
        { MAIL_RELAY_URL: validRelayUrl, MAIL_RELAY_SECRET: 'relay-secret' } as never,
        message,
        { requestId: 'req-sign' },
      ),
    ).resolves.toEqual({ status: 'ambiguous' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('mail_relay_failure', {
      stage: 'signing',
      category: 'crypto_failure',
      requestId: 'req-sign',
    });
  });

  it.each([
    ['transport failure', new TypeError('secret URL and recipient'), 'transport_failure'],
    ['timeout', new DOMException('secret URL and recipient', 'AbortError'), 'timeout'],
  ])('emits a privacy-safe diagnostic for %s', async (_label, error, category) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
    await submitRelayMail(
      { MAIL_RELAY_URL: validRelayUrl, MAIL_RELAY_SECRET: 'super-secret' } as never,
      message,
      { requestId: 'req-fetch', notificationId: 'ntf-1', attemptId: 'nat-1' },
    );
    expect(log).toHaveBeenCalledWith('mail_relay_failure', {
      stage: 'outbound_fetch',
      category,
      requestId: 'req-fetch',
      notificationId: 'ntf-1',
      attemptId: 'nat-1',
    });
    const diagnostics = JSON.stringify(log.mock.calls);
    for (const sensitive of [
      'secret.example',
      'super-secret',
      'staff@example.com',
      'Sign in',
      'Open QuranTrack',
      'secret URL and recipient',
    ]) {
      expect(diagnostics).not.toContain(sensitive);
    }
  });

  it.each([
    [
      'response read failure',
      { text: () => Promise.reject(new Error('private')) },
      'response_read',
      'transport_failure',
    ],
    ['HTTP failure', new Response('private', { status: 503 }), 'response_read', 'http_failure'],
    ['malformed response', new Response('not-json'), 'response_parse', 'malformed_response'],
  ])('diagnoses %s as ambiguous', async (_label, response, stage, category) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(
      submitRelayMail(
        { MAIL_RELAY_URL: validRelayUrl, MAIL_RELAY_SECRET: 'relay-secret' } as never,
        message,
        { requestId: 'req-response' },
      ),
    ).resolves.toEqual({ status: 'ambiguous' });
    expect(log).toHaveBeenCalledWith('mail_relay_failure', {
      stage,
      category,
      requestId: 'req-response',
    });
  });

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
    const nonceReturn = doPost.indexOf('relayResponse_({ ok: false, error: nonceError }');
    expect(nonceReturn).toBeGreaterThan(doPost.indexOf('claimAuthenticatedNonce_(nonce)'));
    expect(nonceReturn).toBeLessThan(doPost.indexOf('JSON.parse(body)'));

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
