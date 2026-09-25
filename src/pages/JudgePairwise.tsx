import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { humanizeConvexError } from "@/lib/errors";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { EmptyState } from "@/components/ui/EmptyState";

import { Dropdown } from "@/components/ui/Dropdown";

export default function JudgePairwise() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const [selectedEventId, setSelectedEventId] = useState<string>("");

  const queue = useQuery(api.judging.myQueue, skip ? "skip" : {});

  // Extract unique events
  const allItems = queue?.items || [];
  const eventOptionsMap = new Map<string, string>();
  allItems.forEach((i: any) => {
    if (i.eventId && i.eventTitle) {
      eventOptionsMap.set(i.eventId, i.eventTitle);
    }
  });

  const eventEntries = Array.from(eventOptionsMap.entries());
  const activeEventId = selectedEventId || (eventEntries[0]?.[0] ?? "");

  const pair = useQuery(
    api.pairwise.nextPair,
    skip || !activeEventId ? "skip" : { eventId: activeEventId as never }
  );
  const myMatches = useQuery(
    api.pairwise.myMatches,
    skip || !activeEventId ? "skip" : { eventId: activeEventId as never }
  );
  const submitMatch = useMutation(api.pairwise.submitMatch);

  const [busy, setBusy] = useState(false);

  if (authLoading) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4 flex flex-col gap-6">
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (queue === undefined) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4 flex flex-col gap-6">
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (allItems.length === 0) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4 flex flex-col gap-6">
        <Link to="/judge">
          <span className="text-xs font-semibold text-[#ff0055] hover:underline">
            ← Back to Judge Portal
          </span>
        </Link>
        <EmptyState
          title="No Assigned Projects"
          description="No projects assigned yet. Pairwise comparison becomes available once you have assigned projects."
        />
      </div>
    );
  }

  if (pair === undefined) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4 flex flex-col gap-6">
        <SkeletonCard lines={4} />
      </div>
    );
  }

  async function handleSelectWinner(winnerId?: string) {
    if (!pair || !activeEventId) return;
    setBusy(true);
    try {
      await submitMatch({
        eventId: activeEventId as never,
        submissionAId: pair.a.id as never,
        submissionBId: pair.b.id as never,
        winnerId: (winnerId || undefined) as never,
      });
      toast.success("Match submitted!");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 flex flex-col gap-6">
      <Link to="/judge">
        <span className="text-xs font-semibold text-[#ff0055] hover:underline">
          ← Back to Judge Portal
        </span>
      </Link>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
            Bradley-Terry Pairwise
          </span>
          <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-0.5">
            Head-to-Head Comparison
          </h1>
        </div>

        {eventEntries.length > 1 && (
          <div className="w-56">
            <Dropdown
              options={eventEntries.map(([id, title]) => ({ value: id, label: title }))}
              value={activeEventId}
              onChange={(v) => setSelectedEventId(v)}
            />
          </div>
        )}
      </div>

      {!pair ? (
        <GlassCard className="p-8 text-center">
          <h3 className="text-base font-bold text-[#1d1d1f] mb-1">
            No Active Pairwise Comparison
          </h3>
          <p className="text-xs text-[#6e6e73]">
            No pairwise comparisons available for this event yet.
          </p>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Project A */}
            <GlassCard className="p-6 flex flex-col justify-between border-2 border-transparent hover:border-[#ff0055]/30">
              <div className="flex flex-col gap-2">
                <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-[#ff0055]/10 text-[#ff0055] w-max">
                  Project A
                </span>
                <h2 className="text-xl font-black text-[#1d1d1f]">{pair.a.title}</h2>
                <p className="text-xs font-semibold text-[#6e6e73]">{pair.a.tagline}</p>
                <p className="text-xs text-[#1d1d1f] mt-2 line-clamp-6 leading-relaxed">
                  {pair.a.description}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-black/5 flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {pair.a.repositoryUrl && (
                    <a href={pair.a.repositoryUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="secondary" size="sm">Repository ↗</Button>
                    </a>
                  )}
                  {pair.a.demoUrl && (
                    <a href={pair.a.demoUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="secondary" size="sm">Live Demo ↗</Button>
                    </a>
                  )}
                  {pair.a.videoUrl && (
                    <a href={pair.a.videoUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="secondary" size="sm">Video ↗</Button>
                    </a>
                  )}
                </div>
                <Button
                  variant="primary"
                  size="md"
                  isLoading={busy}
                  onClick={() => handleSelectWinner(pair.a.id)}
                  className="w-full"
                >
                  Select Project A as winner
                </Button>
              </div>
            </GlassCard>

            {/* Project B */}
            <GlassCard className="p-6 flex flex-col justify-between border-2 border-transparent hover:border-[#ff0055]/30">
              <div className="flex flex-col gap-2">
                <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-[#ff0055]/10 text-[#ff0055] w-max">
                  Project B
                </span>
                <h2 className="text-xl font-black text-[#1d1d1f]">{pair.b.title}</h2>
                <p className="text-xs font-semibold text-[#6e6e73]">{pair.b.tagline}</p>
                <p className="text-xs text-[#1d1d1f] mt-2 line-clamp-6 leading-relaxed">
                  {pair.b.description}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-black/5 flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {pair.b.repositoryUrl && (
                    <a href={pair.b.repositoryUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="secondary" size="sm">Repository ↗</Button>
                    </a>
                  )}
                  {pair.b.demoUrl && (
                    <a href={pair.b.demoUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="secondary" size="sm">Live Demo ↗</Button>
                    </a>
                  )}
                  {pair.b.videoUrl && (
                    <a href={pair.b.videoUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="secondary" size="sm">Video ↗</Button>
                    </a>
                  )}
                </div>
                <Button
                  variant="primary"
                  size="md"
                  isLoading={busy}
                  onClick={() => handleSelectWinner(pair.b.id)}
                  className="w-full"
                >
                  Select Project B as winner
                </Button>
              </div>
            </GlassCard>
          </div>

          <div className="flex justify-center">
            <Button
              variant="secondary"
              size="md"
              isLoading={busy}
              onClick={() => handleSelectWinner(undefined)}
            >
              Declare tie / equal performance
            </Button>
          </div>

          <p className="text-[11px] text-[#6e6e73] text-center">
            {myMatches?.length ?? 0} comparison{(myMatches?.length ?? 0) === 1 ? "" : "s"} recorded
            by you in this event. Every vote updates the Bradley-Terry ranking the organizer sees.
          </p>

          {(myMatches?.length ?? 0) > 0 && (
            <GlassCard className="p-5">
              <h3 className="text-sm font-bold text-[#1d1d1f] mb-3">Your recent comparisons</h3>
              <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                {(myMatches || []).slice(0, 12).map((m: any) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center gap-2 text-xs p-2 rounded-input bg-white/60 border border-white"
                  >
                    <span className="text-[#1d1d1f] truncate">{m.a}</span>
                    <span className="text-[#6e6e73]">vs</span>
                    <span className="text-[#1d1d1f] truncate">{m.b}</span>
                    <span className="ml-auto font-semibold text-[#ff0055] truncate max-w-[45%]">
                      {m.winner}
                    </span>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      )}
    </div>
  );
}
