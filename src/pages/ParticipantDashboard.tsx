import { useQuery, useConvexAuth } from "convex/react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrowseAllEvents } from "@/components/events/EventDiscovery";

/**
 * Skeleton shape for the dashboard: a header, the "Your events" row and one
 * discovery block. Kept identical for the auth-resolving and query-resolving
 * states so the page never re-flows between them.
 */
function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-12">
      <SkeletonCard lines={2} />
      <div className="flex gap-4 overflow-hidden">
        <SkeletonCard lines={3} className="w-[272px] sm:w-[320px] lg:w-[calc((100%-2rem)/3)] shrink-0" />
        <SkeletonCard lines={3} className="w-[272px] sm:w-[320px] lg:w-[calc((100%-2rem)/3)] shrink-0" />
        <SkeletonCard lines={3} className="w-[272px] sm:w-[320px] lg:w-[calc((100%-2rem)/3)] shrink-0" />
      </div>
    </div>
  );
}

export default function ParticipantDashboard() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const me = useQuery(api.users.me, skip ? "skip" : {});
  // Server-side scoping: `events.enrolled` walks this user's team memberships
  // and returns the matching events (with `participantCount`) in one read,
  // instead of filtering the public list against a separately fetched roster.
  const enrolled = useQuery(api.events.enrolled, skip ? "skip" : {});

  if (authLoading) {
    return <DashboardSkeleton />;
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (me === undefined || enrolled === undefined) {
    return <DashboardSkeleton />;
  }

  if (me?.role && me.role !== "participant") {
    return (
      <Navigate
        to={
          me.role === "judge"
            ? "/judge"
            : me.role === "organizer"
            ? "/organizer"
            : "/admin"
        }
        replace
      />
    );
  }

  const firstName = (me?.name || me?.email?.split("@")[0] || "there").split(/\s+/)[0];

  /**
   * The events this participant already belongs to, by slug. Handed to the
   * discovery section below so it lists only events they are *not* in.
   *
   * Before this, the page stacked three event sections that largely repeated
   * each other: a "Your events" grid, a "Featured events" grid built from the
   * same public list (so it re-showed events the participant was already in),
   * and a browse-all list of everything. The featured block is gone — the
   * dashboard now answers two different questions: "what am I in" and "what
   * else is on".
   */
  const enrolledSlugs = (enrolled as any[]).map((event) => String(event.slug));
  const enrolledCount = enrolledSlugs.length;

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Manage your hackathons and explore open events."
        bordered={false}
      />

      {/* Your events */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-h3 text-primary">Your events</h2>
          {enrolledCount > 0 && (
            <span className="text-[13px] text-muted tnum">
              {enrolledCount} event{enrolledCount === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {enrolledCount > 0 ? (
          /*
            A horizontal, snapping row rather than a wrapping grid. With a grid,
            an arbitrary number of events (five on the demo stack) always left
            an orphan row — three cards, then two — and a two-up row reads as a
            layout bug on the participant's own front page. A single row scrolls
            instead of orphaning, holds at every width, and keeps every card the
            same height (flex `stretch` does that for free).

            Widths: one full card on the narrowest phones so the next one peeks
            in and the row is discoverably scrollable, 320px on tablets, and
            exactly one third of the track from `lg` up — so a wide screen shows
            a clean three-column view that simply continues sideways.
          */
          <div
            role="list"
            aria-label="Your events"
            className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2"
          >
            {(enrolled as any[]).map((event) => (
              <div
                role="listitem"
                key={event._id}
                className="snap-start shrink-0 flex w-[272px] sm:w-[320px] lg:w-[calc((100%-2rem)/3)]"
              >
                <article className="w-full bg-surface-1 border border-line rounded-card p-6 flex flex-col justify-between transition-colors duration-fast hover:border-line-strong">
                  <div>
                    <Badge
                      variant={["registration", "hacking"].includes(event.status) ? "success" : "default"}
                      className="mb-3"
                    >
                      {event.status}
                    </Badge>
                    <h3 className="text-h3 text-primary">{event.title}</h3>
                    <p className="text-[13px] text-secondary line-clamp-2 mt-1.5 mb-4">
                      {event.tagline || event.description}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-line flex justify-between items-center gap-3">
                    <Link to={`/workspace?event=${event.slug}`}>
                      <Button variant="secondary" size="sm">
                        Open workspace →
                      </Button>
                    </Link>
                    <Link
                      to={`/e/${event.slug}`}
                      className="text-[13px] text-muted hover:text-primary transition-colors duration-fast shrink-0"
                    >
                      Details
                    </Link>
                  </div>
                </article>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="You're not enrolled in any events yet"
            description="Browse upcoming and live hackathons to join a team and start building."
            actionLabel="Browse events"
            onAction={() => navigate("/events")}
          />
        )}
      </section>

      {/*
        Issue 49: everything else. The dashboard used to stop after one
        featured card, so a participant had no way to see or join an event
        from here without already knowing the URL. It now lists only the
        events this participant is *not* in — the row above already covers
        the ones they are.
      */}
      <BrowseAllEvents
        contained
        excludeSlugs={enrolledSlugs}
        heading={enrolledCount > 0 ? "More events to join" : "Browse all events"}
        blurb={
          enrolledCount > 0
            ? "Everything else on the platform — filter by status or search by name. You're not enrolled in these yet."
            : "Every event on this platform — filter by status or search by name."
        }
      />
    </div>
  );
}
