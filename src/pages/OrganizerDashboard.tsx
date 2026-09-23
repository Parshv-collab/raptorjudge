import { useQuery, useMutation, useConvex } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Users2,
  BarChart3,
  GitBranch,
  Vote,
  FileDown,
  Award,
  Webhook,
  ScrollText,
  ShieldCheck,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ScatterChart, Scatter,
  CartesianGrid, ReferenceLine,
} from "recharts";
import { api } from "@/convex/_generated/api";
import NormalizationPlayground from "@/components/organizer/NormalizationPlayground";
import { Link } from "react-router-dom";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "judging", label: "Judging", icon: Users2 },
  { id: "normalization", label: "Normalization", icon: BarChart3 },
  { id: "pairwise", label: "Pairwise", icon: GitBranch },
  { id: "voting", label: "Voting", icon: Vote },
  { id: "exports", label: "Exports", icon: FileDown },
  { id: "certificates", label: "Certificates", icon: Award },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "audit", label: "Audit", icon: ScrollText },
  { id: "acceptance", label: "Acceptance", icon: ShieldCheck },
] as const;

type TabId = (typeof TABS)[number]["id"];

const STAGES = ["draft", "registration", "hacking", "judging", "voting", "published", "archived"];

export default function OrganizerDashboard() {
  const events = useQuery(api.events.listAll, {});
  const event = useQuery(api.events.getBySlug, { slug: "dogfood-2026" });
  const submissions = useQuery(api.submissions.byEvent, event ? { eventId: event._id } : "skip");
  const teams = useQuery(api.teams.listByEvent, event ? { eventId: event._id } : "skip");
  const progress = useQuery(api.judging.progress, event ? { eventId: event._id } : "skip");
  const audit = useQuery(api.audit.list, { limit: 5 });
  if (!events || !event) return <div className="container py-24 text-center font-mono text-muted-foreground">loading…</div>;
  const liveEvents = events.filter((e: any) => !["draft", "archived"].includes(e.status)).length;
  const pendingJudging = Math.max(0, (progress?.totalAssignments ?? 0) - (progress?.completedAssignments ?? 0));
  return <div className="container max-w-7xl py-8"><header className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><div className="mono-label mb-1">organizer dashboard</div><h1 className="text-3xl font-bold tracking-tight">Organizer Dashboard</h1></div><Link to="/organizer/events/new" className="min-h-11 inline-flex items-center rounded-lg bg-primary px-4 font-mono text-xs font-semibold uppercase text-primary-foreground">Create Event</Link></header><section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Live events", liveEvents], ["Total participants", teams?.length ?? 0], ["Total submissions", submissions?.length ?? 0], ["Pending judging", pendingJudging]].map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-card p-4 sm:p-5"><div className="font-mono text-2xl font-bold text-primary">{value}</div><div className="mono-label mt-1">{label}</div></div>)}</section><section className="mb-8"><div className="mb-3 flex items-baseline justify-between"><div><h2 className="text-lg font-semibold">Your Events</h2><p className="mt-1 text-sm text-muted-foreground">Manage event details, tracks, rubrics, and judging from the event page.</p></div><Link to="/organizer/events" className="font-mono text-xs uppercase text-primary">View all</Link></div><div className="overflow-x-auto rounded-xl border border-border bg-card"><table className="w-full min-w-[600px] text-left text-sm"><thead className="border-b border-border font-mono text-[11px] uppercase text-muted-foreground"><tr><th className="p-4">Title</th><th className="p-4">Status</th><th className="p-4">Participants</th><th className="p-4">Submissions</th><th className="p-4">Action</th></tr></thead><tbody>{events.map((e: any) => <tr key={e._id} className="border-b border-border/50 last:border-0"><td className="p-4 font-semibold">{e.title}</td><td className="p-4"><span className="rounded-full bg-muted px-2 py-1 font-mono text-[10px] uppercase">{e.status}</span></td><td className="p-4 text-muted-foreground">{e._id === event._id ? teams?.length ?? 0 : "—"}</td><td className="p-4 text-muted-foreground">{e._id === event._id ? submissions?.length ?? 0 : "—"}</td><td className="p-4"><Link className="font-mono text-xs uppercase text-primary" to={`/organizer/events/${e.slug}`}>Manage</Link></td></tr>)}</tbody></table></div></section><details className="rounded-xl border border-border bg-card p-5"><summary className="cursor-pointer font-semibold">Recent activity</summary><div className="mt-4 grid gap-2">{(audit ?? []).map((item: any) => <div key={item.id} className="flex flex-wrap justify-between gap-2 border-t border-border pt-2 text-sm"><span>{item.action}</span><span className="font-mono text-xs text-muted-foreground">{new Date(item.timestamp).toLocaleString()}</span></div>)}{audit?.length === 0 && <p className="text-sm text-muted-foreground">No recent activity.</p>}</div></details></div>;
}

