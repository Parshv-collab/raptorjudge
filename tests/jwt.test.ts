import { describe, it, expect, beforeAll } from "vitest";
import {
  base64UrlDecode,
  parseJwks,
  userIdFromSubject,
  verifyJwt,
} from "../src/convex/lib/jwt";

/**
 * Item 63/70 regression suite.
 *
 * The REST layer used to trust a base64-decoded JWT payload, so a forged token
 * reached organizer-only endpoints. These tests generate a real RS256 keypair,
 * mint tokens with it, and then prove that every way of *not* holding the
 * private key is rejected.
 */
const ISSUER = "http://127.0.0.1:3211";
const AUDIENCE = "convex";
const SUB = "jd7abc123def456|session789";

let jwks: string;
let signingKey: CryptoKey;
let otherKey: CryptoKey;

const encoder = new TextEncoder();

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function mint(
  claims: Record<string, unknown>,
  options: { key?: CryptoKey; header?: Record<string, unknown> } = {},
): Promise<string> {
  const header = { alg: "RS256", typ: "JWT", kid: "test-key", ...options.header };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    options.key ?? signingKey,
    encoder.encode(signingInput),
  );
  return `${signingInput}.${b64url(new Uint8Array(signature))}`;
}

function futureClaims(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: SUB,
    iss: ISSUER,
    aud: AUDIENCE,
    iat: now - 10,
    exp: now + 3600,
    ...overrides,
  };
}

beforeAll(async () => {
  const keypair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  signingKey = keypair.privateKey;
  const jwk = (await crypto.subtle.exportKey("jwk", keypair.publicKey)) as JsonWebKey;
  jwks = JSON.stringify({ keys: [{ use: "sig", alg: "RS256", kid: "test-key", ...jwk }] });

  const attacker = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  otherKey = attacker.privateKey;
});

describe("verifyJwt accepts a genuine session token", () => {
  it("verifies the signature and returns the claims", async () => {
    const token = await mint(futureClaims());
    const result = await verifyJwt(token, { jwks, issuer: ISSUER, audience: AUDIENCE });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.sub).toBe(SUB);
      expect(result.claims.iss).toBe(ISSUER);
    }
  });

  it("accepts an audience array containing the expected value", async () => {
    const token = await mint(futureClaims({ aud: ["other", AUDIENCE] }));
    expect((await verifyJwt(token, { jwks, audience: AUDIENCE })).ok).toBe(true);
  });

  it("tolerates a trailing slash difference on the issuer", async () => {
    const token = await mint(futureClaims({ iss: `${ISSUER}/` }));
    expect((await verifyJwt(token, { jwks, issuer: ISSUER })).ok).toBe(true);
  });
});

