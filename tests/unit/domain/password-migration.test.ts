import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
const migrations = [
  '0001_core_schema.sql',
  '0002_organization_email_sender_alias.sql',
  '0003_organization_invitations.sql',
  '0004_password_authentication.sql',
];
describe('password authentication migration', () => {
  it('applies after all existing migrations with foreign keys and indexes', () => {
    const db = new DatabaseSync(':memory:');
    for (const file of migrations) db.exec(readFileSync(`migrations/${file}`, 'utf8'));
    const objects = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index')")
      .all()
      .map((r: any) => r.name);
    expect(objects).toContain('user_password_credentials');
    expect(objects).toContain('password_reset_tokens');
    expect(objects).toContain('authentication_rate_limits');
    expect(objects).toContain('idx_password_reset_user_active');
    expect(db.prepare("PRAGMA foreign_key_list('user_password_credentials')").all()).toHaveLength(
      1,
    );
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
});
