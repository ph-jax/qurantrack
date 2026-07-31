import { hashSecret } from '../../shared/auth/crypto';
import type { Env } from '../types/env';
import { requireSecret } from './config';

export type RatePurpose =
  | 'password_account'
  | 'password_ip'
  | 'magic_link_account'
  | 'magic_link_ip'
  | 'reset_account'
  | 'reset_ip';

export async function rateLimit(
  env: Env,
  purpose: RatePurpose,
  subject: string,
  limit: number,
  windowMinutes = 15,
) {
  const now = new Date();
  const expires = new Date(now.getTime() + windowMinutes * 60_000).toISOString();
  const subjectHash = await hashSecret(
    `rate-limit:${purpose}:${subject}`,
    requireSecret(env.TOKEN_HASH_PEPPER, 'TOKEN_HASH_PEPPER'),
  );
  // Opportunistic bounded cleanup; no raw subject data is retained.
  await env.DB.prepare(
    'DELETE FROM authentication_rate_limits WHERE rowid IN (SELECT rowid FROM authentication_rate_limits WHERE expires_at <= ? LIMIT 100)',
  )
    .bind(now.toISOString())
    .run();
  await env.DB.prepare(
    `INSERT INTO authentication_rate_limits (purpose,subject_hash,window_started_at,expires_at,attempt_count)
    VALUES (?,?,?,?,1) ON CONFLICT(purpose,subject_hash) DO UPDATE SET
    attempt_count=CASE WHEN expires_at<=excluded.window_started_at THEN 1 ELSE attempt_count+1 END,
    window_started_at=CASE WHEN expires_at<=excluded.window_started_at THEN excluded.window_started_at ELSE window_started_at END,
    expires_at=CASE WHEN expires_at<=excluded.window_started_at THEN excluded.expires_at ELSE expires_at END`,
  )
    .bind(purpose, subjectHash, now.toISOString(), expires)
    .run();
  const row = await env.DB.prepare(
    'SELECT attempt_count FROM authentication_rate_limits WHERE purpose=? AND subject_hash=?',
  )
    .bind(purpose, subjectHash)
    .first<{ attempt_count: number }>();
  return (row?.attempt_count ?? limit + 1) <= limit;
}

export async function clearRateLimit(env: Env, purpose: RatePurpose, subject: string) {
  const hash = await hashSecret(
    `rate-limit:${purpose}:${subject}`,
    requireSecret(env.TOKEN_HASH_PEPPER, 'TOKEN_HASH_PEPPER'),
  );
  await env.DB.prepare('DELETE FROM authentication_rate_limits WHERE purpose=? AND subject_hash=?')
    .bind(purpose, hash)
    .run();
}
