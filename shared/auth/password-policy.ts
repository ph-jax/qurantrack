export const PASSWORD_MIN_CODE_POINTS = 8;
export const PASSWORD_MAX_CODE_POINTS = 128;

export type PasswordPolicyError =
  'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG' | 'PASSWORD_EQUALS_EMAIL';

/** Counts Unicode code points (rather than UTF-16 code units) in every runtime. */
export function passwordCodePointLength(password: string): number {
  return Array.from(password).length;
}

export function validatePasswordPolicy(
  password: string,
  normalizedEmail?: string,
): PasswordPolicyError | null {
  const length = passwordCodePointLength(password);
  if (length < PASSWORD_MIN_CODE_POINTS) return 'PASSWORD_TOO_SHORT';
  if (length > PASSWORD_MAX_CODE_POINTS) return 'PASSWORD_TOO_LONG';
  if (normalizedEmail !== undefined && password === normalizedEmail) return 'PASSWORD_EQUALS_EMAIL';
  return null;
}

export function passwordPolicyTranslationKey(error: PasswordPolicyError) {
  return error === 'PASSWORD_TOO_SHORT'
    ? 'security.passwordTooShort'
    : error === 'PASSWORD_TOO_LONG'
      ? 'security.passwordTooLong'
      : 'security.passwordEqualsEmail';
}
