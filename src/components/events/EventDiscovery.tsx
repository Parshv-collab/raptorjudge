import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { deriveEventStatus } from "@/lib/eventStatus";

/** Short public label per lifecycle stage. */
const STAGE_LABELS: Record<string, string> = {
  registration: "Registration",
  hacking: "Submissions",
  judging: "Judging",
  voting: "Voting",
  published: "Results",
  closed: "Closed",
  archived: "Archived",
};

type BrowseEvent = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  status: string;
  submissionDeadline: number;
  projectCount: number;
  teamCount: number;
  participantCount: number;
  isOpen: boolean;
  isUpcoming: boolean;
  isPast: boolean;
};

function EventCard({ event, compact = false }: { event: BrowseEvent; compact?: boolean }) {
  const status = deriveEventStatus(event);
  return (
    <Link to={`/e/${event.slug}`} className="group h-full">
      <div className="h-full bg-surface-1 border border-line rounded-card p-5 flex flex-col justify-between transition-colors duration-fast group-hover:border-line-strong">
        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <Badge variant={event.isOpen ? "accent" : "default"}>{STAGE_LABELS[event.status] ?? status.label}</Badge>
            <span className="text-[12px] text-muted tnum">
              {event.projectCount} project{event.projectCount === 1 ? "" : "s"}
            </span>
          </div>
          <h3 className={compact ? "text-[15px] font-semibold text-primary" : "text-h3 text-primary"}>
            {event.title}
          </h3>
          <p className="text-[13px] text-secondary line-clamp-2 leading-relaxed mt-1.5">
            {event.tagline || event.description}
          </p>
        </div>
        <div className="pt-4 mt-4 border-t border-line flex items-center justify-between text-[12px] text-muted tnum">
          <span>{event.teamCount} teams</span>
          <span>
            {event.submissionDeadline
              ? `Closes ${new Date(event.submissionDeadline).toLocaleDateString()}`
              : "—"}
          </span>
        </div>
      </div>
    </Link>
  );
}

/**
 * Featured events (issue 43.1).
 *
 * Previously the landing page heroed exactly one event. This shows up to three,
 * preferring what is open right now, then what is upcoming, then the most
 * recently published — so the page never reduces a busy deployment to a single
 * card.
 */
export function FeaturedEvents() {
  const events = useQuery(api.events.browse, {});
  if (events === undefined) {
    return (
      <section className="max-w-content mx-auto px-5 lg:px-8 w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      </section>
    );
  }

  const open = events.filter((e) => e.isOpen);
  const upcoming = events.filter((e) => !e.isOpen && e.isUpcoming);
  const past = events.filter((e) => e.isPast);
  const featured = [...open, ...upcoming, ...past].slice(0, 3);
  if (featured.length === 0) return null;

  return (
    <section className="max-w-content mx-auto px-5 lg:px-8 w-full">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-8">
        <div>
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-accent">
            {open.length > 0 ? "Happening now" : "Events"}
          </span>
          <h2 className="text-h1 text-primary mt-2">Pick an event and jump in</h2>
          <p className="text-sm text-secondary mt-2 max-w-2xl">
            {open.length > 0
              ? "Open events you can register for, submit to, judge or vote in right now."
              : "The most recent events on this deployment."}
          </p>
        </div>
        <Link to="/events" className="text-sm text-accent hover:text-accent-hover transition-colors duration-fast shrink-0">
          Browse all events →
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {featured.map((event) => (
          <EventCard key={event.slug} event={event} />
        ))}
      </div>
    </section>
  );
}

const FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "judging", label: "Judging" },
  { value: "past", label: "Past" },
];

/**
 * Browse-all section (issue 43.2): every event, filterable by status and
 * searchable by name, grouped into Registration open / Happening now /
 * Upcoming / Past. This is the same list `/events` serves, surfaced on the
 * landing page so a visitor never has to guess that a second page exists.
 */
export function BrowseAllEvents() {
  const events = useQuery(api.events.browse, {});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const matched = useMemo(() => {
    const list = (events ?? []) as BrowseEvent[];
    const q = search.trim().toLowerCase();
    return list.filter((event) => {
      if (q && !(event.title.toLowerCase().includes(q) || event.tagline?.toLowerCase().includes(q))) {
        return false;
      }
      if (statusFilter === "open") return event.isOpen;
      if (statusFilter === "judging") return event.status === "judging";
      if (statusFilter === "past") return event.isPast;
      return true;
    });
  }, [events, search, statusFilter]);

  const groups = useMemo(
    () => [
      { key: "registration", label: "Registration open", events: matched.filter((e) => e.status === "registration") },
      {
        key: "now",
        label: "Happening now",
        events: matched.filter((e) => ["hacking", "judging", "voting"].includes(e.status)),
      },
      { key: "upcoming", label: "Upcoming", events: matched.filter((e) => !e.isOpen && !e.isPast && e.isUpcoming) },
      { key: "past", label: "Past events", events: matched.filter((e) => e.isPast) },
    ].filter((group) => group.events.length > 0),
    [matched],
  );

  if (events === undefined) {
    return (
      <section className="max-w-content mx-auto px-5 lg:px-8 w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-content mx-auto px-5 lg:px-8 w-full">
      <div className="mb-8">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-accent">
          Discover
        </span>
        <h2 className="text-h1 text-primary mt-2">Browse all events</h2>
        <p className="text-sm text-secondary mt-2 max-w-2xl">
          Filter by status or search by name. Every event is public — no account needed to look.
        </p>
      </div>

      <div className="bg-surface-1 border border-line rounded-card p-4 flex flex-col sm:flex-row gap-4 mb-8">
        <div className="w-full sm:flex-1">
          <Input
            aria-label="Search events"
            placeholder="Search events by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-56">
          <Dropdown options={FILTERS} value={statusFilter} onChange={(v) => setStatusFilter(v)} />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="bg-surface-1 border border-line rounded-card p-8 text-center text-[13px] text-secondary">
          No events match this search. Try a different name or clear the filter.
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="flex items-baseline gap-3 mb-4">
                <h3 className="text-h3 text-primary">{group.label}</h3>
                <span className="text-[13px] text-muted tnum">{group.events.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.events.map((event) => (
                  <EventCard key={event.slug} event={event} compact />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
