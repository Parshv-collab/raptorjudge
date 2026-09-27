import { useState, useMemo, useEffect } from "react";
import { useParams, Link, Navigate, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { humanizeConvexError } from "@/lib/errors";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { Alert } from "@/components/ui/Alert";
import { Textarea } from "@/components/ui/Textarea";
import { Markdown } from "@/components/ui/Markdown";

/** Draft autosave lives in localStorage, namespaced per assignment. */
const DRAFT_PREFIX = "raptorjudge:judge-draft:";

export default function JudgeScore() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const queue = useQuery(api.judging.myQueue, skip ? "skip" : {});

  const item = queue?.items.find(
    (candidate: any) => String(candidate.assignmentId) === String(id),
  );

  const eventId = item?.eventId;
  // Single rubric source of truth: getRubric returns the criteria, the weight
  // audit and the lock state in one round-trip.
  const rubricData = useQuery(
    api.judging.getRubric,
    skip || !eventId ? "skip" : { eventId: eventId as never },
  );
  const submitScores = useMutation(api.judging.submitScores);

  const sortedRubric = useMemo(
    () =>
      [...(rubricData?.criteria ?? [])].sort(
        (a: any, b: any) => a.sortOrder - b.sortOrder,
      ),
    [rubricData],
  );

  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  const assignmentId = item ? String(item.assignmentId) : null;

  // Hydrate the draft (localStorage first, then any previously saved values).
  useEffect(() => {
    if (!assignmentId || !item) return;
    const key = `${DRAFT_PREFIX}${assignmentId}`;
    if (hydratedFor === key) return;
    const saved: Record<string, number> = {};
    for (const s of item.scoredCriteria ?? []) saved[String(s.criterionId)] = s.score;
    let restoredNotes = "";
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          Object.assign(saved, parsed.scores ?? {});
          if (typeof parsed.notes === "string") restoredNotes = parsed.notes;
        }
      }
    } catch {
      // A corrupt draft must never break scoring — fall back to saved values.
    }
    setScores(saved);
    setNotes(restoredNotes);
    setHydratedFor(key);
  }, [assignmentId, item, hydratedFor]);

  // Autosave on every change so an accidental refresh loses nothing.
  useEffect(() => {
    if (!hydratedFor) return;
    try {
      localStorage.setItem(hydratedFor, JSON.stringify({ scores, notes }));
    } catch {
      // Storage unavailable (private mode / quota) — scoring still works.
    }
  }, [hydratedFor, scores, notes]);

  const totalCount = queue?.items.length ?? 0;
  const completedCount = queue?.items.filter((i: any) => i.status === "completed").length ?? 0;

  if (!queue || (item && rubricData === undefined)) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (!item) {
    return <Navigate to="/judge" replace />;
  }

  const selectedItem = item;
  const locked = Boolean(selectedItem.locked) || selectedItem.status === "completed";

  const scoreFor = (c: any) =>
    scores[c._id] ??
    selectedItem.scoredCriteria.find((s: any) => s.criterionId === c._id)?.score ??
    Math.ceil((c.minScore + c.maxScore) / 2);

  let weightedTotal = 0;
  let maxPossibleWeighted = 0;
  sortedRubric.forEach((criterion: any) => {
    weightedTotal += scoreFor(criterion) * criterion.weight;
    maxPossibleWeighted += criterion.maxScore * criterion.weight;
  });
  const percentageScore = maxPossibleWeighted > 0 ? (weightedTotal / maxPossibleWeighted) * 100 : 0;
  const weightValid = rubricData?.weightValid !== false;

  async function handleSaveScores() {
    setBusy(true);
    try {
      const result = await submitScores({
        assignmentId: selectedItem.assignmentId as never,
        scores: sortedRubric.map((c: any) => ({
          criterionId: c._id as never,
          score: scoreFor(c),
        })),
        privateNotes: notes,
      });
      try {
        localStorage.removeItem(`${DRAFT_PREFIX}${selectedItem.assignmentId}`);
      } catch {
        // Nothing to clean up if storage is unavailable.
      }
      if (result.complete) {
        toast.success("Scores locked in");
        navigate("/judge");
      } else {
        toast.success("Draft scores saved");
      }
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link to="/judge" className="text-sm text-accent hover:text-accent-hover self-start">
          ← Back to judging queue
        </Link>

        {/* "You've scored 3 of 8" progress */}
        <div className="sm:w-64">
          <ProgressBar
            value={totalCount > 0 ? (completedCount / totalCount) * 100 : 0}
            label={`You've scored ${completedCount} of ${totalCount}`}
          />
        </div>
      </div>

      {locked && (
        <Alert variant="success" title="Score locked">
          Scores cannot be edited after submission — ask an organizer if a correction is required.
        </Alert>
      )}

      {/* Project summary */}
      <header className="bg-surface-1 border border-line rounded-card p-6 sm:p-8 flex flex-wrap justify-between items-start gap-6">
        <div className="min-w-0">
          <Badge variant="accent" className="mb-3">
            {(selectedItem.submission as any).trackName || "General Track"}
          </Badge>
          <h1 className="text-h1 text-primary">{selectedItem.submission.title}</h1>
          <p className="text-sm text-secondary mt-1">Team {selectedItem.submission.teamName}</p>

          <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t border-line">
            {selectedItem.submission.repositoryUrl && (
              <a href={selectedItem.submission.repositoryUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" size="sm">Repository ↗</Button>
              </a>
            )}
            {selectedItem.submission.demoUrl && (
              <a href={selectedItem.submission.demoUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" size="sm">Live demo ↗</Button>
              </a>
            )}
            {selectedItem.submission.videoUrl && (
              <a href={selectedItem.submission.videoUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" size="sm">Video pitch ↗</Button>
              </a>
            )}
          </div>
        </div>

        {/* Live weighted total */}
        <div className="bg-surface-2 border border-line rounded-card px-6 py-5 text-center shrink-0">
          <span className="text-[11px] uppercase tracking-[0.05em] text-muted block">Weighted total</span>
          <div className="text-3xl font-semibold text-accent tnum mt-1">
            {weightedTotal.toFixed(1)}
            <span className="text-muted text-lg"> / {maxPossibleWeighted.toFixed(1)}</span>
          </div>
          <span className="text-[11px] text-muted tnum">{percentageScore.toFixed(0)}% of maximum</span>
        </div>
      </header>

      {/* Rubric banners */}
      {rubricData?.isDefault && (
        <Alert variant="warning" title="Default rubric">
          This event uses the default rubric. Your organizer may update this before judging opens.
        </Alert>
      )}
      {!weightValid && (
        <Alert variant="error" title="Rubric weights invalid">
          This rubric&apos;s weights sum to {Number(rubricData?.weightSum ?? 0).toFixed(2)}, not 1.00.
          Weighted totals are approximate until the organizer fixes it.
        </Alert>
      )}

      {/* Description */}
      <section className="border-t border-line pt-8">
        <h2 className="text-h3 text-primary mb-3">Project overview</h2>
        <Markdown content={selectedItem.submission.description ?? ""} />
      </section>

      {/* Rubric scoring form */}
      <section className="bg-surface-1 border border-line rounded-card p-6 sm:p-8 flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-h2 text-primary">Rubric evaluation</h2>
          <span className="text-[13px] text-muted">Drafts autosave locally as you move the sliders.</span>
        </div>

        <div className="flex flex-col gap-5">
          {sortedRubric.map((criterion: any) => {
            const currentScore = scoreFor(criterion);
            return (
              <div key={criterion._id} className="bg-surface-2 border border-line rounded-card p-5 flex flex-col gap-3">
                <div className="flex justify-between items-center gap-3">
                  <div>
                    <label htmlFor={`criterion-${criterion._id}`} className="text-[15px] font-semibold text-primary">
                      {criterion.name}
                    </label>
                    <span className="ml-2 text-[11px] font-medium text-muted tnum">
                      {Math.round(criterion.weight * 100)}% weight
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-primary tnum shrink-0">
                    {currentScore} / {criterion.maxScore}
                  </span>
                </div>

                <p className="text-[13px] text-secondary">{criterion.description}</p>

                <input
                  id={`criterion-${criterion._id}`}
                  type="range"
                  min={criterion.minScore}
                  max={criterion.maxScore}
                  step={0.5}
                  value={currentScore}
                  disabled={locked}
                  aria-label={`${criterion.name} score`}
                  aria-valuemin={criterion.minScore}
                  aria-valuemax={criterion.maxScore}
                  aria-valuenow={currentScore}
                  aria-valuetext={`${currentScore} out of ${criterion.maxScore}`}
                  onChange={(e) =>
                    setScores((prev) => ({ ...prev, [criterion._id]: Number(e.target.value) }))
                  }
                  className="w-full accent-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            );
          })}
        </div>

        {/* Private notes */}
        <Textarea
          id="judge-private-notes"
          label="Private notes for the organizer"
          rows={3}
          value={notes}
          disabled={locked}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional private observations or feedback..."
        />

        {/* Sticky action bar */}
        <div className="sticky bottom-4 bg-surface-1 border border-line rounded-card p-4 flex items-center justify-between gap-4 shadow-modal">
          <p className="text-[13px] text-secondary hidden sm:block">
            Submitting locks the score. It cannot be edited afterwards.
          </p>
          <Button
            variant="primary"
            size="md"
            isLoading={busy}
            disabled={locked}
            onClick={handleSaveScores}
            className="w-full sm:w-auto"
          >
            {locked ? "Score locked" : "Submit & lock score"}
          </Button>
        </div>
      </section>
    </div>
  );
}
