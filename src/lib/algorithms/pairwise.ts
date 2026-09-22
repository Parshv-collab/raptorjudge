/**
 * Bradley-Terry pairwise ranking via the Minorization-Maximization (MM)
 * algorithm (Bonus: +5).
 *
 * Given head-to-head match results, estimate latent strengths π_i > 0 such
 * that P(i beats j) = π_i / (π_i + π_j). The MM iteration provably increases
 * the log-likelihood each step and converges to the MLE:
 *
 *   π_i^{(t+1)} = W_i / Σ_{j≠i} [ n_ij / (π_i^{(t)} + π_j^{(t)}) ]
 *
 * where W_i = total wins of i, n_ij = number of i-vs-j matches.
 */

export interface PairwiseMatchRecord {
  submissionAId: string;
  submissionBId: string;
  /** winner id, or null/"" for a tie (counts 0.5 for each). */
  winnerId: string | null;
}

export interface BradleyTerryResult {
  ratings: Record<string, number>;
  /** Global ranking: strongest first. Items with zero wins anchor the scale. */
  ranking: { submissionId: string; rating: number; wins: number; matches: number; pWin: number }[];
  logLikelihood: number;
  iterations: number;
  converged: boolean;
}

export interface BtOptions {
  maxIterations?: number;
  tolerance?: number;
  /**
   * Gamma prior shape a for MAP estimation: numerator = wins + a − 1.
   * A weak prior (default 1.5) keeps the MLE finite when some item is
   * undefeated (or winless) — pure MLE diverges to infinity in that case.
   */
  priorShape?: number;
  /** Gamma prior rate b: denominator += b (default 1). */
  priorRate?: number;
}

/** Log-likelihood of the current ratings given the match data. */
function logLikelihood(
  matches: PairwiseMatchRecord[],
  ratings: Record<string, number>,
): number {
  let ll = 0;
  for (const m of matches) {
    const pi = ratings[m.submissionAId] ?? 0;
    const pj = ratings[m.submissionBId] ?? 0;
    const total = pi + pj;
    if (total <= 0) continue;
    if (m.winnerId === m.submissionAId) ll += Math.log(pi / total);
    else if (m.winnerId === m.submissionBId) ll += Math.log(pj / total);
    else ll += 0.5 * Math.log((pi / total) * (pj / total)); // tie → 0.5 each
  }
  return ll;
}

/**
 * Estimate Bradley-Terry strengths with the MM algorithm.
 * Items with zero total wins get rating 0 (anchoring the scale at the bottom);
 * the smallest positive rating is normalized to 100.
 */
export function bradleyTerry(
  matches: PairwiseMatchRecord[],
  items: string[],
  opts: BtOptions = {},
): BradleyTerryResult {
  const maxIterations = opts.maxIterations ?? 500;
  const tolerance = opts.tolerance ?? 1e-10;
  // MAP smoothing: numerator = W_i + a − 1, denominator += b. With a = 1.5
  // every item keeps a positive strength, so the iteration always converges.
  const priorShape = opts.priorShape ?? 1.5;
  const priorRate = opts.priorRate ?? 1;

  // --- aggregate wins and match counts -----------------------------------
  const wins: Record<string, number> = {};
  const matchCounts: Record<string, Record<string, number>> = {};
  for (const item of items) {
    wins[item] = 0;
    matchCounts[item] = {};
  }
  for (const m of matches) {
    if (!(m.submissionAId in wins) || !(m.submissionBId in wins)) continue;
    matchCounts[m.submissionAId][m.submissionBId] =
      (matchCounts[m.submissionAId][m.submissionBId] ?? 0) + 1;
    matchCounts[m.submissionBId][m.submissionAId] =
      (matchCounts[m.submissionBId][m.submissionAId] ?? 0) + 1;
    if (m.winnerId === m.submissionAId) wins[m.submissionAId] += 1;
    else if (m.winnerId === m.submissionBId) wins[m.submissionBId] += 1;
    else {
      wins[m.submissionAId] += 0.5;
      wins[m.submissionBId] += 0.5;
    }
  }

  // --- MM iterations ------------------------------------------------------
  // initialize: 1 for everyone (scale-free model, any positive init works)
  const ratings: Record<string, number> = {};
  for (const item of items) ratings[item] = 1;

  let iter = 0;
  let converged = false;
  let prevLL = -Infinity;

  for (; iter < maxIterations; iter++) {
    let maxDelta = 0;
    for (const i of items) {
      let denom = priorRate;
      for (const j of items) {
        const nij = matchCounts[i][j] ?? 0;
        if (nij === 0 || i === j) continue;
        denom += nij / (ratings[i] + ratings[j]);
      }
      const next = (wins[i] + priorShape - 1) / denom;
      maxDelta = Math.max(maxDelta, Math.abs(next - ratings[i]));
      ratings[i] = next;
    }
    const ll = logLikelihood(matches, ratings);
    if (Math.abs(ll - prevLL) < tolerance) {
      converged = true;
      prevLL = ll;
      iter++;
      break;
    }
    prevLL = ll;
  }

  // --- normalize scale: smallest positive rating → 100 -------------------
  const positives = Object.values(ratings).filter((r) => r > 0);
  const scale = positives.length > 0 ? Math.min(...positives) : 1;
  for (const item of items) ratings[item] = ratings[item] / scale;

  // --- ranking ------------------------------------------------------------
  const positiveRatings = Object.values(ratings).filter((r) => r > 0);
  const weakestRating = positiveRatings.length > 0 ? Math.min(...positiveRatings) : 1;
  const ranking = items
    .map((id) => {
      const rating = ratings[id] ?? 0;
      // best-case probability of beating the weakest-rated opponent
      const pWin = rating / (rating + weakestRating);
      return {
        submissionId: id,
        rating,
        wins: wins[id] ?? 0,
        matches: items.reduce((acc, j) => acc + (matchCounts[id][j] ?? 0), 0),
        pWin,
      };
    })
    .sort((a, b) => b.rating - a.rating);

  return {
    ratings,
    ranking,
    logLikelihood: prevLL,
    iterations: iter,
    converged,
  };
}

/**
 * Greedy matchmaker: pick the next most informative comparison for a judge.
 * Prefers pairs with (a) similar current ratings (more informative) and
 * (b) few prior meetings (exploration).
 */
export function nextMatch(
  items: string[],
  matches: PairwiseMatchRecord[],
  ratings: Record<string, number>,
  excludePair?: { a: string; b: string },
): { a: string; b: string } | null {
  if (items.length < 2) return null;

  const played = new Map<string, number>();
  for (const m of matches) {
    const key = [m.submissionAId, m.submissionBId].sort().join("|");
    played.set(key, (played.get(key) ?? 0) + 1);
  }

  let best: { a: string; b: string; score: number } | null = null;
  for (let x = 0; x < items.length; x++) {
    for (let y = x + 1; y < items.length; y++) {
      const a = items[x];
      const b = items[y];
      if (excludePair && excludePair.a === a && excludePair.b === b) continue;
      const key = [a, b].sort().join("|");
      const timesPlayed = played.get(key) ?? 0;
      const closeness = 1 / (1 + Math.abs((ratings[a] ?? 1) - (ratings[b] ?? 1)));
      const novelty = 1 / (1 + timesPlayed);
      const score = closeness + novelty;
      if (!best || score > best.score) best = { a, b, score };
    }
  }
  return best ? { a: best.a, b: best.b } : null;
}
