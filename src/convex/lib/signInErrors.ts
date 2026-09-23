/**
 * Uniform authentication failure reporting (security item 56: no account
 * enumeration).
 *
 * @convex-dev/auth distinguishes failures in a way clients can observe:
 *
 *   | situation                 | error the library throws |
 *   |---------------------------|--------------------------|
 *   | email has no account      | `InvalidAccountId`       |
 *   | account exists, bad pass  | `InvalidSecret`          |
 *   | account locked out        | `TooManyFailedAttempts`  |
 *
 * Any of those three tells an attacker whether an address is registered, so
 * every one of them is collapsed into a single message before it reaches the
 * client. Genuine protocol errors (a missing `flow` param, a password that
 * fails the length policy) are *not* about account existence and stay as-is —
 * otherwise sign-up becomes unexplainable.
 *
 * Deliberate trade-off: a locked-out account also sees the uniform message, so
 * the lockout state is not exposed. Lockouts are still recorded in the audit
 * trail for organizers.
 */

/** The single error every credential sign-in failure reports. */
export const UNIFORM_SIGN_IN_ERROR = "Invalid email or password";

/**
 * Marker thrown when the password was correct but a TOTP code is required.
 * The client uses it to reveal the second-factor input and retry; because the
 * throw happens *before* a session is minted, no session leaks.
 */
export const TOTP_REQUIRED = "TOTP_REQUIRED";

/** Marker for a supplied-but-wrong second factor. */
export const INVALID_TOTP = "INVALID_TOTP_CODE";

/** Marker for a second factor that is locked out after repeated failures. */
export const TOTP_LOCKED = "TOTP_LOCKED";

/**
 * Marker for a second factor whose secret cannot be read (the deployment's
 * data key was lost or rotated without re-enrolment). Distinct from
 * `TOTP_REQUIRED` so the client does not loop forever asking for a code that
 * can never validate — an admin has to reset the factor.
 */
export const TOTP_UNAVAILABLE = "TOTP_UNAVAILABLE";

/** Errors that reveal whether an account exists. */
const ENUMERATING_ERRORS = new Set([
  "InvalidAccountId",
  "InvalidSecret",
  "TooManyFailedAttempts",
  "Invalid credentials",
  "Invalid email or password",
]);

/** True when `error` leaks account existence. */
export function isEnumeratingError(error: unknown): boolean {
  return ENUMERATING_ERRORS.has(errorMessage(error));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

/**
 * Map an `authorize` rejection onto the message the client should see.
 * `flow` lets sign-up keep its own (necessarily) explicit errors.
 */
export function describeSignInFailure(error: unknown, flow?: string): string {
  const message = errorMessage(error);
  // Sign-up has to say "this email is taken" or nobody can register.
  if (flow === "signUp") return message || "Could not create the account";
  if (ENUMERATING_ERRORS.has(message)) return UNIFORM_SIGN_IN_ERROR;
  // Anything unrecognised (protocol misuse, password policy, TOTP markers)
  // passes through untouched.
  return message || UNIFORM_SIGN_IN_ERROR;
}

/** True for the second-factor markers the client reacts to. */
export function isSecondFactorMarker(message: string): boolean {
  return (
    message === TOTP_REQUIRED ||
    message === INVALID_TOTP ||
    message === TOTP_LOCKED ||
    message === TOTP_UNAVAILABLE
  );
}

/**
 * Human copy for the auth screen, keeping library internals off the UI.
 * Unknown markers degrade to a generic retry message.
 */
export function describeSignInFailureForUser(message: string): string {
  switch (message) {
    case TOTP_REQUIRED:
      return "Enter the 6-digit code from your authenticator app";
    case INVALID_TOTP:
      return "That code is not valid — check your authenticator app and try again";
    case TOTP_LOCKED:
      return "Too many incorrect codes. Try again in a few minutes.";
    case TOTP_UNAVAILABLE:
      return "Two-factor is misconfigured on this account — ask an admin to reset it.";
    default:
      return message;
  }
}
