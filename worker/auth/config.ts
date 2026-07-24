import type { Env } from '../types/env';

export const SESSION_COOKIE = 'qurantrack_session';

export function isProduction(env: Env): boolean {
  return env.ENVIRONMENT === 'production';
}

export function requireSecret(value: string | undefined, name: string): string {
  if (!value || value.startsWith('replace-with')) throw new Error(`${name} is not configured`);
  return value;
}

export function appBaseUrl(env: Env): string {
  return env.APP_BASE_URL ?? 'http://localhost:5173';
}
