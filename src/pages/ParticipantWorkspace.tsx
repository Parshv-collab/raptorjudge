import React, { useState, useEffect } from "react";
import { useSearchParams, Link, Navigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { Dropdown } from "@/components/ui/Dropdown";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/Modal";
import { humanizeConvexError } from "@/lib/errors";
import { usePrimaryEventSlug } from "@/lib/featuredEvent";

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

  // ConfirmDialog States
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
  }, [data?.submission?._id]);

  const me = useQuery(api.users.me, skip ? "skip" : {});
  const team = myTeam?.[0];
  const submission = data?.submission;
  const now = Date.now();
  const deadlinePassed = event ? now > event.submissionDeadline : false;
  const isLocked = submission?.status === "submitted" || deadlinePassed;

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
      toast.success("Draft saved successfully!");
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
      toast.success("Registered as solo participant!");
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
      toast.success("Submission sent for judging!");
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
      toast.success("Submission withdrawn to draft status.");
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
      toast.success(`Team created! Invite code: ${res.inviteCode}`);
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
      toast.success(`Joined team ${res.teamName}!`);
      setInviteCodeInput("");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-6">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (myTeam === undefined || event === undefined) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-6">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-8">
      {/* Workspace Header */}
      <GlassCard className="p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
            Participant Workspace
          </span>
          <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-1">
            {event?.title || "Workspace"}
          </h1>
        </div>

        {event && (
          <div className="p-3.5 rounded-input bg-white/60 border border-white shadow-sm flex flex-col gap-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6e6e73]">
              Submission Deadline
            </span>
            <span className="text-xs font-bold text-[#1d1d1f]">
              {new Date(event.submissionDeadline).toLocaleString()}
            </span>
          </div>
        )}
      </GlassCard>

      {/* Deadline Passed Banner */}
      {deadlinePassed && (
        <Alert variant="warning" title="Submission Deadline Passed">
          The submission window for this event has closed. Form fields are read-only.
        </Alert>
      )}

      {/* Team Management Section */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-bold text-[#1d1d1f] mb-4">Team</h2>

        {!team ? (
          <div className={`grid grid-cols-1 ${event?.soloAllowed !== false ? "md:grid-cols-3" : "md:grid-cols-2"} gap-6`}>
            {/* Create Team */}
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-bold text-[#1d1d1f]">Create a New Team</h3>
              <p className="text-xs text-[#6e6e73]">
                Start a team as leader and invite members with an invite code.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Team name"
                  value={teamNameInput}
                  onChange={(e) => setTeamNameInput(e.target.value)}
                />
                <Button
                  variant="primary"
                  size="md"
                  isLoading={busy}
                  disabled={!teamNameInput.trim()}
                  onClick={handleCreateTeam}
                >
                  Create
                </Button>
              </div>
            </div>

            {/* Join Team */}
            <div className="flex flex-col gap-3 md:border-l border-black/5 md:pl-6">
              <h3 className="text-sm font-bold text-[#1d1d1f]">Join with Invite Code</h3>
              <p className="text-xs text-[#6e6e73]">
                Enter an existing team invite code from a teammate.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Invite code"
                  value={inviteCodeInput}
                  onChange={(e) => setInviteCodeInput(e.target.value)}
                />
                <Button
                  variant="secondary"
                  size="md"
                  isLoading={busy}
                  disabled={!inviteCodeInput.trim()}
                  onClick={handleJoinTeam}
                >
                  Join
                </Button>
              </div>
            </div>

            {/* Go Solo option if soloAllowed !== false */}
            {event?.soloAllowed !== false && (
              <div className="flex flex-col gap-3 md:border-l border-black/5 md:pl-6">
                <h3 className="text-sm font-bold text-[#1d1d1f]">Go Solo</h3>
                <p className="text-xs text-[#6e6e73]">
                  Participate individually without a team. You can still seek teammates later.
                </p>
                <Button
                  variant="secondary"
                  size="md"
                  isLoading={busy}
                  onClick={handleGoSolo}
                >
                  Go Solo
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-input bg-white/60 border border-white">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#ff0055]">
                  Your Team
                </span>
                <h3 className="text-xl font-black text-[#1d1d1f]">{team.name}</h3>
              </div>

              <div className="flex items-center gap-2">
                <div className="px-3 py-1.5 rounded-button bg-white border border-white/80 font-mono text-xs font-bold text-[#1d1d1f] shadow-sm">
                  Code: {team.inviteCode}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(team.inviteCode);
                    toast.success("Invite code copied!");
                  }}
                >
                  Copy
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmLeaveOpen(true)}
                >
                  Leave
                </Button>
              </div>
            </div>

            {/* Member List */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-[#1d1d1f]">Team Members</span>
                {team.members.length === 1 && event?.soloAllowed !== false && (
                  <label className="flex items-center gap-2 text-xs font-medium text-[#1d1d1f] cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-[#ff0055] focus:ring-[#ff0055]"
                      checked={!!participantState?.lookingForTeam}
                      onChange={async (e) => {
                        if (!event) return;
                        try {
                          await toggleLookingForTeam({
                            eventId: event._id,
                            lookingForTeam: e.target.checked,
                          });
                          toast.success(
                            e.target.checked
                              ? "Looking for a teammate enabled!"
                              : "Looking for a teammate disabled."
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
                    className="p-3 rounded-input bg-white/40 border border-white/70 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar name={member.name} size="sm" />
                      <div>
                        <p className="text-xs font-bold text-[#1d1d1f]">{member.name}</p>
                        <p className="text-[10px] text-[#6e6e73] capitalize">
                          {member.memberRole}
                        </p>
                      </div>
                    </div>

                    {member.memberRole !== "leader" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[10px]"
                        onClick={() => setTransferTarget(member)}
                      >
                        Make Leader
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Team Chat & File Sharing (Private to Team Members) */}
      {team && (
        <TeamChatSection teamId={team._id} />
      )}

      {/* Submission Draft / Form Section */}
      {team && (
        <GlassCard className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-[#1d1d1f]">Project Submission</h2>
            {submission?.status === "submitted" && (
              <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full bg-emerald-500/10 text-emerald-600">
                Submitted ✓
              </span>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Project Title"
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

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#1d1d1f]">
                Description (Markdown Supported) *
              </label>
              <textarea
                disabled={isLocked}
                rows={6}
                value={draft.description}
                onChange={(e) => {
                  setDraft({ ...draft, description: e.target.value });
                  setDirty(true);
                }}
                className="w-full p-3.5 text-xs rounded-input text-[#1d1d1f] bg-white/50 border border-white/80 backdrop-blur-md shadow-sm focus-ring-accent disabled:opacity-50"
                placeholder="Describe what you built, how it works, and technologies used..."
              />
            </div>

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
                label="Video Demo URL"
                disabled={isLocked}
                value={draft.videoUrl}
                onChange={(e) => {
                  setDraft({ ...draft, videoUrl: e.target.value });
                  setDirty(true);
                }}
                placeholder="https://youtube.com/..."
              />

              <Input
                label="Live Demo URL"
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
              label="Tags (Comma-separated)"
              disabled={isLocked}
              value={draft.tags}
              onChange={(e) => {
                setDraft({ ...draft, tags: e.target.value });
                setDirty(true);
              }}
              placeholder="ai, web3, devtools"
            />

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-black/5">
              <Button
                variant="secondary"
                size="md"
                isLoading={busy}
                disabled={isLocked || !dirty}
                onClick={handleSaveDraft}
              >
                {dirty ? "Save Draft" : "Saved ✓"}
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
                    Submit for Judging
                  </Button>
                ) : (
                  <span className="text-xs font-semibold text-[#6e6e73] bg-black/5 px-3 py-2 rounded-input">
                    Only the team leader can submit this project.
                  </span>
                )
              ) : (
                !deadlinePassed && isLeader && (
                  <Button variant="danger" size="md" isLoading={busy} onClick={handleWithdraw}>
                    Withdraw to Edit
                  </Button>
                )
              )}
            </div>
          </div>
        </GlassCard>
      )}

      {/* Confirm Dialogs */}
      <ConfirmDialog
        isOpen={confirmSubmitOpen}
        onClose={() => setConfirmSubmitOpen(false)}
        onConfirm={handleSubmitForJudging}
        title="Confirm Project Submission"
        description="Submitting locks editing. You can withdraw before the deadline if allowed. Are you ready to submit?"
        confirmLabel="Submit Project"
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
        title="Leave Team"
        description="Are you sure you want to leave this team? You will need an invite code to rejoin."
        confirmLabel="Leave Team"
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
        title="Transfer Leadership"
        description={`Are you sure you want to transfer team leadership to ${transferTarget?.name}?`}
        confirmLabel="Transfer Leadership"
        isLoading={busy}
      />

      {/* Certificates Section */}
      {certs && certs.length > 0 && (
        <GlassCard className="p-6">
          <h2 className="text-lg font-bold text-[#1d1d1f] mb-4">Your Certificates</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {certs.map((c: any) => (
              <div
                key={c._id}
                className="p-4 rounded-input bg-white/60 border border-white flex justify-between items-center"
              >
                <div>
                  <h4 className="text-xs font-bold text-[#1d1d1f]">{c.title}</h4>
                  <p className="text-[10px] text-[#6e6e73]">
                    UUID: {c.certUuid.substring(0, 10)}...
                  </p>
                </div>
                <Link to={`/verify/${c.certUuid}?signature=${c.signatureHash}`}>
                  <Button variant="secondary" size="sm">
                    Verify
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </GlassCard>
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
export function TeamChatSection({ teamId, className = "" }: { teamId: any; className?: string }) {
  const messages = useQuery((api as any).teamChat.listMessages, { teamId });
  const sendMessage = useMutation((api as any).teamChat.sendMessage);
  const generateUploadUrl = useMutation((api as any).teamChat.generateUploadUrl);

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
      // The mutation is membership-gated, so it must be scoped to this team.
      const uploadUrl = await generateUploadUrl({ teamId });
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      const { storageId } = await res.json();
      setAttachedFile({ storageId, name: file.name, type: file.type });
      toast.success("File attached to message!");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <GlassCard className={`p-6 ${className}`}>
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <div>
          <h2 className="text-lg font-bold text-[#1d1d1f]">Team Member Chat & File Sharing</h2>
          <p className="text-xs text-[#6e6e73]">
            Private team workspace discussion and shared attachments (visible only to team members).
          </p>
        </div>
        <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full bg-[#ff0055]/10 text-[#ff0055]">
          Private Team Room
        </span>
      </div>

      {/* Message Stream */}
      <div className="max-h-80 overflow-y-auto flex flex-col gap-3 p-3 rounded-input bg-white/40 border border-white/80 mb-4">
        {(messages || []).map((msg: any) => (
          <div
            key={msg.id}
            className="p-3 rounded-card bg-white/70 border border-white shadow-sm flex flex-col gap-1 text-xs"
          >
            <div className="flex justify-between items-center">
              <span className="font-bold text-[#1d1d1f]">{msg.authorName}</span>
              <span className="text-[10px] text-[#6e6e73]">
                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {msg.content && (
              <p className="text-[#1d1d1f] leading-relaxed whitespace-pre-line">{msg.content}</p>
            )}

            {msg.fileUrl && (
              <div className="mt-1 pt-2 border-t border-black/5 flex items-center gap-2">
                <span className="text-sm">📎</span>
                <a
                  href={msg.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[#ff0055] hover:underline text-xs truncate max-w-xs"
                >
                  {msg.fileName || "Download Attachment"}
                </a>
              </div>
            )}
          </div>
        ))}

        {(!messages || messages.length === 0) && (
          <p className="text-xs text-[#6e6e73] text-center py-8">
            No team messages yet. Start the conversation with your team!
          </p>
        )}
      </div>

      {/* Composer Input */}
      <form onSubmit={handleSend} className="flex flex-col gap-2">
        {attachedFile && (
          <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-xs flex justify-between items-center">
            <span className="font-semibold text-amber-900 truncate">📎 Attached: {attachedFile.name}</span>
            <button
              type="button"
              onClick={() => setAttachedFile(null)}
              className="text-[#ff0055] font-bold text-xs"
            >
              Remove
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            placeholder="Type a message to your teammates..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1"
          />

          <label className="cursor-pointer px-3 py-2 text-xs font-semibold rounded-button bg-white/60 border border-white/80 hover:bg-white/90 transition-colors shrink-0 flex items-center justify-center">
            {uploading ? "Uploading..." : "📎 Share File"}
            <input
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
            />
          </label>

          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={busy}
            disabled={!text.trim() && !attachedFile}
          >
            Send
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}
