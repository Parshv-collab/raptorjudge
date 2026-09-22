import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { useState, FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import { Github, ExternalLink, Video, MessageSquare, Flag, ArrowLeft } from "lucide-react";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const detail = useQuery(api.submissions.detail, id ? { submissionId: id as never } : "skip");
  const comments = useQuery(api.comments.listForSubmission, id ? { submissionId: id as never } : "skip");
  const addComment = useMutation(api.comments.add);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(e: FormEvent) {
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
      <div className="container py-24 text-center font-mono text-muted-foreground">
        project not found or not yet public
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-10">
      <Link to="/gallery/dogfood-2026" className="mb-6 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground transition hover:text-primary">
        <ArrowLeft size={13} /> back to gallery
      </Link>

      <div className="mb-6 flex items-center gap-2">
        <span className="rounded-full bg-primary/10 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-primary">
          {detail.trackName}
        </span>
        <span
          className={`rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-wider ${
            detail.status === "submitted" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
          }`}
        >
          {detail.status}
        </span>
      </div>

      <h1 className="text-4xl font-extrabold tracking-tight">{detail.title}</h1>
      <p className="mt-2 text-lg text-muted-foreground">{detail.tagline}</p>
      <div className="mt-2 font-mono text-sm text-muted-foreground">by {detail.teamName}</div>

      <div className="mt-6 flex flex-wrap gap-2">
        {detail.repositoryUrl && (
          <a href={detail.repositoryUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm transition hover:border-primary/50">
            <Github size={16} /> repository
          </a>
        )}
        {detail.demoUrl && (
          <a href={detail.demoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm transition hover:border-primary/50">
            <ExternalLink size={16} /> live demo
          </a>
        )}
        {detail.videoUrl && (
          <a href={detail.videoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm transition hover:border-primary/50">
            <Video size={16} /> video pitch
          </a>
        )}
      </div>

      <div className="mt-8 flex flex-wrap gap-1.5">
        {detail.tags
          .split(",")
          .filter(Boolean)
          .map((t: string) => (
            <span key={t} className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
              #{t}
            </span>
          ))}
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-3 text-lg font-semibold">About the project</h2>
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {detail.description}
        </div>
      </div>

      {/* comments */}
      <div className="mt-8">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <MessageSquare size={17} className="text-primary" /> Discussion ({comments?.length ?? 0})
        </h2>
        <form onSubmit={post} className="mb-4 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="leave a comment…"
            className="flex-1 rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="rounded-lg bg-primary px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-40"
          >
            post
          </button>
        </form>
        <div className="grid gap-2.5">
          {comments?.map((c: any) => (
            <div key={c.id} className="rounded-lg border border-border bg-card p-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium">{c.authorName}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {new Date(c.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{c.content}</p>
            </div>
          ))}
          {comments?.length === 0 && (
            <p className="py-6 text-center font-mono text-xs text-muted-foreground">no comments yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
