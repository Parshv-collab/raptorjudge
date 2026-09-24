import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { deriveEventStatus } from "@/lib/eventStatus";

const STATUS_OPTIONS = [
  { value: "all", label: "All Events" },
  { value: "open", label: "Open / Registration" },
  { value: "judging", label: "Judging" },
  { value: "closed", label: "Closed / Results" },
];

export default function Browse() {
  const events = useQuery(api.events.listPublic, {});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredEvents = useMemo(() => {
    return (events || []).filter((e: any) => {
      const matchSearch =
        !search ||
        e.title?.toLowerCase().includes(search.toLowerCase()) ||
        e.hostName?.toLowerCase().includes(search.toLowerCase()) ||
        e.tagline?.toLowerCase().includes(search.toLowerCase());

      let matchStatus = true;
      if (statusFilter === "open") {
        matchStatus = ["registration", "hacking"].includes(e.status);
      } else if (statusFilter === "judging") {
        matchStatus = e.status === "judging";
      } else if (statusFilter === "closed") {
        matchStatus = ["published", "archived"].includes(e.status);
      }

      return matchSearch && matchStatus;
    });
  }, [events, search, statusFilter]);

  if (events === undefined) {
    return (
      <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col gap-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <SkeletonCard lines={3} /><SkeletonCard lines={3} /><SkeletonCard lines={3} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col gap-8">
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
          Explore
        </span>
        <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-0.5">
          Browse Events
        </h1>
        <p className="text-xs text-[#6e6e73] mt-1">
          Discover active, upcoming, and past hackathons.
        </p>
      </div>

      {/* Search & Status Filter Bar */}
      <GlassCard className="p-4 flex flex-col sm:flex-row gap-4 items-center">
        <div className="w-full sm:flex-1">
          <Input
            placeholder="Search events by title or host..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-56">
          <Dropdown
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
          />
        </div>
      </GlassCard>

      {/* Events Grid */}
      {filteredEvents.length === 0 ? (
        <EmptyState
          title="No Open Events Found"
          description="There are currently no events matching your search or status filter."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.map((event: any) => (
            <GlassCard key={event._id} hoverEffect className="p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-[#ff0055]/10 text-[#ff0055]">
                    {deriveEventStatus(event).label}
                  </span>
                  <span className="text-xs font-medium text-[#6e6e73]">
                    Hosted by {event.hostName || "RaptorJudge"}
                  </span>
                </div>

                <h2 className="text-xl font-bold text-[#1d1d1f] mb-1">{event.title}</h2>
                <p className="text-xs text-[#6e6e73] line-clamp-2 leading-relaxed mb-4">
                  {event.tagline || event.shortDescription || event.description}
                </p>
              </div>

              <div className="pt-4 border-t border-black/5 flex items-center justify-between">
                <span className="text-xs font-semibold text-[#6e6e73]">
                  Deadline: {new Date(event.submissionDeadline).toLocaleDateString()}
                </span>
                <Link to={`/e/${event.slug}`}>
                  <Button variant="primary" size="sm">
                    View Event →
                  </Button>
                </Link>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
