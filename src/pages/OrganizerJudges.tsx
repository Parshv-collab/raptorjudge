import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { humanizeConvexError } from "@/lib/errors";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/SkeletonCard";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Scale, Mail, UserMinus } from "lucide-react";

/**
 * Cross-event judge management (issue 35).
 *
 * The organizer sidebar's "Judges" entry used to point back at the event list,
 * so there was no screen that answered "who is judging, and how far along are
 * they?". This page aggregates every judge-role account with their per-event
 * scoring progress, lets an organizer invite a new judge, remove one from an
 * event, and jump to that event's scores.
 */
export default function OrganizerJudges() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const me = useQuery(api.users.me, skip ? "skip" : {});
  const isOrganizer = me?.role === "organizer" || me?.role === "admin";
  const ready = !skip && isOrganizer;

  const [eventFilter, setEventFilter] = useState("");
  const judges = useQuery(
    api.judging.judgesOverview,
    ready ? (eventFilter ? { eventId: eventFilter as never } : {}) : "skip",
  );
  const events = useQuery(api.events.listWithCounts, ready ? {} : "skip");

  const createInvite = useMutation(api.admin.createInvite);
  const removeJudge = useMutation(api.judging.removeJudgeFromEvent);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteEventId, setInviteEventId] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ judgeId: string; eventId: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const eventOptions = useMemo(
    () => (events ?? []).map((e: any) => ({ value: e._id, label: e.title })),
    [events],
  );

  if (authLoading || (isAuthenticated && me === undefined)) {
    return <SkeletonTable rows={6} />;
  }
  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  if (me && !isOrganizer) {
    return (
      <EmptyState
        title="Organizer access required"
        description="Judge management is limited to organizers and platform admins."
        actionLabel="Go to my dashboard"
        onAction={() => navigate("/home")}
      />
    );
  }

  async function handleInvite() {
    setInviteBusy(true);
    try {
      const res = await createInvite({
        email: inviteEmail.trim() || undefined,
        role: "judge",
        eventId: inviteEventId ? (inviteEventId as never) : undefined,
      });
      setInviteUrl(`${window.location.origin}${res.url}`);
      toast.success("Judge invite created.");
    } catch (err) {
      toast.error(humanizeConvexError(err));
    } finally {
      setInviteBusy(false);
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setBusy(true);
    try {
      const res = await removeJudge({
        judgeId: removeTarget.judgeId as never,
        eventId: removeTarget.eventId as never,
      });
      toast.success(`Removed ${removeTarget.name} — ${res.removed} assignment(s) deleted.`);
      setRemoveTarget(null);
    } catch (err) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Judges"
        description="Every judge on the platform, their event assignments and scoring progress."
        actions={
          <Button variant="primary" onClick={() => { setInviteOpen(true); setInviteUrl(null); setInviteEmail(""); setInviteEventId(""); }}>
            <Mail size={16} aria-hidden="true" />
            Invite judge
          </Button>
        }
      />

      <div className="bg-surface-1 border border-line rounded-card p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-full sm:w-72">
          <Dropdown
            label="Filter by event"
            options={[{ value: "", label: "All events" }, ...eventOptions]}
            value={eventFilter}
            onChange={(v) => setEventFilter(v)}
          />
        </div>
        <span className="text-[13px] text-muted tnum">
          {judges?.length ?? 0} judge{(judges?.length ?? 0) === 1 ? "" : "s"}
        </span>
      </div>

      {judges === undefined ? (
        <SkeletonTable rows={6} />
      ) : judges.length === 0 ? (
        <EmptyState
          icon={<Scale />}
          title={eventFilter ? "No judges assigned to this event" : "No judges yet"}
          description={
            eventFilter
              ? "Assign judges from this event's console, or invite one with the button above."
              : "Invite a judge and they will appear here once they accept."
          }
          actionLabel="Invite judge"
          onAction={() => {
            setInviteOpen(true);
            setInviteUrl(null);
          }}
        />
      ) : (
        <Table caption="Judges">
          <THead>
            <tr>
              <TH>Judge</TH>
              <TH>Email</TH>
              <TH>Events assigned</TH>
              <TH numeric>Overall progress</TH>
              <TH numeric>Actions</TH>
            </tr>
          </THead>
          <tbody>
            {judges.map((judge: any) => (
              <TR key={judge._id}>
                <TD>
                  <span className="font-medium">{judge.name || "—"}</span>
                  {judge.disabled && (
                    <Badge variant="warning" className="ml-2">
                      disabled
                    </Badge>
                  )}
                </TD>
                <TD mono>{judge.email}</TD>
                <TD>
                  {judge.events.length === 0 ? (
                    <span className="text-muted text-[13px]">No assignments</span>
                  ) : (
                    <div className="flex flex-col gap-2 py-1">
                      {judge.events.map((ev: any) => (
                        <div key={ev.eventId} className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] text-primary">{ev.eventTitle}</span>
                          <Badge>{ev.eventStatus}</Badge>
                          <span className="text-[12px] text-muted tnum">
                            {ev.completed}/{ev.assigned} scored
                          </span>
                          {judge.events.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setRemoveTarget({
                                  judgeId: judge._id,
                                  eventId: ev.eventId,
                                  name: judge.name || judge.email,
                                })
                              }
                              className="text-[12px] text-muted hover:text-danger transition-colors duration-fast"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </TD>
                <TD numeric>
                  <div className="flex items-center justify-end gap-2">
                    <span className="tnum text-secondary text-[13px]">
                      {judge.totalCompleted}/{judge.totalAssigned}
                    </span>
                  </div>
                  {judge.totalAssigned > 0 && (
                    <div className="mt-1.5 w-28 ml-auto">
                      <ProgressBar
                        value={Math.round((judge.totalCompleted / judge.totalAssigned) * 100)}
                      />
                    </div>
                  )}
                </TD>
                <TD numeric>
                  <div className="flex justify-end gap-1.5">
                    <Link
                      to={
                        judge.events[0]
                          ? `/organizer/events/${events?.find((e: any) => e._id === judge.events[0].eventId)?.slug ?? ""}`
                          : "/organizer/events"
                      }
                    >
                      <Button variant="secondary" size="sm">
                        View scores
                      </Button>
                    </Link>
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <p className="text-[12px] text-muted">
        Removing a judge deletes their assignments and any scores recorded against them for that
        event. It is recorded in the audit log.
      </p>

      <Modal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a judge"
        description="Creates a single-use invite link. The recipient signs up, then redeems it to gain the judge role."
      >
        <div className="flex flex-col gap-4 mt-2">
          {/*
            `Input`, not a hand-rolled `<input>`: the bespoke version styled
            itself with `focus:outline-none`, which removed the only visible
            focus indication in this dialog — the global focus ring is the one
            thing every other field on the platform relies on.
          */}
          <Input
            label="Email (optional)"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="judge@example.org"
            helperText="Leave blank to mint an open link anyone can redeem."
          />
          <Dropdown
            label="Scope to event (optional)"
            options={[{ value: "", label: "Any event" }, ...eventOptions]}
            value={inviteEventId}
            onChange={(v) => setInviteEventId(v)}
          />

          {inviteUrl && (
            <div className="p-3 rounded-input bg-surface-2 border border-line">
              <p className="text-[12px] text-muted mb-1">Share this link:</p>
              <code className="text-[12px] text-accent break-all">{inviteUrl}</code>
              <div className="mt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteUrl);
                    toast.success("Invite link copied");
                  }}
                >
                  Copy link
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-2">
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Close
            </Button>
            <Button variant="primary" isLoading={inviteBusy} onClick={handleInvite}>
              Create invite
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        title="Remove judge from event"
        description={`Remove ${removeTarget?.name} from this event? Their assignments and scores for the event are deleted.`}
        confirmLabel="Remove judge"
        destructive
        isLoading={busy}
      />
    </div>
  );
}
