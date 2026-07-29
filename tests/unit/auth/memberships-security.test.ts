import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routes = readFileSync('worker/index.ts', 'utf8');
const service = readFileSync('worker/organizations/memberships.ts', 'utf8');
const migration = readFileSync('migrations/0003_organization_invitations.sql', 'utf8');

describe('Phase 3B1 tenant and privilege boundaries', () => {
  it('protects every administration route for administrators only', () => {
    expect(routes.match(/requireAuth\(\['system_admin', 'organization_admin'\]\)/g)).toHaveLength(
      6,
    );
  });

  it('scopes membership and invitation reads and writes to session organization', () => {
    expect(service).toContain('WHERE m.organization_id=?');
    expect(service).toContain('WHERE organization_id=?');
    expect(service).toContain("if (row.role === 'system_admin') return 'forbidden'");
    expect(service).toContain("if (row.user_id === auth.userId) return 'self'");
  });

  it('never makes system_admin assignable and preserves a final administrator', () => {
    expect(service).toContain("['organization_admin', 'teacher', 'read_only']");
    expect(service).toContain("role IN ('system_admin','organization_admin')");
    expect(service).toContain("return 'last_admin'");
  });

  it('stores one purpose-separated usable invitation per normalized tenant email', () => {
    expect(service).toContain('organization-invitation:v1:');
    expect(migration).toContain('token_hash TEXT NOT NULL UNIQUE');
    expect(migration).toContain('normalized_email = lower(trim(normalized_email))');
    expect(migration).toContain('idx_organization_invitations_one_usable');
    expect(migration).toContain('WHERE accepted_at IS NULL AND revoked_at IS NULL');
  });

  it('uses conditional single-use, expiry, and revocation checks', () => {
    expect(service).toContain('accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?');
    expect(service).toContain('if (changes(consumed) !== 1) return null');
    expect(service).not.toMatch(/metadata.*token|metadata.*email/i);
  });
});
