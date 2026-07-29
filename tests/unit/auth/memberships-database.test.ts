import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acceptInvitation,
  createInvitation,
  inspectInvitation,
  listStaff,
  resendInvitation,
  updateMembership,
} from '../../../worker/organizations/memberships';
import { listOrganizations, switchOrganization } from '../../../worker/auth/service';
import { hashSecret } from '../../../shared/auth/crypto';
import {
  SqliteD1,
  base,
  invitation,
  membership,
  organization,
  user,
  now,
} from '../../helpers/sqliteD1';
const token = 'a'.repeat(43);
const request = new Request('https://app.test/invitations/accept');
const env = (db: SqliteD1) =>
  ({
    DB: db,
    TOKEN_HASH_PEPPER: 'pepper',
    APP_BASE_URL: 'https://app.test',
    MAIL_RELAY_URL: 'https://relay.test',
    MAIL_RELAY_SECRET: 'relay-secret',
    MAIL_DEFAULT_FROM_ALIAS: 'sender@example.test',
    MAIL_APPROVED_FROM_ALIASES: 'sender@example.test',
  }) as never;
const auth = {
  userId: 'admin',
  email: 'admin@example.test',
  organizationId: 'org-a',
  role: 'organization_admin',
  sessionId: 'admin-session',
} as const;
afterEach(() => vi.unstubAllGlobals());
describe('real SQLite/D1 membership security', () => {
  it('atomically commits every acceptance record', async () => {
    const db = new SqliteD1();
    base(db);
    await invitation(db, 'i1', 'org-a', 'new@example.test', 'teacher', token);
    expect(await acceptInvitation(env(db), token, request)).toBeTruthy();
    expect(db.count('users')).toBe(2);
    expect(db.count('organization_memberships')).toBe(3);
    expect(db.count('organization_invitation_acceptances')).toBe(1);
    expect(db.count('sessions')).toBe(1);
    expect(db.count('audit_log')).toBe(1);
    expect(
      (
        db.db.prepare('SELECT accepted_at FROM organization_invitations WHERE id=?').get('i1') as {
          accepted_at: string | null;
        }
      ).accepted_at,
    ).not.toBeNull();
    db.close();
  });
  it.each([2, 3, 4, 5, 6])(
    'rolls back actual SQL transaction at batch write %s',
    async (failAt) => {
      const db = new SqliteD1();
      base(db);
      await invitation(db, 'i1', 'org-a', 'new@example.test', 'teacher', token);
      db.failBatchAt = failAt;
      expect(await acceptInvitation(env(db), token, request)).toBeNull();
      expect(db.count('users')).toBe(1);
      expect(db.count('organization_memberships')).toBe(2);
      expect(db.count('organization_invitation_acceptances')).toBe(0);
      expect(db.count('sessions')).toBe(0);
      expect(db.count('audit_log')).toBe(0);
      db.close();
    },
  );
  it('permits exactly one double acceptance', async () => {
    const db = new SqliteD1();
    base(db);
    await invitation(db, 'i1', 'org-a', 'new@example.test', 'teacher', token);
    const results = await Promise.all([
      acceptInvitation(env(db), token, request),
      acceptInvitation(env(db), token, request),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(db.count('users')).toBe(2);
    expect(db.count('organization_memberships')).toBe(3);
    expect(db.count('sessions')).toBe(1);
    db.close();
  });
  it('reuses users, preserves another tenant, and reactivates only the invited membership', async () => {
    const db = new SqliteD1();
    base(db);
    user(db, 'existing', 'existing@example.test');
    membership(db, 'existing-a', 'org-a', 'existing', 'read_only', 0);
    membership(db, 'existing-b', 'org-b', 'existing', 'organization_admin', 1);
    await invitation(db, 'i1', 'org-a', 'existing@example.test', 'teacher', token);
    expect(await acceptInvitation(env(db), token, request)).toBeTruthy();
    const rows = db.db
      .prepare(
        'SELECT organization_id,role,active FROM organization_memberships WHERE user_id=? ORDER BY organization_id',
      )
      .all('existing');
    expect(rows).toEqual([
      { organization_id: 'org-a', role: 'teacher', active: 1 },
      { organization_id: 'org-b', role: 'organization_admin', active: 1 },
    ]);
    expect(db.count('users')).toBe(2);
    db.close();
  });
  it('rejects active memberships and globally inactive users without overwriting or sessions', async () => {
    for (const kind of ['active', 'inactive-user']) {
      const db = new SqliteD1();
      base(db);
      user(db, 'existing', 'existing@example.test', kind === 'active' ? 1 : 0);
      if (kind === 'active') membership(db, 'existing-a', 'org-a', 'existing', 'read_only');
      await invitation(db, 'i1', 'org-a', 'existing@example.test', 'teacher', token);
      expect(await acceptInvitation(env(db), token, request)).toBeNull();
      expect(db.count('sessions')).toBe(0);
      if (kind === 'active')
        expect(
          (
            db.db
              .prepare('SELECT role FROM organization_memberships WHERE id=?')
              .get('existing-a') as { role: string }
          ).role,
        ).toBe('read_only');
      db.close();
    }
  });
  it('keeps tenant reads and writes scoped and atomically protects the final administrator', async () => {
    const db = new SqliteD1();
    base(db);
    user(db, 'staff-a', 'a@example.test');
    user(db, 'staff-b', 'b@example.test');
    membership(db, 'staff-a-m', 'org-a', 'staff-a', 'teacher');
    membership(db, 'staff-b-m', 'org-b', 'staff-b', 'teacher');
    const listed = await listStaff(env(db), auth);
    expect(listed.members).toHaveLength(2);
    expect(JSON.stringify(listed)).not.toContain('b@example.test');
    expect(await updateMembership(env(db), auth, 'admin-a', { active: false })).toBe('self');
    const otherAuth = { ...auth, userId: 'staff-a' };
    expect(await updateMembership(env(db), otherAuth, 'admin-a', { active: false })).toBe(
      'last_admin',
    );
    expect(
      (
        db.db.prepare('SELECT active FROM organization_memberships WHERE id=?').get('admin-a') as {
          active: number;
        }
      ).active,
    ).toBe(1);
    db.close();
  });
  it('allows only one of two concurrent administrator removals', async () => {
    const db = new SqliteD1();
    base(db);
    user(db, 'admin2', 'admin2@example.test');
    membership(db, 'admin2-a', 'org-a', 'admin2', 'organization_admin');
    user(db, 'operator', 'operator@example.test');
    membership(db, 'operator-a', 'org-a', 'operator', 'teacher');
    const operator = { ...auth, userId: 'operator' };
    const raced = await Promise.all([
      updateMembership(env(db), operator, 'admin-a', { active: false }),
      updateMembership(env(db), operator, 'admin2-a', { active: false }),
    ]);
    expect(raced.filter((value) => value === 'ok')).toHaveLength(1);
    expect(raced.filter((value) => value === 'last_admin')).toHaveLength(1);
    expect(
      (
        db.db
          .prepare(
            "SELECT count(*) count FROM organization_memberships WHERE organization_id='org-a' AND active=1 AND role IN ('system_admin','organization_admin')",
          )
          .get() as { count: number }
      ).count,
    ).toBe(1);
    db.close();
  });
  it('rolls back membership and switch mutations when their audit write fails', async () => {
    const db = new SqliteD1();
    base(db);
    user(db, 'staff', 'staff@example.test');
    membership(db, 'staff-a', 'org-a', 'staff', 'teacher');
    db.failBatchAt = 2;
    await expect(updateMembership(env(db), auth, 'staff-a', { active: false })).rejects.toThrow(
      'injected_sql_failure',
    );
    expect(
      (
        db.db.prepare('SELECT active FROM organization_memberships WHERE id=?').get('staff-a') as {
          active: number;
        }
      ).active,
    ).toBe(1);
    db.failBatchAt = 2;
    await expect(switchOrganization(env(db), 'admin', 'nonexistent', 'org-b')).rejects.toThrow(
      'injected_sql_failure',
    );
    expect(db.count('audit_log')).toBe(0);
    db.close();
  });
  it('invalidates the old token on resend and keeps failed delivery retryable', async () => {
    const db = new SqliteD1();
    base(db);
    await invitation(db, 'i1', 'org-a', 'new@example.test', 'teacher', token);
    let delivered = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        delivered = String(init?.body);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    expect(await resendInvitation(env(db), auth, 'i1')).toEqual({ ok: true });
    expect(await inspectInvitation(env(db), token)).toBeNull();
    expect(delivered).not.toContain('token_hash');
    expect(
      (
        db.db
          .prepare('SELECT delivery_status FROM organization_invitations WHERE id=?')
          .get('i1') as { delivery_status: string }
      ).delivery_status,
    ).toBe('sent');
    db.close();
  });
  it('persists failed delivery only in the trusted tenant and exposes it for retry', async () => {
    const db = new SqliteD1();
    base(db);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('relay down')));
    expect(await createInvitation(env(db), auth, 'retry@example.test', 'teacher')).toEqual({
      deliveryFailed: true,
    });
    const current = await listStaff(env(db), auth);
    expect(current.invitations).toHaveLength(1);
    expect(current.invitations[0]).toMatchObject({
      email: 'retry@example.test',
      deliveryStatus: 'failed',
    });
    const other = await listStaff(env(db), { ...auth, organizationId: 'org-b' });
    expect(other.invitations).toHaveLength(0);
    db.close();
  });
  it('classifies malformed, expired, revoked, and used tokens with real constraints', async () => {
    const db = new SqliteD1();
    base(db);
    expect(await inspectInvitation(env(db), 'bad')).toBeNull();
    for (const [id, t, state] of [
      ['expired', 'b'.repeat(43), 'expired'],
      ['revoked', 'c'.repeat(43), 'revoked'],
      ['used', 'd'.repeat(43), 'used'],
    ] as const) {
      await invitation(
        db,
        id,
        'org-a',
        `${id}@example.test`,
        'teacher',
        t,
        'admin',
        id === 'expired' ? '2000-01-01T00:00:00.000Z' : undefined,
      );
      if (id === 'revoked')
        db.db.prepare('UPDATE organization_invitations SET revoked_at=? WHERE id=?').run(now, id);
      if (id === 'used')
        db.db.prepare('UPDATE organization_invitations SET accepted_at=? WHERE id=?').run(now, id);
      expect((await inspectInvitation(env(db), t))?.state).toBe(state);
    }
    db.close();
  });
  it('atomically replaces a prior session only on successful acceptance', async () => {
    const db = new SqliteD1();
    base(db);
    const hash = await hashSecret('old-session', 'pepper');
    db.db
      .prepare(
        'INSERT INTO sessions (id,user_id,token_hash,active_organization_id,expires_at,absolute_expires_at,last_seen_at,created_at) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run('old', 'admin', hash, 'org-a', '2999-01-01', '2999-01-01', now, now);
    await invitation(db, 'i1', 'org-a', 'new@example.test', 'teacher', token);
    db.failBatchAt = 3;
    expect(await acceptInvitation(env(db), token, request, 'old')).toBeNull();
    expect(
      (
        db.db.prepare('SELECT revoked_at FROM sessions WHERE id=?').get('old') as {
          revoked_at: null;
        }
      ).revoked_at,
    ).toBeNull();
    db.failBatchAt = 0;
    expect(await acceptInvitation(env(db), token, request, 'old')).toBeTruthy();
    expect(
      (
        db.db.prepare('SELECT revoked_at FROM sessions WHERE id=?').get('old') as {
          revoked_at: string;
        }
      ).revoked_at,
    ).not.toBeNull();
    db.close();
  });
  it('recovers only through the session user active memberships in active organizations', async () => {
    const db = new SqliteD1();
    base(db);
    organization(db, 'org-off', 'Off', 0);
    membership(db, 'admin-off', 'org-off', 'admin', 'teacher');
    db.db.prepare('UPDATE organization_memberships SET active=0 WHERE id=?').run('admin-a');
    const orgs = await listOrganizations(env(db), 'admin');
    expect(orgs.map((o) => o.organization_id)).toEqual(['org-b']);
    expect(await switchOrganization(env(db), 'admin', 'missing', 'org-off')).toBe(false);
    db.close();
  });
});
