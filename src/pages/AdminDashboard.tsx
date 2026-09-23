import React from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { StatCard } from "@/components/ui/StatCard";

export default function AdminDashboard() {
  const me = useQuery(api.users.me, {});
  const events = useQuery(api.events.listAll, {});
  const users = useQuery(api.users.list, {});
  const event = useQuery(api.events.getBySlug, { slug: "dogfood-2026" });
  const submissions = useQuery(api.submissions.byEvent, event ? { eventId: event._id } : "skip");
  const audit = useQuery(api.audit.list, { limit: 10 });

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
      <div className="py-20 text-center animate-pulse text-xs text-[#6e6e73]">
        Loading administration dashboard...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col gap-8">
      {/* Heading */}
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
          System Administration
        </span>
        <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-0.5">
          Admin
        </h1>
      </div>

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
          <GlassCard hoverEffect className="p-6 h-full flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-[#1d1d1f]">Users</h3>
              <p className="text-xs text-[#6e6e73] mt-1">Manage accounts and role permissions</p>
            </div>
            <span className="text-xs font-bold text-[#ff0055] mt-4 inline-block">
              Open Users →
            </span>
          </GlassCard>
        </Link>

        <Link to="/admin/events">
          <GlassCard hoverEffect className="p-6 h-full flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-[#1d1d1f]">Events</h3>
              <p className="text-xs text-[#6e6e73] mt-1">Review all events platform-wide</p>
            </div>
            <span className="text-xs font-bold text-[#ff0055] mt-4 inline-block">
              Open Events →
            </span>
          </GlassCard>
        </Link>

        <Link to="/admin/audit">
          <GlassCard hoverEffect className="p-6 h-full flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-[#1d1d1f]">Audit Log</h3>
              <p className="text-xs text-[#6e6e73] mt-1">Inspect tamper-evident system logs</p>
            </div>
            <span className="text-xs font-bold text-[#ff0055] mt-4 inline-block">
              Open Audit →
            </span>
          </GlassCard>
        </Link>

        <Link to="/security">
          <GlassCard hoverEffect className="p-6 h-full flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-[#1d1d1f]">Settings</h3>
              <p className="text-xs text-[#6e6e73] mt-1">Security and 2FA configuration</p>
            </div>
            <span className="text-xs font-bold text-[#ff0055] mt-4 inline-block">
              Open Settings →
            </span>
          </GlassCard>
        </Link>
      </div>

      {/* Recent Audit Events (Last 10) */}
      <GlassCard className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-[#1d1d1f]">Recent Audit Trail</h2>
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
              className="p-3 rounded-input bg-white/60 border border-white flex flex-wrap justify-between items-center text-xs gap-2"
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#1d1d1f]">{log.action}</span>
                <span className="text-[10px] text-[#6e6e73] uppercase px-1.5 py-0.5 rounded bg-black/5">
                  {log.targetType}
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#6e6e73]">
                {new Date(log.timestamp).toLocaleString()}
              </span>
            </div>
          ))}
          {(!audit || audit.length === 0) && (
            <p className="text-xs text-[#6e6e73] text-center py-4">No recent audit logs.</p>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
