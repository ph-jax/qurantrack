import type { Env } from '../types/env';
import type { AuthContext, Role } from '../auth/service';
import { appBaseUrl, requireSecret } from '../auth/config';
import { hashSecret, randomToken, sha256Hex } from '../../shared/auth/crypto';
import { sendRelayMail } from '../email/relay';
import { resolveSender } from '../email/sender';

export const ASSIGNABLE_ROLES = ['organization_admin', 'teacher', 'read_only'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];
const INVITATION_DAYS = 7;

type Org = {
  id: string;
  name: string;
  default_locale: string;
  email_sender_name: string;
  email_reply_to: string;
  email_sender_alias: string | null;
};
export const normalizeEmail = (value: string) => value.trim().toLowerCase();
const invitationHash = (env: Env, token: string) =>
  hashSecret(
    `organization-invitation:v1:${token}`,
    requireSecret(env.TOKEN_HASH_PEPPER, 'TOKEN_HASH_PEPPER'),
  );
const changes = (result: { meta?: unknown }) =>
  (result.meta as { changes?: number; rows_written?: number } | undefined)?.changes ??
  (result.meta as { rows_written?: number } | undefined)?.rows_written ??
  0;

async function audit(
  env: Env,
  auth: AuthContext | null,
  organizationId: string,
  action: string,
  entityType: string,
  entityId: string,
  requestId?: string,
) {
  await env.DB.prepare(
    'INSERT INTO audit_log (id,organization_id,actor_user_id,action,entity_type,entity_id,summary,metadata_json,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(
      crypto.randomUUID(),
      organizationId,
      auth?.userId ?? null,
      action,
      entityType,
      entityId,
      action.replaceAll('_', ' '),
      null,
      requestId ?? null,
      new Date().toISOString(),
    )
    .run();
}

export async function listStaff(env: Env, auth: AuthContext) {
  const members = await env.DB.prepare(
    `SELECT m.id,u.display_name AS displayName,lower(u.email) AS email,m.role,m.active,
      CASE WHEN m.user_id=? THEN 1 ELSE 0 END AS isSelf,m.updated_at AS updatedAt
     FROM organization_memberships m JOIN users u ON u.id=m.user_id
     WHERE m.organization_id=? ORDER BY u.display_name COLLATE NOCASE`,
  )
    .bind(auth.userId, auth.organizationId)
    .all();
  const invitations = await env.DB.prepare(
    `SELECT id,normalized_email AS email,role,expires_at AS expiresAt,accepted_at AS acceptedAt,revoked_at AS revokedAt,delivery_status AS deliveryStatus,created_at AS createdAt FROM organization_invitations WHERE organization_id=? ORDER BY created_at DESC`,
  )
    .bind(auth.organizationId)
    .all();
  return { members: members.results ?? [], invitations: invitations.results ?? [] };
}

async function organization(env: Env, id: string) {
  return env.DB.prepare(
    'SELECT id,name,default_locale,email_sender_name,email_reply_to,email_sender_alias FROM organizations WHERE id=? AND active=1',
  )
    .bind(id)
    .first<Org>();
}
function friendlyRole(role: AssignableRole, locale: string) {
  const tr = locale === 'tr';
  return role === 'organization_admin'
    ? tr
      ? 'Kurum Yöneticisi'
      : 'Organization Administrator'
    : role === 'teacher'
      ? tr
        ? 'Öğretmen / Mentor'
        : 'Teacher / Mentor'
      : tr
        ? 'Salt Okunur'
        : 'Read only';
}
async function deliver(env: Env, org: Org, email: string, role: AssignableRole, token: string) {
  const sender = resolveSender(env, org);
  const link = `${appBaseUrl(env)}/invitations/accept?token=${encodeURIComponent(token)}`;
  const tr = org.default_locale === 'tr';
  await sendRelayMail(env, {
    to: email,
    ...sender,
    fromAlias: sender.fromAlias,
    subject: tr ? `${org.name} QuranTrack daveti` : `${org.name} QuranTrack invitation`,
    text: tr
      ? `${org.name} sizi ${friendlyRole(role, 'tr')} rolüyle QuranTrack'e davet etti.\n\n${link}\n\nBu bağlantı 7 gün geçerlidir.`
      : `${org.name} invited you to QuranTrack as ${friendlyRole(role, 'en')}.\n\n${link}\n\nThis link expires in 7 days.`,
  });
}

