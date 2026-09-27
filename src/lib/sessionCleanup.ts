/**
 * Session-token hygiene (issue 17).
 *
 * Convex Auth stores its session JWT and refresh token in sessionStorage under
 * keys matching `__convexAuth*` (e.g. `__convexAuthJWT_raptorjudge`,
 * `__convexAuthRefreshToken_raptorjudge`). Two failure modes this fixes:
 *
 *  1. a stale/broken session survives sign-out and re-attaches on the next
 *     sign-in, so the user lands in a half-authenticated limbo;
 *  2. leftover keys from a previous account confuse the role resolver, which
 *     then spins forever on "Preparing your workspace".
 */

const CONVEX_AUTH_PREFIX = "__convexAuth";

/** Remove every sessionStorage key that belongs to Convex Auth's session. */
export function clearConvexAuthSessionKeys(): number {
  if (typeof window === "undefined" || !window.sessionStorage) return 0;
  const doomed: string[] = [];
  for (let i = 0; i < window.sessionStorage.length; i++) {
    const key = window.sessionStorage.key(i);
    if (key && key.startsWith(CONVEX_AUTH_PREFIX)) doomed.push(key);
  }
  for (const key of doomed) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Storage may be unavailable (private mode) — nothing to do.
    }
  }
  return doomed.length;
}
