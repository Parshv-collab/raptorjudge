import React, { useState, FormEvent } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const detail = useQuery(api.submissions.detail, id ? { submissionId: id as never } : "skip");
  const comments = useQuery(api.comments.listForSubmission, id ? { submissionId: id as never } : "skip");
  const addComment = useMutation(api.comments.add);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function handlePostComment(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || !id) return;
    setBusy(true);
    try {
      await addComment({ submissionId: id as never, content: text });
      setText("");
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <div className="py-24 text-center font-semibold text-xs text-[#6e6e73] animate-pulse">
        Loading project details...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-6">
      <Link to={`/gallery/${detail.eventId ? "dogfood-2026" : ""}`}>
        <span className="text-xs font-semibold text-[#ff0055] hover:underline">
          ← Back to Gallery
        </span>
      </Link>

      {/* Header Info */}
      <GlassCard className="p-8">
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

        <h1 className="text-3xl font-extrabold text-[#1d1d1f] tracking-tight">{detail.title}</h1>
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
      <GlassCard className="p-8">
        <h2 className="text-base font-bold text-[#1d1d1f] mb-3">Project Description</h2>
        <div className="text-xs sm:text-sm text-[#1d1d1f] leading-relaxed whitespace-pre-line">
          {detail.description}
        </div>
      </GlassCard>

      {/* Comments / Discussion Section */}
      <GlassCard className="p-8">
        <h2 className="text-base font-bold text-[#1d1d1f] mb-4">
          Discussion ({comments?.length || 0})
        </h2>

        <form onSubmit={handlePostComment} className="flex gap-2 mb-6">
          <Input
            placeholder="Add a comment or feedback..."
            value={text}
            onChange={(e) => setText(e.target.value)}
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

        <div className="flex flex-col gap-3">
          {comments && comments.length > 0 ? (
            comments.map((comment: any) => (
              <div
                key={comment.id}
                className="p-3.5 rounded-input bg-white/60 border border-white shadow-sm flex flex-col gap-1"
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-[#1d1d1f]">{comment.authorName}</span>
                  <span className="text-[10px] text-[#6e6e73]">
                    {new Date(comment.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-xs text-[#6e6e73] leading-relaxed">{comment.content}</p>
              </div>
            ))
          ) : (
            <p className="text-xs text-[#6e6e73] text-center py-4">No comments yet.</p>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
