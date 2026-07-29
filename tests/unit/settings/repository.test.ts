import { describe, expect, it, vi } from 'vitest';
import { getOrganizationSettings } from '../../../worker/organizations/settings';

describe('organization settings repository tenant context', () => {
  it('binds only the trusted active organization identifier', async () => {
    const first = vi.fn().mockResolvedValue(null);
    const bind = vi.fn(() => ({ first }));
    const prepare = vi.fn((sql: string) => {
      expect(sql).toContain('organizations');
      return { bind };
    });
    await getOrganizationSettings({ prepare } as unknown as D1Database, 'session-org');
    expect(bind).toHaveBeenCalledWith('session-org');
    expect(prepare.mock.calls[0][0]).toContain('WHERE id = ?');
  });
});
