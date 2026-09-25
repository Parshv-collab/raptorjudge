import { useState, FormEvent } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { humanizeConvexError } from "@/lib/errors";
import { usePrimaryEventSlug } from "@/lib/featuredEvent";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const fallbackSlug = usePrimaryEventSlug();
  const detail = useQuery(api.submissions.detail, id ? { submissionId: id as never } : "skip");
  const comments = useQuery(api.comments.listForSubmission, id ? { submissionId: id as never } : "skip");
  const me = useQuery(api.users.me, {});
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
          onAction={() => {
            window.location.href = `/gallery/${fallbackSlug}`;
          }}
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
          <Badge variant="accent">{detail.trackName || "General Track"}</Badge>
          <Badge variant={detail.status === "submitted" ? "success" : "default"}>{detail.status}</Badge>
          {detail.submittedAt && (
            <span className="text-[13px] text-muted ml-auto tnum">
              Submitted {new Date(detail.submittedAt).toLocaleDateString()}
            </span>
          )}
        </div>

        <h1 className="text-h1 text-primary">{detail.title}</h1>
        <p className="text-base text-secondary">{detail.tagline}</p>
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

      {/* Description */}
      <section className="border-t border-line pt-8">
        <h2 className="text-h2 text-primary mb-4">About this project</h2>
        <div className="text-sm text-secondary leading-relaxed whitespace-pre-line">{detail.description}</div>
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
                    {new Date(comment.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-secondary leading-relaxed">{comment.content}</p>
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
