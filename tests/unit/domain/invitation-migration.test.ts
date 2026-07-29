import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  SqliteD1,
  base,
  invitation,
  membership,
  now,
  organization,
  user,
} from '../../helpers/sqliteD1';

const migrations = [
  '0001_core_schema.sql',
  '0002_organization_email_sender_alias.sql',
  '0003_organization_invitations.sql',
];

function apply(db: DatabaseSync, names: string[]) {
  db.exec('PRAGMA foreign_keys=ON');
  for (const name of names) db.exec(readFileSync(`migrations/${name}`, 'utf8'));
}

function schemaObjects(db: DatabaseSync) {
  return db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE name IN (
         'organization_invitations',
         'organization_invitation_acceptances',
         'idx_organization_invitations_one_usable',
         'idx_organization_invitations_admin',
         'validate_organization_invitation_acceptance'
       ) ORDER BY name`,
    )
    .all()
    .map((row) => row.name);
}

describe('organization invitation migration', () => {
  it('applies the complete migration chain to a fresh local database', () => {
    const db = new DatabaseSync(':memory:');
    apply(db, migrations);
    expect(schemaObjects(db)).toEqual([
      'idx_organization_invitations_admin',
      'idx_organization_invitations_one_usable',
      'organization_invitation_acceptances',
      'organization_invitations',
      'validate_organization_invitation_acceptance',
    ]);
    db.close();
  });

  it('applies migration 0003 to a local database already containing 0001 and 0002', () => {
    const db = new DatabaseSync(':memory:');
    apply(db, migrations.slice(0, 2));
    expect(schemaObjects(db)).toEqual([]);
    apply(db, migrations.slice(2));
    expect(schemaObjects(db)).toHaveLength(5);
    db.close();
  });

  it('keeps the CASE parenthesized for the remote D1 trigger parser', () => {
    const sql = readFileSync('migrations/0003_organization_invitations.sql', 'utf8');
    expect(sql).toContain('SELECT (CASE WHEN NOT EXISTS (');
    expect(sql).toContain("THEN RAISE(ABORT, 'invitation_not_usable') END);");
    expect(sql).toContain('Local SQLite execution alone does not verify this D1');
  });
});

describe('organization invitation acceptance trigger', () => {
  async function fixture() {
    const db = new SqliteD1();
    base(db);
    user(db, 'invitee', 'invitee@example.test');
    await invitation(db, 'invite', 'org-a', 'invitee@example.test', 'teacher', 't'.repeat(43));
    db.db
      .prepare(
        `INSERT INTO sessions
         (id,user_id,token_hash,active_organization_id,expires_at,absolute_expires_at,last_seen_at,created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        'invitee-session',
        'invitee',
        'session-token-hash',
        'org-a',
        '2999-01-01',
        '2999-01-01',
        now,
        now,
      );
    return db;
  }

  function claim(db: SqliteD1) {
    return () =>
      db.db
        .prepare(
          `INSERT INTO organization_invitation_acceptances
           (invitation_id,user_id,session_id,accepted_at) VALUES (?,?,?,?)`,
        )
        .run('invite', 'invitee', 'invitee-session', now);
  }

  it('allows a valid invitation acceptance claim', async () => {
    const db = await fixture();
    expect(claim(db)).not.toThrow();
    expect(db.count('organization_invitation_acceptances')).toBe(1);
    db.close();
  });

  it.each([
    [
      'expired invitation',
      "UPDATE organization_invitations SET expires_at='2000-01-01' WHERE id='invite'",
    ],
    [
      'revoked invitation',
      `UPDATE organization_invitations SET revoked_at='${now}' WHERE id='invite'`,
    ],
    [
      'already-accepted invitation',
      `UPDATE organization_invitations SET accepted_at='${now}' WHERE id='invite'`,
    ],
    ['inactive organization', "UPDATE organizations SET active=0 WHERE id='org-a'"],
    ['inactive user', "UPDATE users SET active=0 WHERE id='invitee'"],
    ['mismatched user', "UPDATE users SET email='different@example.test' WHERE id='invitee'"],
  ])('rejects a claim for an %s', async (_reason, mutation) => {
    const db = await fixture();
    db.db.exec(mutation);
    expect(claim(db)).toThrow('invitation_not_usable');
    expect(db.count('organization_invitation_acceptances')).toBe(0);
    db.close();
  });

  it('rejects a claim when an active membership already exists', async () => {
    const db = await fixture();
    membership(db, 'invitee-membership', 'org-a', 'invitee', 'read_only');
    expect(claim(db)).toThrow('invitation_not_usable');
    expect(db.count('organization_invitation_acceptances')).toBe(0);
    db.close();
  });

  it('does not treat an inactive membership as an existing active membership', async () => {
    const db = await fixture();
    membership(db, 'invitee-membership', 'org-a', 'invitee', 'read_only', 0);
    expect(claim(db)).not.toThrow();
    db.close();
  });

  it('rejects a claim associated with a different inactive organization', async () => {
    const db = await fixture();
    organization(db, 'org-off', 'Inactive organization', 0);
    db.db.exec("UPDATE organization_invitations SET organization_id='org-off' WHERE id='invite'");
    expect(claim(db)).toThrow('invitation_not_usable');
    db.close();
  });
});
