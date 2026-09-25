import { useMemo } from "react";
import { useQuery, useConvexAuth } from "convex/react";
import { Link, Navigate } from "react-router-dom";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { DEFAULT_EVENT_SLUG } from "@/lib/featuredEvent";

export default function ParticipantDashboard() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const me = useQuery(api.users.me, skip ? "skip" : {});
  const publicEvents = useQuery(api.events.listPublic, skip ? "skip" : {});
  const myTeams = useQuery(api.teams.myTeams, skip ? "skip" : {});

  const enrolled = useMemo(() => {
    if (!publicEvents || !myTeams) return undefined;
    const eventIds = new Set(myTeams.map((t: any) => String(t.eventId)));
    return publicEvents.filter((e: any) => eventIds.has(String(e._id)));
  }, [publicEvents, myTeams]);

  const featured = useMemo(() => {
    if (!publicEvents) return undefined;
    return publicEvents
      .filter((e: any) => ["registration", "hacking", "judging", "voting", "published"].includes(e.status))
      .slice(0, 4);
  }, [publicEvents]);

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
            onAction={() => {
              window.location.href = `/events`;
            }}
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
                  <Badge variant="default" className="mb-2">
                    {event.status}
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
    </div>
  );
}
