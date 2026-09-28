import { useParams, Link, Navigate } from "react-router-dom";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { EventPicker } from "@/components/participant/EventPicker";
import { usePrimaryEventSlug } from "@/lib/featuredEvent";
import { Trophy, Medal } from "lucide-react";

/**
 * Participant results experience (issue 23.2): podium + full ranking.
 *
 * Everything sensitive is decided server-side — `submissions.publicGallery`
 * only attaches `rank` / `isWinner` once the event publishes, so before that
 * this page shows an explicit "not published yet" state instead of leaking
 * standings.
 */
export default function Results() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { slug } = useParams<{ slug: string }>();
  const fallbackSlug = usePrimaryEventSlug();
  const eventSlug = slug ?? fallbackSlug;

  const event = useQuery(api.events.getBySlug, authLoading || !isAuthenticated || !eventSlug ? "skip" : { slug: eventSlug });
  const gallery = useQuery(
    api.submissions.publicGallery,
    event ? { eventId: event._id } : "skip",
  );
  const me = useQuery(api.users.me, authLoading || !isAuthenticated ? "skip" : {});
  // Issue 40: results are per event — offer the participant's enrollments.
  const enrolled = useQuery(api.events.enrolled, authLoading || !isAuthenticated ? "skip" : {});
  // “Own project highlighted”: resolve this user's team + submission for this
  // event. Null when they never participated — the table simply renders
  // unhighlighted then.
  const mySubmission = useQuery(
    api.submissions.mySubmission,
    event ? { eventId: event._id } : "skip",
  );

  if (authLoading || (isAuthenticated && (event === undefined || me === undefined))) {
    return (
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={8} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={`/auth?returnTo=${encodeURIComponent(`/results/${eventSlug}`)}`} replace />;
  }

  if (!event) {
    return (
      <div className="max-w-4xl mx-auto">
        <EmptyState
          title="Event not found"
          description="This results page points at an event that doesn't exist or hasn't been announced."
          actionLabel="Back to gallery"
          onAction={() => {
            window.location.href = `/gallery/${fallbackSlug}`;
          }}
        />
      </div>
    );
  }

  const published = event.status === "published" || event.status === "archived";
  const projects = (gallery ?? []) as any[];
  const mySubmissionId = mySubmission?.submission ? String(mySubmission.submission._id) : null;

  const podium = projects.filter((p) => p.rank === 1 || p.rank === 2 || p.rank === 3);
  const rest = projects.filter((p) => p.rank > 3);

  const podiumMeta = [
    { rank: 2, label: "2nd", size: "md" as const },
    { rank: 1, label: "1st", size: "lg" as const },
    { rank: 3, label: "3rd", size: "md" as const },
  ];

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-8">
      <Link
        to={`/gallery/${event.slug}`}
        className="text-sm text-accent hover:text-accent-hover transition-colors duration-fast self-start"
      >
        ← Back to {event.title} gallery
      </Link>

      <EventPicker
        events={((enrolled ?? []) as any[]).map((e) => ({ slug: e.slug, title: e.title, status: e.status }))}
        value={event.slug}
        variant="path"
        basePath="/results"
      />

      <PageHeader
        title={`${event.title} results`}
        description={published ? "Final ranking — normalized scores and pairwise wins, published by the organizers." : "Results are not published yet."}
        bordered={false}
      />

      {!published ? (
        <EmptyState
          icon={<Trophy />}
          title="Results are not published yet"
          description="Rankings stay hidden until the organizers publish. You'll get a notification in the bell when they go live."
        />
      ) : projects.length === 0 ? (
        <EmptyState
          title="No ranked projects"
          description="The event published without any scored submissions on record."
        />
      ) : (
        <>
          {/* Podium: 2 · 1 · 3 */}
          <section aria-label="Podium" className="flex flex-wrap items-end justify-center gap-4 pt-4">
            {podiumMeta.map(({ rank, label, size }) => {
              const project = podium.find((p) => p.rank === rank);
              if (!project) return null;
              const isMine = mySubmissionId === project.id;
              return (
                <Link
                  key={rank}
                  to={`/project/${project.id}`}
                  className={`group flex flex-col items-center gap-2 rounded-card border transition-colors duration-fast ${
                    size === "lg"
                      ? "order-2 w-full sm:w-64 p-7 bg-accent/5 border-accent/40"
                      : "order-1 sm:order-none w-full sm:w-52 p-5 bg-surface-1 border-line"
                  } group-hover:border-accent/40 ${isMine ? "ring-1 ring-accent" : ""}`}
                >
                  <Medal size={size === "lg" ? 28 : 22} className={rank === 1 ? "text-accent" : "text-muted"} aria-hidden="true" />
                  <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{label} place</span>
                  <h3 className={`font-semibold text-primary text-center ${size === "lg" ? "text-h3" : "text-[15px]"}`}>
                    {project.title}
                  </h3>
                  <p className="text-[13px] text-secondary">{project.teamName}</p>
                  {isMine && <Badge variant="accent">Your project</Badge>}
                </Link>
              );
            })}
          </section>

          {/* Full ranking */}
          <section className="flex flex-col gap-3">
            <h2 className="text-h3 text-primary">Full ranking</h2>
            <div className="overflow-x-auto border border-line rounded-card bg-surface-1">
              <table className="w-full text-left text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-5 h-11 text-[12px] font-medium uppercase tracking-[0.05em] text-muted">Rank</th>
                    <th className="px-5 h-11 text-[12px] font-medium uppercase tracking-[0.05em] text-muted">Project</th>
                    <th className="px-5 h-11 text-[12px] font-medium uppercase tracking-[0.05em] text-muted">Team</th>
                    <th className="px-5 h-11 text-[12px] font-medium uppercase tracking-[0.05em] text-muted">Track</th>
                    <th className="px-5 h-11 text-right text-[12px] font-medium uppercase tracking-[0.05em] text-muted">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {[...podium, ...rest]
                    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
                    .map((p) => {
                      const isMine = mySubmissionId === p.id;
                      return (
                        <tr
                          key={p.id}
                          className={`border-b border-line last:border-0 transition-colors duration-fast hover:bg-surface-2 ${
                            isMine ? "bg-accent/5" : ""
                          }`}
                        >
                          <td className="px-5 h-12 font-semibold text-primary tnum">
                            {p.isWinner ? "🏆" : `#${p.rank}`}
                          </td>
                          <td className="px-5 h-12">
                            <Link
                              to={`/project/${p.id}`}
                              className={`font-medium transition-colors duration-fast hover:text-accent ${isMine ? "text-accent" : "text-primary"}`}
                            >
                              {p.title}
                            </Link>
                            {isMine && <span className="text-[11px] text-accent ml-2 uppercase tracking-[0.08em]">You</span>}
                          </td>
                          <td className="px-5 h-12 text-secondary">{p.teamName}</td>
                          <td className="px-5 h-12 text-secondary">{p.trackName}</td>
                          <td className="px-5 h-12 text-right tnum text-secondary">
                            {typeof p.rank === "number" && p.score !== undefined ? Number(p.score).toFixed(2) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
