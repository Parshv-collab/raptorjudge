import { useState, FormEvent } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/GlassCard";
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
      <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-6">
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
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
    <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-6">
      <Link to={`/gallery/${detail.eventSlug ?? fallbackSlug}`}>
        <span className="text-xs font-semibold text-[#ff0055] hover:underline">
          ← Back to {detail.eventTitle ? `${detail.eventTitle} gallery` : "Gallery"}
        </span>
      </Link>

      {/* Header Info */}
      <GlassCard className="p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-[#ff0055]/10 text-[#ff0055]">
            {detail.trackName || "General Track"}
          </span>
          <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-emerald-500/10 text-emerald-600">
            {detail.status}
          </span>
          {detail.submittedAt && (
            <span className="text-[11px] text-[#6e6e73] ml-auto">
              Submitted: {new Date(detail.submittedAt).toLocaleDateString()}
            </span>
          )}
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1d1d1f] tracking-tight">
          {detail.title}
        </h1>
        <p className="text-sm font-medium text-[#6e6e73] mt-1">{detail.tagline}</p>
        <p className="text-xs font-semibold text-[#1d1d1f] mt-2">Team: {detail.teamName}</p>

        {/* Action Links */}
        <div className="flex flex-wrap gap-3 mt-6 pt-4 border-t border-black/5">
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
                Live Demo ↗
              </Button>
            </a>
          )}
          {detail.videoUrl && (
            <a href={detail.videoUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">
                Video Pitch ↗
              </Button>
            </a>
          )}
        </div>
      </GlassCard>

      {/* Description */}
      <GlassCard className="p-6 sm:p-8">
        <h2 className="text-base font-bold text-[#1d1d1f] mb-3">Project Description</h2>
        <div className="text-xs sm:text-sm text-[#1d1d1f] leading-relaxed whitespace-pre-line">
          {detail.description}
        </div>
      </GlassCard>

      {/* Comments / Discussion Section */}
      <GlassCard className="p-6 sm:p-8">
        <h2 className="text-base font-bold text-[#1d1d1f] mb-4">
          Discussion ({comments?.length ?? 0})
        </h2>

        <form onSubmit={handlePostComment} className="flex flex-col sm:flex-row gap-2 mb-6">
          <Input
            placeholder="Add a comment or feedback..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Add a comment"
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={busy}
            disabled={!text.trim()}
          >
            Post
          </Button>
        </form>

        {comments === undefined ? (
          <SkeletonCard lines={2} />
        ) : comments.length === 0 ? (
          <EmptyState
            title="No comments yet"
            description="Be the first to share feedback on this project."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {comments.map((comment: any) => (
              <div
                key={comment.id}
                className="p-3.5 rounded-input bg-white/60 border border-white shadow-sm flex flex-col gap-1"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-[#1d1d1f]">{comment.authorName}</span>
                  {comment.isFlagged && (
                    <span className="px-2 py-0.5 text-[9px] font-bold uppercase rounded-full bg-amber-500/15 text-amber-700">
                      Flagged
                    </span>
                  )}
                  <span className="text-[10px] text-[#6e6e73] ml-auto">
                    {new Date(comment.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-[#6e6e73] leading-relaxed">{comment.content}</p>
                {canModerate(comment) && (
                  <div className="flex gap-2 mt-1">
                    {!comment.isFlagged && (
                      <button
                        type="button"
                        onClick={() => handleFlag(comment.id)}
                        className="text-[10px] font-semibold text-[#6e6e73] hover:text-[#1d1d1f] focus-ring-accent rounded px-1"
                        aria-label="Flag this comment for review"
                      >
                        Flag
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(comment.id)}
                      className="text-[10px] font-semibold text-[#e63946] hover:underline focus-ring-accent rounded px-1"
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
      </GlassCard>
    </div>
  );
}
