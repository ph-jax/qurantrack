export const PASSWORD_ALGORITHM = 'PBKDF2-HMAC-SHA-256' as const;
/** Maximum PBKDF2 iteration count supported by the deployed Cloudflare Workers runtime. */
export const PASSWORD_WORK_FACTOR = 100_000;
export const PASSWORD_SALT_BYTES = 16;
export const PASSWORD_HASH_BYTES = 32;
export {
  PASSWORD_MAX_CODE_POINTS,
  PASSWORD_MIN_CODE_POINTS,
  passwordCodePointLength,
  validatePasswordPolicy,
  type PasswordPolicyError,
} from '../../shared/auth/password-policy';

export interface PasswordCredential {
  algorithm: string;
  work_factor: number;
  salt: string;
  password_hash: string;
}

function encode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decode(value: string): Uint8Array {
  const padded =
    value.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function derive(password: string, pepper: string, salt: Uint8Array, iterations: number) {
  const material = new TextEncoder().encode(`${password}\u0000${pepper}`);
  const key = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt).buffer, iterations },
      key,
      PASSWORD_HASH_BYTES * 8,
    ),
  );
}

export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1)
    difference |= (left[index % left.length] ?? 0) ^ (right[index % right.length] ?? 0);
  return difference === 0;
}

export async function hashPassword(password: string, pepper: string): Promise<PasswordCredential> {
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
  const hash = await derive(password, pepper, salt, PASSWORD_WORK_FACTOR);
  return {
    algorithm: PASSWORD_ALGORITHM,
    work_factor: PASSWORD_WORK_FACTOR,
    salt: encode(salt),
    password_hash: encode(hash),
  };
}

export async function verifyPassword(
  password: string,
  pepper: string,
  credential: PasswordCredential,
): Promise<boolean> {
  if (credential.algorithm !== PASSWORD_ALGORITHM || credential.work_factor < 1) return false;
  const actual = await derive(password, pepper, decode(credential.salt), credential.work_factor);
  return constantTimeEqual(actual, decode(credential.password_hash));
}

/** Runs the production KDF when no credential is available, reducing enumeration timing signals. */
export async function dummyPasswordVerification(password: string, pepper: string): Promise<void> {
  await derive(password, pepper, new Uint8Array(PASSWORD_SALT_BYTES), PASSWORD_WORK_FACTOR);
}
