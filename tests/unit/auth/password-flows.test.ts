import { afterEach, describe, expect, it, vi } from 'vitest';
import { SqliteD1, membership, now, organization, user } from '../../helpers/sqliteD1';
import {
  consumePasswordReset,
  passwordLogin,
  requestPasswordReset,
  setPassword,
} from '../../../worker/auth/password-service';
import {
  hashPassword,
  verifyPassword,
  type PasswordCredential,
} from '../../../worker/auth/password';
import { hashSecret } from '../../../shared/auth/crypto';

const env = (db: SqliteD1) =>
  ({
    DB: db,
    TOKEN_HASH_PEPPER: 'token-pepper',
    PASSWORD_HASH_PEPPER: 'password-pepper',
    APP_BASE_URL: 'https://app.test',
    MAIL_RELAY_URL: 'https://relay.test',
    MAIL_RELAY_SECRET: 'relay-secret',
    MAIL_DEFAULT_FROM_ALIAS: 'sender@example.test',
    MAIL_APPROVED_FROM_ALIASES: 'sender@example.test',
  }) as never;
const request = new Request('https://app.test/api/v1/auth/password/login', {
  headers: { 'cf-connecting-ip': '192.0.2.4', 'user-agent': 'test' },
});
afterEach(() => vi.unstubAllGlobals());
async function fixture() {
  const db = new SqliteD1();
  organization(db, 'org-a', 'Org A');
  user(db, 'staff', 'staff@example.test');
  membership(db, 'm', 'org-a', 'staff', 'teacher');
  const value = await hashPassword('correct horse battery staple', 'password-pepper');
  db.db
    .prepare(
      'INSERT INTO user_password_credentials(user_id,algorithm,work_factor,salt,password_hash,created_at,updated_at,password_changed_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(
      'staff',
      value.algorithm,
      value.work_factor,
      value.salt,
      value.password_hash,
      now,
      now,
      now,
    );
  return db;
}
const credential = (db: SqliteD1) =>
  db.db
    .prepare(
      'SELECT algorithm,work_factor,salt,password_hash FROM user_password_credentials WHERE user_id=?',
    )
    .get('staff') as unknown as PasswordCredential;

describe('password login failures and sessions', () => {
  it('does not consume account or shared-IP failure allowance on success and writes a safe audit', async () => {
    const db = await fixture();
    expect(
      await passwordLogin(
        env(db),
        'staff@example.test',
        'correct horse battery staple',
        undefined,
        request,
      ),
    ).toBeTruthy();
    expect(db.count('authentication_rate_limits')).toBe(0);
    expect(db.db.prepare('SELECT action,summary,metadata_json FROM audit_log').get()).toEqual({
      action: 'password_login_succeeded',
      summary: 'password login succeeded',
      metadata_json: null,
    });
    db.close();
  });
  it('does not increment an existing shared-IP failure counter on a later success', async () => {
    const db = await fixture();
    await passwordLogin(
      env(db),
      'unknown@example.test',
      'wrong password value',
      undefined,
      request,
    );
    expect(
      await passwordLogin(
        env(db),
        'staff@example.test',
        'correct horse battery staple',
        undefined,
        request,
      ),
    ).toBeTruthy();
    expect(
      db.db
        .prepare("SELECT attempt_count FROM authentication_rate_limits WHERE purpose='password_ip'")
        .get(),
    ).toEqual({ attempt_count: 1 });
    db.close();
  });
  it('counts only failed attempts and applies both account and IP limits', async () => {
    const db = await fixture();
    expect(
      await passwordLogin(
        env(db),
        'staff@example.test',
        'wrong password value',
        undefined,
        request,
      ),
    ).toBeNull();
    expect(
      db.db
        .prepare('SELECT purpose,attempt_count FROM authentication_rate_limits ORDER BY purpose')
        .all(),
    ).toEqual([
      { purpose: 'password_account', attempt_count: 1 },
      { purpose: 'password_ip', attempt_count: 1 },
    ]);
    for (let i = 0; i < 4; i++)
      await passwordLogin(
        env(db),
        'staff@example.test',
        'wrong password value',
        undefined,
        request,
      );
    expect(
      await passwordLogin(
        env(db),
        'staff@example.test',
        'correct horse battery staple',
        undefined,
        request,
      ),
    ).toBeNull();
    expect(db.count('sessions')).toBe(0);
    db.close();
  });
  it('uses the generic failure path for unknown and passwordless accounts', async () => {
    const db = await fixture();
    user(db, 'without', 'without@example.test');
    membership(db, 'without-m', 'org-a', 'without', 'teacher');
    await expect(
      passwordLogin(
        env(db),
        'missing@example.test',
        'some sufficiently long password',
        undefined,
        request,
      ),
    ).resolves.toBeNull();
    await expect(
      passwordLogin(
        env(db),
        'without@example.test',
        'some sufficiently long password',
        undefined,
        request,
      ),
    ).resolves.toBeNull();
    db.close();
  });
});

