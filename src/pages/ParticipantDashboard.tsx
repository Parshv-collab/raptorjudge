import { useMemo } from "react";
import { useQuery, useConvexAuth } from "convex/react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrowseAllEvents } from "@/components/events/EventDiscovery";

export default function ParticipantDashboard() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const me = useQuery(api.users.me, skip ? "skip" : {});
  // Server-side scoping: `events.enrolled` walks this user's team memberships
  // and returns the matching events (with `participantCount`) in one read,
  // instead of filtering the public list against a separately fetched roster.
  const enrolled = useQuery(api.events.enrolled, skip ? "skip" : {});
  /**
   * Issue 49: this used to render exactly one card, from `usePrimaryEvent`, so
   * on a TEST_EVENTS deployment the whole dashboard showed a single event and
   * a "You're not enrolled in any events yet" empty state — the participant
   * role's front page looked broken next to the landing page, which shows three.
   * It now mirrors the landing page's priority (open → upcoming → past) and
   * takes up to three, so a busy deployment never reduces to a single card.
   */
  const browse = useQuery(api.events.browse, skip ? "skip" : {});
  const featured = useMemo(() => {
    if (browse === undefined) return undefined;
    const list = browse as any[];
    const open = list.filter((e) => e.isOpen);
    const upcoming = list.filter((e) => !e.isOpen && e.isUpcoming);
    const past = list.filter((e) => e.isPast);
    return [...open, ...upcoming, ...past].slice(0, 3);
  }, [browse]);

  if (authLoading) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonCard lines={2} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (me === undefined || enrolled === undefined || featured === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonCard lines={2} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    );
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

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Manage your hackathons and explore open events."
        bordered={false}
      />

      {/* Your events */}
      <section className="flex flex-col gap-4">
        <h2 className="text-h3 text-primary">Your events</h2>

        {enrolled.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {enrolled.map((event: any) => (
              <div
                key={event._id}
                className="bg-surface-1 border border-line rounded-card p-6 flex flex-col justify-between transition-colors duration-fast hover:border-line-strong"
              >
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

                <div className="pt-4 border-t border-line flex justify-between items-center">
                  <Link to={`/workspace?event=${event.slug}`}>
                    <Button variant="secondary" size="sm">
                      Open workspace →
                    </Button>
                  </Link>
                  <Link
                    to={`/e/${event.slug}`}
                    className="text-[13px] text-muted hover:text-primary transition-colors duration-fast"
                  >
                    Details
                  </Link>
                </div>
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

      {/* Featured events */}
      {featured.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-h3 text-primary">Featured events</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {featured.map((event: any) => (
              <div
                key={event._id}
                className="bg-surface-1 border border-line rounded-card p-5 flex flex-col justify-between transition-colors duration-fast hover:border-line-strong"
              >
                <div>
                  <Badge variant={event.status === "published" ? "accent" : "default"} className="mb-2">
                    {event.status === "published" ? "Results are in" : event.status}
                  </Badge>
                  <h3 className="text-[15px] font-semibold text-primary line-clamp-1">{event.title}</h3>
                  <p className="text-[13px] text-secondary line-clamp-2 mt-1 mb-3">
                    {event.tagline || event.description}
                  </p>
                </div>

                <Link to={`/e/${event.slug}`}>
                  <Button variant="secondary" size="sm" className="w-full">
                    View event
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/*
        Issue 49: everything else. The dashboard used to stop after one
        featured card, so a participant had no way to see or join an event
        from here without already knowing the URL.
      */}
      <BrowseAllEvents contained />
    </div>
  );
}
