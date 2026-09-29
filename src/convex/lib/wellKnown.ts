/**
 * OpenID Connect discovery for the self-hosted deployment (offline-friendly).
 *
 * Why this file exists
 * --------------------
 * `auth.addHttpRoutes(http)` from @convex-dev/auth registers
 * `/.well-known/openid-configuration`, but that built-in handler returns only
 * three fields:
 *
 *     { issuer, jwks_uri, authorization_endpoint }
 *
 * That is enough for Convex's own JWT verification, but it is *not* a valid
 * OIDC Discovery document. Strict OpenID/OAuth clients (and the auth-provider
 * discovery step some deployments perform) reject it with:
 *
 *     Auth provider discovery of http://<host>:3211 failed
 *       — Failed to parse server response
 *
 * OIDC Discovery 1.0 requires `response_types_supported`,
 * `subject_types_supported` and `id_token_signing_alg_values_supported`; RFC
 * 8414 additionally requires `issuer` plus at least one of jwks_uri /
 * authorization_endpoint, and recommends the rest.
 *
 * So we keep `auth.addHttpRoutes()` as the single source of truth for *which*
 * routes exist (it also mounts `/.well-known/jwks.json`, which JWT
 * verification depends on, and the OAuth routes if a provider is ever added),
 * and swap only the discovery document's body for a complete one.
 *
 * Everything here is static and derived from CONVEX_SITE_URL — no network
 * access, so the deployment stays fully offline.
 */

/** The exact shape we serve at `/.well-known/openid-configuration`. */
export interface OpenIdConfiguration {
  issuer: string;
  jwks_uri: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  response_types_supported: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  scopes_supported: string[];
  claims_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
}

/**
 * Build the full OIDC discovery document for `issuer` (i.e. CONVEX_SITE_URL).
 *
 * Derived URLs follow the same convention as @convex-dev/auth's own routes so
 * that a client which resolves them lands on real endpoints.
 */
export function buildOpenIdConfiguration(issuer: string): OpenIdConfiguration {
  // Never emit a trailing slash, so `${issuer}/x` cannot become `//x`.
  const base = issuer.replace(/\/+$/, "");
  return {
    issuer: base,
    jwks_uri: `${base}/.well-known/jwks.json`,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    userinfo_endpoint: `${base}/oauth/userinfo`,
    response_types_supported: ["code", "id_token", "token id_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    scopes_supported: ["openid", "profile", "email"],
    claims_supported: ["sub", "iss", "aud", "exp", "iat", "email", "name"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "none"],
  };
}

/** Required fields per OIDC Discovery 1.0 + RFC 8414. Used by tests + acceptance. */
export const REQUIRED_DISCOVERY_FIELDS = [
  "issuer",
  "jwks_uri",
  "authorization_endpoint",
  "response_types_supported",
  "subject_types_supported",
  "id_token_signing_alg_values_supported",
] as const;

/**
 * True when `doc` carries every field a strict OIDC client requires.
 * Accepts any object shape (e.g. a parsed JSON response) so callers do not
 * have to widen their own types.
 */
export function isCompleteDiscoveryDocument(doc: object): boolean {
  const record = doc as Record<string, unknown>;
  return REQUIRED_DISCOVERY_FIELDS.every((field) => {
    const value = record[field];
    if (Array.isArray(value)) return value.length > 0;
    return typeof value === "string" && value.length > 0;
  });
}

/** Headers for the discovery + jwks responses (matches the upstream max-age). */
export const DISCOVERY_CACHE_CONTROL =
  "public, max-age=15, stale-while-revalidate=15, stale-if-error=86400";

/** The path @convex-dev/auth registers with an incomplete document. */
export const DISCOVERY_PATH = "/.well-known/openid-configuration";

/** Minimal structural view of `HttpRouter` — keeps this module runtime-agnostic and testable. */
export interface RouterLike {
  route(spec: {
    path?: string;
    pathPrefix?: string;
    method: string;
    handler: unknown;
  }): void;
}

/**
 * Mount @convex-dev/auth's HTTP routes on `router`, upgrading only the OIDC
 * discovery document.
 *
 * `auth.addHttpRoutes` both (a) registers `/.well-known/jwks.json`, which JWT
 * verification needs, and (b) registers the three-field discovery document we
 * want to replace. Because `HttpRouter.route` *throws* on a duplicate
 * path+method, we cannot register ours afterwards — so we intercept the
 * registration itself: every route passes through untouched except the
 * discovery path, which is registered with `makeDiscoveryHandler()` instead.
 *
 * Extracted from http.ts so the interception (the part that would break the
 * whole deployment if it regressed) is covered by unit tests.
 */
export function mountAuthHttpRoutes(
  router: RouterLike,
  addAuthRoutes: (router: RouterLike) => void,
  makeDiscoveryHandler: () => unknown,
): void {
  addAuthRoutes({
    route(spec) {
      if (spec.path === DISCOVERY_PATH) {
        router.route({
          path: DISCOVERY_PATH,
          method: "GET",
          handler: makeDiscoveryHandler(),
        });
        return;
      }
      // Everything else (jwks.json, /api/auth/*) stays owned by the library.
      router.route(spec);
    },
  });
}