export async function createInvitation(
  env: Env,
  auth: AuthContext,
  emailInput: string,
  role: AssignableRole,
  requestId?: string,
) {
  const email = normalizeEmail(emailInput);
  const now = new Date();
  const id = crypto.randomUUID();
  const token = randomToken(32);
  const hash = await invitationHash(env, token);
  const existingMember = await env.DB.prepare(
    'SELECT m.id,m.active FROM organization_memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? AND u.email=? COLLATE NOCASE',
  )
    .bind(auth.organizationId, email)
    .first<{ id: string; active: number }>();
  if (existingMember?.active) return { conflict: true as const };
  try {
    await env.DB.prepare(
      'INSERT INTO organization_invitations (id,organization_id,normalized_email,role,token_hash,invited_by_user_id,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
    )
      .bind(
        id,
        auth.organizationId,
        email,
        role,
        hash,
        auth.userId,
        new Date(now.getTime() + INVITATION_DAYS * 86400000).toISOString(),
        now.toISOString(),
        now.toISOString(),
      )
      .run();
  } catch {
    return { conflict: true as const };
  }
  await audit(
    env,
    auth,
    auth.organizationId,
    'invitation_created',
    'organization_invitation',
    id,
    requestId,
  );
  const org = await organization(env, auth.organizationId);
  if (!org) return { deliveryFailed: true as const };
  try {
    await deliver(env, org, email, role, token);
    await env.DB.prepare(
      "UPDATE organization_invitations SET delivery_status='sent',last_delivery_attempt_at=?,updated_at=? WHERE id=? AND organization_id=?",
    )
      .bind(now.toISOString(), now.toISOString(), id, auth.organizationId)
      .run();
    return { ok: true as const };
  } catch {
    await env.DB.prepare(
      "UPDATE organization_invitations SET delivery_status='failed',last_delivery_attempt_at=?,updated_at=? WHERE id=? AND organization_id=?",
    )
      .bind(now.toISOString(), now.toISOString(), id, auth.organizationId)
      .run();
    return { deliveryFailed: true as const };
  }
}

export async function resendInvitation(
  env: Env,
  auth: AuthContext,
  id: string,
  requestId?: string,
) {
  const row = await env.DB.prepare(
    'SELECT normalized_email email,role FROM organization_invitations WHERE id=? AND organization_id=? AND accepted_at IS NULL AND revoked_at IS NULL',
  )
    .bind(id, auth.organizationId)
    .first<{ email: string; role: AssignableRole }>();
  if (!row) return { missing: true as const };
  const token = randomToken(32),
    hash = await invitationHash(env, token),
    now = new Date(),
    expiry = new Date(now.getTime() + INVITATION_DAYS * 86400000).toISOString();
  await env.DB.prepare(
    "UPDATE organization_invitations SET token_hash=?,expires_at=?,delivery_status='pending',updated_at=? WHERE id=? AND organization_id=? AND accepted_at IS NULL AND revoked_at IS NULL",
  )
    .bind(hash, expiry, now.toISOString(), id, auth.organizationId)
    .run();
  await audit(
    env,
    auth,
    auth.organizationId,
    'invitation_resent',
    'organization_invitation',
    id,
    requestId,
  );
  const org = await organization(env, auth.organizationId);
  try {
    if (!org) throw new Error();
    await deliver(env, org, row.email, row.role, token);
    await env.DB.prepare(
      "UPDATE organization_invitations SET delivery_status='sent',last_delivery_attempt_at=?,updated_at=? WHERE id=?",
    )
      .bind(now.toISOString(), now.toISOString(), id)
      .run();
    return { ok: true as const };
  } catch {
    await env.DB.prepare(
      "UPDATE organization_invitations SET delivery_status='failed',last_delivery_attempt_at=?,updated_at=? WHERE id=?",
    )
      .bind(now.toISOString(), now.toISOString(), id)
      .run();
    return { deliveryFailed: true as const };
  }
}

