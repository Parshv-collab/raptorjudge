import { useParams, Link } from "react-router-dom";
import { useQuery, useConvexAuth } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import {
  Calendar,
  Clock,
  Trophy,
  Scale,
  Users,
  ChevronRight,
  ListChecks,
} from "lucide-react";

const STAGES = ["draft", "registration", "hacking", "judging", "voting", "published", "archived"];

function useCountdown(target: number | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!target) return null;
  const diff = target - now;
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { d, h, m, s };
}

function Countdown({ label, target }: { label: string; target: number | undefined }) {
  const cd = useCountdown(target);
  if (!cd) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <div className="mono-label mb-2">{label}</div>
      <div className="font-mono text-2xl font-bold text-primary">
        {cd.d}d {String(cd.h).padStart(2, "0")}h {String(cd.m).padStart(2, "0")}m{" "}
        {String(cd.s).padStart(2, "0")}s
      </div>
    </div>
  );
}

export default function EventPublic() {
  const { slug } = useParams<{ slug: string }>();
  const { isAuthenticated } = useConvexAuth();
  const event = useQuery(api.events.getBySlug, slug ? { slug } : "skip");
  const tracks = useQuery(
    api.tracks.listByEvent,
    event ? { eventId: event._id } : "skip",
  );
  const rubric = useQuery(
    api.judging.rubricForEvent,
    event ? { eventId: event._id } : "skip",
  );

  if (!event) {
    return (
      <div className="container py-24 text-center font-mono text-muted-foreground">loading event…</div>
    );
  }

  const stageIdx = STAGES.indexOf(event.status);

  return (
    <div>
      {/* banner */}
      <section className="grid-bg border-b border-border">
        <div className="container py-16">
          <div className="mono-label mb-2">hackathon raptors presents</div>
          <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">{event.title}</h1>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{event.tagline}</p>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">{event.description}</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1.5 font-mono text-xs uppercase tracking-wider text-primary">
              <Clock size={13} /> stage: {event.status}
            </span>
            <Link
              to={`/gallery/${event.slug}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-primary-foreground transition hover:opacity-90"
            >
              browse projects <ChevronRight size={14} />
            </Link>
            <Link
              to={isAuthenticated ? `/workspace?event=${event.slug}` : `/auth?returnTo=${encodeURIComponent(`/workspace?event=${event.slug}`)}`}
              className="rounded-lg border border-border px-5 py-2.5 font-mono text-xs uppercase tracking-wider transition hover:border-primary/50"
            >
              join event
            </Link>
          </div>
        </div>
      </section>

      {/* lifecycle strip */}
      <div className="border-b border-border bg-card/40">
        <div className="container flex flex-wrap items-center gap-1.5 py-4">
          {STAGES.map((s, i) => (
            <div key={s} className="flex items-center gap-1.5">
              <span
                className={`rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-wider ${
                  i < stageIdx
                    ? "bg-primary/15 text-primary"
                    : i === stageIdx
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {s}
              </span>
              {i < STAGES.length - 1 && <span className="text-muted-foreground/40">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* countdowns */}
      <section className="container grid gap-4 py-10 sm:grid-cols-3">
        <Countdown label="submission deadline" target={event.submissionDeadline} />
        <Countdown label="judging ends" target={event.judgingEnd} />
        <Countdown label="voting ends" target={event.votingEnd} />
      </section>

      {/* tracks */}
      <section className="container py-10">
        <div className="mb-6 flex items-center gap-2">
          <Trophy size={18} className="text-primary" />
          <h2 className="text-2xl font-bold">Tracks & prize pool</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tracks?.map((t) => (
            <div key={t._id} className="card-hover rounded-xl border border-border bg-card p-5">
              <div className="mb-1 font-semibold">{t.name}</div>
              <p className="mb-4 text-sm text-muted-foreground">{t.description}</p>
              <div className="font-mono text-lg font-bold text-primary">
                ${(t.prizeAmount ?? 0).toLocaleString()}
              </div>
              <div className="mono-label">{t.prizeDescription}</div>
            </div>
          ))}
        </div>
      </section>

      {/* rubric */}
      <section className="container py-10">
        <div className="mb-6 flex items-center gap-2">
          <Scale size={18} className="text-primary" />
          <h2 className="text-2xl font-bold">Judging rubric</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {rubric
            ?.sort((a, b) => a.sortOrder - b.sortOrder)
            .map((c) => (
              <div key={c._id} className="rounded-xl border border-border bg-card p-5">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="font-semibold">{c.name}</span>
                  <span className="font-mono text-sm text-primary">{Math.round(c.weight * 100)}%</span>
                </div>
                <p className="text-sm text-muted-foreground">{c.description}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${c.weight * 100}%` }}
                  />
                </div>
                <div className="mono-label mt-2">score {c.minScore}–{c.maxScore}</div>
              </div>
            ))}
        </div>
      </section>

      {/* rules / info */}
      <section className="container grid gap-6 py-10 md:grid-cols-3">
        {[
          {
            icon: Calendar,
            title: "Timeline",
            body: `Registration ${new Date(event.registrationStart).toLocaleDateString()} → ${new Date(event.registrationEnd).toLocaleDateString()}. Hacking ends at the strict deadline — late submissions are ${event.settings.includes("allow_late_submissions=true") ? "allowed" : "rejected"}.`,
          },
          {
            icon: ListChecks,
            title: "Rules",
            body: "Max team size 4 (from event settings). Open-source, self-hostable builds encouraged. All code written during the event window.",
          },
          {
            icon: Users,
            title: "Judging",
            body: "Each project is scored by at least 3 independent judges on the weighted rubric above, then cross-judge normalized to remove calibration bias.",
          },
        ].map((b) => (
          <div key={b.title} className="rounded-xl border border-border bg-card p-6">
            <b.icon className="mb-3 text-primary" size={22} />
            <h3 className="mb-2 font-semibold">{b.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{b.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