describe("verifyJwt rejects forged tokens (the bug this replaces)", () => {
  it("rejects a payload-only token with no signature", async () => {
    // Exactly the attack the old decoder fell for: valid-looking claims, junk sig.
    const claims = b64url(JSON.stringify(futureClaims()));
    const header = b64url(JSON.stringify({ alg: "RS256", kid: "test-key" }));
    const result = await verifyJwt(`${header}.${claims}.`, { jwks, issuer: ISSUER });
    expect(result.ok).toBe(false);
  });

  it("rejects a token signed with an attacker's key", async () => {
    const token = await mint(futureClaims(), { key: otherKey });
    const result = await verifyJwt(token, { jwks, issuer: ISSUER, audience: AUDIENCE });
    expect(result).toMatchObject({ ok: false, reason: "signature mismatch" });
  });

  it("rejects a tampered payload (sub swapped to an admin id)", async () => {
    const token = await mint(futureClaims());
    const [header, , signature] = token.split(".");
    const swapped = b64url(JSON.stringify(futureClaims({ sub: "adminUserId|other" })));
    const result = await verifyJwt(`${header}.${swapped}.${signature}`, { jwks, issuer: ISSUER });
    expect(result).toMatchObject({ ok: false, reason: "signature mismatch" });
  });

  it("rejects alg: none even with a plausible payload", async () => {
    const header = b64url(JSON.stringify({ alg: "none", kid: "test-key" }));
    const payload = b64url(JSON.stringify(futureClaims()));
    const result = await verifyJwt(`${header}.${payload}.`, { jwks });
    expect(result).toMatchObject({ ok: false, reason: "unsupported alg: none" });
  });

  it("rejects HS256 key-confusion attempts", async () => {
    const token = await mint(futureClaims(), { header: { alg: "HS256" } });
    expect((await verifyJwt(token, { jwks })).ok).toBe(false);
  });

  it("rejects an unknown key id", async () => {
    const token = await mint(futureClaims(), { header: { kid: "rotated-away" } });
    expect(await verifyJwt(token, { jwks })).toMatchObject({ ok: false, reason: "no matching key id" });
  });

  it("rejects expired tokens", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await mint(futureClaims({ exp: now - 60 }));
    expect(await verifyJwt(token, { jwks })).toMatchObject({ ok: false, reason: "token expired" });
  });

  it("rejects missing exp and missing sub", async () => {
    const noExp = futureClaims();
    delete (noExp as Record<string, unknown>).exp;
    expect(await verifyJwt(await mint(noExp), { jwks })).toMatchObject({ ok: false, reason: "missing exp" });
    expect(await verifyJwt(await mint(futureClaims({ sub: "" })), { jwks })).toMatchObject({
      ok: false,
      reason: "missing subject",
    });
  });

  it("rejects a token from another issuer", async () => {
    const token = await mint(futureClaims({ iss: "https://evil.example" }));
    expect(await verifyJwt(token, { jwks, issuer: ISSUER })).toMatchObject({
      ok: false,
      reason: "issuer mismatch",
    });
  });

  it("rejects a token for another audience", async () => {
    const token = await mint(futureClaims({ aud: "another-app" }));
    expect(await verifyJwt(token, { jwks, audience: AUDIENCE })).toMatchObject({
      ok: false,
      reason: "audience mismatch",
    });
  });

  it("rejects not-yet-valid and future-issued tokens", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await verifyJwt(await mint(futureClaims({ nbf: now + 600 })), { jwks })).toMatchObject({
      ok: false,
      reason: "token not yet valid",
    });
    expect(await verifyJwt(await mint(futureClaims({ iat: now + 600 })), { jwks })).toMatchObject({
      ok: false,
      reason: "token issued in the future",
    });
  });

  it("rejects malformed input without throwing", async () => {
    for (const bad of ["", "abc", "a.b", "a.b.c.d", "!!!.???.###"]) {
      const result = await verifyJwt(bad, { jwks });
      expect(result.ok).toBe(false);
    }
  });

  it("fails closed when no keys are configured", async () => {
    const token = await mint(futureClaims());
    expect(await verifyJwt(token, { jwks: undefined })).toMatchObject({
      ok: false,
      reason: "no verification keys configured",
    });
    expect(await verifyJwt(token, { jwks: "not json" })).toMatchObject({ ok: false });
  });
});

describe("parseJwks", () => {
  it("reads the env-var string and a pre-parsed object", () => {
    expect(parseJwks(jwks)).toHaveLength(1);
    expect(parseJwks(JSON.parse(jwks))).toHaveLength(1);
  });

  it("returns nothing for absent or invalid input", () => {
    expect(parseJwks(undefined)).toEqual([]);
    expect(parseJwks("")).toEqual([]);
    expect(parseJwks('{"keys":"nope"}')).toEqual([]);
    expect(parseJwks("{")).toEqual([]);
  });
});

describe("userIdFromSubject", () => {
  it("extracts the user id from the Convex Auth subject", () => {
    expect(userIdFromSubject(SUB)).toBe("jd7abc123def456");
  });

  it("handles a bare id and refuses empty subjects", () => {
    expect(userIdFromSubject("jd123")).toBe("jd123");
    expect(userIdFromSubject(undefined)).toBeNull();
    expect(userIdFromSubject("")).toBeNull();
    expect(userIdFromSubject("|session")).toBeNull();
  });
});

describe("base64UrlDecode", () => {
  it("round-trips UTF-8 JSON", () => {
    expect(base64UrlDecode(b64url('{"a":"ü"}'))).toBe('{"a":"ü"}');
  });
});
