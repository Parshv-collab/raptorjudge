import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { SkeletonCard } from "@/components/ui/SkeletonCard";

export default function JudgePairwise() {
  const event = useQuery(api.events.getBySlug, { slug: "dogfood-2026" });
  const pair = useQuery(api.pairwise.nextPair, event ? { eventId: event._id } : "skip");
  const submitMatch = useMutation(api.pairwise.submitMatch);

  const [busy, setBusy] = useState(false);

  if (!event) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4 flex flex-col gap-6">
        <SkeletonCard lines={4} />
      </div>
    );
  }

  async function handleSelectWinner(winnerId?: string) {
    if (!pair || !event) return;
    setBusy(true);
    try {
      await submitMatch({
        eventId: event._id,
        submissionAId: pair.a.id as never,
        submissionBId: pair.b.id as never,
        winnerId: (winnerId || undefined) as never,
      });
      toast.success("Match submitted!");
    } catch (e: any) {
      toast.error(e.message || "Failed to submit comparison");
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

      <div className="flex justify-between items-center">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
            Bradley-Terry Pairwise
          </span>
          <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-0.5">
            Head-to-Head Comparison
          </h1>
        </div>
      </div>

      {!pair ? (
        <GlassCard className="p-8 text-center">
          <h3 className="text-base font-bold text-[#1d1d1f] mb-1">
            No Active Pairwise Comparison
          </h3>
          <p className="text-xs text-[#6e6e73]">
            There are no available pair comparisons at this time or insufficient submitted projects.
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

              <div className="mt-6 pt-4 border-t border-black/5 flex flex-col gap-2">
                <Button
                  variant="primary"
                  size="md"
                  isLoading={busy}
                  onClick={() => handleSelectWinner(pair.a.id)}
                  className="w-full"
                >
                  Select Project A as Winner
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

              <div className="mt-6 pt-4 border-t border-black/5 flex flex-col gap-2">
                <Button
                  variant="primary"
                  size="md"
                  isLoading={busy}
                  onClick={() => handleSelectWinner(pair.b.id)}
                  className="w-full"
                >
                  Select Project B as Winner
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
              Declare Tie / Equal Performance
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
