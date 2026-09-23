import React, { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";

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
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useConvexAuth();

  const event = useQuery(api.events.getBySlug, slug ? { slug } : "skip");
  const tracks = useQuery(api.tracks.listByEvent, event ? { eventId: event._id } : "skip");
  const rubric = useQuery(api.judging.rubricForEvent, event ? { eventId: event._id } : "skip");
  const myTeams = useQuery(api.teams.myTeams, isAuthenticated ? {} : "skip");

  const [openFaq, setOpenFaq] = useState<number | null>(null);

  if (!event) {
    return (
      <div className="py-20 text-center animate-pulse text-xs text-[#6e6e73]">
        Loading event details...
      </div>
    );
  }

  const isJoined = myTeams?.some((t) => t.eventId === event._id);
  const now = Date.now();
  const isClosed = event.registrationCloses ? now > event.registrationCloses : now > event.submissionDeadline;

  // Determine Stateful CTA
  let ctaButton;
  if (!isAuthenticated && !isLoading) {
    ctaButton = (
      <Link to={`/auth?returnTo=${encodeURIComponent(`/e/${event.slug}`)}`} className="w-full">
        <Button variant="primary" size="lg" className="w-full shadow-lg shadow-[#ff0055]/30">
          Sign in to register
        </Button>
      </Link>
    );
  } else if (isClosed) {
    ctaButton = (
      <Button variant="secondary" size="lg" disabled className="w-full">
        Registration closed
      </Button>
    );
  } else if (isJoined) {
    ctaButton = (
      <Link to={`/workspace?event=${event.slug}`} className="w-full">
        <Button variant="primary" size="lg" className="w-full shadow-lg shadow-[#ff0055]/30">
          Go to workspace →
        </Button>
      </Link>
    );
  } else {
    ctaButton = (
      <Link to={`/workspace?event=${event.slug}`} className="w-full">
        <Button variant="primary" size="lg" className="w-full shadow-lg shadow-[#ff0055]/30">
          Register for event
        </Button>
      </Link>
    );
  }

  const timelineSteps = [
    { label: "Registration Opens", date: event.registrationStart || event.registrationOpens },
    { label: "Submissions Open", date: event.submissionOpens || event.registrationEnd },
    { label: "Submission Deadline", date: event.submissionDeadline },
    { label: "Judging Period", date: event.judgingStart || event.judgingStarts },
    { label: "Results Announced", date: event.judgingEnd || event.resultsAnnounced },
  ];

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 flex flex-col gap-10">
      {/* Hero Header */}
      <GlassCard className="p-8 relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex flex-col gap-3 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full bg-[#ff0055]/10 text-[#ff0055]">
              {event.status}
            </span>
            <span className="text-xs text-[#6e6e73]">
              Hosted by {event.hostName || "RaptorJudge"}
            </span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-[#1d1d1f] tracking-tight">
            {event.title}
          </h1>

          <p className="text-sm font-medium text-[#6e6e73] leading-relaxed">
            {event.tagline || event.shortDescription || event.description}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Link to={`/gallery/${event.slug}`}>
            <Button variant="secondary" size="md">
              View Gallery
            </Button>
          </Link>
        </div>
      </GlassCard>

      {/* Main Grid with Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Columns: Main Details */}
        <div className="lg:col-span-2 flex flex-col gap-8">
          {/* About Section */}
          <GlassCard className="p-6">
            <h2 className="text-lg font-bold text-[#1d1d1f] mb-3">About the Event</h2>
            <div className="text-xs sm:text-sm text-[#1d1d1f] leading-relaxed whitespace-pre-line">
              {event.fullDescription || event.description}
            </div>
          </GlassCard>

          {/* Timeline Section */}
          <GlassCard className="p-6">
            <h2 className="text-lg font-bold text-[#1d1d1f] mb-4">Event Timeline</h2>
            <div className="flex flex-col gap-4 relative pl-4 border-l-2 border-[#ff0055]/30">
              {timelineSteps.map((step, idx) => {
                const isPast = step.date ? now > step.date : false;
                return (
                  <div key={idx} className="relative flex flex-col gap-0.5">
                    <span
                      className={`absolute -left-[21px] top-1 w-3 h-3 rounded-full border-2 border-white ${
                        isPast ? "bg-[#ff0055]" : "bg-black/20"
                      }`}
                    />
                    <span className="text-xs font-bold text-[#1d1d1f]">{step.label}</span>
                    <span className="text-[11px] text-[#6e6e73]">
                      {step.date ? new Date(step.date).toLocaleString() : "TBD"}
                    </span>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          {/* Tracks & Prizes */}
          {tracks && tracks.length > 0 && (
            <GlassCard className="p-6">
              <h2 className="text-lg font-bold text-[#1d1d1f] mb-4">Tracks & Prizes</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {tracks.map((track) => (
                  <div
                    key={track._id}
                    className="p-4 rounded-input bg-white/60 border border-white shadow-sm flex flex-col justify-between gap-2"
                  >
                    <div>
                      <h3 className="text-sm font-bold text-[#1d1d1f]">{track.name}</h3>
                      <p className="text-xs text-[#6e6e73] mt-1 leading-relaxed">
                        {track.description}
                      </p>
                    </div>
                    {track.prizeAmount && track.prizeAmount > 0 ? (
                      <div className="text-base font-extrabold text-[#ff0055] mt-2">
                        ${track.prizeAmount.toLocaleString()}{" "}
                        <span className="text-xs font-normal text-[#6e6e73]">
                          ({track.prizeDescription || "Prize"})
                        </span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* Rubric Criteria */}
          {rubric && rubric.length > 0 && (
            <GlassCard className="p-6">
              <h2 className="text-lg font-bold text-[#1d1d1f] mb-4">Judging Rubric</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {rubric.map((criterion) => (
                  <div
                    key={criterion._id}
                    className="p-4 rounded-input bg-white/60 border border-white shadow-sm flex flex-col justify-between gap-2"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="text-sm font-bold text-[#1d1d1f]">{criterion.name}</h3>
                      <span className="text-xs font-bold text-[#ff0055] px-2 py-0.5 rounded-full bg-[#ff0055]/10">
                        {Math.round(criterion.weight * 100)}%
                      </span>
                    </div>
                    <p className="text-xs text-[#6e6e73] leading-relaxed">
                      {criterion.description}
                    </p>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* Rules Section */}
          <GlassCard className="p-6">
            <h2 className="text-lg font-bold text-[#1d1d1f] mb-3">Rules & Guidelines</h2>
            <div className="text-xs sm:text-sm text-[#1d1d1f] leading-relaxed whitespace-pre-line">
              {event.rules ||
                "1. All projects must be submitted before the deadline.\n2. Team sizes up to 4 members are allowed.\n3. All code written must be original or open source.\n4. Decisions by judges are final after normalization."}
            </div>
          </GlassCard>

          {/* FAQ Accordion */}
          <GlassCard className="p-6">
            <h2 className="text-lg font-bold text-[#1d1d1f] mb-4">Frequently Asked Questions</h2>
            <div className="flex flex-col gap-2">
              {FAQ_ITEMS.map((item, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div
                    key={idx}
                    className="p-3.5 rounded-input bg-white/60 border border-white shadow-sm cursor-pointer transition-all"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                  >
                    <div className="flex justify-between items-center font-bold text-xs text-[#1d1d1f]">
                      <span>{item.q}</span>
                      <span className="text-[#ff0055] text-base">{isOpen ? "−" : "+"}</span>
                    </div>
                    {isOpen && (
                      <p className="text-xs text-[#6e6e73] mt-2 pt-2 border-t border-black/5 leading-relaxed">
                        {item.a}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </GlassCard>
        </div>

        {/* Right Sticky Sidebar */}
        <div className="lg:col-span-1">
          <GlassCard className="p-6 sticky top-20 flex flex-col gap-6 shadow-xl">
            <h3 className="text-base font-bold text-[#1d1d1f]">Event Overview</h3>

            <div className="flex flex-col gap-3 text-xs border-b border-black/5 pb-4">
              <div className="flex justify-between">
                <span className="text-[#6e6e73]">Status:</span>
                <span className="font-bold text-[#1d1d1f] capitalize">{event.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6e6e73]">Deadline:</span>
                <span className="font-bold text-[#1d1d1f]">
                  {new Date(event.submissionDeadline).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6e6e73]">Team Size:</span>
                <span className="font-bold text-[#1d1d1f]">
                  {event.minTeamSize || 1} - {event.maxTeamSize || 4} Members
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6e6e73]">Solo Allowed:</span>
                <span className="font-bold text-[#1d1d1f]">
                  {event.soloAllowed !== false ? "Yes" : "No"}
                </span>
              </div>
            </div>

            {/* Stateful CTA Button */}
            {ctaButton}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
