import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { humanizeConvexError } from "@/lib/errors";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonTable } from "@/components/ui/SkeletonCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Crown, ArrowRight } from "lucide-react";

/**
 * Admin review queue for winner overrides (path A of the override system).
 *
 * Accepting pins the proposed project to #1 — the gallery, the project page and
 * every leaderboard read the same event field, so one click re-orders all of
 * them. Rejecting requires a note, which the organizer can read back from their
 * own results tab.
 *
 * The direct override (path B) lives on the event's results tab, where an admin
 * picks the project and confirms by typing its exact title twice over.
 */
export default function AdminWinnerOverrides() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const requests = useQuery(api.winnerOverrides.list, skip ? "skip" : {});
  const review = useMutation(api.winnerOverrides.review);

  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleAccept(request: any) {
    setBusyId(request.id);
    try {
      await review({ overrideId: request.id as never, decision: "accept" });
      toast.success(`“${request.targetTitle}” is now the winner of ${request.eventTitle}.`);
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    setBusyId(rejectTarget.id);
    try {
      await review({
        overrideId: rejectTarget.id as never,
        decision: "reject",
        note: rejectNote.trim(),
      });
      toast.success("Request rejected — the computed winner stands.");
      setRejectTarget(null);
      setRejectNote("");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonTable rows={5} />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  const all = requests ?? [];
  const pending = all.filter((r) => r.status === "pending");
  const decided = all.filter((r) => r.status !== "pending");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Winner overrides"
        description="Organizers can ask for a different winner before results publish. Only an admin can approve it — and every decision is audited."
        actions={
          <Badge variant={pending.length > 0 ? "accent" : "default"}>
            {pending.length} pending
          </Badge>
        }
      />

      {/* Pending requests */}
      <section className="flex flex-col gap-4">
        <h2 className="text-h3 text-primary">Awaiting review</h2>

        {requests === undefined ? (
          <SkeletonTable rows={3} />
        ) : pending.length === 0 ? (
          <EmptyState
            icon={<Crown />}
            title="No pending requests"
            description="When an organizer asks for a different winner, the request lands here with the proposed project and their reason."
          />
        ) : (
          pending.map((request: any) => (
            <div
              key={request.id}
              className="bg-surface-1 border border-accent/40 rounded-card p-6 flex flex-col gap-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold text-primary">{request.eventTitle}</h3>
                  <p className="text-[12px] text-muted mt-1">
                    Requested by {request.requestedBy} ·{" "}
                    {new Date(request.requestedAt).toLocaleString()}
                  </p>
                </div>
                <Badge variant="warning">pending</Badge>
              </div>

              {/* Current → proposed */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-input bg-surface-2 border border-line">
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] uppercase tracking-[0.05em] text-muted">
                    Computed winner
                  </span>
                  <p className="text-[13px] font-medium text-secondary truncate">
                    {request.autoWinnerTitle}
                  </p>
                </div>
                <ArrowRight size={16} className="text-accent shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] uppercase tracking-[0.05em] text-muted">
                    Proposed winner
                  </span>
                  <p className="text-[13px] font-medium text-primary truncate">
                    {request.targetTitle}{" "}
                    <span className="text-muted font-normal">({request.targetTeam})</span>
                  </p>
                </div>
              </div>

              <div>
                <span className="text-[11px] uppercase tracking-[0.05em] text-muted">
                  Organizer&apos;s reason
                </span>
                <p className="text-[13px] text-secondary leading-relaxed mt-1 whitespace-pre-line">
                  {request.reason}
                </p>
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                <Link to={`/organizer/events/${request.eventSlug}`}>
                  <Button variant="ghost" size="sm">
                    Open event console
                  </Button>
                </Link>
                <Button
                  variant="secondary"
                  size="sm"
                  isLoading={busyId === request.id}
                  onClick={() => {
                    setRejectNote("");
                    setRejectTarget(request);
                  }}
                >
                  Reject
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  isLoading={busyId === request.id}
                  disabled={request.published}
                  title={request.published ? "Results are published — overrides are closed" : undefined}
                  onClick={() => handleAccept(request)}
                >
                  Accept override
                </Button>
              </div>
            </div>
          ))
        )}
      </section>

      {/* History */}
      <section className="flex flex-col gap-4">
        <h2 className="text-h3 text-primary">Decided requests</h2>
        {decided.length === 0 ? (
          <p className="text-[13px] text-muted">No decisions recorded yet.</p>
        ) : (
          <Table caption="Decided winner overrides">
            <THead>
              <tr>
                <TH>Event</TH>
                <TH>Project</TH>
                <TH>Source</TH>
                <TH>Decision</TH>
                <TH>Note</TH>
              </tr>
            </THead>
            <tbody>
              {decided.map((request: any) => (
                <TR key={request.id}>
                  <TD>
                    <span className="font-medium">{request.eventTitle}</span>
                  </TD>
                  <TD>{request.targetTitle}</TD>
                  <TD mono>{request.source === "admin_direct" ? "admin_direct" : "organizer_request"}</TD>
                  <TD>
                    <Badge variant={request.status === "accepted" ? "success" : "default"}>
                      {request.status}
                    </Badge>
                  </TD>
                  <TD>
                    <span className="text-secondary">{request.reviewerNote || "—"}</span>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      {/* Reject modal */}
      <Modal
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject winner override"
        description={`Explain why “${rejectTarget?.targetTitle}” will not replace the computed winner.`}
      >
        <div className="flex flex-col gap-4 mt-2">
          <Textarea
            label="Note to the organizer (required)"
            rows={4}
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="e.g. The rubric weights were changed after judging closed, so the computed ranking stands."
          />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={busyId === rejectTarget?.id}
              disabled={rejectNote.trim().length < 3}
              onClick={handleReject}
            >
              Reject request
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
