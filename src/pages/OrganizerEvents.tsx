import React, { useState, useMemo } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "registration", label: "Registration Open" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

export function OrganizerEvents() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const events = useQuery(api.events.listAll, authLoading || !isAuthenticated ? "skip" : {});
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredEvents = useMemo(() => {
    return (events || []).filter(
      (e: any) => statusFilter === "all" || e.status === statusFilter
    );
  }, [events, statusFilter]);

  if (authLoading) {
    return (
      <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col gap-6">
        <SkeletonCard lines={6} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
            Organizer
          </span>
          <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-0.5">
            Your Events
          </h1>
        </div>

        <Link to="/organizer/events/new">
          <Button variant="primary" size="md">
            + Create Event
          </Button>
        </Link>
      </div>

      {/* Filter Bar */}
      <GlassCard className="p-4 flex items-center justify-between">
        <div className="w-56">
          <Dropdown
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(val) => setStatusFilter(val)}
          />
        </div>
      </GlassCard>

      {/* Events Table */}
      <GlassCard className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-black/10 font-bold uppercase tracking-wider text-[#6e6e73]">
                <th className="py-3 px-4">Event Title</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Slug</th>
                <th className="py-3 px-4">Submission Deadline</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((e: any) => (
                <tr key={e._id} className="border-b border-black/5 hover:bg-white/40 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-[#1d1d1f]">{e.title}</td>
                  <td className="py-3.5 px-4">
                    <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-[#ff0055]/10 text-[#ff0055]">
                      {e.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[#6e6e73]">/{e.slug}</td>
                  <td className="py-3.5 px-4 text-[#6e6e73]">
                    {new Date(e.submissionDeadline).toLocaleDateString()}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <Link to={`/organizer/events/${e.slug}`}>
                      <Button variant="secondary" size="sm">
                        Manage →
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredEvents.length === 0 && (
            <p className="text-xs text-[#6e6e73] text-center py-8">
              No events found matching current filter.
            </p>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
