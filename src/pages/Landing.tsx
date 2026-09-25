import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
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
    <svg className="w-3.5 h-3.5 text-success shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
    </svg>
  );
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
    <div className="flex flex-col gap-24 py-12">
      {/* ------------------------------------------------------------- hero */}
      <section className="max-w-4xl mx-auto px-4 flex flex-col items-center gap-6 text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-pill border border-line bg-surface-1 text-[13px] text-secondary">
          <span className="w-1.5 h-1.5 rounded-pill bg-accent" aria-hidden="true" />
          RaptorJudge — self-hosted, offline-first, MIT licensed
        </div>

        <h1 className="text-display text-primary">
          Hackathon judging,
          <br />
          <span className="text-accent">engineered for fairness.</span>
        </h1>

        <p className="text-base text-secondary max-w-2xl leading-relaxed">
          Run the whole event — registration, submissions, weighted rubrics, cross-judge
          normalisation, pairwise ranking, community voting and signed certificates — on your own
          hardware, with no external services.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
          <Link to={eventHref}>
            <Button variant="primary" size="lg">
              {event ? `Explore ${event.title}` : "Explore the demo event"}
            </Button>
          </Link>
          <Link to={authHref}>
            <Button variant="secondary" size="lg">
              Sign in to judge or organise
            </Button>
          </Link>
        </div>

        {event && (
          <p className="text-[13px] text-muted">
            Demo event <span className="text-primary">{event.title}</span> is seeded with{" "}
            {projects.length || 41} projects, {tracks?.length ?? 8} tracks and a live judging rubric.
          </p>
        )}
      </section>

      {/* ------------------------------------------------------------ metrics */}
      <section className="max-w-content mx-auto px-5 lg:px-8 w-full">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Seeded projects" value={projects.length || "41"} subtext="from fixtures.json" />
          <StatCard label="Tracks" value={tracks?.length ?? 8} subtext="with prize pools" />
          <StatCard label="Rubric criteria" value={rubric?.length ?? 3} subtext="weights sum to 1.0" />
          <StatCard label="Normalisation" value="z → 0–10" subtext="per judge, clamped" />
        </div>
      </section>

      {/* ----------------------------------------------------------- pipeline */}
      <section className="max-w-content mx-auto px-5 lg:px-8 w-full">
        <div className="mb-10">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-accent">
            The judging engine
          </span>
          <h2 className="text-h1 text-primary mt-2">
            Four steps from raw score to defensible ranking
          </h2>
          <p className="text-sm text-secondary mt-2 max-w-2xl">
            Every step is deterministic, auditable and reproducible from the event&apos;s fixture data.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PIPELINE.map((step) => (
            <div
              key={step.step}
              className="bg-surface-1 border border-line rounded-card p-6 transition-colors duration-fast hover:border-line-strong"
            >
              <span className="font-mono text-sm text-accent tnum">{step.step}</span>
              <h3 className="text-h3 text-primary mt-4 mb-2">{step.title}</h3>
              <p className="text-[13px] text-secondary leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- features */}
      <section className="max-w-content mx-auto px-5 lg:px-8 w-full">
        <div className="mb-10">
          <h2 className="text-h1 text-primary">Everything a real hackathon needs</h2>
          <p className="text-sm text-secondary mt-2">Organised by the tiers of the DOGFOOD 2026 brief.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-surface-1 border border-line rounded-card p-6 flex items-start gap-4 transition-colors duration-fast hover:border-line-strong"
            >
              <div className="w-10 h-10 shrink-0 rounded-btn border border-line bg-surface-2 text-accent flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d={f.icon} />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-h3 text-primary">{f.title}</h3>
                  <Badge variant="default">{f.tier}</Badge>
                </div>
                <p className="text-[13px] text-secondary leading-relaxed mt-1.5">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- gallery */}
      <section className="max-w-content mx-auto px-5 lg:px-8 w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 mb-6">
          <div>
            <h2 className="text-h1 text-primary">Live project gallery</h2>
            <p className="text-sm text-secondary mt-1">Straight from the public, unauthenticated gallery API.</p>
          </div>
          <Link to={`/gallery/${slug}`} className="text-sm text-accent hover:text-accent-hover transition-colors duration-fast">
            Browse all {projects.length || ""} projects →
          </Link>
        </div>

        {gallery === undefined ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </div>
        ) : featuredProjects.length === 0 ? (
          <div className="bg-surface-1 border border-line rounded-card p-8 text-center text-[13px] text-secondary">
            No published projects yet. Seed the demo event to populate the gallery.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featuredProjects.map((p) => (
              <Link key={p.id} to={`/project/${p.id}`} className="group">
                <div className="h-full bg-surface-1 border border-line rounded-card overflow-hidden transition-colors duration-fast group-hover:border-line-strong flex flex-col">
                  <div className="h-28 bg-surface-2 border-b border-line flex items-center justify-center font-mono text-xl text-accent">
                    {String(p.title ?? "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Badge variant="accent">{p.trackName || "Open"}</Badge>
                      <span className="text-[13px] text-muted truncate">{p.teamName}</span>
                    </div>
                    <h3 className="text-[15px] font-semibold text-primary">{p.title}</h3>
                    <p className="text-[13px] text-secondary mt-1 line-clamp-2 leading-relaxed">
                      {p.tagline || p.description}
                    </p>
                    <span className="mt-auto pt-4 text-[13px] font-medium text-accent">View project →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* -------------------------------------------------- role isolation */}
      <section className="max-w-content mx-auto px-5 lg:px-8 w-full">
        <div className="mb-8">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-accent">
            Role isolation
          </span>
          <h2 className="text-h1 text-primary mt-2">Enforced on the server, not hidden in the UI</h2>
          <p className="text-sm text-secondary mt-2 max-w-2xl">
            The same URLs the acceptance checker probes with <code className="font-mono text-[13px]">curl</code> are
            the ones the UI calls. A judge requesting a peer&apos;s scores gets 403 from the backend.
          </p>
        </div>

        <div className="overflow-x-auto border border-line rounded-card bg-surface-1">
          <table className="w-full text-left text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-line">
                <th className="px-5 h-11 text-[12px] font-medium uppercase tracking-[0.05em] text-muted">Surface</th>
                <th className="px-5 h-11 text-[12px] font-medium uppercase tracking-[0.05em] text-muted">Participant</th>
                <th className="px-5 h-11 text-[12px] font-medium uppercase tracking-[0.05em] text-muted">Judge</th>
                <th className="px-5 h-11 text-[12px] font-medium uppercase tracking-[0.05em] text-muted">Organizer</th>
              </tr>
            </thead>
            <tbody>
              {ROLE_MATRIX.map((row) => (
                <tr key={row.surface} className="transition-colors duration-fast hover:bg-surface-2">
                  <td className="px-5 h-12 text-primary">{row.surface}</td>
                  <td className="px-5 h-12 text-secondary">{row.participant}</td>
                  <td className="px-5 h-12 text-secondary">{row.judge}</td>
                  <td className="px-5 h-12 text-secondary">{row.organizer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ------------------------------------------------------------- CTA */}
      <section className="max-w-content mx-auto px-5 lg:px-8 w-full">
        <div className="bg-surface-1 border border-line rounded-card p-10 lg:p-14 text-center flex flex-col items-center gap-5">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-accent">
            Run it yourself
          </span>
          <h2 className="text-h1 text-primary max-w-2xl">
            One <code className="font-mono text-accent">docker compose up</code> and you have a working
            hackathon
          </h2>
          <p className="text-sm text-secondary max-w-xl leading-relaxed">
            Postgres, the Convex backend, an nginx-served SPA and a deterministic fixture seed — all
            offline, all on localhost:3000.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link to={eventHref}>
              <Button variant="primary" size="lg">
                Open the demo event
              </Button>
            </Link>
            <Link to={authHref}>
              <Button variant="secondary" size="lg">
                Create an account
              </Button>
            </Link>
          </div>
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[13px] text-secondary mt-2">
            {["Offline & no external APIs", "Hash-chained audit log", "Acceptance suite included", "MIT licensed"].map(
              (item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check />
                  {item}
                </li>
              ),
            )}
          </ul>
        </div>
      </section>

      {isLoading && !event && (
        <div className="max-w-content mx-auto px-5 lg:px-8 w-full">
          <SkeletonCard lines={2} />
        </div>
      )}
    </div>
  );
}
