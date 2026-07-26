import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  relayResponseSucceeded,
  relayUrlWithAuth,
  sendRelayMail,
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
      vi.fn(async () => Response.json({ ok: false, error: 'replay' })),
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

  it('keeps Apps Script auth parameters reliably outside custom headers', () => {
    const url = relayUrlWithAuth('https://example.com/relay', '10', 'nonce', 'sig');
    expect(url).toBe('https://example.com/relay?timestamp=10&nonce=nonce&signature=sig');
  });

  it('does not access Google account or Gmail APIs before HMAC authentication', () => {
    const script = readFileSync('apps-script-mail-relay/Code.gs', 'utf8');
    const doPost = script.slice(
      script.indexOf('function doPost'),
      script.indexOf('function getStaticRelayConfig_'),
    );
    expect(doPost.indexOf('constantTimeEqual_')).toBeGreaterThan(
      doPost.indexOf('getStaticRelayConfig_'),
    );
    expect(doPost.indexOf('getSenderConfig_')).toBeGreaterThan(
      doPost.indexOf('constantTimeEqual_'),
    );

    const staticConfig = script.slice(
      script.indexOf('function getStaticRelayConfig_'),
      script.indexOf('function getSenderConfig_'),
    );
    expect(staticConfig).not.toContain('Session.');
    expect(staticConfig).not.toContain('GmailApp.');
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
