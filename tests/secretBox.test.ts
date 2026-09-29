import { describe, it, expect } from "vitest";
import {
  SECRET_BOX_VERSION,
  isSealed,
  openSecret,
  sealSecret,
} from "../src/convex/lib/secretBox";

/**
 * The secret box protects TOTP shared secrets at rest. These tests pin the
 * three properties we rely on: round-trip fidelity, confidentiality (the
 * plaintext is not recoverable from the payload), and integrity (tampering is
 * detected rather than silently decrypting to garbage).
 */
const MASTER = "0f8a1c2d3e4b5a69788796a5b4c3d2e1f00112233445566778899aabbccddeeff";

describe("sealSecret / openSecret", () => {
  it("round-trips a secret", async () => {
    const sealed = await sealSecret(MASTER, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(await openSecret(MASTER, sealed)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("produces a versioned, self-describing payload", async () => {
    const sealed = await sealSecret(MASTER, "hello");
    const parts = sealed.split(":");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe(SECRET_BOX_VERSION);
    expect(parts[1]).toMatch(/^[0-9a-f]{24}$/); // 12-byte nonce
    expect(isSealed(sealed)).toBe(true);
  });

  it("never embeds the plaintext", async () => {
    const sealed = await sealSecret(MASTER, "SUPERSECRETVALUE");
    expect(sealed).not.toContain("SUPERSECRETVALUE");
  });

  it("uses a fresh nonce per call (same plaintext, different ciphertext)", async () => {
    const a = await sealSecret(MASTER, "same");
    const b = await sealSecret(MASTER, "same");
    expect(a).not.toBe(b);
    expect(await openSecret(MASTER, a)).toBe("same");
    expect(await openSecret(MASTER, b)).toBe("same");
  });

  it("fails closed when the ciphertext is tampered with", async () => {
    const sealed = await sealSecret(MASTER, "secret");
    const [version, iv, cipher] = sealed.split(":");
    const flipped = cipher.slice(0, -2) + (cipher.endsWith("00") ? "01" : "00");
    await expect(openSecret(MASTER, `${version}:${iv}:${flipped}`)).rejects.toThrow(
      /authentication failed/,
    );
  });

  it("fails closed under the wrong master secret", async () => {
    const sealed = await sealSecret(MASTER, "secret");
    await expect(openSecret("a".repeat(64), sealed)).rejects.toThrow(/authentication failed/);
  });

  it("rejects malformed payloads without leaking the reason", async () => {
    for (const bad of ["", "hello", "v1:only", "v2:00:00", `${SECRET_BOX_VERSION}:zz:00`]) {
      await expect(openSecret(MASTER, bad)).rejects.toThrow();
    }
  });

  it("treats unprefixed values as unsealed", () => {
    expect(isSealed("GEZDGNBVGY3TQOJQ")).toBe(false);
  });
});
