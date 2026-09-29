import { describe, it, expect } from "vitest";
import { hmacSha256Hex } from "../src/convex/crypto";
import {
  signedPayload,
  verifyDelivery,
  WEBHOOK_REPLAY_WINDOW_MS,
} from "../src/convex/lib/webhookSignature";

/**
 * Item 59: signed, replay-resistant webhook deliveries. The scheme signs
 * `timestamp.nonce.body`, so these tests cover the three attacks the design
 * defends against: body tampering, timestamp refreshing, and plain replay.
 */
const SECRET = "whsec_test_0123456789";
const BODY = JSON.stringify({ id: "abc", type: "submission.created", data: { n: 1 } });

async function sign(timestamp: number, deliveryId: string, body: string, secret = SECRET) {
  return `sha256=${await hmacSha256Hex(secret, signedPayload(timestamp, deliveryId, body))}`;
}

describe("signedPayload", () => {
  it("covers the timestamp, the nonce and the whole body", () => {
    expect(signedPayload(1700000000000, "nonce", "{}")).toBe("1700000000000.nonce.{}");
  });
});

describe("verifyDelivery", () => {
  const now = 1_700_000_000_000;

  it("accepts a fresh, correctly signed delivery", async () => {
    const signature = await sign(now, "nonce-1", BODY);
    const result = await verifyDelivery({
      secret: SECRET,
      timestamp: now,
      deliveryId: "nonce-1",
      body: BODY,
      signature,
      nowMs: now,
    });
    expect(result).toEqual({ valid: true });
  });

  it("accepts a timestamp string header", async () => {
    const signature = await sign(now, "nonce-1", BODY);
    const result = await verifyDelivery({
      secret: SECRET,
      timestamp: String(now),
      deliveryId: "nonce-1",
      body: BODY,
      signature,
      nowMs: now + 1000,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const signature = await sign(now, "nonce-1", BODY);
    const result = await verifyDelivery({
      secret: SECRET,
      timestamp: now,
      deliveryId: "nonce-1",
      body: BODY.replace("submission.created", "submission.deleted"),
      signature,
      nowMs: now,
    });
    expect(result).toMatchObject({ valid: false, reason: "bad signature" });
  });

  it("rejects a refreshed timestamp on an old payload", async () => {
    // Attacker replays the original delivery but updates the timestamp header.
    const signature = await sign(now, "nonce-1", BODY);
    const result = await verifyDelivery({
      secret: SECRET,
      timestamp: now + 60_000,
      deliveryId: "nonce-1",
      body: BODY,
      signature,
      nowMs: now + 60_000,
    });
    expect(result).toMatchObject({ valid: false, reason: "bad signature" });
  });

  it("rejects a stale delivery (older than the 5 minute window)", async () => {
    const old = now - WEBHOOK_REPLAY_WINDOW_MS - 1;
    const signature = await sign(old, "nonce-1", BODY);
    const result = await verifyDelivery({
      secret: SECRET,
      timestamp: old,
      deliveryId: "nonce-1",
      body: BODY,
      signature,
      nowMs: now,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/replay window/);
  });

  it("accepts a delivery right at the edge of the window", async () => {
    const edge = now - WEBHOOK_REPLAY_WINDOW_MS;
    const signature = await sign(edge, "nonce-edge", BODY);
    const result = await verifyDelivery({
      secret: SECRET,
      timestamp: edge,
      deliveryId: "nonce-edge",
      body: BODY,
      signature,
      nowMs: now,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects a future-dated delivery beyond the window", async () => {
    const future = now + WEBHOOK_REPLAY_WINDOW_MS + 1;
    const signature = await sign(future, "nonce-future", BODY);
    const result = await verifyDelivery({
      secret: SECRET,
      timestamp: future,
      deliveryId: "nonce-future",
      body: BODY,
      signature,
      nowMs: now,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a replayed delivery id inside the window", async () => {
    const seen = new Set<string>();
    const signature = await sign(now, "nonce-1", BODY);
    const first = await verifyDelivery({
      secret: SECRET,
      timestamp: now,
      deliveryId: "nonce-1",
      body: BODY,
      signature,
      nowMs: now,
      seenDeliveryIds: seen,
    });
    const second = await verifyDelivery({
      secret: SECRET,
      timestamp: now,
      deliveryId: "nonce-1",
      body: BODY,
      signature,
      nowMs: now + 1000,
      seenDeliveryIds: seen,
    });
    expect(first.valid).toBe(true);
    expect(second).toMatchObject({ valid: false, reason: "replayed delivery id" });
  });

  it("rejects a signature made with a different secret", async () => {
    const signature = await sign(now, "nonce-1", BODY, "whsec_other");
    const result = await verifyDelivery({
      secret: SECRET,
      timestamp: now,
      deliveryId: "nonce-1",
      body: BODY,
      signature,
      nowMs: now,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects missing headers", async () => {
    const signature = await sign(now, "nonce-1", BODY);
    const base = { secret: SECRET, body: BODY, nowMs: now };
    expect((await verifyDelivery({ ...base, timestamp: "nope", deliveryId: "n", signature })).valid).toBe(false);
    expect((await verifyDelivery({ ...base, timestamp: now, deliveryId: "", signature })).valid).toBe(false);
    expect((await verifyDelivery({ ...base, timestamp: now, deliveryId: "n", signature: "" })).valid).toBe(false);
  });
});
