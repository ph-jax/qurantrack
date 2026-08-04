import type { Env } from '../types/env';
import { requireSecret, appBaseUrl } from './config';
import { activeMemberships, createSession, type User } from './service';
import {
  dummyPasswordVerification,
  hashPassword,
  verifyPassword,
  type PasswordCredential,
} from './password';
import { validatePasswordPolicy } from '../../shared/auth/password-policy';
import { clearRateLimit, isRateLimited, rateLimit, recordFailedAttempt } from './rate-limit';
import { hashSecret, randomToken, sha256Hex } from '../../shared/auth/crypto';
import { resolveSender } from '../email/sender';
import { sendRelayMail } from '../email/relay';

const pepper = (env: Env) => requireSecret(env.PASSWORD_HASH_PEPPER, 'PASSWORD_HASH_PEPPER');
const credentialSql =
  'SELECT algorithm,work_factor,salt,password_hash FROM user_password_credentials WHERE user_id=?';

export async function passwordLogin(
  env: Env,
  email: string,
  password: string,
  slug: string | undefined,
  request: Request,
) {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const blocked =
    (await isRateLimited(env, 'password_account', email, 5)) ||
    (await isRateLimited(env, 'password_ip', ip, 25));
  const user = await env.DB.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE LIMIT 1')
    .bind(email)
    .first<User>();
  const credential = user
    ? await env.DB.prepare(credentialSql).bind(user.id).first<PasswordCredential>()
    : null;
  const validPassword = credential
    ? await verifyPassword(password, pepper(env), credential)
    : (await dummyPasswordVerification(password, pepper(env)), false);
  const memberships = user?.active ? await activeMemberships(env, user.id, slug) : [];
  if (blocked || !user?.active || !validPassword || memberships.length === 0) {
    await Promise.all([
      recordFailedAttempt(env, 'password_account', email),
      recordFailedAttempt(env, 'password_ip', ip),
    ]);
    return null;
  }
  await clearRateLimit(env, 'password_account', email);
  return createSession(
    env,
    user,
    memberships[0].organization_id,
    request,
    'password_login_succeeded',
  );
}

export async function hasPassword(env: Env, userId: string) {
  return Boolean(
    await env.DB.prepare('SELECT 1 present FROM user_password_credentials WHERE user_id=?')
      .bind(userId)
      .first(),
  );
}

export async function setPassword(
  env: Env,
  user: { userId: string; email: string; organizationId: string },
  currentPassword: string | undefined,
  newPassword: string,
  request: Request,
) {
  const policy = validatePasswordPolicy(newPassword, user.email);
  if (policy) return { error: policy } as const;
  const existing = await env.DB.prepare(credentialSql)
    .bind(user.userId)
    .first<PasswordCredential>();
  if (existing) {
    if (!currentPassword || !(await verifyPassword(currentPassword, pepper(env), existing)))
      return { error: 'INVALID_CURRENT_PASSWORD' } as const;
    if (await verifyPassword(newPassword, pepper(env), existing))
      return { error: 'PASSWORD_REUSED' } as const;
  }
  const next = await hashPassword(newPassword, pepper(env));
  const now = new Date().toISOString();
  const sessionToken = randomToken(32);
  const sessionHash = await hashSecret(
    sessionToken,
    requireSecret(env.TOKEN_HASH_PEPPER, 'TOKEN_HASH_PEPPER'),
  );
  const expires = new Date(Date.now() + 12 * 3_600_000);
  const absolute = new Date(Date.now() + 30 * 86_400_000);
  const sessionId = crypto.randomUUID();
  const credentialStatement = existing
    ? env.DB.prepare(
        'UPDATE user_password_credentials SET algorithm=?,work_factor=?,salt=?,password_hash=?,updated_at=?,password_changed_at=? WHERE user_id=?',
      ).bind(next.algorithm, next.work_factor, next.salt, next.password_hash, now, now, user.userId)
    : env.DB.prepare(
        'INSERT INTO user_password_credentials (user_id,algorithm,work_factor,salt,password_hash,created_at,updated_at,password_changed_at) VALUES (?,?,?,?,?,?,?,?)',
      ).bind(
        user.userId,
        next.algorithm,
        next.work_factor,
        next.salt,
        next.password_hash,
        now,
        now,
        now,
      );
  const memberships = await activeMemberships(env, user.userId);
  const active =
    memberships.find((m) => m.organization_id === user.organizationId) ?? memberships[0];
  if (!active) return { error: 'INVALID_SESSION' } as const;
  try {
    await env.DB.batch([
      credentialStatement,
      env.DB.prepare(
        'UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL',
      ).bind(now, user.userId),
      env.DB.prepare(
        'INSERT INTO sessions (id,user_id,token_hash,active_organization_id,expires_at,absolute_expires_at,last_seen_at,created_at,user_agent_hash,ip_hash) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).bind(
        sessionId,
        user.userId,
        sessionHash,
        active.organization_id,
        expires.toISOString(),
        absolute.toISOString(),
        now,
        now,
        await sha256Hex(request.headers.get('user-agent') ?? 'unknown'),
        await sha256Hex(request.headers.get('cf-connecting-ip') ?? 'unknown'),
      ),
      env.DB.prepare('UPDATE users SET last_login_at=?,updated_at=? WHERE id=?').bind(
        now,
        now,
        user.userId,
      ),
      env.DB.prepare(
        'INSERT INTO audit_log (id,organization_id,actor_user_id,action,entity_type,entity_id,summary,created_at) VALUES (?,?,?,?,?,?,?,?)',
      ).bind(
        crypto.randomUUID(),
        active.organization_id,
        user.userId,
        existing ? 'password_changed' : 'password_created',
        'user',
        user.userId,
        existing ? 'password changed' : 'password created',
        now,
      ),
    ]);
  } catch {
    return { error: existing ? 'PASSWORD_CHANGE_FAILED' : 'PASSWORD_ALREADY_EXISTS' } as const;
  }
  return { session: { sessionToken, expires }, created: !existing } as const;
}

