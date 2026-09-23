/**
 * AES-256-GCM secret box for secrets at rest in Convex (currently the TOTP
 * shared secrets on `users`).
 *
 * Design notes
 * ------------
 * - The data key is a random per-deployment secret kept in the `platform` KV
 *   table (`totp_master_key`), never returned by any query and never logged.
 * - AES-GCM gives confidentiality *and* integrity, so a tampered ciphertext
 *   fails to decrypt instead of silently yielding a wrong secret.
 * - The output is a versioned, self-describing string so a future key rotation
 *   can be rolled out without guessing the format of existing rows.
 *
 * Everything is Web Crypto, so this works in Convex mutations, Node 20 and the
 * browser alike — no network, no external KMS.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Format version prefix. Bump when the algorithm or layout changes. */
export const SECRET_BOX_VERSION = "v1";
/** AES-GCM nonce length. 12 bytes is the recommended size for GCM. */
const IV_BYTES = 12;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
    throw new Error("Malformed secret box payload");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Derive a non-extractable AES-GCM key from the deployment master secret. */
async function boxKey(masterSecret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(masterSecret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypt `plaintext`, returning `v1:<ivHex>:<cipherHex>`. */
export async function sealSecret(masterSecret: string, plaintext: string): Promise<string> {
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);
  const key = await boxKey(masterSecret);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
    key,
    encoder.encode(plaintext),
  );
  return `${SECRET_BOX_VERSION}:${toHex(iv)}:${toHex(new Uint8Array(cipher))}`;
}

/**
 * Decrypt a value produced by {@link sealSecret}.
 * Throws on a malformed payload or an authentication failure (tampering).
 */
export async function openSecret(masterSecret: string, sealed: string): Promise<string> {
  const parts = (sealed ?? "").split(":");
  if (parts.length !== 3 || parts[0] !== SECRET_BOX_VERSION) {
    throw new Error("Unsupported secret box payload");
  }
  const [, ivHex, cipherHex] = parts;
  const iv = fromHex(ivHex);
  if (iv.length !== IV_BYTES) throw new Error("Malformed secret box nonce");
  const key = await boxKey(masterSecret);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
      key,
      fromHex(cipherHex) as unknown as ArrayBuffer,
    );
    return decoder.decode(plain);
  } catch {
    // Never surface the underlying Web Crypto error: it would leak whether the
    // nonce or the ciphertext failed authentication.
    throw new Error("Secret box authentication failed");
  }
}

/** True when a value looks like a {@link sealSecret} payload (already encrypted). */
export function isSealed(sealed: string): boolean {
  return (sealed ?? "").split(":")[0] === SECRET_BOX_VERSION;
}
