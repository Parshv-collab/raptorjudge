import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { humanizeConvexError } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { PageHeader } from "@/components/ui/PageHeader";

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
      <div className="flex flex-col gap-6">
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (queue === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (allItems.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Link to="/judge" className="text-sm text-accent hover:text-accent-hover self-start">
          ← Back to queue
        </Link>
        <EmptyState
          title="No assigned projects"
          description="Pairwise comparison becomes available once you have assigned projects."
        />
      </div>
    );
  }

  if (pair === undefined) {
    return (
      <div className="flex flex-col gap-6">
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
      toast.success("Match recorded");
    } catch (e: any) {
      toast.error(humanizeConvexError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Head-to-head comparison"
        description="Bradley–Terry pairwise: pick the stronger project. Every vote updates the global ranking."
        actions={
          <div className="flex items-center gap-3">
            <Link to="/judge" className="text-sm text-accent hover:text-accent-hover">
              ← Queue
            </Link>
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
        }
      />

      {!pair ? (
        <EmptyState
          title="No active pairwise comparison"
          description="No pairwise comparisons available for this event yet."
        />
      ) : (
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Project A */}
            <div className="bg-surface-1 border border-line rounded-card p-6 flex flex-col justify-between transition-colors duration-fast hover:border-line-strong">
              <div className="flex flex-col gap-2">
                <Badge variant="accent" className="w-max">Project A</Badge>
                <h2 className="text-h2 text-primary">{pair.a.title}</h2>
                <p className="text-[13px] font-medium text-secondary">{pair.a.tagline}</p>
                <p className="text-[13px] text-primary mt-2 line-clamp-6 leading-relaxed">{pair.a.description}</p>
              </div>

              <div className="mt-6 pt-4 border-t border-line flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {pair.a.repositoryUrl && (
                    <a href={pair.a.repositoryUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="secondary" size="sm">Repository ↗</Button>
                    </a>
                  )}
                  {pair.a.demoUrl && (
                    <a href={pair.a.demoUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="secondary" size="sm">Live demo ↗</Button>
                    </a>
                  )}
                  {pair.a.videoUrl && (
                    <a href={pair.a.videoUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="secondary" size="sm">Video ↗</Button>
                    </a>
                  )}
                </div>
                <Button variant="primary" size="md" isLoading={busy} onClick={() => handleSelectWinner(pair.a.id)} className="w-full">
                  Pick A as winner
                </Button>
              </div>
            </div>

            {/* Project B */}
            <div className="bg-surface-1 border border-line rounded-card p-6 flex flex-col justify-between transition-colors duration-fast hover:border-line-strong">
              <div className="flex flex-col gap-2">
                <Badge variant="accent" className="w-max">Project B</Badge>
                <h2 className="text-h2 text-primary">{pair.b.title}</h2>
                <p className="text-[13px] font-medium text-secondary">{pair.b.tagline}</p>
                <p className="text-[13px] text-primary mt-2 line-clamp-6 leading-relaxed">{pair.b.description}</p>
              </div>

              <div className="mt-6 pt-4 border-t border-line flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {pair.b.repositoryUrl && (
                    <a href={pair.b.repositoryUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="secondary" size="sm">Repository ↗</Button>
                    </a>
                  )}
                  {pair.b.demoUrl && (
                    <a href={pair.b.demoUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="secondary" size="sm">Live demo ↗</Button>
                    </a>
                  )}
                  {pair.b.videoUrl && (
                    <a href={pair.b.videoUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="secondary" size="sm">Video ↗</Button>
                    </a>
                  )}
                </div>
                <Button variant="primary" size="md" isLoading={busy} onClick={() => handleSelectWinner(pair.b.id)} className="w-full">
                  Pick B as winner
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <Button variant="secondary" size="md" isLoading={busy} onClick={() => handleSelectWinner(undefined)}>
              Declare tie — equal performance
            </Button>
          </div>

          <p className="text-[13px] text-muted text-center tnum">
            {myMatches?.length ?? 0} comparison{(myMatches?.length ?? 0) === 1 ? "" : "s"} recorded by you in this event.
          </p>

          {(myMatches?.length ?? 0) > 0 && (
            <div className="bg-surface-1 border border-line rounded-card p-5">
              <h3 className="text-[15px] font-semibold text-primary mb-3">Your recent comparisons</h3>
              <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                {(myMatches || []).slice(0, 12).map((m: any) => (
                  <div key={m.id} className="flex flex-wrap items-center gap-2 text-[13px] p-2.5 rounded-btn bg-surface-2 border border-line">
                    <span className="text-primary truncate">{m.a}</span>
                    <span className="text-muted">vs</span>
                    <span className="text-primary truncate">{m.b}</span>
                    <span className="ml-auto font-medium text-accent truncate max-w-[45%]">{m.winner}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
