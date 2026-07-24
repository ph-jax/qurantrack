import type { Env } from '../types/env';
import { isProduction, SESSION_COOKIE } from './config';

export function buildSessionCookie(token: string, expires: Date, env: Env): string {
  const secure = isProduction(env) ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; HttpOnly${secure}; SameSite=Lax; Path=/; Expires=${expires.toUTCString()}`;
}

export function clearSessionCookie(env: Env): string {
  const secure = isProduction(env) ? '; Secure' : '';
  return `${SESSION_COOKIE}=; HttpOnly${secure}; SameSite=Lax; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=') || null;
  }
  return null;
}
