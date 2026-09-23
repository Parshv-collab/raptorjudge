/**
 * TOTP / HOTP (RFC 6238 + RFC 4226) — pure, dependency-free, offline.
 *
 * Why hand-rolled instead of a package: the whole platform is air-gapped, and
 * a ~120-line RFC implementation with published test vectors is easier to
 * audit than an npm dependency. It uses only Web Crypto (`crypto.subtle`),
 * which Convex queries/mutations, Node 20 and browsers all provide.
 *
 * Used by src/convex/mfa.ts for optional TOTP second factors on admin and
 * organizer accounts (none of this touches the network).
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Digits in a generated code (6 is what every authenticator app defaults to). */
export const TOTP_DIGITS = 6;
/** Time step in seconds (RFC 6238 default). */
export const TOTP_STEP_SECONDS = 30;
/** Accept the previous and next step to tolerate clock skew (±30s). */
export const TOTP_WINDOW = 1;

/** Bytes of entropy in a generated shared secret (160 bits, as RFC 4226 recommends). */
export const TOTP_SECRET_BYTES = 20;

// ------------------------------------------------------------- base32 ------

/** Encode bytes as unpadded RFC 4648 base32 (what authenticator apps expect). */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Decode base32 (case-insensitive; ignores padding and spaces). Throws on bad input. */
export function base32Decode(input: string): Uint8Array {
  const normalized = input.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

// --------------------------------------------------------------- crypto ----

const encoder = new TextEncoder();

async function hmacSha1(keyBytes: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, message as unknown as ArrayBuffer);
  return new Uint8Array(mac);
}

/** RFC 4226 dynamic truncation: the low nibble of the last byte picks a 31-bit window. */
function truncate(mac: Uint8Array): number {
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return binary;
}

/** 8-byte big-endian counter (RFC 4226 §5.1). */
function counterBytes(counter: number): Uint8Array {
  const bytes = new Uint8Array(8);
  // Counters above 2^53 never occur in practice, but splitting keeps the
  // bit math exact for the full 64-bit range.
  let high = Math.floor(counter / 2 ** 32);
  let low = counter >>> 0;
  for (let i = 7; i >= 4; i--) {
    bytes[i] = low & 0xff;
    low = Math.floor(low / 256);
  }
  for (let i = 3; i >= 0; i--) {
    bytes[i] = high & 0xff;
    high = Math.floor(high / 256);
  }
  return bytes;
}

/** HOTP value for an explicit counter. */
export async function hotp(
  secretBase32: string,
  counter: number,
  digits = TOTP_DIGITS,
): Promise<string> {
  const mac = await hmacSha1(base32Decode(secretBase32), counterBytes(counter));
  const code = truncate(mac) % 10 ** digits;
  return code.toString().padStart(digits, "0");
}

/** Time step counter for a given moment (defaults to now). */
export function totpCounter(nowMs = Date.now(), stepSeconds = TOTP_STEP_SECONDS): number {
  return Math.floor(nowMs / 1000 / stepSeconds);
}

/** TOTP value for a moment in time (defaults to now). */
export async function totp(
  secretBase32: string,
  nowMs = Date.now(),
  digits = TOTP_DIGITS,
  stepSeconds = TOTP_STEP_SECONDS,
): Promise<string> {
  return hotp(secretBase32, totpCounter(nowMs, stepSeconds), digits);
}

/** Seconds remaining in the current step (lets the UI show a countdown). */
export function totpSecondsRemaining(nowMs = Date.now(), stepSeconds = TOTP_STEP_SECONDS): number {
  return stepSeconds - (Math.floor(nowMs / 1000) % stepSeconds);
}

/**
 * Constant-time-ish comparison of two equal-length code strings. Codes are
 * short, so the main win is not short-circuiting on the first wrong digit.
 */
export function codesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a user-supplied code against a secret, tolerating ±`window` steps.
 * Rejects non-numeric input early so we never compare garbage.
 */
export async function verifyTotp(
  secretBase32: string,
  code: string,
  options: {
    nowMs?: number;
    window?: number;
    digits?: number;
    stepSeconds?: number;
  } = {},
): Promise<boolean> {
  const digits = options.digits ?? TOTP_DIGITS;
  const window = options.window ?? TOTP_WINDOW;
  const stepSeconds = options.stepSeconds ?? TOTP_STEP_SECONDS;
  const candidate = (code ?? "").replace(/\s+/g, "");
  if (!new RegExp(`^\\d{${digits}}$`).test(candidate)) return false;

  const center = totpCounter(options.nowMs ?? Date.now(), stepSeconds);
  for (let offset = -window; offset <= window; offset++) {
    const expected = await hotp(secretBase32, center + offset, digits);
    if (codesMatch(expected, candidate)) return true;
  }
  return false;
}

// -------------------------------------------------------------- otpauth ----

/** Fresh random base32 secret for enrolment. */
export function generateTotpSecret(): string {
  const bytes = new Uint8Array(TOTP_SECRET_BYTES);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

/** Build the `otpauth://` URI that Google Authenticator / 1Password / etc. scan. */
export function buildOtpauthUri(options: {
  secret: string;
  accountName: string;
  issuer?: string;
  digits?: number;
  stepSeconds?: number;
}): string {
  const issuer = options.issuer ?? "RaptorJudge";
  const digits = options.digits ?? TOTP_DIGITS;
  const period = options.stepSeconds ?? TOTP_STEP_SECONDS;
  const label = encodeURIComponent(`${issuer}:${options.accountName}`);
  const params = new URLSearchParams({
    secret: options.secret,
    issuer,
    algorithm: "SHA1",
    digits: String(digits),
    period: String(period),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Plain-text secret grouped in 4s, for manual entry when a camera is unavailable. */
export function formatSecretForDisplay(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? []).join(" ");
}

/** Encode a string as base32 (test convenience for RFC vectors). */
export function base32FromString(value: string): string {
  return base32Encode(encoder.encode(value));
}
