import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Keep jsdom projects within the memory available to local and hosted CI runners.
    maxWorkers: 4,
    projects: [
      {
        test: {
          name: 'node-sqlite',
          environment: 'node',
          include: [
            'tests/unit/auth/manual-teacher.test.ts',
            'tests/unit/auth/memberships-database.test.ts',
            'tests/unit/auth/password-flows.test.ts',
            'tests/unit/domain/invitation-migration.test.ts',
            'tests/unit/domain/password-migration.test.ts',
            'tests/unit/pilot-mvp.test.ts',
          ],
        },
      },
      {
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['tests/**/*.test.{ts,tsx}'],
          exclude: [
            'tests/unit/auth/manual-teacher.test.ts',
            'tests/unit/auth/memberships-database.test.ts',
            'tests/unit/auth/password-flows.test.ts',
            'tests/unit/domain/invitation-migration.test.ts',
            'tests/unit/domain/password-migration.test.ts',
            'tests/unit/pilot-mvp.test.ts',
          ],
          setupFiles: ['tests/setup.ts'],
        },
      },
    ],
  },
});
