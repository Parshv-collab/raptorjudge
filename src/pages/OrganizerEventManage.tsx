import React, { useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { humanizeConvexError } from "@/lib/errors";
import { downloadRawCsv } from "@/lib/csv";

export function OrganizerEventManage() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const { slug } = useParams<{ slug: string }>();
  const event = useQuery(api.events.getBySlug, skip || !slug ? "skip" : { slug });
  const setStage = useMutation(api.events.setStage);
  const tracks = useQuery(api.tracks.listByEvent, skip || !event ? "skip" : { eventId: event._id });
  const submissions = useQuery(api.submissions.byEvent, skip || !event ? "skip" : { eventId: event._id });
  const createTrack = useMutation(api.tracks.create);

  const submissionsCsv = useQuery(api.exports.submissionsCsv, skip || !event ? "skip" : { eventId: event._id });
  const rankingsCsv = useQuery(api.exports.rankingsCsv, skip || !event ? "skip" : { eventId: event._id });
  const scoresCsv = useQuery(api.exports.scoresCsv, skip || !event ? "skip" : { eventId: event._id });

  const rubricData = useQuery(api.judging.getRubric, skip || !event ? "skip" : { eventId: event._id });
  const customizeRubric = useMutation(api.judging.customizeRubric);
  const deleteCriterion = useMutation(api.judging.deleteCriterion);

  const voteStatusData = useQuery(api.voting.voteStatus, skip || !event ? "skip" : { eventId: event._id });
  const flaggedComments = useQuery((api.comments as any).listFlagged, skip || !event ? "skip" : { eventId: event._id });
  const deleteComment = useMutation(api.comments.deleteComment);

  const flagsData = useQuery((api.submissions as any).listFlags, skip || !event ? "skip" : { eventId: event._id });
  const dismissFlag = useMutation((api.submissions as any).dismissFlag);
  const removeFlaggedSub = useMutation((api.submissions as any).removeFlaggedSubmission);

  const webhooks = useQuery(api.webhooks.list, skip || !event ? "skip" : { eventId: event._id });
  const webhookDeliveries = useQuery(api.webhooks.deliveries, skip || !event ? "skip" : { eventId: event._id });
  const registerWebhook = useMutation(api.webhooks.register);
  const testDelivery = useMutation(api.webhooks.testDelivery);

  const [activeTab, setActiveTab] = useState("overview");
  const [busy, setBusy] = useState(false);
  const [unpublishConfirmOpen, setUnpublishConfirmOpen] = useState(false);

  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState("*");
  const [newSecretKey, setNewSecretKey] = useState<string | null>(null);

  async function handleRegisterWebhook(e: React.FormEvent) {
    e.preventDefault();
    if (!webhookUrl.trim() || !event) return;
    setBusy(true);
    try {
      const res = await registerWebhook({
        eventId: event._id,
        targetUrl: webhookUrl.trim(),
        events: webhookEvents.trim(),
      });
      setNewSecretKey(res.secretKey);
      toast.success("Webhook registered!");
      setWebhookUrl("");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleTestDelivery(webhookId: string) {
    setBusy(true);
    try {
      await testDelivery({ webhookId: webhookId as never });
      toast.success("Test event queued for delivery!");
    } catch (err: any) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDismissFlag(flagId: string) {
    setBusy(true);
    try {
      await dismissFlag({ flagId: flagId as never });
      toast.success("Flag dismissed.");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveFlaggedSub(flagId: string) {
    if (!confirm("Are you sure you want to remove/withdraw this flagged submission?")) return;
    setBusy(true);
    try {
      await removeFlaggedSub({ flagId: flagId as never });
      toast.success("Flagged submission removed.");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    setBusy(true);
    try {
      await deleteComment({ commentId: commentId as never });
      toast.success("Comment deleted.");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  // New track state
  const [newTrackName, setNewTrackName] = useState("");
  const [newTrackDesc, setNewTrackDesc] = useState("");
  const [newTrackPrize, setNewTrackPrize] = useState("");

  if (authLoading) {
    return (
      <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col gap-6">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={5} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (!event) {
    return (
      <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col gap-6">
        <GlassCard className="p-8 text-center">
          <h2 className="text-xl font-bold text-[#1d1d1f]">Event Not Found</h2>
          <p className="text-xs text-[#6e6e73] mt-2">The requested event could not be found or has been removed.</p>
        </GlassCard>
      </div>
    );
  }

  async function togglePublish() {
    if (!event) return;
    setBusy(true);
    try {
      const nextStage = event.status === "draft" ? "registration" : "draft";
      await setStage({ eventId: event._id, stage: nextStage });
      toast.success(`Event ${nextStage === "draft" ? "unpublished" : "published"}!`);
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddTrack() {
    if (!event || !newTrackName.trim()) return;
    setBusy(true);
    try {
      await createTrack({
        eventId: event._id,
        name: newTrackName.trim(),
        description: newTrackDesc.trim(),
        prizeDescription: newTrackPrize.trim(),
        prizeAmount: 0,
      });
      toast.success("Track created!");
      setNewTrackName("");
      setNewTrackDesc("");
      setNewTrackPrize("");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  const tabItems = [
    { id: "overview", label: "Overview" },
    { id: "tracks", label: "Tracks & Prizes", badge: tracks?.length },
    { id: "rubric", label: "Rubric", badge: rubricData?.criteria?.length },
    { id: "judges", label: "Judges" },
    { id: "voting", label: "Community Voting", badge: voteStatusData?.totalVotes },
    { id: "webhooks", label: "Webhooks", badge: webhooks?.length },
    { id: "comments", label: "Flagged Comments", badge: flaggedComments?.length },
    { id: "duplicates", label: "Duplicate Flags", badge: flagsData?.filter((f: any) => f.status === "flagged")?.length },
    { id: "submissions", label: "Submissions", badge: submissions?.length },
    { id: "results", label: "Results" },
    { id: "audit", label: "Audit" },
  ];

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col gap-8">
      {/* Header */}
      <GlassCard className="p-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-[#ff0055]/10 text-[#ff0055]">
              {event.status}
            </span>
            <span className="text-xs text-[#6e6e73]">/{event.slug}</span>
          </div>
          <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight">{event.title}</h1>
        </div>

        <div className="flex gap-2 shrink-0">
          <Link to={`/organizer/events/${event.slug}/edit`}>
            <Button variant="secondary" size="md">
              Edit Details
            </Button>
          </Link>

          <Button
            variant={event.status === "draft" ? "primary" : "ghost"}
            size="md"
            isLoading={busy}
            onClick={() => {
              if (event.status !== "draft") {
                setUnpublishConfirmOpen(true);
              } else {
                togglePublish();
              }
            }}
          >
            {event.status === "draft" ? "Publish Event" : "Unpublish to Draft"}
          </Button>
        </div>
      </GlassCard>

      {/* Tabs */}
      <Tabs tabs={tabItems} activeTab={activeTab} onChange={(id) => setActiveTab(id)} />

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <GlassCard className="p-6">
            <span className="text-xs font-semibold text-[#6e6e73]">Status</span>
            <p className="text-xl font-bold text-[#1d1d1f] mt-1 capitalize">{event.status}</p>
          </GlassCard>
          <GlassCard className="p-6">
            <span className="text-xs font-semibold text-[#6e6e73]">Team Size</span>
            <p className="text-xl font-bold text-[#1d1d1f] mt-1">
              {event.minTeamSize || 1} - {event.maxTeamSize || 4} Members
            </p>
          </GlassCard>
          <GlassCard className="p-6">
            <span className="text-xs font-semibold text-[#6e6e73]">Registration Deadline</span>
            <p className="text-sm font-bold text-[#1d1d1f] mt-1">
              {new Date(event.registrationEnd).toLocaleDateString()}
            </p>
          </GlassCard>
          <GlassCard className="p-6">
            <span className="text-xs font-semibold text-[#6e6e73]">Submission Deadline</span>
            <p className="text-sm font-bold text-[#1d1d1f] mt-1">
              {new Date(event.submissionDeadline).toLocaleDateString()}
            </p>
          </GlassCard>
        </div>
      )}

      {activeTab === "tracks" && (
        <div className="flex flex-col gap-6">
          <GlassCard className="p-6 flex flex-col gap-4">
            <h3 className="text-sm font-bold text-[#1d1d1f]">Add New Track</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                placeholder="Track name"
                value={newTrackName}
                onChange={(e) => setNewTrackName(e.target.value)}
              />
              <Input
                placeholder="Description"
                value={newTrackDesc}
                onChange={(e) => setNewTrackDesc(e.target.value)}
              />
              <Input
                placeholder="Prize description"
                value={newTrackPrize}
                onChange={(e) => setNewTrackPrize(e.target.value)}
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              isLoading={busy}
              disabled={!newTrackName.trim()}
              onClick={handleAddTrack}
              className="w-max"
            >
              Add Track
            </Button>
          </GlassCard>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(tracks || []).map((t: any) => (
              <GlassCard key={t._id} className="p-5">
                <h4 className="text-base font-bold text-[#1d1d1f]">{t.name}</h4>
                <p className="text-xs text-[#6e6e73] mt-1">{t.description}</p>
                {t.prizeDescription && (
                  <p className="text-xs font-bold text-[#ff0055] mt-2">
                    Prize: {t.prizeDescription}
                  </p>
                )}
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {activeTab === "rubric" && (
        <RubricTab
          eventId={event._id}
          rubricData={rubricData}
          customizeRubric={customizeRubric}
          deleteCriterion={deleteCriterion}
        />
      )}

      {activeTab === "judges" && <JudgesTab eventId={event._id} />}

      {activeTab === "voting" && (
        <GlassCard className="p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-base font-bold text-[#1d1d1f]">Live Community Voting Tallies</h3>
              <p className="text-xs text-[#6e6e73] mt-0.5">
                Mode: <span className="font-semibold text-[#1d1d1f] capitalize">{voteStatusData?.votingType || "quadratic"}</span> | Total Votes: <strong className="text-[#1d1d1f]">{voteStatusData?.totalVotes || 0}</strong>
              </p>
            </div>
            <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-amber-500/10 text-amber-700">
              Organizer Live Preview
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {(voteStatusData?.tally || []).map((t: any) => {
              const sub = (submissions || []).find((s: any) => String(s._id) === String(t.submissionId));
              return (
                <div
                  key={t.submissionId}
                  className="p-3.5 rounded-input bg-white/60 border border-white flex justify-between items-center text-xs"
                >
                  <div>
                    <Link to={`/project/${t.submissionId}`} className="font-bold text-[#1d1d1f] hover:underline">
                      {sub?.title || `Project #${t.submissionId}`}
                    </Link>
                    <p className="text-[#6e6e73]">Team: {sub?.teamName || "—"}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black text-[#ff0055]">{t.points} pts</span>
                  </div>
                </div>
              );
            })}
            {(!voteStatusData?.tally || voteStatusData.tally.length === 0) && (
              <p className="text-xs text-[#6e6e73] text-center py-6">No community votes recorded yet.</p>
            )}
          </div>
        </GlassCard>
      )}

      {activeTab === "webhooks" && (
        <div className="flex flex-col gap-6">
          <GlassCard className="p-6">
            <h3 className="text-base font-bold text-[#1d1d1f] mb-3">Register New Webhook Endpoint</h3>
            <form onSubmit={handleRegisterWebhook} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="Target Endpoint URL *"
                  placeholder="https://your-server.com/webhook"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  required
                />
                <Input
                  label="Subscribed Events (* for all)"
                  placeholder="project.submitted, results.published"
                  value={webhookEvents}
                  onChange={(e) => setWebhookEvents(e.target.value)}
                />
                <div className="flex items-end">
                  <Button variant="primary" size="md" isLoading={busy} type="submit" className="w-full">
                    Register Webhook
                  </Button>
                </div>
              </div>
            </form>

            {newSecretKey && (
              <div className="mt-4 p-4 rounded-card bg-amber-500/10 border border-amber-500/30 text-xs">
                <p className="font-bold text-amber-900">⚠️ Save this Webhook Secret Key (Shown Once):</p>
                <code className="block mt-1 p-2 rounded bg-black/5 font-mono text-[#ff0055] font-bold text-xs select-all">
                  {newSecretKey}
                </code>
              </div>
            )}
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-base font-bold text-[#1d1d1f] mb-4">Active Webhooks ({webhooks?.length || 0})</h3>
            <div className="flex flex-col gap-3">
              {(webhooks || []).map((w: any) => (
                <div key={w._id} className="p-4 rounded-input bg-white/60 border border-white flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold font-mono text-[#1d1d1f]">{w.targetUrl}</span>
                    <p className="text-[#6e6e73] mt-0.5">Events: {w.events}</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    isLoading={busy}
                    onClick={() => handleTestDelivery(w._id)}
                  >
                    Send Test Event
                  </Button>
                </div>
              ))}
              {(!webhooks || webhooks.length === 0) && (
                <p className="text-xs text-[#6e6e73] text-center py-4">No webhooks registered.</p>
              )}
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-base font-bold text-[#1d1d1f] mb-4">Recent Delivery Logs</h3>
            <div className="flex flex-col gap-2">
              {(webhookDeliveries || []).map((d: any) => (
                <div key={d._id} className="p-3.5 rounded-input bg-white/60 border border-white flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-[#1d1d1f]">{d.eventType}</span>
                    <span className="text-[#6e6e73] ml-2 font-mono">→ {d.targetUrl}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${
                      d.success ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"
                    }`}>
                      {d.statusCode ? `HTTP ${d.statusCode}` : "Failed"}
                    </span>
                    <span className="text-[10px] text-[#6e6e73]">
                      {new Date(d.deliveredAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
              {(!webhookDeliveries || webhookDeliveries.length === 0) && (
                <p className="text-xs text-[#6e6e73] text-center py-4">No delivery history yet.</p>
              )}
            </div>
          </GlassCard>
        </div>
      )}

      {activeTab === "comments" && (
        <GlassCard className="p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-base font-bold text-[#1d1d1f]">Flagged Comments for Moderation</h3>
              <p className="text-xs text-[#6e6e73] mt-0.5">
                Review user-reported comments across all submissions in this event.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {(flaggedComments || []).map((c: any) => (
              <div
                key={c.id}
                className="p-4 rounded-input bg-white/60 border border-white flex flex-col gap-2 text-xs"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-bold text-[#1d1d1f]">{c.authorName}</span>
                    <span className="text-[#6e6e73] ml-2">
                      on project{" "}
                      <Link to={`/project/${c.submissionId}`} className="font-semibold text-[#ff0055] hover:underline">
                        {c.submissionTitle}
                      </Link>
                    </span>
                  </div>
                  <span className="text-[10px] text-[#6e6e73]">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-[#1d1d1f] leading-relaxed bg-amber-500/5 p-2 rounded border border-amber-500/20">
                  {c.body || c.content}
                </p>
                <div className="flex justify-end pt-1">
                  <Button
                    variant="danger"
                    size="sm"
                    isLoading={busy}
                    onClick={() => handleDeleteComment(c.id)}
                  >
                    Delete Comment
                  </Button>
                </div>
              </div>
            ))}
            {(!flaggedComments || flaggedComments.length === 0) && (
              <p className="text-xs text-[#6e6e73] text-center py-6">No flagged comments to moderate.</p>
            )}
          </div>
        </GlassCard>
      )}

      {activeTab === "duplicates" && (
        <GlassCard className="p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-base font-bold text-[#1d1d1f]">Flagged Duplicate Submissions</h3>
              <p className="text-xs text-[#6e6e73] mt-0.5">
                Review automated flags for projects with matching titles or repository URLs.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {(flagsData || []).map((f: any) => (
              <div
                key={f.id}
                className="p-4 rounded-input bg-white/60 border border-white flex flex-col gap-2 text-xs"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <Link to={`/project/${f.submissionId}`} className="font-bold text-[#ff0055] hover:underline">
                      {f.submissionTitle}
                    </Link>
                    <span className="text-[#6e6e73] ml-2">Team: {f.teamName}</span>
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${
                    f.status === "flagged" ? "bg-amber-500/10 text-amber-700" : "bg-gray-200 text-gray-700"
                  }`}>
                    {f.status}
                  </span>
                </div>

                <p className="text-[#1d1d1f] font-mono bg-amber-500/10 p-2 rounded border border-amber-500/20 text-[11px]">
                  ⚠️ {f.reason}
                </p>

                {f.status === "flagged" && (
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      isLoading={busy}
                      onClick={() => handleDismissFlag(f.id)}
                    >
                      Dismiss Flag
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      isLoading={busy}
                      onClick={() => handleRemoveFlaggedSub(f.id)}
                    >
                      Remove Submission
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {(!flagsData || flagsData.length === 0) && (
              <p className="text-xs text-[#6e6e73] text-center py-6">No duplicate flags recorded.</p>
            )}
          </div>
        </GlassCard>
      )}

      {activeTab === "submissions" && (
        <GlassCard className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-bold text-[#1d1d1f]">Submissions List</h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (!submissionsCsv) {
                  toast.error("No data to export yet");
                  return;
                }
                downloadRawCsv(`${event.slug}-submissions.csv`, submissionsCsv);
              }}
            >
              Export Submissions CSV
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {(submissions || []).map((s: any) => (
              <div
                key={s._id}
                className="p-3.5 rounded-input bg-white/60 border border-white flex justify-between items-center text-xs"
              >
                <div>
                  <Link to={`/project/${s._id}`} className="font-bold text-[#1d1d1f] hover:underline">
                    {s.title}
                  </Link>
                  <p className="text-[#6e6e73]">Team: {s.teamName}</p>
                </div>
                <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full bg-emerald-500/10 text-emerald-600">
                  {s.status}
                </span>
              </div>
            ))}
            {(!submissions || submissions.length === 0) && (
              <p className="text-xs text-[#6e6e73] text-center py-6">No submissions recorded.</p>
            )}
          </div>
        </GlassCard>
      )}

      {activeTab === "results" && (
        <GlassCard className="p-6 text-center flex flex-col items-center gap-4">
          <div>
            <h3 className="text-base font-bold text-[#1d1d1f] mb-2">Results & Rankings</h3>
            <p className="text-xs text-[#6e6e73] max-w-md mx-auto leading-relaxed">
              Final judging rankings and score normalization models are calculated after the judging phase closes.
            </p>
          </div>
          <div className="flex gap-3 mt-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (!rankingsCsv) {
                  toast.error("No data to export yet");
                  return;
                }
                downloadRawCsv(`${event.slug}-rankings.csv`, rankingsCsv);
              }}
            >
              Export Rankings CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (!scoresCsv) {
                  toast.error("No data to export yet");
                  return;
                }
                downloadRawCsv(`${event.slug}-scores.csv`, scoresCsv);
              }}
            >
              Export Scores CSV
            </Button>
          </div>
        </GlassCard>
      )}

      {activeTab === "audit" && (
        <GlassCard className="p-6 text-center text-xs text-[#6e6e73]">
          Audit records view for {event.title} is available in Admin panel.
        </GlassCard>
      )}

      <ConfirmDialog
        isOpen={unpublishConfirmOpen}
        onClose={() => setUnpublishConfirmOpen(false)}
        onConfirm={togglePublish}
        title="Unpublish Event"
        description="Unpublishing this event will return it to draft status and hide public registration. Are you sure?"
        confirmLabel="Unpublish Event"
        destructive
        isLoading={busy}
      />
    </div>
  );
}

function RubricTab({
  eventId,
  rubricData,
  customizeRubric,
  deleteCriterion,
}: {
  eventId: any;
  rubricData: any;
  customizeRubric: any;
  deleteCriterion: any;
}) {
  const upsertCriterion = useMutation(api.judging.upsertCriterion);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editCriterion, setEditCriterion] = useState<any>(null);

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [weight, setWeight] = useState(0.25);
  const [minScore, setMinScore] = useState(1);
  const [maxScore, setMaxScore] = useState(10);
  const [sortOrder, setSortOrder] = useState(10);

  const criteria = rubricData?.criteria || [];
  const isDefault = rubricData?.isDefault;
  const locked = rubricData?.locked;

  const totalWeight = criteria.reduce((acc: number, c: any) => acc + (c.weight || 0), 0);
  const isWeightValid = Math.abs(totalWeight - 1.0) <= 0.001;

  async function handleCustomize() {
    setBusy(true);
    try {
      await customizeRubric({ eventId });
      toast.success("Rubric customized!");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  function handleOpenModal(c?: any) {
    if (c) {
      setEditCriterion(c);
      setName(c.name);
      setDescription(c.description || "");
      setWeight(c.weight);
      setMinScore(c.minScore);
      setMaxScore(c.maxScore);
      setSortOrder(c.sortOrder || 10);
    } else {
      setEditCriterion(null);
      setName("");
      setDescription("");
      setWeight(0.25);
      setMinScore(1);
      setMaxScore(10);
      setSortOrder((criteria.length + 1) * 10);
    }
    setModalOpen(true);
  }

  async function handleSaveCriterion(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (minScore >= maxScore) {
      toast.error("Min score must be less than Max score.");
      return;
    }
    setBusy(true);
    try {
      if (isDefault) {
        await customizeRubric({ eventId });
      }
      await upsertCriterion({
        eventId,
        criterionId: editCriterion?._id || editCriterion?.id,
        name: name.trim(),
        description: description.trim(),
        weight: Number(weight),
        minScore: Number(minScore),
        maxScore: Number(maxScore),
      });
      toast.success(editCriterion ? "Criterion updated!" : "Criterion added!");
      setModalOpen(false);
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(criterionId: string) {
    if (!confirm("Are you sure you want to delete this criterion?")) return;
    setBusy(true);
    try {
      await deleteCriterion({ eventId, criterionId: criterionId as never });
      toast.success("Criterion deleted!");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Banner if Default */}
      {isDefault && (
        <div className="p-4 rounded-card bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs text-amber-900 font-medium">
          <div>
            <span className="font-bold">⚠️ You&apos;re using the Default Rubric.</span>
            <p className="mt-0.5 text-amber-800">
              Judges can score, but you may want to customize the criteria to fit your event.
            </p>
          </div>
          <Button variant="primary" size="sm" isLoading={busy} onClick={handleCustomize}>
            Customize Rubric
          </Button>
        </div>
      )}

      {/* Rubric Header Controls */}
      <GlassCard className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-[#1d1d1f]">Rubric Criteria</h3>
            {locked && (
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-red-500/10 text-red-600">
                Locked
              </span>
            )}
            {isDefault && (
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-amber-500/10 text-amber-700">
                Default
              </span>
            )}
          </div>
          <p className="text-xs text-[#6e6e73] mt-1">
            Total Weight:{" "}
            <span className={`font-bold ${isWeightValid ? "text-emerald-600" : "text-red-600"}`}>
              {totalWeight.toFixed(2)} / 1.00
            </span>{" "}
            {!isWeightValid && "(Weights should sum to 1.00)"}
          </p>
        </div>

        {!locked && (
          <Button variant="secondary" size="sm" onClick={() => handleOpenModal()}>
            + Add Criterion
          </Button>
        )}
      </GlassCard>

      {/* Criteria Table */}
      <GlassCard className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-black/10 font-bold uppercase text-[#6e6e73]">
                <th className="py-2.5 px-3">Name</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3">Weight</th>
                <th className="py-2.5 px-3">Score Range</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((c: any) => (
                <tr key={c.id || c._id} className="border-b border-black/5 hover:bg-white/40">
                  <td className="py-3 px-3 font-bold text-[#1d1d1f]">{c.name}</td>
                  <td className="py-3 px-3 text-[#6e6e73] max-w-xs">{c.description}</td>
                  <td className="py-3 px-3 font-mono font-bold text-[#ff0055]">
                    {(c.weight * 100).toFixed(0)}%
                  </td>
                  <td className="py-3 px-3 font-mono text-[#6e6e73]">
                    {c.minScore} - {c.maxScore}
                  </td>
                  <td className="py-3 px-3 text-right flex gap-1 justify-end">
                    {!locked && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => handleOpenModal(c)}>
                          Edit
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => handleDelete(c._id || c.id)}>
                          Delete
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Organizer Live Preview */}
      <GlassCard className="p-6">
        <h3 className="text-sm font-bold text-[#1d1d1f] mb-3">Organizer Live Preview (Judge View)</h3>
        <div className="p-4 rounded-card bg-white/60 border border-white flex flex-col gap-4">
          {criteria.map((c: any) => (
            <div key={c.id || c._id} className="flex flex-col gap-1 text-xs">
              <div className="flex justify-between font-bold text-[#1d1d1f]">
                <span>{c.name} ({Math.round(c.weight * 100)}%)</span>
                <span>{c.minScore} - {c.maxScore}</span>
              </div>
              <p className="text-[11px] text-[#6e6e73]">{c.description}</p>
              <input type="range" disabled min={c.minScore} max={c.maxScore} className="w-full accent-[#ff0055]" />
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Add / Edit Criterion Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editCriterion ? "Edit Criterion" : "Add Criterion"}
      >
        <form onSubmit={handleSaveCriterion} className="flex flex-col gap-4 mt-2">
          <Input
            label="Name *"
            required
            placeholder="e.g. Innovation"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Description"
            placeholder="e.g. Originality and novelty"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Weight (0.0-1.0)"
              type="number"
              step="0.05"
              min="0"
              max="1"
              required
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
            />
            <Input
              label="Min Score"
              type="number"
              required
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
            />
            <Input
              label="Max Score"
              type="number"
              required
              value={maxScore}
              onChange={(e) => setMaxScore(Number(e.target.value))}
            />
          </div>

          <div className="flex justify-between items-center mt-4">
            <Button variant="ghost" size="md" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" isLoading={busy} type="submit">
              Save Criterion
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function JudgesTab({ eventId }: { eventId: any }) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const progress = useQuery(api.judging.progress, skip || !eventId ? "skip" : { eventId });
  const submissions = useQuery(api.submissions.byEvent, skip || !eventId ? "skip" : { eventId });
  const users = useQuery(api.users.list, skip ? "skip" : {});
  const runAssignment = useMutation(api.judging.runAssignment);
  const assignProjects = useMutation(api.judging.assignProjects);

  const [busy, setBusy] = useState(false);
  const [k, setK] = useState(3);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedJudgeId, setSelectedJudgeId] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  const judgesList = (users || []).filter((u: any) => u.role === "judge");

  async function handleAlgorithmicAssign() {
    setBusy(true);
    try {
      const res = await runAssignment({ eventId, minJudgesPerSubmission: k });
      toast.success(`Assigned ${res.totalAssignments} projects fairly across judges (k=${k})!`);
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleManualAssign() {
    if (!selectedJudgeId || selectedProjectIds.length === 0) return;
    setBusy(true);
    try {
      const res = await assignProjects({
        eventId,
        judgeId: selectedJudgeId as never,
        submissionIds: selectedProjectIds as never,
      });
      toast.success(`Assigned ${res.count} projects to judge!`);
      setAssignModalOpen(false);
      setSelectedProjectIds([]);
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <GlassCard className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-base font-bold text-[#1d1d1f]">Judge Project Assignments</h3>
          <p className="text-xs text-[#6e6e73] mt-0.5">
            Manage judge invitations and distribute submitted projects fairly.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={() => setInviteModalOpen(true)}>
            Invite Judge
          </Button>

          <Button variant="secondary" size="sm" onClick={() => setAssignModalOpen(true)}>
            Manual Assign
          </Button>

          <div className="flex items-center gap-1 text-xs font-semibold ml-2">
            <span>k =</span>
            <input
              type="number"
              min={1}
              max={6}
              value={k}
              onChange={(e) => setK(Number(e.target.value))}
              className="w-10 px-1 py-1 text-center rounded-input bg-white/60 border border-white text-xs"
            />
          </div>

          <Button variant="primary" size="sm" isLoading={busy} onClick={handleAlgorithmicAssign}>
            Distribute Fairly
          </Button>
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h3 className="text-sm font-bold text-[#1d1d1f] mb-4">Judge Workload & Progress</h3>

        <div className="flex flex-col gap-3">
          {(progress?.perJudge || []).map((judge: any) => (
            <div
              key={judge.judgeId}
              className="p-3.5 rounded-input bg-white/60 border border-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs"
            >
              <div>
                <span className="font-bold text-[#1d1d1f]">{judge.name}</span>
                <span className="text-[#6e6e73] ml-2 font-mono">
                  ({judge.completed} of {judge.total} projects scored)
                </span>
              </div>

              <div className="w-full sm:w-48">
                <ProgressBar value={judge.completed} max={judge.total || 1} size="sm" />
              </div>
            </div>
          ))}

          {(!progress?.perJudge || progress.perJudge.length === 0) && (
            <p className="text-xs text-[#6e6e73] text-center py-6">
              No judge assignments created yet. Click &quot;Distribute Fairly&quot; or &quot;Manual Assign&quot; to assign projects to judges.
            </p>
          )}
        </div>
      </GlassCard>

      {/* Manual Assignment Modal */}
      <Modal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title="Manual Project Assignment"
        description="Select a judge and choose projects to assign directly."
      >
        <div className="flex flex-col gap-4 mt-2">
          <Dropdown
            label="Select Judge"
            options={[
              { value: "", label: "Choose a judge..." },
              ...judgesList.map((j: any) => ({ value: j._id, label: `${j.name} (${j.email})` })),
            ]}
            value={selectedJudgeId}
            onChange={(v) => setSelectedJudgeId(v)}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#1d1d1f]">Select Submissions to Assign</label>
            <div className="max-h-48 overflow-y-auto flex flex-col gap-2 p-2 rounded-input bg-white/50 border border-white">
              {(submissions || []).map((sub: any) => {
                const isSelected = selectedProjectIds.includes(sub._id);
                return (
                  <div
                    key={sub._id}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedProjectIds(selectedProjectIds.filter((id) => id !== sub._id));
                      } else {
                        setSelectedProjectIds([...selectedProjectIds, sub._id]);
                      }
                    }}
                    className={`p-2 rounded cursor-pointer text-xs flex justify-between items-center ${
                      isSelected ? "bg-[#ff0055]/10 font-bold text-[#ff0055]" : "hover:bg-white/60 text-[#1d1d1f]"
                    }`}
                  >
                    <span>{sub.title}</span>
                    <span>{isSelected ? "✓ Selected" : "+ Select"}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-between items-center mt-4">
            <Button variant="ghost" size="md" onClick={() => setAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              isLoading={busy}
              disabled={!selectedJudgeId || selectedProjectIds.length === 0}
              onClick={handleManualAssign}
            >
              Assign {selectedProjectIds.length} Projects
            </Button>
          </div>
        </div>
      </Modal>

      {/* Invite Judge Modal */}
      <Modal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Invite Judge"
        description="Share this registration link with judges to give them scoring access."
      >
        <div className="flex flex-col gap-4 mt-2">
          <Input
            label="Judge Invitation Link"
            value={`${window.location.origin}/auth?role=judge`}
            readOnly
          />
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/auth?role=judge`);
              toast.success("Judge invite link copied!");
              setInviteModalOpen(false);
            }}
          >
            Copy Invite Link
          </Button>
        </div>
      </Modal>
    </div>
  );
}
