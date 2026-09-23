import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ReferenceLine, ScatterChart, Scatter, ZAxis,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";

/**
 * Cross-judge normalization playground (T2 + Bonus: Normalization Proof).
 * Visualizes raw vs normalized scores, judge calibration, rank shifts and the
 * mathematical proof metrics from the normalization engine.
 */

interface NormResult {
  submissions: {
    submissionId: string;
    title?: string;
    rawMean: number;
    zNormalized: number;
    minMaxNormalized: number;
    bayesianAdjusted: number;
  }[];
  rankDeltas: { submissionId: string; rawRank: number; normalizedRank: number; delta: number; title?: string }[];
  judgeCalibrations: { judgeId: string; judgeName?: string; mean: number; sigma: number; n: number }[];
  proof: {
    maxJudgeMeanZ: number;
    maxJudgeSigmaZ: number;
    rawVsNormalizedRho: number;
    methodAgreementRho: number;
  };
}

const TOOLTIP_STYLE = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "JetBrains Mono, monospace",
};

export default function NormalizationPlayground({ eventId }: { eventId: any }) {
  const data = useQuery(api.normalization.analyze, { eventId });

  if (data === undefined) {
    return <div className="rounded-xl border border-border bg-card p-10 text-center font-mono text-sm text-muted-foreground">computing normalization…</div>;
  }
  if (!data.ok || !data.result) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 py-16 text-center font-mono text-sm text-muted-foreground">
        {data.reason ?? "no scores recorded yet"}
      </div>
    );
  }

  const result = data.result as NormResult;
  const proof = result.proof;

  const proofCards: { label: string; value: string; desc: string }[] = [
    {
      label: "max |mean(z)| across judges",
      value: proof.maxJudgeMeanZ.toFixed(6),
      desc: "z-scores are standardized per judge, so every judge's mean maps to 0",
    },
    {
      label: "max |σ(z) − 1| across judges",
      value: proof.maxJudgeSigmaZ.toFixed(6),
      desc: "every judge's spread maps to 1 — scale differences removed",
    },
    {
      label: "ρ (raw vs normalized ranks)",
      value: proof.rawVsNormalizedRho.toFixed(4),
      desc: "Spearman correlation; low ρ means normalization changed the outcome",
    },
    {
      label: "ρ (z-score vs min-max)",
      value: proof.methodAgreementRho.toFixed(4),
      desc: "agreement between independent normalization methods",
    },
  ];

  const calibPoints = result.judgeCalibrations.map((j) => ({
    name: j.judgeName ?? j.judgeId,
    mean: j.mean,
    sigma: j.sigma,
    n: j.n,
  }));

  const zChart = result.submissions.slice(0, 12).map((s) => ({
    title: (s.title ?? s.submissionId).slice(0, 14),
    z: Number(s.zNormalized.toFixed(2)),
    raw: Number(s.rawMean.toFixed(2)),
  }));

  return (
    <div className="grid gap-6">
      {/* proof metrics */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
          <Sparkles size={17} className="text-primary" /> Normalization proof
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Standardizing each judge's scores to N(75, 12²) provably removes calibration bias:
          after z-scoring, every judge's mean is 0 and standard deviation is 1 (within float error).
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {proofCards.map((p) => (
            <div key={p.label} className="rounded-lg border border-border p-4">
              <div className="font-mono text-xl font-bold text-primary">{p.value}</div>
              <div className="mono-label mt-1">{p.label}</div>
              <div className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{p.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* calibration space */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-1 text-lg font-semibold">Judge calibration space</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Each judge by (mean, σ). Bottom-left = harsh &amp; tight, top-right = lenient &amp; loose.
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" dataKey="mean" name="mean" domain={[0, 10]} stroke="hsl(var(--muted-foreground))" fontSize={11} fontFamily="JetBrains Mono" />
              <YAxis type="number" dataKey="sigma" name="σ" stroke="hsl(var(--muted-foreground))" fontSize={11} fontFamily="JetBrains Mono" />
              <ZAxis range={[120, 240]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ strokeDasharray: "3 3" }} />
              <Scatter data={calibPoints} fill="hsl(var(--primary))" />
            </ScatterChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap gap-2">
            {calibPoints.map((p) => (
              <span key={p.name} className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-mono text-[11px]">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                {p.name} <span className="text-muted-foreground">μ{p.mean.toFixed(1)} σ{p.sigma.toFixed(1)}</span>
              </span>
            ))}
          </div>
        </div>

        {/* z-scores with target mean line */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-1 text-lg font-semibold">Normalized scores (z → N(75, 12²))</h2>
          <p className="mb-4 text-sm text-muted-foreground">All submissions on the common scale; dashed line = target mean 75.</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={zChart} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="title" stroke="hsl(var(--muted-foreground))" fontSize={9} fontFamily="JetBrains Mono" interval={0} angle={-32} textAnchor="end" height={54} />
              <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={11} fontFamily="JetBrains Mono" />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "hsl(var(--primary) / 0.08)" }} />
              <ReferenceLine y={75} stroke="hsl(var(--accent))" strokeDasharray="6 4" />
              <Bar dataKey="z" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* rank deltas */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold">Who moved? Raw rank → normalized rank</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Positive delta = helped by normalization (harsh judges scored them), negative = hurt.
        </p>
        <div className="grid gap-1.5">
          {[...result.rankDeltas]
            .sort((a, b) => b.delta - a.delta)
            .map((d) => {
              const title = d.title ?? d.submissionId;
              if (d.delta > 0) {
                return (
                  <div key={d.submissionId} className="flex items-center justify-between rounded-lg border border-success/30 bg-success/5 px-4 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <TrendingUp size={14} className="text-success" /> {title}
                    </span>
                    <span className="font-mono text-xs text-success">
                      #{d.rawRank} → #{d.normalizedRank} (+{d.delta})
                    </span>
                  </div>
                );
              }
              if (d.delta < 0) {
                return (
                  <div key={d.submissionId} className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <TrendingDown size={14} className="text-destructive" /> {title}
                    </span>
                    <span className="font-mono text-xs text-destructive">
                      #{d.rawRank} → #{d.normalizedRank} ({d.delta})
                    </span>
                  </div>
                );
              }
              return (
                <div key={d.submissionId} className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Minus size={14} /> {title}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">#{d.rawRank} — unchanged</span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}