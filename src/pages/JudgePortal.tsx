import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { EmptyState } from "@/components/ui/EmptyState";

export default function JudgePortal() {
  const event = useQuery(api.events.getBySlug, { slug: "dogfood-2026" });
  const queue = useQuery(api.judging.myQueue, event ? { eventId: event._id } : "skip");

  if (!event || !queue) {
    return (
      <div className="py-20 text-center animate-pulse text-xs text-[#6e6e73]">
        Loading judge portal...
      </div>
    );
  }

  const items = queue.items || [];
  const completed = items.filter((i: any) => i.status === "completed").length;
  const total = items.length;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-8">
      {/* Header with Progress Bar */}
      <GlassCard className="p-8 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
              Judging Dashboard
            </span>
            <h1 className="text-3xl font-black text-[#1d1d1f] tracking-tight mt-0.5">
              Judge Portal
            </h1>
          </div>

          <Link to="/judge/pairwise">
            <Button variant="secondary" size="sm">
              Pairwise Comparisons ↗
            </Button>
          </Link>
        </div>

        {/* Progress Bar */}
        <div className="mt-2">
          <ProgressBar
            value={completed}
            max={total || 1}
            showLabel
            label={`${completed} of ${total} Scored`}
          />
        </div>

        {!queue.judgingOpen && (
          <div className="p-3 rounded-input bg-amber-500/10 border border-amber-500/30 text-amber-900 text-xs font-semibold mt-2">
            Note: Judging stage is not active yet (Event status: {event.status}).
          </div>
        )}
      </GlassCard>

      {/* Assigned Queue List */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-[#1d1d1f]">Assigned Queue</h2>

        {items.length === 0 ? (
          <EmptyState
            title="No Assignments Yet"
            description="You currently have no project submissions assigned to score. Ask the organizer to run auto-assignment."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item: any) => {
              const isDone = item.status === "completed";
              return (
                <GlassCard
                  key={item.assignmentId}
                  hoverEffect
                  className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        isDone ? "bg-emerald-500" : "bg-[#ff0055]"
                      }`}
                    />
                    <div>
                      <h3 className="text-sm font-bold text-[#1d1d1f]">
                        {item.submission.title}
                      </h3>
                      <p className="text-xs text-[#6e6e73] mt-0.5">
                        Team: {item.submission.teamName} · Track: {item.submission.trackName || "General"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
                    <span
                      className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${
                        isDone
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-[#ff0055]/10 text-[#ff0055]"
                      }`}
                    >
                      {isDone ? "Scored ✓" : "Pending"}
                    </span>

                    <Link to={`/judge/score/${item.assignmentId}`}>
                      <Button variant={isDone ? "secondary" : "primary"} size="sm">
                        {isDone ? "Edit Score" : "Score Project →"}
                      </Button>
                    </Link>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
