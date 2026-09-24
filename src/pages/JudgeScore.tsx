import React, { useState, useMemo } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { humanizeConvexError } from "@/lib/errors";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { SkeletonCard } from "@/components/ui/SkeletonCard";

export default function JudgeScore() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const { id } = useParams<{ id: string }>();

  const queue = useQuery(api.judging.myQueue, skip ? "skip" : {});

  const item = queue?.items.find(
    (candidate: any) => String(candidate.assignmentId) === String(id)
  );

  const eventId = item?.eventId;
  const rubricData = useQuery(
    api.judging.getRubric,
    skip || !eventId ? "skip" : { eventId: eventId as never }
  );
  const rubric = useQuery(
    api.judging.rubricForEvent,
    skip || !eventId ? "skip" : { eventId: eventId as never }
  );
  const submitScores = useMutation(api.judging.submitScores);

  const sortedRubric = useMemo(
    () => [...(rubric ?? [])].sort((a: any, b: any) => a.sortOrder - b.sortOrder),
    [rubric]
  );

  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  if (!queue || (item && !rubric)) {
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

  // Calculate live weighted score
  let weightedTotal = 0;
  let maxPossibleWeighted = 0;
  sortedRubric.forEach((criterion: any) => {
    const currentScore =
      scores[criterion._id] ??
      selectedItem.scoredCriteria.find((s: any) => s.criterionId === criterion._id)?.score ??
      criterion.minScore;
    weightedTotal += currentScore * criterion.weight;
    maxPossibleWeighted += criterion.maxScore * criterion.weight;
  });

  const percentageScore = maxPossibleWeighted > 0 ? (weightedTotal / maxPossibleWeighted) * 100 : 0;

  async function handleSaveScores() {
    setBusy(true);
    try {
      await submitScores({
        assignmentId: selectedItem.assignmentId as never,
        scores: sortedRubric.map((c: any) => ({
          criterionId: c._id as never,
          score:
            scores[c._id] ??
            selectedItem.scoredCriteria.find((s: any) => s.criterionId === c._id)?.score ??
            c.minScore,
        })),
        privateNotes: notes,
      });
      toast.success("Scores submitted successfully!");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-6">
      <Link to="/judge">
        <span className="text-xs font-semibold text-[#ff0055] hover:underline">
          ← Back to Judge Portal Queue
        </span>
      </Link>

      {/* Summary Header Card */}
      <GlassCard className="p-8">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
              {(selectedItem.submission as any).trackName || "General Track"}
            </span>
            <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-1">
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
              ({percentageScore.toFixed(0)}%)
            </span>
          </div>
        </div>

        {/* Links */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-black/5">
          {selectedItem.submission.repositoryUrl && (
            <a href={selectedItem.submission.repositoryUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">
                Repository ↗
              </Button>
            </a>
          )}
          {selectedItem.submission.demoUrl && (
            <a href={selectedItem.submission.demoUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">
                Live Demo ↗
              </Button>
            </a>
          )}
          {selectedItem.submission.videoUrl && (
            <a href={selectedItem.submission.videoUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">
                Video Pitch ↗
              </Button>
            </a>
          )}
        </div>
      </GlassCard>

      {/* Default Rubric Banner */}
      {rubricData?.isDefault && (
        <div className="p-4 rounded-card bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-xs text-amber-900 font-medium">
          <span className="text-base">ℹ️</span>
          <span>
            This event uses the Default Rubric. Your organizer may update this later.
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
      <GlassCard className="p-8 flex flex-col gap-6">
        <h2 className="text-lg font-bold text-[#1d1d1f]">Rubric Evaluation</h2>

        <div className="flex flex-col gap-6">
          {sortedRubric.map((criterion: any) => {
            const currentScore =
              scores[criterion._id] ??
              selectedItem.scoredCriteria.find((s: any) => s.criterionId === criterion._id)?.score ??
              Math.ceil((criterion.minScore + criterion.maxScore) / 2);

            return (
              <div
                key={criterion._id}
                className="p-4 rounded-input bg-white/60 border border-white flex flex-col gap-3"
              >
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-[#1d1d1f]">{criterion.name}</span>
                    <span className="ml-2 text-[10px] font-bold text-[#ff0055]">
                      ({Math.round(criterion.weight * 100)}% Weight)
                    </span>
                  </div>
                  <span className="font-bold text-sm text-[#1d1d1f]">
                    {currentScore} / {criterion.maxScore}
                  </span>
                </div>

                <p className="text-[11px] text-[#6e6e73]">{criterion.description}</p>

                <input
                  type="range"
                  min={criterion.minScore}
                  max={criterion.maxScore}
                  step={0.5}
                  value={currentScore}
                  disabled={selectedItem.locked}
                  onChange={(e) =>
                    setScores({ ...scores, [criterion._id]: Number(e.target.value) })
                  }
                  className="w-full accent-[#ff0055] cursor-pointer"
                />
              </div>
            );
          })}
        </div>

        {/* Private Notes */}
        <div className="flex flex-col gap-1.5 mt-2">
          <label className="text-xs font-semibold text-[#1d1d1f]">Private Notes for Organizer</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional private observations or feedback..."
            className="w-full p-3 text-xs rounded-input text-[#1d1d1f] bg-white/50 border border-white/80 focus-ring-accent"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-4 pt-4 border-t border-black/5">
          <Button
            variant="primary"
            size="md"
            isLoading={busy}
            disabled={selectedItem.locked}
            onClick={handleSaveScores}
            className="w-full"
          >
            {selectedItem.status === "completed" ? "Update Submitted Scores" : "Submit Score"}
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
