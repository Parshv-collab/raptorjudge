import React, { useMemo } from "react";
import { useQuery } from "convex/react";
import { Link, Navigate } from "react-router-dom";
import { api } from "@/convex/_generated/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default function ParticipantDashboard() {
  const me = useQuery(api.users.me, {});
  const publicEvents = useQuery(api.events.listPublic, {});
  const myTeams = useQuery(api.teams.myTeams, {});

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

  if (me === undefined || enrolled === undefined || featured === undefined) {
    return (
      <div className="py-20 text-center animate-pulse text-xs text-[#6e6e73]">
        Loading dashboard...
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
    <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col gap-10">
      {/* Greeting Header */}
      <div>
        <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight">
          Welcome back, {firstName}
        </h1>
        <p className="text-xs text-[#6e6e73] mt-1">
          Manage your hackathons and explore open events.
        </p>
      </div>

      {/* Your Events Section */}
      <section id="events" className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-[#1d1d1f]">Your Events</h2>

        {enrolled.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {enrolled.map((event: any) => (
              <GlassCard key={event._id} hoverEffect className="p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-[#ff0055]/10 text-[#ff0055]">
                      {event.status}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-[#1d1d1f] mb-1">{event.title}</h3>
                  <p className="text-xs text-[#6e6e73] line-clamp-2 mb-4">
                    {event.tagline || event.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-black/5 flex justify-between items-center">
                  <Link to={`/workspace?event=${event.slug}`}>
                    <Button variant="primary" size="sm">
                      Open Workspace →
                    </Button>
                  </Link>
                  <Link to={`/e/${event.slug}`}>
                    <span className="text-xs font-semibold text-[#6e6e73] hover:text-[#1d1d1f]">
                      Event Details
                    </span>
                  </Link>
                </div>
              </GlassCard>
            ))}
          </div>
        ) : (
          <EmptyState
            title="You're not enrolled in any events yet"
            description="Browse upcoming and live hackathons to join a team and start building."
            actionLabel="Browse events"
            onAction={() => {
              window.location.href = "/e/dogfood-2026";
            }}
          />
        )}
      </section>

      {/* Featured Section (Up to 4 open events, hidden if none) */}
      {featured.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-[#1d1d1f]">Featured Events</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featured.map((event: any) => (
              <GlassCard key={event._id} hoverEffect className="p-5 flex flex-col justify-between">
                <div>
                  <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full bg-black/5 text-[#6e6e73] mb-2 inline-block">
                    {event.status}
                  </span>
                  <h3 className="text-sm font-bold text-[#1d1d1f] mb-1 line-clamp-1">
                    {event.title}
                  </h3>
                  <p className="text-xs text-[#6e6e73] line-clamp-2 mb-3">
                    {event.tagline || event.description}
                  </p>
                </div>

                <Link to={`/e/${event.slug}`}>
                  <Button variant="secondary" size="sm" className="w-full text-xs">
                    View Event
                  </Button>
                </Link>
              </GlassCard>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
