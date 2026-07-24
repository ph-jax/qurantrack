import type { Env } from '../types/env';
import { isProduction, requireSecret } from './config';

export async function validateTurnstile(
  env: Env,
  token: string,
  remoteIp?: string,
): Promise<boolean> {
  if (env.TURNSTILE_LOCAL_BYPASS === 'true') {
    if (isProduction(env))
      throw new Error('TURNSTILE_LOCAL_BYPASS cannot be enabled in production');
    return token === 'local-dev-bypass-token';
  }
  const secret = requireSecret(env.TURNSTILE_SECRET_KEY, 'TURNSTILE_SECRET_KEY');
  const body = new FormData();
  body.set('secret', secret);
  body.set('response', token);
  if (remoteIp) body.set('remoteip', remoteIp);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  if (!response.ok) return false;
  const data = (await response.json()) as { success?: boolean };
  return data.success === true;
}
