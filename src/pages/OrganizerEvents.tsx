import { useState, useMemo } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { nextDeadline } from "@/lib/eventStatus";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "registration", label: "Registration Open" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

export function OrganizerEvents() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  // Scoped to the caller's own events (admins get all) — same rule as the console.
  // `listWithCounts` inlines team/submission counts so no row is ever blank (issues 33/37).
  const events = useQuery(api.events.listWithCounts, authLoading || !isAuthenticated ? "skip" : {});
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredEvents = useMemo(() => {
    return (events || []).filter(
      (e: any) => statusFilter === "all" || e.status === statusFilter
    );
  }, [events, statusFilter]);

  if (authLoading) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonCard lines={6} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Events"
        description="Every event you organize, with lifecycle status."
        actions={
          <Link to="/organizer/events/new">
            <Button variant="primary" size="md">
              Create event
            </Button>
          </Link>
        }
      />

      {/* Filter bar */}
      <div className="bg-surface-1 border border-line rounded-card p-4 flex items-center justify-between gap-4">
        <div className="w-56">
          <Dropdown options={STATUS_OPTIONS} value={statusFilter} onChange={(val) => setStatusFilter(val)} />
        </div>
        <span className="text-[13px] text-muted tnum">
          {filteredEvents.length} event{filteredEvents.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Events table */}
      {filteredEvents.length === 0 ? (
        <p className="text-[13px] text-muted text-center py-12">
          No events found matching the current filter.
        </p>
      ) : (
        <Table caption="Events">
          <THead>
            <tr>
              <TH>Event</TH>
              <TH>Status</TH>
              <TH>Slug</TH>
              <TH numeric>Teams</TH>
              <TH numeric>Submissions</TH>
              <TH>Next deadline</TH>
              <TH numeric>Actions</TH>
            </tr>
          </THead>
          <tbody>
            {filteredEvents.map((e: any) => (
              <TR key={e._id}>
                <TD>
                  <span className="font-medium">{e.title}</span>
                </TD>
                <TD>
                  <Badge variant={["registration", "hacking"].includes(e.status) ? "success" : "default"}>
                    {e.status}
                  </Badge>
                </TD>
                <TD mono>/​{e.slug}</TD>
                <TD numeric mono>
                  {e.teamCount}
                </TD>
                <TD numeric mono>
                  {e.submissionCount}
                </TD>
                <TD>
                  {(() => {
                    const next = nextDeadline(e);
                    return (
                      <span className="text-[13px] text-secondary">
                        {next.label}
                        {next.date ? (
                          <span className="block text-[12px] text-muted tnum">
                            {new Date(next.date).toLocaleDateString()}
                          </span>
                        ) : null}
                      </span>
                    );
                  })()}
                </TD>
                <TD numeric>
                  <Link to={`/organizer/events/${e.slug}`}>
                    <Button variant="secondary" size="sm">
                      Manage
                    </Button>
                  </Link>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
