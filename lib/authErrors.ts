// ============================================================================
// Sign-in errors in plain words
//
// Not being able to log in (no code arriving, "maximum attempts", a code
// that doesn't work) is among the top complaints about other matrimony apps
// (docs/research/competitor-reviews.md). Supabase's own messages ("Email rate
// limit exceeded", "Token has expired or is invalid") don't say what to do,
// so the sign-in screens (Auth, EmailVerification) show these instead.
// ============================================================================

interface AuthErrorLike { message?: string; status?: number; code?: string }

export const TOO_MANY_EMAILS =
  'Too many codes were asked for just now. Please wait a minute and try again, or continue with Google or Apple.';
export const BAD_CODE = "That code isn't right or has expired. Use the code in the newest email, or send a new one.";

/** What to tell the member about a failed sign-in, sign-up, code or reset */
export function authErrorText(error: AuthErrorLike | null | undefined): string {
  const message = error?.message ?? '';
  if (error?.status === 429 || /rate limit|only request this after|too many/i.test(message)) return TOO_MANY_EMAILS;
  if (error?.code === 'otp_expired' || /token has expired|otp.*(expired|invalid)|invalid.*(otp|token)/i.test(message)) return BAD_CODE;
  if (/invalid login credentials/i.test(message)) {
    return "That email and password don't match. Try again, or tap Forgot password.";
  }
  if (/email not confirmed/i.test(message)) {
    return 'This email address hasn\'t been confirmed yet. Create the account again to get a new code.';
  }
  if (/already registered|already been registered|user already exists/i.test(message)) {
    return 'There is already an account with this email. Sign in instead, or tap Forgot password.';
  }
  if (/failed to fetch|network|load failed|timeout/i.test(message)) {
    return 'No connection. Check your internet and try again.';
  }
  return message || 'Something went wrong. Please try again.';
}
