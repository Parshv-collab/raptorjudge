import React, { useState, useMemo } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { humanizeConvexError } from "@/lib/errors";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonTable } from "@/components/ui/SkeletonCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState } from "@/components/ui/EmptyState";
import { nextDeadline } from "@/lib/eventStatus";
import { CalendarDays, Columns3, Plus, Search, SlidersHorizontal } from "lucide-react";

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

/**
 * Toolbar filters are declared as data: with more than three of them the bar
 * collapses them behind a single "Filters" control instead of stretching across
 * the row (see `COLLAPSED_FILTER_LIMIT`).
 */
const FILTERS = [{ id: "status", label: "Status", options: STATUS_OPTIONS }];
const COLLAPSED_FILTER_LIMIT = 3;

/** Table columns, declared as data so the picker knows what it can hide. */
const COLUMNS = [
  { id: "event", label: "Event", critical: true },
  { id: "status", label: "Status", critical: false },
  { id: "slug", label: "Slug", critical: false },
  { id: "teams", label: "Teams", critical: false },
  { id: "submissions", label: "Submissions", critical: false },
  { id: "deadline", label: "Next deadline", critical: false },
  { id: "actions", label: "Actions", critical: true },
];
/** Above this many columns the non-critical ones move behind a picker. */
const COLUMN_PICKER_THRESHOLD = 5;

export default function AdminEvents() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  // `listWithCounts` returns every event an admin can see (all of them) with
  // its team/submission counts inlined, so no row renders a blank count.
  const events = useQuery(api.events.listWithCounts, skip ? "skip" : {});
  const users = useQuery(api.users.list, skip ? "skip" : {});
  const publish = useMutation(api.events.publish);
  const unpublish = useMutation(api.events.unpublish);
  const deleteEvent = useMutation(api.events.deleteEvent);
  const transferOwnership = useMutation(api.events.adminTransferOwnership);
  const importEventFromJson = useMutation((api as any).imports.eventFromJson);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [transferTargetEvent, setTransferTargetEvent] = useState<any>(null);
  const [selectedOrganizer, setSelectedOrganizer] = useState("");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState("");
  const [importBusy, setImportBusy] = useState(false);

  const showColumnPicker = COLUMNS.length > COLUMN_PICKER_THRESHOLD;
  const collapseFilters = FILTERS.length > COLLAPSED_FILTER_LIMIT;
  const columnVisible = (id: string) => !hiddenColumns.includes(id);

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
    const q = search.trim().toLowerCase();
    return (events || []).filter((e: any) => {
      const matchStatus = statusFilter === "all" || e.status === statusFilter;
      const matchSearch =
        !q || e.title?.toLowerCase().includes(q) || e.slug?.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [events, statusFilter, search]);

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
      {/* Row 1 — page title + the single primary action */}
      <PageHeader
        title="All system events"
        description="Every event on the platform, regardless of owner or lifecycle stage."
        actions={
          <Link to="/organizer/events/new">
            <Button variant="primary">
              <Plus size={16} aria-hidden="true" />
              New Event
            </Button>
          </Link>
        }
      />

      {/* Row 2 — toolbar: search · filters · secondary actions (16px gaps) */}
      <div className="bg-surface-1 border border-line rounded-card p-4 flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="w-full lg:flex-1 lg:max-w-sm">
          <Input
            aria-label="Search events"
            placeholder="Search by title or slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-4 lg:justify-center lg:flex-1">
          {collapseFilters ? (
            <div className="relative">
              <Button
                variant="secondary"
                size="sm"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((prev) => !prev)}
              >
                <SlidersHorizontal size={16} aria-hidden="true" />
                Filters
              </Button>
              {filtersOpen && (
                <div className="absolute z-20 mt-2 w-64 bg-surface-1 border border-line rounded-card p-4 shadow-modal flex flex-col gap-4">
                  {FILTERS.map((filter) => (
                    <Dropdown
                      key={filter.id}
                      label={filter.label}
                      options={filter.options}
                      value={statusFilter}
                      onChange={(v) => setStatusFilter(v)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            FILTERS.map((filter) => (
              <div key={filter.id} className="w-full sm:w-48">
                <Dropdown
                  options={filter.options}
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v)}
                />
              </div>
            ))
          )}

          <span className="text-[13px] text-muted tnum shrink-0">
            {filteredEvents.length} event{filteredEvents.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex items-center gap-4 lg:justify-end">
          {showColumnPicker && (
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={columnsOpen}
                onClick={() => setColumnsOpen((prev) => !prev)}
              >
                <Columns3 size={16} aria-hidden="true" />
                Columns
              </Button>
              {columnsOpen && (
                <div className="absolute right-0 z-20 mt-2 w-52 bg-surface-1 border border-line rounded-card p-3 shadow-modal flex flex-col gap-1">
                  {COLUMNS.filter((c) => !c.critical).map((column) => (
                    <label
                      key={column.id}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-btn text-[13px] text-secondary hover:bg-surface-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={columnVisible(column.id)}
                        onChange={(e) =>
                          setHiddenColumns((prev) =>
                            e.target.checked
                              ? prev.filter((id) => id !== column.id)
                              : [...prev, column.id],
                          )
                        }
                      />
                      {column.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <Button variant="secondary" onClick={() => setImportModalOpen(true)}>
            Import JSON
          </Button>
        </div>
      </div>

      {/* Events table */}
      {events === undefined ? (
        <SkeletonTable rows={6} />
      ) : filteredEvents.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title={events.length === 0 ? "No events found" : "No events match these filters"}
          description={
            events.length === 0
              ? "No events exist yet. Organizers create them from their console."
              : search.trim()
                ? "Nothing matches that search. Clear it or pick a different status."
                : "No events match the current status filter."
          }
        />
      ) : (
        <Table caption="All events">
          <THead>
            <tr>
              {columnVisible("event") && <TH>Event</TH>}
              {columnVisible("status") && <TH>Status</TH>}
              {columnVisible("slug") && <TH>Slug</TH>}
              {columnVisible("teams") && <TH numeric>Teams</TH>}
              {columnVisible("submissions") && <TH numeric>Submissions</TH>}
              {columnVisible("deadline") && <TH>Next deadline</TH>}
              {columnVisible("actions") && <TH numeric>Actions</TH>}
            </tr>
          </THead>
          <tbody>
            {filteredEvents.map((e: any) => (
              <TR key={e._id}>
                {columnVisible("event") && (
                  <TD>
                    <Link
                      to={`/organizer/events/${e.slug}`}
                      className="font-medium hover:text-accent transition-colors duration-fast"
                    >
                      {e.title}
                    </Link>
                  </TD>
                )}
                {columnVisible("status") && (
                  <TD>
                    <Badge variant={STATUS_BADGE[e.status] ?? "default"}>{e.status}</Badge>
                  </TD>
                )}
                {columnVisible("slug") && <TD mono>/{e.slug}</TD>}
                {columnVisible("teams") && <TD numeric mono>{e.teamCount}</TD>}
                {columnVisible("submissions") && <TD numeric mono>{e.submissionCount}</TD>}
                {columnVisible("deadline") && (
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
                )}
                {columnVisible("actions") && (
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
                )}
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <p className="flex items-center gap-2 text-[12px] text-muted">
        <Search size={14} aria-hidden="true" />
        Staff-only screen — every publish, transfer and delete is recorded in the audit log.
      </p>

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
