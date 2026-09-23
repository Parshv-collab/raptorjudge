import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Terminal,
  ArrowRight,
  Scale,
  Network,
  Vote,
  ShieldCheck,
  Award,
  Gauge,
  GitBranch,
  Boxes,
  Lock,
} from "lucide-react";

const FEATURES = [
  {
    tier: "T1 · Core",
    icon: Boxes,
    title: "Run the whole event",
    items: ["Auth & 4 roles", "Tracks & prizes", "Teams + invites", "Deadline-locked submissions", "Searchable gallery"],
  },
  {
    tier: "T2 · Judging",
    icon: Scale,
    title: "Judging that stays fair",
    items: ["Balanced auto-assignment", "Weighted rubrics", "Role isolation", "Progress heatmap", "CSV exports"],
  },
  {
    tier: "T3 · Public",
    icon: Vote,
    title: "Community, defended",
    items: ["Quadratic voting", "Hidden results till publish", "Rate limits + Sybil alerts", "Comments", "Tamper-evident audit log"],
  },
  {
    tier: "T4 · Stretch",
    icon: Network,
    title: "Platform-grade extras",
    items: ["100% REST API + OpenAPI", "HMAC webhooks", "Signed certificates", "Bulk import/export", "Embeddable widget"],
  },
];

const PIPELINE = [
  { step: "01", name: "Register", desc: "Teams form with invite codes during the registration window" },
  { step: "02", name: "Build", desc: "Drafts autosave until the strict submission deadline locks" },
  { step: "03", name: "Judge", desc: "k=3 assignment, weighted rubrics, judge-isolated queues" },
  { step: "04", name: "Normalize", desc: "Z-score / min-max / Bayesian fixes cross-judge calibration" },
  { step: "05", name: "Rank", desc: "Bradley-Terry pairwise mode + community quadratic vote" },
  { step: "06", name: "Certify", desc: "HMAC-signed certificates, public verification, full audit trail" },
];

export default function Landing() {
  const event = useQuery(api.events.getBySlug, { slug: "dogfood-2026" });

  return (
    <div>
      {/* ------------------------------------------------------------- hero --- */}
      <section className="grid-bg scanlines relative overflow-hidden border-b border-border">
        <div className="container relative py-24 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 font-mono text-xs text-primary animate-fade-up">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            open-source · self-hostable · 100% offline
          </div>
          <h1 className="mx-auto max-w-4xl text-5xl font-extrabold leading-[1.05] tracking-tight md:text-6xl animate-fade-up">
            Hackathon judging that
            <br />
            <span className="text-primary glow-text">survives statistics</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground animate-fade-up">
            RaptorJudge runs the entire event lifecycle — registration, submissions, algorithmic
            judging, cross-judge score normalization, Bradley-Terry ranking, community voting with
            anti-abuse, and cryptographically signed certificates.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 animate-fade-up">
            <Link
              to="/auth"
              className="group flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-mono text-sm font-semibold uppercase tracking-wider text-primary-foreground transition hover:opacity-90"
            >
              try the live demo
              <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
            </Link>
            <Link
              to={event ? `/e/dogfood-2026` : "/auth"}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-3 font-mono text-sm uppercase tracking-wider transition hover:border-primary/50"
            >
              <Terminal size={15} />
              view event
            </Link>
          </div>
          <div className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["12", "seeded projects"],
              ["4", "calibrated judges"],
              ["3", "normalization models"],
              ["64-byte", "hmac signatures"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-lg border border-border bg-card/60 px-4 py-3">
                <div className="font-mono text-xl font-bold text-primary">{v}</div>
                <div className="mono-label">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- features --- */}
      <section className="container py-20">
        <div className="mb-12 text-center">
          <div className="mono-label mb-2">feature matrix</div>
          <h2 className="text-3xl font-bold tracking-tight">Everything a real hackathon needs</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.tier} className="card-hover rounded-xl border border-border bg-card p-6">
              <f.icon className="mb-4 text-primary" size={26} />
              <div className="mono-label mb-1">{f.tier}</div>
              <h3 className="mb-3 font-semibold">{f.title}</h3>
              <ul className="grid gap-1.5">
                {f.items.map((i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------- pipeline --- */}
      <section className="border-y border-border bg-secondary/30 py-20">
        <div className="container">
          <div className="mb-12 text-center">
            <div className="mono-label mb-2">event pipeline</div>
            <h2 className="text-3xl font-bold tracking-tight">From registration to signed certificates</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            {PIPELINE.map((p) => (
              <div key={p.step} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-2 font-mono text-2xl font-bold text-primary/40">{p.step}</div>
                <div className="mb-1 font-semibold">{p.name}</div>
                <p className="text-xs leading-relaxed text-muted-foreground">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ math --- */}
      <section className="container grid items-center gap-10 py-20 lg:grid-cols-2">
        <div>
          <div className="mono-label mb-2">bonus · +16 pts</div>
          <h2 className="mb-4 text-3xl font-bold tracking-tight">The math is the product</h2>
          <p className="mb-6 text-muted-foreground">
            One harsh judge shouldn't sink a great project. RaptorJudge ships three normalization
            models with a machine-checkable proof (max |mean(z)| ≈ 0, max |σ(z) − 1| ≈ 0), plus a
            Bradley-Terry MM estimator with log-likelihood convergence reporting.
          </p>
          <div className="grid gap-3">
            {[
              [Gauge, "Normalization proof", "Spearman rho + calibration metrics computed live"],
              [GitBranch, "Bradley-Terry pairwise", "MM algorithm, provably increasing log-likelihood"],
              [ShieldCheck, "STRIDE threat model", "Sybil defense, ballot-stuffing limits, hash-chained audit"],
              [Award, "Verifiable certificates", "HMAC-SHA256 signatures, public /verify page"],
              [Lock, "Offline by design", "No external APIs, no cloud accounts, no third-party auth"],
            ].map(([Icon, title, desc]: any) => (
              <div key={title} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3.5">
                <Icon size={18} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <div className="font-medium">{title}</div>
                  <div className="text-sm text-muted-foreground">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 font-mono text-sm">
          <div className="mono-label mb-3">normalization · z-score</div>
          <pre className="overflow-x-auto rounded-lg bg-secondary/50 p-4 text-xs leading-relaxed">
{`z_ij = (s_ij − μ_j) / σ_j
scaled → N(75, 12²)

proof: max|mean_j(z)| = 0.000 ✓
       max|σ_j(z) − 1| = 0.001 ✓`}
          </pre>
          <div className="mono-label mb-3 mt-5">bradley-terry · MM update</div>
          <pre className="overflow-x-auto rounded-lg bg-secondary/50 p-4 text-xs leading-relaxed">
{`π_i ← W_i / Σ_j≠i n_ij/(π_i + π_j)

converged: true (231 iters)
log-lik:  −38.42`}
          </pre>
        </div>
      </section>

      {/* -------------------------------------------------------------- cta --- */}
      <section className="border-t border-border bg-primary/5 py-20 text-center">
        <div className="container">
          <h2 className="mb-3 text-3xl font-bold">Judge the demo yourself</h2>
          <p className="mx-auto mb-8 max-w-xl text-muted-foreground">
            Sign in as any seeded role — every account uses the password{" "}
            <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-sm">dogfood2026</code>.
            The admin can even switch roles in one click.
          </p>
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3.5 font-mono text-sm font-semibold uppercase tracking-wider text-primary-foreground transition hover:opacity-90"
          >
            open the demo <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}
