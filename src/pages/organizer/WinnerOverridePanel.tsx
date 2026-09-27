import { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { DangerConfirmModal } from "@/components/ui/DangerConfirmModal";
import { humanizeConvexError } from "@/lib/errors";
import { Crown, ShieldAlert } from "lucide-react";

const MIN_REASON_LENGTH = 20;

export interface WinnerOverridePanelProps {
  eventId: any;
  /** Submitted projects for the event: `{ _id, title, teamName }`. */
  submissions: any[];
  /** True for platform admins (they get the direct override path). */
  isAdmin: boolean;
}

/**
 * Winner override, both paths, in one panel on the results tab.
 *
 * Path A (organizer): pick a project, write why, submit — the request is
 * `pending` and changes nothing until an admin accepts it. The panel then shows
 * the decision and the reviewer's note.
 *
 * Path B (admin): pick a project, then two confirmations — a proceed modal that
 * shows current vs new winner, then a typed confirmation of the exact project
 * title. Only then is the override applied.
 *
 * Both are closed once results publish (`published` below), and both are logged
 * to the audit chain server-side.
 */
export function WinnerOverridePanel({ eventId, submissions, isAdmin }: WinnerOverridePanelProps) {
  const context = useQuery(api.winnerOverrides.forEvent, eventId ? { eventId } : "skip");
  const requestOverride = useMutation(api.winnerOverrides.requestOverride);
  const directOverride = useMutation(api.winnerOverrides.directOverride);
  const clearOverride = useMutation(api.winnerOverrides.clearOverride);

  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Admin two-step confirmation
  const [proceedOpen, setProceedOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const options = useMemo(
    () =>
      (submissions || [])
        .filter((s: any) => s.status === "submitted")
        .map((s: any) => ({ value: String(s._id), label: `${s.title} — ${s.teamName ?? "—"}` })),
    [submissions],
  );

  const target = useMemo(
    () => (submissions || []).find((s: any) => String(s._id) === targetId) ?? null,
    [submissions, targetId],
  );

  const published = Boolean(context?.published);
  const overridden = Boolean(context?.winnerIsOverridden);
  const effectiveWinner = context?.effectiveWinner ?? null;
  const autoWinner = context?.autoWinner ?? null;
  const requests = context?.requests ?? [];

  async function handleRequest() {
    if (!targetId) return;
    setBusy(true);
    try {
      await requestOverride({
        eventId,
        targetProjectId: targetId as never,
        reason: reason.trim(),
      });
      toast.success("Override request sent to the platform admins.");
      setReason("");
      setTargetId("");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDirectOverride() {
    if (!targetId) return;
    setBusy(true);
    try {
      await directOverride({
        eventId,
        targetProjectId: targetId as never,
        reason: `Admin direct override → ${target?.title ?? targetId}`,
      });
      toast.success(`“${target?.title}” is now pinned as the winner.`);
      setConfirmOpen(false);
      setTargetId("");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    setBusy(true);
    try {
      await clearOverride({ eventId, note: "Override removed from the results tab" });
      toast.success("Override removed — the computed winner is back in place.");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  const canSubmitRequest = Boolean(targetId) && reason.trim().length >= MIN_REASON_LENGTH && !published;

  return (
    <div className="bg-surface-1 border border-line rounded-card p-6 flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-[15px] font-semibold text-primary flex items-center gap-2">
            <Crown size={16} className="text-accent" aria-hidden="true" />
            Winner override
          </h4>
          <p className="text-[13px] text-secondary mt-0.5">
            Pin a specific project to #1. {isAdmin ? "As an admin this applies immediately; " : "The platform admins must approve it; "}
            the override is refused once results are published.
          </p>
        </div>
        {overridden ? (
          <Badge variant="warning">overridden</Badge>
        ) : (
          <Badge variant="default">computed ranking</Badge>
        )}
      </div>

      {/* Current state */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-input bg-surface-2 border border-line">
          <span className="text-[11px] uppercase tracking-[0.05em] text-muted">Winner now</span>
          <p className="text-[13px] font-medium text-primary mt-1 truncate">
            {effectiveWinner?.title ?? "—"}
          </p>
          {effectiveWinner?.overridden && (
            <span className="text-[12px] text-warning">pinned by override</span>
          )}
        </div>
        <div className="p-4 rounded-input bg-surface-2 border border-line">
          <span className="text-[11px] uppercase tracking-[0.05em] text-muted">Computed #1</span>
          <p className="text-[13px] font-medium text-secondary mt-1 truncate">
            {autoWinner?.title ?? "—"}
          </p>
          {context?.method && (
            <span className="text-[12px] text-muted font-mono">
              {context.method === "pairwise" ? "bradley-terry" : "normalized z-score"}
            </span>
          )}
        </div>
      </div>

      {published ? (
        <p className="text-[13px] text-muted flex items-center gap-2">
          <ShieldAlert size={14} aria-hidden="true" />
          Results are published — overrides are closed. Unpublish (or move back to judging) to reopen
          them.
        </p>
      ) : (
        <div className="flex flex-col gap-4 border-t border-line pt-5">
          <div className="w-full sm:max-w-md">
            <Dropdown
              label="Target project"
              options={options}
              value={targetId}
              onChange={(v) => setTargetId(v)}
              placeholder="Select the project that should win"
            />
          </div>

          <Textarea
            label={isAdmin ? "Reason (optional for admins)" : `Reason (required, min ${MIN_REASON_LENGTH} characters)`}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Tie-break ruled by the event jury: the demo was incomplete at submission time."
          />
          {!isAdmin && (
            <span className="text-[12px] text-muted tnum -mt-2">
              {reason.trim().length}/{MIN_REASON_LENGTH} characters
            </span>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            {overridden && isAdmin && (
              <Button variant="ghost" isLoading={busy} onClick={handleClear}>
                Clear override
              </Button>
            )}
            {isAdmin ? (
              <Button
                variant="danger"
                disabled={!targetId}
                onClick={() => setProceedOpen(true)}
              >
                Override Winner
              </Button>
            ) : (
              <Button
                variant="primary"
                isLoading={busy}
                disabled={!canSubmitRequest}
                onClick={handleRequest}
              >
                Request winner override
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Requests + decisions */}
      {requests.length > 0 && (
        <div className="border-t border-line pt-5 flex flex-col gap-3">
          <h5 className="text-[13px] font-medium text-primary">Override requests</h5>
          {requests.map((r: any) => (
            <div
              key={r.id}
              className="p-4 rounded-input bg-surface-2 border border-line flex flex-col gap-1.5 text-[13px]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-primary">{r.targetTitle}</span>
                <Badge
                  variant={
                    r.status === "accepted" ? "success" : r.status === "rejected" ? "danger" : "warning"
                  }
                >
                  {r.status}
                </Badge>
              </div>
              <p className="text-secondary leading-relaxed">{r.reason}</p>
              <span className="text-[12px] text-muted">
                {r.requestedBy} · {new Date(r.requestedAt).toLocaleString()}
                {r.source === "admin_direct" ? " · admin direct override" : ""}
              </span>
              {r.reviewerNote && (
                <p className="text-[12px] text-warning">Reviewer note: {r.reviewerNote}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Step 1 — proceed */}
      <Modal
        isOpen={proceedOpen}
        onClose={() => setProceedOpen(false)}
        title="Override Winner"
        maxWidth="lg"
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2 text-[13px]">
            <p>
              Current winner:{" "}
              <span className="font-medium text-primary">
                {effectiveWinner?.title ?? "—"}
              </span>
            </p>
            <p>
              New winner: <span className="font-medium text-primary">{target?.title ?? "—"}</span>
              {target?.teamName ? <span className="text-muted"> by {target.teamName}</span> : null}
            </p>
          </div>
          <p className="text-[13px] text-warning leading-relaxed">
            This will be recorded in the audit log, cannot be undone without another override, and
            re-sorts the public gallery the moment it is applied.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setProceedOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setProceedOpen(false);
                setConfirmOpen(true);
              }}
            >
              Proceed
            </Button>
          </div>
        </div>
      </Modal>

      {/* Step 2 — typed confirmation */}
      <DangerConfirmModal
        isOpen={confirmOpen}
        title="Override Winner"
        expectedText={target?.title ?? ""}
        confirmLabel="Override Winner"
        isLoading={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleDirectOverride}
        body={
          <>
            <p>
              Current winner: <span className="text-primary">{effectiveWinner?.title ?? "—"}</span>
            </p>
            <p>
              New winner:{" "}
              <span className="text-primary">
                {target?.title ?? "—"}
              </span>
              {target?.teamName ? <span className="text-muted"> by {target.teamName}</span> : null}
            </p>
            <p className="text-warning">
              This will be recorded in the audit log and re-sorts the published gallery.
            </p>
          </>
        }
      />
    </div>
  );
}
