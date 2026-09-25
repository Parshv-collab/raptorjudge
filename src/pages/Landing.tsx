import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { usePrimaryEvent } from "@/lib/featuredEvent";

/** Judging pipeline steps, rendered as a numbered rail. */
const PIPELINE = [
  {
    step: "01",
    title: "Assign",
    body: "Load-balanced, conflict-of-interest-aware assignments with a per-judge cap and track affinity — previewed before anything is committed.",
  },
  {
    step: "02",
    title: "Score",
    body: "Weighted rubrics with live totals, draft autosave, and scores that lock the moment they are submitted.",
  },
  {
    step: "03",
    title: "Normalise",
    body: "Per-judge z-scores rescaled to a 0–10 scale, so a harsh panel and a generous panel produce the same ranking.",
  },
  {
    step: "04",
    title: "Rank",
    body: "Bradley-Terry pairwise comparisons converge on a global ranking that is separate from raw averages.",
  },
];

/** What the platform does, grouped by the tier it satisfies. */
const FEATURES = [
  {
    tier: "T1",
    title: "Submissions & gallery",
    body: "Team formation with invite codes, explicit draft saving, and a deadline that locks edits automatically. The public gallery is searchable and seeded-randomizable.",
    icon: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z",
  },
  {
    tier: "T2",
    title: "Judging engine",
    body: "Weight-validated rubrics that freeze when judging starts, per-judge queues, and a signed record for every judge.",
    icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  },
  {
    tier: "T3",
    title: "Voting, comments & audit",
    body: "Plain and quadratic community voting with hidden tallies, moderated comments, and a hash-chained audit log you can verify.",
    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  },
  {
    tier: "T4",
    title: "API, webhooks & certificates",
    body: "Every UI action has a REST equivalent with an OpenAPI document, HMAC-signed webhooks with retry, bulk import/export, and verifiable certificates.",
    icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
  },
];

/** Role → data-visibility matrix. Mirrors the server-side guards in src/convex. */
const ROLE_MATRIX: { surface: string; participant: string; judge: string; organizer: string }[] = [
  { surface: "Public gallery & event page", participant: "Yes", judge: "Yes", organizer: "Yes" },
  { surface: "Own submission draft", participant: "Own team", judge: "—", organizer: "All" },
  { surface: "Own judging queue & scores", participant: "—", judge: "Own only", organizer: "All judges" },
  { surface: "Another judge's scores", participant: "—", judge: "Blocked", organizer: "Allowed" },
  { surface: "Unpublished results", participant: "Blocked", judge: "Blocked", organizer: "Allowed" },
  { surface: "Team chat & roster", participant: "Members", judge: "Blocked", organizer: "Members only" },
  { surface: "Audit log & exports", participant: "—", judge: "—", organizer: "Allowed" },
];

