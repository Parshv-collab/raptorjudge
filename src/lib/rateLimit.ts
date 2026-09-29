/**
 * Fixed-window rate limiting (T3.5).
 *
 * The decision is a pure function so it is unit-testable and so every call site
 * — votes, comments, and any future write — behaves identically. Callers persist
 * the returned {@link RateLimitState} (the Convex layer keeps it in the
 * `platform` key/value table as `ratelimit:<bucket>`), which keeps the policy
 * here and the storage there.
 *
 * A fixed window is deliberate: it is O(1) to persist, cannot be gamed by
 * flushing state, and the burst at a window edge is bounded by 2× the limit for
 * one window — acceptable for spam/abuse defense, where the goal is to make
 * scripted abuse expensive rather than to shape traffic precisely.
 */

export interface RateLimitState {
  /** Actions counted in the current window. */
  count: number;
  /** Epoch ms at which the current window opened. */
  windowStart: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** State to persist. Unchanged when the action is refused. */
  next: RateLimitState;
  /** Actions left in this window (0 when refused). */
  remaining: number;
}

/** Default window: one minute, matching the documented 20 actions/minute. */
export const DEFAULT_WINDOW_MS = 60_000;

/** Default per-minute ceiling for an interactive write from one actor. */
export const DEFAULT_ACTION_LIMIT = 20;

/**
 * Evaluate one action against a stored window state.
 *
 * @param state previous state for this bucket, or null when unseen
 * @param now   current epoch ms
 */
export function evaluateRateLimit(
  state: RateLimitState | null | undefined,
  now: number,
  limit: number = DEFAULT_ACTION_LIMIT,
  windowMs: number = DEFAULT_WINDOW_MS,
): RateLimitDecision {
  const max = Math.max(1, Math.floor(limit));

  if (!state || !Number.isFinite(state.windowStart) || now - state.windowStart >= windowMs) {
    return { allowed: true, next: { count: 1, windowStart: now }, remaining: max - 1 };
  }

  if (state.count >= max) {
    return { allowed: false, next: state, remaining: 0 };
  }

  const next = { count: state.count + 1, windowStart: state.windowStart };
  return { allowed: true, next, remaining: max - next.count };
}

/** Parse a persisted bucket value defensively (a corrupt row must not lock anyone out). */
export function parseRateLimitState(raw: string | null | undefined): RateLimitState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RateLimitState>;
    if (
      typeof parsed?.count === "number" &&
      Number.isFinite(parsed.count) &&
      typeof parsed?.windowStart === "number" &&
      Number.isFinite(parsed.windowStart)
    ) {
      return { count: parsed.count, windowStart: parsed.windowStart };
    }
    return null;
  } catch {
    return null;
  }
}
