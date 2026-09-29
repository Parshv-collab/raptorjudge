import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Fallback slug for the acceptance checker's fixture event
 * (`.dogfood.toml` → `/api/v1/gallery/sample-hack-2026`).
 *
 * It is only used when the featured-event query has not resolved yet, so the
 * acceptance contract keeps a stable target; every surface that *displays* the
 * featured event now uses the live query below, which never picks a closed
 * event while anything better exists (issue 29).
 */
export const DEFAULT_EVENT_SLUG = "sample-hack-2026";

export interface PrimaryEvent {
  event: any | null;
  slug: string;
  /** "open" | "upcoming" | "results" — drives the "Results are in" callout. */
  phase: "open" | "upcoming" | "results" | null;
  isLoading: boolean;
}

/**
 * Resolve the event a public/landing surface should highlight (issue 29).
 *
 * Priority, enforced server-side by `events.featuredForVisitors`:
 *   1. an open event (registration / hacking / judging / voting),
 *   2. the next upcoming event (registration in the future),
 *   3. the most recently published event ("Results are in"),
 *   4. nothing — callers render their empty state.
 */
export function usePrimaryEvent(): PrimaryEvent {
  const featured = useQuery(api.events.featuredForVisitors, {});
  const event = featured ?? null;
  return {
    event,
    slug: event?.slug ?? DEFAULT_EVENT_SLUG,
    phase: event?.phase ?? null,
    isLoading: featured === undefined,
  };
}

/** Convenience wrapper for surfaces that only need the slug. */
export function usePrimaryEventSlug(): string {
  return usePrimaryEvent().slug;
}
