import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACTION_LIMIT,
  DEFAULT_WINDOW_MS,
  evaluateRateLimit,
  parseRateLimitState,
} from "../src/lib/rateLimit";

const T0 = 1_700_000_000_000;

describe("evaluateRateLimit", () => {
  it("allows the first action and starts a window", () => {
    const d = evaluateRateLimit(null, T0, 3);
    expect(d.allowed).toBe(true);
    expect(d.next).toEqual({ count: 1, windowStart: T0 });
    expect(d.remaining).toBe(2);
  });

  it("counts up to the limit, then refuses", () => {
    let state = evaluateRateLimit(null, T0, 2).next;
    expect(evaluateRateLimit(state, T0 + 1, 2).allowed).toBe(true);
    state = evaluateRateLimit(state, T0 + 1, 2).next;
    const refused = evaluateRateLimit(state, T0 + 2, 2);
    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(0);
    // A refusal must not extend the state (no penalty-box behaviour).
    expect(refused.next).toEqual(state);
  });

  it("resets once the window has elapsed", () => {
    let state = evaluateRateLimit(null, T0, 1).next;
    expect(evaluateRateLimit(state, T0 + 10, 1).allowed).toBe(false);
    const after = evaluateRateLimit(state, T0 + DEFAULT_WINDOW_MS, 1);
    expect(after.allowed).toBe(true);
    expect(after.next.windowStart).toBe(T0 + DEFAULT_WINDOW_MS);
    expect(after.next.count).toBe(1);
  });

  it("treats a window edge as a fresh window, not a shared one", () => {
    const state = { count: 5, windowStart: T0 };
    // One millisecond before the boundary the exhausted window still refuses…
    expect(evaluateRateLimit(state, T0 + DEFAULT_WINDOW_MS - 1, 5).allowed).toBe(false);
    // …and exactly on the boundary the window rolls over.
    expect(evaluateRateLimit(state, T0 + DEFAULT_WINDOW_MS, 5).allowed).toBe(true);
  });

  it("defaults to the documented 20 actions per minute", () => {
    expect(DEFAULT_ACTION_LIMIT).toBe(20);
    expect(DEFAULT_WINDOW_MS).toBe(60_000);
    let state = null;
    for (let i = 0; i < DEFAULT_ACTION_LIMIT; i++) {
      const d = evaluateRateLimit(state, T0 + i, DEFAULT_ACTION_LIMIT);
      expect(d.allowed).toBe(true);
      state = d.next;
    }
    expect(evaluateRateLimit(state, T0 + 500, DEFAULT_ACTION_LIMIT).allowed).toBe(false);
  });

  it("never returns a negative remaining count or accepts a silly limit", () => {
    const d = evaluateRateLimit({ count: 99, windowStart: T0 }, T0, 0);
    expect(d.remaining).toBeGreaterThanOrEqual(0);
    expect(d.allowed).toBe(false);
  });

  it("recovers from a corrupt (NaN) window start", () => {
    const d = evaluateRateLimit({ count: 50, windowStart: Number.NaN }, T0, 5);
    expect(d.allowed).toBe(true);
  });
});

describe("parseRateLimitState", () => {
  it("round-trips a well-formed row", () => {
    expect(parseRateLimitState(JSON.stringify({ count: 3, windowStart: T0 }))).toEqual({
      count: 3,
      windowStart: T0,
    });
  });

  it("returns null for empty, malformed or partial values", () => {
    expect(parseRateLimitState(null)).toBeNull();
    expect(parseRateLimitState("")).toBeNull();
    expect(parseRateLimitState("not json")).toBeNull();
    expect(parseRateLimitState('{"count":1}')).toBeNull();
    expect(parseRateLimitState('{"count":"x","windowStart":1}')).toBeNull();
  });
});