export async function requestPasswordReset(env: Env, email: string, request: Request) {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (
    !(await rateLimit(env, 'reset_account', email, 5)) ||
    !(await rateLimit(env, 'reset_ip', ip, 25))
  )
    return;
  const user = await env.DB.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE AND active=1')
    .bind(email)
    .first<User>();
  if (!user || !(await hasPassword(env, user.id))) return;
  const memberships = await activeMemberships(env, user.id);
  if (!memberships.length) return;
  const token = randomToken(32),
    now = new Date(),
    tokenHash = await hashSecret(
      `password-reset:${token}`,
      requireSecret(env.TOKEN_HASH_PEPPER, 'TOKEN_HASH_PEPPER'),
    );
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE password_reset_tokens SET invalidated_at=? WHERE user_id=? AND consumed_at IS NULL AND invalidated_at IS NULL',
    ).bind(now.toISOString(), user.id),
    env.DB.prepare(
      'INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at,request_ip_hash,created_at) VALUES (?,?,?,?,?,?)',
    ).bind(
      crypto.randomUUID(),
      user.id,
      tokenHash,
      new Date(now.getTime() + 30 * 60_000).toISOString(),
      await hashSecret(
        `password-reset-ip:${ip}`,
        requireSecret(env.TOKEN_HASH_PEPPER, 'TOKEN_HASH_PEPPER'),
      ),
      now.toISOString(),
    ),
  ]);
  const sender = resolveSender(env, memberships[0]);
  await sendRelayMail(env, {
    to: email,
    fromAlias: sender.fromAlias,
    senderName: sender.senderName,
    replyTo: sender.replyTo,
    subject: 'Reset your QuranTrack password',
    text: `Use this link within 30 minutes to choose a new password:\n\n${appBaseUrl(env)}/auth/reset-password?token=${encodeURIComponent(token)}\n\nIf you did not request this, ignore this email.`,
  });
}

export async function consumePasswordReset(env: Env, token: string, newPassword: string) {
  const hash = await hashSecret(
      `password-reset:${token}`,
      requireSecret(env.TOKEN_HASH_PEPPER, 'TOKEN_HASH_PEPPER'),
    ),
    now = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT r.id,r.user_id,u.email FROM password_reset_tokens r JOIN users u ON u.id=r.user_id WHERE r.token_hash=? AND r.consumed_at IS NULL AND r.invalidated_at IS NULL AND r.expires_at>? AND u.active=1`,
  )
    .bind(hash, now)
    .first<{ id: string; user_id: string; email: string }>();
  if (!row) return 'INVALID' as const;
  const policy = validatePasswordPolicy(newPassword, row.email);
  if (policy) return policy;
  const next = await hashPassword(newPassword, pepper(env));
  try {
    const results = await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO password_reset_consumptions (token_id,user_id,consumed_at) VALUES (?,?,?)',
      ).bind(row.id, row.user_id, now),
      env.DB.prepare(
        `UPDATE user_password_credentials SET algorithm=?,work_factor=?,salt=?,password_hash=?,updated_at=?,password_changed_at=?
         WHERE user_id=? AND EXISTS (SELECT 1 FROM password_reset_tokens WHERE id=? AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at>?)`,
      ).bind(
        next.algorithm,
        next.work_factor,
        next.salt,
        next.password_hash,
        now,
        now,
        row.user_id,
        row.id,
        now,
      ),
      env.DB.prepare(
        'UPDATE password_reset_tokens SET consumed_at=? WHERE id=? AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at>?',
      ).bind(now, row.id, now),
      env.DB.prepare(
        'UPDATE password_reset_tokens SET invalidated_at=? WHERE user_id=? AND id<>? AND consumed_at IS NULL AND invalidated_at IS NULL',
      ).bind(now, row.user_id, row.id),
      env.DB.prepare(
        'UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL',
      ).bind(now, row.user_id),
      env.DB.prepare(
        'INSERT INTO audit_log (id,organization_id,actor_user_id,action,entity_type,entity_id,summary,created_at) VALUES (?,NULL,?,?,?,?,?,?)',
      ).bind(
        crypto.randomUUID(),
        row.user_id,
        'password_reset',
        'user',
        row.user_id,
        'password reset',
        now,
      ),
    ]);
    const consumed = (results[2].meta as { changes?: number }).changes ?? 0;
    if (consumed !== 1) return 'INVALID' as const;
  } catch {
    return 'INVALID' as const;
  }
  return 'OK' as const;
}
