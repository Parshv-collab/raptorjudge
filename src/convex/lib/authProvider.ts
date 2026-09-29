/**
 * Guarding hook for @convex-dev/auth credentials providers.
 *
 * Why this exists
 * ---------------
 * `Password({...})` returns `ConvexCredentials(config)`, which the library
 * shapes as:
 *
 *     { id: "credentials", type: "credentials", authorize: async () => null, options: config }
 *
 * The *real* `authorize` lives in `options`, and at materialization time the
 * library does `merge(provider, provider.options)` — so `options.authorize`
 * overwrites the top-level stub. Overriding the top-level `authorize` therefore
 * has no runtime effect, which is a silent failure mode: the wrapper would
 * compile and simply never run.
 *
 * This module wraps the function that actually gets called, and refuses to do
 * anything when the expected shape is absent so a library upgrade degrades to
 * "unhardened" rather than "broken sign-in". `tests/authProvider.test.ts`
 * asserts against the real `Password()` output so a shape change fails CI
 * instead of quietly disabling the guard.
 */

/** A credentials `authorize` function, as called by @convex-dev/auth. */
export type CredentialsAuthorize = (
  credentials: Record<string, unknown>,
  ctx: unknown,
) => Promise<{ userId: string; sessionId?: string } | null>;

interface ProviderWithOptions {
  options?: Record<string, unknown> & { authorize?: CredentialsAuthorize };
}

/**
 * Return a copy of `provider` whose runtime `authorize` is `guard(original)`.
 * Returns the provider untouched when the expected shape is missing.
 */
export function guardProviderAuthorize<T>(provider: T, guard: (authorize: CredentialsAuthorize) => CredentialsAuthorize): T {
  const withOptions = provider as unknown as ProviderWithOptions;
  const options = withOptions?.options;
  const authorize = options?.authorize;
  if (!options || typeof authorize !== "function") return provider;
  return {
    ...(provider as object),
    options: { ...options, authorize: guard(authorize) },
  } as T;
}

/** True when {@link guardProviderAuthorize} found something to wrap. */
export function hasGuardableAuthorize(provider: unknown): boolean {
  const options = (provider as ProviderWithOptions | undefined)?.options;
  return typeof options?.authorize === "function";
}

/**
 * Feature-detect the provider shape at module load and hand back both the
 * provider to register and whether the guard is actually active, so callers can
 * surface the state (dashboard/acceptance) instead of assuming it worked.
 */
export function installProviderGuard<T>(
  provider: T,
  guard: (authorize: CredentialsAuthorize) => CredentialsAuthorize,
): { provider: T; guarded: boolean } {
  const guarded = hasGuardableAuthorize(provider);
  return {
    provider: guarded ? guardProviderAuthorize(provider, guard) : provider,
    guarded,
  };
}
