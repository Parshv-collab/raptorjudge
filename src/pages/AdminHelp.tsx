import { useMemo, useState } from "react";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { Navigate } from "react-router-dom";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { humanizeConvexError } from "@/lib/errors";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonTable } from "@/components/ui/SkeletonCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArrowDown, ArrowUp, LifeBuoy, Pencil, Plus, Trash2 } from "lucide-react";

/**
 * Admin CRUD over the help center (issue 27): one table for FAQs and articles
 * with a type filter, inline editing, reorder, visibility toggle and delete.
 * Every write is audited server-side.
 */
export default function AdminHelp() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const entries = useQuery(api.help.listAll, skip ? "skip" : {});
  const createEntry = useMutation(api.help.create);
  const updateEntry = useMutation(api.help.update);
  const reorderEntry = useMutation(api.help.reorder);
  const setEntryVisible = useMutation(api.help.setVisible);
  const removeEntry = useMutation(api.help.remove);

  const [typeFilter, setTypeFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [newType, setNewType] = useState("faq");
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [deleting, setDeleting] = useState<any | null>(null);

  const filtered = useMemo(() => {
    if (entries === undefined) return undefined;
    if (!typeFilter) return entries;
    return entries.filter((e: any) => e.type === typeFilter);
  }, [entries, typeFilter]);

  async function run(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    try {
      await action();
      toast.success(successMessage);
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  function openEdit(entry: any) {
    setEditing(entry);
    setDraftTitle(entry.title);
    setDraftBody(entry.body);
  }

  async function saveEdit() {
    if (!editing) return;
    await run(
      () => updateEntry({ helpId: editing._id, title: draftTitle, body: draftBody }),
      "Help entry updated.",
    );
    setEditing(null);
  }

  async function handleCreate() {
    await run(
      () => createEntry({ type: newType as "faq" | "article", title: newTitle, body: newBody }),
      "Help entry created.",
    );
    setCreating(false);
    setNewTitle("");
    setNewBody("");
  }

  if (authLoading) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonTable rows={4} />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Help content"
        description="Manage the public help center — FAQs and guides, one system."
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <span className="inline-flex items-center gap-1.5">
              <Plus size={14} /> New entry
            </span>
          </Button>
        }
      />

      <div className="flex items-center gap-3">
        <div className="w-48">
          <Dropdown
            label="Filter by type"
            options={[
              { value: "", label: "All types" },
              { value: "faq", label: "FAQ" },
              { value: "article", label: "Article" },
            ]}
            value={typeFilter}
            onChange={(v) => setTypeFilter(v)}
          />
        </div>
      </div>

      {filtered === undefined ? (
        <SkeletonTable rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<LifeBuoy />}
          title="No help entries"
          description={
            typeFilter
              ? `No ${typeFilter} entries yet. Create one or clear the filter.`
              : "Create the first FAQ or guide — it appears on the public /help page immediately."
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((entry: any, index: number) => (
            <div key={entry.id} className="bg-surface-1 border border-line rounded-card p-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={entry.type === "faq" ? "default" : "accent"}>{entry.type}</Badge>
                <span className="font-medium text-primary">{entry.title}</span>
                {!entry.visible && <Badge variant="warning">Hidden</Badge>}
                <span className="text-[11px] text-muted tnum ml-auto">order {entry.order}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy || index === 0}
                    onClick={() => run(() => reorderEntry({ helpId: entry._id, direction: "up" }), "Moved up.")}
                    aria-label="Move up"
                  >
                    <ArrowUp size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy || index === filtered.length - 1}
                    onClick={() => run(() => reorderEntry({ helpId: entry._id, direction: "down" }), "Moved down.")}
                    aria-label="Move down"
                  >
                    <ArrowDown size={14} />
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => openEdit(entry)}>
                    <span className="inline-flex items-center gap-1.5">
                      <Pencil size={13} /> Edit
                    </span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => run(() => setEntryVisible({ helpId: entry._id, visible: !entry.visible }), entry.visible ? "Entry hidden." : "Entry visible.")}
                  >
                    {entry.visible ? "Hide" : "Show"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(entry)} aria-label="Delete entry">
                    <Trash2 size={14} className="text-danger" />
                  </Button>
                </div>
              </div>
              <p className="text-[13px] text-secondary line-clamp-2">{entry.body.replace(/[#*_>`]/g, "").slice(0, 180)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit help entry"
        description="Markdown supported. Changes go live on /help immediately."
        maxWidth="lg"
      >
        <div className="flex flex-col gap-4 mt-2">
          <Input label="Title" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
          <Textarea label="Body (markdown)" rows={8} value={draftBody} onChange={(e) => setDraftBody(e.target.value)} />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" isLoading={busy} disabled={!draftTitle.trim() || !draftBody.trim()} onClick={saveEdit}>
              Save changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create modal */}
      <Modal
        isOpen={creating}
        onClose={() => setCreating(false)}
        title="New help entry"
        description="Pick a type — FAQs render in the accordion, articles as full guides."
        maxWidth="lg"
      >
        <div className="flex flex-col gap-4 mt-2">
          <Dropdown
            label="Type"
            options={[
              { value: "faq", label: "FAQ" },
              { value: "article", label: "Article" },
            ]}
            value={newType}
            onChange={(v) => setNewType(v)}
          />
          <Input label="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <Textarea label="Body (markdown)" rows={8} value={newBody} onChange={(e) => setNewBody(e.target.value)} />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button variant="primary" isLoading={busy} disabled={!newTitle.trim() || !newBody.trim()} onClick={handleCreate}>
              Create entry
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => run(() => removeEntry({ helpId: deleting._id }), "Help entry deleted.").then(() => setDeleting(null))}
        title="Delete help entry"
        description={`"${deleting?.title}" will be removed from the public help page permanently.`}
        confirmLabel="Delete entry"
        destructive
        isLoading={busy}
      />
    </div>
  );
}