describe('atomic password management', () => {
  it('rotates every session, preserves the active organization, and audits in one batch', async () => {
    const db = await fixture();
    db.db
      .prepare(
        'INSERT INTO sessions(id,user_id,token_hash,active_organization_id,expires_at,absolute_expires_at,last_seen_at,created_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run('old', 'staff', 'old-hash', 'org-a', '2999', '2999', now, now);
    const result = await setPassword(
      env(db),
      { userId: 'staff', email: 'staff@example.test', organizationId: 'org-a' },
      'correct horse battery staple',
      'an entirely new secure password',
      request,
    );
    expect('session' in result).toBe(true);
    expect(
      (
        db.db.prepare('SELECT revoked_at FROM sessions WHERE id=?').get('old') as {
          revoked_at: string | null;
        }
      ).revoked_at,
    ).not.toBeNull();
    expect(
      db.db.prepare('SELECT active_organization_id FROM sessions WHERE id<>?').get('old'),
    ).toEqual({ active_organization_id: 'org-a' });
    expect(
      db.db.prepare("SELECT action FROM audit_log WHERE action='password_changed'").get(),
    ).toEqual({ action: 'password_changed' });
    db.close();
  });
  it('rolls credential, revocation, replacement session, and audit back together', async () => {
    const db = await fixture();
    const before = credential(db);
    db.failBatchAt = 3;
    const result = await setPassword(
      env(db),
      { userId: 'staff', email: 'staff@example.test', organizationId: 'org-a' },
      'correct horse battery staple',
      'an entirely new secure password',
      request,
    );
    expect(result).toEqual({ error: 'PASSWORD_CHANGE_FAILED' });
    expect(credential(db)).toEqual(before);
    expect(db.count('sessions')).toBe(0);
    expect(db.count('audit_log')).toBe(0);
    db.close();
  });
});

describe('password reset race protection', () => {
  it('stores a purpose-separated peppered request IP hash', async () => {
    const db = await fixture();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    await requestPasswordReset(env(db), 'staff@example.test', request);
    const expected = await hashSecret('password-reset-ip:192.0.2.4', 'token-pepper');
    expect(db.db.prepare('SELECT request_ip_hash FROM password_reset_tokens').get()).toEqual({
      request_ip_hash: expected,
    });
    db.close();
  });
  it('allows only one racing consumer and revokes all sessions atomically', async () => {
    const db = await fixture();
    const token = 'r'.repeat(43),
      hash = await hashSecret(`password-reset:${token}`, 'token-pepper');
    db.db
      .prepare(
        'INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at,request_ip_hash,created_at) VALUES(?,?,?,?,?,?)',
      )
      .run('reset', 'staff', hash, '2999-01-01', 'peppered-ip', now);
    db.db
      .prepare(
        'INSERT INTO sessions(id,user_id,token_hash,active_organization_id,expires_at,absolute_expires_at,last_seen_at,created_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run('old', 'staff', 'old-hash', 'org-a', '2999', '2999', now, now);
    const results = await Promise.all([
      consumePasswordReset(env(db), token, 'first replacement password'),
      consumePasswordReset(env(db), token, 'second replacement password'),
    ]);
    expect(results.sort()).toEqual(['INVALID', 'OK']);
    expect(db.count('password_reset_consumptions')).toBe(1);
    expect(
      (
        db.db.prepare('SELECT revoked_at FROM sessions WHERE id=?').get('old') as {
          revoked_at: string | null;
        }
      ).revoked_at,
    ).not.toBeNull();
    expect(
      (await verifyPassword('first replacement password', 'password-pepper', credential(db))) ||
        (await verifyPassword('second replacement password', 'password-pepper', credential(db))),
    ).toBe(true);
    expect(
      db.db.prepare("SELECT count(*) count FROM audit_log WHERE action='password_reset'").get(),
    ).toEqual({ count: 1 });
    db.close();
  });
});
