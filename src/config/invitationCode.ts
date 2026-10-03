/** Supabase supports email OTP lengths from six through ten digits. */
export const INVITATION_CODE_MIN_LENGTH = 6;
export const INVITATION_CODE_MAX_LENGTH = 10;

/** Validate format only; Supabase verifies the configured code length and token. */
export function isValidInvitationCode(value: string): boolean {
  const code = value.trim();
  return code.length >= INVITATION_CODE_MIN_LENGTH
    && code.length <= INVITATION_CODE_MAX_LENGTH
    && /^[0-9]+$/.test(code);
}