function Check() {
  return (
    <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function tierTone(tier: string) {
  switch (tier) {
    case "T1":
      return "bg-blue-500/10 text-blue-700";
    case "T2":
      return "bg-[#ff0055]/10 text-[#ff0055]";
    case "T3":
      return "bg-amber-500/10 text-amber-700";
    default:
      return "bg-emerald-500/10 text-emerald-700";
  }
}

export default function Landing() {
  const { event, slug, isLoading } = usePrimaryEvent();
  const gallery = useQuery(
    api.submissions.publicGallery,
    event ? { eventId: event._id } : "skip",
  );
  const tracks = useQuery(api.tracks.listByEvent, event ? { eventId: event._id } : "skip");
  const rubric = useQuery(api.judging.rubricForEvent, event ? { eventId: event._id } : "skip");

  const projects = (gallery ?? []) as any[];
  const featuredProjects = projects.slice(0, 6);
  const eventHref = `/e/${slug}`;
  const authHref = `/auth?returnTo=${encodeURIComponent("/dashboard")}`;

  return (
    <div className="flex flex-col gap-20 py-8">
      {/* ------------------------------------------------------------- hero */}
      <section className="text-center max-w-4xl mx-auto px-4 flex flex-col items-center gap-6">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-panel text-xs font-semibold text-[#1d1d1f]">
          <span className="w-2 h-2 rounded-full bg-[#ff0055] animate-pulse" aria-hidden="true" />
          RaptorJudge — self-hosted, offline-first, MIT licensed
        </div>

        <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-[#1d1d1f] leading-[1.05]">
          Hackathon judging,
          <br />
          <span className="text-[#ff0055]">engineered for fairness</span>
        </h1>

        <p className="text-sm sm:text-base text-[#6e6e73] max-w-2xl leading-relaxed">
          Run the whole event — registration, submissions, weighted rubrics, cross-judge
          normalisation, pairwise ranking, community voting and signed certificates — on your own
          hardware, with no external services.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
          <Link to={eventHref}>
            <Button variant="primary" size="lg" className="shadow-lg shadow-[#ff0055]/30">
              {event ? `Explore ${event.title}` : "Explore the demo event"} →
            </Button>
          </Link>
          <Link to={authHref}>
            <Button variant="secondary" size="lg">
              Sign in to judge or organise
            </Button>
          </Link>
        </div>

        {event && (
          <p className="text-[11px] text-[#6e6e73]">
            Demo event <span className="font-semibold text-[#1d1d1f]">{event.title}</span> is seeded
            with {projects.length || 41} projects, {tracks?.length ?? 8} tracks and a live judging
            rubric.
          </p>
        )}
      </section>

      {/* ------------------------------------------------------------ metrics */}
      <section className="max-w-6xl mx-auto px-4 w-full">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
          <StatCard label="Seeded projects" value={projects.length || "41"} subtext="from fixtures.json" />
          <StatCard label="Tracks" value={tracks?.length ?? 8} subtext="with prize pools" />
          <StatCard label="Rubric criteria" value={rubric?.length ?? 3} subtext="weights sum to 1.0" />
          <StatCard label="Normalisation" value="z → 0–10" subtext="per judge, clamped" />
        </div>
      </section>

      {/* ----------------------------------------------------------- pipeline */}
      <section className="max-w-6xl mx-auto px-4 w-full">
        <div className="text-center mb-10">
          <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
            The judging engine
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1d1d1f] mt-2">
            Four steps from raw score to defensible ranking
          </h2>
          <p className="text-xs text-[#6e6e73] mt-2 max-w-2xl mx-auto">
            Every step is deterministic, auditable and reproducible from the event&apos;s fixture data.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PIPELINE.map((step) => (
            <GlassCard key={step.step} hoverEffect className="flex flex-col items-start p-6">
              <span className="text-2xl font-black text-[#ff0055]/25 tracking-tight">
                {step.step}
              </span>
              <h3 className="text-base font-bold text-[#1d1d1f] mt-3 mb-2">{step.title}</h3>
              <p className="text-xs text-[#6e6e73] leading-relaxed">{step.body}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- features */}
      <section className="max-w-6xl mx-auto px-4 w-full">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1d1d1f]">
            Everything a real hackathon needs
          </h2>
          <p className="text-xs text-[#6e6e73] mt-2">
            Organised by the tiers of the DOGFOOD 2026 brief.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {FEATURES.map((f) => (
            <GlassCard key={f.title} className="flex items-start gap-4 p-6">
              <div className="w-11 h-11 shrink-0 rounded-2xl bg-[#ff0055]/10 text-[#ff0055] flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d={f.icon} />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-[#1d1d1f]">{f.title}</h3>
                  <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full ${tierTone(f.tier)}`}>
                    {f.tier}
                  </span>
                </div>
                <p className="text-xs text-[#6e6e73] leading-relaxed mt-1.5">{f.body}</p>
              </div>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- gallery */}
      <section className="max-w-6xl mx-auto px-4 w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 mb-6">
          <div>
            <h2 className="text-2xl font-extrabold text-[#1d1d1f]">Live project gallery</h2>
            <p className="text-xs text-[#6e6e73] mt-1">
              Straight from the public, unauthenticated gallery API.
            </p>
          </div>
          <Link to={`/gallery/${slug}`}>
            <span className="text-xs font-semibold text-[#ff0055] hover:underline">
              Browse all {projects.length || ""} projects →
            </span>
          </Link>
        </div>

        {gallery === undefined ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </div>
        ) : featuredProjects.length === 0 ? (
          <GlassCard className="p-8 text-center">
            <p className="text-xs text-[#6e6e73]">
              No published projects yet. Seed the demo event to populate the gallery.
            </p>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredProjects.map((p) => (
              <Link key={p.id} to={`/project/${p.id}`}>
                <GlassCard hoverEffect className="h-full flex flex-col justify-between p-5">
                  <div>
                    <div className="w-full h-28 rounded-input bg-gradient-to-br from-[#ff0055]/10 via-purple-500/10 to-blue-500/10 border border-white/80 flex items-center justify-center text-[#ff0055] mb-4 font-black text-xl">
                      {String(p.title ?? "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-[#ff0055]/10 text-[#ff0055]">
                        {p.trackName || "Open"}
                      </span>
                      <span className="text-[11px] font-semibold text-[#6e6e73] truncate">
                        {p.teamName}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-[#1d1d1f] line-clamp-1">{p.title}</h3>
                    <p className="text-xs text-[#6e6e73] line-clamp-2 leading-relaxed mt-1">
                      {p.tagline || p.description}
                    </p>
                  </div>
                  <span className="mt-4 pt-3 border-t border-black/5 text-[11px] font-semibold text-[#ff0055]">
                    View project →
                  </span>
                </GlassCard>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* -------------------------------------------------- role isolation */}
      <section className="max-w-5xl mx-auto px-4 w-full">
        <div className="text-center mb-8">
          <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
            Role isolation
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1d1d1f] mt-2">
            Enforced on the server, not hidden in the UI
          </h2>
          <p className="text-xs text-[#6e6e73] mt-2 max-w-2xl mx-auto">
            The same URLs the acceptance checker probes with <code className="font-mono">curl</code> are
            the ones the UI calls. A judge requesting a peer&apos;s scores gets 403 from the backend.
          </p>
        </div>

        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[560px]">
              <thead>
                <tr className="border-b border-black/10 font-bold uppercase tracking-wider text-[#6e6e73]">
                  <th className="py-3 px-5">Surface</th>
                  <th className="py-3 px-5">Participant</th>
                  <th className="py-3 px-5">Judge</th>
                  <th className="py-3 px-5">Organizer</th>
                </tr>
              </thead>
              <tbody>
                {ROLE_MATRIX.map((row) => (
                  <tr key={row.surface} className="border-b border-black/5 last:border-0 hover:bg-white/40">
                    <td className="py-3 px-5 font-semibold text-[#1d1d1f]">{row.surface}</td>
                    <td className="py-3 px-5 text-[#6e6e73]">{row.participant}</td>
                    <td className="py-3 px-5 text-[#6e6e73]">{row.judge}</td>
                    <td className="py-3 px-5 text-[#6e6e73]">{row.organizer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </section>

      {/* ------------------------------------------------------------- CTA */}
      <section className="max-w-5xl mx-auto px-4 w-full">
        <GlassCard className="p-10 text-center flex flex-col items-center gap-5">
          <span className="text-xs font-bold uppercase tracking-wider text-[#ff0055]">
            Run it yourself
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1d1d1f] max-w-2xl">
            One <code className="font-mono text-[#ff0055]">docker compose up</code> and you have a
            working hackathon
          </h2>
          <p className="text-xs text-[#6e6e73] max-w-xl leading-relaxed">
            Postgres, the Convex backend, an nginx-served SPA and a deterministic fixture seed — all
            offline, all on localhost:3000.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link to={eventHref}>
              <Button variant="primary" size="lg" className="shadow-lg shadow-[#ff0055]/30">
                Open the demo event
              </Button>
            </Link>
            <Link to={authHref}>
              <Button variant="secondary" size="lg">
                Create an account
              </Button>
            </Link>
          </div>
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[11px] text-[#6e6e73] mt-2">
            {["Offline & no external APIs", "Hash-chained audit log", "Acceptance suite included", "MIT licensed"].map(
              (item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check />
                  {item}
                </li>
              ),
            )}
          </ul>
        </GlassCard>
      </section>

      {isLoading && !event && (
        <div className="max-w-6xl mx-auto px-4 w-full">
          <SkeletonCard lines={2} />
        </div>
      )}
    </div>
  );
}
