import React, { useState, useEffect } from "react";
import { useSearchParams, Link, Navigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { Dropdown } from "@/components/ui/Dropdown";
import { Alert } from "@/components/ui/Alert";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Markdown } from "@/components/ui/Markdown";
import { EventPicker } from "@/components/participant/EventPicker";
import { humanizeConvexError } from "@/lib/errors";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { usePrimaryEventSlug } from "@/lib/featuredEvent";
import type { Id } from "@/convex/_generated/dataModel";

export default function ParticipantWorkspace() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const [searchParams] = useSearchParams();
  const primarySlug = usePrimaryEventSlug();
  const eventSlug = searchParams.get("event") ?? primarySlug;

  const event = useQuery(api.events.getBySlug, skip || !eventSlug ? "skip" : { slug: eventSlug });
  const tracks = useQuery(api.tracks.listByEvent, skip || !event ? "skip" : { eventId: event._id });
  const myTeam = useQuery(api.teams.myTeams, skip || !event ? "skip" : { eventId: event._id });
  const data = useQuery(api.submissions.mySubmission, skip || !event ? "skip" : { eventId: event._id });
  const certs = useQuery(api.certificates.mine, skip ? "skip" : {});
  // Issue 40: the events this participant can switch between.
  const enrolledEvents = useQuery(api.events.enrolled, skip ? "skip" : {});

  const participantState = useQuery(api.participate.getParticipantState, skip || !event ? "skip" : { eventId: event._id });
  const joinSolo = useMutation(api.participate.joinSolo);
  const toggleLookingForTeam = useMutation(api.participate.toggleLookingForTeam);

  const createTeam = useMutation(api.teams.create);
  const joinTeam = useMutation(api.teams.joinByInviteCode);
  const leaveTeam = useMutation(api.teams.leave);
  const transferLeadership = useMutation(api.teams.transferLeadership);
  const saveDraft = useMutation(api.submissions.saveDraft);
  const submitProj = useMutation(api.submissions.submit);
  const withdrawProj = useMutation(api.submissions.withdraw);

  const [teamNameInput, setTeamNameInput] = useState("");
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [busy, setBusy] = useState(false);

  // Confirm dialog state
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<any>(null);

  const [draft, setDraft] = useState({
    title: "",
    tagline: "",
    description: "",
    repositoryUrl: "",
    videoUrl: "",
    demoUrl: "",
    tags: "",
    trackId: "",
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data?.submission && !dirty) {
      setDraft({
        title: data.submission.title ?? "",
        tagline: data.submission.tagline ?? "",
        description: data.submission.description ?? "",
        repositoryUrl: data.submission.repositoryUrl ?? "",
        videoUrl: data.submission.videoUrl ?? "",
        demoUrl: data.submission.demoUrl ?? "",
        tags: data.submission.tags ?? "",
        trackId: data.submission.trackId ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.submission?._id]);

  const me = useQuery(api.users.me, skip ? "skip" : {});
  const team = myTeam?.[0];
  const submission = data?.submission;
  const now = Date.now();
  const deadlinePassed = event ? now > event.submissionDeadline : false;
  const isLocked = submission?.status === "submitted" || deadlinePassed;

  // Issue 41: registration window — the create/join/solo UI must not render once
  // registration has closed (or before it opens). Mirrors `assertWithinWindow`
  // in the backend, which would refuse the write anyway.
  const registrationEnd = event?.registrationCloses ?? event?.registrationEnd ?? Number.MAX_SAFE_INTEGER;
  const registrationStart = event?.registrationOpens ?? event?.registrationStart ?? 0;
  const registrationClosed = event ? now > registrationEnd : false;
  const registrationNotOpen = event ? now < registrationStart : false;
  const canRegister = !registrationClosed && !registrationNotOpen;

  const currentMember = team?.members.find((m: any) => m.userId === me?._id);
  const isLeader = !team || !currentMember || currentMember.memberRole === "leader";

  async function handleSaveDraft() {
    if (!event) return;
    setBusy(true);
    try {
      await saveDraft({
        eventId: event._id,
        title: draft.title,
        tagline: draft.tagline,
        description: draft.description,
        repositoryUrl: draft.repositoryUrl,
        videoUrl: draft.videoUrl,
        demoUrl: draft.demoUrl,
        tags: draft.tags,
        trackId: (draft.trackId || undefined) as never,
      });
      setDirty(false);
      toast.success("Draft saved");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoSolo() {
    if (!event) return;
    setBusy(true);
    try {
      await joinSolo({ eventId: event._id });
      toast.success("Registered as solo participant");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitForJudging() {
    if (!event) return;
    setBusy(true);
    try {
      await handleSaveDraft();
      await submitProj({ eventId: event._id });
      toast.success("Submission sent for judging");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleWithdraw() {
    if (!event) return;
    setBusy(true);
    try {
      await withdrawProj({ eventId: event._id });
      toast.success("Submission withdrawn to draft");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateTeam() {
    if (!event || !teamNameInput.trim()) return;
    setBusy(true);
    try {
      const res = await createTeam({ eventId: event._id, name: teamNameInput.trim() });
      toast.success(`Team created — invite code: ${res.inviteCode}`);
      setTeamNameInput("");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinTeam() {
    if (!inviteCodeInput.trim()) return;
    setBusy(true);
    try {
      const res = await joinTeam({ inviteCode: inviteCodeInput.trim().toLowerCase() });
      toast.success(`Joined team ${res.teamName}`);
      setInviteCodeInput("");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (myTeam === undefined || event === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (event === null) {
    return (
      <div className="py-16 text-center flex flex-col items-center gap-3">
        <h1 className="text-h2 text-primary">Event not found</h1>
        <Link to="/events" className="text-sm text-accent hover:text-accent-hover">
          Browse events →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title={event.title}
        description="Team, submission and chat for this event."
        actions={
          <div className="bg-surface-1 border border-line rounded-card px-4 py-2.5 flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.05em] text-muted">Submission deadline</span>
            <span className="text-[13px] font-medium text-primary tnum">
              {formatDateTime(event.submissionDeadline)}
            </span>
          </div>
        }
      />

      {/* Issue 40: pick which enrolled event this workspace is about. */}
      <EventPicker
        events={((enrolledEvents ?? []) as any[]).map((e) => ({ slug: e.slug, title: e.title, status: e.status }))}
        value={eventSlug}
      />

      {deadlinePassed && (
        <Alert variant="warning" title="Submission deadline passed">
          The submission window for this event has closed. Form fields are read-only.
        </Alert>
      )}

      {/* Team */}
      <section className="flex flex-col gap-4">
        <h2 className="text-h2 text-primary">Team</h2>

        {!team && !canRegister ? (
          <Alert variant="warning" title="Registration closed">
            {registrationNotOpen
              ? "Registration for this event has not opened yet."
              : "Registration closed. You can no longer join this event."}
          </Alert>
        ) : !team ? (
          <div className={`grid grid-cols-1 ${event?.soloAllowed !== false ? "md:grid-cols-3" : "md:grid-cols-2"} gap-8`}>
            <div className="flex flex-col gap-3">
              <h3 className="text-[15px] font-semibold text-primary">Create a new team</h3>
              <p className="text-[13px] text-secondary">Start a team as leader and invite members with a code.</p>
              <div className="flex gap-2">
                <Input
                  aria-label="Team name"
                  placeholder="Team name"
                  value={teamNameInput}
                  onChange={(e) => setTeamNameInput(e.target.value)}
                />
                <Button variant="primary" size="md" isLoading={busy} disabled={!teamNameInput.trim()} onClick={handleCreateTeam}>
                  Create
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-3 md:border-l border-line md:pl-8">
              <h3 className="text-[15px] font-semibold text-primary">Join with invite code</h3>
              <p className="text-[13px] text-secondary">Enter an existing team invite code from a teammate.</p>
              <div className="flex gap-2">
                <Input
                  aria-label="Invite code"
                  placeholder="Invite code"
                  value={inviteCodeInput}
                  onChange={(e) => setInviteCodeInput(e.target.value)}
                />
                <Button variant="secondary" size="md" isLoading={busy} disabled={!inviteCodeInput.trim()} onClick={handleJoinTeam}>
                  Join
                </Button>
              </div>
            </div>

            {event?.soloAllowed !== false && (
              <div className="flex flex-col gap-3 md:border-l border-line md:pl-8">
                <h3 className="text-[15px] font-semibold text-primary">Go solo</h3>
                <p className="text-[13px] text-secondary">Participate individually without a team.</p>
                <Button variant="secondary" size="md" isLoading={busy} onClick={handleGoSolo}>
                  Go solo
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-1 border border-line rounded-card p-5">
              <div>
                <span className="text-[11px] uppercase tracking-[0.08em] text-accent font-medium">Your team</span>
                <h3 className="text-h2 text-primary">{team.name}</h3>
              </div>

              <div className="flex items-center gap-2">
                <div className="px-3 h-9 inline-flex items-center rounded-btn bg-surface-2 border border-line font-mono text-[13px] text-primary">
                  {team.inviteCode}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(team.inviteCode);
                    toast.success("Invite code copied");
                  }}
                >
                  Copy
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmLeaveOpen(true)}>
                  Leave
                </Button>
              </div>
            </div>

            {/* Members */}
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-[13px] font-medium text-secondary">Team members</span>
                {team.members.length === 1 && event?.soloAllowed !== false && (
                  <label className="flex items-center gap-2 text-[13px] text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded-[4px] appearance-none border border-line-strong bg-surface-1 checked:bg-accent checked:border-accent cursor-pointer"
                      checked={!!participantState?.lookingForTeam}
                      onChange={async (e) => {
                        if (!event) return;
                        try {
                          await toggleLookingForTeam({
                            eventId: event._id,
                            lookingForTeam: e.target.checked,
                          });
                          toast.success(
                            e.target.checked ? "Looking for a teammate enabled" : "Looking for a teammate disabled"
                          );
                        } catch (err: any) {
                          toast.error(humanizeConvexError(err));
                        }
                      }}
                    />
                    <span>Looking for a teammate</span>
                  </label>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {team.members.map((member: any) => (
                  <div
                    key={member.userId}
                    className="bg-surface-1 border border-line rounded-card p-3.5 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={member.name} size="sm" />
                      <div>
                        <p className="text-[13px] font-medium text-primary">{member.name}</p>
                        <p className="text-[11px] text-muted capitalize">{member.memberRole}</p>
                      </div>
                    </div>

                    {member.memberRole !== "leader" && (
                      <Button variant="ghost" size="sm" onClick={() => setTransferTarget(member)}>
                        Make leader
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Team chat */}
      {/* `listMessages` re-checks membership on every call and throws if the
          caller is no longer on the team. Without this boundary a stale
          selection (or a membership removed mid-session) replaced the whole
          app with the root "Could not load page" screen. `key` remounts on
          team change so a recovered panel is not stuck on the fallback. */}
      {team && (
        <ErrorBoundary
          key={String(team._id)}
          fallback={
            <Alert variant="warning" title="This conversation is not available">
              You are not a member of this team any more, or the team was removed. Reload the workspace
              to pick up your current teams.
            </Alert>
          }
        >
          <TeamChatSection teamId={team._id} />
        </ErrorBoundary>
      )}

      {/* Submission */}
      {team && (
        <section className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h2 className="text-h2 text-primary">Project submission</h2>
            {submission?.status === "submitted" && <Badge variant="success">Submitted</Badge>}
          </div>

          <div className="bg-surface-1 border border-line rounded-card p-6 flex flex-col gap-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Project title"
                required
                disabled={isLocked}
                value={draft.title}
                onChange={(e) => {
                  setDraft({ ...draft, title: e.target.value });
                  setDirty(true);
                }}
                placeholder="Awesome AI Assistant"
              />
              <Input
                label="Tagline"
                disabled={isLocked}
                value={draft.tagline}
                onChange={(e) => {
                  setDraft({ ...draft, tagline: e.target.value });
                  setDirty(true);
                }}
                placeholder="One sentence pitch"
              />
            </div>

            <Dropdown
              label="Track"
              disabled={isLocked}
              value={draft.trackId}
              onChange={(val) => {
                setDraft({ ...draft, trackId: val });
                setDirty(true);
              }}
              options={[
                { value: "", label: "General Track" },
                ...(tracks || []).map((t) => ({ value: t._id, label: t.name })),
              ]}
            />

            <Textarea
              label="Description (Markdown supported)"
              required
              disabled={isLocked}
              rows={6}
              value={draft.description}
              onChange={(e) => {
                setDraft({ ...draft, description: e.target.value });
                setDirty(true);
              }}
              placeholder="Describe what you built, how it works, and technologies used..."
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Repository URL"
                disabled={isLocked}
                value={draft.repositoryUrl}
                onChange={(e) => {
                  setDraft({ ...draft, repositoryUrl: e.target.value });
                  setDirty(true);
                }}
                placeholder="https://github.com/..."
              />
              <Input
                label="Video demo URL"
                disabled={isLocked}
                value={draft.videoUrl}
                onChange={(e) => {
                  setDraft({ ...draft, videoUrl: e.target.value });
                  setDirty(true);
                }}
                placeholder="https://youtube.com/..."
              />
              <Input
                label="Live demo URL"
                disabled={isLocked}
                value={draft.demoUrl}
                onChange={(e) => {
                  setDraft({ ...draft, demoUrl: e.target.value });
                  setDirty(true);
                }}
                placeholder="https://demo.app"
              />
            </div>

            <Input
              label="Tags (comma-separated)"
              disabled={isLocked}
              value={draft.tags}
              onChange={(e) => {
                setDraft({ ...draft, tags: e.target.value });
                setDirty(true);
              }}
              placeholder="ai, web3, devtools"
            />

            <div className="flex flex-wrap items-center gap-3 mt-2 pt-5 border-t border-line">
              <Button variant="secondary" size="md" isLoading={busy} disabled={isLocked || !dirty} onClick={handleSaveDraft}>
                {dirty ? "Save draft" : "Saved"}
              </Button>

              {submission?.status !== "submitted" ? (
                isLeader ? (
                  <Button
                    variant="primary"
                    size="md"
                    isLoading={busy}
                    disabled={isLocked || !draft.title.trim() || !draft.description.trim()}
                    onClick={() => setConfirmSubmitOpen(true)}
                  >
                    Submit for judging
                  </Button>
                ) : (
                  <span className="text-[13px] text-secondary bg-surface-2 px-3 py-2 rounded-btn">
                    Only the team leader can submit this project.
                  </span>
                )
              ) : (
                !deadlinePassed &&
                isLeader && (
                  <Button variant="danger" size="md" isLoading={busy} onClick={handleWithdraw}>
                    Withdraw to edit
                  </Button>
                )
              )}
            </div>
          </div>
        </section>
      )}

      {/* Confirm dialogs */}
      <ConfirmDialog
        isOpen={confirmSubmitOpen}
        onClose={() => setConfirmSubmitOpen(false)}
        onConfirm={handleSubmitForJudging}
        title="Confirm project submission"
        description="Submitting locks editing. You can withdraw before the deadline if allowed. Are you ready to submit?"
        confirmLabel="Submit project"
        isLoading={busy}
      />

      <ConfirmDialog
        isOpen={confirmLeaveOpen}
        onClose={() => setConfirmLeaveOpen(false)}
        onConfirm={async () => {
          if (!team) return;
          setBusy(true);
          try {
            await leaveTeam({ teamId: team._id });
            toast.success("Left team");
          } catch (e: any) {
            toast.error(humanizeConvexError(e));
          } finally {
            setBusy(false);
          }
        }}
        title="Leave team"
        description="Are you sure you want to leave this team? You will need an invite code to rejoin."
        confirmLabel="Leave team"
        destructive
        isLoading={busy}
      />

      <ConfirmDialog
        isOpen={!!transferTarget}
        onClose={() => setTransferTarget(null)}
        onConfirm={async () => {
          if (!team || !transferTarget) return;
          setBusy(true);
          try {
            await transferLeadership({
              teamId: team._id,
              newLeaderId: transferTarget.userId,
            });
            toast.success(`Transferred leadership to ${transferTarget.name}`);
          } catch (e: any) {
            toast.error(humanizeConvexError(e));
          } finally {
            setBusy(false);
          }
        }}
        title="Transfer leadership"
        description={`Are you sure you want to transfer team leadership to ${transferTarget?.name}?`}
        confirmLabel="Transfer leadership"
        isLoading={busy}
      />

      {/* Certificates */}
      {certs && certs.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-h2 text-primary">Your certificates</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {certs.map((c: any) => (
              <div key={c._id} className="bg-surface-1 border border-line rounded-card p-5 flex justify-between items-center">
                <div className="min-w-0">
                  <h4 className="text-[13px] font-medium text-primary">{c.title}</h4>
                  <p className="font-mono text-[11px] text-muted truncate">{c.certUuid.substring(0, 16)}…</p>
                </div>
                <Link to={`/verify/${c.certUuid}?signature=${c.signatureHash}`}>
                  <Button variant="secondary" size="sm">
                    Verify
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Private team chat + file sharing.
 *
 * Exported so the dedicated `/workspace/chat` route can reuse the exact same
 * composer instead of maintaining a second copy of the upload logic.
 */
export function TeamChatSection({ teamId, className = "" }: { teamId: Id<"teams">; className?: string }) {
  const messages = useQuery(api.teamChat.listMessages, { teamId });
  const sendMessage = useMutation(api.teamChat.sendMessage);
  const generateUploadUrl = useMutation(api.teamChat.generateUploadUrl);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{
    storageId: string;
    name: string;
    type: string;
  } | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && !attachedFile) return;
    setBusy(true);
    try {
      await sendMessage({
        teamId,
        content: text.trim(),
        fileStorageId: attachedFile?.storageId as never,
        fileName: attachedFile?.name,
        fileType: attachedFile?.type,
      });
      setText("");
      setAttachedFile(null);
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Max file size is 10MB.");
      return;
    }
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({ teamId });
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      const { storageId } = await res.json();
      setAttachedFile({ storageId, name: file.name, type: file.type });
      toast.success("File attached");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className={`flex flex-col gap-4 ${className}`}>
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div>
          <h2 className="text-h2 text-primary">Team chat</h2>
          <p className="text-[13px] text-secondary">Private discussion and shared attachments, visible only to team members.</p>
        </div>
        <Badge variant="accent">Private room</Badge>
      </div>

      <div className="bg-surface-1 border border-line rounded-card p-4 flex flex-col gap-4">
        {/* Message stream */}
        <div className="max-h-96 overflow-y-auto flex flex-col gap-3">
          {(messages || []).map((msg: any) => (
            <div key={msg.id} className="bg-surface-2 border border-line rounded-card p-3.5 flex flex-col gap-1">
              <div className="flex justify-between items-center gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <Avatar src={msg.authorAvatar} name={msg.authorName} size="sm" />
                  <span className="text-[13px] font-medium text-primary truncate">{msg.authorName}</span>
                </span>
                <span className="text-[11px] text-muted tnum shrink-0">
                  {formatTime(msg.createdAt)}
                </span>
              </div>

              {msg.content && (
                <Markdown content={msg.content} className="text-[13px]" />
              )}

              {msg.fileUrl && (
                <div className="mt-1 pt-2 border-t border-line flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 10-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20 13" />
                  </svg>
                  <a
                    href={msg.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] font-medium text-accent hover:text-accent-hover truncate max-w-xs"
                  >
                    {msg.fileName || "Download attachment"}
                  </a>
                </div>
              )}
            </div>
          ))}

          {messages === undefined ? (
            <div className="flex flex-col gap-3 py-2" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-card bg-surface-2 border border-line p-3.5 animate-pulse">
                  <div className="h-3 w-32 rounded-btn bg-surface-1" />
                  <div className="h-3 w-3/4 rounded-btn bg-surface-1 mt-2" />
                </div>
              ))}
            </div>
          ) : (
            messages.length === 0 && (
              <p className="text-[13px] text-muted text-center py-10">
                No team messages yet. Start the conversation with your team.
              </p>
            )
          )}
        </div>

        {/* Composer */}
        <form onSubmit={handleSend} className="flex flex-col gap-2 pt-2 border-t border-line">
          {attachedFile && (
            <div className="p-2.5 rounded-btn bg-warning/10 border border-warning/30 text-[13px] flex justify-between items-center">
              <span className="text-warning truncate">Attached: {attachedFile.name}</span>
              <button type="button" onClick={() => setAttachedFile(null)} className="text-accent font-medium">
                Remove
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <Input
              aria-label="Message"
              placeholder="Type a message to your teammates..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="flex-1"
            />

            <label className="cursor-pointer h-10 px-3 text-[13px] font-medium rounded-btn bg-surface-2 border border-line hover:border-line-strong text-secondary hover:text-primary transition-colors duration-fast inline-flex items-center justify-center shrink-0">
              {uploading ? "Uploading…" : "Attach"}
              <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
            </label>

            <Button type="submit" variant="primary" size="md" isLoading={busy} disabled={!text.trim() && !attachedFile}>
              Send
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
