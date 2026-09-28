import { useState, FormEvent } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { humanizeConvexError } from "@/lib/errors";
import { formatDate, formatDateTime } from "@/lib/format";
import { usePrimaryEventSlug } from "@/lib/featuredEvent";
import { Markdown } from "@/components/ui/Markdown";

export default function ProjectDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const fallbackSlug = usePrimaryEventSlug();
  const detail = useQuery(api.submissions.detail, id ? { submissionId: id as never } : "skip");
  const comments = useQuery(api.comments.listForSubmission, id ? { submissionId: id as never } : "skip");
  const me = useQuery(api.users.me, {});
  const voteStatus = useQuery(
    api.voting.voteStatus,
    detail?.eventId ? { eventId: detail.eventId } : "skip",
  );
  const castVote = useMutation(api.voting.castVote);
  const removeVote = useMutation(api.voting.removeVote);
  /** Issue 53: is the signed-in visitor actually on a team in this event? */
  const myTeams = useQuery(api.teams.myTeams, me ? {} : "skip");
  const enrolledInEvent = Boolean(
    detail?.eventId && myTeams?.some((t: { eventId: string }) => t.eventId === detail.eventId),
  );
  const eventSlug = (detail as { eventSlug?: string } | undefined)?.eventSlug ?? fallbackSlug;
  const [votePoints, setVotePoints] = useState(1);
  const addComment = useMutation(api.comments.add);
  const flagComment = useMutation(api.comments.flag);
  const deleteComment = useMutation(api.comments.deleteComment);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function handlePostComment(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || !id) return;
    setBusy(true);
    try {
      await addComment({ submissionId: id as never, content: text });
      setText("");
      toast.success("Comment posted");
    } catch (err) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleVote(points: number) {
    if (!id || !detail?.eventId) return;
    setBusy(true);
    try {
      await castVote({ eventId: detail.eventId, submissionId: id as never, points });
      toast.success(
        voteStatus?.votingType === "upvote" ? "Upvote recorded" : `${points} point${points === 1 ? "" : "s"} cast`,
      );
    } catch (err) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveVote() {
    if (!id || !detail?.eventId) return;
    setBusy(true);
    try {
      await removeVote({ eventId: detail.eventId, submissionId: id as never });
      toast.success("Vote withdrawn");
    } catch (err) {
      toast.error(humanizeConvexError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleFlag(commentId: string) {
    try {
      await flagComment({ commentId: commentId as never });
      toast.success("Flagged for organizer review");
    } catch (err) {
      toast.error(humanizeConvexError(err));
    }
  }

  async function handleDelete(commentId: string) {
    try {
      await deleteComment({ commentId: commentId as never });
      toast.success("Comment removed");
    } catch (err) {
      toast.error(humanizeConvexError(err));
    }
  }

  if (detail === undefined) {
    return (
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="max-w-4xl mx-auto">
        <EmptyState
          title="Project not found"
          description="This submission may have been withdrawn, or the link is out of date."
          actionLabel="Back to gallery"
          onAction={() => navigate(`/gallery/${fallbackSlug}`)}
        />
      </div>
    );
  }

  const canModerate = (comment: any) =>
    me?._id && (String(comment.authorId) === String(me._id) || me.role === "organizer" || me.role === "admin");

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-10">
      <Link
        to={`/gallery/${detail.eventSlug ?? fallbackSlug}`}
        className="text-sm text-accent hover:text-accent-hover transition-colors duration-fast self-start"
      >
        ← Back to {detail.eventTitle ? `${detail.eventTitle} gallery` : "gallery"}
      </Link>

      {/* Header */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(detail as any).isWinner && <Badge variant="accent">🏆 Winner</Badge>}
          {(detail as any).rank && !(detail as any).isWinner && (
            <Badge variant="success">#{(detail as any).rank}</Badge>
          )}
          <Badge variant="accent">{detail.trackName || "General Track"}</Badge>
          <Badge variant={detail.status === "submitted" ? "success" : "default"}>{detail.status}</Badge>
          {detail.submittedAt && (
            <span className="text-[13px] text-muted ml-auto tnum">
              Submitted {formatDate(detail.submittedAt)}
            </span>
          )}
        </div>

        <h1 className="text-h1 text-primary">{detail.title}</h1>
        {detail.tagline ? <Markdown content={detail.tagline} className="text-base" /> : null}
        <p className="text-sm text-primary">
          Team <span className="font-semibold">{detail.teamName}</span>
        </p>

        {detail.repositoryUrl || detail.demoUrl || detail.videoUrl ? (
          <div className="flex flex-wrap gap-3 mt-3">
            {detail.repositoryUrl && (
              <a href={detail.repositoryUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" size="sm">
                  Repository ↗
                </Button>
              </a>
            )}
            {detail.demoUrl && (
              <a href={detail.demoUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" size="sm">
                  Live demo ↗
                </Button>
              </a>
            )}
            {detail.videoUrl && (
              <a href={detail.videoUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" size="sm">
                  Video pitch ↗
                </Button>
              </a>
            )}
          </div>
        ) : null}
      </header>

      {/* Community vote — the only participant-facing write on this page. The
          server owns every rule (stage window, quadratic budget, rate limit,
          one-vote-per-project in upvote mode); this panel only mirrors them. */}
      {voteStatus && me?.role !== "judge" && (() => {
        const myVote = (voteStatus.myVotes ?? []).find(
          (v: any) => v.submissionId === String(id),
        );
        const isUpvote = voteStatus.votingType === "upvote";
        const creditsLeft = voteStatus.budget - voteStatus.creditsSpent;
        return (
          <section className="border-t border-line pt-8 flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-h2 text-primary">Community vote</h2>
              <span className="text-[13px] text-muted tnum">
                {isUpvote
                  ? myVote
                    ? "You upvoted this project"
                    : "One upvote per project"
                  : `${creditsLeft} of ${voteStatus.budget} credits left`}
              </span>
            </div>

            {!me ? (
              <p className="text-sm text-secondary">
                <Link to="/auth" className="text-accent hover:text-accent-hover transition-colors duration-fast">
                  Sign in
                </Link>{" "}
                to vote on this project.
              </p>
            ) : !voteStatus.votingOpen ? (
              <p className="text-sm text-secondary">
                Voting is {voteStatus.resultsVisible ? "closed for this event" : "not open yet"} — points can
                be cast while the event is in its voting stage.
              </p>
            ) : !enrolledInEvent ? (
              // Issue 53: the panel used to look identical whether or not the
              // visitor belongs to this event, so there was no way to tell that
              // the ballot is open. Naming it explicitly is the honest version:
              // the community vote is open to any signed-in participant, and
              // joining a team here is what makes it yours.
              <p className="text-sm text-secondary">
                Community voting is open.{" "}
                <Link
                  to={`/e/${eventSlug ?? ""}`}
                  className="text-accent hover:text-accent-hover transition-colors duration-fast"
                >
                  Join a team in this event
                </Link>{" "}
                to take part — you are not on a team here yet.
              </p>
            ) : myVote ? (
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="accent">{myVote.points} point{myVote.points === 1 ? "" : "s"}</Badge>
                <span className="text-[13px] text-muted">
                  {isUpvote
                    ? "Your upvote is recorded."
                    : `Cost ${myVote.creditsSpent} credit${myVote.creditsSpent === 1 ? "" : "s"}.`}
                </span>
                <Button variant="secondary" size="sm" isLoading={busy} onClick={handleRemoveVote}>
                  Withdraw vote
                </Button>
              </div>
            ) : isUpvote ? (
              <Button variant="primary" size="sm" isLoading={busy} onClick={() => handleVote(1)} className="self-start">
                Upvote this project
              </Button>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-32">
                  <Input
                    label="Points"
                    type="number"
                    min={1}
                    value={String(votePoints)}
                    onChange={(e) => setVotePoints(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
                <Button variant="primary" size="sm" isLoading={busy} onClick={() => handleVote(votePoints)}>
                  Cast {votePoints} point{votePoints === 1 ? "" : "s"} ({votePoints * votePoints} credits)
                </Button>
              </div>
            )}
          </section>
        );
      })()}

      {/* Description */}
      <section className="border-t border-line pt-8">
        <h2 className="text-h2 text-primary mb-4">About this project</h2>
        <Markdown content={detail.description ?? ""} />
      </section>

      {/* Discussion */}
      <section className="border-t border-line pt-8">
        <h2 className="text-h2 text-primary mb-5">Discussion ({comments?.length ?? 0})</h2>

        <form onSubmit={handlePostComment} className="flex flex-col sm:flex-row gap-3 mb-8">
          <Input
            placeholder="Add a comment or feedback..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Add a comment"
          />
          <Button type="submit" variant="primary" size="md" isLoading={busy} disabled={!text.trim()}>
            Post
          </Button>
        </form>

        {comments === undefined ? (
          <SkeletonCard lines={2} />
        ) : comments.length === 0 ? (
          <EmptyState title="No comments yet" description="Be the first to share feedback on this project." />
        ) : (
          <div className="flex flex-col gap-3">
            {comments.map((comment: any) => (
              <div key={comment.id} className="bg-surface-1 border border-line rounded-card p-4 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="font-semibold text-primary">{comment.authorName}</span>
                  {comment.isFlagged && <Badge variant="warning">Flagged</Badge>}
                  <span className="text-[11px] text-muted ml-auto tnum">
                    {formatDateTime(comment.createdAt)}
                  </span>
                </div>
                <Markdown content={comment.content} className="text-[13px]" />
                {canModerate(comment) && (
                  <div className="flex gap-4 mt-1">
                    {!comment.isFlagged && (
                      <button
                        type="button"
                        onClick={() => handleFlag(comment.id)}
                        className="text-[13px] text-muted hover:text-primary transition-colors duration-fast"
                        aria-label="Flag this comment for review"
                      >
                        Flag
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(comment.id)}
                      className="text-[13px] text-muted hover:text-danger transition-colors duration-fast"
                      aria-label="Delete this comment"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
