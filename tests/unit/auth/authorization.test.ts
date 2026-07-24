import { describe, expect, it } from 'vitest';
import { can, type Role } from '../../../worker/auth/service';

describe('role authorization', () => {
  it('does not promote teachers to administrator roles', () => {
    expect(can('teacher', ['organization_admin', 'system_admin'])).toBe(false);
    expect(can('system_admin', ['system_admin'])).toBe(true);
    expect(
      (['system_admin', 'organization_admin', 'teacher', 'read_only'] satisfies Role[]).length,
    ).toBe(4);
  });
});
