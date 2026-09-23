/**
 * Same-origin return-path sanitizer (security item 69: open redirects).
 *
 * The sign-in page sends a signed-in user to `?returnTo=<path>` so a protected
 * route can be resumed. Passing that value straight to the router is an open
 * redirect: `/auth?returnTo=https://evil.example` (or `//evil.example`, which a
 * browser reads as a protocol-relative absolute URL) would bounce the freshly
 * authenticated user to an attacker's site, with the login flow's context as
 * bait and a plausible-looking origin in the history.
 *
 * `safeReturnTo` therefore returns the value only when it is a single-slash,
 * same-origin *path*. Everything else falls back to the caller's default. It is
 * deliberately conservative: unknown query/fragment content is preserved, but
 * nothing that can change the origin survives.
 */

/** Path characters that must not appear in a same-origin return target. */
const CONTROL_OR_SPACE = /[\u0000-\u001f\u007f\s]/;

/**
 * Returns `raw` when it is a safe same-origin path, otherwise `fallback`.
 *
 * Rejected (each of these has been used as a redirect bypass at some point):
 *   - absolute URLs          `https://evil.example`, `http://…`
 *   - protocol-relative      `//evil.example`, `/\evil.example`, `/\\evil`
 *   - scheme-ish             `javascript:…`, `data:…`, `mailto:…`
 *   - backslash tricks       `\evil.example`, `\/\/evil.example`
 *   - non-path values        `auth`, `?x=1`, `#x`
 *   - encoded separators     `/%2F%2Fevil.example`, `/%5Cevil`
 *   - embedded controls      newlines/tabs used to split headers
 */
export function safeReturnTo(
  raw: string | null | undefined,
  fallback: string,
): string {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim();
  if (value.length === 0 || value.length > 2000) return fallback;

  // Must be a path: starts with exactly one forward slash.
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  // A second slash anywhere in the first segment would still be origin-relative.
  if (/^\/[\\/]/.test(value)) return fallback;
  // Backslashes are normalised to slashes by browsers.
  if (value.includes("\\")) return fallback;
  if (CONTROL_OR_SPACE.test(value)) return fallback;
  // Scheme smuggled in before the path, e.g. "javascript:alert(1)" after a
  // decode step, or "https:/evil" style confusion.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return fallback;

  // Percent-encoded separators must not decode into `//` or `\`.
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || decoded.includes("\\")) return fallback;
  } catch {
    return fallback; // malformed escape sequence
  }

  // Must not contain a scheme-looking colon in the first path segment.
  const firstSegment = value.slice(1).split(/[/?#]/)[0];
  if (firstSegment.includes(":")) return fallback;

  return value;
}

/**
 * Default destination after authentication. Only a same-origin path is ever
 * returned, so this can be used directly in a redirect.
 */
export function resolveReturnTo(raw: string | null | undefined, fallback: string): string {
  return safeReturnTo(raw, safeReturnTo(fallback, "/"));
}
