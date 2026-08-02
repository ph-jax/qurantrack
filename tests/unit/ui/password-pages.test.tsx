import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { ForgotPasswordPage, ResetPasswordPage } from '../../../src/features/auth/PasswordPages';
import { i18n } from '../../../src/i18n';

const renderReset = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/auth/reset-password?token=' + 'r'.repeat(43)]}>
        <ResetPasswordPage />
      </MemoryRouter>
    </I18nextProvider>,
  );

const renderForgot = (siteKey?: string) =>
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <ForgotPasswordPage turnstileSiteKey={siteKey} />
      </MemoryRouter>
    </I18nextProvider>,
  );

describe('localized password reset policy errors', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    ['en', 'PASSWORD_TOO_SHORT', 'Use at least 15 characters for your new password.'],
    ['en', 'PASSWORD_TOO_LONG', 'Use no more than 128 characters for your new password.'],
    ['en', 'PASSWORD_EQUALS_EMAIL', 'Your password cannot be the same as your email address.'],
    ['tr', 'PASSWORD_TOO_SHORT', 'Yeni parolanız için en az 15 karakter kullanın.'],
    ['tr', 'PASSWORD_TOO_LONG', 'Yeni parolanız için en fazla 128 karakter kullanın.'],
    ['tr', 'PASSWORD_EQUALS_EMAIL', 'Parolanız e-posta adresinizle aynı olamaz.'],
  ])('keeps the %s reset form open for %s', async (locale, code, message) => {
    await i18n.changeLanguage(locale);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    renderReset();
    await userEvent.type(document.getElementById('reset-password')!, 'a policy test password');
    await userEvent.type(document.getElementById('reset-confirm')!, 'a policy test password');
    await userEvent.click(
      screen.getByRole('button', { name: locale === 'tr' ? 'Parolayı sıfırla' : 'Reset password' }),
    );
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(document.getElementById('reset-password')).toBeInTheDocument();
    expect(
      screen.queryByText(locale === 'tr' ? /bağlantısı geçersiz/ : /link is invalid/),
    ).not.toBeInTheDocument();
  });
  it.each(['INVALID', 'INVALID_RESET'])(
    'shows the invalid-link state only for %s',
    async (code) => {
      await i18n.changeLanguage('en');
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(new Response(JSON.stringify({ error: { code } }), { status: 400 })),
      );
      renderReset();
      await userEvent.type(screen.getByLabelText(/^New password/), 'a policy test password');
      await userEvent.type(
        screen.getByLabelText(/^Confirm new password/),
        'a policy test password',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));
      expect(await screen.findByText(/reset link is invalid/)).toBeInTheDocument();
      expect(screen.queryByLabelText(/^New password/)).not.toBeInTheDocument();
    },
  );
});

describe('forgot-password Turnstile retry', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    window.turnstile = undefined;
    vi.unstubAllGlobals();
  });
  it('clears and resets a rejected challenge before allowing a retry', async () => {
    let verify: ((token: string) => void) | undefined;
    const reset = vi.fn();
    window.turnstile = {
      render: vi.fn((_element, options) => {
        verify = options.callback;
        return 'forgot-widget';
      }),
      reset,
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'TURNSTILE_FAILED' } }), { status: 400 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    renderForgot('test-site-key');
    await waitFor(() => expect(verify).toBeTypeOf('function'));
    await userEvent.type(screen.getByLabelText(/Email address/), 'staff@example.test');
    verify?.('first-token');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset instructions' }));
    expect(await screen.findByText(/could not verify your session/i)).toBeInTheDocument();
    expect(reset).toHaveBeenCalledWith('forgot-widget');
    expect(screen.getByRole('button', { name: 'Send reset instructions' })).toBeDisabled();
    verify?.('retry-token');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send reset instructions' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send reset instructions' }));
    expect(await screen.findByText(/^If this email is eligible/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('shows missing-key and widget errors visibly', async () => {
    const { unmount } = renderForgot('');
    expect(screen.getByRole('alert')).toHaveTextContent(/not configured/i);
    unmount();
    let fail: (() => void) | undefined;
    window.turnstile = {
      render: vi.fn((_element, options) => {
        fail = options['error-callback'];
        return 'forgot-widget';
      }),
      reset: vi.fn(),
    };
    renderForgot('test-site-key');
    await waitFor(() => expect(fail).toBeTypeOf('function'));
    fail?.();
    expect(await screen.findByRole('alert')).toHaveTextContent(/anti-abuse check failed/i);
  });
  it('shows a visible error when the Turnstile script cannot load', async () => {
    window.turnstile = undefined;
    renderForgot('test-site-key');
    const scripts = Array.from(
      document.querySelectorAll<HTMLScriptElement>('script[src*="challenges.cloudflare.com"]'),
    );
    scripts.at(-1)?.dispatchEvent(new Event('error'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/anti-abuse check failed/i);
  });
});
