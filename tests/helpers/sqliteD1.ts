import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
class SqliteStatement {
  values: unknown[] = [];
  constructor(
    readonly owner: SqliteD1,
    readonly sql: string,
  ) {}
  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }
  async first<T>() {
    return (
      (this.owner.db.prepare(this.sql).get(...(this.values as SQLInputValue[])) as T | undefined) ??
      null
    );
  }
  async all<T>() {
    return {
      success: true,
      results: this.owner.db.prepare(this.sql).all(...(this.values as SQLInputValue[])) as T[],
    };
  }
  async run() {
    const value = this.owner.db.prepare(this.sql).run(...(this.values as SQLInputValue[]));
    return {
      success: true,
      meta: { changes: Number(value.changes), last_row_id: Number(value.lastInsertRowid) },
    };
  }
}
export class SqliteD1 {
  db = new DatabaseSync(':memory:');
  failBatchAt = 0;
  private batchQueue: Promise<unknown> = Promise.resolve();
  constructor() {
    this.db.exec('PRAGMA foreign_keys=ON');
    for (const migration of [
      '0001_core_schema.sql',
      '0002_organization_email_sender_alias.sql',
      '0003_organization_invitations.sql',
    ])
      this.db.exec(readFileSync(`migrations/${migration}`, 'utf8'));
  }
  prepare(sql: string) {
    return new SqliteStatement(this, sql);
  }
  async batch(statements: SqliteStatement[]) {
    const operation = this.batchQueue.then(() => this.executeBatch(statements));
    this.batchQueue = operation.catch(() => undefined);
    return operation;
  }
  private async executeBatch(statements: SqliteStatement[]) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (let index = 0; index < statements.length; index++) {
        if (this.failBatchAt === index + 1) throw new Error('injected_sql_failure');
        results.push(await statements[index].run());
      }
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  close() {
    this.db.close();
  }
  count(table: string) {
    return Number(
      (this.db.prepare(`SELECT count(*) count FROM ${table}`).get() as { count: number }).count,
    );
  }
}
export const now = '2026-07-29T12:00:00.000Z';
export function organization(db: SqliteD1, id: string, name = id, active = 1, locale = 'en') {
  db.db
    .prepare(
      `INSERT INTO organizations (id,slug,name,email_sender_name,email_reply_to,active,created_at,updated_at,default_locale) VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(id, id, name, name, 'reply@example.test', active, now, now, locale);
}
export function user(db: SqliteD1, id: string, email: string, active = 1) {
  db.db
    .prepare(
      'INSERT INTO users (id,email,display_name,active,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    )
    .run(id, email, id, active, now, now);
}
export function membership(
  db: SqliteD1,
  id: string,
  org: string,
  userId: string,
  role: string,
  active = 1,
) {
  db.db
    .prepare(
      'INSERT INTO organization_memberships (id,organization_id,user_id,role,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
    )
    .run(id, org, userId, role, active, now, now);
}
export async function invitation(
  db: SqliteD1,
  id: string,
  org: string,
  email: string,
  role: string,
  token: string,
  inviter = 'admin',
  expires = '2999-01-01T00:00:00.000Z',
) {
  const { hashSecret } = await import('../../shared/auth/crypto');
  const hash = await hashSecret(`organization-invitation:v1:${token}`, 'pepper');
  db.db
    .prepare(
      'INSERT INTO organization_invitations (id,organization_id,normalized_email,role,token_hash,invited_by_user_id,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
    )
    .run(id, org, email, role, hash, inviter, expires, now, now);
}
export function base(db: SqliteD1) {
  organization(db, 'org-a', 'Organization A');
  organization(db, 'org-b', 'Organization B');
  user(db, 'admin', 'admin@example.test');
  membership(db, 'admin-a', 'org-a', 'admin', 'organization_admin');
  membership(db, 'admin-b', 'org-b', 'admin', 'organization_admin');
}
