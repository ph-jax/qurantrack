import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
const migrations = [
  '0001_core_schema.sql',
  '0002_organization_email_sender_alias.sql',
  '0003_organization_invitations.sql',
  '0004_password_authentication.sql',
  '0005_cloudflare_password_work_factor.sql',
];
describe('password authentication migration', () => {
  it('applies after all existing migrations with foreign keys and indexes', () => {
    const db = new DatabaseSync(':memory:');
    for (const file of migrations) db.exec(readFileSync(`migrations/${file}`, 'utf8'));
    const objects = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index','trigger')")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(objects).toContain('user_password_credentials');
    expect(objects).toContain('password_reset_tokens');
    expect(objects).toContain('password_reset_consumptions');
    expect(objects).toContain('validate_password_reset_consumption');
    expect(objects).toContain('authentication_rate_limits');
    expect(objects).toContain('idx_password_reset_user_active');
    expect(db.prepare("PRAGMA foreign_key_list('user_password_credentials')").all()).toHaveLength(
      1,
    );
  });
  it('upgrades a database already containing migrations 0001 through 0003', () => {
    const db = new DatabaseSync(':memory:');
    for (const file of migrations.slice(0, 3)) db.exec(readFileSync(`migrations/${file}`, 'utf8'));
    expect(
      db.prepare("SELECT 1 FROM sqlite_master WHERE name='user_password_credentials'").get(),
    ).toBeUndefined();
    db.exec(readFileSync('migrations/0004_password_authentication.sql', 'utf8'));
    expect(
      db.prepare("SELECT type FROM sqlite_master WHERE name='user_password_credentials'").get(),
    ).toEqual({ type: 'table' });
    expect(
      db
        .prepare("SELECT type FROM sqlite_master WHERE name='validate_password_reset_consumption'")
        .get(),
    ).toEqual({ type: 'trigger' });
    db.close();
  });
  it('enforces credential uniqueness, algorithm, work factor, and reset token uniqueness', () => {
    const db = new DatabaseSync(':memory:');
    for (const file of migrations) db.exec(readFileSync(`migrations/${file}`, 'utf8'));
    db.prepare(
      "INSERT INTO users(id,email,display_name,created_at,updated_at) VALUES('u','u@example.test','U','n','n')",
    ).run();
    expect(() =>
      db
        .prepare("INSERT INTO user_password_credentials VALUES('u','bad',600000,?,?,'n','n','n')")
        .run('x'.repeat(22), 'x'.repeat(43)),
    ).toThrow();
    expect(() =>
      db
        .prepare(
          "INSERT INTO user_password_credentials VALUES('u','PBKDF2-HMAC-SHA-256',1,?,?,'n','n','n')",
        )
        .run('x'.repeat(22), 'x'.repeat(43)),
    ).toThrow();
    db.prepare(
      "INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at,request_ip_hash,created_at) VALUES('r','u','hash','later','ip','now')",
    ).run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at,request_ip_hash,created_at) VALUES('r2','u','hash','later','ip','now')",
        )
        .run(),
    ).toThrow();
  });
  it('preserves credentials while upgrading the work-factor constraint after 0004', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys=ON');
    for (const file of migrations.slice(0, 4)) db.exec(readFileSync(`migrations/${file}`, 'utf8'));
    db.prepare(
      "INSERT INTO users(id,email,display_name,created_at,updated_at) VALUES('u','u@example.test','U','n','n')",
    ).run();
    const insert = db.prepare('INSERT INTO user_password_credentials VALUES(?,?,?,?,?,?,?,?)');
    expect(() =>
      insert.run(
        'u',
        'PBKDF2-HMAC-SHA-256',
        100_000,
        's'.repeat(22),
        'h'.repeat(43),
        'created',
        'updated',
        'changed',
      ),
    ).toThrow();
    insert.run(
      'u',
      'PBKDF2-HMAC-SHA-256',
      600_000,
      's'.repeat(22),
      'h'.repeat(43),
      'created',
      'updated',
      'changed',
    );

    db.exec(readFileSync('migrations/0005_cloudflare_password_work_factor.sql', 'utf8'));

    expect(db.prepare('SELECT * FROM user_password_credentials WHERE user_id=?').get('u')).toEqual({
      user_id: 'u',
      algorithm: 'PBKDF2-HMAC-SHA-256',
      work_factor: 600_000,
      salt: 's'.repeat(22),
      password_hash: 'h'.repeat(43),
      created_at: 'created',
      updated_at: 'updated',
      password_changed_at: 'changed',
    });
    db.prepare(
      "INSERT INTO users(id,email,display_name,created_at,updated_at) VALUES('u2','u2@example.test','U2','n','n')",
    ).run();
    insert.run(
      'u2',
      'PBKDF2-HMAC-SHA-256',
      100_000,
      's'.repeat(22),
      'h'.repeat(43),
      'created',
      'updated',
      'changed',
    );
    expect(() =>
      db
        .prepare('UPDATE user_password_credentials SET work_factor=? WHERE user_id=?')
        .run(99_999, 'u2'),
    ).toThrow();
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    db.close();
  });
});
