import React from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { StatCard } from "@/components/ui/StatCard";
import { SkeletonCard, SkeletonStat } from "@/components/ui/SkeletonCard";
import { AdminLayout } from "@/components/layout/AdminLayout";

export default function AdminDashboard() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const me = useQuery(api.users.me, skip ? "skip" : {});
  const events = useQuery(api.events.listAll, skip ? "skip" : {});
  const users = useQuery(api.users.list, skip ? "skip" : {});
  const event = useQuery(api.events.getBySlug, skip ? "skip" : { slug: "dogfood-2026" });
  const submissions = useQuery(api.submissions.byEvent, skip || !event ? "skip" : { eventId: event._id });
  const audit = useQuery(api.audit.list, skip ? "skip" : { limit: 10 });

  if (authLoading) {
    return (
      <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col gap-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <SkeletonStat /><SkeletonStat /><SkeletonStat /><SkeletonStat />
        </div>
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (me && me.role !== "admin") {
    return (
      <Navigate
        to={me.role === "organizer" ? "/organizer" : "/home"}
        replace
      />
    );
  }

  if (!me || !events || !users) {
    return (
      <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col gap-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <SkeletonStat /><SkeletonStat /><SkeletonStat /><SkeletonStat />
        </div>
        <SkeletonCard lines={4} />
      </div>
    );
  }

  return (
    <AdminLayout
      title="System Overview"
      description="Platform-wide administration metrics, system health, and recent audit activity."
    >
      <div className="flex flex-col gap-8">
        {/* Stats Row (4 max) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard label="Total Users" value={users.length} />
          <StatCard label="Total Events" value={events.length} />
          <StatCard label="Submissions" value={submissions?.length ?? 0} />
          <StatCard label="Pending Invites" value="0" />
        </div>

        {/* Quick Links Grid (4 cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Link to="/admin/users">
            <GlassCard hoverEffect className="p-6 h-full flex flex-col justify-between bg-white/5 border-white/10 text-white">
              <div>
                <h3 className="text-base font-bold text-white">Users</h3>
                <p className="text-xs text-[#8a8a92] mt-1">Manage accounts and role permissions</p>
              </div>
              <span className="text-xs font-bold text-[#ff0055] mt-4 inline-block">
                Open Users →
              </span>
            </GlassCard>
          </Link>

          <Link to="/admin/events">
            <GlassCard hoverEffect className="p-6 h-full flex flex-col justify-between bg-white/5 border-white/10 text-white">
              <div>
                <h3 className="text-base font-bold text-white">Events</h3>
                <p className="text-xs text-[#8a8a92] mt-1">Review all events platform-wide</p>
              </div>
              <span className="text-xs font-bold text-[#ff0055] mt-4 inline-block">
                Open Events →
              </span>
            </GlassCard>
          </Link>

          <Link to="/admin/audit">
            <GlassCard hoverEffect className="p-6 h-full flex flex-col justify-between bg-white/5 border-white/10 text-white">
              <div>
                <h3 className="text-base font-bold text-white">Audit Log</h3>
                <p className="text-xs text-[#8a8a92] mt-1">Inspect tamper-evident system logs</p>
              </div>
              <span className="text-xs font-bold text-[#ff0055] mt-4 inline-block">
                Open Audit →
              </span>
            </GlassCard>
          </Link>

          <Link to="/admin/settings">
            <GlassCard hoverEffect className="p-6 h-full flex flex-col justify-between bg-white/5 border-white/10 text-white">
              <div>
                <h3 className="text-base font-bold text-white">Settings</h3>
                <p className="text-xs text-[#8a8a92] mt-1">Platform configuration and support</p>
              </div>
              <span className="text-xs font-bold text-[#ff0055] mt-4 inline-block">
                Open Settings →
              </span>
            </GlassCard>
          </Link>
        </div>

        {/* Recent Audit Events (Last 10) */}
        <GlassCard className="p-6 bg-white/5 border-white/10 text-white">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-white">Recent Audit Trail</h2>
            <Link to="/admin/audit">
              <span className="text-xs font-semibold text-[#ff0055] hover:underline">
                View Full Trail →
              </span>
            </Link>
          </div>

          <div className="flex flex-col gap-2">
            {(audit || []).map((log: any) => (
              <div
                key={log.id}
                className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-wrap justify-between items-center text-xs gap-2"
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{log.action}</span>
                  <span className="text-[10px] text-[#8a8a92] uppercase px-1.5 py-0.5 rounded bg-white/10">
                    {log.targetType}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-[#8a8a92]">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
            {(!audit || audit.length === 0) && (
              <p className="text-xs text-[#8a8a92] text-center py-4">No recent audit logs.</p>
            )}
          </div>
        </GlassCard>
      </div>
    </AdminLayout>
  );
}
