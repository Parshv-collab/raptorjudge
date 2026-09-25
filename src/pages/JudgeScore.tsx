import React, { useState, useMemo, useEffect } from "react";
import { useParams, Link, Navigate, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { humanizeConvexError } from "@/lib/errors";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SkeletonCard } from "@/components/ui/SkeletonCard";

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
      <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-6">
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
        toast.success("Scores locked in — thanks!");
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
    <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Link to="/judge">
          <span className="text-xs font-semibold text-[#ff0055] hover:underline focus-ring-accent rounded px-1">
            ← Back to judging queue
          </span>
        </Link>

        {/* Progress: "You've scored 3 of 8" */}
        <div className="sm:w-64">
          <div className="flex justify-between items-center text-[11px] font-semibold text-[#6e6e73] mb-1">
            <span>
              You&apos;ve scored {completedCount} of {totalCount}
            </span>
            <span>{totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}%</span>
          </div>
          <ProgressBar value={totalCount > 0 ? (completedCount / totalCount) * 100 : 0} />
        </div>
      </div>

      {locked && (
        <div className="p-3.5 rounded-card bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5 text-xs text-emerald-800 font-medium">
          <span aria-hidden="true">🔒</span>
          <span>
            Your score for this project is locked. Scores cannot be edited after submission — ask an
            organizer if a correction is required.
          </span>
        </div>
      )}

      {/* Summary Header Card */}
      <GlassCard className="p-6 sm:p-8">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
              {(selectedItem.submission as any).trackName || "General Track"}
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-[#1d1d1f] tracking-tight mt-1">
              {selectedItem.submission.title}
            </h1>
            <p className="text-xs font-bold text-[#6e6e73] mt-1">
              Team: {selectedItem.submission.teamName}
            </p>
          </div>

          <div className="p-4 rounded-card bg-gradient-to-br from-[#ff0055]/10 to-purple-500/10 border border-white text-center shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6e6e73]">
              Weighted Total
            </span>
            <div className="text-2xl font-black text-[#ff0055]">
              {weightedTotal.toFixed(1)} / {maxPossibleWeighted.toFixed(1)}
            </div>
            <span className="text-[10px] font-bold text-[#6e6e73]">
              ({percentageScore.toFixed(0)}% of maximum)
            </span>
          </div>
        </div>

        {/* Links */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-black/5">
          {selectedItem.submission.repositoryUrl && (
            <a href={selectedItem.submission.repositoryUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">Repository ↗</Button>
            </a>
          )}
          {selectedItem.submission.demoUrl && (
            <a href={selectedItem.submission.demoUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">Live Demo ↗</Button>
            </a>
          )}
          {selectedItem.submission.videoUrl && (
            <a href={selectedItem.submission.videoUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">Video Pitch ↗</Button>
            </a>
          )}
        </div>
      </GlassCard>

      {/* Rubric banners */}
      {rubricData?.isDefault && (
        <div className="p-4 rounded-card bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-xs text-amber-900 font-medium">
          <span className="text-base" aria-hidden="true">ℹ️</span>
          <span>This event uses the Default Rubric. Your organizer may update this before judging opens.</span>
        </div>
      )}
      {!weightValid && (
        <div className="p-4 rounded-card bg-[#e63946]/10 border border-[#e63946]/30 flex items-center gap-3 text-xs text-[#a3262f] font-medium">
          <span className="text-base" aria-hidden="true">⚠️</span>
          <span>
            This rubric&apos;s weights sum to {Number(rubricData?.weightSum ?? 0).toFixed(2)}, not 1.00.
            Weighted totals are approximate until the organizer fixes it.
          </span>
        </div>
      )}

      {/* Description */}
      <GlassCard className="p-6">
        <h2 className="text-sm font-bold text-[#1d1d1f] mb-2">Project Overview</h2>
        <p className="text-xs text-[#6e6e73] leading-relaxed whitespace-pre-line">
          {selectedItem.submission.description}
        </p>
      </GlassCard>

      {/* Rubric Criteria Scoring Form */}
      <GlassCard className="p-6 sm:p-8 flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-[#1d1d1f]">Rubric evaluation</h2>
          <span className="text-[11px] text-[#6e6e73]">
            Drafts autosave locally as you move the sliders.
          </span>
        </div>

        <div className="flex flex-col gap-6">
          {sortedRubric.map((criterion: any) => {
            const currentScore = scoreFor(criterion);
            return (
              <div
                key={criterion._id}
                className="p-4 rounded-input bg-white/60 border border-white flex flex-col gap-3"
              >
                <div className="flex justify-between items-center text-xs gap-3">
                  <div>
                    <label
                      htmlFor={`criterion-${criterion._id}`}
                      className="font-bold text-[#1d1d1f]"
                    >
                      {criterion.name}
                    </label>
                    <span className="ml-2 text-[10px] font-bold text-[#6e6e73]">
                      ({Math.round(criterion.weight * 100)}% weight)
                    </span>
                  </div>
                  <span className="font-bold text-sm text-[#1d1d1f] shrink-0">
                    {currentScore} / {criterion.maxScore}
                  </span>
                </div>

                <p className="text-[11px] text-[#6e6e73]">{criterion.description}</p>

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
                  className="w-full accent-[#ff0055] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            );
          })}
        </div>

        {/* Private Notes */}
        <div className="flex flex-col gap-1.5 mt-2">
          <label htmlFor="judge-private-notes" className="text-xs font-semibold text-[#1d1d1f]">
            Private notes for the organizer
          </label>
          <textarea
            id="judge-private-notes"
            rows={3}
            value={notes}
            disabled={locked}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional private observations or feedback..."
            className="w-full p-3 text-xs rounded-input text-[#1d1d1f] bg-white/50 border border-white/80 focus-ring-accent disabled:opacity-60"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-4 pt-4 border-t border-black/5">
          <Button
            variant="primary"
            size="md"
            isLoading={busy}
            disabled={locked}
            onClick={handleSaveScores}
            className="w-full"
          >
            {locked ? "Score locked" : "Submit & lock score"}
          </Button>
        </div>
        {!locked && (
          <p className="text-[10px] text-[#6e6e73] text-center -mt-2">
            Submitting locks the score. It cannot be edited afterwards.
          </p>
        )}
      </GlassCard>
    </div>
  );
}
