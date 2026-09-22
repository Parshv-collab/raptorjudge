import { useQuery, useMutation } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Gavel, CheckCircle2, Circle, Swords, Scale, Github, ExternalLink, Video } from "lucide-react";

interface QueueItem {
  assignmentId: string;
  status: string;
  submission: {
    id: string; title: string; tagline: string; description: string;
    repositoryUrl: string; videoUrl: string; demoUrl: string; tags: string; teamName: string;
  };
  scoredCriteria: { criterionId: string; score: number; notes: string }[];
  criteriaCount: number;
  locked: boolean;
}

export default function JudgePortal() {
  const event = useQuery(api.events.getBySlug, { slug: "dogfood-2026" });
  const queue = useQuery(api.judging.myQueue, event ? { eventId: event._id } : "skip");
  const rubric = useQuery(api.judging.rubricForEvent, event ? { eventId: event._id } : "skip");
  const submitScores = useMutation(api.judging.submitScores);

  const [openId, setOpenId] = useState<string | null>(null);

  const completed = queue?.items.filter((i) => i.status === "completed").length ?? 0;
  const total = queue?.items.length ?? 0;

  return (
    <div className="container max-w-4xl py-10">
      <div className="mb-8">
        <div className="mono-label mb-1">judge portal</div>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          <Gavel className="text-primary" size={28} /> {event?.title ?? "—"}
        </h1>
        {queue && (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 w-48 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${total ? (completed / total) * 100 : 0}%` }} />
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {completed}/{total} assignments complete ({total ? Math.round((completed / total) * 100) : 0}%)
            </span>
          </div>
        )}
        {queue && !queue.judgingOpen && (
          <div className="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 font-mono text-xs">
            judging is not open yet — stage: {event?.status}
          </div>
        )}
      </div>

      {/* pairwise arena */}
      {event && <PairwiseArena eventId={event._id} />}

      {/* queue */}
      <div className="mt-10">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
          <Scale size={18} className="text-primary" /> assigned submissions
        </h2>
        <div className="grid gap-3">
          {queue?.items.map((item: QueueItem) => (
            <QueueCard
              key={item.assignmentId}
              item={item}
              rubric={rubric ?? []}
              open={openId === item.assignmentId}
              onToggle={() => setOpenId(openId === item.assignmentId ? null : item.assignmentId)}
              onSubmit={async (scores, notes) => {
                try {
                  await submitScores({
                    assignmentId: item.assignmentId as never,
                    scores: scores.map((s) => ({ criterionId: s.criterionId as never, score: s.score })),
                    privateNotes: notes,
                  });
                  toast.success(item.status === "completed" ? "Scores updated" : "Review complete");
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
            />
          ))}
          {queue?.items.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-card/50 py-16 text-center font-mono text-sm text-muted-foreground">
              no assignments yet — organizers run the assignment engine
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QueueCard({
  item, rubric, open, onToggle, onSubmit,
}: {
  item: QueueItem;
  rubric: any[];
  open: boolean;
  onToggle: () => void;
  onSubmit: (scores: { criterionId: string; score: number }[], notes: string) => Promise<void>;
}) {
  const existing = new Map(item.scoredCriteria.map((s) => [s.criterionId, s]));
  const [scores, setScores] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const c of rubric) init[c._id] = existing.get(c._id)?.score ?? Math.ceil((c.minScore + c.maxScore) / 2);
    return init;
  });
  const [notes, setNotes] = useState(item.scoredCriteria[0]?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(() => [...rubric].sort((a, b) => a.sortOrder - b.sortOrder), [rubric]);
  const totalWeighted = sorted.reduce((acc, c) => acc + (scores[c._id] ?? 0) * c.weight, 0);
  const allScored = sorted.every((c) => scores[c._id] !== undefined);

  return (
    <div className="rounded-xl border border-border bg-card">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-4 p-5 text-left">
        <div className="flex items-center gap-3">
          {item.status === "completed" ? (
            <CheckCircle2 className="text-success" size={20} />
          ) : (
            <Circle className="text-muted-foreground" size={20} />
          )}
          <div>
            <div className="font-semibold">{item.submission.title}</div>
            <div className="font-mono text-xs text-muted-foreground">{item.submission.teamName} · {item.submission.tagline}</div>
          </div>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {item.scoredCriteria.length}/{item.criteriaCount} criteria
        </span>
      </button>

      {open && (
        <div className="border-t border-border p-5">
          <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {item.submission.description}
          </p>
          <div className="mb-5 flex flex-wrap gap-2">
            {item.submission.repositoryUrl && (
              <a href={item.submission.repositoryUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs transition hover:border-primary/50">
                <Github size={13} /> repo
              </a>
            )}
            {item.submission.demoUrl && (
              <a href={item.submission.demoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs transition hover:border-primary/50">
                <ExternalLink size={13} /> demo
              </a>
            )}
            {item.submission.videoUrl && (
              <a href={item.submission.videoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs transition hover:border-primary/50">
                <Video size={13} /> video
              </a>
            )}
          </div>

          {/* rubric sliders */}
          <div className="grid gap-4">
            {sorted.map((c) => (
              <div key={c._id}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label className="text-sm font-medium">
                    {c.name} <span className="font-mono text-[11px] text-primary">{Math.round(c.weight * 100)}%</span>
                  </label>
                  <span className="font-mono text-sm font-bold text-primary">
                    {scores[c._id] ?? "—"}<span className="text-muted-foreground">/{c.maxScore}</span>
                  </span>
                </div>
                <input
                  type="range"
                  min={c.minScore}
                  max={c.maxScore}
                  step={0.5}
                  disabled={item.locked}
                  value={scores[c._id] ?? 0}
                  onChange={(e) => setScores({ ...scores, [c._id]: Number(e.target.value) })}
                  className="w-full accent-[hsl(var(--primary))]"
                />
                <div className="mt-0.5 text-xs text-muted-foreground">{c.description}</div>
              </div>
            ))}
          </div>

          <label className="mt-4 grid gap-1">
            <span className="mono-label">private notes (only visible to you)</span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="your private observations…"
            />
          </label>

          <div className="mt-4 flex items-center justify-between">
            <div className="font-mono text-sm">
              weighted total: <span className="font-bold text-primary">{totalWeighted.toFixed(2)}</span>
            </div>
            <button
              disabled={busy || item.locked || !allScored}
              onClick={async () => {
                setBusy(true);
                await onSubmit(sorted.map((c) => ({ criterionId: c._id, score: scores[c._id] })), notes);
                setBusy(false);
              }}
              className="rounded-lg bg-primary px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-40"
            >
              {item.status === "completed" ? "update scores" : "submit review"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Split-screen pairwise duel with instant feedback. */
function PairwiseArena({ eventId }: { eventId: any }) {
  const pair = useQuery(api.pairwise.nextPair, { eventId });
  const submitMatch = useMutation(api.pairwise.submitMatch);
  const leaderboard = useQuery(api.pairwise.leaderboard, { eventId });
  const myMatches = useQuery(api.pairwise.myMatches, { eventId });

  const [choice, setChoice] = useState<"a" | "b" | "tie" | null>(null);

  if (!pair?.a) return null;

  async function vote(winner: "a" | "b" | "tie") {
    if (!pair) return;
    setChoice(winner);
    try {
      await submitMatch({
        eventId,
        submissionAId: pair.a.id as never,
        submissionBId: pair.b.id as never,
        winnerId: winner === "tie" ? undefined : (winner === "a" ? pair.a.id : pair.b.id) as never,
      });
      toast.success(winner === "tie" ? "Recorded as a tie" : `${winner === "a" ? pair.a.title : pair.b.title} wins`);
      setTimeout(() => setChoice(null), 600);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Swords size={18} className="text-primary" /> pairwise arena
        </h2>
        <span className="font-mono text-xs text-muted-foreground">
          {leaderboard?.totalMatches ?? 0} matches · {myMatches?.length ?? 0} yours
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        {[pair.a, pair.b].map((p, idx) => (
          <div key={p.id} className={`contents`}>
            {idx === 1 && <div className="text-center font-mono text-xs font-bold text-muted-foreground">VS</div>}
            <button
              onClick={() => vote(idx === 0 ? "a" : "b")}
              className={`rounded-lg border p-4 text-left transition ${
                choice === (idx === 0 ? "a" : "b")
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="font-semibold">{p.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{p.tagline}</div>
              {p.repositoryUrl && (
                <div className="mt-2 font-mono text-[10px] text-muted-foreground">{p.repositoryUrl.replace("https://github.com/", "")}</div>
              )}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-center">
        <button
          onClick={() => vote("tie")}
          className="rounded-md border border-border px-4 py-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground transition hover:border-primary/50 hover:text-primary"
        >
          call it a tie
        </button>
      </div>

      {/* mini leaderboard */}
      {leaderboard && leaderboard.ranking.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <div className="mono-label mb-2">current bradley-terry ranking</div>
          <div className="grid gap-1">
            {leaderboard.ranking.slice(0, 5).map((r: any, i: number) => (
              <div key={r.submissionId} className="flex items-center justify-between rounded px-2 py-1 font-mono text-xs odd:bg-secondary/40">
                <span>{i + 1}. {r.title}</span>
                <span className="text-primary">{r.rating.toFixed(0)} π</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
