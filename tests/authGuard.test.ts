import { describe, it, expect } from "vitest";
import { Password } from "@convex-dev/auth/providers/Password";
import {
  guardProviderAuthorize,
  hasGuardableAuthorize,
  installProviderGuard,
  type CredentialsAuthorize,
} from "../src/convex/lib/authProvider";
import {
  describeSignInFailure,
  describeSignInFailureForUser,
  isEnumeratingError,
  isSecondFactorMarker,
  INVALID_TOTP,
  TOTP_LOCKED,
  TOTP_REQUIRED,
  TOTP_UNAVAILABLE,
  UNIFORM_SIGN_IN_ERROR,
} from "../src/convex/lib/signInErrors";

/**
 * These tests are a contract with @convex-dev/auth. The library materialises a
 * credentials provider with `merge(provider, provider.options)`, so the
 * *runtime* authorize is `options.authorize` — a wrapper installed on the
 * top-level `authorize` would compile and never execute. If the library ever
 * changes that shape, these tests fail loudly instead of silently disabling
 * uniform errors and the TOTP gate.
 */
describe("Credentials provider shape contract", () => {
  const provider = Password({});

  it("keeps the real authorize inside `options`", () => {
    expect(hasGuardableAuthorize(provider)).toBe(true);
    const options = (provider as unknown as { options: { authorize: unknown } }).options;
    expect(typeof options.authorize).toBe("function");
  });

  it("preserves the provider id used for lookup after merging", () => {
    const options = (provider as unknown as { options: Record<string, unknown> }).options;
    expect(options.id).toBe("password");
    expect((provider as unknown as { type: string }).type).toBe("credentials");
  });
});

describe("guardProviderAuthorize", () => {
  const fake = () =>
    ({
      id: "credentials",
      type: "credentials",
      authorize: async () => null, // the library's stub
      options: {
        id: "password",
        authorize: (async () => ({ userId: "u1" })) as CredentialsAuthorize,
      },
    }) as unknown as { options: { id: string; authorize: CredentialsAuthorize } };

  it("wraps options.authorize, not the top-level stub", async () => {
    const original = fake();
    let calls = 0;
    const guarded = guardProviderAuthorize(original, (authorize) => async (params, ctx) => {
      calls++;
      return authorize({ ...params, seen: true }, ctx);
    });

    expect(hasGuardableAuthorize(guarded)).toBe(true);
    const result = await guarded.options.authorize({ email: "a@b.c" }, {});
    expect(calls).toBe(1);
    expect(result).toEqual({ userId: "u1" });
  });

  it("does not mutate the original provider", () => {
    const original = fake();
    const before = original.options.authorize;
    guardProviderAuthorize(original, () => (async () => null) as CredentialsAuthorize);
    expect(original.options.authorize).toBe(before);
  });

  it("can rewrite the outcome (the uniform-error + TOTP path)", async () => {
    const original = fake();
    const guarded = guardProviderAuthorize(original, (authorize) => async (params, ctx) => {
      const result = await authorize(params, ctx);
      if (params.flow === "signIn" && !params.totp) throw new Error(TOTP_REQUIRED);
      return result;
    });

    await expect(guarded.options.authorize({ flow: "signIn" }, {})).rejects.toThrow(TOTP_REQUIRED);
    await expect(guarded.options.authorize({ flow: "signIn", totp: "123456" }, {})).resolves.toEqual({
      userId: "u1",
    });
    await expect(guarded.options.authorize({ flow: "signUp" }, {})).resolves.toEqual({
      userId: "u1",
    });
  });

  it("degrades to the untouched provider when the shape is unexpected", () => {
    const odd = { id: "credentials" } as unknown as { options?: { authorize: CredentialsAuthorize } };
    expect(hasGuardableAuthorize(odd)).toBe(false);
    let ran = false;
    const result = guardProviderAuthorize(odd, () => {
      ran = true;
      return (async () => null) as CredentialsAuthorize;
    });
    expect(result).toBe(odd);
    expect(ran).toBe(false);
  });

  it("installProviderGuard reports whether the guard is live", () => {
    expect(installProviderGuard(fake(), (a) => a).guarded).toBe(true);
    expect(installProviderGuard({} as object, (a) => a).guarded).toBe(false);
  });
});

