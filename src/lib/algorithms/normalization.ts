/**
 * Cross-judge score normalization (Bonus: Normalization Proof, +5).
 *
 * Judges score on the same rubric scale but with very different personal
 * calibration (one judge's 6 is another judge's 9). These algorithms map
 * every judge's scores onto a common scale so rankings are fair.
 */

export interface JudgeScoreSet {
  /** Judge id (any string). */
  judgeId: string;
  /** score per submission id. */
  scores: Record<string, number>;
}

export interface NormalizedSubmission {
  submissionId: string;
  rawMean: number;
  /** z-score normalized (target N(75, 12^2) by default). */
  zNormalized: number;
  /**
   * Ten-point z-score: `clamp(5 + 2z, 0, 10)`. A judge with zero variance
   * (stddev === 0) contributes its own min-max value instead, so a flat grader
   * never collapses the field. This is the scale the judge queue and the
   * normalization proof use.
   */
  tenPointNormalized: number;
  /** per-judge min-max scaled to [0, 100], averaged. */
  minMaxNormalized: number;
  /** Bayesian shrinkage toward the global mean. */
  bayesianAdjusted: number;
}

export interface NormalizationResult {
  submissions: NormalizedSubmission[];
  /** rank by raw mean vs rank by z-score, with delta. */
  rankDeltas: { submissionId: string; rawRank: number; normalizedRank: number; delta: number }[];
  judgeCalibrations: { judgeId: string; mean: number; sigma: number; n: number }[];
  proof: {
    /** max |mean_j z_j - 0| across judges (should be ~0). */
    maxJudgeMeanZ: number;
    /** max |sigma_j z_j - 1| across judges (should be ~0). */
    maxJudgeSigmaZ: number;
    /** Spearman rho between raw and normalized rankings. */
    rawVsNormalizedRho: number;
    /** Spearman rho between any two normalized methods. */
    methodAgreementRho: number;
    /**
     * How much of the harsh/lenient spread survives normalization:
     * the standard deviation *between judge means* before and after. A generous
     * judge and a harsh judge sit far apart on the raw scale and on top of each
     * other after normalization.
     */
    judgeMeanSpreadRaw: number;
    judgeMeanSpreadNormalized: number;
    /** Spread between submissions before vs after normalization. */
    submissionSpreadRaw: number;
    submissionSpreadNormalized: number;
  };
}

/** Map a z-score onto the ten-point judging scale: `clamp(5 + 2z, 0, 10)`. */
export function zToTenPoint(z: number): number {
  return Math.min(10, Math.max(0, 5 + z * 2));
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdev(xs: number[], mu?: number): number {
  if (xs.length < 2) return 0;
  const m = mu ?? mean(xs);
  return Math.sqrt(xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Spearman rank correlation (handles ties via average ranks). */
export function spearmanRho(a: Map<string, number>, b: Map<string, number>): number {
  const ids = [...a.keys()].filter((id) => b.has(id));
  if (ids.length < 2) return 0;

  function ranks(values: Map<string, number>): Map<string, number> {
    const sorted = ids
      .map((id) => ({ id, v: values.get(id)! }))
      .sort((x, y) => y.v - x.v);
    const out = new Map<string, number>();
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1].v === sorted[i].v) j++;
      const avgRank = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) out.set(sorted[k].id, avgRank);
      i = j + 1;
    }
    return out;
  }

  const ra = ranks(a);
  const rb = ranks(b);
  const d2sum = ids.reduce((acc, id) => acc + (ra.get(id)! - rb.get(id)!) ** 2, 0);
  const n = ids.length;
  return 1 - (6 * d2sum) / (n * (n * n - 1));
}

function ranksFromScores(scores: Map<string, number>): Map<string, number> {
  const sorted = [...scores.entries()].sort((x, y) => y[1] - x[1]);
  const out = new Map<string, number>();
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1][1] === sorted[i][1]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out.set(sorted[k][0], avgRank);
    i = j + 1;
  }
  return out;
}

export interface NormalizeOptions {
  /** Target mean for z-score rescaling (default 75). */
  targetMean?: number;
  /** Target sigma for z-score rescaling (default 12). */
  targetSigma?: number;
  /** Bayesian prior weight k (default 10 pseudo-observations). */
  priorWeight?: number;
  /** Prior mean for Bayesian shrinkage (defaults to global mean). */
  priorMean?: number;
}

/**
 * Core normalization. Every judge's set of scores is standardized
 * (z-score), rescaled to the target distribution, then averaged per
 * submission across judges. Min-max and Bayesian variants run alongside.
 */
