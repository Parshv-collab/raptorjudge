import React, { useState, useMemo } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { humanizeConvexError } from "@/lib/errors";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonTable } from "@/components/ui/SkeletonCard";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState } from "@/components/ui/EmptyState";
import { CalendarDays } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "registration", label: "Registration open" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const STATUS_BADGE: Record<string, "default" | "success" | "warning"> = {
  draft: "default",
  registration: "success",
  published: "success",
  archived: "warning",
};

export default function AdminEvents() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const events = useQuery(api.events.listAll, skip ? "skip" : {});
  const users = useQuery(api.users.list, skip ? "skip" : {});
  const publish = useMutation(api.events.publish);
  const unpublish = useMutation(api.events.unpublish);
  const deleteEvent = useMutation(api.events.deleteEvent);
  const transferOwnership = useMutation(api.events.adminTransferOwnership);
  const importEventFromJson = useMutation((api as any).imports.eventFromJson);

  const [statusFilter, setStatusFilter] = useState("all");
  const [transferTargetEvent, setTransferTargetEvent] = useState<any>(null);
  const [selectedOrganizer, setSelectedOrganizer] = useState("");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState("");
  const [importBusy, setImportBusy] = useState(false);

  async function handleImportJson() {
    if (!importJsonText.trim()) return;
    setImportBusy(true);
    try {
      const res = await importEventFromJson({ jsonString: importJsonText.trim() });
      if (res.imported) {
        toast.success("Event imported successfully.");
      } else {
        toast.info(res.message || "Event already exists.");
      }
      setImportModalOpen(false);
      setImportJsonText("");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setImportBusy(false);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) setImportJsonText(content);
    };
    reader.readAsText(file);
  }

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
    if (!confirm(`Delete event "${e.title}"? This cannot be undone.`)) return;
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
      toast.success("Ownership transferred.");
      setTransferTargetEvent(null);
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    }
  }

  if (authLoading) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonTable rows={6} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="All system events"
        description="Every event on the platform, regardless of owner or lifecycle stage."
        actions={
          <Button variant="primary" onClick={() => setImportModalOpen(true)}>
            Import JSON
          </Button>
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
      {events === undefined ? (
        <SkeletonTable rows={6} />
      ) : filteredEvents.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title="No events found"
          description={
            events.length === 0
              ? "No events exist yet. Organizers create them from their console."
              : "No events match the current status filter."
          }
        />
      ) : (
        <Table caption="All events">
          <THead>
            <tr>
              <TH>Event</TH>
              <TH>Status</TH>
              <TH>Slug</TH>
              <TH>Deadline</TH>
              <TH numeric>Actions</TH>
            </tr>
          </THead>
          <tbody>
            {filteredEvents.map((e: any) => (
              <TR key={e._id}>
                <TD>
                  <Link
                    to={`/organizer/events/${e.slug}`}
                    className="font-medium hover:text-accent transition-colors duration-fast"
                  >
                    {e.title}
                  </Link>
                </TD>
                <TD>
                  <Badge variant={STATUS_BADGE[e.status] ?? "default"}>{e.status}</Badge>
                </TD>
                <TD mono>/{e.slug}</TD>
                <TD>
                  <span className="tnum text-secondary">
                    {new Date(e.submissionDeadline).toLocaleDateString()}
                  </span>
                </TD>
                <TD numeric>
                  <div className="flex gap-1.5 justify-end">
                    <Link to={`/organizer/events/${e.slug}/edit`}>
                      <Button variant="secondary" size="sm">
                        Edit
                      </Button>
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
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      {/* Bulk import modal */}
      <Modal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Bulk import event JSON"
        description="Upload or paste full event JSON to import the event, its tracks and rubric criteria."
        maxWidth="lg"
      >
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] text-secondary">Upload JSON file</label>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleFileUpload}
              className="text-[13px] text-secondary file:mr-3 file:h-8 file:px-3 file:rounded-btn file:border-0 file:bg-surface-2 file:text-primary file:cursor-pointer"
            />
          </div>

          <Textarea
            label="Or paste event JSON"
            rows={8}
            value={importJsonText}
            onChange={(e) => setImportJsonText(e.target.value)}
            placeholder='{"event": {"slug": "my-event", "title": "My Event"}, "tracks": []}'
            className="font-mono text-[13px]"
          />

          <div className="flex justify-end gap-3 mt-2">
            <Button variant="ghost" onClick={() => setImportModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isLoading={importBusy}
              disabled={!importJsonText.trim()}
              onClick={handleImportJson}
            >
              Import event
            </Button>
          </div>
        </div>
      </Modal>

      {/* Transfer modal */}
      <Modal
        isOpen={!!transferTargetEvent}
        onClose={() => setTransferTargetEvent(null)}
        title="Transfer event ownership"
        description={`Select a new organizer for ${transferTargetEvent?.title}`}
      >
        <div className="flex flex-col gap-4 mt-2">
          <Dropdown
            label="New organizer"
            options={organizers.map((u: any) => ({
              value: u._id,
              label: `${u.name || u.email} (${u.role})`,
            }))}
            value={selectedOrganizer}
            onChange={(v) => setSelectedOrganizer(v)}
          />

          <div className="flex justify-end gap-3 mt-2">
            <Button variant="ghost" onClick={() => setTransferTargetEvent(null)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!selectedOrganizer} onClick={handleTransferConfirm}>
              Confirm transfer
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
