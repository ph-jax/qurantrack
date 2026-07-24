import { describe, expect, it } from 'vitest';
import { consumeMagicLink } from '../../../worker/auth/service';
import { hashSecret } from '../../../shared/auth/crypto';
import type {
  D1DatabaseLike,
  D1PreparedStatement,
  D1Result,
} from '../../../src/domain/repositories/types';

class Statement implements D1PreparedStatement {
  private values: unknown[] = [];
  constructor(
    private readonly db: AuthDb,
    private readonly sql: string,
  ) {}
  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }
  async first<T>() {
    return this.db.first<T>(this.sql);
  }
  async all<T>() {
    return this.db.all<T>();
  }
  async run() {
    return this.db.run(this.sql, this.values);
  }
}

class AuthDb implements D1DatabaseLike {
  public sessions = 0;
  private loginUsedAt: string | null = null;
  constructor(private readonly tokenHash: string) {}
  prepare(query: string) {
    return new Statement(this, query);
  }
  async batch() {
    return [];
  }
  async first<T>(sql: string): Promise<T | null> {
    if (sql.includes('FROM login_tokens'))
      return {
        id: 'login1',
        email: 'staff@example.com',
        token_hash: this.tokenHash,
        expires_at: '2999-01-01T00:00:00.000Z',
        used_at: this.loginUsedAt,
      } as T;
    if (sql.includes('FROM users'))
      return { id: 'user1', email: 'staff@example.com', active: 1, display_name: 'Staff' } as T;
    return null;
  }
  async all<T>(): Promise<D1Result<T>> {
    return {
      success: true,
      results: [
        {
          organization_id: 'org1',
          role: 'teacher',
          active: 1,
          org_active: 1,
          org_name: 'Org',
          org_slug: 'org',
          email_sender_name: 'Org',
          email_reply_to: 'reply@example.com',
        } as T,
      ],
    };
  }
  async run(sql: string, values: unknown[]): Promise<D1Result> {
    if (sql.startsWith('UPDATE login_tokens')) {
      if (this.loginUsedAt) return { success: true, meta: { changes: 0 } };
      this.loginUsedAt = String(values[0]);
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.startsWith('INSERT INTO sessions')) this.sessions += 1;
    return { success: true, meta: { changes: 1 } };
  }
}

describe('magic-link consume atomicity', () => {
  it('creates at most one session for repeated consumption of one token', async () => {
    const token = 'plain-login-token';
    const db = new AuthDb(await hashSecret(token, 'pepper'));
    const env = { DB: db, TOKEN_HASH_PEPPER: 'pepper' } as never;
    await expect(
      consumeMagicLink(env, token, new Request('https://app.test/auth/consume')),
    ).resolves.toBeTruthy();
    await expect(
      consumeMagicLink(env, token, new Request('https://app.test/auth/consume')),
    ).resolves.toBeNull();
    expect(db.sessions).toBe(1);
  });
});
