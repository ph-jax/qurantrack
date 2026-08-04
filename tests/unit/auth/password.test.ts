import { describe, expect, it, vi } from 'vitest';
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
    expect(a.work_factor).toBe(100_000);
    expect(PASSWORD_WORK_FACTOR).toBe(100_000);
    expect(a.salt).not.toBe(b.salt);
    expect(await verifyPassword('a secure Unicode passphrase 🔐', 'pepper', a)).toBe(true);
    expect(await verifyPassword('incorrect password here', 'pepper', a)).toBe(false);
  });
  it('uses the credential work factor during verification instead of the creation default', async () => {
    const deriveBits = vi.spyOn(crypto.subtle, 'deriveBits');
    const credential = await hashPassword('stored factor password', 'pepper');
    credential.work_factor = 1;
    expect(await verifyPassword('stored factor password', 'pepper', credential)).toBe(false);
    expect(deriveBits).toHaveBeenLastCalledWith(
      expect.objectContaining({ iterations: 1 }),
      expect.anything(),
      expect.anything(),
    );
    deriveBits.mockRestore();
  });
  it('never asks Web Crypto for more than the Cloudflare Workers maximum', async () => {
    const deriveBits = vi.spyOn(crypto.subtle, 'deriveBits');
    await hashPassword('cloudflare compatible password', 'pepper');
    expect(deriveBits).toHaveBeenCalledWith(
      expect.objectContaining({ iterations: 100_000 }),
      expect.anything(),
      expect.anything(),
    );
    expect(
      deriveBits.mock.calls.every(
        ([algorithm]) =>
          typeof algorithm === 'string' ||
          !('iterations' in algorithm) ||
          algorithm.iterations <= 100_000,
      ),
    ).toBe(true);
    deriveBits.mockRestore();
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
    expect(validatePasswordPolicy('a'.repeat(7), 'staff@example.com')).toBe('PASSWORD_TOO_SHORT');
    expect(validatePasswordPolicy('a'.repeat(8), 'staff@example.com')).toBeNull();
    expect(validatePasswordPolicy('a'.repeat(128), 'staff@example.com')).toBeNull();
    expect(validatePasswordPolicy('a'.repeat(129), 'staff@example.com')).toBe('PASSWORD_TOO_LONG');
    expect(validatePasswordPolicy('staff@example.com', 'staff@example.com')).toBe(
      'PASSWORD_EQUALS_EMAIL',
    );
    expect(validatePasswordPolicy('🔐'.repeat(128), 'staff@example.com')).toBeNull();
    expect(validatePasswordPolicy('🔐'.repeat(129), 'staff@example.com')).toBe('PASSWORD_TOO_LONG');
    expect(validatePasswordPolicy(' şifre  ', 'staff@example.com')).toBeNull();
  });
});
