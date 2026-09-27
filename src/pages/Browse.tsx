import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { PageHeader } from "@/components/ui/PageHeader";
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
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Browse events" description="Discover active, upcoming, and past hackathons." />

      {/* Search & status filter */}
      <div className="bg-surface-1 border border-line rounded-card p-4 flex flex-col sm:flex-row gap-4 items-center">
        <div className="w-full sm:flex-1">
          <Input
            aria-label="Search events"
            placeholder="Search events by title or host..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-56">
          <Dropdown options={STATUS_OPTIONS} value={statusFilter} onChange={(v) => setStatusFilter(v)} />
        </div>
      </div>

      {/* Events grid */}
      {filteredEvents.length === 0 ? (
        <EmptyState
          title="No events found"
          description="There are currently no events matching your search or status filter."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEvents.map((event: any) => (
            <div
              key={event._id}
              className="bg-surface-1 border border-line rounded-card p-6 flex flex-col justify-between transition-colors duration-fast hover:border-line-strong"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <Badge variant={["registration", "hacking"].includes(event.status) ? "success" : "default"}>
                    {deriveEventStatus(event).label}
                  </Badge>
                  <span className="text-[13px] text-muted truncate">
                    {event.hostName || "RaptorJudge"}
                  </span>
                </div>

                <h2 className="text-h3 text-primary">{event.title}</h2>
                <p className="text-[13px] text-secondary line-clamp-2 leading-relaxed mt-1.5 mb-4">
                  {event.tagline || event.shortDescription || event.description}
                </p>
              </div>

              <div className="pt-4 border-t border-line flex items-center justify-between">
                <span className="text-[13px] text-muted tnum">
                  Deadline: {new Date(event.submissionDeadline).toLocaleDateString()}
                </span>
                <Link to={`/e/${event.slug}`}>
                  <Button variant="secondary" size="sm">
                    View event
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
