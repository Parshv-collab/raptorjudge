import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";

export default function OrganizerDashboard() {
  const events = useQuery(api.events.listAll, {});
  const event = useQuery(api.events.getBySlug, { slug: "dogfood-2026" });
  const submissions = useQuery(api.submissions.byEvent, event ? { eventId: event._id } : "skip");
  const teams = useQuery(api.teams.listByEvent, event ? { eventId: event._id } : "skip");
  const progress = useQuery(api.judging.progress, event ? { eventId: event._id } : "skip");
  const audit = useQuery(api.audit.list, { limit: 5 });

  if (!events) {
    return (
      <div className="py-20 text-center animate-pulse text-xs text-[#6e6e73]">
        Loading organizer dashboard...
      </div>
    );
  }

  const liveEventsCount = events.filter((e: any) => !["draft", "archived"].includes(e.status)).length;
  const pendingJudgingCount = Math.max(
    0,
    (progress?.totalAssignments ?? 0) - (progress?.completedAssignments ?? 0)
  );

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col gap-8">
      {/* Header + ONE Primary CTA */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
            Organizer Space
          </span>
          <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-0.5">
            Organizer Dashboard
          </h1>
        </div>

        <Link to="/organizer/events/new">
          <Button variant="primary" size="md" className="shadow-md shadow-[#ff0055]/30">
            + Create Event
          </Button>
        </Link>
      </div>

      {/* Stats Row (4 Max) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Live Events" value={liveEventsCount} />
        <StatCard label="Total Participants" value={teams?.length ?? 0} />
        <StatCard label="Total Submissions" value={submissions?.length ?? 0} />
        <StatCard label="Pending Judging" value={pendingJudgingCount} />
      </div>

      {/* Your Events Table */}
      <GlassCard className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-[#1d1d1f]">Your Events</h2>
          <Link to="/organizer/events">
            <span className="text-xs font-semibold text-[#ff0055] hover:underline">
              View All →
            </span>
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-black/10 font-bold uppercase tracking-wider text-[#6e6e73]">
                <th className="py-3 px-4">Title</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Participants</th>
                <th className="py-3 px-4">Submissions</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e: any) => (
                <tr key={e._id} className="border-b border-black/5 hover:bg-white/40 transition-colors">
                  <td className="py-3 px-4 font-bold text-[#1d1d1f]">{e.title}</td>
                  <td className="py-3 px-4">
                    <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-[#ff0055]/10 text-[#ff0055]">
                      {e.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-[#6e6e73]">
                    {e._id === event?._id ? teams?.length ?? 0 : "—"}
                  </td>
                  <td className="py-3 px-4 text-[#6e6e73]">
                    {e._id === event?._id ? submissions?.length ?? 0 : "—"}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link to={`/organizer/events/${e.slug}`}>
                      <Button variant="secondary" size="sm" className="text-xs">
                        Manage
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Recent Activity (Collapsed / Expandable) */}
      <details className="glass-panel rounded-card p-6 cursor-pointer">
        <summary className="font-bold text-sm text-[#1d1d1f]">
          Recent Activity Log
        </summary>
        <div className="mt-4 flex flex-col gap-2 pt-2 border-t border-black/5">
          {(audit || []).map((log: any) => (
            <div
              key={log.id}
              className="flex justify-between items-center text-xs p-2 rounded-input bg-white/50 border border-white"
            >
              <span className="font-semibold text-[#1d1d1f]">{log.action}</span>
              <span className="text-[#6e6e73] font-mono text-[10px]">
                {new Date(log.timestamp).toLocaleString()}
              </span>
            </div>
          ))}
          {(!audit || audit.length === 0) && (
            <p className="text-xs text-[#6e6e73]">No recent audit logs.</p>
          )}
        </div>
      </details>
    </div>
  );
}
