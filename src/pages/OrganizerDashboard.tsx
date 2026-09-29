import { Link, Navigate } from "react-router-dom";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard, SkeletonStat } from "@/components/ui/SkeletonCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { usePrimaryEvent } from "@/lib/featuredEvent";
import { formatDateTime } from "@/lib/format";

export default function OrganizerDashboard() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  // `listWithCounts`: organizers see the events they own, admins see everything,
  // each row carrying its own team/submission counts (issues 33/37).
  const events = useQuery(api.events.listWithCounts, skip ? "skip" : {});
  const { event: primaryEvent } = usePrimaryEvent();
  // The organizer's own first event, falling back to the public featured event.
  const event = skip ? primaryEvent : (events?.[0] ?? primaryEvent);
  const submissions = useQuery(api.submissions.byEvent, skip || !event ? "skip" : { eventId: event._id });
  const teams = useQuery(api.teams.listByEvent, skip || !event ? "skip" : { eventId: event._id });
  const progress = useQuery(api.judging.progress, skip || !event ? "skip" : { eventId: event._id });
  const audit = useQuery(api.audit.list, skip ? "skip" : { limit: 5 });

  if (authLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonStat />
          <SkeletonStat />
          <SkeletonStat />
          <SkeletonStat />
        </div>
        <SkeletonCard lines={5} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (!events) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonStat />
          <SkeletonStat />
          <SkeletonStat />
          <SkeletonStat />
        </div>
        <SkeletonCard lines={5} />
      </div>
    );
  }

  const liveEventsCount = events.filter((e: any) => !["draft", "archived"].includes(e.status)).length;
  const pendingJudgingCount = Math.max(
    0,
    (progress?.totalAssignments ?? 0) - (progress?.completedAssignments ?? 0)
  );

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Organizer overview"
        description="Event health, judging progress and recent activity."
        actions={
          <Link to="/organizer/events/new">
            <Button variant="primary" size="md">
              Create event
            </Button>
          </Link>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Live events" value={liveEventsCount} />
        <StatCard label="Teams" value={teams?.length ?? 0} />
        <StatCard label="Submissions" value={submissions?.length ?? 0} />
        <StatCard label="Pending judging" value={pendingJudgingCount} />
      </div>

      {/* Events table */}
      <section className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-h2 text-primary">Your events</h2>
          <Link to="/organizer/events" className="text-sm text-accent hover:text-accent-hover">
            View all →
          </Link>
        </div>

        <Table caption="Your events">
          <THead>
            <tr>
              <TH>Title</TH>
              <TH>Status</TH>
              <TH numeric>Teams</TH>
              <TH numeric>Submissions</TH>
              <TH numeric>Actions</TH>
            </tr>
          </THead>
          <tbody>
            {events.map((e: any) => (
              <TR key={e._id}>
                <TD>{e.title}</TD>
                <TD>
                  <Badge variant={["registration", "hacking"].includes(e.status) ? "success" : "default"}>
                    {e.status}
                  </Badge>
                </TD>
                <TD numeric mono>
                  {e.teamCount}
                </TD>
                <TD numeric mono>
                  {e.submissionCount}
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
      </section>

      {/* Recent activity */}
      <section className="flex flex-col gap-4">
        <h2 className="text-h2 text-primary">Recent activity</h2>
        <div className="bg-surface-1 border border-line rounded-card divide-y divide-line">
          {(audit || []).map((log: any) => (
            <div key={log.id} className="flex justify-between items-center px-5 h-12">
              <span className="font-mono text-[13px] text-primary">{log.action}</span>
              <span className="text-[13px] text-muted tnum">{formatDateTime(log.timestamp)}</span>
            </div>
          ))}
          {(!audit || audit.length === 0) && (
            <p className="text-[13px] text-muted px-5 py-8 text-center">No recent audit activity.</p>
          )}
        </div>
      </section>
    </div>
  );
}