describe("describeSignInFailure (item 56: no account enumeration)", () => {
  it("collapses every account-existence signal into one message", () => {
    for (const libraryError of [
      "InvalidAccountId", // unknown email
      "InvalidSecret", // wrong password
      "TooManyFailedAttempts", // lockout on a real account
      "Invalid credentials",
    ]) {
      expect(describeSignInFailure(new Error(libraryError), "signIn")).toBe(
        UNIFORM_SIGN_IN_ERROR,
      );
    }
  });

  it("keeps sign-up errors explicit so registration is usable", () => {
    expect(describeSignInFailure(new Error("Account already exists"), "signUp")).toBe(
      "Account already exists",
    );
  });

  it("passes protocol and policy errors through untouched", () => {
    expect(describeSignInFailure(new Error("Invalid password"), "signIn")).toBe("Invalid password");
    expect(describeSignInFailure(new Error(TOTP_REQUIRED), "signIn")).toBe(TOTP_REQUIRED);
    expect(describeSignInFailure(new Error(INVALID_TOTP), "signIn")).toBe(INVALID_TOTP);
    expect(describeSignInFailure(new Error(TOTP_LOCKED), "signIn")).toBe(TOTP_LOCKED);
  });

  it("never returns an empty message for a non-Error rejection", () => {
    expect(describeSignInFailure(undefined, "signIn")).toBe(UNIFORM_SIGN_IN_ERROR);
    expect(describeSignInFailure("", "signIn")).toBe(UNIFORM_SIGN_IN_ERROR);
  });

  it("classifies enumerating errors", () => {
    expect(isEnumeratingError(new Error("InvalidAccountId"))).toBe(true);
    expect(isEnumeratingError(new Error("InvalidSecret"))).toBe(true);
    expect(isEnumeratingError(new Error("Something else"))).toBe(false);
  });

  it("recognises the second-factor markers", () => {
    expect(isSecondFactorMarker(TOTP_REQUIRED)).toBe(true);
    expect(isSecondFactorMarker(INVALID_TOTP)).toBe(true);
    expect(isSecondFactorMarker(TOTP_LOCKED)).toBe(true);
    expect(isSecondFactorMarker(TOTP_UNAVAILABLE)).toBe(true);
    expect(isSecondFactorMarker("Invalid email or password")).toBe(false);
  });

  it("maps markers to user-facing copy", () => {
    expect(describeSignInFailureForUser(TOTP_REQUIRED)).toMatch(/6-digit code/);
    expect(describeSignInFailureForUser(INVALID_TOTP)).toMatch(/not valid/);
    expect(describeSignInFailureForUser(TOTP_LOCKED)).toMatch(/Too many incorrect/);
    expect(describeSignInFailureForUser(TOTP_UNAVAILABLE)).toMatch(/ask an admin/);
    // The uniform marker becomes finished copy for the form (still identical for
    // every credential failure, so nothing about account existence leaks).
    expect(describeSignInFailureForUser(UNIFORM_SIGN_IN_ERROR)).toBe("Invalid email or password.");
    expect(describeSignInFailureForUser("InvalidAccountId")).toBe("Invalid email or password.");
    expect(describeSignInFailureForUser("InvalidSecret")).toBe("Invalid email or password.");
  });

  it("never echoes library internals or stack traces to the form", () => {
    const noisy = [
      "[Request ID: abc] Uncaught Error: InvalidSecret at handler (../convex/auth.ts:88)",
      "ArgumentValidationError: Value does not match validator",
      "",
    ];
    for (const message of noisy) {
      const copy = describeSignInFailureForUser(message);
      expect(copy.length).toBeGreaterThan(0);
      expect(copy).not.toMatch(/at handler|Request ID|ArgumentValidation|:\d+\)/);
    }
    expect(describeSignInFailureForUser("totally unknown failure")).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("explains the sign-up failure modes in plain language", () => {
    expect(describeSignInFailureForUser("Invalid password")).toMatch(/at least 8 characters/);
    expect(describeSignInFailureForUser("Account already exists")).toMatch(/already exists/);
    expect(describeSignInFailureForUser("Invalid email")).toMatch(/valid email/);
    expect(describeSignInFailureForUser("Too many attempts")).toMatch(/Too many attempts/);
  });

  it("never treats an unopenable factor as a retryable prompt", () => {
    // TOTP_UNAVAILABLE must not be confused with "ask for a code again".
    expect(TOTP_UNAVAILABLE).not.toBe(TOTP_REQUIRED);
    expect(describeSignInFailureForUser(TOTP_UNAVAILABLE)).not.toMatch(/Enter the 6-digit/);
  });
});
