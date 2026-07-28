import { describe, expect, it } from 'vitest';
import { canEditSettings } from '../../../src/features/settings/types';

describe('settings UI authorization', () => {
  it('only enables mutations for administrator roles', () => {
    expect(canEditSettings('system_admin')).toBe(true);
    expect(canEditSettings('organization_admin')).toBe(true);
    expect(canEditSettings('teacher')).toBe(false);
    expect(canEditSettings('read_only')).toBe(false);
  });
});
