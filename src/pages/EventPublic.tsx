import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { Markdown } from "@/components/ui/Markdown";
import { deriveEventStatus, nextDeadline } from "@/lib/eventStatus";
import { formatDate, formatDateTime } from "@/lib/format";

/**
 * Stage → the one action worth doing on this event right now (issues 53/54).
 *
 * The page used to derive its call to action from sign-in state alone, so a
 * voting-stage event offered "Registration closed" — technically true, useless,
 * and a dead end with no route to the ballot. The stage is what decides the
 * primary action; the sidebar keeps the membership-aware version.
 */
const STAGE_ACTIONS: Record<string, { label: string; to: (slug: string) => string }> = {
  registration: { label: "Register", to: (s) => `/workspace?event=${s}` },
  hacking: { label: "Submit project", to: (s) => `/workspace?event=${s}` },
  judging: { label: "View gallery", to: (s) => `/gallery/${s}` },
  voting: { label: "Vote now", to: (s) => `/gallery/${s}` },
  published: { label: "View results", to: (s) => `/results/${s}` },
  archived: { label: "View results", to: (s) => `/results/${s}` },
  closed: { label: "View gallery", to: (s) => `/gallery/${s}` },
};

/** Accent tint per stage, so the hero reads at a glance (issue 54). */
const STAGE_ACCENT: Record<string, string> = {
  registration: "from-accent/12 via-surface-1 to-surface-1",
  hacking: "from-accent/12 via-surface-1 to-surface-1",
  voting: "from-accent/18 via-surface-1 to-surface-1",
  judging: "from-surface-2 via-surface-1 to-surface-1",
  published: "from-accent/20 via-surface-1 to-surface-1",
  archived: "from-surface-2 via-surface-1 to-surface-1",
  closed: "from-surface-2 via-surface-1 to-surface-1",
};

const FAQ_ITEMS = [
  {
    q: "Who can participate?",
    a: "Anyone! Students, professional developers, designers, and enthusiasts are all welcome.",
  },
  {
    q: "What is the maximum team size?",
    a: "Teams can have up to 4 members. Solo participation is also supported.",
  },
  {
    q: "How does judging work?",
    a: "Submissions are auto-assigned to judges and scored on weighted rubric criteria. Scores are normalized to ensure zero bias.",
  },
  {
    q: "Are late submissions allowed?",
    a: "No. All submissions must be submitted before the exact submission deadline.",
  },
];

