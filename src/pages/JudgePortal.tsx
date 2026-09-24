import React from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/SkeletonCard";

import { Dropdown } from "@/components/ui/Dropdown";

export default function JudgePortal() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const [selectedEventId, setSelectedEventId] = React.useState("all");

  const queue = useQuery(api.judging.myQueue, skip ? "skip" : {});

  if (authLoading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-6">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (queue === undefined) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-6">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  const allItems = queue.items || [];

  // Derive unique events
  const eventOptionsMap = new Map<string, string>();
  allItems.forEach((i: any) => {
    if (i.eventId && i.eventTitle) {
      eventOptionsMap.set(i.eventId, i.eventTitle);
    }
  });

  const eventFilterOptions = [
    { value: "all", label: "All Events" },
    ...Array.from(eventOptionsMap.entries()).map(([id, title]) => ({
      value: id,
      label: title,
    })),
  ];

  const items = selectedEventId === "all"
    ? allItems
    : allItems.filter((i: any) => i.eventId === selectedEventId);

  const completed = items.filter((i: any) => i.status === "completed").length;
  const total = items.length;

  // Group items by event if multiple events exist and "all" filter selected
  const isMultiEvent = eventOptionsMap.size > 1;

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

          <div className="flex items-center gap-3">
            {eventFilterOptions.length > 2 && (
              <div className="w-44">
                <Dropdown
                  options={eventFilterOptions}
                  value={selectedEventId}
                  onChange={(v) => setSelectedEventId(v)}
                />
              </div>
            )}
            <Link to="/judge/pairwise">
              <Button variant="secondary" size="sm">
                Pairwise Comparisons ↗
              </Button>
            </Link>
          </div>
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
      </GlassCard>

      {/* Assigned Queue List */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-[#1d1d1f]">Assigned Queue</h2>

        {items.length === 0 ? (
          <EmptyState
            title="You have no assigned projects yet"
            description="You have no assigned projects yet. An organizer will assign projects to you."
          />
        ) : (
          <div className="flex flex-col gap-6">
            {isMultiEvent && selectedEventId === "all" ? (
              Array.from(eventOptionsMap.entries()).map(([evtId, evtTitle]) => {
                const eventItems = items.filter((i: any) => i.eventId === evtId);
                if (eventItems.length === 0) return null;
                return (
                  <div key={evtId} className="flex flex-col gap-3">
                    <div className="px-1 pt-2 border-b border-black/5 pb-1">
                      <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#ff0055]">
                        {evtTitle}
                      </h3>
                    </div>
                    {eventItems.map(renderCard)}
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col gap-3">{items.map(renderCard)}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  function renderCard(item: any) {
    const isDone = item.status === "completed";
    const assignmentId = item._id || item.assignmentId;
    const eventTitle = item.eventTitle || item.event?.title;
    const canScore = item.canScore;

    return (
      <GlassCard
        key={assignmentId}
        hoverEffect
        className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${
              isDone ? "bg-emerald-500" : canScore ? "bg-[#ff0055]" : "bg-gray-400"
            }`}
          />
          <div>
            {eventTitle && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6e6e73]">
                {eventTitle}
              </span>
            )}
            <h3 className="text-sm font-bold text-[#1d1d1f]">
              {item.submission.title}
            </h3>
            <p className="text-xs text-[#6e6e73] mt-0.5">
              Team: {item.teamName || item.submission.teamName} · Track: {item.submission.trackName || "General"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
          <span
            className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${
              isDone
                ? "bg-emerald-500/10 text-emerald-600"
                : canScore
                ? "bg-[#ff0055]/10 text-[#ff0055]"
                : "bg-gray-200 text-gray-600"
            }`}
          >
            {isDone ? "Scored ✓" : canScore ? "Pending" : item.judgingWindowLabel || "Closed"}
          </span>

          {canScore || isDone ? (
            <Link to={`/judge/score/${assignmentId}`}>
              <Button variant={isDone ? "secondary" : "primary"} size="sm">
                {isDone ? "View score" : "Score Project →"}
              </Button>
            </Link>
          ) : (
            <Button variant="secondary" size="sm" disabled title={item.judgingWindowLabel}>
              Score Project
            </Button>
          )}
        </div>
      </GlassCard>
    );
  }
}
