import React from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatDate } from "@/lib/format";

export default function JudgePortal() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const [selectedEventId, setSelectedEventId] = React.useState("all");
  const [searchParams] = useSearchParams();
  // The sidebar's "My Scores" entry links here with ?view=scores: the same
  // queue, filtered to the assignments this judge has already submitted.
  const scoresOnly = searchParams.get("view") === "scores";

  const queue = useQuery(api.judging.myQueue, skip ? "skip" : {});
  const me = useQuery(api.users.me, skip ? "skip" : {});

  // The attestation is per event: prefer the explicit filter, else the first
  // event this judge actually has assignments in.
  const recordEventId = React.useMemo(() => {
    const items = ((queue as any)?.items ?? []) as any[];
    if (selectedEventId !== "all") return selectedEventId;
    return items.find((i: any) => i.eventId)?.eventId ?? null;
  }, [queue, selectedEventId]);

  const judgeRecord = useQuery(
    api.judging.judgeRecord,
    skip || !me?._id || !recordEventId
      ? "skip"
      : { eventId: recordEventId as never, judgeId: me._id as never },
  );
  const [copied, setCopied] = React.useState(false);

  if (authLoading) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (queue === undefined) {
    return (
      <div className="flex flex-col gap-6">
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

  const items = (selectedEventId === "all" ? allItems : allItems.filter((i: any) => i.eventId === selectedEventId)).filter(
    (i: any) => (scoresOnly ? i.status === "completed" : true),
  );

  const completed = items.filter((i: any) => i.status === "completed").length;
  const total = items.length;

  // Group items by event if multiple events exist and "all" filter selected
  const isMultiEvent = eventOptionsMap.size > 1;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title={scoresOnly ? "My scores" : "Judging queue"}
        description={
          scoresOnly
            ? "Every assignment you have already scored, with the score you submitted."
            : "Assigned projects, sorted by event. Score each one on the event rubric."
        }
        actions={
          <div className="flex items-center gap-3">
            {eventFilterOptions.length > 2 && (
              <div className="w-44">
                <Dropdown options={eventFilterOptions} value={selectedEventId} onChange={(v) => setSelectedEventId(v)} />
              </div>
            )}
            {scoresOnly ? (
              <Link to="/judge">
                <Button variant="secondary" size="sm">
                  Open queue →
                </Button>
              </Link>
            ) : (
              <Link to="/judge/pairwise">
                <Button variant="secondary" size="sm">
                  Pairwise →
                </Button>
              </Link>
            )}
          </div>
        }
      />

      {/* Progress */}
      <div className="bg-surface-1 border border-line rounded-card p-6">
        <ProgressBar value={completed} max={total || 1} showLabel label={`${completed} of ${total} scored`} />
      </div>

      {/* Signed attestation: the proof a judge can hand to anyone (a participant,
          a sponsor) without giving them an account on this deployment. */}
      {scoresOnly && judgeRecord && (
        <section className="bg-surface-1 border border-line rounded-card p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-h3 text-primary">Judging attestation</h2>
            <p className="text-[13px] text-secondary mt-0.5">
              A signed summary of the scores you submitted for {judgeRecord.eventName}. Verification is
              public — no account needed — and fails if a single character of the link is edited.
            </p>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13px]">
            {[
              { label: "Projects scored", value: String(judgeRecord.projectsScored) },
              { label: "Scores submitted", value: String(judgeRecord.totalScoresSubmitted) },
              {
                label: "Attested",
                value: judgeRecord.issuedAt
                  ? formatDate(judgeRecord.issuedAt)
                  : "—",
              },
              { label: "Signature", value: `${judgeRecord.signature.slice(0, 12)}…` },
            ].map((row) => (
              <div key={row.label} className="rounded-input bg-surface-2 border border-line px-3 py-2">
                <dt className="text-[11px] uppercase tracking-[0.08em] text-muted">{row.label}</dt>
                <dd className="text-primary tnum font-mono mt-0.5 truncate">{row.value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2">
            <Link to={judgeRecord.verificationUrl}>
              <Button variant="primary" size="sm">
                Open verification page →
              </Button>
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const url = `${window.location.origin}${judgeRecord.verificationUrl}`;
                navigator.clipboard?.writeText(url).then(
                  () => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  },
                  () => setCopied(false),
                );
              }}
            >
              {copied ? "Link copied" : "Copy verification link"}
            </Button>
          </div>
        </section>
      )}

      {/* Assigned queue */}
      <section className="flex flex-col gap-4">
        <h2 className="text-h3 text-primary">{scoresOnly ? "Submitted scores" : "Assigned projects"}</h2>

        {items.length === 0 ? (
          <EmptyState
            title={scoresOnly ? "No scores submitted yet" : "No assigned projects yet"}
            description={
              scoresOnly
                ? "Once you submit a score it appears here, and stays readable for the rest of the event."
                : "An organizer will assign projects to you. Check back once assignments are published."
            }
          />
        ) : (
          <div className="flex flex-col gap-8">
            {isMultiEvent && selectedEventId === "all" ? (
              Array.from(eventOptionsMap.entries()).map(([evtId, evtTitle]) => {
                const eventItems = items.filter((i: any) => i.eventId === evtId);
                if (eventItems.length === 0) return null;
                return (
                  <div key={evtId} className="flex flex-col gap-3">
                    <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted pb-2 border-b border-line">
                      {evtTitle}
                    </h3>
                    {eventItems.map(renderCard)}
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col gap-3">{items.map(renderCard)}</div>
            )}
          </div>
        )}
      </section>
    </div>
  );

  function renderCard(item: any) {
    const isDone = item.status === "completed";
    const assignmentId = item._id || item.assignmentId;
    const eventTitle = item.eventTitle || item.event?.title;
    const canScore = item.canScore;

    return (
      <div
        key={assignmentId}
        className="bg-surface-1 border border-line rounded-card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors duration-fast hover:border-line-strong"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <span
            aria-hidden="true"
            className={`w-2 h-2 rounded-pill shrink-0 ${isDone ? "bg-success" : canScore ? "bg-accent" : "bg-line-strong"}`}
          />
          <div className="min-w-0">
            {eventTitle && (
              <span className="text-[11px] uppercase tracking-[0.05em] text-muted">{eventTitle}</span>
            )}
            <h3 className="text-[15px] font-semibold text-primary truncate">{item.submission.title}</h3>
            <p className="text-[13px] text-secondary mt-0.5">
              Team: {item.teamName || item.submission.teamName} · Track: {item.submission.trackName || "General"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
          {isDone ? (
            <Badge variant="success">Scored</Badge>
          ) : canScore ? (
            <Badge variant="accent">Pending</Badge>
          ) : (
            <Badge variant="default">{item.judgingWindowLabel || "Closed"}</Badge>
          )}

          {canScore || isDone ? (
            <Link to={`/judge/score/${assignmentId}`}>
              <Button variant={isDone ? "secondary" : "primary"} size="sm">
                {isDone ? "View score" : "Score project"}
              </Button>
            </Link>
          ) : (
            <Button variant="secondary" size="sm" disabled title={item.judgingWindowLabel}>
              Score project
            </Button>
          )}
        </div>
      </div>
    );
  }
}
