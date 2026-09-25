import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Slug of the fixture event produced by `convex/seed.ts` and referenced by the
 * acceptance checker (`.dogfood.toml` → `/api/v1/gallery/sample-hack-2026`).
 *
 * It is only a *fallback*: every surface that needs "the current event" first
 * asks the backend for the featured event, so a deployment that seeds or
 * creates a different event still works without editing the frontend.
 */
export const DEFAULT_EVENT_SLUG = "sample-hack-2026";

export interface PrimaryEvent {
  event: any | null;
  slug: string;
  isLoading: boolean;
}

/**
 * Resolve the event a public/landing surface should highlight.
 *
 * Prefers the "featured" discovery feed (events with an active lifecycle
 * status, ranked by participants) and falls back to the first non-draft event,
 * then to {@link DEFAULT_EVENT_SLUG}. Both queries are public, so this is safe
 * to call from unauthenticated pages.
 */
export function usePrimaryEvent(): PrimaryEvent {
  const featured = useQuery(api.events.featured, {});
  const publicEvents = useQuery(api.events.listPublic, {});
  const event = featured?.[0] ?? publicEvents?.[0] ?? null;
  return {
    event,
    slug: event?.slug ?? DEFAULT_EVENT_SLUG,
    isLoading: featured === undefined || publicEvents === undefined,
  };
}

/** Convenience wrapper for surfaces that only need the slug. */
export function usePrimaryEventSlug(): string {
  return usePrimaryEvent().slug;
}
