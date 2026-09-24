import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { installProviderGuard, type CredentialsAuthorize } from "./lib/authProvider";
import {
  describeSignInFailure,
  INVALID_TOTP,
  TOTP_REQUIRED,
} from "./lib/signInErrors";

/**
 * Convex Auth setup (T1: Auth & sessions).
 *
 * Credentials auth with hashed passwords (scrypt via the Password provider),
 * fully offline: no external identity provider is contacted at any point.
 * Sessions are local JWTs issued by the Convex JWT issuer configured in
 * convex.config.ts + auth.config.ts.
 *
 * Two hardening layers sit between the library and the client:
 *
 *  1. **Uniform failures (item 56).** @convex-dev/auth answers an unknown
 *     address with `InvalidAccountId`, a bad password with `InvalidSecret` and
 *     a lockout with `TooManyFailedAttempts` — all three leak whether an
 *     account exists. Every sign-in rejection is rewritten to a single message
 *     before it leaves the server. Sign-up is exempt on purpose: registration
 *     has to say "that address is taken".
 *
 *  2. **Optional TOTP (item 55).** After the password check passes, we ask the
 *     backend whether the account has an enrolled second factor. If it does, a
 *     live 6-digit code is required and `authorize` throws *before* the library
 *     calls `callSignIn` — so a wrong or missing code never mints a session.
 *     The client retries with `{ flow: "signIn", totp }` on `TOTP_REQUIRED`.
 */

const passwordProvider = Password({
  profile(params: Record<string, unknown>) {
    return {
      name:
        (params.name as string) ??
        ((params.email as string)?.split("@")[0] ?? "User"),
      email: params.email as string,
    };
  },
});

/**
 * The authority on whether a second factor is required and valid.
 * Runs in the action context that @convex-dev/auth hands to `authorize`.
 */
async function enforceSecondFactor(
  ctx: unknown,
  params: Record<string, unknown>,
  userId: string,
): Promise<void> {
  const actionCtx = ctx as {
    runQuery: (ref: unknown, args: unknown) => Promise<{ required: boolean }>;
    runMutation: (
      ref: unknown,
      args: unknown,
    ) => Promise<{ ok: boolean; marker?: string }>;
  };
  const challenge = await actionCtx.runQuery(internal.mfa.signInChallenge, { userId });
  if (!challenge.required) return;

  const code = typeof params.totp === "string" ? params.totp : "";
  // No code yet → tell the client to prompt. Nothing is signed in.
  if (!code) throw new Error(TOTP_REQUIRED);

  const result = await actionCtx.runMutation(internal.mfa.verifySecondFactor, {
    userId,
    code,
  });
  if (!result.ok) throw new Error(result.marker ?? INVALID_TOTP);
}

async function enforceDisabledCheck(ctx: unknown, userId: string): Promise<void> {
  const actionCtx = ctx as {
    runQuery: (ref: unknown, args: unknown) => Promise<boolean>;
  };
  const disabled = await actionCtx.runQuery(internal.users.isUserDisabled, { userId: userId as never });
  if (disabled) {
    throw new Error("ACCOUNT_DISABLED");
  }
}

/** Wrap the authorize function that actually runs (see lib/authProvider.ts). */
function hardenAuthorize(authorize: CredentialsAuthorize): CredentialsAuthorize {
  return async (params, ctx) => {
    let result: { userId: string; sessionId?: string } | null;
    try {
      result = await authorize(params, ctx);
    } catch (error) {
      throw new Error(describeSignInFailure(error, params.flow as string | undefined));
    }
    if (params.flow === "signIn" && result?.userId) {
      // Password check passed! Now verify if the account is disabled.
      await enforceDisabledCheck(ctx, result.userId);

      // Deliberately outside the catch above: the password already checked
      // out, so a second-factor failure must reach the client as its own
      // marker rather than being flattened into "invalid email or password".
      await enforceSecondFactor(ctx, params, result.userId);
    }
    return result;
  };
}

const guarded = installProviderGuard(passwordProvider, hardenAuthorize);

// Note: whether the guard is actually installed is asserted at runtime by
// `lib/securityChecks.ts` (T5 `sec.auth_guard_installed`) rather than exported
// as a constant. Convex modules should export Convex functions only, and the
// check is more useful when it re-inspects the live provider shape.

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [guarded.provider],
});