/* ---------------------------------------------------------------- overview --- */

function OverviewTab({ eventId }: { eventId: any }) {
  const event = useQuery(api.events.get, { eventId });
  const setStage = useMutation(api.events.setStage);
  const submissions = useQuery(api.submissions.byEvent, { eventId });

  return (
    <div className="grid gap-6">
      {/* lifecycle controller */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold">Event lifecycle</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Linear state machine — every transition is recorded in the tamper-evident audit log.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {STAGES.map((s, i) => {
            const current = event?.status;
            const idx = STAGES.indexOf(current ?? "draft");
            return (
              <button
                key={s}
                disabled={s === current}
                onClick={async () => {
                  try { await setStage({ eventId, stage: s }); toast.success(`Stage → ${s}`); }
                  catch (e: any) { toast.error(e.message); }
                }}
                className={`rounded-lg px-3.5 py-2 font-mono text-xs uppercase tracking-wider transition ${
                  s === current
                    ? "bg-primary text-primary-foreground"
                    : i < idx
                      ? "border border-primary/40 text-primary hover:bg-primary/10"
                      : "border border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
        <div className="mt-3 font-mono text-xs text-muted-foreground">
          submission deadline: {event ? new Date(event.submissionDeadline).toLocaleString() : "—"}
        </div>
      </div>

      {/* quick stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["submissions", submissions?.length ?? 0],
          ["submitted", submissions?.filter((s: any) => s.status === "submitted").length ?? 0],
          ["drafts", submissions?.filter((s: any) => s.status === "draft").length ?? 0],
        ].map(([label, value]: any) => (
          <div key={label} className="rounded-xl border border-border bg-card p-5">
            <div className="font-mono text-2xl font-bold text-primary">{value}</div>
            <div className="mono-label">{label}</div>
          </div>
        ))}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="font-mono text-2xl font-bold text-primary">{event?.status ?? "—"}</div>
          <div className="mono-label">current stage</div>
        </div>
      </div>

      {/* submissions table */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Submissions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 pr-4">title</th>
                <th className="pb-2 pr-4">team</th>
                <th className="pb-2 pr-4">track</th>
                <th className="pb-2">status</th>
              </tr>
            </thead>
            <tbody>
              {(submissions ?? []).map((s: any) => (
                <tr key={s._id} className="border-b border-border/50 last:border-0">
                  <td className="py-2.5 pr-4 font-medium">
                    <a href={`/project/${s._id}`} className="hover:text-primary">{s.title || <em className="text-muted-foreground">untitled draft</em>}</a>
                  </td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{s.teamName}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{s.trackName}</td>
                  <td className="py-2.5">
                    <span className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase ${
                      s.status === "submitted" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                    }`}>{s.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- judging --- */

function JudgingTab({ eventId }: { eventId: any }) {
  const runAssignment = useMutation(api.judging.runAssignment);
  const progress = useQuery(api.judging.progress, { eventId });
  const [k, setK] = useState(3);
  const [busy, setBusy] = useState(false);

  const maxAvg = Math.max(1, ...(progress?.heatmap ?? []).map((h: any) => h.avg));

  return (
    <div className="grid gap-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold">Algorithmic assignment</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Balanced workloads, track affinity, and conflict-of-interest prevention. k judges per submission.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 font-mono text-sm">
            k =
            <input
              type="number" min={1} max={6} value={k}
              onChange={(e) => setK(Number(e.target.value))}
              className="w-16 rounded-md border border-input bg-background px-2 py-1.5 text-center"
            />
          </label>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await runAssignment({ eventId, minJudgesPerSubmission: k });
                toast.success(`${res.totalAssignments} assignments created (k=${k} met: ${res.minJudgesMet ? "yes" : "no"})`);
              } catch (e: any) { toast.error(e.message); }
              finally { setBusy(false); }
            }}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            run assignment engine
          </button>
        </div>
      </div>

      {/* per-judge progress */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Judge progress</h2>
        <div className="grid gap-3">
          {(progress?.perJudge ?? []).map((j: any) => (
            <div key={j.judgeId} className="flex items-center gap-4">
              <div className="w-40 truncate font-medium">{j.name}</div>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${j.percent}%` }} />
              </div>
              <div className="w-24 text-right font-mono text-xs text-muted-foreground">
                {j.completed}/{j.total} ({j.percent}%)
              </div>
            </div>
          ))}
          {progress?.perJudge.length === 0 && (
            <p className="font-mono text-sm text-muted-foreground">no assignments yet</p>
          )}
        </div>
      </div>

      {/* reviewer heatmap */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold">Reviewer heatmap (bias detection)</h2>
        <p className="mb-4 text-sm text-muted-foreground">Average score per judge × criterion — spot harsh/lenient calibration at a glance.</p>
        <div className="grid gap-1.5">
          {(progress?.heatmap ?? []).map((h: any) => (
            <div key={`${h.judgeId}-${h.criterionId}`} className="flex items-center gap-3">
              <div className="w-36 truncate font-mono text-xs">{h.judgeName}</div>
              <div className="w-32 truncate font-mono text-xs text-muted-foreground">{h.criterionName}</div>
              <div className="h-5 flex-1 overflow-hidden rounded">
                <div
                  className="flex h-full items-center justify-end rounded pr-1.5 font-mono text-[10px] font-bold text-primary-foreground"
                  style={{ width: `${(h.avg / maxAvg) * 100}%`, background: `hsl(var(--primary) / ${0.35 + 0.5 * (h.avg / 10)})` }}
                >
                  {h.avg.toFixed(1)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- pairwise --- */

function PairwiseTab({ eventId }: { eventId: any }) {
  const leaderboard = useQuery(api.pairwise.leaderboard, { eventId });
  const data = (leaderboard?.ranking ?? []).map((r: any, i: number) => ({ ...r, rank: i + 1 }));

  return (
    <div className="grid gap-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Bradley-Terry leaderboard</h2>
          <div className="font-mono text-xs text-muted-foreground">
            {leaderboard?.totalMatches ?? 0} matches · converged: {leaderboard?.converged ? "✓" : "…"} ·
            iterations: {leaderboard?.iterations ?? "—"} · log-lik: {leaderboard?.logLikelihood?.toFixed(2) ?? "—"}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} fontFamily="JetBrains Mono" />
            <YAxis type="category" dataKey="title" width={140} stroke="hsl(var(--muted-foreground))" fontSize={11} fontFamily="JetBrains Mono" />
            <Tooltip
              contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
            />
            <Bar dataKey="rating" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-3 font-mono text-[11px] text-muted-foreground">
          π ratings scaled so the weakest project = 100. Estimated via MM: π_i ← W_i / Σ_j≠i n_ij/(π_i+π_j).
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- voting ---- */

function VotingTab({ eventId }: { eventId: any }) {
  const status = useQuery(api.voting.voteStatus, { eventId });

  return (
    <div className="grid gap-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Community voting monitor</h2>
          <div className="flex gap-2">
            <span className="rounded-full border border-border px-3 py-1 font-mono text-[11px] uppercase">
              {status?.votingType ?? "—"}
            </span>
            <span className={`rounded-full px-3 py-1 font-mono text-[11px] uppercase ${
              status?.votingOpen ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
            }`}>
              {status?.votingOpen ? "open" : "closed"}
            </span>
            <span className={`rounded-full px-3 py-1 font-mono text-[11px] uppercase ${
              status?.resultsVisible ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              results {status?.resultsVisible ? "public" : "hidden"}
            </span>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-4">
            <div className="font-mono text-2xl font-bold text-primary">{status?.totalVotes ?? 0}</div>
            <div className="mono-label">total votes cast</div>
          </div>
          <div className="rounded-lg border border-border p-4">
            <div className="font-mono text-2xl font-bold text-primary">{status?.budget ?? 25}</div>
            <div className="mono-label">quadratic credits / voter</div>
          </div>
          <div className="rounded-lg border border-border p-4">
            <div className="font-mono text-2xl font-bold text-primary">{status?.resultsVisible ? "live" : "gated"}</div>
            <div className="mono-label">tally visibility</div>
          </div>
        </div>
        <p className="mt-4 font-mono text-[11px] text-muted-foreground">
          anti-abuse: per-user rate limits, quadratic cost curve, fingerprint hashing, Sybil burst
          detection (≥8 votes / 5 min / fingerprint → audit alert). Results stay hidden until publish.
        </p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- exports ---- */

function ExportsTab({ eventId, slug }: { eventId: any; slug: string }) {
  const client = useConvex();
  const [busy, setBusy] = useState<string | null>(null);

  async function download(kind: string, loader: () => Promise<string>, mime: string, ext: string) {
    setBusy(kind);
    try {
      const content = await loader();
      const blob = new Blob([content], { type: mime });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${slug}-${kind}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`${kind} exported`);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="mb-1 text-lg font-semibold">Bulk export / import</h2>
      <p className="mb-5 text-sm text-muted-foreground">
        CSVs match the REST API byte-for-byte. The JSON bundle is a complete, re-importable snapshot.
      </p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {[
          { kind: "submissions", desc: "All projects with team + track + URLs" },
          { kind: "scores", desc: "Raw judge × criterion score matrix" },
          { kind: "rankings", desc: "Normalized rankings (z-score, min-max, Bayesian)" },
          { kind: "assignments", desc: "Judge ↔ submission assignments with status" },
          { kind: "json", desc: "Full event snapshot (bulk JSON export)" },
        ].map((x) => (
          <button
            key={x.kind}
            disabled={busy !== null}
            onClick={() =>
              download(
                x.kind,
                () =>
                  client.query(
                    x.kind === "submissions" ? api.exports.submissionsCsv :
                    x.kind === "scores" ? api.exports.scoresCsv :
                    x.kind === "rankings" ? api.exports.rankingsCsv :
                    x.kind === "assignments" ? api.exports.assignmentsCsv :
                    api.exports.eventJson,
                    { eventId },
                  ) as Promise<string>,
                x.kind === "json" ? "application/json" : "text/csv",
                x.kind === "json" ? "json" : "csv",
              )
            }
            className="flex items-center justify-between rounded-lg border border-border p-4 text-left transition hover:border-primary/50 disabled:opacity-40"
          >
            <div>
              <div className="font-mono text-sm font-semibold uppercase tracking-wider">{x.kind}</div>
              <div className="text-xs text-muted-foreground">{x.desc}</div>
            </div>
            {busy === x.kind ? <Loader2 size={16} className="animate-spin text-primary" /> : <FileDown size={16} className="text-primary" />}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- certificates --- */

function CertificatesTab({ eventId }: { eventId: any }) {
  const issueAll = useMutation(api.certificates.issueAll);
  const certs = useQuery(api.certificates.listByEvent, { eventId });
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid gap-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold">Issue verifiable certificates</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          HMAC-SHA256 signed (payload: uuid|name|type|title|track|rank|issuedAt). Verify publicly at /verify.
        </p>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const res = await issueAll({ eventId });
              // Issuance is idempotent, so a re-run reports how many awards
              // already existed instead of minting duplicates.
              toast.success(
                res.reused
                  ? `${res.issued} certificates (${res.reused} already issued — unchanged)`
                  : `Issued ${res.issued} certificates`,
              );
            } catch (e: any) { toast.error(e.message); }
            finally { setBusy(false); }
          }}
          className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-40"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Award size={14} />}
          issue all (participants + judges)
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Issued certificates ({certs?.length ?? 0})</h2>
        <div className="grid gap-2">
          {(certs ?? []).map((c: any) => (
            <div key={c._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
              <div>
                <div className="text-sm font-medium">{c.recipientName} <span className="mono-label">{c.certType}</span></div>
                <div className="font-mono text-[10px] text-muted-foreground">{c.certUuid}</div>
              </div>
              <a href={`/verify/${c.certUuid}?signature=${c.signatureHash}`} className="font-mono text-[10px] uppercase tracking-wider text-primary hover:underline">
                verify link
              </a>
            </div>
          ))}
          {certs?.length === 0 && <p className="font-mono text-sm text-muted-foreground">none issued yet</p>}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- webhooks ---- */

function WebhooksTab({ eventId }: { eventId: any }) {
  const hooks = useQuery(api.webhooks.list, { eventId });
  const deliveries = useQuery(api.webhooks.deliveries, { eventId });
  const register = useMutation(api.webhooks.register);
  const test = useMutation(api.webhooks.testDelivery);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState("submission.submit,vote.cast");
  const [secret, setSecret] = useState<string | null>(null);

  return (
    <div className="grid gap-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold">Register webhook</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Deliveries are signed with <code className="font-mono">X-RaptorJudge-Signature: sha256=HMAC(secret, body)</code>.
        </p>
        <div className="grid gap-2.5 sm:grid-cols-[1fr_1fr_auto]">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-service/hook"
            className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring" />
          <input value={events} onChange={(e) => setEvents(e.target.value)} placeholder="event types, comma separated"
            className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring" />
          <button
            onClick={async () => {
              try {
                const res = await register({ eventId, targetUrl: url, events });
                setSecret(res.secretKey);
                setUrl("");
                toast.success("Webhook registered — save the secret now");
              } catch (e: any) { toast.error(e.message); }
            }}
            className="rounded-md bg-primary px-4 py-2 font-mono text-xs font-semibold uppercase text-primary-foreground"
          >
            register
          </button>
        </div>
        {secret && (
          <div className="mt-3 rounded-lg border border-accent/40 bg-accent/10 p-3 font-mono text-xs">
            <span className="mono-label block">secret (shown once)</span>
            <code className="break-all">{secret}</code>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Endpoints</h2>
        <div className="grid gap-2">
          {(hooks ?? []).map((h: any) => (
            <div key={h._id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <div className="font-mono text-sm">{h.targetUrl}</div>
                <div className="font-mono text-[10px] text-muted-foreground">events: {h.events} · {h.isActive ? "active" : "paused"}</div>
              </div>
              <button onClick={async () => { await test({ webhookId: h._id }); toast("Test delivery queued"); }}
                className="rounded-md border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider transition hover:border-primary/50 hover:text-primary">
                test
              </button>
            </div>
          ))}
          {hooks?.length === 0 && <p className="font-mono text-sm text-muted-foreground">no webhooks registered</p>}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Delivery log</h2>
        <div className="grid gap-1.5">
          {(deliveries ?? []).slice(0, 15).map((d: any, i: number) => (
            <div key={i} className="flex items-center justify-between rounded border border-border/60 px-3 py-2 font-mono text-xs">
              <span>{d.eventType} → {d.targetUrl}</span>
              <span className={d.success ? "text-success" : "text-destructive"}>
                {d.success ? "✓" : "✗"} {d.statusCode || "no response"}
              </span>
            </div>
          ))}
          {deliveries?.length === 0 && <p className="font-mono text-sm text-muted-foreground">no deliveries yet</p>}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- audit ---- */

function AuditTab() {
  const logs = useQuery(api.audit.list, { limit: 100 });
  const verifyChain = useQuery(api.audit.verifyChain, {});
  const actions = useQuery(api.audit.actions, {});
  const [filter, setFilter] = useState("");

  const filtered = (logs ?? []).filter((l: any) => !filter || l.action === filter);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 font-mono text-sm ${
          verifyChain?.valid ? "border-success/40 bg-success/5 text-success" : "border-destructive/40 bg-destructive/5 text-destructive"
        }`}>
          <ShieldCheck size={16} />
          hash chain: {verifyChain?.valid ? "intact" : "broken"} · {verifyChain?.entries ?? 0} entries
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring">
          <option value="">all actions</option>
          {(actions ?? []).map((a: string) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="grid gap-1.5">
          {filtered.map((l: any) => (
            <div key={l.id} className="rounded-lg border border-border/60 p-3 font-mono text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-primary">{l.action}</span>
                <span className="text-muted-foreground">{new Date(l.timestamp).toLocaleString()}</span>
              </div>
              <div className="mt-1 text-muted-foreground">
                {l.actorEmail} → {l.targetType}:{l.targetId.slice(0, 18)}
                {l.afterState && <span className="ml-2">after: {l.afterState.slice(0, 60)}</span>}
              </div>
              <div className="mt-1 truncate text-[10px] text-muted-foreground/60">hash: {l.entryHash.slice(0, 32)}…</div>
            </div>
          ))}
          {filtered.length === 0 && <p className="font-mono text-sm text-muted-foreground">no entries</p>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ acceptance ---- */

function AcceptanceTab() {
  const runSuite = useMutation(api.acceptance.runSuite);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const tiers = ["T1", "T2", "T3", "T4", "BONUS"];

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="mb-1 text-lg font-semibold">Acceptance suite</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Runs platform self-checks (T1–T4 + bonus) entirely server-side and renders a tier-by-tier report.
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try { setResult(await runSuite({})); }
          catch (e: any) { toast.error(e.message); }
          finally { setBusy(false); }
        }}
        className="mb-5 flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-40"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
        run suite
      </button>

      {result && (
        <>
          <div className="mb-4 font-mono text-sm font-bold text-primary">{result.summary}</div>
          <div className="grid gap-4">
            {tiers.map((tier) => {
              const checks = result.checks.filter((c: any) => c.tier === tier);
              if (checks.length === 0) return null;
              const passed = checks.filter((c: any) => c.pass).length;
              return (
                <div key={tier} className="rounded-lg border border-border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-xs font-bold uppercase tracking-wider">{tier}</span>
                    <span className={`font-mono text-xs ${passed === checks.length ? "text-success" : "text-destructive"}`}>
                      {passed}/{checks.length} passed
                    </span>
                  </div>
                  <div className="grid gap-1">
                    {checks.map((c: any) => (
                      <div key={c.id} className="flex items-center gap-2 font-mono text-xs">
                        {c.pass ? <CheckCircle2 size={13} className="text-success" /> : <XCircle size={13} className="text-destructive" />}
                        <span className={c.pass ? "text-muted-foreground" : "text-destructive"}>{c.id}</span>
                        <span className="text-muted-foreground/70">— {c.description}{c.detail ? ` (${c.detail})` : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
