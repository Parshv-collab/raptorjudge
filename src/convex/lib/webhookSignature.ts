import { hmacSha256Hex } from "../crypto";

/**
 * Webhook delivery signing + replay protection (security item 59).
 *
 * Every delivery is signed over `timestamp.nonce.body`, where `nonce` is a
 * 128-bit random delivery id and `timestamp` is the send time in milliseconds:
 *
 *     X-RaptorJudge-Signature: sha256=HMAC-SHA256(secret, "<timestamp>.<delivery>.<raw body>")
 *     X-RaptorJudge-Timestamp: <timestamp>
 *     X-RaptorJudge-Delivery:  <delivery id>
 *
 * Because the nonce and timestamp live *inside* the signed material, a captured
 * delivery cannot be replayed with a refreshed timestamp, and the body cannot
 * be swapped. Including a random nonce (rather than trusting the timestamp
 * alone) also means two deliveries in the same millisecond are distinguishable.
 *
 * **Receivers must reject a payload whose timestamp is more than five minutes
 * old** ({@link WEBHOOK_REPLAY_WINDOW_MS}) and must remember recently seen
 * delivery ids for that window (a single-use nonce). {@link verifyDelivery}
 * implements exactly that recipe, so a self-hoster can copy it.
 */

/** Receivers must reject deliveries older than this (5 minutes). */
export const WEBHOOK_REPLAY_WINDOW_MS = 5 * 60_000;

/** The exact string a receiver must recompute the HMAC over. */
export function signedPayload(timestamp: number, deliveryId: string, body: string): string {
  return `${timestamp}.${deliveryId}.${body}`;
}

/** Constant-time-ish comparison of two same-length hex/`sha256=` strings. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface DeliveryVerificationInput {
  secret: string;
  /** `X-RaptorJudge-Timestamp` (string or number). */
  timestamp: string | number;
  /** `X-RaptorJudge-Delivery` (the nonce). */
  deliveryId: string;
  /** The raw request body, exactly as received. */
  body: string;
  /** `X-RaptorJudge-Signature`. */
  signature: string;
  /** Injectable clock for tests. */
  nowMs?: number;
  /** Nonce store; a repeated id inside the window is a replay. */
  seenDeliveryIds?: Set<string>;
}

/**
 * Verify a delivery the way a receiver should. Returns a reason instead of
 * throwing so callers can log the rejection.
 */
export async function verifyDelivery(
  input: DeliveryVerificationInput,
): Promise<{ valid: boolean; reason?: string }> {
  const timestamp = Number(input.timestamp);
  if (!Number.isFinite(timestamp)) return { valid: false, reason: "missing timestamp" };
  if (!input.deliveryId) return { valid: false, reason: "missing delivery id" };
  if (!input.signature) return { valid: false, reason: "missing signature" };

  const now = input.nowMs ?? Date.now();
  if (Math.abs(now - timestamp) > WEBHOOK_REPLAY_WINDOW_MS) {
    return { valid: false, reason: "stale delivery — outside the 5 minute replay window" };
  }
  if (input.seenDeliveryIds?.has(input.deliveryId)) {
    return { valid: false, reason: "replayed delivery id" };
  }

  const expected = `sha256=${await hmacSha256Hex(
    input.secret,
    signedPayload(timestamp, input.deliveryId, input.body),
  )}`;
  if (!safeEqual(expected, input.signature)) return { valid: false, reason: "bad signature" };

  input.seenDeliveryIds?.add(input.deliveryId);
  return { valid: true };
}
