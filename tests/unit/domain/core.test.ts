import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  emailSchema,
  guardianSchema,
  idSchema,
  organizationSchema,
} from '../../../src/domain/schemas/core';
import { LevelRepository, StudentRepository } from '../../../src/domain/repositories/core';
import {
  validateHistoricalReferenceDeactivation,
  validateLevelBelongsToTrack,
} from '../../../src/domain/services/coreValidation';
import type { D1DatabaseLike, D1PreparedStatement } from '../../../src/domain/repositories/types';

class MockDb implements D1DatabaseLike {
  public lastQuery = '';
  private boundValues: unknown[] = [];
  constructor(private rows: Record<string, unknown | null>) {}
  prepare(query: string): D1PreparedStatement {
    this.lastQuery = query;
    const statement = {
      bind: (...values: unknown[]) => {
        this.boundValues = values;
        return statement;
      },
      first: async <T>() => (this.rows[String(this.boundValues.join(':'))] as T | null) ?? null,
      all: async <T>() => ({
        success: true,
        results: Object.values(this.rows).filter(Boolean) as T[],
      }),
      run: async () => ({ success: true }),
    };
    return statement;
  }
  async batch() {
    return [];
  }
}

describe('Phase 1 schema migration', () => {
  it('creates the core schema with foreign keys and duplicate constraints', () => {
    const dbPath = join(tmpdir(), `qurantrack-${crypto.randomUUID()}.sqlite`);
    const sql = readFileSync('migrations/0001_core_schema.sql', 'utf8');
    execFileSync('python3', [
      '-c',
      `import sqlite3, pathlib
conn=sqlite3.connect(${JSON.stringify(dbPath)})
conn.execute('PRAGMA foreign_keys = ON')
conn.executescript(pathlib.Path('migrations/0001_core_schema.sql').read_text())
conn.executescript("""
INSERT INTO organizations VALUES ('org1','org-one','Org One',NULL,NULL,'#166534','en','UTC','Sender','reply@example.com','Report',14,30,1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
INSERT INTO program_tracks(id,organization_id,code,name,sort_order,active,created_at,updated_at) VALUES ('track1','org1','reading','Reading',1,1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
INSERT INTO levels(id,organization_id,track_id,code,name,sort_order,active,created_at,updated_at) VALUES ('level1','org1','track1','l1','Level 1',1,1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
INSERT INTO lessons(id,organization_id,level_id,code,name,sort_order,active,created_at,updated_at) VALUES ('lesson1','org1','level1','a','Lesson A',1,1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
INSERT INTO classes(id,organization_id,name,active,created_at,updated_at) VALUES ('class1','org1','Class 1',1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
INSERT INTO students(id,organization_id,external_id,display_name,active,created_at,updated_at) VALUES ('student1','org1','EXT1','Student One',1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
INSERT INTO guardians(id,organization_id,name,email,active,created_at,updated_at) VALUES ('guardian1','org1','Guardian One','guardian@example.com',1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
INSERT INTO class_enrollments VALUES ('enroll1','org1','class1','student1',1,'2026-01-01T00:00:00Z',NULL,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
""")
assert conn.execute('PRAGMA foreign_keys').fetchone()[0] == 1
try:
 conn.execute("INSERT INTO class_enrollments VALUES ('enroll2','org1','class1','student1',1,'2026-01-01T00:00:00Z',NULL,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')")
 raise AssertionError('duplicate active enrollment accepted')
except sqlite3.IntegrityError: pass
print(conn.execute("select count(*) from sqlite_master where type='table'").fetchone()[0])`,
    ]);
    expect(sql).toContain('PRAGMA foreign_keys = ON');
    expect(sql).toContain('CREATE UNIQUE INDEX idx_class_enrollments_one_active');
  });
});

describe('tenant repositories', () => {
  it('always scopes by trusted organizationId and blocks cross-organization IDs', async () => {
    const db = new MockDb({ 'org_a:student_a': { id: 'student_a', organization_id: 'org_a' } });
    const repo = new StudentRepository(db);
    await expect(repo.findById('org_a', 'student_a')).resolves.toMatchObject({ id: 'student_a' });
    await expect(repo.findById('org_b', 'student_a')).resolves.toBeNull();
    expect(db.lastQuery).toContain('organization_id = ? AND id = ?');
  });
});

describe('domain validation', () => {
  it('validates track level relationships and deactivation policy', async () => {
    const levels = new LevelRepository(
      new MockDb({ 'org1:level1': { id: 'level1', organization_id: 'org1', track_id: 'track1' } }),
    );
    await expect(
      validateLevelBelongsToTrack({ levels }, 'org1', 'level1', 'track1'),
    ).resolves.toBeUndefined();
    await expect(
      validateLevelBelongsToTrack({ levels }, 'org1', 'level1', 'track2'),
    ).rejects.toThrow('Level must belong');
    expect(() => validateHistoricalReferenceDeactivation('deactivate')).not.toThrow();
    expect(() => validateHistoricalReferenceDeactivation('delete')).toThrow(
      'deactivated rather than deleted',
    );
  });
});

describe('zod validation', () => {
  it('normalizes emails and rejects invalid IDs and organization fields', () => {
    expect(emailSchema.parse('Demo.User@EXAMPLE.COM')).toBe('demo.user@example.com');
    expect(idSchema.safeParse('../bad').success).toBe(false);
    expect(
      guardianSchema.parse({
        id: 'g1',
        organizationId: 'org1',
        name: 'Demo Guardian',
        email: 'GUARDIAN@EXAMPLE.COM',
        active: true,
      }).email,
    ).toBe('guardian@example.com');
    expect(
      organizationSchema.safeParse({ id: 'o1', slug: 'Demo Org', name: '', primaryColor: 'green' })
        .success,
    ).toBe(false);
  });
});
