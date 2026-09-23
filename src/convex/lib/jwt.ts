/**
 * Offline RS256 session-JWT verification for the REST layer.
 *
 * Why this exists
 * ---------------
 * `src/convex/http.ts` resolves the caller from an `Authorization: Bearer`
 * header, because Convex HTTP actions do not carry an auth identity the way
 * queries and mutations do. The original implementation **base64-decoded the
 * payload and trusted it** — no signature check, no expiry check, no issuer
 * check. Anyone could hand-craft
 *
 *     {"sub": "<admin users._id>|<anything>", "exp": 9999999999}
 *
 * and read organizer-only CSV exports or run the acceptance suite. That is a
 * fail-open authorization check (security item 63) and it made every
 * token-gated endpoint unsecured (item 70).
 *
 * The fix verifies the token locally against the deployment's own JWKS, which
 * `@convex-dev/auth` publishes through `JWT_PRIVATE_KEY` / `JWKS` env vars
 * (see scripts/generate-auth-keys.mjs and backend/entrypoint.sh). No network
 * call, so this stays fully offline.
 *
 * Checks performed, all of which must pass:
 *   - exactly three dot-separated segments, header and payload are JSON
 *   - `alg` is exactly `RS256` (rejects `none` and HS256 key-confusion tricks)
 *   - an RSA key with a matching `kid` (or a single key) exists in the JWKS
 *   - the RSA-PKCS1-v1_5/SHA-256 signature verifies over `<header>.<payload>`
 *   - `exp` is in the future and `nbf`/`iat` are not in the future
 *   - `iss` matches the deployment's site URL, when configured
 *   - `aud` contains the expected application id, when configured
 */

export interface JwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

export interface JwtClaims {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  [claim: string]: unknown;
}

export interface VerifyJwtOptions {
  /** The `JWKS` env var contents (`{"keys":[{...}]}`) or the parsed object. */
  jwks: string | { keys: unknown[] } | undefined;
  /** Expected `iss` (CONVEX_SITE_URL). Skipped when undefined/empty. */
  issuer?: string;
  /** Expected `aud` (Convex Auth uses "convex"). Skipped when undefined. */
  audience?: string;
  nowMs?: number;
  /** Leeway in seconds for exp/nbf/iat (default 5). */
  clockSkewSeconds?: number;
}

export type VerifyJwtResult =
  | { ok: true; header: JwtHeader; claims: JwtClaims }
  | { ok: false; reason: string };

const encoder = new TextEncoder();

/** base64url → bytes (Uint8Array). Throws on malformed input. */
export function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** base64url → UTF-8 string. */
export function base64UrlDecode(input: string): string {
  return new TextDecoder().decode(base64UrlToBytes(input));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse the JWKS env var, tolerating a pre-parsed object. */
export function parseJwks(jwks: VerifyJwtOptions["jwks"]): Record<string, unknown>[] {
  if (!jwks) return [];
  try {
    const parsed = typeof jwks === "string" ? JSON.parse(jwks) : jwks;
    const keys = isObject(parsed) ? parsed.keys : undefined;
    if (!Array.isArray(keys)) return [];
    return keys.filter(isObject);
  } catch {
    return [];
  }
}

/**
 * Verify a session JWT. Returns a discriminated result instead of throwing so
 * callers decide how loud to be; a failure is always a denial.
 */
export async function verifyJwt(
  token: string,
  options: VerifyJwtOptions,
): Promise<VerifyJwtResult> {
  const parts = (token ?? "").split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed token" };

  let header: JwtHeader;
  let claims: JwtClaims;
  try {
    header = JSON.parse(base64UrlDecode(parts[0])) as JwtHeader;
    claims = JSON.parse(base64UrlDecode(parts[1])) as JwtClaims;
  } catch {
    return { ok: false, reason: "malformed token payload" };
  }
  if (!isObject(header) || !isObject(claims)) return { ok: false, reason: "malformed token" };

  // Reject "none" and symmetric algorithms outright: accepting them (or
  // honouring the header's choice) is the classic JWT key-confusion bug.
  if (header.alg !== "RS256") return { ok: false, reason: `unsupported alg: ${header.alg ?? "none"}` };

  const keys = parseJwks(options.jwks);
  if (keys.length === 0) return { ok: false, reason: "no verification keys configured" };
  const jwk = header.kid ? keys.find((k) => k.kid === header.kid) : keys.length === 1 ? keys[0] : undefined;
  if (!jwk) return { ok: false, reason: "no matching key id" };

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      jwk as JsonWebKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    return { ok: false, reason: "unusable verification key" };
  }

  let signature: Uint8Array;
  try {
    signature = base64UrlToBytes(parts[2]);
  } catch {
    return { ok: false, reason: "malformed signature" };
  }

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature as unknown as ArrayBuffer,
    encoder.encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) return { ok: false, reason: "signature mismatch" };

  // ---- claims ----
  const now = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const skew = options.clockSkewSeconds ?? 5;

  if (typeof claims.exp !== "number") return { ok: false, reason: "missing exp" };
  if (claims.exp + skew < now) return { ok: false, reason: "token expired" };
  if (typeof claims.nbf === "number" && claims.nbf - skew > now) {
    return { ok: false, reason: "token not yet valid" };
  }
  if (typeof claims.iat === "number" && claims.iat - skew > now) {
    return { ok: false, reason: "token issued in the future" };
  }

  if (options.issuer) {
    const expected = options.issuer.replace(/\/+$/, "");
    const actual = typeof claims.iss === "string" ? claims.iss.replace(/\/+$/, "") : undefined;
    if (actual !== expected) return { ok: false, reason: "issuer mismatch" };
  }
  if (options.audience) {
    const aud = claims.aud;
    const list = Array.isArray(aud) ? aud : typeof aud === "string" ? [aud] : [];
    if (!list.includes(options.audience)) return { ok: false, reason: "audience mismatch" };
  }
  if (typeof claims.sub !== "string" || claims.sub.length === 0) {
    return { ok: false, reason: "missing subject" };
  }

  return { ok: true, header, claims };
}

/**
 * `@convex-dev/auth` session JWTs carry `sub = "<users._id>|<sessionId>"`.
 * Returns the user id, or null when the subject is not in that shape.
 */
export function userIdFromSubject(subject: string | undefined): string | null {
  if (typeof subject !== "string" || subject.length === 0) return null;
  const [userId] = subject.split("|");
  return userId && userId.length > 0 ? userId : null;
}
