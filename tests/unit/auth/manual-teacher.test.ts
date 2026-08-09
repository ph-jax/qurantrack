import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PASSWORD_ALGORITHM,
  PASSWORD_WORK_FACTOR,
  verifyPassword,
} from '../../../worker/auth/password';
import { createInvitation, createTeacherManually } from '../../../worker/organizations/memberships';
import { base, invitation, membership, SqliteD1, user } from '../../helpers/sqliteD1';

const auth = {
  userId: 'admin',
  email: 'admin@example.test',
  organizationId: 'org-a',
  role: 'organization_admin' as const,
  sessionId: 'session',
};
const env = (db: SqliteD1) =>
  ({
    DB: db as unknown as D1Database,
    PASSWORD_HASH_PEPPER: 'password-pepper',
    TOKEN_HASH_PEPPER: 'token-pepper',
    APP_BASE_URL: 'https://app.test',
    MAIL_RELAY_URL: 'https://relay.test',
    MAIL_RELAY_SECRET: 'relay-secret',
    MAIL_DEFAULT_FROM_ALIAS: 'sender@example.test',
    MAIL_APPROVED_FROM_ALIASES: 'sender@example.test',
  }) as never;

describe('manual teacher persistence', () => {
  let db: SqliteD1;
  beforeEach(() => {
    db = new SqliteD1();
    base(db);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    db.close();
  });

  it('atomically creates a normalized active teacher, credential, and safe audit without an invitation', async () => {
    const result = await createTeacherManually(
      env(db),
      auth,
      'Teacher One',
      '  Teacher1@Example.COM ',
      'initial-password',
      'request-1',
    );
    expect(result).toMatchObject({
      teacher: { email: 'teacher1@example.com', role: 'teacher', active: true },
    });
    expect(db.count('users')).toBe(2);
    expect(db.count('user_password_credentials')).toBe(1);
    expect(db.count('organization_memberships')).toBe(3);
    expect(db.count('organization_invitations')).toBe(0);
    const member = db.db
      .prepare(
        `SELECT u.email,u.active user_active,m.role,m.active membership_active,m.organization_id
      FROM users u JOIN organization_memberships m ON m.user_id=u.id WHERE u.email=?`,
      )
      .get('teacher1@example.com');
    expect(member).toEqual({
      email: 'teacher1@example.com',
      user_active: 1,
      role: 'teacher',
      membership_active: 1,
      organization_id: 'org-a',
    });
    const credential = db.db
      .prepare('SELECT algorithm,work_factor,salt,password_hash FROM user_password_credentials')
      .get() as {
      algorithm: string;
      work_factor: number;
      salt: string;
      password_hash: string;
    };
    expect(credential).toMatchObject({
      algorithm: PASSWORD_ALGORITHM,
      work_factor: PASSWORD_WORK_FACTOR,
    });
    expect(await verifyPassword('initial-password', 'password-pepper', credential)).toBe(true);
    expect(await verifyPassword('incorrect-password', 'password-pepper', credential)).toBe(false);
    const audit = db.db
      .prepare(
        'SELECT organization_id,actor_user_id,action,entity_type,metadata_json,request_id FROM audit_log',
      )
      .get() as Record<string, unknown>;
    expect(audit).toMatchObject({
      organization_id: 'org-a',
      actor_user_id: 'admin',
      action: 'teacher_created_manually',
      entity_type: 'organization_membership',
      request_id: 'request-1',
    });
    expect(audit.metadata_json).toContain('"role":"teacher"');
    expect(audit.metadata_json).toContain('"creationMethod":"manual"');
    expect(JSON.stringify({ result, audit })).not.toContain('initial-password');
    expect(JSON.stringify(audit)).not.toContain(credential.password_hash);
    expect(JSON.stringify(audit)).not.toContain(credential.salt);
  });

  it.each([2, 3, 4])(
    'rolls all four writes back when batch statement %i fails, then retries exactly once',
    async (statement) => {
      db.failBatchAt = statement;
      await expect(
        createTeacherManually(
          env(db),
          auth,
          'Retry Teacher',
          'retry@example.test',
          'secure-password',
          'failed',
        ),
      ).rejects.toThrow('injected_sql_failure');
      expect(
        db.db.prepare("SELECT count(*) count FROM users WHERE email='retry@example.test'").get(),
      ).toEqual({ count: 0 });
      expect(db.count('user_password_credentials')).toBe(0);
      expect(
        db.db
          .prepare(
            "SELECT count(*) count FROM organization_memberships WHERE id NOT IN ('admin-a','admin-b')",
          )
          .get(),
      ).toEqual({ count: 0 });
      expect(db.count('audit_log')).toBe(0);
      db.failBatchAt = 0;
      await createTeacherManually(
        env(db),
        auth,
        'Retry Teacher',
        'retry@example.test',
        'secure-password',
        'retry',
      );
      expect(
        db.db.prepare("SELECT count(*) count FROM users WHERE email='retry@example.test'").get(),
      ).toEqual({ count: 1 });
      expect(db.count('user_password_credentials')).toBe(1);
      expect(
        db.db
          .prepare(
            "SELECT count(*) count FROM organization_memberships WHERE id NOT IN ('admin-a','admin-b')",
          )
          .get(),
      ).toEqual({ count: 1 });
      expect(db.count('audit_log')).toBe(1);
    },
  );

  it('rejects existing active/inactive memberships, usable invitations, and global users without changes', async () => {
    user(db, 'active', 'active@example.test');
    membership(db, 'active-m', 'org-a', 'active', 'read_only');
    user(db, 'inactive', 'inactive@example.test');
    membership(db, 'inactive-m', 'org-a', 'inactive', 'teacher', 0);
    await invitation(db, 'invite', 'org-a', 'pending@example.test', 'teacher', 'x'.repeat(43));
    user(db, 'global', 'global@example.test');
    membership(db, 'global-b', 'org-b', 'global', 'teacher');
    const before = [
      db.count('users'),
      db.count('organization_memberships'),
      db.count('organization_invitations'),
    ];
    await expect(
      createTeacherManually(env(db), auth, 'X', 'active@example.test', 'password1'),
    ).resolves.toMatchObject({ conflict: 'existing_membership' });
    await expect(
      createTeacherManually(env(db), auth, 'X', 'inactive@example.test', 'password1'),
    ).resolves.toMatchObject({ conflict: 'inactive_membership' });
    await expect(
      createTeacherManually(env(db), auth, 'X', 'pending@example.test', 'password1'),
    ).resolves.toMatchObject({ conflict: 'pending_invitation' });
    await expect(
      createTeacherManually(env(db), auth, 'X', 'global@example.test', 'password1'),
    ).resolves.toMatchObject({ conflict: 'existing_user' });
    expect([
      db.count('users'),
      db.count('organization_memberships'),
      db.count('organization_invitations'),
    ]).toEqual(before);
    expect(db.count('user_password_credentials')).toBe(0);
    expect(db.count('audit_log')).toBe(0);
  });

  it('lets an invitation that wins after preflight prevent every manual-creation write', async () => {
    db.beforeBatch = () => {
      db.db
        .prepare(
          `INSERT INTO organization_invitations
         (id,organization_id,normalized_email,role,token_hash,invited_by_user_id,expires_at,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          'race-invite',
          'org-a',
          'race@example.test',
          'teacher',
          'hash',
          'admin',
          '2999-01-01',
          '2026-01-01',
          '2026-01-01',
        );
    };
    await expect(
      createTeacherManually(
        env(db),
        auth,
        'Race Teacher',
        'race@example.test',
        'secure-password',
        'race',
      ),
    ).resolves.toEqual({ conflict: 'pending_invitation' });
    expect(
      db.db.prepare("SELECT count(*) count FROM users WHERE email='race@example.test'").get(),
    ).toEqual({ count: 0 });
    expect(db.count('user_password_credentials')).toBe(0);
    expect(
      db.db
        .prepare(
          "SELECT count(*) count FROM organization_memberships WHERE id NOT IN ('admin-a','admin-b')",
        )
        .get(),
    ).toEqual({ count: 0 });
    expect(db.count('audit_log')).toBe(0);
    expect(
      db.db
        .prepare(
          "SELECT role,revoked_at,accepted_at FROM organization_invitations WHERE id='race-invite'",
        )
        .get(),
    ).toEqual({ role: 'teacher', revoked_at: null, accepted_at: null });
  });

  it('serializes concurrent invitation/manual batches so exactly one valid state wins', async () => {
    await invitation(db, 'other-org', 'org-b', 'race@example.test', 'teacher', 'z'.repeat(43));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    const [manualResult, invitationResult] = await Promise.all([
      createTeacherManually(env(db), auth, 'Race Teacher', 'race@example.test', 'secure-password'),
      createInvitation(env(db), auth, 'race@example.test', 'teacher'),
    ]);
    const manualWon = 'teacher' in manualResult;
    const invitationWon = 'ok' in invitationResult;
    expect(Number(manualWon) + Number(invitationWon)).toBe(1);
    expect(
      db.db.prepare("SELECT count(*) count FROM users WHERE email='race@example.test'").get(),
    ).toEqual({ count: manualWon ? 1 : 0 });
    expect(
      db.db
        .prepare(
          "SELECT count(*) count FROM organization_invitations WHERE organization_id='org-a' AND normalized_email='race@example.test'",
        )
        .get(),
    ).toEqual({ count: invitationWon ? 1 : 0 });
    expect(
      db.db
        .prepare(
          "SELECT count(*) count FROM organization_invitations WHERE id='other-org' AND organization_id='org-b'",
        )
        .get(),
    ).toEqual({ count: 1 });
    expect(db.count('audit_log')).toBe(1);
  });
});
