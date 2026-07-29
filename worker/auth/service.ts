import type { Env } from '../types/env';
import { appBaseUrl, requireSecret } from './config';
import { hashSecret, randomToken, sha256Hex } from '../../shared/auth/crypto';
import { sendRelayMail } from '../email/relay';
import { resolveSender } from '../email/sender';

const LOGIN_TTL_MINUTES = 15;
const SESSION_IDLE_HOURS = 12;
const SESSION_ABSOLUTE_DAYS = 30;
export type Role = 'system_admin' | 'organization_admin' | 'teacher' | 'read_only';
export interface AuthContext {
  userId: string;
  email: string;
  organizationId: string;
  role: Role;
  sessionId: string;
}
interface User {
  id: string;
  email: string;
  display_name: string;
  active: number;
}
interface Membership {
  organization_id: string;
  role: Role;
  active: number;
  org_active: number;
  org_name: string;
  org_slug: string;
  email_sender_name: string;
  email_reply_to: string;
  email_sender_alias: string | null;
}

export async function requestMagicLink(
  env: Env,
  emailInput: string,
  organizationSlug: string | undefined,
  request: Request,
) {
  const email = emailInput.trim().toLowerCase();
  const now = new Date();
  const ipHash = await sha256Hex(request.headers.get('cf-connecting-ip') ?? 'unknown');
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ? AND active = 1 LIMIT 1')
    .bind(email)
    .first<User>();
  const memberships = user ? await activeMemberships(env, user.id, organizationSlug) : [];
  if (!user || memberships.length === 0) return;
  const token = randomToken(32);
  const tokenHash = await hashSecret(
    token,
    requireSecret(env.TOKEN_HASH_PEPPER, 'TOKEN_HASH_PEPPER'),
  );
  const id = crypto.randomUUID();
  const expires = new Date(now.getTime() + LOGIN_TTL_MINUTES * 60_000).toISOString();
  await env.DB.prepare(
    'INSERT INTO login_tokens (id,email,token_hash,organization_hint,expires_at,request_ip_hash,created_at) VALUES (?,?,?,?,?,?,?)',
  )
    .bind(id, email, tokenHash, organizationSlug ?? null, expires, ipHash, now.toISOString())
    .run();
  const link = `${appBaseUrl(env)}/auth/consume?token=${encodeURIComponent(token)}`;
  const sender = resolveSender(env, memberships[0]);
  await sendRelayMail(env, {
    to: email,
    fromAlias: sender.fromAlias,
    senderName: sender.senderName,
    replyTo: sender.replyTo,
    subject: 'Your QuranTrack sign-in link',
    text: `Welcome to QuranTrack. Tap this secure sign-in link within ${LOGIN_TTL_MINUTES} minutes:\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
  });
}

async function activeMemberships(env: Env, userId: string, slug?: string): Promise<Membership[]> {
  const sql = `SELECT m.organization_id, m.role, m.active, o.active AS org_active, o.name AS org_name, o.slug AS org_slug, o.email_sender_name, o.email_reply_to, o.email_sender_alias FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id WHERE m.user_id = ? AND m.active = 1 AND o.active = 1 ${slug ? 'AND o.slug = ?' : ''} ORDER BY o.name ASC`;
  const result = await (
    slug ? env.DB.prepare(sql).bind(userId, slug) : env.DB.prepare(sql).bind(userId)
  ).all<Membership>();
  return result.results ?? [];
}

export async function consumeMagicLink(env: Env, token: string, request: Request) {
  const now = new Date();
  const tokenHash = await hashSecret(
    token,
    requireSecret(env.TOKEN_HASH_PEPPER, 'TOKEN_HASH_PEPPER'),
  );
  const login = await env.DB.prepare('SELECT * FROM login_tokens WHERE token_hash = ? LIMIT 1')
    .bind(tokenHash)
    .first<{ id: string; email: string; expires_at: string; used_at: string | null }>();
  if (!login || login.used_at || new Date(login.expires_at) <= now) return null;
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ? AND active = 1 LIMIT 1')
    .bind(login.email)
    .first<User>();
  if (!user) return null;
  const memberships = await activeMemberships(env, user.id);
  if (memberships.length === 0) return null;
  const consumeResult = await env.DB.prepare(
    'UPDATE login_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?',
  )
    .bind(now.toISOString(), login.id, now.toISOString())
    .run();
  if (affectedRows(consumeResult) !== 1) return null;
  const sessionToken = randomToken(32);
  const sessionHash = await hashSecret(
    sessionToken,
    requireSecret(env.TOKEN_HASH_PEPPER, 'TOKEN_HASH_PEPPER'),
  );
  const idle = new Date(now.getTime() + SESSION_IDLE_HOURS * 3600_000);
  const absolute = new Date(now.getTime() + SESSION_ABSOLUTE_DAYS * 24 * 3600_000);
  const sessionId = crypto.randomUUID();
  const ipHash = await sha256Hex(request.headers.get('cf-connecting-ip') ?? 'unknown');
  const uaHash = await sha256Hex(request.headers.get('user-agent') ?? 'unknown');
  await env.DB.prepare(
    'INSERT INTO sessions (id,user_id,token_hash,active_organization_id,expires_at,absolute_expires_at,last_seen_at,created_at,user_agent_hash,ip_hash) VALUES (?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(
      sessionId,
      user.id,
      sessionHash,
      memberships[0].organization_id,
      idle.toISOString(),
      absolute.toISOString(),
      now.toISOString(),
      now.toISOString(),
      uaHash,
      ipHash,
    )
    .run();
  await env.DB.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?')
    .bind(now.toISOString(), now.toISOString(), user.id)
    .run();
  return { sessionToken, expires: idle };
}

export async function validateSession(env: Env, token: string): Promise<AuthContext | null> {
  const now = new Date();
  const hash = await hashSecret(token, requireSecret(env.TOKEN_HASH_PEPPER, 'TOKEN_HASH_PEPPER'));
  const row = await env.DB.prepare(
    `SELECT s.id session_id, s.user_id, s.active_organization_id, s.expires_at, s.absolute_expires_at, s.revoked_at, u.email, u.active user_active, m.role, m.active membership_active, o.active org_active FROM sessions s JOIN users u ON u.id=s.user_id JOIN organization_memberships m ON m.user_id=s.user_id AND m.organization_id=s.active_organization_id JOIN organizations o ON o.id=s.active_organization_id WHERE s.token_hash=? LIMIT 1`,
  )
    .bind(hash)
    .first<{
      session_id: string;
      user_id: string;
      active_organization_id: string;
      expires_at: string;
      absolute_expires_at: string;
      revoked_at: string | null;
      email: string;
      user_active: number;
      role: Role;
      membership_active: number;
      org_active: number;
    }>();
  if (
    !row ||
    row.revoked_at ||
    !row.user_active ||
    !row.membership_active ||
    !row.org_active ||
    new Date(row.expires_at) <= now ||
    new Date(row.absolute_expires_at) <= now
  )
    return null;
  const nextIdle = new Date(
    Math.min(
      now.getTime() + SESSION_IDLE_HOURS * 3600_000,
      new Date(row.absolute_expires_at).getTime(),
    ),
  );
  await env.DB.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
    .bind(now.toISOString(), nextIdle.toISOString(), row.session_id)
    .run();
  return {
    userId: row.user_id,
    email: row.email,
    organizationId: row.active_organization_id,
    role: row.role,
    sessionId: row.session_id,
  };
}

/** Validates session ownership/expiry without requiring the selected membership to remain active. */
export async function validateSessionForRecovery(
  env: Env,
  token: string,
): Promise<AuthContext | null> {
  const now = new Date();
  const hash = await hashSecret(token, requireSecret(env.TOKEN_HASH_PEPPER, 'TOKEN_HASH_PEPPER'));
  const row = await env.DB.prepare(
    `SELECT s.id session_id,s.user_id,s.active_organization_id,s.expires_at,s.absolute_expires_at,
      s.revoked_at,u.email,u.active user_active
     FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? LIMIT 1`,
  )
    .bind(hash)
    .first<{
      session_id: string;
      user_id: string;
      active_organization_id: string;
      expires_at: string;
      absolute_expires_at: string;
      revoked_at: string | null;
      email: string;
      user_active: number;
    }>();
  if (
    !row ||
    row.revoked_at ||
    !row.user_active ||
    new Date(row.expires_at) <= now ||
    new Date(row.absolute_expires_at) <= now
  )
    return null;
  return {
    userId: row.user_id,
    email: row.email,
    organizationId: row.active_organization_id,
    role: 'read_only',
    sessionId: row.session_id,
  };
}

export async function revokeSession(env: Env, sessionId: string) {
  await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), sessionId)
    .run();
}
export async function listOrganizations(env: Env, userId: string) {
  return activeMemberships(env, userId);
}
export async function switchOrganization(
  env: Env,
  userId: string,
  sessionId: string,
  organizationId: string,
) {
  const rows = await activeMemberships(env, userId);
  if (!rows.some((r) => r.organization_id === organizationId)) return false;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE sessions SET active_organization_id = ? WHERE id = ?').bind(
      organizationId,
      sessionId,
    ),
    env.DB.prepare(
      'INSERT INTO audit_log (id,organization_id,actor_user_id,action,entity_type,entity_id,summary,created_at) VALUES (?,?,?,?,?,?,?,?)',
    ).bind(
      crypto.randomUUID(),
      organizationId,
      userId,
      'organization_switched',
      'session',
      sessionId,
      'organization switched',
      now,
    ),
  ]);
  return true;
}
export function can(role: Role, allowed: Role[]) {
  return allowed.includes(role);
}

function affectedRows(result: { meta?: unknown }): number {
  const meta = result.meta as { changes?: number; rows_written?: number } | undefined;
  return meta?.changes ?? meta?.rows_written ?? 0;
}