export async function revokeInvitation(
  env: Env,
  auth: AuthContext,
  id: string,
  requestId?: string,
) {
  const now = new Date().toISOString();
  const r = await env.DB.prepare(
    'UPDATE organization_invitations SET revoked_at=?,updated_at=? WHERE id=? AND organization_id=? AND accepted_at IS NULL AND revoked_at IS NULL',
  )
    .bind(now, now, id, auth.organizationId)
    .run();
  if (changes(r) !== 1) return false;
  await audit(
    env,
    auth,
    auth.organizationId,
    'invitation_revoked',
    'organization_invitation',
    id,
    requestId,
  );
  return true;
}

export async function updateMembership(
  env: Env,
  auth: AuthContext,
  id: string,
  input: { role?: AssignableRole; active?: boolean },
  requestId?: string,
) {
  const row = await env.DB.prepare(
    'SELECT user_id,role,active FROM organization_memberships WHERE id=? AND organization_id=?',
  )
    .bind(id, auth.organizationId)
    .first<{ user_id: string; role: Role; active: number }>();
  if (!row) return 'missing';
  if (row.user_id === auth.userId) return 'self';
  if (row.role === 'system_admin') return 'forbidden';
  const nextRole = input.role ?? (row.role as AssignableRole),
    nextActive = input.active === undefined ? row.active : Number(input.active);
  const now = new Date().toISOString();
  const updateStatement = env.DB.prepare(
    `UPDATE organization_memberships SET role=?,active=?,updated_at=?
     WHERE id=? AND organization_id=?
       AND (role NOT IN ('system_admin','organization_admin')
         OR (? IN ('system_admin','organization_admin') AND ?=1)
         OR EXISTS (SELECT 1 FROM organization_memberships administrator
           WHERE administrator.organization_id=organization_memberships.organization_id
             AND administrator.id<>organization_memberships.id AND administrator.active=1
             AND administrator.role IN ('system_admin','organization_admin')))`,
  ).bind(nextRole, nextActive, now, id, auth.organizationId, nextRole, nextActive);
  const auditStatement = env.DB.prepare(
    `INSERT INTO audit_log (id,organization_id,actor_user_id,action,entity_type,entity_id,summary,metadata_json,request_id,created_at)
     SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (
       SELECT 1 FROM organization_memberships WHERE id=? AND organization_id=? AND updated_at=?
     )`,
  ).bind(
    crypto.randomUUID(),
    auth.organizationId,
    auth.userId,
    row.active !== nextActive
      ? nextActive
        ? 'membership_reactivated'
        : 'membership_deactivated'
      : 'membership_role_changed',
    'organization_membership',
    id,
    'membership updated',
    null,
    requestId ?? null,
    now,
    id,
    auth.organizationId,
    now,
  );
  const [result] = await env.DB.batch([updateStatement, auditStatement]);
  if (changes(result) !== 1) return 'last_admin';
  return 'ok';
}

export type InvitationPublicState = 'pending' | 'expired' | 'revoked' | 'used';
export async function inspectInvitation(env: Env, token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const hash = await invitationHash(env, token);
  const row = await env.DB.prepare(
    `SELECT o.name organizationName,o.default_locale locale,i.role,i.expires_at expiresAt,
      i.accepted_at acceptedAt,i.revoked_at revokedAt,o.active organizationActive
     FROM organization_invitations i JOIN organizations o ON o.id=i.organization_id
     WHERE i.token_hash=?`,
  )
    .bind(hash)
    .first<{
      organizationName: string;
      locale: string;
      role: AssignableRole;
      expiresAt: string;
      acceptedAt: string | null;
      revokedAt: string | null;
      organizationActive: number;
    }>();
  if (!row) return null;
  const state: InvitationPublicState = row.acceptedAt
    ? 'used'
    : row.revokedAt
      ? 'revoked'
      : !row.organizationActive || new Date(row.expiresAt) <= new Date()
        ? 'expired'
        : 'pending';
  return {
    organizationName: row.organizationName,
    locale: row.locale,
    role: row.role,
    expiresAt: row.expiresAt,
    state,
  };
}

