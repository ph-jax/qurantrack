import { describe, expect, it } from 'vitest';
import { acceptInvitation } from '../../../worker/organizations/memberships';
import { hashSecret } from '../../../shared/auth/crypto';
class Statement {
  values: unknown[] = [];
  constructor(
    public db: AtomicDb,
    public sql: string,
  ) {}
  bind(...v: unknown[]) {
    this.values = v;
    return this;
  }
  async first<T>() {
    return this.db.first<T>(this.sql);
  }
  async run() {
    return { meta: { changes: 1 } };
  }
  async all() {
    return { results: [] };
  }
}
class AtomicDb {
  claims = 0;
  sessions = 0;
  memberships = 0;
  users = 0;
  failAt = 0;
  claimed = false;
  prepare(sql: string) {
    return new Statement(this, sql);
  }
  async first<T>(sql: string) {
    if (sql.includes('FROM organization_invitations i JOIN organizations'))
      return {
        id: 'i1',
        organization_id: 'org-a',
        normalized_email: 'new@example.test',
        role: 'teacher',
      } as T;
    if (sql.includes('SELECT id,active FROM users')) return null;
    return null;
  }
  async batch(statements: Statement[]) {
    if (this.claimed) throw new Error('unique');
    const snapshot = {
      claims: this.claims,
      sessions: this.sessions,
      memberships: this.memberships,
      users: this.users,
    };
    try {
      for (let i = 0; i < statements.length; i++) {
        if (this.failAt === i + 1) throw new Error('injected');
        const sql = statements[i].sql;
        if (sql.startsWith('INSERT INTO users')) this.users++;
        if (sql.startsWith('INSERT INTO organization_invitation_acceptances')) {
          this.claimed = true;
          this.claims++;
        }
        if (sql.startsWith('INSERT INTO organization_memberships')) this.memberships++;
        if (sql.startsWith('INSERT INTO sessions')) this.sessions++;
      }
      return [];
    } catch (e) {
      Object.assign(this, snapshot);
      this.claimed = false;
      throw e;
    }
  }
}
const request = new Request('https://app.test/invitations/accept');
describe('atomic invitation acceptance', () => {
  it.each([1, 2, 3, 4, 5, 6])(
    'rolls back every side effect when batch write %s fails',
    async (failAt) => {
      const db = new AtomicDb();
      db.failAt = failAt;
      const result = await acceptInvitation(
        { DB: db, TOKEN_HASH_PEPPER: 'pepper' } as never,
        'a'.repeat(43),
        request,
      );
      expect(result).toBeNull();
      expect(db).toMatchObject({ claims: 0, sessions: 0, memberships: 0, users: 0 });
    },
  );
  it('allows exactly one outcome during a double acceptance race', async () => {
    const db = new AtomicDb();
    const env = { DB: db, TOKEN_HASH_PEPPER: 'pepper' } as never;
    const [one, two] = await Promise.all([
      acceptInvitation(env, 'a'.repeat(43), request),
      acceptInvitation(env, 'a'.repeat(43), request),
    ]);
    expect([one, two].filter(Boolean)).toHaveLength(1);
    expect(db).toMatchObject({ claims: 1, sessions: 1, memberships: 1, users: 1 });
  });
  it('uses a purpose-separated hash rather than the login-token hash', async () => {
    const token = 'a'.repeat(43);
    expect(await hashSecret(`organization-invitation:v1:${token}`, 'pepper')).not.toBe(
      await hashSecret(token, 'pepper'),
    );
  });
});
