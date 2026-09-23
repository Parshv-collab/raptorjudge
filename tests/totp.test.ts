import { describe, it, expect } from "vitest";
import {
  base32Decode,
  base32Encode,
  base32FromString,
  buildOtpauthUri,
  codesMatch,
  formatSecretForDisplay,
  generateTotpSecret,
  hotp,
  totp,
  totpCounter,
  totpSecondsRemaining,
  verifyTotp,
} from "../src/lib/totp";

/**
 * RFC 6238 Appendix B / RFC 4226 Appendix D test vectors. The shared secret is
 * the ASCII string "12345678901234567890"; for SHA-1 the published values are
 * 8 digits, so we ask for 8 digits here and separately check 6-digit codes are
 * the same value's last six digits (what authenticator apps display).
 */
const RFC_SECRET_ASCII = "12345678901234567890";
const RFC_SECRET = base32FromString(RFC_SECRET_ASCII);

const RFC_VECTORS: { seconds: number; expected8: string }[] = [
  { seconds: 59, expected8: "94287082" },
  { seconds: 1111111109, expected8: "07081804" },
  { seconds: 1111111111, expected8: "14050471" },
  { seconds: 1234567890, expected8: "89005924" },
  { seconds: 2000000000, expected8: "69279037" },
  { seconds: 20000000000, expected8: "65353130" },
];

describe("hotp", () => {
  it("matches the RFC 4226 Appendix D vectors (counter 0..9)", async () => {
    const expected = [
      "755224", "287082", "359152", "969429", "338314",
      "254676", "287922", "162583", "399871", "520489",
    ];
    for (let counter = 0; counter < expected.length; counter++) {
      expect(await hotp(RFC_SECRET, counter)).toBe(expected[counter]);
    }
  });

  it("matches the RFC 6238 vectors for 8-digit codes", async () => {
    for (const { seconds, expected8 } of RFC_VECTORS) {
      expect(await totp(RFC_SECRET, seconds * 1000, 8)).toBe(expected8);
    }
  });

  it("zero-pads short codes", async () => {
    // counter 1 → 287082 (no padding needed); counter 2 → 359152.
    // Use a code that starts with a zero digit to prove padding: 07081804.
    expect(await totp(RFC_SECRET, 1111111109 * 1000, 8)).toHaveLength(8);
    expect(await totp(RFC_SECRET, 1111111109 * 1000, 6)).toBe("081804");
  });
});

describe("totpCounter", () => {
  it("divides time into 30-second steps", () => {
    expect(totpCounter(0)).toBe(0);
    expect(totpCounter(29_999)).toBe(0);
    expect(totpCounter(30_000)).toBe(1);
    expect(totpCounter(59_000)).toBe(1);
    expect(totpCounter(60_000)).toBe(2);
  });

  it("reports seconds remaining in the current step", () => {
    expect(totpSecondsRemaining(0)).toBe(30);
    expect(totpSecondsRemaining(1000)).toBe(29);
    expect(totpSecondsRemaining(29_000)).toBe(1);
    expect(totpSecondsRemaining(30_000)).toBe(30);
  });
});

describe("verifyTotp", () => {
  const at = 1_111_111_109_000; // matches an RFC vector for easy reasoning

  it("accepts the current code", async () => {
    const code = await totp(RFC_SECRET, at);
    expect(await verifyTotp(RFC_SECRET, code, { nowMs: at })).toBe(true);
  });

  it("tolerates one step of clock skew in both directions", async () => {
    const previous = await totp(RFC_SECRET, at - 30_000);
    const next = await totp(RFC_SECRET, at + 30_000);
    expect(await verifyTotp(RFC_SECRET, previous, { nowMs: at })).toBe(true);
    expect(await verifyTotp(RFC_SECRET, next, { nowMs: at })).toBe(true);
  });

  it("rejects codes outside the tolerance window", async () => {
    const stale = await totp(RFC_SECRET, at - 3 * 30_000);
    expect(await verifyTotp(RFC_SECRET, stale, { nowMs: at })).toBe(false);
  });

  it("ignores surrounding whitespace", async () => {
    const code = await totp(RFC_SECRET, at);
    expect(await verifyTotp(RFC_SECRET, ` ${code} `, { nowMs: at })).toBe(true);
  });

  it("rejects malformed input without throwing", async () => {
    for (const bad of ["", "abc123", "12345", "1234567", "12 34 56", "12345678"]) {
      expect(await verifyTotp(RFC_SECRET, bad, { nowMs: at })).toBe(false);
    }
  });

  it("rejects a valid code computed from a different secret", async () => {
    const other = generateTotpSecret();
    const code = await totp(other, at);
    expect(await verifyTotp(RFC_SECRET, code, { nowMs: at })).toBe(false);
  });
});

describe("codesMatch", () => {
  it("compares exactly and safely on length mismatch", () => {
    expect(codesMatch("123456", "123456")).toBe(true);
    expect(codesMatch("123456", "123457")).toBe(false);
    expect(codesMatch("123456", "12345")).toBe(false);
  });
});

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    for (const length of [1, 5, 10, 20, 32]) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) bytes[i] = (i * 37 + 11) % 256;
      expect(Array.from(base32Decode(base32Encode(bytes)))).toEqual(Array.from(bytes));
    }
  });

  it("encodes the RFC secret exactly as published", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("is case-insensitive and ignores padding on decode", () => {
    expect(Array.from(base32Decode("gezdgnbvgy3tqojq"))).toEqual(
      Array.from(base32Decode("GEZDGNBVGY3TQOJQ====")),
    );
  });

  it("rejects characters outside the alphabet", () => {
    expect(() => base32Decode("ABC1")).toThrow(/Invalid base32/);
  });
});

describe("generateTotpSecret", () => {
  it("produces a 20-byte (160-bit) base32 secret", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
  });

  it("never repeats", () => {
    const secrets = new Set(Array.from({ length: 50 }, () => generateTotpSecret()));
    expect(secrets.size).toBe(50);
  });
});

describe("buildOtpauthUri", () => {
  it("builds a scannable otpauth URI with the documented parameters", () => {
    const uri = buildOtpauthUri({ secret: "GEZDGNBVGY3TQOJQ", accountName: "admin@raptors.dev" });
    expect(uri.startsWith("otpauth://totp/RaptorJudge%3Aadmin%40raptors.dev?")).toBe(true);
    const params = new URLSearchParams(uri.split("?")[1]);
    expect(params.get("secret")).toBe("GEZDGNBVGY3TQOJQ");
    expect(params.get("issuer")).toBe("RaptorJudge");
    expect(params.get("algorithm")).toBe("SHA1");
    expect(params.get("digits")).toBe("6");
    expect(params.get("period")).toBe("30");
  });

  it("honours a custom issuer", () => {
    const uri = buildOtpauthUri({ secret: "AAAA", accountName: "a@b.c", issuer: "Dogfood" });
    expect(uri).toContain("Dogfood");
    expect(new URLSearchParams(uri.split("?")[1]).get("issuer")).toBe("Dogfood");
  });
});

describe("formatSecretForDisplay", () => {
  it("groups the secret in fours for manual entry", () => {
    expect(formatSecretForDisplay("ABCDEFGHIJ")).toBe("ABCD EFGH IJ");
  });
});