export async function acceptInvitation(
  env: Env,
  token: string,
  request: Request,
  priorSessionId?: string,
) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const hash = await invitationHash(env, token);
  const now = new Date();
  const invite = await env.DB.prepare(
    `SELECT i.id,i.organization_id,i.normalized_email,i.role FROM organization_invitations i JOIN organizations o ON o.id=i.organization_id WHERE i.token_hash=? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>? AND o.active=1`,
  )
    .bind(hash, now.toISOString())
    .first<{
      id: string;
      organization_id: string;
      normalized_email: string;
      role: AssignableRole;
    }>();
  if (!invite) return null;
  const user = await env.DB.prepare('SELECT id,active FROM users WHERE email=? COLLATE NOCASE')
    .bind(invite.normalized_email)
    .first<{ id: string; active: number }>();
  if (user && !user.active) return null;
  const userId = user?.id ?? crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const sessionToken = randomToken(32),
    sessionHash = await hashSecret(
      sessionToken,
      requireSecret(env.TOKEN_HASH_PEPPER, 'TOKEN_HASH_PEPPER'),
    ),
    expires = new Date(now.getTime() + 12 * 3600000),
    absolute = new Date(now.getTime() + 30 * 86400000),
    timestamp = now.toISOString();
  const statements = [];
  if (!user)
    statements.push(
      env.DB.prepare(
        'INSERT INTO users (id,email,display_name,active,created_at,updated_at) VALUES (?,?,?,?,?,?)',
      ).bind(
        userId,
        invite.normalized_email,
        invite.normalized_email.split('@')[0],
        1,
        timestamp,
        timestamp,
      ),
    );
  statements.push(
    env.DB.prepare(
      'INSERT INTO sessions (id,user_id,token_hash,active_organization_id,expires_at,absolute_expires_at,last_seen_at,created_at,user_agent_hash,ip_hash) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).bind(
      sessionId,
      userId,
      sessionHash,
      invite.organization_id,
      expires.toISOString(),
      absolute.toISOString(),
      timestamp,
      timestamp,
      await sha256Hex(request.headers.get('user-agent') ?? 'unknown'),
      await sha256Hex(request.headers.get('cf-connecting-ip') ?? 'unknown'),
    ),
    env.DB.prepare(
      'INSERT INTO organization_invitation_acceptances (invitation_id,user_id,session_id,accepted_at) VALUES (?,?,?,?)',
    ).bind(invite.id, userId, sessionId, timestamp),
    env.DB.prepare(
      `INSERT INTO organization_memberships (id,organization_id,user_id,role,active,created_at,updated_at) VALUES (?,?,?,?,1,?,?) ON CONFLICT(organization_id,user_id) DO UPDATE SET role=excluded.role,active=1,updated_at=excluded.updated_at`,
    ).bind(crypto.randomUUID(), invite.organization_id, userId, invite.role, timestamp, timestamp),
    env.DB.prepare(
      'UPDATE organization_invitations SET accepted_at=?,updated_at=? WHERE id=?',
    ).bind(timestamp, timestamp, invite.id),
    env.DB.prepare(
      'INSERT INTO audit_log (id,organization_id,actor_user_id,action,entity_type,entity_id,summary,metadata_json,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).bind(
      crypto.randomUUID(),
      invite.organization_id,
      userId,
      'invitation_accepted',
      'organization_invitation',
      invite.id,
      'invitation accepted',
      null,
      null,
      timestamp,
    ),
  );
  if (priorSessionId) {
    statements.push(
      env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL').bind(
        timestamp,
        priorSessionId,
      ),
    );
  }
  try {
    await env.DB.batch(statements);
  } catch {
    return null;
  }
  return { sessionToken, expires };
}
