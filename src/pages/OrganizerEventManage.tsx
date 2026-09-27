import React, { useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/Modal";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { humanizeConvexError } from "@/lib/errors";
import { downloadRawCsv } from "@/lib/csv";
import { RubricTab } from "@/pages/organizer/RubricTab";
import { JudgesTab } from "@/pages/organizer/JudgesTab";
import { WinnerOverridePanel } from "@/pages/organizer/WinnerOverridePanel";
import { Markdown } from "@/components/ui/Markdown";
import { ShieldCheck, ShieldAlert, Trophy } from "lucide-react";

export function OrganizerEventManage() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { slug } = useParams<{ slug: string }>();

  // Resolve the role first and gate every data query on it. Most queries here
  // are organizer-only server-side, so firing them as a participant would throw
  // instead of rendering a clean "access required" state.
  const me = useQuery(api.users.me, authLoading || !isAuthenticated ? "skip" : {});
  const isOrganizer = me?.role === "organizer" || me?.role === "admin";
  const authPending = authLoading || (isAuthenticated && me === undefined);
  const skip = !isAuthenticated || !isOrganizer;

  const event = useQuery(api.events.getBySlug, skip || !slug ? "skip" : { slug });
  const setStage = useMutation(api.events.setStage);
  const tracks = useQuery(api.tracks.listByEvent, skip || !event ? "skip" : { eventId: event._id });
  const submissions = useQuery(api.submissions.byEvent, skip || !event ? "skip" : { eventId: event._id });
  const createTrack = useMutation(api.tracks.create);

  const submissionsCsv = useQuery(api.exports.submissionsCsv, skip || !event ? "skip" : { eventId: event._id });
  const rankingsCsv = useQuery(api.exports.rankingsCsv, skip || !event ? "skip" : { eventId: event._id });
  const scoresCsv = useQuery(api.exports.scoresCsv, skip || !event ? "skip" : { eventId: event._id });
  const assignmentsCsv = useQuery(api.exports.assignmentsCsv, skip || !event ? "skip" : { eventId: event._id });
  const eventJson = useQuery(api.exports.eventJson, skip || !event ? "skip" : { eventId: event._id });
  const certificates = useQuery(api.certificates.listByEvent, skip || !event ? "skip" : { eventId: event._id });

  const rubricData = useQuery(api.judging.getRubric, skip || !event ? "skip" : { eventId: event._id });
  const customizeRubric = useMutation(api.judging.customizeRubric);
  const deleteCriterion = useMutation(api.judging.deleteCriterion);

  const voteStatusData = useQuery(api.voting.voteStatus, skip || !event ? "skip" : { eventId: event._id });
  const flaggedComments = useQuery((api.comments as any).listFlagged, skip || !event ? "skip" : { eventId: event._id });
  const deleteComment = useMutation(api.comments.deleteComment);
  const unflagComment = useMutation(api.comments.unflag);
  const updateTrack = useMutation(api.tracks.update);
  const setWebhookActive = useMutation(api.webhooks.setActive);

  const flagsData = useQuery((api.submissions as any).listFlags, skip || !event ? "skip" : { eventId: event._id });
  const dismissFlag = useMutation((api.submissions as any).dismissFlag);
  const removeFlaggedSub = useMutation((api.submissions as any).removeFlaggedSubmission);
  const checkDuplicates = useMutation((api.submissions as any).checkDuplicates);

  // Normalization + Bradley-Terry + audit chain (results view).
  const normalization = useQuery(
    api.normalization.analyze,
    skip || !event ? "skip" : { eventId: event._id },
  );
  const pairwiseBoard = useQuery(
    api.pairwise.leaderboard,
    skip || !event ? "skip" : { eventId: event._id },
  );
  const auditLogs = useQuery(
    api.audit.list,
    skip || !event ? "skip" : { eventId: event._id, limit: 30 },
  );
  const chain = useQuery(api.audit.verifyChain, skip ? "skip" : {});

  const webhooks = useQuery(api.webhooks.list, skip || !event ? "skip" : { eventId: event._id });
  const webhookDeliveries = useQuery(api.webhooks.deliveries, skip || !event ? "skip" : { eventId: event._id });
  const registerWebhook = useMutation(api.webhooks.register);
  const testDelivery = useMutation(api.webhooks.testDelivery);

  const [activeTab, setActiveTab] = useState("overview");
  const [busy, setBusy] = useState(false);
  const [unpublishConfirmOpen, setUnpublishConfirmOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState("*");
  const [renamingTrackId, setRenamingTrackId] = useState<string | null>(null);
  const [trackNameDraft, setTrackNameDraft] = useState("");
  const [newSecretKey, setNewSecretKey] = useState<string | null>(null);
  const [newTrackName, setNewTrackName] = useState("");
  const [newTrackDesc, setNewTrackDesc] = useState("");
  const [newTrackPrize, setNewTrackPrize] = useState("");

  if (authPending) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={5} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (!isOrganizer) {
    return (
      <EmptyState
        title="Organizer access required"
        description="This event management screen is limited to the event's organizers and platform admins."
        actionLabel="Go to my dashboard"
        onAction={() => {
          window.location.href = "/home";
        }}
      />
    );
  }

  if (!event) {
    return (
      <EmptyState
        title="Event not found"
        description="The requested event could not be found or has been removed."
        actionLabel="Back to events"
        onAction={() => {
          window.location.href = "/organizer/events";
        }}
      />
    );
  }

  // Issue 21+25: once results are out, judging-side writes are refused
  // server-side; the UI mirrors that by hiding the controls that would fail.
  const isPublished = ["published", "archived", "closed"].includes(event.status);

  async function togglePublish() {
    if (!event) return;
    setBusy(true);
    try {
      const nextStage = event.status === "draft" ? "registration" : "draft";
      await setStage({ eventId: event._id, stage: nextStage });
      toast.success(`Event ${nextStage === "draft" ? "unpublished" : "published"}.`);
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  /** Stage transitions used by the results tab (publish / unpublish results). */
  async function handleSetStage(stage: string) {
    if (!event) return;
    setBusy(true);
    try {
      await setStage({ eventId: event._id, stage });
      toast.success(
        stage === "published"
          ? "Results published — the gallery is now ordered by the final ranking."
          : `Event moved back to ${stage}.`,
      );
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
      toast.success("Track created.");
      setNewTrackName("");
      setNewTrackDesc("");
      setNewTrackPrize("");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

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
      toast.success("Webhook registered.");
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
      toast.success("Test event queued for delivery.");
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
    if (!confirm("Remove/withdraw this flagged submission?")) return;
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

  async function handleUnflagComment(commentId: string) {
    setBusy(true);
    try {
      await unflagComment({ commentId: commentId as never });
      toast.success("Flag cleared — the comment stays published.");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRenameTrack(trackId: string) {
    if (!trackNameDraft.trim()) return;
    setBusy(true);
    try {
      await updateTrack({ trackId: trackId as never, name: trackNameDraft.trim() });
      toast.success("Track renamed.");
      setRenamingTrackId(null);
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleWebhook(webhookId: string, isActive: boolean) {
    setBusy(true);
    try {
      await setWebhookActive({ webhookId: webhookId as never, isActive });
      toast.success(isActive ? "Webhook resumed." : "Webhook paused — deliveries stop until resumed.");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRunDuplicateScan() {
    if (!event) return;
    setBusy(true);
    try {
      const res = await checkDuplicates({ eventId: event._id });
      toast.success(
        res.matches > 0
          ? `Scanned ${res.scanned} submissions — ${res.matches} duplicate match(es), ${res.newlyFlagged} new flag(s).`
          : `Scanned ${res.scanned} submissions — no duplicates found.`,
      );
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Issue 20: the eleven flat tabs became three grouped sections in a left
   * rail, matching the app sidebar's visual language (pink active bar, brighter
   * background, right-aligned count badges).
   */
  const navGroups: { group: string; items: { id: string; label: string; badge?: number }[] }[] = [
    {
      group: "Setup",
      items: [
        { id: "overview", label: "Overview" },
        { id: "tracks", label: "Tracks & Prizes", badge: tracks?.length },
        { id: "rubric", label: "Rubric", badge: rubricData?.criteria?.length },
        { id: "judges", label: "Judges" },
      ],
    },
    {
      group: "Activity",
      items: [
        { id: "voting", label: "Community Voting", badge: voteStatusData?.totalVotes },
        { id: "webhooks", label: "Webhooks", badge: webhooks?.length },
        { id: "comments", label: "Flagged Comments", badge: flaggedComments?.length },
        { id: "duplicates", label: "Duplicate Flags", badge: flagsData?.filter((f: any) => f.status === "flagged")?.length },
      ],
    },
    {
      group: "Results",
      items: [
        { id: "submissions", label: "Submissions", badge: submissions?.length },
        { id: "results", label: "Results" },
        { id: "audit", label: "Audit" },
      ],
    },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Secondary sidebar (issue 20) */}
      <aside
        aria-label="Event sections"
        className="lg:w-56 shrink-0 flex flex-col gap-5 self-start lg:sticky lg:top-8"
      >
        {navGroups.map(({ group, items }) => (
          <div key={group} className="flex flex-col gap-1">
            <span className="px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
              {group}
            </span>
            {items.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(item.id)}
                  className={`
                    relative flex items-center justify-between gap-2 rounded-btn px-3 py-2 text-[13px] font-medium text-left
                    transition-colors duration-fast
                    ${isActive ? "text-primary bg-surface-2" : "text-secondary hover:text-primary hover:bg-surface-2"}
                  `}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-pill bg-accent transition-opacity duration-fast ${
                      isActive ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="ml-auto tnum text-[11px] font-semibold rounded-pill bg-surface-2 text-muted px-1.5 py-0.5">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </aside>

      <div className="flex-1 min-w-0 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-line">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Badge variant={event.status === "draft" ? "default" : "success"}>{event.status}</Badge>
            <span className="font-mono text-[13px] text-muted">/{event.slug}</span>
          </div>
          <h1 className="text-h1 text-primary mt-2">{event.title}</h1>
        </div>

        <div className="flex gap-2 shrink-0">
          <Link to={`/organizer/events/${event.slug}/edit`}>
            <Button variant="secondary">Edit details</Button>
          </Link>
          <Button
            variant={event.status === "draft" ? "primary" : "secondary"}
            isLoading={busy}
            onClick={() => {
              if (event.status !== "draft") {
                setUnpublishConfirmOpen(true);
              } else {
                togglePublish();
              }
            }}
          >
            {event.status === "draft" ? "Publish event" : "Unpublish to draft"}
          </Button>
        </div>
      </div>

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface-1 border border-line rounded-card p-6">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Status</span>
            <p className="text-[2rem] leading-none font-semibold tracking-[-0.02em] text-primary tnum mt-3 capitalize">
              {event.status}
            </p>
          </div>
          <div className="bg-surface-1 border border-line rounded-card p-6">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Team size</span>
            <p className="text-[2rem] leading-none font-semibold tracking-[-0.02em] text-primary tnum mt-3">
              {event.minTeamSize || 1}–{event.maxTeamSize || 4}
            </p>
          </div>
          <div className="bg-surface-1 border border-line rounded-card p-6">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Registration ends</span>
            <p className="text-h3 text-primary tnum mt-3">
              {new Date(event.registrationEnd).toLocaleDateString()}
            </p>
          </div>
          <div className="bg-surface-1 border border-line rounded-card p-6">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Submissions close</span>
            <p className="text-h3 text-primary tnum mt-3">
              {new Date(event.submissionDeadline).toLocaleDateString()}
            </p>
          </div>
        </div>
      )}

      {activeTab === "tracks" && (
        <div className="flex flex-col gap-6">
          <div className="bg-surface-1 border border-line rounded-card p-6 flex flex-col gap-4">
            <h3 className="text-h3 text-primary">Add a track</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                aria-label="Track name"
                placeholder="Track name"
                value={newTrackName}
                onChange={(e) => setNewTrackName(e.target.value)}
              />
              <Input
                aria-label="Track description"
                placeholder="Description"
                value={newTrackDesc}
                onChange={(e) => setNewTrackDesc(e.target.value)}
              />
              <Input
                aria-label="Track prize"
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
              Add track
            </Button>
          </div>

          {tracks !== undefined && tracks.length === 0 ? (
            <EmptyState
              title="No tracks yet"
              description="Add at least one track so participants can categorize their submissions."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(tracks || []).map((t: any) => (
                <div key={t._id} className="bg-surface-1 border border-line rounded-card p-5 flex flex-col gap-2">
                  {renamingTrackId === t._id ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex-1 min-w-40">
                        <Input
                          label="Track name"
                          value={trackNameDraft}
                          onChange={(e) => setTrackNameDraft(e.target.value)}
                        />
                      </div>
                      <Button variant="primary" size="sm" isLoading={busy} onClick={() => handleRenameTrack(t._id)}>
                        Save
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setRenamingTrackId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="text-[15px] font-semibold text-primary">{t.name}</h4>
                        {t.description && (
                          <p className="text-[13px] text-secondary mt-1">{t.description}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        onClick={() => {
                          setRenamingTrackId(t._id);
                          setTrackNameDraft(t.name);
                        }}
                      >
                        Rename
                      </Button>
                    </div>
                  )}
                  {t.prizeDescription && (
                    <p className="text-[13px] font-medium text-accent">{t.prizeDescription}</p>
                  )}
                </div>
              ))}
            </div>
          )}
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

      {activeTab === "judges" && <JudgesTab eventId={event._id} judgingLocked={isPublished} />}

      {activeTab === "comments" && (
        <div className="bg-surface-1 border border-line rounded-card p-6">
          <div className="mb-5">
            <h3 className="text-h3 text-primary">Flagged comments for moderation</h3>
            <p className="text-[13px] text-secondary mt-0.5">
              Review user-reported comments across all submissions in this event.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {(flaggedComments || []).map((c: any) => (
              <div key={c.id} className="p-4 rounded-input bg-surface-2 border border-line flex flex-col gap-2 text-[13px]">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <div>
                    <span className="font-medium text-primary">{c.authorName}</span>
                    <span className="text-muted ml-2">
                      on{" "}
                      <Link
                        to={`/project/${c.submissionId}`}
                        className="text-accent hover:text-accent-hover transition-colors duration-fast"
                      >
                        {c.submissionTitle}
                      </Link>
                    </span>
                  </div>
                  <span className="text-[12px] text-muted tnum">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-primary leading-relaxed bg-warning/5 border border-warning/30 rounded-input p-2.5">
                  <Markdown content={c.body || c.content} className="text-[13px]" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    isLoading={busy}
                    onClick={() => handleUnflagComment(c.id)}
                  >
                    Unflag (keep)
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    isLoading={busy}
                    onClick={() => handleDeleteComment(c.id)}
                  >
                    Delete comment
                  </Button>
                </div>
              </div>
            ))}
            {(!flaggedComments || flaggedComments.length === 0) && (
              <EmptyState
                title="No flagged comments"
                description="Comments reported by users land here for review. Deleting removes them permanently."
              />
            )}
          </div>
        </div>
      )}

      {activeTab === "duplicates" && (
        <div className="bg-surface-1 border border-line rounded-card p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
            <div>
              <h3 className="text-h3 text-primary">Flagged duplicate submissions</h3>
              <p className="text-[13px] text-secondary mt-0.5">
                Duplicate detection matches within a team only: same normalized title, same repository
                URL, or both. A repository shared <em>across</em> two teams is flagged for review
                instead — a shared starter template is not plagiarism.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              isLoading={busy}
              onClick={handleRunDuplicateScan}
              className="shrink-0"
            >
              Run duplicate scan
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            {(flagsData || []).map((f: any) => (
              <div key={f.id} className="p-4 rounded-input bg-surface-2 border border-line flex flex-col gap-2 text-[13px]">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <div>
                    <Link
                      to={`/project/${f.submissionId}`}
                      className="font-medium text-accent hover:text-accent-hover transition-colors duration-fast"
                    >
                      {f.submissionTitle}
                    </Link>
                    <span className="text-muted ml-2">Team: {f.teamName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={f.severity === "review" ? "default" : "danger"}>
                      {f.severity === "review" ? "Review" : "Duplicate"}
                    </Badge>
                    <Badge variant={f.status === "flagged" ? "warning" : "default"}>{f.status}</Badge>
                  </div>
                </div>

                <p className="text-warning font-mono text-[12px] bg-warning/5 border border-warning/30 p-2.5 rounded-input">
                  {f.reason}
                </p>

                {f.status === "flagged" && (
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      isLoading={busy}
                      onClick={() => handleDismissFlag(f.id)}
                    >
                      Dismiss flag
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      isLoading={busy}
                      onClick={() => handleRemoveFlaggedSub(f.id)}
                    >
                      Remove submission
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {(!flagsData || flagsData.length === 0) && (
              <EmptyState
                title="No duplicate flags"
                description="Run a duplicate scan to check every submitted project for matching titles or repository URLs."
                actionLabel="Run duplicate scan"
                onAction={handleRunDuplicateScan}
              />
            )}
          </div>
        </div>
      )}

      {activeTab === "submissions" && (
        <div className="bg-surface-1 border border-line rounded-card p-6">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
            <h3 className="text-h3 text-primary">
              Submissions <span className="text-muted tnum">({submissions?.length || 0})</span>
            </h3>
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
              Export CSV
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {(submissions || []).map((s: any) => (
              <div
                key={s._id}
                className="px-4 py-3 rounded-input bg-surface-2 border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[13px]"
              >
                <div className="min-w-0">
                  <Link
                    to={`/project/${s._id}`}
                    className="font-medium text-primary hover:text-accent transition-colors duration-fast"
                  >
                    {s.title}
                  </Link>
                  <p className="text-muted">Team: {s.teamName}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {s.duplicate && (
                    <Badge variant={s.duplicate.severity === "review" ? "default" : "danger"}>
                      {s.duplicate.severity === "review" ? "Review: shared repo" : "Duplicate"}
                    </Badge>
                  )}
                  <Badge variant="success">{s.status}</Badge>
                </div>
              </div>
            ))}
            {(!submissions || submissions.length === 0) && (
              <EmptyState
                title="No submissions yet"
                description="Teams submit from their workspace once the event is in its submission window."
              />
            )}
          </div>
        </div>
      )}

      {activeTab === "voting" && (
        <div className="bg-surface-1 border border-line rounded-card p-6">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-5">
            <div>
              <h3 className="text-h3 text-primary">Live community voting tallies</h3>
              <p className="text-[13px] text-secondary mt-0.5">
                Mode <span className="capitalize text-primary">{voteStatusData?.votingType || "quadratic"}</span>
                {" · "}
                <span className="tnum">{voteStatusData?.totalVotes || 0}</span> total votes
              </p>
            </div>
            <Badge variant="warning">Organizer preview — tallies hidden from participants</Badge>
          </div>

          <div className="flex flex-col gap-2">
            {(voteStatusData?.tally || []).map((t: any) => {
              const sub = (submissions || []).find((s: any) => String(s._id) === String(t.submissionId));
              return (
                <div
                  key={t.submissionId}
                  className="px-4 py-3 rounded-input bg-surface-2 border border-line flex justify-between items-center text-[13px]"
                >
                  <div className="min-w-0">
                    <Link
                      to={`/project/${t.submissionId}`}
                      className="font-medium text-primary hover:text-accent transition-colors duration-fast"
                    >
                      {sub?.title || `Project #${String(t.submissionId).slice(0, 8)}`}
                    </Link>
                    <p className="text-muted">{sub?.teamName || "—"}</p>
                  </div>
                  <span className="text-[15px] font-semibold text-accent tnum shrink-0">{t.points} pts</span>
                </div>
              );
            })}
            {(!voteStatusData?.tally || voteStatusData.tally.length === 0) && (
              <EmptyState
                title="No community votes yet"
                description="Votes cast from the public event page will appear here once judging is live."
              />
            )}
          </div>
        </div>
      )}

      {activeTab === "webhooks" && (
        <div className="flex flex-col gap-6">
          {/* Register */}
          <div className="bg-surface-1 border border-line rounded-card p-6">
            <h3 className="text-h3 text-primary mb-4">Register a webhook endpoint</h3>
            <form onSubmit={handleRegisterWebhook} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <Input
                  label="Target endpoint URL"
                  placeholder="https://your-server.com/webhook"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  required
                />
                <Input
                  label="Subscribed events (* for all)"
                  placeholder="project.submitted, results.published"
                  value={webhookEvents}
                  onChange={(e) => setWebhookEvents(e.target.value)}
                />
                <Button variant="primary" isLoading={busy} type="submit">
                  Register webhook
                </Button>
              </div>
            </form>

            {newSecretKey && (
              <div className="mt-5 p-4 rounded-card bg-warning/5 border border-warning/40 text-[13px]">
                <p className="font-medium text-warning">Save this signing secret — it is shown once.</p>
                <code className="block mt-2 px-3 py-2 rounded-input bg-surface-2 border border-line font-mono text-[13px] text-primary select-all break-all">
                  {newSecretKey}
                </code>
              </div>
            )}
          </div>

          {/* Active webhooks */}
          <div className="bg-surface-1 border border-line rounded-card p-6">
            <h3 className="text-h3 text-primary mb-4">
              Active webhooks <span className="text-muted tnum">({webhooks?.length || 0})</span>
            </h3>
            <div className="flex flex-col gap-3">
              {(webhooks || []).map((w: any) => (
                <div
                  key={w._id}
                  className="px-4 py-3.5 rounded-input bg-surface-2 border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[13px]"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-primary break-all">{w.targetUrl}</span>
                    <p className="text-muted mt-0.5 flex items-center gap-2">
                      Events: {w.events}
                      <Badge variant={w.isActive ? "success" : "default"}>
                        {w.isActive ? "Active" : "Paused"}
                      </Badge>
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      isLoading={busy}
                      onClick={() => handleToggleWebhook(w._id, !w.isActive)}
                    >
                      {w.isActive ? "Pause" : "Resume"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      isLoading={busy}
                      onClick={() => handleTestDelivery(w._id)}
                    >
                      Send test event
                    </Button>
                  </div>
                </div>
              ))}
              {(!webhooks || webhooks.length === 0) && (
                <EmptyState
                  title="No webhooks registered"
                  description="Register an HTTPS endpoint to receive signed events when submissions and results change."
                />
              )}
            </div>
          </div>

          {/* Deliveries */}
          <div className="bg-surface-1 border border-line rounded-card p-6">
            <h3 className="text-h3 text-primary mb-4">Recent delivery logs</h3>
            <div className="flex flex-col gap-2">
              {(webhookDeliveries || []).map((d: any) => (
                <div
                  key={d._id}
                  className="px-4 py-3 rounded-input bg-surface-2 border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[13px]"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-primary">{d.eventType}</span>
                    <span className="text-muted ml-2 font-mono truncate">→ {d.targetUrl}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant={d.success ? "success" : "danger"}>
                      {d.statusCode ? `HTTP ${d.statusCode}` : "Failed"}
                    </Badge>
                    <span className="text-[12px] text-muted tnum">
                      {new Date(d.deliveredAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
              {(!webhookDeliveries || webhookDeliveries.length === 0) && (
                <EmptyState
                  title="No delivery history yet"
                  description="Test deliveries and webhook events will be logged here with their HTTP status."
                />
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "results" && (
        <div className="flex flex-col gap-6">
          {/* Publication gate: nothing in the gallery is ordered until this flips */}
          <div className="bg-surface-1 border border-line rounded-card p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="min-w-0">
              <h3 className="text-h3 text-primary flex items-center gap-2">
                <Trophy size={16} className="text-accent" aria-hidden="true" />
                Publication
              </h3>
              <p className="text-[13px] text-secondary mt-0.5">
                Before publication the public gallery shows a seeded, merit-free order with no scores.
                Publishing re-sorts it by the final ranking and unlocks the winner badge.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant={event.status === "published" ? "success" : "default"}>{event.status}</Badge>
                {event.status === "published" && <span className="text-[12px] text-muted">results live</span>}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {event.status !== "judging" && (
                <Button
                  variant="secondary"
                  size="sm"
                  isLoading={busy}
                  onClick={() => handleSetStage("judging")}
                >
                  Back to judging
                </Button>
              )}
              {event.status !== "published" && (
                <Button variant="primary" size="sm" isLoading={busy} onClick={() => handleSetStage("published")}>
                  Publish results
                </Button>
              )}
            </div>
          </div>

          <WinnerOverridePanel
            eventId={event._id}
            submissions={(submissions ?? []) as any[]}
            isAdmin={me?.role === "admin"}
          />

          <div className="bg-surface-1 border border-line rounded-card p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-h3 text-primary">Results & rankings</h3>
              <p className="text-[13px] text-secondary mt-0.5">
                Z-score normalized rankings (clamped to 0–10) and the Bradley-Terry pairwise
                leaderboard, computed from the scores recorded so far.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
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
                Rankings CSV
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
                Scores CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (!assignmentsCsv) {
                    toast.error("No data to export yet");
                    return;
                  }
                  downloadRawCsv(`${event.slug}-assignments.csv`, assignmentsCsv);
                }}
              >
                Assignments CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (!eventJson) {
                    toast.error("No data to export yet");
                    return;
                  }
                  // Full event dump (tracks, teams, submissions, rubric,
                  // assignments, scores, votes, matches) for backup or migration.
                  const blob = new Blob([JSON.stringify(eventJson, null, 2)], {
                    type: "application/json",
                  });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = `${event.slug}-event.json`;
                  link.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Event JSON
              </Button>
            </div>
          </div>

          {/* Certificates: issued at seeding/close-of-event, verifiable by anyone. */}
          <div className="bg-surface-1 border border-line rounded-card p-6">
            <h3 className="text-h3 text-primary mb-1">
              Issued certificates{" "}
              <span className="text-muted tnum">({certificates?.length || 0})</span>
            </h3>
            <p className="text-[13px] text-secondary mb-4">
              Participation and winner certificates for this event. Each one carries an HMAC signature
              that anyone can check on the public verification page.
            </p>
            <div className="flex flex-col gap-2">
              {(certificates || []).slice(0, 8).map((c: any) => (
                <div
                  key={c._id}
                  className="px-4 py-3 rounded-input bg-surface-2 border border-line flex flex-wrap items-center justify-between gap-2 text-[13px]"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-primary">{c.email}</span>
                    <span className="text-muted ml-2 uppercase text-[11px] tracking-[0.08em]">{c.certType}</span>
                    <p className="text-muted mt-0.5 truncate">{c.title}</p>
                  </div>
                  <Link
                    to={`/verify/${c.certUuid}?signature=${c.signatureHash}`}
                    className="text-accent hover:text-accent-hover transition-colors duration-fast shrink-0"
                  >
                    Verify ↗
                  </Link>
                </div>
              ))}
              {certificates !== undefined && certificates.length === 0 && (
                <EmptyState
                  title="No certificates issued"
                  description="Certificates are minted when the event closes — participants and winners each get a signed record."
                />
              )}
              {certificates === undefined && <SkeletonCard lines={3} />}
            </div>
          </div>

          {normalization === undefined ? (
            <SkeletonCard lines={4} />
          ) : !normalization.ok ? (
            <EmptyState
              title="No scores yet"
              description={normalization.reason ?? "Judge scores have not been recorded for this event."}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-surface-1 border border-line rounded-card p-5">
                  <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Judges scored</span>
                  <p className="text-[2rem] leading-none font-semibold tracking-[-0.02em] text-primary tnum mt-3">
                    {normalization.result?.judgeCalibrations?.length ?? 0}
                  </p>
                </div>
                <div className="bg-surface-1 border border-line rounded-card p-5">
                  <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Projects ranked</span>
                  <p className="text-[2rem] leading-none font-semibold tracking-[-0.02em] text-primary tnum mt-3">
                    {normalization.result?.submissions?.length ?? 0}
                  </p>
                </div>
                <div className="bg-surface-1 border border-line rounded-card p-5">
                  <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Raw vs norm ρ</span>
                  <p className="text-[2rem] leading-none font-semibold tracking-[-0.02em] text-primary tnum mt-3">
                    {(normalization.result?.proof?.rawVsNormalizedRho ?? 0).toFixed(3)}
                  </p>
                </div>
                <div className="bg-surface-1 border border-line rounded-card p-5">
                  <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Judge mean spread</span>
                  <p className="text-h3 text-primary tnum mt-3">
                    {(normalization.result?.proof?.judgeMeanSpreadRaw ?? 0).toFixed(2)}
                    <span className="text-success"> → {(normalization.result?.proof?.judgeMeanSpreadNormalized ?? 0).toFixed(2)}</span>
                  </p>
                  <p className="text-[12px] text-muted mt-1">raw → normalized</p>
                </div>
              </div>

              {/* Judge calibration */}
              <div className="bg-surface-1 border border-line rounded-card p-6">
                <h4 className="text-[15px] font-semibold text-primary mb-4">Judge calibration</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px] min-w-[420px] border-collapse">
                    <thead>
                      <tr className="border-b border-line">
                        <th className="py-2.5 px-3 text-left text-[12px] font-medium uppercase tracking-[0.05em] text-muted">Judge</th>
                        <th className="py-2.5 px-3 text-left text-[12px] font-medium uppercase tracking-[0.05em] text-muted">Raw mean</th>
                        <th className="py-2.5 px-3 text-left text-[12px] font-medium uppercase tracking-[0.05em] text-muted">Std dev</th>
                        <th className="py-2.5 px-3 text-right text-[12px] font-medium uppercase tracking-[0.05em] text-muted">Projects</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...(normalization.result?.judgeCalibrations ?? [])]
                        .sort((a: any, b: any) => b.mean - a.mean)
                        .map((j: any) => (
                          <tr key={j.judgeId} className="border-b border-line last:border-0 hover:bg-surface-2 transition-colors duration-fast">
                            <td className="py-2.5 px-3 font-medium text-primary">{j.judgeName}</td>
                            <td className="py-2.5 px-3 font-mono text-[12px] text-primary tnum">{j.mean.toFixed(3)}</td>
                            <td className="py-2.5 px-3 font-mono text-[12px] text-secondary tnum">{j.sigma.toFixed(3)}</td>
                            <td className="py-2.5 px-3 text-right text-secondary tnum">{j.n}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Normalized leaderboard */}
              <div className="bg-surface-1 border border-line rounded-card p-6">
                <h4 className="text-[15px] font-semibold text-primary mb-4">
                  Normalized leaderboard <span className="text-muted font-normal">(z → 0–10)</span>
                </h4>
                <div className="flex flex-col gap-2">
                  {(normalization.result?.submissions ?? []).slice(0, 12).map((s: any, i: number) => (
                    <div
                      key={s.submissionId}
                      className="px-4 py-3 rounded-input bg-surface-2 border border-line flex items-center gap-3 text-[13px]"
                    >
                      <span className="w-7 text-center font-semibold text-muted tnum shrink-0">{i + 1}</span>
                      <Link
                        to={`/project/${s.submissionId}`}
                        className="font-medium text-primary hover:text-accent transition-colors duration-fast flex-1 truncate"
                      >
                        {s.title}
                      </Link>
                      <span className="font-mono text-[12px] text-muted hidden sm:inline tnum">
                        raw {s.rawMean.toFixed(2)}
                      </span>
                      <span className="font-semibold text-accent w-14 text-right tnum shrink-0">
                        {s.tenPointNormalized.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bradley-Terry */}
              <div className="bg-surface-1 border border-line rounded-card p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <h4 className="text-[15px] font-semibold text-primary">Bradley-Terry pairwise ranking</h4>
                  <span className="text-[13px] text-muted tnum">
                    {pairwiseBoard?.totalMatches ?? 0} comparison
                    {(pairwiseBoard?.totalMatches ?? 0) === 1 ? "" : "s"} recorded
                  </span>
                </div>
                {pairwiseBoard === undefined ? (
                  <SkeletonCard lines={3} />
                ) : (pairwiseBoard?.ranking?.length ?? 0) === 0 ? (
                  <EmptyState
                    title="No pairwise comparisons yet"
                    description="Judges create comparisons from their pairwise screen; ratings sharpen as they arrive."
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {pairwiseBoard.ranking.slice(0, 12).map((r: any, i: number) => (
                      <div
                        key={r.submissionId}
                        className="px-4 py-3 rounded-input bg-surface-2 border border-line flex items-center gap-3 text-[13px]"
                      >
                        <span className="w-7 text-center font-semibold text-muted tnum shrink-0">{i + 1}</span>
                        <Link
                          to={`/project/${r.submissionId}`}
                          className="font-medium text-primary hover:text-accent transition-colors duration-fast flex-1 truncate"
                        >
                          {r.title}
                        </Link>
                        <span className="font-mono text-[12px] text-muted hidden sm:inline tnum">
                          {r.wins}W / {r.matches}M
                        </span>
                        <span className="font-semibold text-accent w-16 text-right tnum shrink-0">
                          {Number(r.rating ?? 0).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    {pairwiseBoard.converged === false && (
                      <p className="text-[12px] text-warning text-center pt-2">
                        Bradley-Terry has not fully converged yet — more comparisons will sharpen it.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === "audit" && (
        <div className="flex flex-col gap-6">
          <div className="bg-surface-1 border border-line rounded-card p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-h3 text-primary">Audit trail</h3>
              <p className="text-[13px] text-secondary mt-0.5">
                Append-only, hash-chained log of every privileged write on this event.
              </p>
            </div>
            {chain && (
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-pill border text-[12px] font-medium ${
                  chain.valid
                    ? "border-success/30 bg-success/5 text-success"
                    : "border-danger/40 bg-danger/5 text-danger"
                }`}
              >
                {chain.valid ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
                {chain.valid
                  ? `Chain verified · ${chain.entries} entries`
                  : `Chain broken at ${chain.brokenAt}`}
              </div>
            )}
          </div>

          <div className="bg-surface-1 border border-line rounded-card p-6">
            <div className="flex flex-col gap-2">
              {(auditLogs || []).map((log: any) => (
                <div
                  key={log.id}
                  className="px-4 py-3 rounded-input bg-surface-2 border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[13px]"
                >
                  <span className="font-mono text-[12px] font-medium text-primary">{log.action}</span>
                  <span className="text-secondary truncate sm:max-w-xs">
                    {log.actorEmail} → {log.targetType}:{log.targetId.slice(0, 10)}
                  </span>
                  <span className="font-mono text-[12px] text-muted tnum">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
              ))}
              {(!auditLogs || auditLogs.length === 0) && (
                <EmptyState
                  title="No audit entries yet"
                  description="Publishes, rubric edits, assignments and exports on this event are recorded here."
                />
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={unpublishConfirmOpen}
        onClose={() => setUnpublishConfirmOpen(false)}
        onConfirm={togglePublish}
        title="Unpublish event"
        description="Unpublishing returns the event to draft status and hides public registration."
        confirmLabel="Unpublish event"
        destructive
        isLoading={busy}
      />
      </div>
    </div>
  );
}
