import React, { useState, useMemo } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { humanizeConvexError } from "@/lib/errors";
import { GlassCard } from "@/components/ui/GlassCard";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "registration", label: "Registration Open" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

export default function AdminEvents() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const events = useQuery(api.events.listAll, skip ? "skip" : {});
  const users = useQuery(api.users.list, skip ? "skip" : {});
  const publish = useMutation(api.events.publish);
  const unpublish = useMutation(api.events.unpublish);
  const deleteEvent = useMutation(api.events.deleteEvent);
  const transferOwnership = useMutation(api.events.adminTransferOwnership);

  const [statusFilter, setStatusFilter] = useState("all");
  const [transferTargetEvent, setTransferTargetEvent] = useState<any>(null);
  const [selectedOrganizer, setSelectedOrganizer] = useState("");

  const organizers = useMemo(() => {
    return (users || []).filter((u: any) => u.role === "organizer" || u.role === "admin");
  }, [users]);

  const filteredEvents = useMemo(() => {
    return (events || []).filter(
      (e: any) => statusFilter === "all" || e.status === statusFilter
    );
  }, [events, statusFilter]);

  async function handleTogglePublish(e: any) {
    try {
      if (e.status === "draft") {
        await publish({ eventId: e._id });
        toast.success(`Published ${e.title}`);
      } else {
        await unpublish({ eventId: e._id });
        toast.success(`Unpublished ${e.title}`);
      }
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    }
  }

  async function handleDelete(e: any) {
    if (!confirm(`Are you sure you want to delete event "${e.title}"?`)) return;
    try {
      await deleteEvent({ eventId: e._id });
      toast.success(`Deleted ${e.title}`);
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    }
  }

  async function handleTransferConfirm() {
    if (!transferTargetEvent || !selectedOrganizer) return;
    try {
      await transferOwnership({
        eventId: transferTargetEvent._id,
        newOrganizerId: selectedOrganizer as any,
      });
      toast.success("Ownership transferred successfully.");
      setTransferTargetEvent(null);
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    }
  }

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
      <Link to="/admin">
        <span className="text-xs font-semibold text-[#ff0055] hover:underline">
          ← Back to Admin Dashboard
        </span>
      </Link>

      <div className="flex justify-between items-center">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
            Platform Overview
          </span>
          <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-0.5">
            All System Events
          </h1>
        </div>
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

      {/* All Events Table */}
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
                  <td className="py-3.5 px-4 text-right flex gap-1 justify-end">
                    <Link to={`/organizer/events/${e.slug}/edit`}>
                      <Button variant="secondary" size="sm">Edit</Button>
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => handleTogglePublish(e)}>
                      {e.status === "draft" ? "Publish" : "Unpublish"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setTransferTargetEvent(e)}>
                      Transfer
                    </Button>
                    {e.status === "draft" && (
                      <Button variant="danger" size="sm" onClick={() => handleDelete(e)}>
                        Delete
                      </Button>
                    )}
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

      <Modal
        isOpen={!!transferTargetEvent}
        onClose={() => setTransferTargetEvent(null)}
        title="Transfer Event Ownership"
        description={`Select a new organizer for ${transferTargetEvent?.title}`}
      >
        <div className="flex flex-col gap-4 mt-2">
          <Dropdown
            label="New Organizer"
            options={organizers.map((u: any) => ({
              value: u._id,
              label: `${u.name || u.email} (${u.role})`,
            }))}
            value={selectedOrganizer}
            onChange={(v) => setSelectedOrganizer(v)}
          />

          <div className="flex justify-between items-center mt-4">
            <Button variant="ghost" size="md" onClick={() => setTransferTargetEvent(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={handleTransferConfirm}>
              Confirm Transfer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
