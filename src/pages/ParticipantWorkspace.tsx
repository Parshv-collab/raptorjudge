import React, { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";

export default function ParticipantWorkspace() {
  const [searchParams] = useSearchParams();
  const eventSlug = searchParams.get("event") ?? "dogfood-2026";

  const event = useQuery(api.events.getBySlug, { slug: eventSlug });
  const tracks = useQuery(api.tracks.listByEvent, event ? { eventId: event._id } : "skip");
  const myTeam = useQuery(api.teams.myTeams, event ? { eventId: event._id } : "skip");
  const data = useQuery(api.submissions.mySubmission, event ? { eventId: event._id } : "skip");
  const certs = useQuery(api.certificates.mine, {});

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

  const team = myTeam?.[0];
  const submission = data?.submission;
  const now = Date.now();
  const deadlinePassed = event ? now > event.submissionDeadline : false;
  const isLocked = submission?.status === "submitted" || deadlinePassed;

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
      toast.error(e.message || "Failed to save draft");
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
      toast.error(e.message || "Failed to submit project");
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
      toast.error(e.message || "Failed to withdraw submission");
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
      toast.error(e.message || "Could not create team");
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
      toast.error(e.message || "Could not join team");
    } finally {
      setBusy(false);
    }
  }

  if (myTeam === undefined || event === undefined) {
    return (
      <div className="py-20 text-center animate-pulse text-xs text-[#6e6e73]">
        Loading workspace...
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                  onClick={async () => {
                    try {
                      await leaveTeam({ teamId: team._id });
                      toast.success("Left team");
                    } catch (e: any) {
                      toast.error(e.message);
                    }
                  }}
                >
                  Leave
                </Button>
              </div>
            </div>

            {/* Member List */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-[#1d1d1f]">Team Members</span>
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
                        onClick={async () => {
                          try {
                            await transferLeadership({
                              teamId: team._id,
                              newLeaderId: member.userId,
                            });
                            toast.success(`Transferred leadership to ${member.name}`);
                          } catch (e: any) {
                            toast.error(e.message);
                          }
                        }}
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
                <Button
                  variant="primary"
                  size="md"
                  isLoading={busy}
                  disabled={isLocked || !draft.title.trim() || !draft.description.trim()}
                  onClick={handleSubmitForJudging}
                >
                  Submit for Judging
                </Button>
              ) : (
                !deadlinePassed && (
                  <Button variant="danger" size="md" isLoading={busy} onClick={handleWithdraw}>
                    Withdraw to Edit
                  </Button>
                )
              )}
            </div>
          </div>
        </GlassCard>
      )}

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