export function normalizeScores(
  judgeSets: JudgeScoreSet[],
  opts: NormalizeOptions = {},
): NormalizationResult {
  const targetMean = opts.targetMean ?? 75;
  const targetSigma = opts.targetSigma ?? 12;
  const priorWeight = opts.priorWeight ?? 10;

  // --- gather per-judge stats -------------------------------------------
  const judgeStats = judgeSets.map((set) => {
    const vals = Object.values(set.scores);
    const mu = mean(vals);
    const sigma = stdev(vals, mu);
    return { judgeId: set.judgeId, mu, sigma, n: vals.length, set };
  });

  const allScores: number[] = judgeSets.flatMap((s) => Object.values(s.scores));
  const globalMean = mean(allScores);
  const priorMean = opts.priorMean ?? globalMean;

  /**
   * Per-judge ten-point mapping with the documented degenerate-case fallback.
   *   sigma > 0            → 5 + 2z                       (z-score)
   *   sigma === 0, range>0 → (raw - lo) / (hi - lo) * 10 (min-max)
   *   fully flat judge     → 5                            (no signal)
   */
  const tenPoint = (judgeId: string, raw: number): number => {
    const st = judgeStats.find((js) => js.judgeId === judgeId)!;
    if (st.sigma > 0) return zToTenPoint((raw - st.mu) / st.sigma);
    const vals = Object.values(st.set.scores);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    if (hi > lo) return ((raw - lo) / (hi - lo)) * 10;
    return 5;
  };

  // submission ids seen by any judge
  const submissionIds = [...new Set(judgeSets.flatMap((s) => Object.keys(s.scores)))];

  const submissions: NormalizedSubmission[] = submissionIds.map((sid) => {
    const parts = judgeSets
      .filter((s) => sid in s.scores)
      .map((s) => ({ judge: s, raw: s.scores[sid] }));

    // Z-score: z = (raw - mu_j) / sigma_j, rescaled to target distribution
    const zVals = parts.map(({ judge, raw }) => {
      const st = judgeStats.find((js) => js.judgeId === judge.judgeId)!;
      return st.sigma > 0 ? (raw - st.mu) / st.sigma : 0;
    });
    const zNormalized = mean(zVals) * targetSigma + targetMean;

    // Min-max: scale each judge's own observed range to [0, 100]
    const mmVals = parts.map(({ judge, raw }) => {
      const vals = Object.values(judge.scores);
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      return hi > lo ? ((raw - lo) / (hi - lo)) * 100 : 50;
    });
    const minMaxNormalized = mean(mmVals);

    // Bayesian adjusted: pull each judge's score toward the global prior mean,
    // weighted by how much evidence that judge has provided (n vs k pseudo-obs).
    const bayesianAdjusted =
      parts.reduce((acc, { judge, raw }) => {
        const st = judgeStats.find((js) => js.judgeId === judge.judgeId)!;
        const adjusted = (st.n * raw + priorWeight * priorMean) / (st.n + priorWeight);
        return acc + adjusted;
      }, 0) / parts.length;

    const rawMean = mean(parts.map((p) => p.raw));
    // Ten-point view: average the per-judge mapping (z-score or min-max
    // fallback), so no single judge's calibration can move a submission.
    const tenPointNormalized = mean(parts.map(({ judge, raw }) => tenPoint(judge.judgeId, raw)));

    return {
      submissionId: sid,
      rawMean,
      zNormalized,
      tenPointNormalized,
      minMaxNormalized,
      bayesianAdjusted,
    };
  });

  // --- rank deltas (raw vs z-normalized) --------------------------------
  const rawScores = new Map(submissions.map((s) => [s.submissionId, s.rawMean]));
  const zScores = new Map(submissions.map((s) => [s.submissionId, s.zNormalized]));
  const rawRanks = ranksFromScores(rawScores);
  const zRanks = ranksFromScores(zScores);
  const rankDeltas = submissions.map((s) => ({
    submissionId: s.submissionId,
    rawRank: rawRanks.get(s.submissionId)!,
    normalizedRank: zRanks.get(s.submissionId)!,
    delta: rawRanks.get(s.submissionId)! - zRanks.get(s.submissionId)!,
  }));

  // --- proof metrics -----------------------------------------------------
  const maxJudgeMeanZ = Math.max(
    ...judgeStats.map((js) => {
      if (js.n === 0 || js.sigma === 0) return 0;
      const zs = Object.values(js.set.scores).map((v) => (v - js.mu) / js.sigma);
      return Math.abs(mean(zs));
    }),
  );
  const maxJudgeSigmaZ = Math.max(
    ...judgeStats.map((js) => {
      if (js.n < 2 || js.sigma === 0) return 0;
      const zs = Object.values(js.set.scores).map((v) => (v - js.mu) / js.sigma);
      return Math.abs(stdev(zs) - 1);
    }),
  );
  const mmScores = new Map(submissions.map((s) => [s.submissionId, s.minMaxNormalized]));

  // --- calibration compression -------------------------------------------
  // Spread between judge means (harsh vs generous) and between submission
  // scores, before and after standardization. Both should shrink sharply.
  const judgeMeanRaw = judgeStats.map((js) => js.mu);
  const judgeMeanNormalized = judgeStats.map((js) => {
    if (js.sigma === 0) return 0;
    return mean(Object.values(js.set.scores).map((v) => (v - js.mu) / js.sigma));
  });
  const submissionRaw = submissions.map((s) => s.rawMean);
  const submissionNormalized = submissions.map((s) => s.zNormalized);

  return {
    submissions: submissions.sort((a, b) => b.zNormalized - a.zNormalized),
    rankDeltas,
    judgeCalibrations: judgeStats.map((js) => ({
      judgeId: js.judgeId,
      mean: js.mu,
      sigma: js.sigma,
      n: js.n,
    })),
    proof: {
      maxJudgeMeanZ,
      maxJudgeSigmaZ,
      rawVsNormalizedRho: spearmanRho(rawScores, zScores),
      methodAgreementRho: spearmanRho(zScores, mmScores),
      judgeMeanSpreadRaw: stdev(judgeMeanRaw),
      judgeMeanSpreadNormalized: stdev(judgeMeanNormalized),
      submissionSpreadRaw: stdev(submissionRaw),
      submissionSpreadNormalized: stdev(submissionNormalized),
    },
  };
}