export default function EventPublic() {
  const { slug } = useParams<{ slug: string }>();
  const { isAuthenticated, isLoading } = useConvexAuth();

  const event = useQuery(api.events.getBySlug, slug ? { slug } : "skip");
  const tracks = useQuery(api.tracks.listByEvent, event ? { eventId: event._id } : "skip");
  const rubric = useQuery(api.judging.rubricForEvent, event ? { eventId: event._id } : "skip");
  const myTeams = useQuery(api.teams.myTeams, isAuthenticated ? {} : "skip");

  const [openFaq, setOpenFaq] = useState<number | null>(null);

  if (event === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonCard lines={2} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <SkeletonCard lines={4} />
            <SkeletonCard lines={3} />
          </div>
          <div className="lg:col-span-1">
            <SkeletonCard lines={3} />
          </div>
        </div>
      </div>
    );
  }

  if (event === null) {
    return (
      <div className="py-16 text-center flex flex-col items-center gap-3">
        <h1 className="text-h2 text-primary">Event not found</h1>
        <p className="text-sm text-secondary">This event does not exist or is not public.</p>
        <Link to="/events" className="text-sm text-accent hover:text-accent-hover mt-2">
          Browse events →
        </Link>
      </div>
    );
  }

  const now = Date.now();
  const statusInfo = deriveEventStatus(event, now);
  const isJoined = myTeams?.some((t) => t.eventId === event._id);
  const stage = event.status as string;

  /**
   * The primary action for the event's *stage* (issue 53/54). It sits in the
   * hero, top right, above the fold, so nobody has to read a page to find out
   * what they are supposed to do here.
   */
  const stageAction = STAGE_ACTIONS[stage] ?? { label: "View gallery", to: (s: string) => `/gallery/${s}` };
  const heroCta = (
    <Link to={stageAction.to(event.slug)} className="shrink-0">
      <Button variant="primary" size="md">
        {stageAction.label} →
      </Button>
    </Link>
  );
  const stageAccent = STAGE_ACCENT[stage] ?? STAGE_ACCENT.closed;

  // Stateful CTA
  let ctaButton;
  if (!isAuthenticated && !isLoading) {
    ctaButton = (
      <Link to={`/auth?returnTo=${encodeURIComponent(`/e/${event.slug}`)}`} className="w-full">
        <Button variant="primary" size="lg" className="w-full">
          Sign in to register
        </Button>
      </Link>
    );
  } else if (isJoined) {
    ctaButton = (
      <Link to={`/workspace?event=${event.slug}`} className="w-full">
        <Button variant="primary" size="lg" className="w-full">
          Go to workspace →
        </Button>
      </Link>
    );
  } else if (statusInfo.canRegister) {
    ctaButton = (
      <Link to={`/workspace?event=${event.slug}`} className="w-full">
        <Button variant="primary" size="lg" className="w-full">
          Register for event
        </Button>
      </Link>
    );
  } else {
    // Nothing membership-specific to offer. A disabled "Registration closed"
    // button was the dead end this section is meant to avoid — a judge, an
    // organizer or anyone who never registered still has the stage action.
    ctaButton = (
      <Link to={stageAction.to(event.slug)} className="w-full">
        <Button variant="secondary" size="lg" className="w-full">
          {stageAction.label} →
        </Button>
      </Link>
    );
  }

  const timelineSteps = [
    { label: "Registration opens", date: event.registrationStart || event.registrationOpens },
    { label: "Submissions open", date: event.submissionOpens || event.registrationEnd },
    { label: "Submission deadline", date: event.submissionDeadline },
    { label: "Judging period", date: event.judgingStart || event.judgingStarts },
    { label: "Results announced", date: event.judgingEnd || event.resultsAnnounced },
  ];

  return (
    <div className="flex flex-col gap-10">
      {/*
        Back affordance. `/project/:id` gets one from `PageHeader`, so an event
        page reached from `/events` (or from a shared link) had no way back into
        the app other than the browser's own history. Styled like that control
        so the two read as the same thing.
      */}
      <Link
        to="/events"
        className="group inline-flex items-center gap-2 self-start -ml-1 px-1 py-1 rounded-btn text-[13px] text-secondary hover:text-primary transition-colors duration-fast"
      >
        <ArrowLeft
          size={16}
          aria-hidden="true"
          className="transition-transform duration-fast group-hover:-translate-x-0.5"
        />
        <span>All events</span>
      </Link>
      {/*
        Hero (issue 54). Replaces the old "big dark block with the title
        repeated in it, then the real title underneath" pair: one panel, a
        stage-tinted gradient, and title + badge + the one action that matters
        on a single row, all above the fold.
      */}
      <header
        className={`rounded-card border border-line bg-gradient-to-br ${stageAccent} p-6 sm:p-8`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
          <div className="flex flex-col gap-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={["registration", "hacking", "voting"].includes(stage) ? "accent" : "default"}>
                {statusInfo.label}
              </Badge>
              <span className="text-[13px] text-muted">Hosted by {event.hostName || "RaptorJudge"}</span>
            </div>
            <h1 className="text-h1 text-primary">{event.title}</h1>
            <p className="text-sm text-secondary leading-relaxed">
              {event.tagline || event.shortDescription || event.description}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {event.bannerUrl ? (
              <img
                src={event.bannerUrl}
                alt={event.title}
                className="hidden lg:block w-40 h-20 object-cover rounded-card border border-line"
              />
            ) : null}
            {heroCta}
          </div>
        </div>

        {/*
          Voting events get an explicit callout. The stage CTA sends people to
          the gallery, and without this the ballot is a dead end there.
        */}
        {stage === "voting" && (
          <p className="mt-5 text-sm text-secondary border-t border-line pt-5">
            Community voting is open —{" "}
            <Link to={`/gallery/${event.slug}`} className="text-accent hover:text-accent-hover">
              browse the projects and cast your vote
            </Link>
            . Tallies stay hidden until results are published.
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
        {/* Main column */}
        <div className="lg:col-span-2 flex flex-col gap-10">
          <section>
            <h2 className="text-h2 text-primary mb-4">About the event</h2>
            <Markdown content={event.fullDescription || event.description} />
          </section>

          <section>
            <h2 className="text-h2 text-primary mb-5">Event timeline</h2>
            <div className="flex flex-col gap-3.5 relative pl-5 border-l border-line max-w-md">
              {timelineSteps.map((step, idx) => {
                const isPast = step.date ? now > step.date : false;
                return (
                  <div key={idx} className="relative flex flex-col gap-0.5">
                    <span
                      aria-hidden="true"
                      className={`absolute -left-[23px] top-1 w-[9px] h-[9px] rounded-full border border-line ${
                        isPast ? "bg-accent" : "bg-surface-2"
                      }`}
                    />
                    <span className="text-sm font-medium text-primary">{step.label}</span>
                    <span className="text-[13px] text-muted tnum">
                      {step.date ? formatDateTime(step.date) : "TBD"}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {tracks && tracks.length > 0 && (
            <section>
              <h2 className="text-h2 text-primary mb-5">Tracks & prizes</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {tracks.map((track) => (
                  <div key={track._id} className="bg-surface-1 border border-line rounded-card p-5 flex flex-col justify-between gap-2">
                    <div>
                      <h3 className="text-[15px] font-semibold text-primary">{track.name}</h3>
                      <Markdown content={track.description} className="text-[13px] mt-1" />
                    </div>
                    {track.prizeAmount && track.prizeAmount > 0 ? (
                      <div className="text-lg font-semibold text-accent tnum mt-2">
                        ${track.prizeAmount.toLocaleString()}{" "}
                        <span className="text-[13px] font-normal text-muted">
                          ({track.prizeDescription || "Prize"})
                        </span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          )}

          {rubric && rubric.length > 0 && (
            <section>
              <h2 className="text-h2 text-primary mb-5">Judging rubric</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {rubric.map((criterion) => (
                  <div key={criterion._id} className="bg-surface-1 border border-line rounded-card p-5 flex flex-col gap-2">
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="text-[15px] font-semibold text-primary">{criterion.name}</h3>
                      <Badge variant="accent">{Math.round(criterion.weight * 100)}%</Badge>
                    </div>
                    <Markdown content={criterion.description} className="text-[13px]" />
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-h2 text-primary mb-4">Rules & guidelines</h2>
            <div className="bg-surface-1 border border-line rounded-card p-6">
              <Markdown
                content={
                  event.rules ||
                  "1. All projects must be submitted before the deadline.\n2. Team sizes up to 4 members are allowed.\n3. All code written must be original or open source.\n4. Decisions by judges are final after normalization."
                }
              />
            </div>
          </section>

          <section>
            <h2 className="text-h2 text-primary mb-5">Frequently asked questions</h2>
            <div className="flex flex-col gap-2">
              {FAQ_ITEMS.map((item, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={idx} className="bg-surface-1 border border-line rounded-card">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      className="w-full flex justify-between items-center px-5 h-14 text-left text-sm font-medium text-primary"
                    >
                      <span>{item.q}</span>
                      <span className="text-accent text-lg leading-none" aria-hidden="true">
                        {isOpen ? "−" : "+"}
                      </span>
                    </button>
                    {isOpen && (
                      <p className="px-5 pb-5 text-[13px] text-secondary leading-relaxed border-t border-line pt-4">
                        {item.a}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Sticky overview */}
        <div className="lg:col-span-1">
          <div className="bg-surface-1 border border-line rounded-card p-6 lg:sticky lg:top-8 flex flex-col gap-6">
            <h3 className="text-h3 text-primary">Event overview</h3>

            <div className="flex flex-col gap-3 text-[13px] border-b border-line pb-5">
              <div className="flex justify-between gap-4">
                <span className="text-muted">Status</span>
                <span className="text-primary capitalize text-right">{statusInfo.label}</span>
              </div>
              {/*
                The next date that actually governs this stage, not the
                submission deadline — on a judging or voting event the
                submission date has already passed and means nothing.
              */}
              <div className="flex justify-between gap-4">
                <span className="text-muted">{nextDeadline(event, now).label}</span>
                <span className="text-primary tnum text-right">
                  {nextDeadline(event, now).date
                    ? formatDateTime(nextDeadline(event, now).date as number)
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted">Team size</span>
                <span className="text-primary tnum">
                  {event.minTeamSize || 1}–{event.maxTeamSize || 4}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted">Solo allowed</span>
                <span className="text-primary">{event.soloAllowed !== false ? "Yes" : "No"}</span>
              </div>
            </div>

            {ctaButton}
          </div>
        </div>
      </div>
    </div>
  );
}
