import { describe, expect, it } from 'vitest';
import {
  constantTimeEqual,
  hashPassword,
  PASSWORD_ALGORITHM,
  PASSWORD_WORK_FACTOR,
  validatePasswordPolicy,
  verifyPassword,
} from '../../../worker/auth/password';

describe('password authentication primitives', () => {
  it('uses production metadata, random salts, and verifies without fast password hashing', async () => {
    const a = await hashPassword('a secure Unicode passphrase 🔐', 'pepper');
    const b = await hashPassword('a secure Unicode passphrase 🔐', 'pepper');
    expect(a.algorithm).toBe(PASSWORD_ALGORITHM);
    expect(a.work_factor).toBe(600_000);
    expect(PASSWORD_WORK_FACTOR).toBe(600_000);
    expect(a.salt).not.toBe(b.salt);
    expect(await verifyPassword('a secure Unicode passphrase 🔐', 'pepper', a)).toBe(true);
    expect(await verifyPassword('incorrect password here', 'pepper', a)).toBe(false);
  });
  it('preserves spaces and Unicode', async () => {
    const value = '  uzun güvenli parola 🔐  ';
    const c = await hashPassword(value, 'pepper');
    expect(await verifyPassword(value, 'pepper', c)).toBe(true);
    expect(await verifyPassword(value.trim(), 'pepper', c)).toBe(false);
  });
  it('compares byte arrays across equal, unequal, and different lengths', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(constantTimeEqual(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(false);
  });
  it('enforces policy boundaries and normalized email rejection', () => {
    expect(validatePasswordPolicy('a'.repeat(14), 'staff@example.com')).toBe('PASSWORD_TOO_SHORT');
    expect(validatePasswordPolicy('a'.repeat(15), 'staff@example.com')).toBeNull();
    expect(validatePasswordPolicy('a'.repeat(128), 'staff@example.com')).toBeNull();
    expect(validatePasswordPolicy('a'.repeat(129), 'staff@example.com')).toBe('PASSWORD_TOO_LONG');
    expect(validatePasswordPolicy('staff@example.com', 'staff@example.com')).toBe(
      'PASSWORD_EQUALS_EMAIL',
    );
  });
});
